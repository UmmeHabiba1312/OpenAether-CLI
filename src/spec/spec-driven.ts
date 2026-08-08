import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { LLMProvider, Message } from "../providers/interface.js";
import type { OpenAetherConfig } from "../config/types.js";
import { ToolRegistry } from "../tools/registry.js";
import { ConversationOrchestrator } from "../orchestrator/conversation.js";

export interface SpecResult {
  spec: string;
  plan: string;
  specPath: string;
  planPath: string;
}

const SPEC_PROMPT = `You are a software architect following spec-driven development.
Write a clear, concise SPECIFICATION (SPEC) for the following request.

Use this exact structure:
# SPECIFICATION
## Overview — 1-2 sentences on what this builds and why.
## Goals — bullet list of measurable outcomes.
## Non-Goals — what is explicitly out of scope.
## Requirements — numbered functional requirements (must be testable).
## Technical Approach — languages, frameworks, data flow, key files.
## Risks & Open Questions — anything uncertain.

Be specific and implementation-ready. Avoid vagueness.`;

const PLAN_PROMPT = `You are an implementation planner. Based on the SPECIFICATION provided, create a detailed IMPLEMENTATION PLAN.

Use this exact structure:
# IMPLEMENTATION PLAN
## Steps — numbered, each with:
  - Title
  - Concrete action (what files to create/edit, what to implement)
  - Dependencies (which earlier steps it depends on)
## Verification — how to test that the implementation is complete and correct.
## Rollback — what to do if a step fails.

Order steps so each can be built and tested incrementally.`;

/**
 * SpecDrivenDev — implements the spec-driven development workflow:
 *   write spec → create plan → (implement step-by-step).
 */
export class SpecDrivenDev {
  private provider: LLMProvider;
  private config: OpenAetherConfig;
  private toolRegistry: ToolRegistry;
  private specDir: string;

  constructor(provider: LLMProvider, toolRegistry: ToolRegistry, config: OpenAetherConfig) {
    this.provider = provider;
    this.toolRegistry = toolRegistry;
    this.config = config;
    this.specDir = resolve(process.cwd(), ".specs");
  }

  /**
   * Write a specification from a user request.
   */
  async writeSpec(description: string, onStream: (chunk: unknown) => void): Promise<string> {
    const orchestrator = new ConversationOrchestrator(this.provider, this.toolRegistry, {
      ...this.config,
      systemPrompt: SPEC_PROMPT,
    });

    return orchestrator.sendMessage(description, onStream as never);
  }

  /**
   * Create an implementation plan from a spec.
   */
  async createPlan(spec: string, onStream: (chunk: unknown) => void): Promise<string> {
    const orchestrator = new ConversationOrchestrator(this.provider, this.toolRegistry, {
      ...this.config,
      systemPrompt: PLAN_PROMPT,
    });

    return orchestrator.sendMessage(spec, onStream as never);
  }

  /**
   * Save spec and plan to the .specs/ directory.
   */
  async save(spec: string, plan: string, slug: string): Promise<{ specPath: string; planPath: string }> {
    await mkdir(this.specDir, { recursive: true });
    const safeSlug = slug.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase() || "spec";
    const specPath = resolve(this.specDir, `${safeSlug}-spec.md`);
    const planPath = resolve(this.specDir, `${safeSlug}-plan.md`);

    await writeFile(specPath, spec, "utf-8");
    await writeFile(planPath, plan, "utf-8");

    return { specPath, planPath };
  }

  getSpecDir(): string {
    return this.specDir;
  }
}
