import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/** Files loaded as project context (highest priority first). */
const CONTEXT_FILES = [".openaether.md", "CLAUDE.md", "AGENTS.md"];

/**
 * Load project context: instructions from a context file (CLAUDE.md-style)
 * plus a summary of the current git state.
 */
export async function loadProjectContext(cwd = process.cwd()): Promise<string> {
  const parts: string[] = [];

  // 1. Project instructions file
  for (const file of CONTEXT_FILES) {
    const path = resolve(cwd, file);
    if (existsSync(path)) {
      try {
        const content = await readFile(path, "utf-8");
        parts.push(`# Project context from ${file}\n${content.trim()}`);
        break; // only the first (highest priority) file
      } catch {
        // skip unreadable
      }
    }
  }

  // 2. Git state summary
  const gitState = await getGitState(cwd);
  if (gitState) {
    parts.push(gitState);
  }

  return parts.join("\n\n");
}

/**
 * Summarize the current git branch and changed files.
 */
async function getGitState(cwd: string): Promise<string | null> {
  if (!existsSync(resolve(cwd, ".git"))) return null;

  try {
    const { stdout: branch } = await execAsync("git branch --show-current", { cwd });
    const { stdout: status } = await execAsync(
      "git status --short --branch | head -30",
      { cwd, timeout: 5000 },
    );

    const lines = status.split("\n").filter(Boolean).slice(0, 30);
    if (lines.length === 0) return null;

    return `# Git state\nBranch: ${branch.trim()}\n${lines.join("\n")}`;
  } catch {
    return null;
  }
}

/**
 * Commit all pending changes with a message.
 */
export async function gitCommit(message: string, cwd = process.cwd()): Promise<string> {
  try {
    await execAsync("git add -A", { cwd });
    await execAsync(`git commit -m "${message.replace(/"/g, "'")}"`, { cwd });
    return `Changes committed: ${message}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Git commit failed: ${msg}`;
  }
}
