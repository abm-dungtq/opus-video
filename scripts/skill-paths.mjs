// skill-paths.mjs — find sibling skills (viet-pro, hyperframes, …) on any agent host.
// Search order: the skills dir this skill is installed in (sibling), then the user-level dirs of
// Claude Code, Codex, Antigravity (app/IDE and CLI), then the workspace dirs of the cwd.
// A skill counts as found when <root>/<name>/SKILL.md exists.

import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const OV_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

export function skillRoots({ home = homedir(), cwd = process.cwd(), ovDir = OV_DIR } = {}) {
  const roots = [
    dirname(ovDir),
    join(home, ".claude", "skills"),
    join(home, ".agents", "skills"),
    join(home, ".codex", "skills"),
    join(home, ".gemini", "config", "skills"),
    join(home, ".gemini", "antigravity-cli", "skills"),
    join(cwd, ".claude", "skills"),
    join(cwd, ".agents", "skills"),
  ];
  const seen = new Set();
  return roots.filter((r) => {
    let key = r;
    try { key = realpathSync(r); } catch { return false; }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// → absolute dir of the skill, or "" when not installed anywhere.
export function findSkill(name, opts = {}) {
  for (const root of skillRoots(opts)) if (existsSync(join(root, name, "SKILL.md"))) return join(root, name);
  return "";
}
