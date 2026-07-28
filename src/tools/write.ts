import { writeFile, mkdir } from "node:fs/promises";
import { isAbsolute, resolve, dirname } from "node:path";
import type { ToolHandler } from "./registry.js";

export const writeTool: ToolHandler = async (args) => {
  const filePath = args.filePath as string | undefined;
  const content = args.content as string | undefined;

  if (!filePath) {
    return { content: "Error: 'filePath' argument is required", isError: true };
  }

  if (content === undefined || content === null) {
    return { content: "Error: 'content' argument is required", isError: true };
  }

  try {
    const resolvedPath = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);

    // Ensure parent directory exists
    await mkdir(dirname(resolvedPath), { recursive: true });

    await writeFile(resolvedPath, String(content), "utf-8");

    const byteCount = Buffer.byteLength(String(content), "utf-8");
    return {
      content: `File written: ${resolvedPath} (${byteCount} bytes, ${String(content).split("\n").length} lines)`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: `Error writing file: ${message}`, isError: true };
  }
};

export const writeDefinition = {
  name: "Write",
  description: "Write content to a file. Creates the file and any necessary parent directories. Overwrites if the file already exists.",
  inputSchema: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "The absolute or relative path to the file to write",
      },
      content: {
        type: "string",
        description: "The content to write to the file",
      },
    },
    required: ["filePath", "content"],
  },
};
