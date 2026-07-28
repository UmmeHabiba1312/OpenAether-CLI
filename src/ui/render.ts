import chalk from "chalk";
import type { StreamChunk } from "../providers/interface.js";

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
