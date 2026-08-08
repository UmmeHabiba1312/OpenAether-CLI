import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  type OpenAetherConfig,
  type ProviderName,
  type ProviderKeys,
  DEFAULT_CONFIG,
  CONFIG_DIR,
  CONFIG_FILE,
} from "./types.js";

export { type OpenAetherConfig, type ProviderName, DEFAULT_CONFIG };

function getConfigPath(): string {
  return join(homedir(), CONFIG_DIR, CONFIG_FILE);
}

function getConfigDir(): string {
  return join(homedir(), CONFIG_DIR);
}

/**
 * Load configuration from ~/.openaether/config.json.
 * If the file doesn't exist, create it with defaults and return defaults.
 */
export async function loadConfig(): Promise<OpenAetherConfig> {
  const configPath = getConfigPath();

  try {
    const raw = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<OpenAetherConfig>;

    // Merge with defaults so new fields are always present
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      apiKeys: { ...DEFAULT_CONFIG.apiKeys, ...parsed.apiKeys },
      provider: {
        ...DEFAULT_CONFIG.provider,
        ...parsed.provider,
        models: {
          ...DEFAULT_CONFIG.provider.models,
          ...parsed.provider?.models,
        },
      },
    };
  } catch {
    // Config doesn't exist or is invalid — create with defaults + env vars
    const config = await firstRunSetup();
    await saveConfig(config);
    return config;
  }
}

/**
 * Save configuration to ~/.openaether/config.json.
 */
export async function saveConfig(config: OpenAetherConfig): Promise<void> {
  const configDir = getConfigDir();
  const configPath = getConfigPath();

  if (!existsSync(configDir)) {
    await mkdir(configDir, { recursive: true });
  }

  await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * First-run setup: merge defaults with environment variables,
 * then prompt the user for missing API keys.
 */
async function firstRunSetup(): Promise<OpenAetherConfig> {
  const config: OpenAetherConfig = {
    ...DEFAULT_CONFIG,
    apiKeys: {
      openai: process.env.OPENAI_API_KEY || undefined,
      anthropic: process.env.ANTHROPIC_API_KEY || undefined,
      google: process.env.GOOGLE_API_KEY || undefined,
      openrouter: process.env.OPENROUTER_API_KEY || undefined,
      groq: process.env.GROQ_API_KEY || undefined,
      mistral: process.env.MISTRAL_API_KEY || undefined,
      xai: process.env.XAI_API_KEY || undefined,
      deepseek: process.env.DEEPSEEK_API_KEY || undefined,
      qwen: process.env.QWEN_API_KEY || undefined,
      moonshot: process.env.MOONSHOT_API_KEY || undefined,
    },
  };

  return config;
}

/**
 * Get the active provider's full model identifier.
 */
export function getActiveModel(config: OpenAetherConfig): string {
  const provider = config.provider.active;
  return config.provider.models[provider] || DEFAULT_CONFIG.provider.models[provider] || "";
}

/**
 * Map of provider → (config key field, env var name).
 */
const API_KEY_MAP: Record<string, { field: keyof ProviderKeys; env: string }> = {
  openai: { field: "openai", env: "OPENAI_API_KEY" },
  anthropic: { field: "anthropic", env: "ANTHROPIC_API_KEY" },
  google: { field: "google", env: "GOOGLE_API_KEY" },
  openrouter: { field: "openrouter", env: "OPENROUTER_API_KEY" },
  groq: { field: "groq", env: "GROQ_API_KEY" },
  mistral: { field: "mistral", env: "MISTRAL_API_KEY" },
  xai: { field: "xai", env: "XAI_API_KEY" },
  deepseek: { field: "deepseek", env: "DEEPSEEK_API_KEY" },
  qwen: { field: "qwen", env: "QWEN_API_KEY" },
  moonshot: { field: "moonshot", env: "MOONSHOT_API_KEY" },
};

/**
 * Get the API key for the active provider.
 */
export function getActiveApiKey(config: OpenAetherConfig): string | undefined {
  const provider = config.provider.active;
  if (provider === "ollama") return undefined; // no key needed

  const entry = API_KEY_MAP[provider];
  if (!entry) return undefined;

  const stored = config.apiKeys[entry.field];
  return stored || process.env[entry.env];
}

/**
 * Set an API key for a provider and persist to disk.
 */
export async function setApiKey(
  config: OpenAetherConfig,
  provider: ProviderName,
  key: string,
): Promise<void> {
  if (provider === "ollama") {
    config.apiKeys.ollamaBaseUrl = key;
  } else {
    const entry = API_KEY_MAP[provider];
    if (entry) {
      config.apiKeys[entry.field] = key;
    }
  }
  await saveConfig(config);
}

/**
 * Switch the active provider and persist to disk.
 */
export async function switchProvider(
  config: OpenAetherConfig,
  provider: ProviderName,
  model?: string,
): Promise<void> {
  config.provider.active = provider;
  if (model) {
    config.provider.models[provider] = model;
  }
  await saveConfig(config);
}

/**
 * Update a model for a provider and persist to disk.
 */
export async function setModel(
  config: OpenAetherConfig,
  provider: ProviderName,
  model: string,
): Promise<void> {
  config.provider.models[provider] = model;
  await saveConfig(config);
}
