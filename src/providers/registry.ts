import type { OpenAetherConfig, ProviderName, ProviderKeys } from "../config/types.js";
import { LLMProvider, type StreamChunk } from "./interface.js";
import { OpenAICompatProvider } from "./openai-compat.js";
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
import { TogetherProvider } from "./together.js";
import { CerebrasProvider } from "./cerebras.js";
import { FireworksProvider } from "./fireworks.js";
import { NvidiaProvider } from "./nvidia.js";
import { PerplexityProvider } from "./perplexity.js";
import { LMStudioProvider } from "./lmstudio.js";
import { CohereProvider } from "./cohere.js";

/**
 * A provider definition. Adding a new provider = adding one row here plus a
 * small subclass (for OpenAI-compatible APIs) or a full implementation.
 */
interface ProviderDef {
  name: ProviderName;
  label: string;
  /** Environment variable holding the API key (undefined if keyless). */
  envVar?: string;
  requiresKey: boolean;
  /** Build a provider instance for the given config. Key presence is pre-checked. */
  create: (config: OpenAetherConfig) => LLMProvider;
}

/**
 * Helper for OpenAI-compatible providers: reads the API key, model, and an
 * optional base URL override (config.provider.baseUrls[name]) and constructs
 * the provider. `make` is the subclass constructor.
 */
function openaiCompatDef(
  name: ProviderName,
  label: string,
  envVar: string,
  make: (key: string, model: string, baseUrl?: string) => LLMProvider,
): ProviderDef {
  return {
    name,
    label,
    envVar,
    requiresKey: true,
    create: (config) => {
      const key = config.apiKeys[name as keyof ProviderKeys] || process.env[envVar] || "";
      const model = config.provider.models[name] || "";
      const baseUrl = config.provider.baseUrls?.[name];
      return make(key, model, baseUrl);
    },
  };
}

