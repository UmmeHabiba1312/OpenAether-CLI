import OpenAI from "openai";
import { LLMProvider } from "./interface.js";
import type {
  Message,
  ChatOptions,
  StreamChunk,
  ContentBlock,
  ToolUseContent,
} from "./interface.js";
import type { ToolDefinition } from "../config/types.js";

/**
 * OpenAI provider — supports GPT-4o, GPT-4, GPT-3.5, and compatible APIs.
 */
export class OpenAIProvider extends LLMProvider {
  readonly name = "openai";
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = "gpt-4o", baseURL?: string) {
    super();
    this.model = model;
    this.client = new OpenAI({
      apiKey,
      baseURL: baseURL || undefined,
    });
  }

  getModelName(): string {
    return this.model;
  }

  countTokens(messages: Message[]): number {
    // Rough approximation: ~4 chars per token
    const text = JSON.stringify(messages);
    return Math.ceil(text.length / 4);
  }

  normalizeMessages(messages: Message[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map((msg) => {
      // System messages
      if (msg.role === "system") {
        return { role: "system", content: msg.content as string };
      }

      // Tool result messages
      if (msg.role === "tool") {
        return {
          role: "tool",
          tool_call_id: msg.tool_call_id || "",
          content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
        } satisfies OpenAI.Chat.ChatCompletionMessageParam;
      }

      // Assistant messages — may include tool calls
      if (msg.role === "assistant") {
        const blocks = Array.isArray(msg.content) ? msg.content : [];
        const textBlock = blocks.find((b): b is import("./interface.js").TextContent => b.type === "text");
        const toolBlocks = blocks.filter((b): b is ToolUseContent => b.type === "tool_use");

        const result: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
          role: "assistant",
          content: textBlock?.text || null,
        };

        if (toolBlocks.length > 0) {
          result.tool_calls = toolBlocks.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.input),
            },
          }));
        }

        return result;
      }

      // User messages
      return { role: "user", content: msg.content as string };
    });
  }

  async *chat(messages: Message[], options: ChatOptions): AsyncGenerator<StreamChunk> {
    const openaiMessages = this.normalizeMessages(messages) as OpenAI.Chat.ChatCompletionMessageParam[];

    // Build system message if provided
    const finalMessages = options.system
      ? [{ role: "system" as const, content: options.system }, ...openaiMessages]
      : openaiMessages;

    // Normalize tools
    const tools = options.tools?.length
      ? (this.normalizeTools(options.tools) as OpenAI.Chat.ChatCompletionTool[])
      : undefined;

    try {
      const stream = await this.client.chat.completions.create({
        model: options.model || this.model,
        messages: finalMessages,
        tools,
        stream: true,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
      });

      for await (const chunk of stream) {
        if (options.signal?.aborted) {
          stream.controller.abort();
          return;
        }

        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        // Text content
        if (delta.content) {
          yield { type: "text", delta: delta.content };
        }

        // Tool calls
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.function?.name) {
              // First chunk for this tool call — has name
              yield {
                type: "tool_use",
                id: tc.id || `call_${Date.now()}`,
                name: tc.function.name,
                input: {},
              };
            }
            // Accumulate arguments — for simplicity, yield the full parsed args
            if (tc.function?.arguments) {
              try {
                const parsed = JSON.parse(tc.function.arguments);
                yield {
                  type: "tool_use",
                  id: tc.id || `call_${Date.now()}`,
                  name: "",
                  input: parsed,
                };
              } catch {
                // Partial JSON — skip, final chunk will have complete JSON
              }
            }
          }
        }
      }

      yield { type: "done" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      yield { type: "error", message };

      if (err instanceof OpenAI.APIError) {
        yield {
          type: "error",
          message: `OpenAI API error (${err.status}): ${err.message}`,
        };
      }
    }
  }
}
