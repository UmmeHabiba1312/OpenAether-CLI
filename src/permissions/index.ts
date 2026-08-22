import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { PermissionConfig } from "../config/types.js";

/** Global config file (~/.openaether/config.json) — permissions live there. */
const GLOBAL_DIR = join(homedir(), ".openaether");
const GLOBAL_CONFIG = join(GLOBAL_DIR, "config.json");

/** Project-scoped settings file. */
const PROJECT_SETTINGS = ".openaether/settings.json";

export type PermissionDecision = "allow" | "deny" | "ask";

/**
 * Load the merged permission rules: global config permissions as the base,
 * project settings overriding/extending. Deny always wins over allow.
 */
export async function loadPermissions(cwd = process.cwd()): Promise<PermissionConfig> {
  const allow: string[] = [];
  const deny: string[] = [];

  // Global (~/.openaether/config.json)
  try {
    if (existsSync(GLOBAL_CONFIG)) {
      const raw = await readFile(GLOBAL_CONFIG, "utf-8");
      const parsed = JSON.parse(raw) as { permissions?: PermissionConfig };
      if (parsed.permissions) {
        allow.push(...(parsed.permissions.allow ?? []));
        deny.push(...(parsed.permissions.deny ?? []));
      }
    }
  } catch {
    // ignore unreadable global config
  }

  // Project (.openaether/settings.json)
  const projectPath = resolve(cwd, PROJECT_SETTINGS);
  try {
    if (existsSync(projectPath)) {
      const raw = await readFile(projectPath, "utf-8");
      const parsed = JSON.parse(raw) as { permissions?: PermissionConfig };
      if (parsed.permissions) {
        allow.push(...(parsed.permissions.allow ?? []));
        deny.push(...(parsed.permissions.deny ?? []));
      }
    }
  } catch {
    // ignore unreadable project settings
  }

  return { allow, deny };
}

/**
 * Check whether a rule pattern matches a tool invocation.
 * - "Tool"               → matches when rule's tool part == toolName (with no ":")
 * - "Tool:substring"     → tool part == toolName AND any arg value contains substring
 * - "*"                  → matches everything
 */
function matchesPattern(
  rule: string,
  toolName: string,
  args: Record<string, unknown>,
): boolean {
  if (rule === "*") return true;

  const colon = rule.indexOf(":");
  if (colon === -1) {
    return rule.toLowerCase() === toolName.toLowerCase();
  }

  const tool = rule.slice(0, colon).toLowerCase();
  const pattern = rule.slice(colon + 1);
  if (tool !== "*" && tool !== toolName.toLowerCase()) return false;

  const values = Object.values(args).map((v) => String(v).toLowerCase());

  // Simple glob-ish prefix: "Bash:npm run*" matches any arg value starting with "npm run"
  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1).toLowerCase();
    return values.some((v) => v.startsWith(prefix));
  }
  return values.some((v) => v.includes(pattern.toLowerCase()));
}

/**
 * Decide whether a tool call is allowed, denied, or should be asked about.
 * Deny wins over allow.
 */
export function decide(
  rules: PermissionConfig,
  toolName: string,
  args: Record<string, unknown>,
): PermissionDecision {
  for (const rule of rules.deny ?? []) {
    if (matchesPattern(rule, toolName, args)) return "deny";
  }
  for (const rule of rules.allow ?? []) {
    if (matchesPattern(rule, toolName, args)) return "allow";
  }

  return "ask";
}

/** Format rules for display (e.g. /permissions). */
export function formatRules(rules: PermissionConfig): string {
  const lines: string[] = [];
  lines.push(chalkBullet("Allow", rules.allow));
  lines.push(chalkBullet("Deny", rules.deny));
  return lines.filter(Boolean).join("\n") || "  (no rules — every tool call is asked)";
}

function chalkBullet(label: string, rules: string[] | undefined): string {
  if (!rules || rules.length === 0) return "";
  return `  ${label}: ${rules.join(", ")}`;
}
