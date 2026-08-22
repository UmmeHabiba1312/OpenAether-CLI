# OpenAether

**An open-source AI coding assistant that works with ANY LLM provider.**

OpenAether is a terminal-based AI assistant inspired by Claude Code, but built to be model-agnostic. Bring your own API key — it works with OpenAI, Anthropic, Google Gemini, and local models via Ollama.

## ✨ Features

- 🔌 **Multi-provider** — OpenAI, Anthropic, Google Gemini, Ollama (local), OpenRouter, Groq, Mistral, xAI, DeepSeek, Qwen, Moonshot — plus any OpenAI-compatible endpoint
- 🛠️ **Tool calling** — Read, Write, Edit files, run Bash commands, search with Glob/Grep, fetch web pages, search the web, git status & commit
- 🛡️ **Tool approval** — every tool call asks for your permission before running (Bash is marked high-risk)
- 🖥️ **Interactive REPL** — streaming responses, markdown rendering, multi-line input, slash commands, Ctrl+C cancel
- 📝 **Project context** — automatically loads `.openaether.md` / `CLAUDE.md` / `AGENTS.md` plus git state
- 🎓 **Skills** — reusable markdown instruction packages you can load/unload
- 🤖 **Subagents** — delegate tasks to specialized agents (code-reviewer, researcher, file-editor)
- 📐 **Spec-driven dev** — `/spec` writes a SPEC + implementation plan before coding
- 🔌 **MCP servers** — connect external tools via the Model Context Protocol
- 💾 **Session management** — save, load, list, and resume conversations
- 💰 **Cost tracking** — `/cost` shows token usage and estimated spend
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

### Non-interactive (one-shot) mode

Run a single prompt and print the result — great for scripting, CI, or quick questions:

```bash
openaether -p "explain the diff in 3 bullets"     # one-shot
echo "summarize this repo" | openaether -p         # prompt from stdin
openaether -p "continue" --continue                # resume most recent session
openaether -p "list files" --output-format json    # machine-readable output
openaether -p "git commit" --dangerously-skip-permissions   # auto-approve tools
```

- `--output-format json` emits `{ result, toolCalls, tokens, estimatedCost }`.
- In print mode, tool activity and errors go to **stderr**; stdout carries only the result (safe to pipe).
- `--dangerously-skip-permissions` auto-approves every tool call (use with care).

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
| `/model <name>` | Show or set the model |
| `/config` | View configuration |
| `/config key <provider> <key>` | Set an API key |
| `/config setup` | Guided interactive setup |
| `/skill list\|load <name>\|unload <name>` | Manage skill packages |
| `/spec <desc>` | Spec-driven development workflow |
| `/init` | Generate a project context file (.openaether.md) |
| `/permissions` | Show tool permission rules |
| `/remember <fact>` | Save a fact to persistent memory |
| `/memory [clear]` | Show or clear memory |
| `/compact` | Compress conversation context |
| `/tasks` | List background subagent tasks |
| `/cost` | Show token usage & estimated cost |
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

The main agent can spawn these two ways:

- **`SpawnSubagent`** (synchronous) — delegates a task and waits for the result inline.
- **`Task` + `CollectTask`** (background) — starts a subagent in the **background**, so the main agent keeps working; it fetches the result later with `CollectTask`. Use this for long, independent subtasks.

Track background tasks in the REPL with `/tasks`.

## 📐 Spec-Driven Development

Use `/spec <description>` to run a **spec-driven development** workflow:

1. OpenAether writes a **SPECIFICATION** (overview, goals, requirements, technical approach)
2. It then creates an **IMPLEMENTATION PLAN** (ordered steps, verification, rollback)
3. You approve each stage
4. Both are saved to `.specs/` in your project

```
/spec a CLI tool to rename files in bulk
```

## 📄 Project Context

OpenAether automatically loads **project context** at startup — instructions that help it work correctly in your repo:

1. A context file — `.openaether.md`, `CLAUDE.md`, or `AGENTS.md` (first found wins)
2. A summary of the current **git state** (branch + changed files)

Create a `CLAUDE.md` (or `.openaether.md`) in your project root with conventions, commands, and gotchas — the AI will read and follow them on every conversation.

You can also generate one automatically with `/init`, which analyzes the project and writes `.openaether.md` for you.

