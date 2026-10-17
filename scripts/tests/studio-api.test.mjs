import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as api from "../studio-api.mjs";
import * as director from "../../studio/director.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "");

test("studio-api exposes the plugin surface Studio needs", () => {
  for (const k of ["load", "validate", "patch", "undo", "readHistory", "derive", "enqueue", "list", "next", "finish", "cancelRequest", "ask", "answer", "expireWaiting"]) assert.equal(typeof api[k], "function", k);
  for (const k of ["SCHEMA", "FILE", "EXIT", "ACTORS", "STATUSES", "ASK_KINDS", "ASK_GATES", "ID"]) assert.ok(api[k] !== undefined, k);
  assert.equal(api.OV, ROOT);
  assert.ok(!api.OV.endsWith("/"));
  assert.equal(api.PLUGIN_VERSION, JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "plugin.json"), "utf8")).version);
  assert.equal(api.STUDIO_API, 2);
  assert.equal(api.SCRIPTS, join(ROOT, "scripts"));
  assert.ok(existsSync(api.DIRECTIONS_FILE));
  assert.deepEqual(director.DENIED_TOOLS, api.DENIED_TOOLS);
  assert.deepEqual(director.MCP_TOOLS, api.MCP_TOOLS);
});

test("Studio reaches the plugin only through studio-api.mjs", () => {
  const studio = join(ROOT, "studio");
  for (const f of readdirSync(studio).filter((x) => x.endsWith(".mjs"))) {
    assert.doesNotMatch(readFileSync(join(studio, f), "utf8"), /from "\.\.\/scripts\/(manifest|gateway|requests)\.mjs"/, f);
  }
});
