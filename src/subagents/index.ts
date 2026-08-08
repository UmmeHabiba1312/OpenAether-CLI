import type { LLMProvider } from "../providers/interface.js";
import type { OpenAetherConfig } from "../config/types.js";
import { ToolRegistry, type RegisteredTool } from "../tools/registry.js";
import { ConversationOrchestrator } from "../orchestrator/conversation.js";

export interface SubagentDef {
  name: string;
  description: string;
  systemPrompt: string;
}

/** Built-in subagents the main agent can delegate to. */
export const BUILT_IN_SUBAGENTS: SubagentDef[] = [
  {
    name: "code-reviewer",
    description: "Reviews code for bugs, security issues, and improvements.",
    systemPrompt:
      "You are a meticulous code reviewer. Analyze code carefully, report bugs, security vulnerabilities, and improvements most-severe-first with file:line references and concrete fixes. Be honest and do not invent issues.",
  },
  {
    name: "researcher",
    description: "Searches the codebase to answer questions and gather facts.",
    systemPrompt:
      "You are a research agent. Use Read, Glob, and Bash tools to investigate the codebase and answer the user's question with evidence. Cite file:line references. Report concisely.",
  },
  {
    name: "file-editor",
    description: "Makes focused file edits with care.",
    systemPrompt:
      "You are a careful file editor. Use Read before editing, then Edit/Write to make changes. Preserve surrounding code style. Verify your changes by re-reading. Report what you changed.",
  },
];

/**
 * Build a "SpawnSubagent" tool that delegates a task to a specialized subagent.
 * The handler creates a fresh orchestrator with the subagent's system prompt.
 */
export function makeSpawnSubagentTool(
  provider: LLMProvider,
  toolRegistry: ToolRegistry,
  config: OpenAetherConfig,
  subagents: SubagentDef[] = BUILT_IN_SUBAGENTS,
): RegisteredTool {
  return {
    name: "SpawnSubagent",
    description:
      "Delegate a focused task to a specialized subagent (code-reviewer, researcher, file-editor). Use this for long or independent subtasks. Returns the subagent's final report.",
    inputSchema: {
      type: "object",
      properties: {
        subagent: {
          type: "string",
          description: `Name of the subagent: ${subagents.map((s) => s.name).join(", ")}`,
        },
        task: {
          type: "string",
          description: "The task/instructions to delegate to the subagent",
        },
      },
      required: ["subagent", "task"],
    },
    handler: async (args: Record<string, unknown>) => {
      const name = args.subagent as string;
      const task = args.task as string;
      const sub = subagents.find((s) => s.name === name);

      if (!sub) {
        return {
          content: `Unknown subagent "${name}". Available: ${subagents.map((s) => s.name).join(", ")}`,
          isError: true,
        };
      }
      if (!task) {
        return { content: "Error: 'task' is required", isError: true };
      }

      // Fresh orchestrator with the subagent's system prompt, sharing tools
      const subOrchestrator = new ConversationOrchestrator(provider, toolRegistry, {
        ...config,
        systemPrompt: sub.systemPrompt,
      });

      const result = await subOrchestrator.sendMessage(task);

      return {
        content: `[${sub.name} result]\n${result}`,
      };
    },
  };
}

