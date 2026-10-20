import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as api from "../studio-api.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "");

test("studio-api exposes the plugin surface Studio needs", () => {
  for (const k of ["load", "validate", "patch", "undo", "redo", "redoTarget", "readHistory", "derive", "enqueue", "list", "next", "finish", "cancelRequest", "ask", "answer", "expireWaiting"]) assert.equal(typeof api[k], "function", k);
  for (const k of ["SCHEMA", "FILE", "EXIT", "ACTORS", "STATUSES", "ASK_KINDS", "ASK_GATES", "ID"]) assert.ok(api[k] !== undefined, k);
  assert.equal(api.OV, ROOT);
  assert.ok(!api.OV.endsWith("/"));
  assert.equal(api.PLUGIN_VERSION, JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "plugin.json"), "utf8")).version);
  assert.equal(api.STUDIO_API, 3);
  assert.equal(api.SCRIPTS, join(ROOT, "scripts"));
  assert.ok(existsSync(api.DIRECTIONS_FILE));
  for (const k of ["MCP_TOOLS", "ALLOWED_TOOLS", "DENIED_TOOLS"]) assert.ok(Array.isArray(api[k]) && api[k].length, k);
});

test("the director writes only through acceptEdits in its cwd: no Edit or Write allow rule", () => {
  assert.ok(!api.ALLOWED_TOOLS.some((t) => /^(Edit|Write|MultiEdit|NotebookEdit)\b/.test(t)), "an Edit/Write allow rule reaches files outside the project");
  assert.ok(api.DENIED_TOOLS.includes(`Edit(/${api.OV}/**)`) && api.DENIED_TOOLS.includes(`Write(/${api.OV}/**)`));
});
