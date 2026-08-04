import * as readline from "node:readline";
import chalk from "chalk";
import { Spinner } from "./ui/spinner.js";
import {
  type OpenAetherConfig,
  type ProviderName,
  switchProvider,
  setModel,
  setApiKey,
} from "./config/index.js";
import { ConversationOrchestrator, type StreamHandler } from "./orchestrator/conversation.js";
import { SessionManager } from "./session/index.js";
import { createProvider } from "./providers/registry.js";

/**
 * REPL — interactive command-line interface for OpenAether.
 */
export class REPL {
  private rl: readline.Interface;
  private spinner: Spinner;
  private config: OpenAetherConfig;
  private orchestrator: ConversationOrchestrator;
  private sessionManager: SessionManager;
  private running = false;

  constructor(config: OpenAetherConfig, orchestrator: ConversationOrchestrator) {
    this.config = config;
    this.orchestrator = orchestrator;
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
   * Send a message through the orchestrator and stream the response.
   */
  async handleMessage(input: string): Promise<void> {
    console.log("");
    this.spinner.start("Thinking...");

    const onStream: StreamHandler = (chunk) => {
      switch (chunk.type) {
        case "text":
          // Stop spinner on first text, then stream inline
          if (this.spinner.isRunning()) {
            this.spinner.stop();
            process.stdout.write(chalk.cyan("\nOpenAether › ") + "\n");
          }
          process.stdout.write(chunk.delta);
          break;

        case "tool_use":
          // Tool call requested — show it, keep spinner running for execution
          this.spinner.setMessage(chalk.dim(`executing ${chunk.name}...`));
          break;

        case "tool_start":
          this.spinner.setMessage(chalk.dim(`[Tool] ${chunk.name}...`));
          break;

        case "tool_end":
          this.spinner.setMessage(chalk.dim(
            `[Tool] ${chunk.name} ${chunk.result?.isError ? chalk.red("failed") : chalk.green("✓")}`
          ));
          break;

        case "error":
          if (this.spinner.isRunning()) this.spinner.stop();
          process.stdout.write(chalk.red(`\n✗ Error: ${chunk.message}\n`));
          break;

        case "done":
          if (this.spinner.isRunning()) this.spinner.stop();
          break;
      }
    };

    try {
      const text = await this.orchestrator.sendMessage(input, onStream);
      if (this.spinner.isRunning()) this.spinner.stop();
      process.stdout.write("\n");

      // Persist conversation to session
      const history = this.orchestrator.getHistory();
      this.sessionManager.setMessages(history);
    } catch (err) {
      if (this.spinner.isRunning()) this.spinner.stop();
      const message = err instanceof Error ? err.message : String(err);
      process.stdout.write(chalk.red(`\n✗ Error: ${message}\n`));
    }
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
        this.orchestrator.reset();
        this.sessionManager.setMessages([]);
        console.log(chalk.green("✓ Conversation history cleared."));
        break;

      case "/model":
        await this.handleModelCommand(args);
        break;

      case "/provider":
        await this.handleProviderCommand(args);
        break;

      case "/config":
        await this.handleConfigCommand(args);
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
    console.log("  /help             " + chalk.dim("Show this help message"));
    console.log("  /provider         " + chalk.dim("List or switch provider"));
    console.log("  /model <name>     " + chalk.dim("Show or set the model"));
    console.log("  /config           " + chalk.dim("Show configuration"));
    console.log("  /config key <provider> <key>" + chalk.dim("  Set an API key"));
    console.log("  /clear            " + chalk.dim("Clear conversation history"));
    console.log("  /history          " + chalk.dim("Show conversation stats"));
    console.log("  /session list     " + chalk.dim("List saved sessions"));
    console.log("  /session save <name>" + chalk.dim("  Save current session"));
    console.log("  /session load <name>" + chalk.dim("  Load a saved session"));
    console.log("  /session delete <name>" + chalk.dim("  Delete a session"));
    console.log("  /exit             " + chalk.dim("Exit OpenAether"));

    console.log(chalk.bold("\nHow to use:"));
    console.log("  Type a message and press Enter to chat.");
    console.log("  Press Ctrl+C to cancel, Ctrl+D to exit.\n");
  }

  private async handleModelCommand(args: string[]): Promise<void> {
    if (args.length === 0) {
      console.log(`  Current provider: ${chalk.cyan(this.config.provider.active)}`);
      console.log(`  Current model:    ${chalk.cyan(
        this.config.provider.models[this.config.provider.active] || "not set"
      )}`);
      console.log(chalk.dim("  Usage: /model <model-name>"));
      return;
    }

    const provider = this.config.provider.active;
    await setModel(this.config, provider, args[0]);
    console.log(chalk.green(`✓ Model set to "${args[0]}" for ${provider}`));
    this.reloadProvider();
  }

  private async handleProviderCommand(args: string[]): Promise<void> {
    const providers: ProviderName[] = ["openai", "anthropic", "google", "ollama"];

    if (args.length === 0) {
      console.log(chalk.bold("\nAvailable Providers:"));
      for (const p of providers) {
        const active = p === this.config.provider.active ? chalk.green(" ✓") : "";
        const model = this.config.provider.models[p] || "";
        console.log(`  ${chalk.cyan(p)}${active}  ${chalk.dim(model)}`);
      }
      console.log(chalk.dim("\n  Usage: /provider <name>"));
      return;
    }

    const name = args[0].toLowerCase() as ProviderName;
    if (!providers.includes(name)) {
      console.log(chalk.red(`✗ Unknown provider: ${name}`));
      console.log(chalk.dim(`  Available: ${providers.join(", ")}`));
      return;
    }

    await switchProvider(this.config, name);
    console.log(chalk.green(`✓ Switched to ${name} provider`));
    this.reloadProvider();
  }

  /**
   * Recreate the provider from current config and swap it into the orchestrator.
   */
  private reloadProvider(): void {
    const provider = createProvider(this.config);
    if (provider.name === "none") {
      console.log(chalk.red(`✗ ${provider.getModelName() || "Provider not configured"}`));
      return;
    }
    this.orchestrator.setProvider(provider);
    console.log(chalk.dim(`  Active model: ${provider.getModelName()}`));
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
        const history = this.orchestrator.getHistory();
        if (history.length === 0) {
          console.log(chalk.yellow("  No messages to save."));
          return;
        }
        const current = this.sessionManager.getCurrent();
        if (current) {
          current.messages = history;
          current.meta.name = name;
        }
        await this.sessionManager.save();
        console.log(chalk.green(`✓ Session saved as "${name}" (${history.length} messages)`));
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
        this.orchestrator.setHistory(data.messages);
        console.log(chalk.green(`✓ Loaded session "${name}" (${data.messages.length} messages)`));
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

  private async handleConfigCommand(args: string[]): Promise<void> {
    const sub = args[0]?.toLowerCase();

    if (!sub || sub === "show") {
      this.showConfig();
      return;
    }

    if (sub === "help") {
      console.log(chalk.bold("\n/config Usage:"));
      console.log("  /config              " + chalk.dim("Show current configuration"));
      console.log("  /config key <provider> <key>" + chalk.dim("  Set an API key"));
      console.log("  /config help         " + chalk.dim("Show this help"));
      console.log(chalk.dim("\n  Providers: openai, anthropic, google, ollama"));
      console.log(chalk.dim("  Use /provider to switch, /model to set model.\n"));
      return;
    }

    if (sub === "key") {
      const provider = args[1]?.toLowerCase();
      const key = args[2];
      const providers: ProviderName[] = ["openai", "anthropic", "google"];

      if (!provider || !key) {
        console.log(chalk.yellow("  Usage: /config key <provider> <api-key>"));
        return;
      }

      if (!providers.includes(provider as ProviderName)) {
        console.log(chalk.red(`✗ Unknown provider: ${provider}`));
        return;
      }

      await setApiKey(this.config, provider as ProviderName, key);
      console.log(chalk.green(`✓ ${provider} API key set`));
      this.reloadProvider();
      return;
    }

    console.log(chalk.yellow("  Usage: /config | /config key <provider> <key> | /config help"));
  }

  private showConfig(): void {
    console.log(chalk.bold("\nConfiguration:"));
    console.log(`  Provider:  ${chalk.cyan(this.config.provider.active)}`);
    console.log(`  Model:     ${chalk.cyan(this.config.provider.models[this.config.provider.active] || "not set")}`);
    console.log(`  Theme:     ${chalk.cyan(this.config.theme)}`);
    console.log(`  Max tokens:${chalk.cyan(this.config.maxTokens)}`);
    console.log(`  Temp:      ${chalk.cyan(this.config.temperature)}`);

    const hasKey = (provider: string) => {
      const keys = this.config.apiKeys as Record<string, string | undefined>;
      return keys[provider] ? chalk.green("✓ set") : chalk.dim("not set");
    };

    console.log(chalk.bold("\nAPI Keys:"));
    console.log(`  OpenAI:    ${hasKey("openai")}`);
    console.log(`  Anthropic: ${hasKey("anthropic")}`);
    console.log(`  Google:    ${hasKey("google")}`);
    console.log(`  Ollama:    ${this.config.apiKeys.ollamaBaseUrl ? chalk.green("✓ " + this.config.apiKeys.ollamaBaseUrl) : chalk.dim("not set (defaults to localhost:11434)")}`);
    console.log("");
  }

  private showHistory(): void {
    const history = this.orchestrator.getHistory();
    const userCount = history.filter((m) => m.role === "user").length;
    const assistantCount = history.filter((m) => m.role === "assistant").length;
    console.log(`  Total messages: ${history.length}`);
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
