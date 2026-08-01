import type { OpenAetherConfig } from "../config/types.js";
import { LLMProvider, type StreamChunk } from "./interface.js";
import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { GoogleProvider } from "./google.js";
import { OllamaProvider } from "./ollama.js";

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

    default:
      return new NullProvider(`Unknown provider: ${provider}`);
  }
}

/**
 * Get a user-friendly error message when a provider can't be created.
 */
export function providerMissingKeyMessage(provider: string): string {
  switch (provider) {
    case "openai":
      return "OpenAI API key is not set. Set OPENAI_API_KEY env var or run /config to set it.";
    case "anthropic":
      return "Anthropic API key is not set. Set ANTHROPIC_API_KEY env var or run /config to set it.";
    case "google":
      return "Google API key is not set. Set GOOGLE_API_KEY env var or run /config to set it.";
    case "ollama":
      return "Could not connect to Ollama. Make sure it's running at http://localhost:11434";
    default:
      return `Unknown provider: ${provider}`;
  }
}
