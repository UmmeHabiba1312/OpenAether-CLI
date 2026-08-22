#!/usr/bin/env node

import chalk from "chalk";
import { loadConfig, getActiveModel, getActiveApiKey } from "./config/index.js";
import type { OpenAetherConfig } from "./config/types.js";
import { createProvider } from "./providers/registry.js";
import { ToolRegistry } from "./tools/registry.js";
import { readDefinition, readTool } from "./tools/read.js";
import { writeDefinition, writeTool } from "./tools/write.js";
import { editDefinition, editTool } from "./tools/edit.js";
import { bashDefinition, bashTool } from "./tools/bash.js";
import { globDefinition, globTool } from "./tools/glob.js";
import { grepDefinition, grepTool } from "./tools/grep.js";
import { webFetchDefinition, webFetchTool, webSearchDefinition, webSearchTool } from "./tools/web.js";
import { gitStatusDefinition, gitStatusTool, gitCommitDefinition, gitCommitTool } from "./tools/git.js";
import { loadProjectContext } from "./context/index.js";
import { ConversationOrchestrator } from "./orchestrator/conversation.js";
import { MCPManager } from "./mcp/index.js";
import { makeSpawnSubagentTool } from "./subagents/index.js";
import { REPL } from "./cli.js";
import { runPrintMode, type PrintApp } from "./print.js";
import { MemoryManager } from "./memory/index.js";
import { loadPermissions } from "./permissions/index.js";
import { loadHooks, HookRunner } from "./hooks/index.js";
import { TaskManager } from "./tasks/index.js";
import { decide } from "./permissions/index.js";
import type { ToolApprovalFn } from "./orchestrator/conversation.js";

const BANNER = `
  ┌────────────────────────────────────────┐
  │           ${chalk.cyan("OpenAether")}               │
  │  ${chalk.dim("Open-source AI CLI assistant")}   │
  │    ${chalk.dim("Works with any LLM provider")}     │
  └────────────────────────────────────────┘
`;

function showHelp(): void {
  console.log(BANNER);
  console.log(chalk.bold("\nUsage:"));
  console.log("  openaether              " + chalk.dim("Start interactive REPL"));
  console.log("  openaether -p <prompt>  " + chalk.dim("One-shot print mode (non-interactive)"));
  console.log("  openaether --help       " + chalk.dim("Show this help message"));
  console.log("  openaether --version    " + chalk.dim("Show version"));

  console.log(chalk.bold("\nOptions:"));
  console.log("  -p, --print <prompt>      " + chalk.dim("Run one message and print the result (reads stdin if no prompt)"));
  console.log("  --continue, --resume      " + chalk.dim("Resume the most recent session (with -p)"));
  console.log("  --output-format <fmt>     " + chalk.dim("Output format: text (default) or json"));
  console.log("  --dangerously-skip-permissions" + chalk.dim("  Auto-approve all tool calls (print mode only)"));

  console.log(chalk.bold("\nCommands (inside REPL):"));
  console.log("  /help       " + chalk.dim("Show available commands"));
  console.log("  /model      " + chalk.dim("Switch AI model"));
  console.log("  /config     " + chalk.dim("View or change configuration"));
  console.log("  /permissions" + chalk.dim("Show tool permission rules"));
  console.log("  /remember   " + chalk.dim("Save a fact to memory"));
  console.log("  /memory     " + chalk.dim("Show/clear memory"));
  console.log("  /compact    " + chalk.dim("Compress conversation context"));
  console.log("  /tasks      " + chalk.dim("List background subagent tasks"));
  console.log("  /clear      " + chalk.dim("Clear conversation history"));
  console.log("  /exit       " + chalk.dim("Exit OpenAether"));

  console.log(chalk.bold("\nEnvironment Variables:"));
  console.log("  OPENAI_API_KEY          " + chalk.dim("OpenAI"));
  console.log("  ANTHROPIC_API_KEY       " + chalk.dim("Anthropic Claude"));
  console.log("  GOOGLE_API_KEY          " + chalk.dim("Google Gemini"));
  console.log("  OPENROUTER_API_KEY      " + chalk.dim("OpenRouter (300+ models)"));
  console.log("  GROQ_API_KEY            " + chalk.dim("Groq"));
  console.log("  MISTRAL_API_KEY         " + chalk.dim("Mistral"));
  console.log("  XAI_API_KEY             " + chalk.dim("xAI (Grok)"));
  console.log("  DEEPSEEK_API_KEY        " + chalk.dim("DeepSeek"));
  console.log("  QWEN_API_KEY            " + chalk.dim("Qwen"));
  console.log("  MOONSHOT_API_KEY        " + chalk.dim("Moonshot (Kimi)"));
  console.log("  TOGETHER_API_KEY        " + chalk.dim("Together AI"));
  console.log("  CEREBRAS_API_KEY        " + chalk.dim("Cerebras"));
  console.log("  FIREWORKS_API_KEY       " + chalk.dim("Fireworks AI"));
  console.log("  NVIDIA_API_KEY          " + chalk.dim("NVIDIA NIM"));
  console.log("  PERPLEXITY_API_KEY      " + chalk.dim("Perplexity"));
  console.log("  CUSTOM_API_KEY          " + chalk.dim("Custom OpenAI-compatible endpoint"));

  console.log(chalk.dim("\nOpenAether v0.1.0"));
}

