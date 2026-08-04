import * as readline from "node:readline";
import chalk from "chalk";
import { Spinner } from "./ui/spinner.js";
import { MarkdownStream } from "./ui/render.js";
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
  /** True while an AI request is in-flight (used for Ctrl+C cancellation). */
  private busy = false;
  /** Abort controller for the current in-flight request. */
  private currentAbort: AbortController | null = null;

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
   * Ask a yes/no confirmation using a single keypress (y/N).
   */
  private async askConfirm(question: string): Promise<boolean> {
    return new Promise((resolve) => {
      const stdin = process.stdin;
      const wasRaw = stdin.isRaw;
      stdin.setRawMode(true);
      stdin.resume();
      process.stdout.write(`${question} ${chalk.dim("(y/N)")} `);

      const onChar = (char: Buffer) => {
        const c = char.toString().toLowerCase()[0];
        stdin.removeListener("data", onChar);
        stdin.setRawMode(wasRaw);
        stdin.pause();
        process.stdout.write("\n");
        resolve(c === "y");
      };
      stdin.once("data", onChar);
    });
  }

  /**
   * Ask for a secret (API key) with masked input — echoes '*' instead of the value.
   */
  private async askSecret(question: string): Promise<string | null> {
    return new Promise((resolve) => {
      const rl = this.rl as unknown as { _writeToOutput: (s: string) => void };
      const orig = rl._writeToOutput;
      const real = process.stdout;

      // Mask typed characters
      rl._writeToOutput = (s: string) => {
        if (s === "\n" || s === "\r") {
          real.write("\n");
        } else {
          real.write("*".repeat(s.length));
        }
      };

      this.rl.question(question + " ", (answer) => {
        rl._writeToOutput = orig;
        real.write("\n");
        resolve(answer.trim() || null);
      });
    });
  }

  /** Multi-line buffer: accumulates partial input until balanced. */
  private multiLineBuffer = "";
  private inMultiLine = false;

  /**
   * Start the REPL loop.
   */
  start(): void {
    this.running = true;

    console.log(chalk.dim("  Interactive mode — type your message or /help for commands\n"));

    this.rl.prompt();

    // Ctrl+C: cancel in-flight request, otherwise offer to exit
    this.rl.on("SIGINT", () => {
      if (this.busy) {
        this.currentAbort?.abort();
        this.busy = false;
        this.spinner.stop();
        console.log(chalk.yellow("\n⏹ Request cancelled."));
        this.promptSafe();
        return;
      }

      if (this.inMultiLine) {
        this.multiLineBuffer = "";
        this.inMultiLine = false;
        console.log(chalk.dim("\n  Multi-line input cancelled."));
        this.promptSafe();
        return;
      }

      this.stop();
    });

    this.rl.on("line", async (line: string) => {
      if (!this.running) return;

      // Multi-line mode: accumulate until braces/brackets are balanced
      if (this.inMultiLine) {
        this.multiLineBuffer += "\n" + line;
        if (this.isBalanced(this.multiLineBuffer)) {
          const full = this.multiLineBuffer;
          this.multiLineBuffer = "";
          this.inMultiLine = false;
          await this.handleLine(full);
        } else {
          this.rl.setPrompt(chalk.dim("... ") + chalk.green(""));
          this.rl.prompt();
        }
        return;
      }

      const trimmed = line.trim();

      // Start multi-line if trailing backslash or unclosed brace/bracket
      if (trimmed.endsWith("\\")) {
        this.multiLineBuffer = trimmed.slice(0, -1);
        this.inMultiLine = true;
        this.rl.setPrompt(chalk.dim("... ") + chalk.green(""));
        this.rl.prompt();
        return;
      }

      if (!trimmed) {
        this.promptSafe();
        return;
      }

      if (this.needsMoreInput(trimmed)) {
        this.multiLineBuffer = trimmed;
        this.inMultiLine = true;
        this.rl.setPrompt(chalk.dim("... ") + chalk.green(""));
        this.rl.prompt();
        return;
      }

      await this.handleLine(trimmed);
    });
  }

  /**
   * Process a complete input line (message or command).
   */
  private async handleLine(line: string): Promise<void> {
    const trimmed = line.trim();
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
    this.rl.setPrompt(chalk.green("› ") + chalk.dim("openaether") + " ");
    this.promptSafe();
  }

  /**
   * True if the text has unbalanced open braces/brackets/parens.
   */
  private needsMoreInput(text: string): boolean {
    const open = (text.match(/[{\[(]/g) || []).length;
    const close = (text.match(/[}\])]/g) || []).length;
    return open > close;
  }

  /**
   * True if braces/brackets are balanced.
   */
  private isBalanced(text: string): boolean {
    const open = (text.match(/[{\[(]/g) || []).length;
    const close = (text.match(/[}\])]/g) || []).length;
    return open === close;
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
    this.busy = true;
    this.currentAbort = new AbortController();

    const md = new MarkdownStream();

    const onStream: StreamHandler = (chunk) => {
      switch (chunk.type) {
        case "text":
          // Stop spinner on first text, then stream inline
          if (this.spinner.isRunning()) {
            this.spinner.stop();
            process.stdout.write(chalk.cyan("\nOpenAether › ") + "\n");
          }
          md.write(chunk.delta);
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
          md.flush();
          break;
      }
    };

    try {
      const text = await this.orchestrator.sendMessage(input, onStream, this.currentAbort.signal);
      if (this.spinner.isRunning()) this.spinner.stop();
      md.flush();
      process.stdout.write("\n");

      // Persist conversation to session
      const history = this.orchestrator.getHistory();
      this.sessionManager.setMessages(history);
    } catch (err) {
      if (this.spinner.isRunning()) this.spinner.stop();
      const message = err instanceof Error ? err.message : String(err);
      process.stdout.write(chalk.red(`\n✗ Error: ${message}\n`));
    } finally {
      this.busy = false;
      this.currentAbort = null;
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

      case "/clear": {
        const hasMessages = this.orchestrator.getHistory().length > 0;
        if (hasMessages) {
          const yes = await this.askConfirm(chalk.yellow("Clear conversation history?"));
          if (!yes) break;
        }
        this.orchestrator.reset();
        this.sessionManager.setMessages([]);
        console.log(chalk.green("✓ Conversation history cleared."));
        break;
      }

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
      case "/quit": {
        const hasMessages = this.orchestrator.getHistory().length > 0;
        if (hasMessages) {
          const yes = await this.askConfirm(chalk.yellow("Exit OpenAether?"));
          if (!yes) break;
        }
        await this.sessionManager.flush();
        this.stop();
        break;
      }

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
      const providers: ProviderName[] = ["openai", "anthropic", "google"];

      let provider = args[1]?.toLowerCase() as ProviderName | undefined;

      // Interactive provider selection if not given
      if (!provider) {
        console.log(chalk.dim("\n  Which provider? (openai / anthropic / google)"));
        console.log(chalk.dim("  1) OpenAI   2) Anthropic   3) Google"));
        const pick = await this.askSecret("  Enter 1, 2, or 3");
        const idx = parseInt(pick || "0", 10);
        if (idx >= 1 && idx <= 3) {
          provider = providers[idx - 1];
        } else {
          console.log(chalk.red("✗ Invalid selection."));
          return;
        }
      }

      if (!providers.includes(provider)) {
        console.log(chalk.red(`✗ Unknown provider: ${provider}`));
        return;
      }

      // Interactive key prompt if not given
      let key: string | undefined = args[2];
      if (!key) {
        console.log(chalk.dim(`\n  Enter your ${provider} API key (input is masked):`));
        key = (await this.askSecret(`  ${provider} API key`)) || undefined;
      }

      if (!key) {
        console.log(chalk.yellow("  No key provided — cancelled."));
        return;
      }

      await setApiKey(this.config, provider, key);
      console.log(chalk.green(`✓ ${provider} API key set`));
      this.reloadProvider();
      return;
    }

    if (sub === "setup") {
      await this.interactiveSetup();
      return;
    }

    console.log(chalk.yellow("  Usage: /config | /config key <provider> [key] | /config setup | /config help"));
  }

  /**
   * Interactive guided setup — walks through API keys for all providers.
   */
  private async interactiveSetup(): Promise<void> {
    console.log(chalk.bold("\n🔧 OpenAether Setup"));
    const providers: ProviderName[] = ["openai", "anthropic", "google"];

    for (const p of providers) {
      const existing = this.config.apiKeys[p as keyof typeof this.config.apiKeys];
      if (existing) {
        console.log(`  ${chalk.cyan(p)}: already set ${chalk.dim("(skip)")}`);
        continue;
      }
      const yes = await this.askConfirm(`  Set ${p} API key?`);
      if (!yes) continue;
      const key = await this.askSecret(`  ${p} API key`);
      if (key) {
        await setApiKey(this.config, p, key);
        console.log(chalk.green(`    ✓ ${p} key set`));
      }
    }

    // Ask if using local Ollama
    const useOllama = await this.askConfirm("  Using local Ollama?");
    if (useOllama) {
      const baseUrl = await this.askSecret("  Ollama base URL (default http://localhost:11434)");
      if (baseUrl) {
        this.config.apiKeys.ollamaBaseUrl = baseUrl;
      }
    }

    await switchProvider(this.config, this.config.provider.active);
    console.log(chalk.green("\n✓ Setup complete!"));
    this.showConfig();
    this.reloadProvider();
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
