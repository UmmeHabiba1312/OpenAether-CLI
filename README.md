# OpenAether

**An open-source AI coding assistant that works with ANY LLM provider.**

OpenAether is a terminal-based AI assistant inspired by Claude Code, but built to be model-agnostic. Bring your own API key — it works with OpenAI, Anthropic, Google Gemini, and local models via Ollama.

## ✨ Features

- 🔌 **Multi-provider** — OpenAI, Anthropic, Google Gemini, and Ollama (local)
- 🛠️ **Tool calling** — Read, Write, Edit files, run Bash commands, search with Glob
- 🖥️ **Interactive REPL** — streaming responses, slash commands
- 💾 **Session management** — save, load, list, and resume conversations
- 🔑 **Your keys, your control** — no vendor lock-in, fully open source
- 📦 **Streaming** — real-time response streaming

## 🚀 Installation

```bash
npm install -g .
# or run directly
npx tsx src/index.ts
```

## 🎯 Quick Start

```bash
openaether
```

On first run, OpenAether creates a config file at `~/.openaether/config.json`.

### Set your API key

**Environment variables** (recommended):
```bash
export OPENAI_API_KEY="sk-..."          # OpenAI
export ANTHROPIC_API_KEY="sk-ant-..."   # Anthropic
export GOOGLE_API_KEY="AIza..."         # Google Gemini
```

**Or inside the REPL:**
```
/config key openai sk-...
/config key anthropic sk-ant-...
/config key google AIza...
```

### Switch providers & models

```
/provider            # list providers
/provider anthropic  # switch to Anthropic
/model claude-sonnet-4-5   # set the model
```

## 🖥️ REPL Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/provider` | List or switch providers |
| `/model` | Show or set the model |
| `/config` | View configuration |
| `/config key <provider> <key>` | Set an API key |
| `/clear` | Clear conversation history |
| `/history` | Show conversation stats |
| `/session list` | List saved sessions |
| `/session save <name>` | Save current session |
| `/session load <name>` | Load a saved session |
| `/session delete <name>` | Delete a session |
| `/exit` | Exit OpenAether |

## 🛠️ Tools

OpenAether can call tools on your behalf:

- **Read** — read file contents
- **Write** — create or overwrite files
- **Edit** — find-and-replace text in files
- **Bash** — run shell commands (with safety checks)
- **Glob** — search for files with patterns

Just ask in natural language: *"create a file called hello.py that prints hello world"* and OpenAether will use the Write tool, then show you the result.

## 🏗️ Providers

| Provider | API Key | Notes |
|----------|---------|-------|
| **OpenAI** | Required | GPT-4o, GPT-4, GPT-3.5 |
| **Anthropic** | Required | Claude Sonnet, Opus, Haiku |
| **Google Gemini** | Required | Gemini 2.0 Flash, 1.5 Pro |
| **Ollama** | Not needed | Local models (Llama, Qwen, etc.) |

## 📁 Project Structure

```
src/
├── index.ts               # Entry point
├── cli.ts                 # Interactive REPL
├── config/                # Configuration management
├── providers/             # LLM provider implementations
│   ├── interface.ts       # Common provider interface
│   ├── openai.ts
│   ├── anthropic.ts
│   ├── google.ts
│   └── ollama.ts
├── orchestrator/          # Conversation & tool-call loop
├── tools/                 # Tool system (Read, Write, Edit, Bash, Glob)
├── session/               # Session persistence
└── ui/                    # Spinner, rendering
```

## 🛠️ Development

```bash
npm run dev        # Run in development mode
npm run build      # Compile TypeScript
npm start          # Run compiled version
```

## 📄 License

MIT
