import { OpenAICompatProvider } from "./openai-compat.js";

/**
 * OpenRouter — gateway to 300+ models (Claude, GPT, Gemini, Llama, etc.)
 * from a single API key. Model format: "provider/model" e.g. "anthropic/claude-sonnet-4-5".
 */
export class OpenRouterProvider extends OpenAICompatProvider {
  constructor(apiKey: string, model = "anthropic/claude-sonnet-4-5", baseUrl?: string) {
    super("openrouter", apiKey, model, baseUrl || "https://openrouter.ai/api/v1");
  }
}