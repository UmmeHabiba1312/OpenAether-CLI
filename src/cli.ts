import * as readline from "node:readline";
import chalk from "chalk";
import { Spinner } from "./ui/spinner.js";
import { renderMessage } from "./ui/render.js";
import type { Message } from "./providers/interface.js";
import type { OpenAetherConfig } from "./config/index.js";
import { ToolRegistry } from "./tools/registry.js";
import { SessionManager } from "./session/index.js";

/**
 * REPL — interactive command-line interface for OpenAether.
 */
export class REPL {
  private rl: readline.Interface;
  private spinner: Spinner;
  private config: OpenAetherConfig;
  private toolRegistry: ToolRegistry;
  private sessionManager: SessionManager;
  private messages: Message[] = [];
  private running = false;

  constructor(config: OpenAetherConfig, toolRegistry: ToolRegistry) {
    this.config = config;
    this.toolRegistry = toolRegistry;
    this.sessionManager = new SessionManager(config);
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

    // Auto-create a default session
    this.sessionManager.create("default");
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

      if (!this.running) return;

      if (!trimmed) {
        this.promptSafe();
        return;
      }

      if (trimmed.startsWith("/")) {
        await this.handleCommand(trimmed);
        this.promptSafe();
        return;
      }

      await this.handleMessage(trimmed);
      this.promptSafe();
    });
  }

  /**
   * Safely re-issue the prompt if the REPL is still running.
   */
  private promptSafe(): void {
    if (this.running) {
      this.rl.prompt();
    }
  }

  /**
   * Stop the REPL loop.
   */
  stop(): void {
    this.running = false;
    this.rl.close();
  }

  /**
   * Send a message and get a response.
   */
  async handleMessage(input: string): Promise<void> {
    const userMsg: Message = { role: "user", content: input };
    this.messages.push(userMsg);
    this.sessionManager.appendMessage(userMsg);
    renderMessage("user", input);

    this.spinner.start("Thinking...");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    this.spinner.stop();

    const response = `I received your message: "${input}"\n\nFull provider integration coming in Phase 8!`;
    const assistantMsg: Message = { role: "assistant", content: response };

    renderMessage("assistant", response);
    this.messages.push(assistantMsg);
    this.sessionManager.appendMessage(assistantMsg);
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
        this.sessionManager.setMessages([]);
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

      case "/session":
        await this.handleSessionCommand(args);
        break;

      case "/exit":
      case "/quit":
        await this.sessionManager.flush();
        this.stop();
        break;

      default:
        console.log(chalk.red(`Unknown command: ${command}`));
        console.log(chalk.dim("Type /help for available commands."));
    }
  }

  // ── Command handlers ──────────────────────────────────────────────────────

  private showHelp(): void {
    console.log(chalk.bold("\nOpenAether Commands:"));
    console.log("  /help          " + chalk.dim("Show this help message"));
    console.log("  /clear         " + chalk.dim("Clear conversation history"));
    console.log("  /model         " + chalk.dim("Show or switch model"));
    console.log("  /config        " + chalk.dim("Show current configuration"));
    console.log("  /history       " + chalk.dim("Show conversation stats"));
    console.log("  /session list  " + chalk.dim("List saved sessions"));
    console.log("  /session save  " + chalk.dim("Save current session"));
    console.log("  /session load <name>" + chalk.dim("  Load a saved session"));
    console.log("  /session delete <name>" + chalk.dim("  Delete a session"));
    console.log("  /exit          " + chalk.dim("Exit OpenAether"));

    console.log(chalk.bold("\nHow to use:"));
    console.log("  Type a message and press Enter to chat.");
    console.log("  Press Ctrl+C to cancel, Ctrl+D to exit.\n");
  }

  private handleModelCommand(args: string[]): void {
    if (args.length === 0) {
      console.log(`  Current provider: ${chalk.cyan(this.config.provider.active)}`);
      console.log(`  Current model:    ${chalk.cyan(
        this.config.provider.models[this.config.provider.active] || "not set"
      )}`);
    } else {
      console.log(chalk.yellow("  Model switching will be available in Phase 8 with full provider integration."));
    }
  }

  private async handleSessionCommand(args: string[]): Promise<void> {
    const sub = args[0]?.toLowerCase();

    switch (sub) {
      case "list": {
        const sessions = await this.sessionManager.list();
        if (sessions.length === 0) {
          console.log(chalk.dim("  No saved sessions."));
          return;
        }
        console.log(chalk.bold("\nSaved Sessions:"));
        for (const s of sessions) {
          const date = new Date(s.updatedAt).toLocaleString();
          console.log(`  ${chalk.cyan(s.name)}  ${chalk.dim(`${s.messageCount} msgs · ${date}`)}`);
        }
        break;
      }

      case "save": {
        const name = args[1] || "default";
        const current = this.sessionManager.getCurrent();
        if (!current || this.messages.length === 0) {
          console.log(chalk.yellow("  No messages to save."));
          return;
        }
        current.messages = [...this.messages];
        current.meta.name = name;
        await this.sessionManager.save();
        console.log(chalk.green(`✓ Session saved as "${name}" (${this.messages.length} messages)`));
        break;
      }

      case "load": {
        const name = args[1];
        if (!name) {
          console.log(chalk.yellow("  Usage: /session load <name>"));
          return;
        }
        const data = await this.sessionManager.load(name);
        if (!data) {
          console.log(chalk.red(`✗ Session "${name}" not found.`));
          return;
        }
        this.messages = data.messages;
        console.log(chalk.green(`✓ Loaded session "${name}" (${this.messages.length} messages)`));
        break;
      }

      case "delete": {
        const name = args[1];
        if (!name) {
          console.log(chalk.yellow("  Usage: /session delete <name>"));
          return;
        }
        const ok = await this.sessionManager.delete(name);
        console.log(ok
          ? chalk.green(`✓ Session "${name}" deleted.`)
          : chalk.red(`✗ Session "${name}" not found.`));
        break;
      }

      default:
        console.log(chalk.yellow("  Usage: /session list | save [name] | load <name> | delete <name>"));
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

  private async onExit(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    await this.sessionManager.flush();
    console.log(chalk.dim("\nGoodbye! 👋"));
    process.exit(0);
  }
}
