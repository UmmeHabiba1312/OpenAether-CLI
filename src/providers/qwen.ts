import { OpenAICompatProvider } from "./openai-compat.js";

/**
 * Qwen (Alibaba Cloud Model Studio) — qwen-max / qwen-plus. OpenAI-compatible.
 */
export class QwenProvider extends OpenAICompatProvider {
  constructor(apiKey: string, model = "qwen-max", baseUrl?: string) {
    super("qwen", apiKey, model, baseUrl || "https://dashscope.aliyuncs.com/compatible-mode/v1");
  }
}