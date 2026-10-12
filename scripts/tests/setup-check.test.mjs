import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { semverGte, envKeys, runChecks, CORE_SKILLS, WORKFLOW_SKILLS } from "../setup-check.mjs";
import { findSkill, skillRoots } from "../skill-paths.mjs";

test("semverGte", () => {
  assert.equal(semverGte("0.8.144", "0.8.144"), true);
  assert.equal(semverGte("0.9.0", "0.8.144"), true);
  assert.equal(semverGte("0.8.99", "0.8.144"), false);
});

test("envKeys returns names with values only, never values", () => {
  const d = mkdtempSync(join(tmpdir(), "sc-"));
  try {
    writeFileSync(join(d, ".env"), "ELEVENLABS_API_KEY=abc\nOPUS_VIDEO_VOICE_ID=\n# x\n");
    const k = envKeys(join(d, ".env"), {});
    assert.equal(k.has("ELEVENLABS_API_KEY"), true);
    assert.equal(k.has("OPUS_VIDEO_VOICE_ID"), false);
    assert.ok(![...k].includes("abc"));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("findSkill searches every agent host dir (Codex, Antigravity) and workspace dirs", () => {
  const home = mkdtempSync(join(tmpdir(), "sc-home-")), cwd = mkdtempSync(join(tmpdir(), "sc-cwd-"));
  try {
    for (const [root, name] of [[".agents/skills", "viet-pro"], [".gemini/config/skills", "media-use"]]) {
      mkdirSync(join(home, root, name), { recursive: true });
      writeFileSync(join(home, root, name, "SKILL.md"), "x");
    }
    mkdirSync(join(cwd, ".claude", "skills", "slideshow"), { recursive: true });
    writeFileSync(join(cwd, ".claude", "skills", "slideshow", "SKILL.md"), "x");
    const o = { home, cwd, ovDir: join(home, "nowhere", "opus-video") };
    assert.equal(findSkill("viet-pro", o), join(home, ".agents", "skills", "viet-pro"));
    assert.equal(findSkill("media-use", o), join(home, ".gemini", "config", "skills", "media-use"));
    assert.equal(findSkill("slideshow", o), join(cwd, ".claude", "skills", "slideshow"));
    assert.equal(findSkill("nope", o), "");
    assert.ok(skillRoots(o).length >= 3);
  } finally { rmSync(home, { recursive: true, force: true }); rmSync(cwd, { recursive: true, force: true }); }
});

test("runChecks: every required item missing → MISSING with a fix; optional ones only WARN", () => {
  const items = runChecks({ findSkillImpl: () => "", versionImpl: () => null, keys: new Set() });
  const missing = items.filter((i) => i.level === "missing").map((i) => i.name);
  for (const s of ["viet-pro", ...CORE_SKILLS, ...WORKFLOW_SKILLS]) assert.ok(missing.includes(`skill ${s}`), s);
  for (const n of ["git", "ffmpeg", "ffprobe", "hyperframes CLI", "ELEVENLABS_API_KEY", "OPUS_VIDEO_VOICE_ID"]) assert.ok(missing.includes(n), n);
  assert.ok(items.filter((i) => i.level === "missing").every((i) => i.fix));
  assert.deepEqual(items.filter((i) => i.level === "warn").map((i) => i.name), ["agy (optional)", "TYPESAFE_API_KEY (optional)", "Remotion skill (optional)"]);
});

test("runChecks: everything present → no MISSING", () => {
  const items = runChecks({
    findSkillImpl: (n) => `/skills/${n}`,
    versionImpl: (cmd) => (cmd === "npx" ? "0.8.144" : "ok"),
    keys: new Set(["ELEVENLABS_API_KEY", "OPUS_VIDEO_VOICE_ID", "TYPESAFE_API_KEY"]),
  });
  assert.deepEqual(items.filter((i) => i.level !== "ok"), []);
});
