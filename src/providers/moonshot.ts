import { OpenAICompatProvider } from "./openai-compat.js";

/**
 * Moonshot AI — Kimi models (incl. Kimi Coding). OpenAI-compatible.
 */
export class MoonshotProvider extends OpenAICompatProvider {
  constructor(apiKey: string, model = "kimi-k2-0711-preview", baseUrl?: string) {
    super("moonshot", apiKey, model, baseUrl || "https://api.moonshot.cn/v1");
  }
}