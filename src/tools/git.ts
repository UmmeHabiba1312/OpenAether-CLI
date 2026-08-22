import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { ToolHandler } from "./registry.js";

const execAsync = promisify(exec);

async function run(command: string, cwd?: string): Promise<string> {
  const { stdout, stderr } = await execAsync(command, { cwd, timeout: 15000 });
  return (stdout || stderr || "").trim();
}

export const gitStatusTool: ToolHandler = async (args) => {
  try {
    const status = await run("git status --short --branch");
    const branch = await run("git branch --show-current").catch(() => "?");
    if (!status) return { content: `Branch: ${branch}\nNo changes.` };
    return { content: `Branch: ${branch}\n${status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Not a git repository or git error: ${msg}`, isError: true };
  }
};

export const gitStatusDefinition = {
  name: "GitStatus",
  description: "Show the current git branch and uncommitted changes (status). Use before making changes to understand the repo state.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
};

export const gitCommitTool: ToolHandler = async (args) => {
  const message = args.message as string | undefined;
  if (!message) {
    return { content: "Error: 'message' argument is required", isError: true };
  }

  try {
    await run("git add -A");
    await run(`git commit -m "${message.replace(/"/g, "'")}"`);
    const log = await run("git log --oneline -1");
    return { content: `Committed: ${log}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Git commit failed: ${msg}`, isError: true };
  }
};

export const gitCommitDefinition = {
  name: "GitCommit",
  description: "Stage all changes and commit them with the given message. Use when the user asks to commit work or after completing a change.",
  inputSchema: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "The commit message (concise, imperative mood)",
      },
    },
    required: ["message"],
  },
};
