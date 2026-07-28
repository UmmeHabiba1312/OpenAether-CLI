import { readFile } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import type { ToolHandler } from "./registry.js";

export const readTool: ToolHandler = async (args) => {
  const filePath = args.filePath as string | undefined;

  if (!filePath) {
    return { content: "Error: 'filePath' argument is required", isError: true };
  }

  try {
    const resolvedPath = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
    const content = await readFile(resolvedPath, "utf-8");
    const lines = content.split("\n");
    const lineCount = lines.length;

    // Apply optional offset and limit
    const offset = (args.offset as number) || 0;
    const limit = (args.limit as number) || lineCount;

    if (offset > 0 || limit < lineCount) {
      const sliced = lines.slice(offset, offset + limit);
      return {
        content: sliced.join("\n") + `\n\n[Showing lines ${offset + 1}-${Math.min(offset + limit, lineCount)} of ${lineCount}]`,
      };
    }

    return { content };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: `Error reading file: ${message}`, isError: true };
  }
};

export const readDefinition = {
  name: "Read",
  description: "Read the contents of a file. Supports optional line offset and limit for large files.",
  inputSchema: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "The absolute or relative path to the file to read",
      },
      offset: {
        type: "number",
        description: "Line number to start reading from (0-indexed)",
      },
      limit: {
        type: "number",
        description: "Maximum number of lines to read",
      },
    },
    required: ["filePath"],
  },
};
