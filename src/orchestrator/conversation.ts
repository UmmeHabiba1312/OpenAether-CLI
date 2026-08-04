import type {
  LLMProvider,
  Message,
  StreamChunk,
  ToolUseContent,
  ContentBlock,
} from "../providers/interface.js";
import type { OpenAetherConfig } from "../config/types.js";
import { ToolRegistry } from "../tools/registry.js";

export interface OrchestratorResult {
  text: string;
  toolCalls: ToolUseContent[];
}

export interface ToolCallEvent {
  type: "tool_start" | "tool_end";
  name: string;
  args: Record<string, unknown>;
  result?: { content: string; isError?: boolean };
}

export type StreamHandler = (chunk: StreamChunk | ToolCallEvent) => void;

const MAX_DEPTH = 25;

/**
 * ConversationOrchestrator — the core message loop.
 * Sends user input to the LLM, processes tool calls, and continues
 * the conversation until the model produces a final text response.
 */
export class ConversationOrchestrator {
  private provider: LLMProvider;
  private toolRegistry: ToolRegistry;
  private config: OpenAetherConfig;
  private messages: Message[] = [];

  constructor(provider: LLMProvider, toolRegistry: ToolRegistry, config: OpenAetherConfig) {
    this.provider = provider;
    this.toolRegistry = toolRegistry;
    this.config = config;
  }

  /**
   * Get the current conversation history.
   */
  getHistory(): Message[] {
    return this.messages;
  }

  /**
   * Set the conversation history (e.g. when loading a session).
   */
  setHistory(messages: Message[]): void {
    this.messages = messages;
  }

  /**
   * Reset the conversation history.
   */
  reset(): void {
    this.messages = [];
  }

  /**
   * Swap the active provider (e.g. when switching models/providers at runtime).
   */
  setProvider(provider: LLMProvider): void {
    this.provider = provider;
  }

  /**
   * Get the active provider instance.
   */
  getProvider(): LLMProvider {
    return this.provider;
  }

  /**
   * Get the current model name from the active provider.
   */
  getModelName(): string {
    return this.provider.getModelName();
  }

  /**
   * Send a message to the LLM and get the final text response.
   * Returns the accumulated text from the final (non-tool) turn.
   */
  async sendMessage(input: string, onStream?: StreamHandler, signal?: AbortSignal): Promise<string> {
    this.messages.push({ role: "user", content: input });
    return this.converse(0, onStream, signal);
  }

  /**
   * Recursive conversation loop:
   * call provider → collect text + tool calls → execute tools → recurse.
   */
  private async converse(depth: number, onStream?: StreamHandler, signal?: AbortSignal): Promise<string> {
    if (depth > MAX_DEPTH) {
      const err = `Maximum conversation depth (${MAX_DEPTH}) reached.`;
      onStream?.({ type: "error", message: err });
      return err;
    }

    if (signal?.aborted) {
      return "Request cancelled.";
    }

    // Determine tool schemas
    const tools = this.toolRegistry.getAllSchemas();

    const chunks = this.provider.chat(this.messages, {
      system: this.config.systemPrompt,
      tools,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      signal,
    });

    let text = "";
    const toolCalls: ToolUseContent[] = [];

    for await (const chunk of chunks) {
      onStream?.(chunk);

      switch (chunk.type) {
        case "text":
          text += chunk.delta;
          break;
        case "tool_use":
          // Merge partial tool calls by id if the provider streams them incrementally
          const existing = toolCalls.find((t) => t.id === chunk.id);
          if (existing) {
            existing.input = { ...existing.input, ...chunk.input };
            existing.name = existing.name || chunk.name;
          } else {
            toolCalls.push({
              type: "tool_use",
              id: chunk.id,
              name: chunk.name,
              input: chunk.input,
            });
          }
          break;
        case "error":
          onStream?.({ type: "error", message: chunk.message });
          return chunk.message;
        case "done":
          break;
      }
    }

    // No tool calls — this is the final answer
    if (toolCalls.length === 0) {
      const assistantMsg: Message = { role: "assistant", content: text };
      this.messages.push(assistantMsg);
      return text;
    }

    // ── Tool call turn ───────────────────────────────────────────────────
    // Build assistant message content: text + tool_use blocks
    const assistantContent: ContentBlock[] = [];
    if (text) {
      assistantContent.push({ type: "text", text });
    }
    for (const tc of toolCalls) {
      assistantContent.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
    }
    this.messages.push({ role: "assistant", content: assistantContent });

    // Execute each tool, collecting results
    const toolResults: ContentBlock[] = [];
    for (const tc of toolCalls) {
      onStream?.({ type: "tool_start", name: tc.name, args: tc.input });

      const result = await this.toolRegistry.execute(tc.name, tc.input);

      onStream?.({ type: "tool_end", name: tc.name, args: tc.input, result });

      toolResults.push({
        type: "tool_result",
        toolUseId: tc.id,
        content: result.content,
        isError: result.isError,
      });
    }

    // Tool results go into a user-role message (Anthropic-style canonical format)
    this.messages.push({ role: "user", content: toolResults });

    // Recurse to let the model continue
    return this.converse(depth + 1, onStream, signal);
  }
}
