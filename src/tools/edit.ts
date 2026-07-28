import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { ToolHandler } from "./registry.js";

export const editTool: ToolHandler = async (args) => {
  const filePath = args.filePath as string | undefined;
  const oldString = args.oldString as string | undefined;
  const newString = args.newString as string | undefined;

  if (!filePath) {
    return { content: "Error: 'filePath' argument is required", isError: true };
  }

  if (!oldString) {
    return { content: "Error: 'oldString' argument is required", isError: true };
  }

  try {
    const resolvedPath = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
    const content = await readFile(resolvedPath, "utf-8");

    // Count occurrences
    const occurrences = content.split(oldString).length - 1;

    if (occurrences === 0) {
      return {
        content: `Error: Could not find exact match for oldString in ${resolvedPath}`,
        isError: true,
      };
    }

    if (occurrences > 1) {
      return {
        content: `Error: Found ${occurrences} occurrences of oldString in ${resolvedPath}. Expected exactly 1. Use more context to make the match unique.`,
        isError: true,
      };
    }

    const newContent = content.replace(oldString, newString ?? "");
    await writeFile(resolvedPath, newContent, "utf-8");

    return {
      content: `File edited: ${resolvedPath}\nReplaced 1 occurrence.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: `Error editing file: ${message}`, isError: true };
  }
};

export const editDefinition = {
  name: "Edit",
  description: "Find and replace exact text in a file. Uses exact string matching — oldString must appear exactly once for safety.",
  inputSchema: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "The absolute or relative path to the file to edit",
      },
      oldString: {
        type: "string",
        description: "The exact text to find (must match exactly and appear only once)",
      },
      newString: {
        type: "string",
        description: "The text to replace it with",
      },
    },
    required: ["filePath", "oldString"],
  },
};
