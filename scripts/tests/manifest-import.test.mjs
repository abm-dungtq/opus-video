// manifest-import.mjs: project.json for a project that has none, without changing any existing file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { importProject, main } from "../manifest-import.mjs";
import { load, validate } from "../manifest.mjs";
import { readHistory } from "../gateway.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/timing", import.meta.url));
const io = () => { const buf = { out: "", err: "" }; return { buf, io: { out: (s) => { buf.out += s; }, err: (s) => { buf.err += s; } } }; };
const tmp = () => mkdtempSync(join(tmpdir(), "import-"));
const hashes = (dir) => {
  const out = {};
  const walk = (d) => { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p); else out[relative(dir, p)] = createHash("sha256").update(readFileSync(p)).digest("hex"); } };
  walk(dir);
  return out;
};

test("skeleton project: shots from PLAN.md, the voice line, editable, valid", () => {
  const dir = tmp();
  try {
    cpSync(FIXTURE, dir, { recursive: true });
    const { manifest: m, source } = importProject(dir);
    assert.equal(source, "PLAN.md");
    assert.deepEqual(validate(m), []);
    assert.deepEqual(m.shots.map((s) => [s.id, s.start, s.end]), [["s1", 0, 2.5], ["s2", 2.5, 5.8], ["s3", 5.8, 8]]);
    assert.deepEqual(m.lines.map((l) => [l.id, l.shot, l.start, l.duration, l.gate, l.file]), [["vo-01", "s2", 2.5, 3, "unknown", "assets/voice/01.mp3"]]);
    assert.match(m.lines[0].text, /^Bạn đưa/);
    assert.deepEqual(m.capabilities, { timing_markers: true, editable: true });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("--write adds only project.json and .opus/, and every existing file keeps its bytes", () => {
  const dir = tmp();
  try {
    cpSync(FIXTURE, dir, { recursive: true });
    const before = hashes(dir);
    const { buf, io: o } = io();
    assert.equal(main(["--project", dir, "--write"], o), 0, buf.err);
    const after = hashes(dir);
    for (const [f, h] of Object.entries(before)) assert.equal(after[f], h, `${f} changed`);
    const added = Object.keys(after).filter((f) => !(f in before)).sort();
    assert.deepEqual(added, [".opus/history.jsonl", ".opus/versions/v1.json", "project.json"]);
    assert.equal(readHistory(dir)[0].actor, "import");
    assert.match(buf.out, /IMPORT .* shots=3 lines=1 music=0 editable=true/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("an existing project.json is refused (exit 6); --force imports it as the next version", () => {
  const dir = tmp();
  try {
    cpSync(FIXTURE, dir, { recursive: true });
    assert.equal(main(["--project", dir, "--write"], io().io), 0);
    assert.equal(main(["--project", dir, "--write"], io().io), 6);
    assert.equal(main(["--project", dir, "--write", "--force"], io().io), 0);
    assert.equal(load(dir).version, 2);
    assert.equal(readHistory(dir).length, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("old project without PLAN.md: shots from scene sub-compositions, captions overlay skipped, view only", () => {
  const dir = tmp();
  try {
    mkdirSync(join(dir, "script"));
    writeFileSync(join(dir, "script", "02.txt"), "Câu hai.\n");
    writeFileSync(join(dir, "index.html"), `<div id="root" data-composition-id="main" data-start="0" data-duration="10" data-width="1080" data-height="1920">
  <div id="a" class="scene" data-composition-id="01-hook" data-composition-src="compositions/frames/01.html" data-start="0" data-duration="4.4"></div>
  <audio id="el-01-voice" src="assets/voice/01.mp3" data-start="0" data-duration="4" data-volume="1"></audio>
  <div id="b" class="scene" data-composition-id="02-end" data-composition-src="compositions/frames/02.html" data-start="4" data-duration="6"></div>
  <audio id="el-02-voice" src="assets/voice/02.mp3" data-start="3.96" data-duration="5" data-volume="1"></audio>
  <audio id="el-bgm" src="assets/bgm/bgm.mp3" data-start="0" data-duration="10" data-volume="0.2"></audio>
  <div id="c" class="scene" data-track-kind="captions" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="10"></div>
</div>`);
    writeFileSync(join(dir, "audio_meta.json"), JSON.stringify({ voices: [{ frame: 1, path: "assets/voice/01.mp3", duration_s: 4, words: [{ text: "Câu" }, { text: "một." }] }] }));
    const { manifest: m, source } = importProject(dir);
    assert.equal(source, "sub-composition");
    assert.deepEqual(validate(m), []);
    assert.deepEqual(m.shots.map((s) => [s.id, s.name, s.start, s.end]), [["s1", "01-hook", 0, 4], ["s2", "02-end", 4, 10]]);
    assert.deepEqual(m.lines.map((l) => [l.id, l.shot, l.text]), [["el-01-voice", "s1", "Câu một."], ["el-02-voice", "s2", "Câu hai."]], "midpoint puts the 3.96 s line in s2");
    assert.deepEqual(m.music, [{ id: "el-bgm", file: "assets/bgm/bgm.mp3", start: 0, end: 10, gain: 0.2 }]);
    assert.deepEqual([m.width, m.height], [1080, 1920]);
    assert.deepEqual(m.capabilities, { timing_markers: false, editable: false });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("no PLAN.md and no sub-compositions: audio_meta voices back to back, last shot reaches the root", () => {
  const dir = tmp();
  try {
    writeFileSync(join(dir, "index.html"), '<div data-composition-id="main" data-start="0" data-duration="9"></div>');
    writeFileSync(join(dir, "audio_meta.json"), JSON.stringify({ voices: [{ frame: 1, duration_s: 3 }, { frame: 2, duration_s: 4 }] }));
    const { manifest: m, warnings } = importProject(dir);
    assert.deepEqual(m.shots.map((s) => [s.id, s.start, s.end]), [["s1", 0, 3], ["s2", 3, 9]]);
    assert.ok(warnings.some((w) => /nắn về root data-duration 9s/.test(w)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("bad usage and a missing index.html exit 2", () => {
  const dir = tmp();
  try {
    assert.equal(main([], io().io), 2);
    assert.equal(main(["--project", dir], io().io), 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
