import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { MCPServerConfig } from "../config/types.js";
import { ToolRegistry, type RegisteredTool } from "../tools/registry.js";

interface MCPConnection {
  serverName: string;
  client: Client;
  tools: RegisteredTool[];
}

/**
 * MCPManager — connects to Model Context Protocol servers and exposes
 * their tools through the ToolRegistry, so the LLM can call them.
 *
 * MCP servers are stdio subprocesses (e.g. `npx -y @modelcontextprotocol/server-github`).
 * Their tools are registered into the registry with a handler that routes
 * calls back to the MCP server.
 */
export class MCPManager {
  private connections: MCPConnection[] = [];

  /**
   * Connect to all configured MCP servers and register their tools.
   * Returns the number of tools added.
   */
  async connectAll(
    servers: Record<string, MCPServerConfig> | undefined,
    registry: ToolRegistry,
  ): Promise<number> {
    if (!servers) return 0;

    let total = 0;
    for (const [name, config] of Object.entries(servers)) {
      try {
        const added = await this.connectOne(name, config, registry);
        total += added;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ${this.warn} MCP server "${name}" failed: ${msg}`);
      }
    }
    return total;
  }

  private get warn(): string {
    return "⚠";
  }

  /**
   * Connect to a single MCP server and register its tools.
   */
  private async connectOne(
    serverName: string,
    config: MCPServerConfig,
    registry: ToolRegistry,
  ): Promise<number> {
    const client = new Client({ name: "openaether", version: "0.1.0" });
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env,
    });

    await client.connect(transport);

    const toolsResult = await client.listTools();
    const tools: RegisteredTool[] = [];

    for (const tool of toolsResult.tools) {
      // Namespace tools by server to avoid collisions
      const toolName = `${serverName}_${tool.name}`;

      const registered: RegisteredTool = {
        name: toolName,
        description: `[${serverName}] ${tool.description || tool.name}`,
        inputSchema: (tool.inputSchema as Record<string, unknown>) || { type: "object" },
        handler: async (args) => {
          const result = await client.callTool({
            name: tool.name,
            arguments: args,
          }) as unknown as {
            content?: Array<{ type: string; text?: string }>;
            isError?: boolean;
          };
          return {
            content: this.formatToolResult(result),
            isError: result.isError ? true : undefined,
          };
        },
      };

      tools.push(registered);
      registry.register(registered);
    }

    this.connections.push({ serverName, client, tools });
    return tools.length;
  }

  /**
   * Format an MCP tool result into a string for the model.
   */
  private formatToolResult(result: {
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  }): string {
    if (!result.content) return "No result";

    return result.content
      .map((block) => (block.type === "text" ? block.text || "" : JSON.stringify(block)))
      .filter(Boolean)
      .join("\n");
  }

  /**
   * Disconnect all MCP servers (clean shutdown).
   */
  async disconnectAll(): Promise<void> {
    for (const conn of this.connections) {
      try {
        await conn.client.close();
      } catch {
        // ignore close errors
      }
    }
    this.connections = [];
  }

  getConnectionCount(): number {
    return this.connections.length;
  }
}
