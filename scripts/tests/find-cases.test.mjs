import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
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

test("a bare query without --keyword exits 2 instead of returning the unfiltered corpus", () => {
  const r = spawnSync("node", [script, "breaking news vertical"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--keyword/);
});

test("upstream_removed cases are hidden unless --include-removed", () => {
  const all = JSON.parse(run("--limit", "5000", "--json"));
  assert.ok(all.length > 0 && all.every((r) => !r.upstream_removed));
  const withRemoved = JSON.parse(run("--limit", "5000", "--json", "--include-removed"));
  assert.ok(withRemoved.some((r) => r.upstream_removed));
  assert.equal(withRemoved.length - all.length, withRemoved.filter((r) => r.upstream_removed).length);
});
