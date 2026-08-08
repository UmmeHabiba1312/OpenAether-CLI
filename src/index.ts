#!/usr/bin/env node

import chalk from "chalk";
import { loadConfig, getActiveModel, getActiveApiKey } from "./config/index.js";
import { createProvider } from "./providers/registry.js";
import { ToolRegistry } from "./tools/registry.js";
import { readDefinition, readTool } from "./tools/read.js";
import { writeDefinition, writeTool } from "./tools/write.js";
import { editDefinition, editTool } from "./tools/edit.js";
import { bashDefinition, bashTool } from "./tools/bash.js";
import { globDefinition, globTool } from "./tools/glob.js";
import { ConversationOrchestrator } from "./orchestrator/conversation.js";
import { REPL } from "./cli.js";

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
  console.log("  openaether --help       " + chalk.dim("Show this help message"));
  console.log("  openaether --version    " + chalk.dim("Show version"));

  console.log(chalk.bold("\nCommands (inside REPL):"));
  console.log("  /help       " + chalk.dim("Show available commands"));
  console.log("  /model      " + chalk.dim("Switch AI model"));
  console.log("  /config     " + chalk.dim("View or change configuration"));
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
}

// ─── CLI entry ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  showHelp();
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  showVersion();
  process.exit(0);
}

// Default mode: load config, build provider, register tools, start REPL
async function main(): Promise<void> {
  console.log(BANNER);
  console.log(chalk.dim("Starting OpenAether..."));

  const config = await loadConfig();

  console.log(chalk.green("✓ Configuration loaded"));
  console.log(`  Provider: ${chalk.cyan(config.provider.active)}`);
  console.log(`  Model:    ${chalk.cyan(getActiveModel(config))}`);

  const key = getActiveApiKey(config);

  // Register tools
  const toolRegistry = new ToolRegistry();
  registerTools(toolRegistry);
  console.log(chalk.green(`✓ ${toolRegistry.getAll().length} tools registered`));

  // Create provider
  const provider = createProvider(config);
  const missingKey = !key && config.provider.active !== "ollama";
  if (missingKey) {
    console.log(`  API Key:  ${chalk.red("✗ not set")}`);
    console.log(chalk.dim("  Set the API key env var or edit ~/.openaether/config.json"));
    console.log(chalk.dim("  AI features won't work until configured.\n"));
  } else if (config.provider.active !== "ollama") {
    console.log(`  API Key:  ${chalk.green("✓ configured")}`);
  } else {
    console.log(`  API Key:  ${chalk.dim("(not needed for Ollama)")}`);
  }

  console.log(chalk.yellow("\nOpenAether is ready!"));
  console.log(chalk.dim("Type /help for available commands, /exit to quit.\n"));

  // Build orchestrator and start REPL
  const orchestrator = new ConversationOrchestrator(provider, toolRegistry, config);

  const repl = new REPL(config, orchestrator);
  repl.start();
}

main().catch((err) => {
  console.error(chalk.red("Error:"), err);
  process.exit(1);
});
