// The director Studio runs (`claude -p`, MOTION_STUDIO_RUNNER or OPUS_STUDIO_RUNNER = cli) matches
// its Bash rules as text, so a quoted or reshaped command slips past a deny rule. The scripts check
// it themselves: in an episode of a series, eleven.mjs runs only sfx and music for the director, and
// no director records the user's "heard it" line (make-demo --record-audio-review).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SERIES_FILE } from "../manifest.mjs";

const SCRIPTS = fileURLToPath(new URL("..", import.meta.url));
const eleven = join(SCRIPTS, "eleven.mjs");
const makeDemo = join(SCRIPTS, "make-demo.mjs");
const REFUSED = /not run by the Studio director/;

// A workspace with a series folder, one episode of it and one ordinary project. No key anywhere:
// HOME is empty and ELEVENLABS_API_KEY is blank, so no command can reach the API.
function workspace() {
  const root = mkdtempSync(join(tmpdir(), "director-guard-"));
  mkdirSync(join(root, "series", "s1"), { recursive: true });
  writeFileSync(join(root, "series", "s1", SERIES_FILE), JSON.stringify({ name: "s1" }));
  for (const [name, brief] of [["ep", "---\nseries: ../series/s1\nlanguage: vi\n---\n# Brief\n"], ["plain", "---\nlanguage: vi\n---\n# Brief\n"]]) {
    mkdirSync(join(root, name, "script"), { recursive: true });
    writeFileSync(join(root, name, "BRIEF.md"), brief);
    writeFileSync(join(root, name, "script", "01.txt"), "Xin chào.\n");
    writeFileSync(join(root, name, "SCRIPT.md"), "## Line 1 — hook (Frame 1)\n\n    Xin chào.\n");
  }
  mkdirSync(join(root, "home"));
  return root;
}
const envOf = (root, runner) => {
  const env = { ...process.env, HOME: join(root, "home"), ELEVENLABS_API_KEY: "", VIET_PRO_DIR: join(root, "no-viet-pro") };
  delete env.MOTION_STUDIO_RUNNER; delete env.OPUS_STUDIO_RUNNER;
  return { ...env, ...runner };
};
const run = (file, args, cwd, env) => spawnSync(process.execPath, [file, ...args], { cwd, env, encoding: "utf8", timeout: 30000 });
const argsFor = (root, p) => ({
  tts: ["tts", "--text-file", join(root, p, "script", "01.txt"), "--out", join(root, p, "a.mp3")],
  "audio-meta": ["audio-meta", "--script", join(root, p, "SCRIPT.md"), "--hyperframes", join(root, p)],
  "probe-models": ["probe-models", "--text", "thử", "--models", "m1"],
  doctor: ["doctor"], "voice-info": ["voice-info"], models: ["models"],
  sfx: ["sfx", "--text", "click", "--seconds", "1", "--out", join(root, p, "s.mp3")],
  music: ["music", "--prompt", "calm", "--seconds", "5", "--out", join(root, p, "m.mp3")],
});
const ALLOWED = ["sfx", "music"];

