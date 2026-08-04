import chalk from "chalk";
import type { StreamChunk } from "../providers/interface.js";

/**
 * Streaming markdown renderer.
 *
 * Prose streams immediately; fenced code blocks (```lang ... ```) are buffered
 * until closed and then rendered with color, so partial code doesn't flash.
 */
export class MarkdownStream {
  private buffer = "";
  /** Current code-fence marker (length of backticks, or 0 when in prose). */
  private fence = 0;
  private inCode = false;
  private lang = "";

  /** Write a text delta and render any complete portions now. */
  write(delta: string): void {
    this.buffer += delta;
    this.process();
  }

  /** Render any remaining buffered content (called at end of stream). */
  flush(): void {
    while (this.process() > 0) {
      // keep consuming until nothing changed
    }
    if (this.buffer) {
      if (this.inCode) {
        process.stdout.write(chalk.bgBlack(chalk.gray(this.buffer)));
      } else {
        process.stdout.write(renderProse(this.buffer));
      }
      this.buffer = "";
    }
  }

  /**
   * Render one complete unit from the buffer (a closed code block or run of prose).
   * Returns the number of characters consumed.
   */
  private process(): number {
    const buffer = this.buffer;
    const fenceMark = buffer.indexOf("```");

    if (this.inCode) {
      // Looking for the closing fence
      if (fenceMark === -1) {
        // No closing fence yet — hold everything (could be an incomplete block)
        return 0;
      }
      // Render the code block up to and including the closing fence
      const code = buffer.slice(0, fenceMark);
      renderCodeBlock(this.lang, code);
      // Drop everything through the closing fence
      const after = buffer.slice(fenceMark + 3);
      this.buffer = after;
      this.inCode = false;
      this.fence = 0;
      this.lang = "";
      return 0; // mark processed; continue with remaining
    }

    // In prose: if no opening fence, render everything now
    if (fenceMark === -1) {
      process.stdout.write(renderProse(buffer));
      this.buffer = "";
      return 0;
    }

    // There's an opening fence. Check if it's closed on the same line.
    // If open and nothing after — hold until we know (it might be prose containing ```).
    // We need at least one more token to decide, so hold only if it's truly a fence start.
    if (this.looksLikeFenceStart(buffer, fenceMark)) {
      // Render prose before the fence
      const before = buffer.slice(0, fenceMark);
      if (before) {
        process.stdout.write(renderProse(before));
      }
      // Extract language
      const lineEnd = buffer.indexOf("\n", fenceMark);
      const firstLine = buffer.slice(fenceMark + 3, lineEnd === -1 ? undefined : lineEnd);
      // Check if code block is closed on a subsequent (already received) line
      const rest = lineEnd === -1 ? "" : buffer.slice(fenceMark + 3);
      const closeIdx = rest.indexOf("\n```");
      if (closeIdx !== -1) {
        // Complete block already in buffer
        const code = rest.slice(0, closeIdx);
        renderCodeBlock(firstLine.trim(), code);
        const after = rest.slice(closeIdx + 2 + 3); // skip "\n```"
        this.buffer = after;
        return 0;
      }
      // Incomplete block — enter code mode, hold buffer after fence
      this.inCode = true;
      this.lang = firstLine.trim();
      this.buffer = rest;
      return 0;
    }

    // Not actually a fence (e.g. "```" mid-word) — render as prose through it and continue
    process.stdout.write(renderProse(buffer));
    this.buffer = "";
    return 0;
  }

  private looksLikeFenceStart(buffer: string, index: number): boolean {
    // Fence must be at start of a line or preceded by whitespace
    const before = index === 0 ? "" : buffer[index - 1];
    return before === "" || before === "\n" || before === " ";
  }
}

/** Render a code block with a dim background and language tag. */
function renderCodeBlock(lang: string, code: string): void {
  const trimmedLang = lang ? lang.trim() : "";
  const label = trimmedLang ? chalk.dim(` ${trimmedLang} `) : chalk.dim(" code ");
  process.stdout.write("\n" + chalk.bgBlack(label) + "\n");
  // Render lines with subtle coloring
  const lines = code.replace(/^\n/, "").split("\n");
  for (const line of lines) {
    process.stdout.write(chalk.gray(line) + "\n");
  }
  process.stdout.write(chalk.bgBlack(chalk.dim("   ")) + "\n");
}

/** Render a run of prose with inline basic markdown. */
function renderProse(text: string): string {
  // Inline code: `code`
  const withCode = text.replace(/`([^`]+)`/g, (_, code) => chalk.cyan(code));
  // Bold: **text**
  const withBold = withCode.replace(/\*\*([^*]+)\*\*/g, (_, m) => chalk.bold(m));
  return withBold;
}

/**
 * Render a stream of LLM chunks to the terminal in real time.
 * Returns the full accumulated text.
 */
export async function streamResponse(
  chunks: AsyncGenerator<StreamChunk>,
): Promise<{ text: string; toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> }> {
  let fullText = "";
  const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

  for await (const chunk of chunks) {
    switch (chunk.type) {
      case "text":
        fullText += chunk.delta;
        process.stdout.write(chunk.delta);
        break;

      case "tool_use":
        toolCalls.push({
          id: chunk.id,
          name: chunk.name,
          input: chunk.input,
        });
        // Show tool call inline (dimmed)
        if (chunk.name) {
          process.stdout.write(
            chalk.dim(`\n[Tool: ${chunk.name}]`) + "\n"
          );
        }
        break;

      case "error":
        process.stdout.write(
          chalk.red(`\n✗ Error: ${chunk.message}\n`)
        );
        break;

      case "done":
        process.stdout.write("\n");
        break;
    }
  }

  return { text: fullText, toolCalls };
}

/**
 * Render a single message (for history playback).
 */
export function renderMessage(role: string, content: string): void {
  const prefix = role === "user"
    ? chalk.green("\n› You:")
    : role === "assistant"
      ? chalk.cyan("\n› OpenAether:")
      : chalk.dim(`\n› ${role}:`);

  process.stdout.write(`${prefix}\n${content}\n`);
}

/**
 * Show tool execution result in the terminal.
 */
export function renderToolResult(name: string, result: { content: string; isError?: boolean }): void {
  const lines = result.content.split("\n").length;
  const summary = result.isError
    ? chalk.red(`✗ ${name} failed`)
    : chalk.dim(`[${name}: ${lines} line(s)]`);

  process.stdout.write(summary + "\n");
}