/** All supported providers, in display order. */
const PROVIDER_DEFS: ProviderDef[] = [
  {
    name: "openai",
    label: "OpenAI",
    envVar: "OPENAI_API_KEY",
    requiresKey: true,
    create: (config) => {
      const key = config.apiKeys.openai || process.env.OPENAI_API_KEY || "";
      return new OpenAIProvider(key, config.provider.models.openai || "", config.provider.baseUrls?.openai);
    },
  },
  {
    name: "anthropic",
    label: "Anthropic",
    envVar: "ANTHROPIC_API_KEY",
    requiresKey: true,
    create: (config) => {
      const key = config.apiKeys.anthropic || process.env.ANTHROPIC_API_KEY || "";
      return new AnthropicProvider(key, config.provider.models.anthropic || "");
    },
  },
  {
    name: "google",
    label: "Google Gemini",
    envVar: "GOOGLE_API_KEY",
    requiresKey: true,
    create: (config) => {
      const key = config.apiKeys.google || process.env.GOOGLE_API_KEY || "";
      return new GoogleProvider(key, config.provider.models.google || "");
    },
  },
  {
    name: "ollama",
    label: "Ollama (local)",
    requiresKey: false,
    create: (config) => {
      const baseUrl = config.apiKeys.ollamaBaseUrl || "http://localhost:11434";
      return new OllamaProvider(config.provider.models.ollama || "", baseUrl);
    },
  },
  openaiCompatDef("openrouter", "OpenRouter", "OPENROUTER_API_KEY", (k, m, b) => new OpenRouterProvider(k, m, b)),
  openaiCompatDef("groq", "Groq", "GROQ_API_KEY", (k, m, b) => new GroqProvider(k, m, b)),
  openaiCompatDef("mistral", "Mistral", "MISTRAL_API_KEY", (k, m, b) => new MistralProvider(k, m, b)),
  openaiCompatDef("xai", "xAI (Grok)", "XAI_API_KEY", (k, m, b) => new XaiProvider(k, m, b)),
  openaiCompatDef("deepseek", "DeepSeek", "DEEPSEEK_API_KEY", (k, m, b) => new DeepSeekProvider(k, m, b)),
  openaiCompatDef("qwen", "Qwen", "QWEN_API_KEY", (k, m, b) => new QwenProvider(k, m, b)),
  openaiCompatDef("moonshot", "Moonshot (Kimi)", "MOONSHOT_API_KEY", (k, m, b) => new MoonshotProvider(k, m, b)),
  openaiCompatDef("together", "Together AI", "TOGETHER_API_KEY", (k, m, b) => new TogetherProvider(k, m, b)),
  openaiCompatDef("cerebras", "Cerebras", "CEREBRAS_API_KEY", (k, m, b) => new CerebrasProvider(k, m, b)),
  openaiCompatDef("fireworks", "Fireworks AI", "FIREWORKS_API_KEY", (k, m, b) => new FireworksProvider(k, m, b)),
  openaiCompatDef("nvidia", "NVIDIA NIM", "NVIDIA_API_KEY", (k, m, b) => new NvidiaProvider(k, m, b)),
  openaiCompatDef("perplexity", "Perplexity", "PERPLEXITY_API_KEY", (k, m, b) => new PerplexityProvider(k, m, b)),
  {
    name: "lmstudio",
    label: "LM Studio (local)",
    requiresKey: false,
    create: (config) => {
      const baseUrl = config.provider.baseUrls?.lmstudio || "http://localhost:1234/v1";
      return new LMStudioProvider("not-needed", config.provider.models.lmstudio || "", baseUrl);
    },
  },
  {
    name: "custom",
    label: "Custom OpenAI-compatible",
    envVar: "CUSTOM_API_KEY",
    requiresKey: true,
    create: (config) => {
      const key = config.apiKeys.custom || process.env.CUSTOM_API_KEY || "";
      const baseUrl =
        config.provider.baseUrls?.custom ||
        config.apiKeys.customBaseUrl ||
        "http://localhost:8080/v1";
      const model = config.provider.models.custom || "";
      return new OpenAICompatProvider("custom", key, model, baseUrl);
    },
  },
  {
    name: "cohere",
    label: "Cohere",
    envVar: "COHERE_API_KEY",
    requiresKey: true,
    create: (config) => {
      const key = config.apiKeys.cohere || process.env.COHERE_API_KEY || "";
      return new CohereProvider(key, config.provider.models.cohere || "");
    },
  },
];

/** Providers that need an API key (for /config prompts & validation). */
export const KEY_PROVIDERS: ProviderName[] = PROVIDER_DEFS
  .filter((d) => d.requiresKey)
  .map((d) => d.name);

/** Providers that don't require an API key. */
export const KEYLESS_PROVIDERS: ProviderName[] = PROVIDER_DEFS
  .filter((d) => !d.requiresKey)
  .map((d) => d.name);

/** All provider names. */
export const ALL_PROVIDERS: ProviderName[] = PROVIDER_DEFS.map((d) => d.name);

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

  /** The human-readable reason the provider couldn't be created. */
  getReason(): string {
    return this.reason;
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
  const def = PROVIDER_DEFS.find((d) => d.name === config.provider.active);
  if (!def) {
    return new NullProvider(`Unknown provider: ${config.provider.active}`);
  }

  if (def.requiresKey) {
    const key = config.apiKeys[def.name as keyof ProviderKeys];
    const envKey = def.envVar ? process.env[def.envVar] : undefined;
    if (!key && !envKey) {
      return new NullProvider(providerMissingKeyMessage(def.name));
    }
  }

  return def.create(config);
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

export function getEnvVar(provider: string): string | null {
  return PROVIDER_DEFS.find((d) => d.name === provider)?.envVar ?? null;
}

export function providerLabel(provider: string): string {
  return PROVIDER_DEFS.find((d) => d.name === provider)?.label ?? provider;
}
