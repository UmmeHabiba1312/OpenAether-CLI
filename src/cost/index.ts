export interface CostRecord {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface CostSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCost: number; // USD
  calls: number;
  byModel: Map<string, CostRecord>;
}

/**
 * Pricing in USD per 1M tokens: { input, output }.
 * Approximate public prices; used only for estimation.
 */
const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4": { input: 30, output: 60 },
  "gpt-3.5": { input: 0.5, output: 1.5 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-sonnet-4": { input: 3, output: 15 },
  "claude-opus-4-5": { input: 15, output: 75 },
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-1.5": { input: 1.25, output: 5 },
  "llama": { input: 0.2, output: 0.2 },
  "mistral": { input: 0.2, output: 0.6 },
  "deepseek": { input: 0.14, output: 0.28 },
  "grok": { input: 3, output: 15 },
  "qwen": { input: 0.4, output: 1.2 },
  "kimi": { input: 0.15, output: 0.6 },
  "openrouter": { input: 1, output: 3 },
};

function priceFor(model: string): { input: number; output: number } {
  const lower = model.toLowerCase();
  for (const [key, price] of Object.entries(PRICING)) {
    if (lower.includes(key)) return price;
  }
  return { input: 1, output: 3 }; // default
}

/** Estimate tokens from text: ~4 chars per token. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * CostTracker — records token usage and estimates cost per session.
 */
export class CostTracker {
  private records: CostRecord[] = [];

  /**
   * Record a single LLM call's token usage.
   */
  addCall(model: string, inputTokens: number, outputTokens: number): void {
    this.records.push({ model, inputTokens, outputTokens });
  }

  /**
   * Get a summary of all usage and estimated cost.
   */
  summary(): CostSummary {
    const byModel = new Map<string, CostRecord>();
    let totalInput = 0;
    let totalOutput = 0;
    let estimatedCost = 0;

    for (const rec of this.records) {
      totalInput += rec.inputTokens;
      totalOutput += rec.outputTokens;

      const existing = byModel.get(rec.model);
      if (existing) {
        existing.inputTokens += rec.inputTokens;
        existing.outputTokens += rec.outputTokens;
      } else {
        byModel.set(rec.model, { ...rec });
      }

      const price = priceFor(rec.model);
      estimatedCost +=
        (rec.inputTokens / 1_000_000) * price.input +
        (rec.outputTokens / 1_000_000) * price.output;
    }

    return {
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      estimatedCost,
      calls: this.records.length,
      byModel,
    };
  }
}
