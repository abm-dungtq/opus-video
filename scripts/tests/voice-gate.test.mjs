import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { voiceGate, briefOverride, GATE_EXIT } from "../voice-gate.mjs";
import { fakeVp, RECORD } from "./fixtures/fake-vp.mjs";

const eleven = fileURLToPath(new URL("../eleven.mjs", import.meta.url));
const PASS = () => ({ pass: true, errors: [] });
const FAIL = () => ({ pass: false, errors: ["no viet_pro record"] });

function proj({ fm = "", voice = ["Xin chào bạn"], record = "" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "vg-"));
  writeFileSync(join(dir, "BRIEF.md"), `---\nlanguage: vi\n${fm}---\n\n${record}\n`);
  mkdirSync(join(dir, "script"));
  voice.forEach((v, i) => writeFileSync(join(dir, "script", `0${i + 1}.txt`), v + "\n"));
  return dir;
}
const clean = (...d) => d.forEach((x) => rmSync(x, { recursive: true, force: true }));

test("non-vi project (check skipped) passes without further checks", () => {
  const g = voiceGate({ project: "/nowhere", inline: true, voiceLang: "en", checkImpl: () => ({ skipped: true, pass: true }) });
  assert.equal(g.ok, true);
  assert.equal(g.skipped, true);
});

test("non-vi BRIEF but the voice language is vi (the default) → refused, fails closed", () => {
  const g = voiceGate({ project: "/nowhere", checkImpl: () => ({ skipped: true, pass: true, reason: "language: en" }) });
  assert.equal(g.ok, false);
  assert.match(g.messages[0], /voice language is vi/);
});

test("a failing check blocks with FAIL lines and a BLOCKED line", () => {
  const dir = proj();
  try {
    const g = voiceGate({ project: dir, textFiles: [join(dir, "script", "01.txt")], checkImpl: FAIL });
    assert.equal(g.ok, false);
    assert.ok(g.messages.some((m) => m.startsWith("FAIL ")));
    assert.ok(g.messages.some((m) => m.startsWith("BLOCKED")));
  } finally { clean(dir); }
});

test("tts text must be <project>/script/NN.txt; --text inline is refused", () => {
  const dir = proj();
  const other = mkdtempSync(join(tmpdir(), "vg-x-"));
  writeFileSync(join(other, "x.txt"), "Xin chào bạn\n");
  writeFileSync(join(dir, "script", "notes.txt"), "x\n");
  try {
    assert.equal(voiceGate({ project: dir, textFiles: [join(dir, "script", "01.txt")], checkImpl: PASS }).ok, true);
    assert.equal(voiceGate({ project: dir, textFiles: [join(other, "x.txt")], checkImpl: PASS }).ok, false);
    assert.equal(voiceGate({ project: dir, textFiles: [join(dir, "script", "notes.txt")], checkImpl: PASS }).ok, false);
    const g = voiceGate({ project: dir, inline: true, checkImpl: PASS });
    assert.equal(g.ok, false);
    assert.match(g.messages[0], /--text is not allowed/);
  } finally { clean(dir, other); }
});

test("SCRIPT.md frames must equal script/NN.txt (whitespace-insensitive); extra script files are fine", () => {
  const dir = proj({ voice: ["Xin  chào\nbạn", "Câu thừa"] });
  try {
    assert.equal(voiceGate({ project: dir, frames: [{ frame: 1, text: "Xin chào bạn" }], checkImpl: PASS }).ok, true);
    const diff = voiceGate({ project: dir, frames: [{ frame: 1, text: "Chào cả nhà" }], checkImpl: PASS });
    assert.equal(diff.ok, false);
    assert.match(diff.messages[0], /Frame 1 text differs from script\/01\.txt/);
    const missing = voiceGate({ project: dir, frames: [{ frame: 3, text: "x" }], checkImpl: PASS });
    assert.equal(missing.ok, false);
    assert.match(missing.messages[0], /script\/03\.txt missing for Frame 3/);
  } finally { clean(dir); }
});