function showVersion(): void {
  console.log("OpenAether v0.1.0");
}

/**
 * Register all built-in tools in the tool registry.
 */
function registerTools(registry: ToolRegistry): void {
  registry.register({ ...readDefinition, handler: readTool });
  registry.register({ ...writeDefinition, handler: writeTool });
  registry.register({ ...editDefinition, handler: editTool });
  registry.register({ ...bashDefinition, handler: bashTool });
  registry.register({ ...globDefinition, handler: globTool });
  registry.register({ ...grepDefinition, handler: grepTool });
  registry.register({ ...webFetchDefinition, handler: webFetchTool });
  registry.register({ ...webSearchDefinition, handler: webSearchTool });
  registry.register({ ...gitStatusDefinition, handler: gitStatusTool });
  registry.register({ ...gitCommitDefinition, handler: gitCommitTool });
}

// ─── CLI arg parsing ────────────────────────────────────────────────────────

const args = process.argv.slice(2);

/** Get the value following a flag, or undefined. */
function flagValue(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  const val = args[idx + 1];
  return val && !val.startsWith("-") ? val : undefined;
}

const isPrint = args.includes("-p") || args.includes("--print");
const printFlag = args.includes("-p") ? "-p" : "--print";
const isContinue = args.includes("--continue") || args.includes("--resume");
const outputFormat = flagValue("--output-format") === "json" ? "json" as const : "text" as const;
const skipPermissions = args.includes("--dangerously-skip-permissions");

if (args.includes("--help") || args.includes("-h")) {
  showHelp();
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  showVersion();
  process.exit(0);
}

/**
 * Build a shared app session (tools, MCP, provider, orchestrator, context, memory, permissions).
 * Used by both the interactive REPL and one-shot print mode.
 */
