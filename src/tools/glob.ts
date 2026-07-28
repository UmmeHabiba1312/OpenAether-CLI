import { glob } from "node:fs/promises";
import { resolve } from "node:path";
import type { ToolHandler } from "./registry.js";

export const globTool: ToolHandler = async (args) => {
  const pattern = args.pattern as string | undefined;
  const path = args.path as string | undefined;

  if (!pattern) {
    return { content: "Error: 'pattern' argument is required", isError: true };
  }

  try {
    const cwd = path ? resolve(process.cwd(), path) : process.cwd();
    const results: string[] = [];
    const maxResults = 100;

    for await (const entry of glob(pattern, { cwd, withFileTypes: false })) {
      if (results.length >= maxResults) break;
      results.push(entry);
    }

    if (results.length === 0) {
      return { content: `No files found matching "${pattern}"` };
    }

    const summary = results.length >= maxResults
      ? `\n[Showing first ${maxResults} of ${maxResults}+ results]`
      : `\n[${results.length} file(s) found]`;

    return {
      content: results.join("\n") + summary,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: `Error searching files: ${message}`, isError: true };
  }
};

export const globDefinition = {
  name: "Glob",
  description: "Search for files matching a glob pattern. Returns matching file paths relative to the working directory. Max 100 results.",
  inputSchema: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Glob pattern (e.g. '**/*.ts', 'src/**/*.js')",
      },
      path: {
        type: "string",
        description: "Base directory (defaults to current working directory)",
      },
    },
    required: ["pattern"],
  },
};
