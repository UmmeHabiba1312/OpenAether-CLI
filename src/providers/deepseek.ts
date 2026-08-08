import { OpenAICompatProvider } from "./openai-compat.js";

/**
 * DeepSeek — deepseek-chat / deepseek-reasoner. OpenAI-compatible.
 */
export class DeepSeekProvider extends OpenAICompatProvider {
  constructor(apiKey: string, model = "deepseek-chat") {
    super("deepseek", apiKey, model, "https://api.deepseek.com/v1");
  }
}
