// Guards against name drift: every blueprint / rule / preset cited in pattern-library.md and edit-method.md
// must still exist in the installed HyperFrames skills.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const skills = join(homedir(), ".claude/skills");
const lib = ["pattern-library.md", "edit-method.md"]
  .map((f) => readFileSync(new URL(`../../references/${f}`, import.meta.url), "utf8"))
  .join("\n");
const names = (dir) => new Set(readdirSync(join(skills, dir)).map((f) => f.replace(/\.md$/, "")));
const cited = (kind) => [...lib.matchAll(new RegExp(`${kind} \`([a-z0-9-]+)\``, "g"))].map((m) => m[1]);

for (const [kind, dir] of [
  ["blueprint", "hyperframes-animation/blueprints"],
  ["rule", "hyperframes-animation/rules"],
  ["preset", "hyperframes-creative/frame-presets"],
]) {
  test(`${kind} names exist`, () => {
    const have = names(dir);
    const missing = [...new Set(cited(kind))].filter((n) => !have.has(n));
    assert.deepEqual(missing, [], `${kind} names missing from ${dir}`);
  });
}
