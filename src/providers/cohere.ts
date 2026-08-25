import { CohereClientV2 } from "cohere-ai";
import { LLMProvider } from "./interface.js";
import type {
  Message,
  ChatOptions,
  StreamChunk,
  ContentBlock,
  TextContent,
  ToolUseContent,
  ToolResultContent,
  ImageContent,
} from "./interface.js";
import type { ToolDefinition } from "../config/types.js";

/**
 * Cohere provider — Command R / Command A models. Uses Cohere's v2 Chat API
 * via the official `cohere-ai` SDK (handles SSE streaming + tool calls).
 *
 * Not OpenAI-compatible — native message/tool formats.
 */
export class CohereProvider extends LLMProvider {
  readonly name = "cohere";
  private client: CohereClientV2;
  private model: string;

  constructor(apiKey: string, model = "command-r-plus") {
    super();
    this.model = model;
    this.client = new CohereClientV2({ token: apiKey });
  }

  getModelName(): string {
    return this.model;
  }

  countTokens(messages: Message[]): number {
    const text = JSON.stringify(messages);
    return Math.ceil(text.length / 4);
  }

  /**
   * Convert internal messages to Cohere v2 format.
   * - text → { role, content }
   * - assistant tool_use blocks → toolCalls on the assistant message
   * - tool_result blocks → role "tool" messages with toolCallId
   */
  normalizeMessages(messages: Message[]): Array<Record<string, unknown>> {
    const result: Array<Record<string, unknown>> = [];

    for (const msg of messages) {
      if (msg.role === "system") continue; // system → preamble (options.system)

      if (typeof msg.content === "string") {
        result.push({
          role: msg.role === "assistant" ? "assistant" : "user",
          content: msg.content,
        });
        continue;
      }

      if (!Array.isArray(msg.content)) continue;

      const blocks = msg.content as ContentBlock[];

      // Tool results → role "tool" messages (must reference the tool call id)
      const toolResults = blocks.filter((b): b is ToolResultContent => b.type === "tool_result");
      if (toolResults.length > 0) {
        for (const tr of toolResults) {
          result.push({
            role: "tool",
            toolCallId: tr.toolUseId,
            content: tr.content,
          });
        }
        continue;
      }

      // Assistant message with text + tool calls
      const toolUses = blocks.filter((b): b is ToolUseContent => b.type === "tool_use");
      const images = blocks.filter((b): b is ImageContent => b.type === "image");
      const text = blocks
        .filter((b): b is TextContent => b.type === "text")
        .map((b) => b.text)
        .join("");

      const entry: Record<string, unknown> = {
        role: msg.role === "assistant" ? "assistant" : "user",
        content: text,
      };

      // Cohere vision isn't wired up here — degrade images to a text note
      if (images.length > 0) {
        const note = images
          .map((img) => `[Image attached: ${img.mimeType}, ${Math.round(img.data.length / 1024)}KB]`)
          .join(" ");
        entry.content = text ? `${text}\n\n${note}` : note;
      }

      if (toolUses.length > 0) {
        entry.toolCalls = toolUses.map((tu) => ({
          id: tu.id,
          type: "function",
          function: {
            name: tu.name,
            arguments: JSON.stringify(tu.input),
          },
        }));
      }

      if (text || toolUses.length > 0) {
        result.push(entry);
      }
    }

    return result;
  }

  async *chat(messages: Message[], options: ChatOptions): AsyncGenerator<StreamChunk> {
    const cohereMessages = this.normalizeMessages(messages);
    const tools = options.tools?.length
      ? (this.normalizeTools(options.tools) as Record<string, unknown>[])
      : undefined;

    const request: Record<string, unknown> = {
      model: options.model || this.model,
      messages: cohereMessages,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    };
    if (options.system) request.preamble = options.system;
    if (tools) request.tools = tools;

    try {
      const stream = await this.client.chatStream(request as never);

      // Accumulate tool calls across start/delta/end events
      const toolCallsInProgress = new Map<string, { id: string; name: string; args: string }>();
      let currentToolId: string | null = null;

      for await (const event of stream) {
        if (options.signal?.aborted) break;

        const ev = event as {
          type: string;
          delta?: {
            message?: {
              content?: string;
              toolCalls?: {
                id?: string;
                function?: { name?: string; arguments?: string };
              };
            };
          };
        };

        switch (ev.type) {
          case "content-delta": {
            const text = ev.delta?.message?.content;
            if (text) yield { type: "text", delta: text };
            break;
          }
          case "tool-call-start": {
            const tc = ev.delta?.message?.toolCalls;
            if (tc?.id) {
              currentToolId = tc.id;
              toolCallsInProgress.set(tc.id, {
                id: tc.id,
                name: tc.function?.name || "",
                args: tc.function?.arguments || "",
              });
            }
            break;
          }
          case "tool-call-delta": {
            const tc = ev.delta?.message?.toolCalls;
            if (tc?.function?.arguments && currentToolId) {
              const acc = toolCallsInProgress.get(currentToolId);
              if (acc) acc.args += tc.function.arguments;
            }
            break;
          }
          case "tool-call-end": {
            if (currentToolId) {
              const acc = toolCallsInProgress.get(currentToolId);
              if (acc) {
                let input: Record<string, unknown> = {};
                try {
                  input = acc.args ? JSON.parse(acc.args) : {};
                } catch {
                  input = {};
                }
                yield { type: "tool_use", id: acc.id, name: acc.name, input };
                toolCallsInProgress.delete(currentToolId);
              }
              currentToolId = null;
            }
            break;
          }
        }
      }

      // Flush any tool calls that ended without an explicit tool-call-end
      for (const acc of toolCallsInProgress.values()) {
        let input: Record<string, unknown> = {};
        try {
          input = acc.args ? JSON.parse(acc.args) : {};
        } catch {
          input = {};
        }
        yield { type: "tool_use", id: acc.id, name: acc.name, input };
      }

      yield { type: "done" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      yield { type: "error", message };
    }
  }
}
