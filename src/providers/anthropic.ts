import Anthropic from "@anthropic-ai/sdk";
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

/**
 * Anthropic provider — supports Claude models (Haiku, Sonnet, Opus).
 */
export class AnthropicProvider extends LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model = "claude-sonnet-4-20250514") {
    super();
    this.model = model;
    this.client = new Anthropic({ apiKey });
  }

  getModelName(): string {
    return this.model;
  }

  countTokens(messages: Message[]): number {
    const text = JSON.stringify(messages);
    return Math.ceil(text.length / 4);
  }

  /**
   * Convert internal messages to Anthropic's format.
   * System prompt is handled separately via `options.system`.
   */
  normalizeMessages(messages: Message[]): Anthropic.Messages.MessageParam[] {
    const result: Anthropic.Messages.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === "system" || msg.role === "tool") continue;

      let content: Anthropic.Messages.ContentBlockParam[] = [];

      if (typeof msg.content === "string") {
        content = [{ type: "text", text: msg.content }];
      } else if (Array.isArray(msg.content)) {
        content = msg.content.map((block: ContentBlock) => {
          if (block.type === "text") {
            return { type: "text", text: (block as TextContent).text };
          }
          if (block.type === "tool_use") {
            return {
              type: "tool_use",
              id: (block as ToolUseContent).id,
              name: (block as ToolUseContent).name,
              input: (block as ToolUseContent).input,
            } satisfies Anthropic.Messages.ToolUseBlockParam;
          }
          if (block.type === "tool_result") {
            const tr = block as ToolResultContent;
            return {
              type: "tool_result",
              tool_use_id: tr.toolUseId,
              content: tr.content,
              is_error: tr.isError,
            } satisfies Anthropic.Messages.ToolResultBlockParam;
          }
          return { type: "text", text: "" };
        });
      }

      result.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content,
      });
    }

    return result;
  }

  /**
   * Normalize internal tool definitions to Anthropic's format.
   */
  override normalizeTools(tools: ToolDefinition[]): unknown {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
  }

  async *chat(messages: Message[], options: ChatOptions): AsyncGenerator<StreamChunk> {
    const anthropicMessages = this.normalizeMessages(messages);
    const tools = options.tools?.length
      ? (this.normalizeTools(options.tools) as Anthropic.Messages.Tool[])
      : undefined;

    try {
      const stream = this.client.messages.stream(
        {
          model: options.model || this.model,
          max_tokens: options.maxTokens || 4096,
          system: options.system || "",
          messages: anthropicMessages,
          tools: tools?.length ? tools : undefined,
          temperature: options.temperature,
        },
        { signal: options.signal as AbortSignal }
      );

      // Track tool use state across content blocks
      let currentToolId = "";
      let currentToolName = "";
      let currentToolInput = "";

      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            yield { type: "text", delta: event.delta.text };
          } else if (event.delta.type === "input_json_delta") {
            currentToolInput += event.delta.partial_json;
          }
        } else if (event.type === "content_block_start") {
          if (event.content_block.type === "tool_use") {
            currentToolId = event.content_block.id;
            currentToolName = event.content_block.name;
            currentToolInput = "";
          }
        } else if (event.type === "content_block_stop") {
          if (currentToolName) {
            try {
              yield {
                type: "tool_use",
                id: currentToolId,
                name: currentToolName,
                input: JSON.parse(currentToolInput),
              };
            } catch {
              yield {
                type: "tool_use",
                id: currentToolId,
                name: currentToolName,
                input: {},
              };
            }
            currentToolId = "";
            currentToolName = "";
            currentToolInput = "";
          }
        }
      }

      yield { type: "done" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      yield { type: "error", message };
    }
  }
}
