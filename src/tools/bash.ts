import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

import type { ToolHandler } from "./registry.js";

export const bashTool: ToolHandler = async (args) => {
  const command = args.command as string | undefined;
  const timeout = (args.timeout as number) || 30_000;
  const description = args.description as string | undefined;

  if (!command) {
    return { content: "Error: 'command' argument is required", isError: true };
  }

  // Security: deny dangerous commands
  const dangerous = ["rm -rf /", "rm -rf ~", "rmdir /s /q", "format ", "del /f /s"];
  const isDangerous = dangerous.some((d) => command.toLowerCase().includes(d.toLowerCase()));
  if (isDangerous) {
    return {
      content: "Error: Command blocked for safety reasons.",
      isError: true,
    };
  }

  try {
    const startTime = Date.now();
    const { stdout, stderr } = await execAsync(command, {
      timeout,
      maxBuffer: 1024 * 1024, // 1MB max output
      shell: process.platform === "win32" ? undefined : "/bin/bash",
    });

    const elapsed = Date.now() - startTime;
    let result = "";

    if (stdout) {
      // Truncate if too large
      const maxLen = 50_000;
      result += stdout.length > maxLen
        ? stdout.slice(0, maxLen) + `\n\n[... Output truncated at ${maxLen} characters]`
        : stdout;
    }

    if (stderr) {
      result += `\n[stderr]\n${stderr.slice(0, 10_000)}`;
    }

    if (!result) {
      result = `[Command completed with no output (${elapsed}ms)]`;
    }

    return { content: result };
  } catch (err: unknown) {
    const error = err as Error & { stdout?: string; stderr?: string; code?: number };
    let message = "";

    if (error.stdout) message += error.stdout + "\n";
    if (error.stderr) message += error.stderr;
    if (!message) message = error.message || String(err);

    return {
      content: `Command failed (exit code ${error.code ?? "?"}):\n${message.slice(0, 20_000)}`,
      isError: true,
    };
  }
};

export const bashDefinition = {
  name: "Bash",
  description: "Run a shell command in the user's terminal. Returns stdout and stderr. Use for file operations, git commands, running scripts, etc.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute",
      },
      description: {
        type: "string",
        description: "A brief description of what the command does (for user review)",
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds (default: 30000)",
      },
    },
    required: ["command"],
  },
};