## 💰 Cost Tracking

`/cost` shows your session's token usage and an **estimated** cost in USD:

- Total calls, input tokens, output tokens
- Estimated spend (based on public per-model pricing)
- Per-model breakdown

> Cost is an estimate. Pricing is approximate and may drift — treat it as a guide, not a bill.

## 🔐 Permissions

By default, **every tool call asks for your approval**. To reduce prompts, configure permission rules — tools on the `allow` list run automatically, tools on the `deny` list are always blocked, and everything else is still asked.

Rules live in two places (project rules are added on top of global):

- **Global:** `~/.openaether/config.json`
- **Project:** `.openaether/settings.json` in your repo root

```json
{
  "permissions": {
    "allow": ["Read", "Glob", "Grep", "Bash:npm run*"],
    "deny": ["Bash:rm -rf", "Bash:git push --force"]
  }
}
```

**Pattern syntax:**
- `Read` — match every call to that tool
- `Bash:npm run*` — match when any argument starts with `npm run` (the `*` is a prefix wildcard)
- `*` — match every tool
- `Bash:git` — match when any argument contains `git`

**Deny always wins over allow.** Use `/permissions` inside the REPL to see the effective rules. In print mode (`-p`), anything not explicitly allowed is denied unless you pass `--dangerously-skip-permissions`.

## ⚙️ Hooks

OpenAether can run **shell command hooks** on lifecycle events (like Claude Code). Hooks live in the same settings files as permissions — global `~/.openaether/config.json` + project `.openaether/settings.json`.

```json
{
  "hooks": {
    "preToolUse": [
      { "matcher": "Bash", "command": "node ~/.openaether/hooks/guard-bash.mjs" }
    ],
    "postToolUse": [
      { "matcher": "Edit", "command": "echo '[edited]' >> ~/.openaether/edits.log" }
    ],
    "stop": [ { "command": "node ~/.openaether/hooks/on-stop.mjs" } ]
  }
}
```

- **`preToolUse`** — runs before a tool executes. Exit code `2` **blocks** the tool; exit `0` **allows** it; any other exit falls through to the normal permission prompt. `matcher` can be a tool name, `*`, or a prefix like `Bash*`.
- **`postToolUse`** — runs after a tool succeeds/fails. Never blocks.
- **`stop`** — runs once when a conversation turn ends (final answer, cancel, or error).

Hooks receive context via environment variables: `OPENAETHER_TOOL_NAME`, `OPENAETHER_TOOL_INPUT`, `OPENAETHER_TOOL_RESPONSE`, and `OPENAETHER_CONVERSATION` (stop hooks also get the conversation on stdin).

## 🧠 Memory

OpenAether keeps **persistent user memory** across sessions at `~/.openaether/memory.md`. Facts you save are automatically injected into the model's system prompt, so it remembers you across conversations.

```
/remember the user prefers kebab-case naming
/remember this project targets Node 20
/memory            # show memory
/memory clear      # clear memory
```

## 📦 Context Compaction

Long conversations are automatically compacted: once the estimated token count passes the threshold, the oldest messages are summarized and replaced by the summary (like Claude Code). Recent messages stay intact.

- **Auto:** triggers at ~60,000 estimated tokens by default
- **Manual:** `/compact` compresses on demand

Configure in `~/.openaether/config.json`:

```json
{
  "compactionThreshold": 60000,
  "keepRecent": 10
}
```

## 🛠️ Tools

OpenAether can call tools on your behalf — **each call is shown to you and needs your approval**:

- **Read** — read file contents (with line offset/limit)
- **Write** — create or overwrite files (auto-creates parent dirs)
- **Edit** — find-and-replace text in files (requires a unique match)
- **Bash** — run shell commands (with safety checks + high-risk approval)
- **Glob** — search for files with glob patterns
- **Grep** — search file contents with regex (returns file:line matches)
- **WebFetch** — fetch a URL and return its text content
- **WebSearch** — search the web (free, no API key required)
- **GitStatus** — show current branch and uncommitted changes
- **GitCommit** — stage and commit changes

Just ask in natural language: *"create a file called hello.py that prints hello world"* and OpenAether will use the Write tool, then show you the result.

## 🏗️ Providers

OpenAether works with **17 providers** plus any custom OpenAI-compatible endpoint — paid and free:

