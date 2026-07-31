import { readFile, writeFile, readdir, unlink, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, basename, extname } from "node:path";
import type { Message } from "../providers/interface.js";

const SESSIONS_DIR = join(homedir(), ".openaether", "sessions");

export interface SessionMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  provider: string;
  model: string;
}

export interface SessionData {
  meta: SessionMeta;
  messages: Message[];
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").toLowerCase() || "session";
}

function getSessionPath(name: string): string {
  return join(SESSIONS_DIR, `${sanitizeName(name)}.json`);
}

/**
 * Ensure the sessions directory exists.
 */
async function ensureDir(): Promise<void> {
  if (!existsSync(SESSIONS_DIR)) {
    await mkdir(SESSIONS_DIR, { recursive: true });
  }
}

/**
 * Save a session to disk.
 */
export async function saveSession(data: SessionData): Promise<void> {
  await ensureDir();
  const path = getSessionPath(data.meta.name);
  data.meta.updatedAt = new Date().toISOString();
  await writeFile(path, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Load a session from disk by name.
 */
export async function loadSession(name: string): Promise<SessionData | null> {
  await ensureDir();
  const path = getSessionPath(name);

  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

/**
 * List all saved sessions (metadata only, not full messages).
 */
export async function listSessions(): Promise<SessionMeta[]> {
  await ensureDir();

  try {
    const files = await readdir(SESSIONS_DIR);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    const sessions: SessionMeta[] = [];

    for (const file of jsonFiles) {
      try {
        const raw = await readFile(join(SESSIONS_DIR, file), "utf-8");
        const data = JSON.parse(raw) as SessionData;
        sessions.push(data.meta);
      } catch {
        // Skip corrupted files
        continue;
      }
    }

    // Sort by updatedAt descending (most recent first)
    sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return sessions;
  } catch {
    return [];
  }
}

/**
 * Delete a session by name.
 */
export async function deleteSession(name: string): Promise<boolean> {
  await ensureDir();
  const path = getSessionPath(name);

  try {
    await unlink(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the file path for a session.
 */
export function getSessionFilePath(name: string): string {
  return getSessionPath(name);
}
