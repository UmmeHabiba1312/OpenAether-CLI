import { LLMProvider } from "./interface.js";
import type {
  Message,
  ChatOptions,
  StreamChunk,
  ContentBlock,
  ToolUseContent,
  ToolResultContent,
  TextContent,
} from "./interface.js";
import type { ToolDefinition } from "../config/types.js";

/**
 * Ollama provider — connects to a local Ollama instance.
 * No API key required. Default base URL: http://localhost:11434
 */
export class OllamaProvider extends LLMProvider {
  readonly name = "ollama";
  private baseUrl: string;
  private model: string;

  constructor(model = "llama3.2", baseUrl = "http://localhost:11434") {
    super();
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  getModelName(): string {
    return this.model;
  }

  countTokens(messages: Message[]): number {
    const text = JSON.stringify(messages);
    return Math.ceil(text.length / 4);
  }

  normalizeMessages(messages: Message[]): Array<{ role: string; content: string }> {
    return messages.map((msg) => {
      let content = "";

      if (typeof msg.content === "string") {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        content = (msg.content as ContentBlock[])
          .filter((b): b is TextContent => b.type === "text")
          .map((b) => b.text)
          .join("\n");
      }

      let role = msg.role;
      // Ollama uses "assistant" for tool calls
      if (role === "tool") role = "tool";

      return { role, content };
    });
  }

  async *chat(messages: Message[], options: ChatOptions): AsyncGenerator<StreamChunk> {
    const ollamaMessages = this.normalizeMessages(messages);

    // Add system message as first user message if provided (Ollama supports it natively)
    const body: Record<string, unknown> = {
      model: options.model || this.model,
      messages: ollamaMessages,
      stream: true,
    };

    if (options.system) {
      body.system = options.system;
    }

    if (options.tools?.length) {
      body.tools = this.normalizeTools(options.tools);
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: options.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        yield {
          type: "error",
          message: `Ollama error (${response.status}): ${text}`,
        };
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        yield { type: "error", message: "Ollama: no response body" };
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const parsed = JSON.parse(line);
            const message = parsed.message;

            if (message?.content) {
              yield { type: "text", delta: message.content };
            }

            if (message?.tool_calls) {
              for (const tc of message.tool_calls) {
                yield {
                  type: "tool_use",
                  id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                  name: tc.function?.name || "",
                  input: tc.function?.arguments || {},
                };
              }
            }

            if (parsed.done) {
              yield { type: "done" };
              return;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }

      yield { type: "done" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("abort")) return; // AbortSignal, not an error
      yield { type: "error", message };
    }
  }
}
