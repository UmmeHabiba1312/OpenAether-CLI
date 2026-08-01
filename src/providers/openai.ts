import OpenAI from "openai";
import { LLMProvider } from "./interface.js";
import type {
  Message,
  ChatOptions,
  StreamChunk,
  ContentBlock,
  TextContent,
  ToolUseContent,
  ToolResultContent,
} from "./interface.js";
import type { ToolDefinition } from "../config/types.js";

type OpenAIMessage = OpenAI.Chat.ChatCompletionMessageParam;

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
    const text = JSON.stringify(messages);
    return Math.ceil(text.length / 4);
  }

  /**
   * Convert the internal Anthropic-style canonical format to OpenAI's native format.
   * - assistant tool_use blocks → `tool_calls` field
   * - user tool_result blocks → separate role:"tool" messages
   */
  normalizeMessages(messages: Message[]): OpenAIMessage[] {
    const result: OpenAIMessage[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        result.push({ role: "system", content: msg.content as string });
        continue;
      }

      // String content (user text, or plain assistant text)
      if (typeof msg.content === "string") {
        if (msg.role === "assistant") {
          result.push({ role: "assistant", content: msg.content });
        } else {
          result.push({ role: "user", content: msg.content });
        }
        continue;
      }

      // Block content
      const blocks = msg.content as ContentBlock[];
      const textBlocks = blocks.filter((b): b is TextContent => b.type === "text");
      const toolUseBlocks = blocks.filter((b): b is ToolUseContent => b.type === "tool_use");
      const toolResultBlocks = blocks.filter((b): b is ToolResultContent => b.type === "tool_result");

      // Tool results → OpenAI role:"tool" messages (with tool_call_id)
      if (toolResultBlocks.length > 0) {
        for (const tr of toolResultBlocks) {
          result.push({
            role: "tool",
            tool_call_id: tr.toolUseId,
            content: tr.content,
          });
        }
        continue;
      }

      // Assistant message with text + tool_calls
      if (msg.role === "assistant") {
        const assistantMsg: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
          role: "assistant",
          content: textBlocks.map((b) => b.text).join("") || null,
        };

        if (toolUseBlocks.length > 0) {
          assistantMsg.tool_calls = toolUseBlocks.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.input),
            },
          }));
        }

        result.push(assistantMsg);
        continue;
      }

      // User message with mixed content
      result.push({
        role: "user",
        content: textBlocks.map((b) => b.text).join(""),
      });
    }

    return result;
  }

  async *chat(messages: Message[], options: ChatOptions): AsyncGenerator<StreamChunk> {
    const openaiMessages = this.normalizeMessages(messages);

    const finalMessages = options.system
      ? [{ role: "system" as const, content: options.system }, ...openaiMessages]
      : openaiMessages;

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

      // Tool calls stream incrementally (name first, then arguments in pieces).
      // Accumulate by index to assemble the full arguments.
      const toolCallsInProgress = new Map<
        number,
        { id: string; name: string; args: string }
      >();

      for await (const chunk of stream) {
        if (options.signal?.aborted) {
          stream.controller.abort();
          return;
        }

        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          yield { type: "text", delta: delta.content };
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            let acc = toolCallsInProgress.get(idx);
            if (!acc) {
              acc = { id: tc.id || `call_${Date.now()}_${idx}`, name: "", args: "" };
              toolCallsInProgress.set(idx, acc);
            }
            if (tc.id) acc.id = tc.id;
            if (tc.function?.name) acc.name += tc.function.name;
            if (tc.function?.arguments) acc.args += tc.function.arguments;
          }
        }

        // On finish_reason === "tool_calls", emit complete tool calls
        const finish = chunk.choices?.[0]?.finish_reason;
        if (finish === "tool_calls") {
          for (const acc of toolCallsInProgress.values()) {
            let input: Record<string, unknown> = {};
            try {
              input = acc.args ? JSON.parse(acc.args) : {};
            } catch {
              input = {};
            }
            yield { type: "tool_use", id: acc.id, name: acc.name, input };
          }
          toolCallsInProgress.clear();
        }
      }

      yield { type: "done" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof OpenAI.APIError) {
        yield {
          type: "error",
          message: `OpenAI API error (${err.status}): ${err.message}`,
        };
      } else {
        yield { type: "error", message };
      }
    }
  }
}
