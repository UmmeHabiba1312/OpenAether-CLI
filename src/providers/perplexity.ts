import { OpenAICompatProvider } from "./openai-compat.js";

/**
 * Perplexity — search-augmented LLMs. OpenAI-compatible.
 */
export class PerplexityProvider extends OpenAICompatProvider {
  constructor(apiKey: string, model = "sonar", baseUrl?: string) {
    super("perplexity", apiKey, model, baseUrl || "https://api.perplexity.ai");
  }
}