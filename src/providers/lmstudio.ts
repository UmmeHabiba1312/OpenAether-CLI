import { OpenAICompatProvider } from "./openai-compat.js";

/**
 * LM Studio — local desktop app for running open-source models.
 * Runs on http://localhost:1234 by default. No API key required.
 * The model name must match whatever is loaded in the LM Studio UI.
 */
export class LMStudioProvider extends OpenAICompatProvider {
  constructor(apiKey: string = "not-needed", model = "local-model", baseUrl = "http://localhost:1234/v1") {
    super("lmstudio", apiKey, model, baseUrl);
  }
}