test("override needs a BRIEF.md reason of at least 10 chars and reports it", () => {
  const short = proj({ fm: "viet_pro_override: gấp\n" });
  const long = proj({ fm: "viet_pro_override: khách chỉ cần nghe thử giọng\n" });
  try {
    assert.equal(briefOverride(long), "khách chỉ cần nghe thử giọng");
    const s = voiceGate({ project: short, skip: true, checkImpl: FAIL });
    assert.equal(s.ok, false);
    assert.match(s.messages[0], /viet_pro_override/);
    const l = voiceGate({ project: long, skip: true, inline: true, checkImpl: FAIL });
    assert.equal(l.ok, true);
    assert.equal(l.override, "khách chỉ cần nghe thử giọng");
    assert.match(l.messages[0], /^OVERRIDE viet-pro gate: /);
  } finally { clean(short, long); }
});

const cliEnv = (home, vp) => ({ ...process.env, HOME: home, ELEVENLABS_API_KEY: "dummy", VIET_PRO_DIR: vp });

test("eleven.mjs tts exits 4 before any API call on a vi project without a viet_pro record", () => {
  const vp = fakeVp(), dir = proj(), home = mkdtempSync(join(tmpdir(), "vg-home-"));
  try {
    const out = join(dir, "a.mp3");
    const r = spawnSync("node", [eleven, "tts", "--text-file", join(dir, "script", "01.txt"), "--out", out], { encoding: "utf8", env: cliEnv(home, vp) });
    assert.equal(r.status, GATE_EXIT, r.stderr);
    assert.match(r.stderr, /BLOCKED/);
    assert.equal(existsSync(out), false);
  } finally { clean(vp, dir, home); }
});

test("eleven.mjs audio-meta exits 4 when a SCRIPT.md frame differs from script/NN.txt", () => {
  const vp = fakeVp(), dir = proj({ record: RECORD() }), home = mkdtempSync(join(tmpdir(), "vg-home-"));
  const table = "| Thời điểm | Voice-over | Visual |\n|---|---|---|\n| 0-3s | Xin chào bạn | logo |\n";
  writeFileSync(join(dir, "script-table.md"), table);
  writeFileSync(join(dir, "script-table.v1.md"), table);
  writeFileSync(join(dir, "SCRIPT.md"), "## Line 1 — hook (Frame 1)\n\n    Chào cả nhà\n");
  try {
    const r = spawnSync("node", [eleven, "audio-meta", "--script", join(dir, "SCRIPT.md"), "--hyperframes", dir], { encoding: "utf8", env: cliEnv(home, vp) });
    assert.equal(r.status, GATE_EXIT, r.stderr);
    assert.match(r.stderr, /differs/);
    assert.equal(existsSync(join(dir, "assets", "voice", "01.mp3")), false);
  } finally { clean(vp, dir, home); }
});

test("stamps: --reuse trusts only a non-override stamp for the same normalized text", async () => {
  const { writeStamp, stampMatches } = await import("../script-md.mjs");
  const d = mkdtempSync(join(tmpdir(), "vg-st-")), mp3 = join(d, "01.mp3");
  try {
    writeFileSync(mp3, "x");
    assert.equal(stampMatches(mp3, "Xin chào"), false);
    writeStamp(mp3, { text: "Xin  chào\n" });
    assert.equal(stampMatches(mp3, "Xin chào"), true);
    assert.equal(stampMatches(mp3, "Chào"), false);
    writeStamp(mp3, { text: "Xin chào", override: "khách duyệt giọng thử" });
    assert.equal(stampMatches(mp3, "Xin chào"), false);
  } finally { clean(d); }
});

test("voiceGate returns the exact gated text for tts", () => {
  const dir = proj({ voice: ["Xin chào bạn"] });
  try {
    assert.deepEqual(voiceGate({ project: dir, textFiles: [join(dir, "script", "01.txt")], checkImpl: PASS }).texts, ["Xin chào bạn"]);
  } finally { clean(dir); }
});

test("probe-models rejects the removed --outdir flag", () => {
  const home = mkdtempSync(join(tmpdir(), "vg-home-"));
  try {
    const r = spawnSync("node", [eleven, "probe-models", "--text", "x", "--outdir", "/tmp"], { encoding: "utf8", env: { ...process.env, HOME: home, ELEVENLABS_API_KEY: "dummy" } });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--outdir was removed/);
  } finally { clean(home); }
});
