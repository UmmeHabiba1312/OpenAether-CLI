#!/usr/bin/env node

import chalk from "chalk";

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
  console.log("  OPENAI_API_KEY          " + chalk.dim("OpenAI API key"));
  console.log("  ANTHROPIC_API_KEY       " + chalk.dim("Anthropic API key"));
  console.log("  GOOGLE_API_KEY          " + chalk.dim("Google Gemini API key"));

  console.log(chalk.dim("\nVersion 0.1.0"));
}

function showVersion(): void {
  console.log("OpenAether v0.1.0");
}

// CLI entry
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  showHelp();
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  showVersion();
  process.exit(0);
}

// Default: show banner
console.log(BANNER);
console.log(chalk.dim("Starting OpenAether..."));
console.log(chalk.green("✓ Initialized"));
console.log(chalk.yellow("\nOpenAether is ready!"));
console.log(chalk.dim("Type /help for available commands, /exit to quit."));
console.log(chalk.dim("\nNote: Interactive REPL coming in the next phase.\n"));
