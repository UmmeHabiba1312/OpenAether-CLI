import type {
  LLMProvider,
  Message,
  StreamChunk,
  ToolUseContent,
  ContentBlock,
} from "../providers/interface.js";
import type { OpenAetherConfig } from "../config/types.js";
import { ToolRegistry } from "../tools/registry.js";
import { CostTracker, estimateTokens } from "../cost/index.js";

/** Lifecycle hooks the orchestrator can call. Implemented by src/hooks HookRunner. */
export interface OrchestratorHooks {
  preToolUse?: (
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<"allow" | "deny" | "ask">;
  postToolUse?: (
    toolName: string,
    result: { content: string; isError?: boolean },
  ) => Promise<void>;
  stop?: (conversationJson: string) => Promise<void>;
}

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

/** Asks the user whether a tool call may proceed. Returns true to allow. */
export type ToolApprovalFn = (
  toolName: string,
  args: Record<string, unknown>,
) => Promise<boolean>;

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
  /** Active skills: name → instruction content (injected into system prompt). */
  private activeSkills = new Map<string, string>();
  /** Project context (CLAUDE.md-style instructions + git state) injected into the system prompt. */
  private projectContext = "";
  /** User memory (from ~/.openaether/memory.md) injected into the system prompt. */
  private memory = "";
  /** Summary of compacted earlier conversation, injected into the system prompt. */
  private compactionSummary = "";
  /** Guard against re-entrant compaction. */
  private compacting = false;
  /** Lifecycle hooks (PreToolUse / PostToolUse / Stop). */
  private hooks: OrchestratorHooks | null = null;
  /** Optional approval gate called before each tool executes. */
  private requireApproval: ToolApprovalFn | null;
  /** Tracks token usage and estimated cost. */
  private costTracker = new CostTracker();

  constructor(
    provider: LLMProvider,
    toolRegistry: ToolRegistry,
    config: OpenAetherConfig,
    requireApproval?: ToolApprovalFn,
  ) {
    this.provider = provider;
    this.toolRegistry = toolRegistry;
    this.config = config;
    this.requireApproval = requireApproval ?? null;
  }

  /**
   * Load a skill's instructions into the active context.
   */
  addSkill(name: string, instructions: string): void {
    this.activeSkills.set(name, instructions);
  }

  /**
   * Remove a skill from active context.
   */
  removeSkill(name: string): boolean {
    return this.activeSkills.delete(name);
  }

  /**
   * List active skill names.
   */
  getActiveSkills(): string[] {
    return Array.from(this.activeSkills.keys());
  }

  /**
   * Set the project context (CLAUDE.md instructions + git state).
   */
  setProjectContext(context: string): void {
    this.projectContext = context;
  }

  /**
   * Set user memory (from ~/.openaether/memory.md).
   */
  setMemory(text: string): void {
    this.memory = text;
  }

  /**
   * Build the effective system prompt: base config prompt + memory + project context + active skill instructions + compaction summary.
   */
  private buildSystemPrompt(): string {
    const base = this.config.systemPrompt || "";

    let parts = base;

    // User memory (persistent across sessions)
    if (this.memory) {
      parts += `\n\n# User Memory\n${this.memory}`;
    }

    // Project context (CLAUDE.md / .openaether.md)
    if (this.projectContext) {
      parts += `\n\n${this.projectContext}`;
    }

    // Compaction summary from earlier conversation
    if (this.compactionSummary) {
      parts += `\n\n# Summary of earlier conversation\n${this.compactionSummary}`;
    }

    if (this.activeSkills.size === 0) return parts;

    const skillBlock = Array.from(this.activeSkills.entries())
      .map(([name, content]) => `\n\n=== Active Skill: ${name} ===\n${content}`)
      .join("\n");

    return `${parts}\n${skillBlock}`;
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
   * Sets lifecycle hooks (PreToolUse / PostToolUse / Stop).
   */
  setHooks(hooks: OrchestratorHooks | null): void {
    this.hooks = hooks;
  }

  /**
   * Set (or clear) the tool-approval gate.
   */
  setApprovalHandler(handler: ToolApprovalFn | null): void {
    this.requireApproval = handler;
  }

  /**
   * Get the tool registry (for building sub-orchestrators).
   */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  /**
   * Get the cost/usage summary for this session.
   */
  getCostSummary(): ReturnType<CostTracker["summary"]> {
    return this.costTracker.summary();
  }

  // ── Context compaction ──────────────────────────────────────────────────

  /**
   * Check whether the conversation should be compacted based on estimated token count.
   */
  private shouldCompact(): boolean {
    if (this.messages.length < 5) return false;
    const threshold = this.config.compactionThreshold ?? 60_000;
    const estimated = estimateTokens(JSON.stringify(this.messages));
    return estimated > threshold;
  }

  /**
   * Compact the conversation: summarize older messages and keep only recent ones.
   * The summary is injected as a system-prompt block above.
   */
  async compact(): Promise<void> {
    if (this.compacting) return;
    this.compacting = true;

    const keepRecent = this.config.keepRecent ?? 10;
    // Only compact if we have more than 2x keepRecent messages
    if (this.messages.length <= keepRecent * 2) {
      this.compacting = false;
      return;
    }

    const splitAt = this.messages.length - keepRecent;
    const toSummarize = this.messages.slice(0, splitAt);
    const toKeep = this.messages.slice(splitAt);

    const COMPACT_PROMPT =
      "Summarize the key points of this conversation so far — what was asked, what was done, what decisions were made, what the current state is. Be concise but complete. Output only the summary, no greeting or preamble.";

    // Use a fresh orchestrator call to the provider for summarization
    const summaryMessages: Message[] = [
      { role: "user", content: COMPACT_PROMPT + "\n\n" + JSON.stringify(toSummarize.map(m => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : "[tool interaction]",
      }))) },
    ];

