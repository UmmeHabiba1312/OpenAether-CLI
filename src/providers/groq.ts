import { OpenAICompatProvider } from "./openai-compat.js";

/**
 * Groq — fast LPU inference. OpenAI-compatible.
 * Default model: llama-3.3-70b-versatile
 */
export class GroqProvider extends OpenAICompatProvider {
  constructor(apiKey: string, model = "llama-3.3-70b-versatile") {
    super("groq", apiKey, model, "https://api.groq.com/openai/v1");
  }
}
