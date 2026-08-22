import { OpenAICompatProvider } from "./openai-compat.js";

/**
 * Cerebras — fast inference at scale. OpenAI-compatible.
 */
export class CerebrasProvider extends OpenAICompatProvider {
  constructor(apiKey: string, model = "llama-3.3-70b", baseUrl?: string) {
    super("cerebras", apiKey, model, baseUrl || "https://api.cerebras.ai/v1");
  }
}