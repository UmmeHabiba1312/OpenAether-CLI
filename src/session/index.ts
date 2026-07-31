import type { Message } from "../providers/interface.js";
import type { OpenAetherConfig } from "../config/types.js";
import {
  type SessionData,
  type SessionMeta,
  saveSession,
  loadSession,
  listSessions,
  deleteSession,
} from "./store.js";

export type { SessionData, SessionMeta };

/**
 * SessionManager — manages the lifecycle of conversation sessions.
 * Handles auto-save, current-session tracking, and CRUD operations.
 */
export class SessionManager {
  private config: OpenAetherConfig;
  private currentSession: SessionData | null = null;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor(config: OpenAetherConfig) {
    this.config = config;
  }

  /**
   * Get the current session data.
   */
  getCurrent(): SessionData | null {
    return this.currentSession;
  }

  /**
   * Get messages from the current session (or empty array).
   */
  getMessages(): Message[] {
    return this.currentSession?.messages ?? [];
  }

  /**
   * Set messages on the current session.
   */
  setMessages(messages: Message[]): void {
    if (this.currentSession) {
      this.currentSession.messages = messages;
      this.currentSession.meta.messageCount = messages.length;
      this.dirty = true;
      this.scheduleSave();
    }
  }

  /**
   * Append a message to the current session (auto-creates one if needed).
   */
  appendMessage(message: Message): void {
    if (!this.currentSession) {
      this.create("default");
    }

    if (this.currentSession) {
      this.currentSession.messages.push(message);
      this.currentSession.meta.messageCount = this.currentSession.messages.length;
      this.dirty = true;
      this.scheduleSave();
    }
  }

  /**
   * Create a new session.
   */
  create(name: string): SessionData {
    const now = new Date().toISOString();
    this.currentSession = {
      meta: {
        id: `session_${Date.now()}`,
        name,
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
        provider: this.config.provider.active,
        model: this.config.provider.models[this.config.provider.active] || "unknown",
      },
      messages: [],
    };

    return this.currentSession;
  }

  /**
   * Load a session by name.
   */
  async load(name: string): Promise<SessionData | null> {
    const data = await loadSession(name);
    if (data) {
      this.currentSession = data;
    }
    return data;
  }

  /**
   * Save the current session immediately.
   */
  async save(): Promise<void> {
    if (!this.currentSession) return;

    this.currentSession.meta.provider = this.config.provider.active;
    this.currentSession.meta.model = this.config.provider.models[this.config.provider.active] || "unknown";

    await saveSession(this.currentSession);
    this.dirty = false;
  }

  /**
   * List all saved sessions.
   */
  async list(): Promise<SessionMeta[]> {
    return listSessions();
  }

  /**
   * Delete a session by name.
   */
  async delete(name: string): Promise<boolean> {
    return deleteSession(name);
  }

  /**
   * Schedule an auto-save with debouncing (2 seconds).
   */
  private scheduleSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      if (this.dirty) {
        this.save().catch(() => {});
      }
    }, 2000);
  }

  /**
   * Flush any pending save immediately.
   */
  async flush(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    if (this.dirty) {
      await this.save();
    }
  }
}
