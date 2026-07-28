import { GoogleGenerativeAI } from "@google/generative-ai";
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
 * Google Gemini provider — supports Gemini 2.0 Flash, Gemini 1.5 Pro, etc.
 */
export class GoogleProvider extends LLMProvider {
  readonly name = "google";
  private client: GoogleGenerativeAI;
  private model: string;

  constructor(apiKey: string, model = "gemini-2.0-flash") {
    super();
    this.model = model;
    this.client = new GoogleGenerativeAI(apiKey);
  }

  getModelName(): string {
    return this.model;
  }

  countTokens(messages: Message[]): number {
    const text = JSON.stringify(messages);
    return Math.ceil(text.length / 4);
  }

  normalizeMessages(messages: Message[]): Array<{ role: string; parts: unknown[] }> {
    const result: Array<{ role: string; parts: unknown[] }> = [];

    for (const msg of messages) {
      if (msg.role === "system") continue;

      const parts: unknown[] = [];

      if (typeof msg.content === "string") {
        parts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content as ContentBlock[]) {
          if (block.type === "text") {
            parts.push({ text: (block as TextContent).text });
          } else if (block.type === "tool_use") {
            const tu = block as ToolUseContent;
            parts.push({
              functionCall: {
                name: tu.name,
                args: tu.input,
              },
            });
          } else if (block.type === "tool_result") {
            const tr = block as ToolResultContent;
            parts.push({
              functionResponse: {
                name: tr.toolUseId,
                response: { result: tr.content },
              },
            });
          }
        }
      }

      const role = msg.role === "assistant" ? "model" : "user";
      result.push({ role, parts });
    }

    return result;
  }

  override normalizeTools(tools: ToolDefinition[]): unknown {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    }));
  }

  async *chat(messages: Message[], options: ChatOptions): AsyncGenerator<StreamChunk> {
    try {
      const toolDefs = options.tools?.length
        ? [{ functionDeclarations: this.normalizeTools(options.tools) as object[] }]
        : undefined;

      const geminiModel = this.client.getGenerativeModel({
        model: options.model || this.model,
        systemInstruction: options.system,
        tools: toolDefs as unknown as undefined,
      });

      const geminiMessages = this.normalizeMessages(messages);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chat = geminiModel.startChat({ history: geminiMessages.slice(0, -1) as any });

      const lastMsg = geminiMessages[geminiMessages.length - 1];
      const lastText = lastMsg?.parts
        .map((p: any) => p?.text || "")
        .filter(Boolean)
        .join(" ");

      const result = await chat.sendMessageStream(lastText || "");

      for await (const chunk of result.stream) {
        if (options.signal?.aborted) break;

        const candidate = chunk.candidates?.[0];
        if (!candidate) continue;

        for (const part of candidate.content.parts) {
          if (part.text) {
            yield { type: "text", delta: part.text };
          }

          if (part.functionCall) {
            const fc = part.functionCall;
            yield {
              type: "tool_use" as const,
              id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              name: fc.name,
              input: fc.args as Record<string, unknown>,
            };
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
