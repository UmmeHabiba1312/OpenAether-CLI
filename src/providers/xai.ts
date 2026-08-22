import { OpenAICompatProvider } from "./openai-compat.js";

/**
 * xAI — Grok models. OpenAI-compatible.
 */
export class XaiProvider extends OpenAICompatProvider {
  constructor(apiKey: string, model = "grok-2-latest", baseUrl?: string) {
    super("xai", apiKey, model, baseUrl || "https://api.x.ai/v1");
  }
}