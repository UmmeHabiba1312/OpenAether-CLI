import type { LLMProvider } from "../providers/interface.js";
import type { OpenAetherConfig } from "../config/types.js";
import { ToolRegistry, type RegisteredTool } from "../tools/registry.js";
import {
  ConversationOrchestrator,
  type ToolApprovalFn,
} from "../orchestrator/conversation.js";
import { BUILT_IN_SUBAGENTS } from "../subagents/index.js";

export interface TaskInfo {
  id: string;
  subagent: string;
  status: "running" | "done" | "error";
  result?: string;
  error?: string;
  startedAt: number;
}

/**
 * TaskManager — runs subagents in the background.
 * The main loop can spawn a task and continue; results are fetched later
 * via the CollectTask tool.
 */
export class TaskManager {
  private provider: LLMProvider;
  private toolRegistry: ToolRegistry;
  private config: OpenAetherConfig;
  private approval: ToolApprovalFn | null;
  private tasks = new Map<string, TaskInfo>();
  private counter = 0;

  constructor(
    provider: LLMProvider,
    toolRegistry: ToolRegistry,
    config: OpenAetherConfig,
    approval: ToolApprovalFn | null = null,
  ) {
    this.provider = provider;
    this.toolRegistry = toolRegistry;
    this.config = config;
    this.approval = approval;
  }

  /**
   * Start a subagent in the background. Returns immediately with a task id.
   */
  start(subagentName: string, task: string): TaskInfo {
    const sub = BUILT_IN_SUBAGENTS.find((s) => s.name === subagentName);
    if (!sub) {
      throw new Error(
        `Unknown subagent "${subagentName}". Available: ${BUILT_IN_SUBAGENTS.map((s) => s.name).join(", ")}`,
      );
    }
    if (!task) throw new Error("task is required");

    const id = `task_${Date.now()}_${++this.counter}`;
    const info: TaskInfo = {
      id,
      subagent: sub.name,
      status: "running",
      startedAt: Date.now(),
    };
    this.tasks.set(id, info);

    // Fresh orchestrator for the subagent — own history, its own system prompt.
    // Background subagents can't prompt the user, so tool approval is decided
    // solely by the injected handler (e.g. permission rules).
    const subOrchestrator = new ConversationOrchestrator(
      this.provider,
      this.toolRegistry,
      { ...this.config, systemPrompt: sub.systemPrompt },
      this.approval ?? undefined,
    );

    // Fire-and-forget: write the result back when it completes
    void subOrchestrator
      .sendMessage(task)
      .then((result) => {
        info.status = "done";
        info.result = result;
      })
      .catch((err: unknown) => {
        info.status = "error";
        info.error = err instanceof Error ? err.message : String(err);
      });

    return info;
  }

  /**
   * Get a task by id.
   */
  get(id: string): TaskInfo | undefined {
    return this.tasks.get(id);
  }

  /**
   * List all tasks (running + finished).
   */
  list(): TaskInfo[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Build the "Task" tool: spawn a background subagent.
   */
  makeTaskTool(): RegisteredTool {
    return {
      name: "Task",
      description:
        "Start a subagent (code-reviewer, researcher, file-editor) running in the BACKGROUND. Returns immediately with a task id. Continue your main work; fetch the result later with CollectTask. Use for long or independent subtasks you don't need to block on.",
      inputSchema: {
        type: "object",
        properties: {
          subagent: {
            type: "string",
            description: `Name of the subagent: ${BUILT_IN_SUBAGENTS.map((s) => s.name).join(", ")}`,
          },
          task: {
            type: "string",
            description: "The task/instructions to delegate to the subagent",
          },
        },
        required: ["subagent", "task"],
      },
      handler: async (args) => {
        const name = args.subagent as string;
        const task = args.task as string;
        try {
          const info = this.start(name, task);
          return {
            content: `Task started: ${info.id} (subagent: ${info.subagent}). Continue your work and use CollectTask with that id to fetch the result.`,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { content: `Error: ${message}`, isError: true };
        }
      },
    };
  }

  /**
   * Build the "CollectTask" tool: fetch a background task's result.
   */
  makeCollectTaskTool(): RegisteredTool {
    return {
      name: "CollectTask",
      description:
        "Fetch the result of a background task started with Task. Returns 'still running' if not done — continue working and check again later.",
      inputSchema: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "The task id returned by Task",
          },
        },
        required: ["taskId"],
      },
      handler: async (args) => {
        const id = args.taskId as string;
        const info = this.get(id);
        if (!info) {
          return { content: `Unknown task id: "${id}". Use Task to start one.`, isError: true };
        }
        if (info.status === "running") {
          return { content: `Task ${id} (${info.subagent}) is still running. Continue your work and check again.` };
        }
        if (info.status === "error") {
          return { content: `Task ${id} (${info.subagent}) failed: ${info.error ?? "unknown error"}`, isError: true };
        }
        return { content: `[${info.subagent} result for ${id}]\n${info.result ?? "(empty)"}` };
      },
    };
  }
}
