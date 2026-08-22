import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve, isAbsolute } from "node:path";
import type { ToolHandler } from "./registry.js";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", ".cache"]);
const MAX_FILE_SIZE = 1024 * 1024; // skip files over 1MB
const MAX_RESULTS = 100;

/** Recursively collect file paths under a directory. */
async function walk(dir: string, results: string[], depth = 0): Promise<void> {
  if (depth > 12) return;

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    try {
      const s = await stat(full);
      if (s.isDirectory()) {
        await walk(full, results, depth + 1);
      } else if (s.size <= MAX_FILE_SIZE) {
        results.push(full);
      }
    } catch {
      // skip unreadable
    }
  }
}

export const grepTool: ToolHandler = async (args) => {
  const pattern = args.pattern as string | undefined;
  const path = args.path as string | undefined;
  const include = args.include as string | undefined;

  if (!pattern) {
    return { content: "Error: 'pattern' argument is required", isError: true };
  }

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "i");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Error: invalid regex pattern: ${msg}`, isError: true };
  }

  const root = path
    ? (isAbsolute(path) ? path : resolve(process.cwd(), path))
    : process.cwd();

  const files: string[] = [];
  await walk(root, files);

  // Optionally filter by include glob (simple substring/extension match)
  const filtered = include
    ? files.filter((f) => include.split(",").some((ext) => f.endsWith(ext.trim())))
    : files;

  const matches: string[] = [];
  let searched = 0;

  for (const file of filtered) {
    if (matches.length >= MAX_RESULTS) break;
    searched++;

    try {
      const content = await readFile(file, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          const rel = file.startsWith(process.cwd()) ? file.slice(process.cwd().length + 1) : file;
          matches.push(`${rel}:${i + 1}: ${lines[i].slice(0, 200)}`);
          if (matches.length >= MAX_RESULTS) break;
        }
      }
    } catch {
      // skip unreadable files
    }
  }

  if (matches.length === 0) {
    return { content: `No matches for "${pattern}" in ${searched} file(s).` };
  }

  const more = matches.length >= MAX_RESULTS
    ? `\n[Showing first ${MAX_RESULTS} matches]`
    : "";

  return {
    content: `${matches.join("\n")}\n[${matches.length} match(es) in ${searched} file(s)]${more}`,
  };
};

export const grepDefinition = {
  name: "Grep",
  description: "Search file contents for a regex pattern. Returns file:line matches with surrounding text. Use to find where code is defined/used.",
  inputSchema: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Regex pattern to search for (case-insensitive)",
      },
      path: {
        type: "string",
        description: "Directory to search (defaults to current working directory)",
      },
      include: {
        type: "string",
        description: "Comma-separated file extensions to limit search, e.g. 'ts,js,tsx'",
      },
    },
    required: ["pattern"],
  },
};
