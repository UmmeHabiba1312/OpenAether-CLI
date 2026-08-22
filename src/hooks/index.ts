import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { HookConfig, HookDefinition } from "../config/types.js";

const execAsync = promisify(exec);

const GLOBAL_DIR = join(homedir(), ".openaether");
const GLOBAL_CONFIG = join(GLOBAL_DIR, "config.json");
const PROJECT_SETTINGS = ".openaether/settings.json";

/** Decision a PreToolUse hook makes about a tool call. */
export type PreToolUseDecision = "allow" | "deny" | "ask";

/**
 * Load the merged hook config: global config `hooks` as the base,
 * project settings `hooks` appended on top.
 */
export async function loadHooks(cwd = process.cwd()): Promise<HookConfig> {
  const preToolUse: HookDefinition[] = [];
  const postToolUse: HookDefinition[] = [];
  const stop: HookDefinition[] = [];

  // Global (~/.openaether/config.json)
  try {
    if (existsSync(GLOBAL_CONFIG)) {
      const raw = await readFile(GLOBAL_CONFIG, "utf-8");
      const parsed = JSON.parse(raw) as { hooks?: HookConfig };
      preToolUse.push(...(parsed.hooks?.preToolUse ?? []));
      postToolUse.push(...(parsed.hooks?.postToolUse ?? []));
      stop.push(...(parsed.hooks?.stop ?? []));
    }
  } catch {
    // ignore unreadable global config
  }

  // Project (.openaether/settings.json)
  const projectPath = resolve(cwd, PROJECT_SETTINGS);
  try {
    if (existsSync(projectPath)) {
      const raw = await readFile(projectPath, "utf-8");
      const parsed = JSON.parse(raw) as { hooks?: HookConfig };
      preToolUse.push(...(parsed.hooks?.preToolUse ?? []));
      postToolUse.push(...(parsed.hooks?.postToolUse ?? []));
      stop.push(...(parsed.hooks?.stop ?? []));
    }
  } catch {
    // ignore unreadable project settings
  }

  return {
    preToolUse: preToolUse.length ? preToolUse : undefined,
    postToolUse: postToolUse.length ? postToolUse : undefined,
    stop: stop.length ? stop : undefined,
  };
}

/** Whether a hook matcher applies to a tool name. */
function hookMatches(hook: HookDefinition, toolName: string): boolean {
  const matcher = hook.matcher;
  if (!matcher || matcher === "*") return true;
  if (matcher.endsWith("*")) {
    return toolName.toLowerCase().startsWith(matcher.slice(0, -1).toLowerCase());
  }
  return matcher.toLowerCase() === toolName.toLowerCase();
}

/**
 * HookRunner — executes configured lifecycle hook commands.
 * Commands receive context via environment variables; stop hooks also get the
 * conversation on stdin. Errors never crash the app.
 */
export class HookRunner {
  private config: HookConfig;

  constructor(config: HookConfig = {}) {
    this.config = config;
  }

  /**
   * Run matching PreToolUse hooks.
   * - exit 2 → "deny" (block the tool)
   * - exit 0 → "allow"
   * - otherwise → "ask" (let permissions / the user decide)
   * If no hooks match, returns "ask".
   */
  async preToolUse(toolName: string, args: Record<string, unknown>): Promise<PreToolUseDecision> {
    const hooks = (this.config.preToolUse ?? []).filter((h) => hookMatches(h, toolName));
    if (hooks.length === 0) return "ask";

    let decision: PreToolUseDecision = "ask";
    for (const hook of hooks) {
      try {
        const code = await runCommand(hook.command, {
          OPENAETHER_TOOL_NAME: toolName,
          OPENAETHER_TOOL_INPUT: JSON.stringify(args),
        });
        if (code === 2) {
          decision = "deny";
          break;
        }
        if (code === 0) decision = "allow";
      } catch {
        // hook failed to run — don't block, fall through to ask
      }
    }
    return decision;
  }

  /**
   * Run matching PostToolUse hooks after a tool executes. Never blocks.
   */
  async postToolUse(
    toolName: string,
    result: { content: string; isError?: boolean },
  ): Promise<void> {
    const hooks = (this.config.postToolUse ?? []).filter((h) => hookMatches(h, toolName));
    for (const hook of hooks) {
      try {
        await runCommand(hook.command, {
          OPENAETHER_TOOL_NAME: toolName,
          OPENAETHER_TOOL_RESPONSE: JSON.stringify(result),
        });
      } catch {
        // ignore hook failures
      }
    }
  }

  /**
   * Run Stop hooks once at the end of a conversation turn.
   */
  async stop(conversationJson: string): Promise<void> {
    const hooks = this.config.stop ?? [];
    for (const hook of hooks) {
      try {
        await runCommand(hook.command, {
          OPENAETHER_CONVERSATION: conversationJson,
        }, conversationJson);
      } catch {
        // ignore hook failures
      }
    }
  }
}

/** Run a shell command, returning its exit code. Env passed as extra env vars. */
async function runCommand(
  command: string,
  env: Record<string, string>,
  stdin?: string,
): Promise<number> {
  return new Promise((resolvePromise) => {
    const child = exec(command, {
      timeout: 30_000,
      env: { ...process.env, ...env },
    });

    if (stdin !== undefined) {
      try {
        child.stdin?.write(stdin);
      } catch {
        // ignore write errors
      }
    }
    try {
      child.stdin?.end();
    } catch {
      // ignore
    }

    // Use the 'close' event only — the exec callback can fire before 'close'
    // and would resolve with a wrong code. On command-not-found, 'error'
    // fires; treat that as "no decision" (0).
    child.on("close", (code) => resolvePromise(code ?? 0));
    child.on("error", () => resolvePromise(0));
  });
}
