import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const MEMORY_DIR = join(homedir(), ".openaether");
const MEMORY_FILE = join(MEMORY_DIR, "memory.md");

/**
 * MemoryManager — persists user-level memory across sessions.
 * Memory is stored as a simple markdown file at ~/.openaether/memory.md.
 * Each line is a dated note: "- 2025-01-15: user prefers kebab-case"
 */
export class MemoryManager {
  private content: string = "";

  /**
   * Load memory from disk. Returns the content (or empty string).
   */
  async load(): Promise<string> {
    try {
      if (existsSync(MEMORY_FILE)) {
        this.content = await readFile(MEMORY_FILE, "utf-8");
      }
    } catch {
      this.content = "";
    }
    return this.content;
  }

  /**
   * Get the current (loaded) memory content.
   */
  getContent(): string {
    return this.content;
  }

  /**
   * Append a new fact to the memory file.
   * Format: - <date>: <fact>
   */
  async append(fact: string): Promise<void> {
    await ensureDir();
    const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const line = `- ${date}: ${fact.trim()}`;
    this.content += (this.content ? "\n" : "") + line;
    await appendFile(MEMORY_FILE, "\n" + line, "utf-8");
  }

  /**
   * Clear all memory.
   */
  async clear(): Promise<void> {
    this.content = "";
    try {
      if (existsSync(MEMORY_FILE)) {
        await writeFile(MEMORY_FILE, "", "utf-8");
      }
    } catch {
      // ignore
    }
  }

  /**
   * Path to the memory file (for display).
   */
  getPath(): string {
    return MEMORY_FILE;
  }
}

async function ensureDir(): Promise<void> {
  if (!existsSync(MEMORY_DIR)) {
    await mkdir(MEMORY_DIR, { recursive: true });
  }
}