import { OpenAICompatProvider } from "./openai-compat.js";

/**
 * NVIDIA NIM — NVIDIA-hosted inference microservices. OpenAI-compatible.
 */
export class NvidiaProvider extends OpenAICompatProvider {
  constructor(apiKey: string, model = "meta/llama-3.1-8b-instruct", baseUrl?: string) {
    super("nvidia", apiKey, model, baseUrl || "https://integrate.api.nvidia.com/v1");
  }
}