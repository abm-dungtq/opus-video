// Guards against name drift: every blueprint / rule / preset cited in pattern-library.md and edit-method.md
// must still exist in the vendored HyperFrames recipes (third_party/hyperframes-skills) or, for presets,
// the installed hyperframes skill.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { upstream } from "../directions.mjs";

const up = upstream();
const lib = ["pattern-library.md", "edit-method.md"]
  .map((f) => readFileSync(new URL(`../../references/${f}`, import.meta.url), "utf8"))
  .join("\n");
const names = (dir) => new Set(readdirSync(dir).map((f) => f.replace(/\.md$/, "")));
const cited = (kind) => [...lib.matchAll(new RegExp(`${kind} \`([a-z0-9-]+)\``, "g"))].map((m) => m[1]);

for (const [kind, dir] of [
  ["blueprint", join(up.anim, "blueprints")],
  ["rule", join(up.anim, "rules")],
  ["preset", up.presets],
]) {
  test(`${kind} names exist`, () => {
    const have = names(dir);
    const missing = [...new Set(cited(kind))].filter((n) => !have.has(n));
    assert.deepEqual(missing, [], `${kind} names missing from ${dir}`);
  });
}

test("upstream reads the vendored HyperFrames recipes first", async () => {
  const { VENDOR } = await import("../directions.mjs");
  assert.equal(up.anim, join(VENDOR, "hyperframes-animation"));
  assert.equal(up.creative, join(VENDOR, "hyperframes-creative"));
  assert.equal(up.faceless, join(VENDOR, "faceless-explainer"));
  const fallback = upstream("/nonexistent-vendor");
  assert.notEqual(fallback.anim, up.anim);
});
