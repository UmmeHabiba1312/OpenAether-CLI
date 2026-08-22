export type ProviderName =
  | "openai"
  | "anthropic"
  | "google"
  | "ollama"
  | "openrouter"
  | "groq"
  | "mistral"
  | "xai"
  | "deepseek"
  | "qwen"
  | "moonshot"
  | "together"
  | "cerebras"
  | "fireworks"
  | "nvidia"
  | "perplexity"
  | "lmstudio"
  | "custom";

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
  openrouter?: string;
  groq?: string;
  mistral?: string;
  xai?: string;
  deepseek?: string;
  qwen?: string;
  moonshot?: string;
  together?: string;
  cerebras?: string;
  fireworks?: string;
  nvidia?: string;
  perplexity?: string;
  /** LM Studio / local OpenAI-compatible endpoint. No real key required. */
  lmstudio?: string;
  /** API key for a custom OpenAI-compatible endpoint. */
  custom?: string;
  /** Base URL for the custom OpenAI-compatible endpoint. */
  customBaseUrl?: string;
  /** Base URL for Ollama (default: http://localhost:11434) */
  ollamaBaseUrl?: string;
}

export interface ProviderSettings {
  /** Which provider is active */
  active: ProviderName;
  /** Model name per provider (e.g. "gpt-4o", "claude-sonnet-4-5", "gemini-2.0-flash", "llama3.2") */
  models: Partial<Record<ProviderName, string>>;
  /** Optional base URL override per OpenAI-compatible provider (e.g. a proxy or self-hosted gateway). */
  baseUrls?: Partial<Record<ProviderName, string>>;
}

export interface MCPServerConfig {
  /** Command to launch the server (e.g. "npx", "node", "python") */
  command: string;
  /** Arguments (e.g. ["-y", "@modelcontextprotocol/server-github"]) */
  args: string[];
  /** Optional environment variables */
  env?: Record<string, string>;
}

/**
 * Tool permission rules. Patterns:
 * - "Tool"            → allow/deny all calls to that tool
 * - "Tool:substring"  → allow/deny when serialized args contain substring
 * - "*"               → every tool
 * Deny always wins over allow. Empty lists → always ask.
 */
export interface PermissionConfig {
  allow?: string[];
  deny?: string[];
}

/**
 * A lifecycle hook: a shell command that runs on an event.
 * `matcher` filters tool hooks (exact tool name, `*`, or `Tool*` prefix).
 */
export interface HookDefinition {
  matcher?: string;
  command: string;
}

/**
 * Lifecycle hooks configuration.
 * - preToolUse:  before a tool runs. Exit 2 → block, exit 0 → allow, else → ask.
 * - postToolUse: after a tool runs. Never blocks.
 * - stop:        once per top-level send, when the conversation turn ends.
 */
export interface HookConfig {
  preToolUse?: HookDefinition[];
  postToolUse?: HookDefinition[];
  stop?: HookDefinition[];
}

export interface OpenAetherConfig {
  /** API keys (stored as plain text — protect this file) */
  apiKeys: ProviderKeys;
  /** Provider and model selection */
  provider: ProviderSettings;
  /** MCP servers to connect to */
  mcpServers?: Record<string, MCPServerConfig>;
  /** Tool permission rules (global default) */
  permissions?: PermissionConfig;
  /** Lifecycle hooks (global default) */
  hooks?: HookConfig;
  /** Auto-compact threshold in estimated tokens (default 60000). */
  compactionThreshold?: number;
  /** Number of recent messages to keep intact during compaction (default 10). */
  keepRecent?: number;
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
      openrouter: "anthropic/claude-sonnet-4-5",
      groq: "llama-3.3-70b-versatile",
      mistral: "mistral-large-latest",
      xai: "grok-2-latest",
      deepseek: "deepseek-chat",
      qwen: "qwen-max",
      moonshot: "kimi-k2-0711-preview",
      together: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      cerebras: "llama-3.3-70b",
      fireworks: "accounts/fireworks/models/llama-v3p3-70b-instruct",
      nvidia: "meta/llama-3.1-8b-instruct",
      perplexity: "sonar",
      lmstudio: "local-model",
      custom: "gpt-4o",
    },
  },
  systemPrompt: "You are OpenAether, an open-source AI coding assistant. Help the user with software engineering tasks. Be concise, thorough, and practical.",
  theme: "dark",
  maxTokens: 4096,
  temperature: 0.7,
};

export const CONFIG_DIR = ".openaether";
export const CONFIG_FILE = "config.json";
