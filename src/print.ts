import type { OpenAetherConfig, PermissionConfig } from "./config/types.js";
import type {
  ConversationOrchestrator,
  StreamHandler,
  ToolApprovalFn,
} from "./orchestrator/conversation.js";
import type { LLMProvider } from "./providers/interface.js";
import type { ToolRegistry } from "./tools/registry.js";
import type { MCPManager } from "./mcp/index.js";
import type { TaskManager } from "./tasks/index.js";
import { SessionManager } from "./session/index.js";
import { decide } from "./permissions/index.js";

/** The shared application session built by index.ts buildApp(). */
export interface PrintApp {
  config: OpenAetherConfig;
  provider: LLMProvider;
  toolRegistry: ToolRegistry;
  mcp: MCPManager;
  orchestrator: ConversationOrchestrator;
  permissions: PermissionConfig;
  taskManager: TaskManager;
}

export interface PrintOptions {
  /** Prompt from CLI arg. If omitted, reads from stdin. */
  prompt?: string;
  outputFormat: "text" | "json";
  /** Auto-approve every tool call (--dangerously-skip-permissions). */
  skipPermissions: boolean;
  /** Resume the most recent session (--continue / --resume). */
  resume: boolean;
}

/**
 * One-shot print mode: send a single message, print the result, exit.
 * stdout stays clean (only the result) so it can be piped / scripted.
 */
export async function runPrintMode(app: PrintApp, opts: PrintOptions): Promise<void> {
  const { config, orchestrator, permissions } = app;

  // --continue: load the most recently-updated session (list() is sorted desc by updatedAt)
  if (opts.resume) {
    try {
      const sm = new SessionManager(config);
      const sessions = await sm.list();
      if (sessions.length > 0) {
        const data = await sm.load(sessions[0].name);
        if (data) {
          orchestrator.setHistory(data.messages);
        }
      }
    } catch {
      // continue fresh if resume fails
    }
  }

  // Approval gate for non-interactive mode:
  // allow → auto-approve, deny → block, ask → denied unless --dangerously-skip-permissions
  const approval: ToolApprovalFn = async (toolName, args) => {
    const decision = decide(permissions, toolName, args);
    if (decision === "allow") return true;
    if (decision === "deny") {
      process.stderr.write(`[tool] ${toolName} blocked by permission rules\n`);
      return false;
    }
    return opts.skipPermissions;
  };
  orchestrator.setApprovalHandler(approval);

  // Read the prompt: CLI arg, otherwise stdin
  let prompt = opts.prompt?.trim() ?? "";
  if (!prompt) {
    prompt = await readStdin().then((s) => s.trim());
  }
  if (!prompt) {
    process.stderr.write(
      'Error: no prompt provided. Use: openaether -p "your prompt", or pipe input via stdin.\n',
    );
    process.exit(1);
  }

  // Stream handler: keep stdout clean — tool activity goes to stderr
  const toolCalls: Array<{ name: string }> = [];
  let hadError = false;
  const handler: StreamHandler = (chunk) => {
    if (chunk.type === "tool_use") {
      toolCalls.push({ name: chunk.name });
      process.stderr.write(`[tool] ${chunk.name} requested\n`);
    } else if (chunk.type === "tool_start") {
      process.stderr.write(`[tool] running ${chunk.name}\n`);
    } else if (chunk.type === "tool_end") {
      process.stderr.write(`[tool] ${chunk.name} ${chunk.result?.isError ? "failed" : "ok"}\n`);
    } else if (chunk.type === "error") {
      hadError = true;
      process.stderr.write(`[error] ${chunk.message}\n`);
    } else if (chunk.type === "text") {
      // intermediate text (e.g. narration before a tool call) → stderr; final text comes from sendMessage return
    }
  };

  let text: string;
  try {
    text = await orchestrator.sendMessage(prompt, handler);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[error] ${message}\n`);
    process.exit(1);
    return;
  }

  // Provider errors surface as streamed error chunks + a returned message — treat as failure
  if (hadError) {
    process.exitCode = 1;
    return;
  }

  const cost = orchestrator.getCostSummary();

  if (opts.outputFormat === "json") {
    process.stdout.write(
      JSON.stringify(
        {
          result: text,
          toolCalls,
          tokens: {
            input: cost.totalInputTokens,
            output: cost.totalOutputTokens,
            total: cost.totalInputTokens + cost.totalOutputTokens,
          },
          estimatedCost: cost.estimatedCost,
        },
        null,
        2,
      ) + "\n",
    );
  } else {
    process.stdout.write(text + (text.endsWith("\n") ? "" : "\n"));
  }
}

/** Read all of stdin as a string (empty if stdin is a TTY / nothing piped). */
function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => {
      data += c;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}
