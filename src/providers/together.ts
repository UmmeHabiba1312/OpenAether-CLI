import { OpenAICompatProvider } from "./openai-compat.js";

/**
 * Together AI — 200+ open-source models. OpenAI-compatible.
 */
export class TogetherProvider extends OpenAICompatProvider {
  constructor(apiKey: string, model = "meta-llama/Llama-3.3-70B-Instruct-Turbo", baseUrl?: string) {
    super("together", apiKey, model, baseUrl || "https://api.together.xyz/v1");
  }
}