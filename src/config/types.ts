export type ProviderName = "openai" | "anthropic" | "google" | "ollama";

// ─── Tool Types ─────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolResult {
  content: string;
  isError?: boolean;
}

export type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<ToolResult>;

export interface ProviderKeys {
  openai?: string;
  anthropic?: string;
  google?: string;
  /** Base URL for Ollama (default: http://localhost:11434) */
  ollamaBaseUrl?: string;
}

export interface ProviderSettings {
  /** Which provider is active */
  active: ProviderName;
  /** Model name per provider (e.g. "gpt-4o", "claude-sonnet-4-20250514", "gemini-2.0-flash", "llama3.2") */
  models: Partial<Record<ProviderName, string>>;
}

export interface OpenAetherConfig {
  /** API keys (stored as plain text — protect this file) */
  apiKeys: ProviderKeys;
  /** Provider and model selection */
  provider: ProviderSettings;
  /** Custom system prompt (optional) */
  systemPrompt?: string;
  /** UI theme */
  theme: "dark" | "light";
  /** Last-used session path */
  lastSession?: string;
  /** Max tokens per response */
  maxTokens?: number;
  /** Model temperature */
  temperature?: number;
}

export const DEFAULT_CONFIG: OpenAetherConfig = {
  apiKeys: {},
  provider: {
    active: "anthropic",
    models: {
      openai: "gpt-4o",
      anthropic: "claude-sonnet-4-5",
      google: "gemini-2.0-flash",
      ollama: "llama3.2",
    },
  },
  systemPrompt: "You are OpenAether, an open-source AI coding assistant. Help the user with software engineering tasks. Be concise, thorough, and practical.",
  theme: "dark",
  maxTokens: 4096,
  temperature: 0.7,
};

export const CONFIG_DIR = ".openaether";
export const CONFIG_FILE = "config.json";
