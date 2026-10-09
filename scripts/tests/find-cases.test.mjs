import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../find-cases.mjs", import.meta.url));
const run = (...args) => execFileSync("node", [script, ...args], { encoding: "utf8" });

test("filters by category", () => {
  const rows = JSON.parse(run("--category", "3d", "--limit", "10", "--json"));
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => r.category === "3d"));
});

test("honours --limit", () => {
  assert.equal(JSON.parse(run("--limit", "2", "--json")).length, 2);
});

test("json output carries attribution", () => {
  const rows = JSON.parse(run("--keyword", "cursor", "--full-only", "--json"));
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => r.has_full_prompt && r.url && r.author && r.license === "MIT"));
});
