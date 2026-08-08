import { OpenAICompatProvider } from "./openai-compat.js";

/**
 * Qwen (Alibaba Cloud Model Studio) — qwen-max / qwen-plus. OpenAI-compatible.
 */
export class QwenProvider extends OpenAICompatProvider {
  constructor(apiKey: string, model = "qwen-max") {
    super("qwen", apiKey, model, "https://dashscope.aliyuncs.com/compatible-mode/v1");
  }
}
