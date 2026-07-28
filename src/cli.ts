import * as readline from "node:readline";
import chalk from "chalk";
import { Spinner } from "./ui/spinner.js";
import { streamResponse, renderMessage, renderToolResult } from "./ui/render.js";
import type { Message, StreamChunk } from "./providers/interface.js";
import type { OpenAetherConfig } from "./config/index.js";
import { ToolRegistry } from "./tools/registry.js";

/**
 * REPL — interactive command-line interface for OpenAether.
 */
export class REPL {
  private rl: readline.Interface;
  private spinner: Spinner;
  private config: OpenAetherConfig;
  private toolRegistry: ToolRegistry;
  private messages: Message[] = [];
  private running = false;

  constructor(config: OpenAetherConfig, toolRegistry: ToolRegistry) {
    this.config = config;
    this.toolRegistry = toolRegistry;
    this.spinner = new Spinner();

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.green("› ") + chalk.dim("openaether") + " ",
      terminal: true,
      historySize: 100,
    });

    this.rl.on("close", () => {
      this.onExit();
    });
  }

  /**
   * Start the REPL loop.
   */
  start(): void {
    this.running = true;

    console.log(chalk.dim("  Interactive mode — type your message or /help for commands\n"));

    this.rl.prompt();

    this.rl.on("line", async (line: string) => {
      const trimmed = line.trim();

      if (!trimmed) {
        this.rl.prompt();
        return;
      }

      // Handle slash commands
      if (trimmed.startsWith("/")) {
        await this.handleCommand(trimmed);
        this.rl.prompt();
        return;
      }

      // Normal message
      await this.handleMessage(trimmed);
      this.rl.prompt();
    });
  }

  /**
   * Stop the REPL loop.
   */
  stop(): void {
    this.running = false;
    this.rl.close();
  }

  /**
   * Send a message and get a response (used by both REPL and programmatic API).
   */
  async handleMessage(input: string): Promise<void> {
    // Add user message to history
    this.messages.push({ role: "user", content: input });
    renderMessage("user", input);

    // TODO: Phase 8 — wire up the provider
    // For now, show a placeholder response
    this.spinner.start("Thinking...");

    // Simulate thinking delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    this.spinner.stop();

    // Placeholder — will be replaced with actual provider call in Phase 8
    const response = `I received your message: "${input}"\n\nFull provider integration coming in Phase 8!`;
    renderMessage("assistant", response);
    this.messages.push({ role: "assistant", content: response });

    // Auto-save messages (session management coming in Phase 7)
  }

  /**
   * Handle a slash command.
   */
  private async handleCommand(input: string): Promise<void> {
    const parts = input.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (command) {
      case "/help":
        this.showHelp();
        break;

      case "/clear":
        this.messages = [];
        console.log(chalk.green("✓ Conversation history cleared."));
        break;

      case "/model":
        this.handleModelCommand(args);
        break;

      case "/config":
        this.showConfig();
        break;

      case "/history":
        this.showHistory();
        break;

      case "/exit":
      case "/quit":
        this.stop();
        break;

      default:
        console.log(chalk.red(`Unknown command: ${command}`));
        console.log(chalk.dim("Type /help for available commands."));
    }
  }

  private showHelp(): void {
    console.log(chalk.bold("\nOpenAether Commands:"));
    console.log("  /help        " + chalk.dim("Show this help message"));
    console.log("  /clear       " + chalk.dim("Clear conversation history"));
    console.log("  /model       " + chalk.dim("Show or switch model"));
    console.log("  /config      " + chalk.dim("Show current configuration"));
    console.log("  /history     " + chalk.dim("Show conversation history count"));
    console.log("  /exit        " + chalk.dim("Exit OpenAether"));

    console.log(chalk.bold("\nHow to use:"));
    console.log("  Type a message and press Enter to chat.");
    console.log("  Use multi-line mode by ending a line with \\ and pressing Enter.");
    console.log("  Press Ctrl+C to cancel, Ctrl+D to exit.\n");
  }

  private handleModelCommand(args: string[]): void {
    if (args.length === 0) {
      console.log(`  Current provider: ${chalk.cyan(this.config.provider.active)}`);
      console.log(`  Current model:    ${chalk.cyan(this.config.provider.models[this.config.provider.active] || "not set")}`);
    } else {
      console.log(chalk.yellow("  Model switching will be available when providers are fully integrated."));
    }
  }

  private showConfig(): void {
    console.log(chalk.bold("\nConfiguration:"));
    console.log(`  Provider:  ${chalk.cyan(this.config.provider.active)}`);
    console.log(`  Model:     ${chalk.cyan(this.config.provider.models[this.config.provider.active] || "not set")}`);
    console.log(`  Theme:     ${chalk.cyan(this.config.theme)}`);
    console.log(`  Messages:  ${this.messages.length} in current session`);

    const hasKey = (provider: string) => {
      const keys = this.config.apiKeys as Record<string, string | undefined>;
      return keys[provider] ? chalk.green("✓ set") : chalk.dim("not set");
    };

    console.log(chalk.bold("\nAPI Keys:"));
    console.log(`  OpenAI:    ${hasKey("openai")}`);
    console.log(`  Anthropic: ${hasKey("anthropic")}`);
    console.log(`  Google:    ${hasKey("google")}`);
    console.log("");
  }

  private showHistory(): void {
    const userCount = this.messages.filter((m) => m.role === "user").length;
    const assistantCount = this.messages.filter((m) => m.role === "assistant").length;
    console.log(`  Total messages: ${this.messages.length}`);
    console.log(`  User messages:  ${userCount}`);
    console.log(`  Assistant msgs: ${assistantCount}`);
  }

  private onExit(): void {
    if (!this.running) return;
    this.running = false;
    console.log(chalk.dim("\nGoodbye! 👋"));
    process.exit(0);
  }
}