    try {
      const chunks = this.provider.chat(summaryMessages, {
        system: "You summarize conversations accurately and concisely.",
        tools: [],
      });

      let summary = "";
      for await (const chunk of chunks) {
        if (chunk.type === "text") {
          summary += chunk.delta;
        }
      }

      if (summary) {
        this.compactionSummary = summary.trim();
        this.messages = toKeep;
      }
    } catch {
      // If compaction fails, just continue with the full conversation
    } finally {
      this.compacting = false;
    }
  }

  /**
   * Get the estimated token count of the current conversation.
   */
  getEstimatedTokenCount(): number {
    return estimateTokens(
      JSON.stringify(this.messages) + (this.buildSystemPrompt() || ""),
    );
  }

  /**
   * Send a message to the LLM and get the final text response.
   * Returns the accumulated text from the final (non-tool) turn.
   */
  async sendMessage(input: string, onStream?: StreamHandler, signal?: AbortSignal): Promise<string> {
    this.messages.push({ role: "user", content: input });
    try {
      return await this.converse(0, onStream, signal);
    } finally {
      // Stop hooks fire once per top-level send (final answer, abort, or error)
      await this.hooks?.stop?.(JSON.stringify(this.messages));
    }
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

    // Auto-compact if needed (before the first provider call)
    if (!this.compacting && this.shouldCompact()) {
      onStream?.({ type: "text", delta: "[Compacting conversation...]" });
      await this.compact();
      onStream?.({ type: "text", delta: "\n" });
    }

    // Determine tool schemas
    const tools = this.toolRegistry.getAllSchemas();

    const chunks = this.provider.chat(this.messages, {
      system: this.buildSystemPrompt(),
      tools,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      signal,
    });

    // Cost tracking: estimate input tokens from the messages we send
    const inputTokens = estimateTokens(
      JSON.stringify(this.messages) + (this.buildSystemPrompt() || ""),
    );

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

    // Record token usage for this turn
    this.costTracker.addCall(this.provider.getModelName(), inputTokens, estimateTokens(text));

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

      // PreToolUse hook → can block or auto-approve
      let decision: "allow" | "deny" | "ask" = "ask";
      if (this.hooks?.preToolUse) {
        decision = await this.hooks.preToolUse(tc.name, tc.input);
      }

      // If the hook didn't decide, fall through to the approval gate
      if (decision === "ask" && this.requireApproval) {
        const approved = await this.requireApproval(tc.name, tc.input);
        decision = approved ? "allow" : "deny";
      }

      if (decision === "deny") {
        onStream?.({
          type: "tool_end",
          name: tc.name,
          args: tc.input,
          result: { content: "Tool call blocked (hook or user).", isError: true },
        });
        toolResults.push({
          type: "tool_result",
          toolUseId: tc.id,
          content: "Tool call blocked by hook or user. Tell the user the action was blocked and ask how to proceed.",
          isError: true,
        });
        continue;
      }

      const result = await this.toolRegistry.execute(tc.name, tc.input);

      // PostToolUse hook — never blocks
      await this.hooks?.postToolUse?.(tc.name, result);

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