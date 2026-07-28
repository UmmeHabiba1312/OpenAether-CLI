import type { ToolDefinition, ToolResult } from "../config/types.js";

export type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<ToolResult>;

export interface RegisteredTool extends ToolDefinition {
  handler: ToolHandler;
}

/**
 * Tool registry — defines, registers, and executes tools.
 */
export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  /**
   * Register a tool with a handler function.
   */
  register(tool: RegisteredTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Get a tool by name.
   */
  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools.
   */
  getAll(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get all tool schemas (for sending to the LLM provider).
   */
  getAllSchemas(): ToolDefinition[] {
    return this.getAll().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  /**
   * Execute a tool by name with the given arguments.
   */
  async execute(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        content: `Error: Unknown tool "${name}"`,
        isError: true,
      };
    }

    try {
      return await tool.handler(args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: `Error executing "${name}": ${message}`,
        isError: true,
      };
    }
  }

  /**
   * Check if a tool is registered.
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }
}
