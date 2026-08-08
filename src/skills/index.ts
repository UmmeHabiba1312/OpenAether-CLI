import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface Skill {
  name: string;
  description: string;
  content: string;
  source: "global" | "project";
}

/**
 * SkillManager — discovers and loads reusable skill packages.
 *
 * A skill is a markdown file with YAML-style frontmatter:
 *
 *   ---
 *   name: code-review
 *   description: Review code for bugs and security issues
 *   ---
 *   <instructions>
 */
export class SkillManager {
  private globalDir = join(homedir(), ".openaether", "skills");
  private projectDir: string;

  constructor(projectDir?: string) {
    this.projectDir = projectDir ? resolve(projectDir, "skills") : resolve(process.cwd(), "skills");
  }

  /**
   * Parse a skill markdown file into a Skill object.
   */
  parse(content: string, source: "global" | "project"): Skill | null {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
    if (!match) return null;

    const frontmatter = match[1];
    const body = match[2];

    const nameMatch = frontmatter.match(/name:\s*(.+)/);
    const descMatch = frontmatter.match(/description:\s*(.+)/);

    if (!nameMatch) return null;

    return {
      name: nameMatch[1].trim(),
      description: (descMatch?.[1] || "").trim(),
      content: body.trim(),
      source,
    };
  }

  /**
   * Discover all available skills (project first, then global).
   */
  async list(): Promise<Skill[]> {
    const skills: Skill[] = [];
    const seen = new Set<string>();

    // Project skills take priority
    for (const dir of [this.projectDir, this.globalDir]) {
      if (!existsSync(dir)) continue;

      let files: string[] = [];
      try {
        files = await readdir(dir);
      } catch {
        continue;
      }

      for (const file of files) {
        if (!file.endsWith(".md")) continue;
        try {
          const content = await readFile(join(dir, file), "utf-8");
          const skill = this.parse(content, dir === this.globalDir ? "global" : "project");
          if (skill && !seen.has(skill.name)) {
            seen.add(skill.name);
            skills.push(skill);
          }
        } catch {
          // skip unreadable files
        }
      }
    }

    return skills;
  }

  /**
   * Find a skill by name.
   */
  async find(name: string): Promise<Skill | null> {
    const all = await this.list();
    return all.find((s) => s.name === name.toLowerCase()) || null;
  }
}