| Provider | API Key | Notes |
|----------|---------|-------|
| **OpenAI** | Required | GPT-4o, GPT-4, GPT-3.5 |
| **Anthropic** | Required | Claude Sonnet, Opus, Haiku |
| **Google Gemini** | Required | Gemini 2.0 Flash, 1.5 Pro |
| **OpenRouter** | Required | 300+ models from one key (incl. free models) |
| **Groq** | Required | Fast Llama inference (free tier) |
| **Mistral** | Required | Mistral Large/Medium |
| **xAI** | Required | Grok models |
| **DeepSeek** | Required | deepseek-chat / reasoner |
| **Qwen** | Required | qwen-max / plus |
| **Moonshot (Kimi)** | Required | Kimi + Kimi Coding |
| **Together AI** | Required | 200+ open-source models |
| **Cerebras** | Required | Wafer-scale fast inference |
| **Fireworks AI** | Required | Fast open-source inference |
| **NVIDIA NIM** | Required | NVIDIA-hosted foundation models |
| **Perplexity** | Required | Sonar (search-augmented) |
| **Ollama** | Not needed | Local models (Llama, Qwen, etc.) |
| **LM Studio** | Not needed | Local models via OpenAI-compatible API |
| **Custom** | Optional | Any OpenAI-compatible endpoint |

> **Free options:** Ollama & LM Studio (fully local), Groq & Google & OpenRouter (free tiers), DeepSeek (very cheap).

### Custom OpenAI-compatible endpoints

Point OpenAether at any OpenAI-compatible API (a proxy, gateway, or self-hosted server) via `~/.openaether/config.json`:

```json
{
  "apiKeys": { "custom": "optional-key-or-anything" },
  "provider": {
    "active": "custom",
    "models": { "custom": "your-model-name" },
    "baseUrls": { "custom": "http://localhost:8080/v1" }
  }
}
```

You can also **override the base URL of any built-in provider** (e.g. route OpenAI through a gateway) with `baseUrls`:

```json
{ "provider": { "baseUrls": { "openai": "https://my-gateway.example/v1" } } }
```

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
| Together | `TOGETHER_API_KEY` |
| Cerebras | `CEREBRAS_API_KEY` |
| Fireworks | `FIREWORKS_API_KEY` |
| NVIDIA | `NVIDIA_API_KEY` |
| Perplexity | `PERPLEXITY_API_KEY` |
| Custom | `CUSTOM_API_KEY` |

## 📁 Project Structure

```
src/
├── index.ts               # Entry point — wires everything together
├── cli.ts                 # Interactive REPL (slash commands, approvals, setup)
├── config/                # Configuration management
├── providers/             # LLM provider implementations (17 + custom endpoint)
│   ├── interface.ts       # Common provider interface
│   ├── openai-compat.ts   # Base for any OpenAI-compatible API
│   ├── openai.ts, anthropic.ts, google.ts, ollama.ts, openrouter.ts,
│   ├── groq.ts, mistral.ts, xai.ts, deepseek.ts, qwen.ts, moonshot.ts,
│   ├── together.ts, cerebras.ts, fireworks.ts, nvidia.ts, perplexity.ts, lmstudio.ts
│   └── registry.ts        # Unified provider table (add a provider = one row)
├── orchestrator/          # Conversation & tool-call loop
├── tools/                 # Tool system (Read, Write, Edit, Bash, Glob, Grep, Web, Git)
├── session/               # Session persistence
├── mcp/                   # MCP server client integration
├── skills/                # Skill package manager
├── subagents/             # SpawnSubagent tool + built-in agents
├── tasks/                 # Background Task tool (TaskManager)
├── spec/                  # Spec-driven development workflow
├── context/               # Project context loader (CLAUDE.md + git state)
├── permissions/           # Tool permission rules (allow/deny)
├── hooks/                 # Lifecycle hooks (PreToolUse/PostToolUse/Stop)
├── memory/                # Persistent user memory
├── print.ts               # One-shot non-interactive mode (-p)
├── cost/                  # Token usage & cost estimation
└── ui/                    # Spinner, markdown rendering
```

## 🛠️ Development

```bash
npm run dev        # Run in development mode
npm run build      # Compile TypeScript
npm start          # Run compiled version
```

## 📄 License

MIT
