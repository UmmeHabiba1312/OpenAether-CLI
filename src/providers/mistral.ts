import { OpenAICompatProvider } from "./openai-compat.js";

/**
 * Mistral — Mistral Large/Medium/Small. OpenAI-compatible.
 */
export class MistralProvider extends OpenAICompatProvider {
  constructor(apiKey: string, model = "mistral-large-latest", baseUrl?: string) {
    super("mistral", apiKey, model, baseUrl || "https://api.mistral.ai/v1");
  }
}