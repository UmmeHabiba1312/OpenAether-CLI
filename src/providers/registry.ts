import type { OpenAetherConfig, ProviderName } from "../config/types.js";
import { LLMProvider, type StreamChunk } from "./interface.js";
import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { GoogleProvider } from "./google.js";
import { OllamaProvider } from "./ollama.js";
import { OpenRouterProvider } from "./openrouter.js";
import { GroqProvider } from "./groq.js";
import { MistralProvider } from "./mistral.js";
import { XaiProvider } from "./xai.js";
import { DeepSeekProvider } from "./deepseek.js";
import { QwenProvider } from "./qwen.js";
import { MoonshotProvider } from "./moonshot.js";

/** All providers that need an API key (for /config prompts & validation). */
export const KEY_PROVIDERS: ProviderName[] = [
  "openai",
  "anthropic",
  "google",
  "openrouter",
  "groq",
  "mistral",
  "xai",
  "deepseek",
  "qwen",
  "moonshot",
];

/** Providers that don't require an API key. */
export const KEYLESS_PROVIDERS: ProviderName[] = ["ollama"];

/**
 * Stub provider used when no real provider can be created (missing API key).
 * Returns a helpful error message instead of crashing.
 */
export class NullProvider extends LLMProvider {
  readonly name = "none";
  private reason: string;

  constructor(reason: string) {
    super();
    this.reason = reason;
  }

  getModelName(): string {
    return "none";
  }

  countTokens(): number {
    return 0;
  }

  normalizeMessages(): unknown {
    return [];
  }

  async *chat(): AsyncGenerator<StreamChunk> {
    yield { type: "error", message: this.reason };
    yield { type: "done" };
  }
}

/**
 * Create a provider instance based on the active config.
 * Returns a NullProvider if the required API key is missing.
 */
export function createProvider(config: OpenAetherConfig): LLMProvider {
  const provider = config.provider.active;
  const model = config.provider.models[provider] || "";

  switch (provider) {
    case "openai": {
      const key = config.apiKeys.openai;
      if (!key) return new NullProvider(providerMissingKeyMessage(provider));
      return new OpenAIProvider(key, model);
    }

    case "anthropic": {
      const key = config.apiKeys.anthropic;
      if (!key) return new NullProvider(providerMissingKeyMessage(provider));
      return new AnthropicProvider(key, model);
    }

    case "google": {
      const key = config.apiKeys.google;
      if (!key) return new NullProvider(providerMissingKeyMessage(provider));
      return new GoogleProvider(key, model);
    }

    case "ollama": {
      const baseUrl = config.apiKeys.ollamaBaseUrl || "http://localhost:11434";
      return new OllamaProvider(model, baseUrl);
    }

    case "openrouter": {
      const key = config.apiKeys.openrouter;
      if (!key) return new NullProvider(providerMissingKeyMessage(provider));
      return new OpenRouterProvider(key, model);
    }

    case "groq": {
      const key = config.apiKeys.groq;
      if (!key) return new NullProvider(providerMissingKeyMessage(provider));
      return new GroqProvider(key, model);
    }

    case "mistral": {
      const key = config.apiKeys.mistral;
      if (!key) return new NullProvider(providerMissingKeyMessage(provider));
      return new MistralProvider(key, model);
    }

    case "xai": {
      const key = config.apiKeys.xai;
      if (!key) return new NullProvider(providerMissingKeyMessage(provider));
      return new XaiProvider(key, model);
    }

    case "deepseek": {
      const key = config.apiKeys.deepseek;
      if (!key) return new NullProvider(providerMissingKeyMessage(provider));
      return new DeepSeekProvider(key, model);
    }

    case "qwen": {
      const key = config.apiKeys.qwen;
      if (!key) return new NullProvider(providerMissingKeyMessage(provider));
      return new QwenProvider(key, model);
    }

    case "moonshot": {
      const key = config.apiKeys.moonshot;
      if (!key) return new NullProvider(providerMissingKeyMessage(provider));
      return new MoonshotProvider(key, model);
    }

    default:
      return new NullProvider(`Unknown provider: ${provider}`);
  }
}

/**
 * Get a user-friendly error message when a provider can't be created.
 */
export function providerMissingKeyMessage(provider: string): string {
  const envVar = getEnvVar(provider);
  const hint = envVar
    ? `Set ${envVar} env var or run /config key ${provider} to set it.`
    : `Run /config key ${provider} to set it.`;
  return `${providerLabel(provider)} API key is not set. ${hint}`;
}

function getEnvVar(provider: string): string | null {
  const map: Record<string, string> = {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    google: "GOOGLE_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    groq: "GROQ_API_KEY",
    mistral: "MISTRAL_API_KEY",
    xai: "XAI_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    qwen: "QWEN_API_KEY",
    moonshot: "MOONSHOT_API_KEY",
  };
  return map[provider] ?? null;
}

function providerLabel(provider: string): string {
  const map: Record<string, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    google: "Google Gemini",
    openrouter: "OpenRouter",
    groq: "Groq",
    mistral: "Mistral",
    xai: "xAI (Grok)",
    deepseek: "DeepSeek",
    qwen: "Qwen",
    moonshot: "Moonshot (Kimi)",
  };
  return map[provider] ?? provider;
}