test("the director of a series episode runs only sfx and music of eleven.mjs", () => {
  const root = workspace();
  try {
    for (const runner of [{ OPUS_STUDIO_RUNNER: "cli" }, { MOTION_STUDIO_RUNNER: "cli" }]) {
      for (const [cmd, args] of Object.entries(argsFor(root, "ep"))) {
        const r = run(eleven, args, join(root, "ep"), envOf(root, runner));
        if (ALLOWED.includes(cmd)) {
          assert.doesNotMatch(r.stderr, REFUSED, `${cmd}: ${r.stderr}`);
          assert.notEqual(r.status, 5, cmd);
        } else {
          assert.equal(r.status, 5, `${cmd} ${JSON.stringify(runner)}: ${r.stdout}${r.stderr}`);
          assert.match(r.stderr, REFUSED, cmd);
          assert.doesNotMatch(r.stdout, /\| (ok|fail) \|/, `${cmd} tried a model`);
        }
      }
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("an episode named by --project, --text-file or --hyperframes is refused from another cwd too", () => {
  const root = workspace();
  try {
    const env = envOf(root, { OPUS_STUDIO_RUNNER: "cli" });
    for (const args of [argsFor(root, "ep").tts, argsFor(root, "ep")["audio-meta"], [...argsFor(root, "plain").tts, "--project", join(root, "ep")], ["probe-models", "--text", "x", "--project", join(root, "ep")]]) {
      const r = run(eleven, args, join(root, "plain"), env);
      assert.equal(r.status, 5, `${args.join(" ")}: ${r.stderr}`);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("outside a series, or without the director, eleven.mjs is not refused", () => {
  const root = workspace();
  try {
    const cases = [["plain", { OPUS_STUDIO_RUNNER: "cli" }], ["ep", {}], ["ep", { OPUS_STUDIO_RUNNER: "mcp" }]];
    for (const [p, runner] of cases) {
      for (const cmd of ["tts", "probe-models", "doctor"]) {
        const r = run(eleven, argsFor(root, p)[cmd], join(root, p), envOf(root, runner));
        assert.notEqual(r.status, 5, `${p} ${cmd} ${JSON.stringify(runner)}: ${r.stderr}`);
        assert.doesNotMatch(r.stderr, REFUSED);
      }
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("every eleven.mjs command but sfx and music is in the refused list and the deny rules", async () => {
  const { ELEVEN_DIRECTOR_COMMANDS, ELEVEN_REFUSED } = await import("../director-guard.mjs");
  const api = await import("../studio-api.mjs");
  const root = workspace();
  let usage;
  try { usage = spawnSync(process.execPath, [eleven], { encoding: "utf8", env: envOf(root, {}) }).stderr.match(/<([^>]+)>/)[1].split("|"); }
  finally { rmSync(root, { recursive: true, force: true }); }
  assert.deepEqual([...ELEVEN_DIRECTOR_COMMANDS], ALLOWED);
  assert.deepEqual([...ELEVEN_REFUSED].sort(), usage.filter((c) => !ALLOWED.includes(c)).sort());
  for (const c of ELEVEN_REFUSED) assert.ok(api.VOICE_DENIED_TOOLS.includes(`Bash(*eleven.mjs ${c}*)`), c);
  assert.ok(api.DENIED_TOOLS.includes("Bash(*--record-audio-review*)"));
});

test("make-demo --record-audio-review refuses the director and leaves DEMO.md alone; Studio still records it", () => {
  const root = workspace();
  try {
    const dir = join(root, "plain");
    writeFileSync(join(dir, "index.html"), "<html><body><div data-composition-id=\"main\"></div></body></html>\n");
    writeFileSync(join(dir, "DEMO.md"), "# Demo\n\napproval: pending\n\n## Frames\n");
    const before = readFileSync(join(dir, "DEMO.md"), "utf8");
    for (const runner of [{ OPUS_STUDIO_RUNNER: "cli" }, { MOTION_STUDIO_RUNNER: "cli" }]) {
      const r = run(makeDemo, ["--project", dir, "--record-audio-review", "user@studio"], dir, envOf(root, runner));
      assert.equal(r.status, 2, r.stderr);
      assert.match(r.stderr, /user's confirmation/);
      assert.equal(readFileSync(join(dir, "DEMO.md"), "utf8"), before);
    }
    // Studio runs the same command for the user's click, without the director's variable.
    const r = run(makeDemo, ["--project", dir, "--record-audio-review", "user@studio"], dir, envOf(root, {}));
    assert.equal(r.status, 0, r.stderr);
    assert.match(readFileSync(join(dir, "DEMO.md"), "utf8"), /^audio_review: user@studio \S+ [0-9a-f]{64}$/m);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
