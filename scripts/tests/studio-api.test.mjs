import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as api from "../studio-api.mjs";
import { findSkill } from "../skill-paths.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "");

test("studio-api exposes the plugin surface Studio needs", () => {
  for (const k of ["load", "validate", "patch", "undo", "redo", "redoTarget", "readHistory", "derive", "enqueue", "list", "next", "finish", "cancelRequest", "ask", "answer", "expireWaiting"]) assert.equal(typeof api[k], "function", k);
  for (const k of ["SCHEMA", "FILE", "EXIT", "ACTORS", "STATUSES", "ASK_KINDS", "ASK_GATES", "ID"]) assert.ok(api[k] !== undefined, k);
  assert.equal(api.OV, ROOT);
  assert.ok(!api.OV.endsWith("/"));
  assert.equal(api.PLUGIN_VERSION, JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "plugin.json"), "utf8")).version);
  assert.equal(api.STUDIO_API, 4);
  assert.equal(api.SCRIPTS, join(ROOT, "scripts"));
  assert.ok(existsSync(api.DIRECTIONS_FILE));
  for (const k of ["MCP_TOOLS", "ALLOWED_TOOLS", "DENIED_TOOLS"]) assert.ok(Array.isArray(api[k]) && api[k].length, k);
});

test("the director writes only through acceptEdits in its cwd: no Edit or Write allow rule", () => {
  assert.ok(!api.ALLOWED_TOOLS.some((t) => /^(Edit|Write|MultiEdit|NotebookEdit)\b/.test(t)), "an Edit/Write allow rule reaches files outside the project");
  assert.ok(api.DENIED_TOOLS.includes(`Edit(/${api.OV}/**)`) && api.DENIED_TOOLS.includes(`Write(/${api.OV}/**)`));
});

test("API 4: SKILLS names installed skills; COMMANDS are absolute paths to scripts that exist", () => {
  assert.ok(Array.isArray(api.SKILLS) && api.SKILLS.length);
  for (const s of api.SKILLS) assert.ok(existsSync(join(ROOT, "skills", s, "SKILL.md")), s);
  const { choose, suggest, pitchInit, platform, ...scripts } = api.COMMANDS;
  assert.deepEqual(Object.keys(scripts).sort(), ["captions", "cases", "demo", "export", "import", "mix", "mixBalance", "pitch", "preflight", "recipe", "render", "styles", "timing", "vietPro"]);
  for (const [k, f] of Object.entries(scripts)) {
    assert.ok(isAbsolute(f) && f.startsWith(api.SCRIPTS + "/") && f.endsWith(".mjs"), k);
    assert.ok(existsSync(f), `${k}: ${f}`);
  }
  assert.equal(choose.file, api.COMMANDS.pitch);
  assert.deepEqual(choose.args, ["choose", "--project", "{project}", "--pick", "{pick}", "--accept-warnings"]);
  assert.equal(suggest.file, join(api.SCRIPTS, "suggest.mjs"));
  assert.equal(pitchInit.file, api.COMMANDS.pitch);
  assert.equal(pitchInit.args[0], "init");
  assert.ok(Object.isFrozen(api.COMMANDS) && Object.isFrozen(choose.args) && Object.isFrozen(suggest.args) && Object.isFrozen(pitchInit.args) && Object.isFrozen(api.SKILLS));
});

test("the choose command is the one the director is denied: only Studio runs the direction gate", () => {
  const { file, args } = api.COMMANDS.choose;
  assert.ok(api.DENIED_TOOLS.includes(`Bash(node ${file} ${args[0]}*)`));
});

test("platform is viet-pro's check-platform.mjs, found among the skills, or null without viet-pro", () => {
  const vp = findSkill("viet-pro");
  if (!vp) { assert.equal(api.COMMANDS.platform, null); return; }
  assert.equal(api.COMMANDS.platform, join(vp, "scripts", "check-platform.mjs"));
  assert.ok(isAbsolute(api.COMMANDS.platform));
});

test("VOICE_DENIED_TOOLS closes the voice commands of eleven.mjs and leaves sfx and music", () => {
  const eleven = join(api.SCRIPTS, "eleven.mjs");
  assert.deepEqual([...api.VOICE_DENIED_TOOLS], [`Bash(node ${eleven} tts*)`, `Bash(node ${eleven} audio-meta*)`]);
  assert.ok(Object.isFrozen(api.VOICE_DENIED_TOOLS));
  // A Bash rule's * is a glob over the whole command line.
  const matches = (rule, cmd) => new RegExp("^" + rule.slice(5, -1).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$").test(cmd);
  for (const cmd of [`node ${eleven} tts --help`, `node ${eleven} audio-meta --project .`]) assert.ok(api.VOICE_DENIED_TOOLS.some((r) => matches(r, cmd)), cmd);
  for (const cmd of [`node ${eleven} sfx --help`, `node ${eleven} music --prompt x`, `node ${eleven} voice-info`]) assert.ok(!api.VOICE_DENIED_TOOLS.some((r) => matches(r, cmd)), cmd);
  assert.ok(!api.DENIED_TOOLS.some((r) => api.VOICE_DENIED_TOOLS.includes(r)), "not denied for every project");
});
