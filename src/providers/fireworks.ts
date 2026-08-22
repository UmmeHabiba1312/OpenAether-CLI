import { OpenAICompatProvider } from "./openai-compat.js";

/**
 * Fireworks AI — fast inference for open-source models. OpenAI-compatible.
 */
export class FireworksProvider extends OpenAICompatProvider {
  constructor(apiKey: string, model = "accounts/fireworks/models/llama-v3p3-70b-instruct", baseUrl?: string) {
    super("fireworks", apiKey, model, baseUrl || "https://api.fireworks.ai/inference/v1");
  }
}