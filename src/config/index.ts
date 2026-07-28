import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  type OpenAetherConfig,
  type ProviderName,
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
    },
  };

  console.log("\n🔧 OpenAether First-Time Setup");
  console.log("  Config file: " + getConfigPath() + "\n");

  return config;
}

/**
 * Prompt the user (via stdin/stdout) for an API key value.
 * Simple fallback — doesn't use readline to avoid extra deps.
 */
function promptSync(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.once("data", (data) => {
      resolve(data.toString().trim());
    });
  });
}

/**
 * Get the active provider's full model identifier.
 */
export function getActiveModel(config: OpenAetherConfig): string {
  const provider = config.provider.active;
  return config.provider.models[provider] || DEFAULT_CONFIG.provider.models[provider] || "";
}

/**
 * Get the API key for the active provider.
 */
export function getActiveApiKey(config: OpenAetherConfig): string | undefined {
  const provider = config.provider.active;
  switch (provider) {
    case "openai":
      return config.apiKeys.openai || process.env.OPENAI_API_KEY;
    case "anthropic":
      return config.apiKeys.anthropic || process.env.ANTHROPIC_API_KEY;
    case "google":
      return config.apiKeys.google || process.env.GOOGLE_API_KEY;
    case "ollama":
      return undefined; // Ollama doesn't need an API key
  }
}
