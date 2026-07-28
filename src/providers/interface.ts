import type { ToolDefinition } from "../config/types.js";

// ─── Shared Types ───────────────────────────────────────────────────────────

export type Role = "user" | "assistant" | "system" | "tool";

export interface TextContent {
  type: "text";
  text: string;
}

export interface ToolUseContent {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export type ContentBlock = TextContent | ToolUseContent | ToolResultContent;

export interface Message {
  role: Role;
  content: string | ContentBlock[];
  name?: string;
  tool_call_id?: string;
}

// ─── Streaming Chunks ───────────────────────────────────────────────────────

export interface TextChunk {
  type: "text";
  delta: string;
}

export interface ToolUseChunk {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ErrorChunk {
  type: "error";
  message: string;
}

export interface DoneChunk {
  type: "done";
}

export type StreamChunk = TextChunk | ToolUseChunk | ErrorChunk | DoneChunk;

// ─── Chat Options ───────────────────────────────────────────────────────────

export interface ChatOptions {
  system?: string;
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  model?: string;
  signal?: AbortSignal;
}

// ─── Provider Interface ─────────────────────────────────────────────────────

/**
 * Abstract base class for all LLM providers.
 * Each provider implements `chat()` and `getModelName()`.
 * Helper methods normalize messages and tools to provider-specific formats.
 */
export abstract class LLMProvider {
  /** Human-readable provider name (e.g. "openai", "anthropic") */
  abstract readonly name: string;

  /**
   * Stream a chat conversation.
   * Yields StreamChunk deltas as they arrive from the API.
   */
  abstract chat(
    messages: Message[],
    options: ChatOptions,
  ): AsyncGenerator<StreamChunk>;

  /**
   * Get the current model identifier.
   */
  abstract getModelName(): string;

  /**
   * Count tokens in a message list (approximate if provider doesn't support it).
   */
  abstract countTokens(messages: Message[]): number | Promise<number>;

  // ── Shared helpers ──────────────────────────────────────────────────────

  /**
   * Convert internal tool definitions to a provider-specific JSON Schema format.
   * Override if the provider needs a different schema shape.
   */
  normalizeTools(tools: ToolDefinition[]): unknown {
    return tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));
  }

  /**
   * Convert internal Message[] to provider-specific message format.
   * Override per provider.
   */
  abstract normalizeMessages(messages: Message[]): unknown;
}