async function buildApp(config: OpenAetherConfig): Promise<PrintApp> {
  // Register tools
  const toolRegistry = new ToolRegistry();
  registerTools(toolRegistry);

  // Create provider
  const provider = createProvider(config);

  // Connect MCP servers (if configured)
  const mcp = new MCPManager();
  await mcp.connectAll(config.mcpServers, toolRegistry);

  // Register the SpawnSubagent tool (needs the provider)
  toolRegistry.register(makeSpawnSubagentTool(provider, toolRegistry, config));

  // Register background Task + CollectTask tools.
  // Background subagents can't prompt the user: allow → run, everything else → denied
  // (unless --dangerously-skip-permissions).
  const taskApproval: ToolApprovalFn = async (toolName, args) =>
    skipPermissions || decide(permissions, toolName, args) === "allow";
  const taskManager = new TaskManager(provider, toolRegistry, config, taskApproval);
  toolRegistry.register(taskManager.makeTaskTool());
  toolRegistry.register(taskManager.makeCollectTaskTool());

  // Build orchestrator and inject project context (CLAUDE.md / git state)
  const orchestrator = new ConversationOrchestrator(provider, toolRegistry, config);
  try {
    const context = await loadProjectContext();
    if (context) {
      orchestrator.setProjectContext(context);
    }
  } catch {
    // ignore context load failures
  }

  // Load user memory (~/.openaether/memory.md) into the system prompt
  const memoryManager = new MemoryManager();
  try {
    const memory = await memoryManager.load();
    if (memory.trim()) {
      orchestrator.setMemory(memory.trim());
    }
  } catch {
    // ignore memory load failures
  }

  // Load permission rules (global + project)
  const permissions = await loadPermissions();

  // Load lifecycle hooks (global + project) and attach to the orchestrator
  const hooks = await loadHooks();
  orchestrator.setHooks(new HookRunner(hooks));

  return { config, provider, toolRegistry, mcp, orchestrator, permissions, taskManager };
}

// ─── CLI entry ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const config = await loadConfig();
  const app = await buildApp(config);
  const { mcp, orchestrator, provider, permissions } = app;

  // One-shot print mode: non-interactive, clean stdout
  if (isPrint) {
    process.on("exit", () => {
      void mcp.disconnectAll();
    });
    await runPrintMode(app, {
      prompt: flagValue(printFlag),
      outputFormat,
      skipPermissions,
      resume: isContinue,
    });
    await mcp.disconnectAll();
    // Natural exit (avoid process.exit() to prevent libuv handle assertion on Windows)
    return;
  }

  // Interactive REPL
  console.log(BANNER);
  console.log(chalk.dim("Starting OpenAether..."));

  console.log(chalk.green("✓ Configuration loaded"));
  console.log(`  Provider: ${chalk.cyan(config.provider.active)}`);
  console.log(`  Model:    ${chalk.cyan(getActiveModel(config))}`);

  const key = getActiveApiKey(config);

  console.log(chalk.green(`✓ ${app.toolRegistry.getAll().length} tools registered`));

  const missingKey = !key && config.provider.active !== "ollama" && config.provider.active !== "lmstudio";
  if (missingKey) {
    console.log(`  API Key:  ${chalk.red("✗ not set")}`);
    console.log(chalk.dim("  Set the API key env var or edit ~/.openaether/config.json"));
    console.log(chalk.dim("  AI features won't work until configured.\n"));
  } else if (config.provider.active !== "ollama" && config.provider.active !== "lmstudio") {
    console.log(`  API Key:  ${chalk.green("✓ configured")}`);
  } else {
    console.log(`  API Key:  ${chalk.dim("(not needed for local providers)")}`);
  }

  if (app.mcp.getConnectionCount() > 0) {
    console.log(chalk.green(`✓ ${app.mcp.getConnectionCount()} MCP server(s) connected`));
  } else if (config.mcpServers && Object.keys(config.mcpServers).length > 0) {
    console.log(chalk.dim("  No MCP tools loaded (servers may have failed)."));
  }

  // Warnings if provider not usable
  if (provider.name === "none") {
    const reason = "getReason" in provider
      ? (provider as unknown as { getReason(): string }).getReason()
      : "Provider not configured";
    console.log(chalk.red(`✗ ${reason}`));
  }

  console.log(chalk.yellow("\nOpenAether is ready!"));
  console.log(chalk.dim("Type /help for available commands, /exit to quit.\n"));

  const repl = new REPL(config, orchestrator, permissions, app.taskManager);
  repl.start();

  // Clean shutdown: disconnect MCP servers
  process.on("exit", () => {
    void mcp.disconnectAll();
  });
}

main().catch((err) => {
  console.error(chalk.red("Error:"), err);
  process.exit(1);
});
