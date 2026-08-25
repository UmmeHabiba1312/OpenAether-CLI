import chalk from "chalk";

/**
 * Center a string within a fixed width (used for banner lines).
 */
export function center(text: string, width: number): string {
  const extra = Math.max(0, width - text.length);
  const left = Math.floor(extra / 2);
  const right = extra - left;
  return " ".repeat(left) + text + " ".repeat(right);
}

/**
 * Render the OpenAether startup banner as an aligned box.
 */
export function renderBanner(version: string): string {
  const innerWidth = 46;
  const top = "  ╭" + "─".repeat(innerWidth) + "╮";
  const bottom = "  ╰" + "─".repeat(innerWidth) + "╯";

  const name = chalk.cyan.bold("OpenAether");
  const lines = [
    "  │ " + center(`${name} ${chalk.dim("v" + version)}`, innerWidth) + " │",
    "  │ " + center(chalk.dim("Open-source AI coding assistant"), innerWidth) + " │",
    "  │ " + center(chalk.dim("Works with any LLM provider"), innerWidth) + " │",
  ];

  return [top, ...lines, bottom].join("\n");
}

/**
 * Render a labeled status line with aligned value, e.g.:
 *   ● Provider  anthropic  (claude-sonnet-4-5)
 */
export function statusLine(
  label: string,
  value: string,
  suffix = "",
  valueStyle: (s: string) => string = (s) => s,
): string {
  const labelPadded = label.padEnd(10);
  return `  ${chalk.dim("●")} ${labelPadded}${valueStyle(value)}${suffix ? "  " + suffix : ""}`;
}

/**
 * A ✓ success line.
 */
export function okLine(text: string): string {
  return "  " + chalk.green("✓") + " " + text;
}

/**
 * A ✗ error line.
 */
export function errorLine(text: string): string {
  return "  " + chalk.red("✗") + " " + text;
}
