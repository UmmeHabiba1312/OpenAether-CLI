import { GoogleGenerativeAI, type GenerateContentRequest } from "@google/generative-ai";
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
 *
 * Uses generateContentStream (not startChat) for full tool-calling support.
 * Maps nested tool_result blocks to proper functionResponse parts.
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

  /**
   * Implement the abstract normalizeMessages (required by the interface).
   * Returns Gemini content objects.
   */
  normalizeMessages(messages: Message[]): unknown {
    return this.buildContents(messages);
  }

  /**
   * Convert internal messages to Gemini's content format.
   * Gemini uses role "user" or "model" and expects:
   * - functionCall: { name, args }  (from assistant tool_use blocks)
   * - functionResponse: { name, response }  (from tool_result blocks, name = function name, NOT toolUseId)
   */
  private buildContents(
    messages: Message[],
    functionNameMap: Map<string, string> = new Map(),
  ): Array<{ role: string; parts: unknown[] }> {
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
            // Remember the function name for this tool call id
            functionNameMap.set(tu.id, tu.name);
            parts.push({
              functionCall: {
                name: tu.name,
                args: tu.input,
              },
            });
          } else if (block.type === "tool_result") {
            const tr = block as ToolResultContent;
            // Gemini functionResponse needs the function NAME, not the tool call id
            const fnName = functionNameMap.get(tr.toolUseId) || tr.toolUseId;
            parts.push({
              functionResponse: {
                name: fnName,
                response: { result: tr.content },
              },
            });
          }
        }
      }

      const role = msg.role === "assistant" ? "model" : "user";

      // Skip empty messages
      if (parts.length === 0) continue;

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
      // Build a map to track toolUseId → functionName across the conversation
      const functionNameMap = new Map<string, string>();
      const contents = this.buildContents(messages, functionNameMap);

      // Build tool definitions
      const toolDefs = options.tools?.length
        ? [{ functionDeclarations: this.normalizeTools(options.tools) as object[] }]
        : undefined;

      const geminiModel = this.client.getGenerativeModel(
        {
          model: options.model || this.model,
          systemInstruction: options.system || undefined,
          tools: toolDefs as object[],
        },
      );

      const request: GenerateContentRequest = {
        contents: contents as GenerateContentRequest["contents"],
      };

      if (options.maxTokens) {
        request.generationConfig = { maxOutputTokens: options.maxTokens };
      }
      if (options.temperature !== undefined) {
        request.generationConfig = {
          ...(request.generationConfig || {}),
          temperature: options.temperature,
        };
      }

      const result = await geminiModel.generateContentStream(request);

      /**
       * Gemini streams function calls across multiple chunks.
       * Accumulate them by name and emit at the end of the stream.
       */
      const accumulatedFCs = new Map<string, { name: string; args: string }>();

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
            const key = fc.name;
            const existing = accumulatedFCs.get(key);
            if (existing) {
              // Merge partial args by appending the JSON string
              // (Gemini sometimes streams args across multiple chunks)
              existing.args += typeof fc.args === 'object' ? JSON.stringify(fc.args) : String(fc.args);
            } else {
              accumulatedFCs.set(key, {
                name: fc.name,
                args: typeof fc.args === 'object' ? JSON.stringify(fc.args) : String(fc.args),
              });
            }
          }
        }
      }

      // Emit accumulated function calls
      for (const [, acc] of accumulatedFCs) {
        let input: Record<string, unknown> = {};
        try {
          input = acc.args ? JSON.parse(acc.args) : {};
        } catch {
          input = {};
        }
        yield {
          type: "tool_use" as const,
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: acc.name,
          input,
        };
      }

      yield { type: "done" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      yield { type: "error", message };
    }
  }
}