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

## 🔌 MCP Servers

OpenAether supports **Model Context Protocol (MCP) servers**, letting it connect to external tools and services (GitHub, filesystem, web, databases, and more).

Configure MCP servers in `~/.openaether/config.json`:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..." }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/folder"]
    }
  }
}
```

Each server's tools are automatically loaded at startup and made available to the AI. MCP tools are namespaced by server (e.g. `github_getIssue`, `filesystem_readFile`).

Common servers:
- `@modelcontextprotocol/server-github` — GitHub repos, issues, PRs
- `@modelcontextprotocol/server-filesystem` — file operations
- `@modelcontextprotocol/server-web` — web searches
- `@modelcontextprotocol/server-postgres` — database queries

## 🎓 Skills

OpenAether supports reusable **skill packages** — markdown instruction sets loaded into the model's context. Create skill files with frontmatter:

```markdown
---
name: code-review
description: Review code for bugs and security issues
---

Follow these rules when reviewing code: ...
```

Place skills in `./skills/` (project) or `~/.openaether/skills/` (global), then use them in the REPL:

```
/skill list          # list available skills
/skill load <name>   # load a skill
/skill unload <name> # unload a skill
```

## 🤖 Subagents

OpenAether supports **subagents** — specialized agents with focused system prompts that the main agent can delegate tasks to.

Built-in subagents:
- **code-reviewer** — reviews code for bugs, security issues, improvements
- **researcher** — searches the codebase to answer questions with evidence
- **file-editor** — makes careful, verified file edits

The main agent can spawn these automatically via the `SpawnSubagent` tool when it detects a task is a good fit (e.g. delegating a long review while continuing the main conversation).

## 📐 Spec-Driven Development

Use `/spec <description>` to run a **spec-driven development** workflow:

1. OpenAether writes a **SPECIFICATION** (overview, goals, requirements, technical approach)
2. It then creates an **IMPLEMENTATION PLAN** (ordered steps, verification, rollback)
3. You approve each stage
4. Both are saved to `.specs/` in your project

```
/spec a CLI tool to rename files in bulk
```

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
| **OpenRouter** | Required | 300+ models from one key |
| **Groq** | Required | Fast Llama inference |
| **Mistral** | Required | Mistral Large/Medium |
| **xAI** | Required | Grok models |
| **DeepSeek** | Required | deepseek-chat / reasoner |
| **Qwen** | Required | qwen-max / plus |
| **Moonshot (Kimi)** | Required | Kimi + Kimi Coding |
| **Ollama** | Not needed | Local models (Llama, Qwen, etc.) |

### Environment variables
| Provider | Env Var |
|----------|---------|
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Google | `GOOGLE_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Groq | `GROQ_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |
| xAI | `XAI_API_KEY` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| Qwen | `QWEN_API_KEY` |
| Moonshot | `MOONSHOT_API_KEY` |

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
