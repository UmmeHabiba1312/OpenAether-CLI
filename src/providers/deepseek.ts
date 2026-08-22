import { OpenAICompatProvider } from "./openai-compat.js";

/**
 * DeepSeek — deepseek-chat / deepseek-reasoner. OpenAI-compatible.
 */
export class DeepSeekProvider extends OpenAICompatProvider {
  constructor(apiKey: string, model = "deepseek-chat", baseUrl?: string) {
    super("deepseek", apiKey, model, baseUrl || "https://api.deepseek.com/v1");
  }
}