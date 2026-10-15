// timing.mjs: TIMING block from PLAN.md "## Cảnh" and voice words.json; the skeleton's W()/WE()/B()
// read it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { buildTiming, injectTiming, planScenes, voiceWords, main, NO_MARKERS } from "../timing.mjs";
import { SKELETON } from "../composition.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/timing", import.meta.url));
const project = () => {
  const dir = mkdtempSync(join(tmpdir(), "timing-"));
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
};
const capture = () => {
  const buf = { out: "", err: "" };
  return { buf, io: { out: (s) => { buf.out += s; }, err: (s) => { buf.err += s; } } };
};
const timingOf = (html) => JSON.parse(html.match(/window\.TIMING = (\{.*\});/)[1]);

test("fixture: first word of s2 sits at data-start + its start in words.json", () => {
  const dir = project();
  try {
    const { buf, io } = capture();
    assert.equal(main(["--project", dir], io), 0, buf.err);
    const t = JSON.parse(readFileSync(join(dir, "timing.json"), "utf8"));
    const first = JSON.parse(readFileSync(join(dir, "assets/voice/01.mp3.words.json"), "utf8"))[0];
    assert.equal(t.scenes.s2.lines[0].words[0][1], 2.5 + first.start);
    assert.equal(t.scenes.s2.lines[0].id, "vo-01");
    assert.equal(t.scenes.s2.lines[0].words.length, 7);
    assert.deepEqual(t.scenes.s1, { start: 0, end: 2.5, lines: [] });
    assert.equal(t.duration, 8);
    assert.equal(t.fps, 30);
    assert.deepEqual([t.beat0, t.beatLen, t.kick, t.drops], [0, 0, [], []]);
    assert.doesNotMatch(buf.out, /kết thúc/);
    assert.match(buf.out, /^TIMING s2 2\.500–5\.800 words=7$/m);
    assert.match(buf.out, /^TIMING s1 0\.000–2\.500 words=0$/m);
    assert.match(buf.out, /^WARN s3 không có từ nào trong words\.json$/m);
    assert.doesNotMatch(buf.out, /WARN s1/);
    assert.deepEqual(timingOf(readFileSync(join(dir, "index.html"), "utf8")), t);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("re-running gives the same file; markers stay one per line", () => {
  const dir = project();
  try {
    assert.equal(main(["--project", dir], capture().io), 0);
    const once = readFileSync(join(dir, "index.html"), "utf8");
    assert.equal(main(["--project", dir], capture().io), 0);
    assert.equal(readFileSync(join(dir, "index.html"), "utf8"), once);
    const lines = once.split("\n");
    assert.equal(lines.filter((l) => l.includes("TIMING:BEGIN")).length, 1);
    assert.equal(lines.filter((l) => l.includes("TIMING:END")).length, 1);
    assert.ok(!lines.some((l) => l.includes("TIMING:BEGIN") && l.includes("TIMING:END")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("--dry prints without writing", () => {
  const dir = project();
  try {
    const before = readFileSync(join(dir, "index.html"), "utf8");
    const { buf, io } = capture();
    assert.equal(main(["--project", dir, "--dry"], io), 0);
    assert.match(buf.out, /TIMING s2/);
    assert.equal(readFileSync(join(dir, "index.html"), "utf8"), before);
    assert.equal(existsSync(join(dir, "timing.json")), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("HTML without markers exits 1 and is not edited", () => {
  const dir = project();
  try {
    const legacy = readFileSync(join(dir, "index.html"), "utf8").replace(/\/\* TIMING:(BEGIN|END) \*\//g, "");
    writeFileSync(join(dir, "index.html"), legacy);
    const { buf, io } = capture();
    assert.equal(main(["--project", dir], io), 1);
    assert.match(buf.err, new RegExp(NO_MARKERS.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")));
    assert.equal(readFileSync(join(dir, "index.html"), "utf8"), legacy);
    assert.equal(existsSync(join(dir, "timing.json")), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a voice track ending past the root duration warns; the duration is left alone", () => {
  const dir = project();
  try {
    const html = readFileSync(join(dir, "index.html"), "utf8").replace('data-start="2.5" data-duration="3"', 'data-start="2.5" data-duration="8.9"');
    writeFileSync(join(dir, "index.html"), html);
    const { buf, io } = capture();
    assert.equal(main(["--project", dir], io), 0);
    assert.match(buf.out, /^WARN vo-01 kết thúc 11\.400s, root data-duration 8s$/m);
    const after = readFileSync(join(dir, "index.html"), "utf8");
    assert.match(after, /data-composition-id="main" data-start="0" data-duration="8"/);
    assert.equal(JSON.parse(readFileSync(join(dir, "timing.json"), "utf8")).duration, 8);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("bad usage and missing files exit 2", () => {
  const dir = project();
  try {
    assert.equal(main([], capture().io), 2);
    assert.equal(main(["--project", dir, "--bogus"], capture().io), 2);
    assert.equal(main(["--project", dir, "--html", "nope.html"], capture().io), 2);
    rmSync(join(dir, "PLAN.md"));
    assert.equal(main(["--project", dir], capture().io), 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("voiceWords: data-media-start, playback rate and data-duration shift and trim words", () => {
  const dir = project();
  try {
    writeFileSync(join(dir, "index.html"), `<div data-composition-id="main" data-duration="8">
      <audio id="narr" src="assets/voice/01.mp3" data-start="1" data-media-start="0.5" data-playback-rate="2" data-duration="0.5" data-audio-group="voiceover"></audio>
      <audio id="music" src="assets/bgm/bed.mp3" data-start="0"></audio></div>`);
    const { words, warnings } = voiceWords(dir);
    assert.deepEqual(warnings, []);
    // kept: 0.56 → 1.03, 0.72 → 1.11, 0.96 → 1.23, 1.68 → 1.59 (rel 0.59 ≥ 0.5 dropped), so three words
    assert.deepEqual(words.map((w) => w.text), ["cả", "mã", "nguồn,"]);
    assert.ok(Math.abs(words[0].start - 1.03) < 1e-9);
    assert.ok(words.every((w) => w.id === "narr"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("voiceWords: an el-NN-…-voice id with no group is a voice track", () => {
  const dir = project();
  try {
    writeFileSync(join(dir, "index.html"), `<div data-composition-id="main" data-duration="8">
      <audio id="el-01-intro-voice" src="assets/voice/01.mp3" data-start="1"></audio>
      <audio id="sfx-pop" src="assets/sfx/pop.mp3" data-start="0"></audio></div>`);
    const { words, tracks, warnings } = voiceWords(dir);
    assert.deepEqual(warnings, []);
    assert.deepEqual(tracks.map((t) => t.id), ["el-01-intro-voice"]);
    assert.ok(words.length > 0 && words.every((w) => w.id === "el-01-intro-voice"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("voiceWords: a voice track without words.json is a warning, not a crash", () => {
  const dir = project();
  try {
    rmSync(join(dir, "assets/voice/01.mp3.words.json"));
    const { buf, io } = capture();
    assert.equal(main(["--project", dir], io), 0);
    assert.match(buf.out, /^WARN vo-01: không có .*01\.mp3\.words\.json$/m);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("planScenes: ids from #, unreadable time throws, missing table throws", () => {
  const s = planScenes("## Cảnh\n| # | Thời điểm | Lời đọc |\n|---|---|---|\n| 1 | 0–2,5s | — |\n| 2 | 2,5 - 4s | \"Chào\" |\n");
  assert.deepEqual(s, [{ sid: "s1", start: 0, end: 2.5, spoken: false }, { sid: "s2", start: 2.5, end: 4, spoken: true }]);
  assert.throws(() => planScenes("## Cảnh\n| # | Thời điểm |\n|---|---|\n| 1 | sớm |\n"), /s1: Thời điểm "sớm"/);
  assert.throws(() => planScenes("## Mục tiêu\nx\n"), /## Cảnh/);
});

test("beats.json in assets/bgm fills the beat grid", () => {
  const dir = project();
  try {
    mkdirSync(join(dir, "assets/bgm"), { recursive: true });
    writeFileSync(join(dir, "assets/bgm/bgm.mp3.beats.json"), JSON.stringify({ bpm: 120, beat0: 0.12, beatLen: 0.5, kick: [[0, 16]], drops: [8] }));
    writeFileSync(join(dir, "hyperframes.json"), JSON.stringify({ fps: 25 }));
    const { timing } = buildTiming({ dir });
    assert.deepEqual([timing.beat0, timing.beatLen, timing.kick, timing.drops, timing.fps], [0.12, 0.5, [[0, 16]], [8], 25]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI: the single assets/bgm beats.json reaches TIMING in the HTML; beatLen 0 stays unmeasured", () => {
  const dir = project();
  try {
    mkdirSync(join(dir, "assets/bgm"), { recursive: true });
    const beats = join(dir, "assets/bgm/bgm.mp3.beats.json");
    writeFileSync(beats, JSON.stringify({ bpm: 119.8, beat0: 0.025, beatLen: 0.500835, kick: [[0, 23]], drops: [], stability: 16 }));
    const { buf, io } = capture();
    assert.equal(main(["--project", dir], io), 0, buf.err);
    const t = timingOf(readFileSync(join(dir, "index.html"), "utf8"));
    assert.ok(t.beatLen > 0);
    assert.deepEqual([t.beat0, t.beatLen, t.kick], [0.025, 0.500835, [[0, 23]]]);
    writeFileSync(beats, JSON.stringify({ beat0: 0, beatLen: 0 }));
    assert.equal(main(["--project", dir], io), 0, buf.err);
    assert.equal(timingOf(readFileSync(join(dir, "index.html"), "utf8")).beatLen, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("--music picks one of several beats.json; several without --music, or none for --music, exit 2", () => {
  const dir = project();
  try {
    mkdirSync(join(dir, "assets/bgm"), { recursive: true });
    writeFileSync(join(dir, "assets/bgm/a.mp3.beats.json"), JSON.stringify({ beat0: 0.1, beatLen: 0.5 }));
    writeFileSync(join(dir, "assets/bgm/b.mp3.beats.json"), JSON.stringify({ beat0: 0.2, beatLen: 0.6 }));
    const before = readFileSync(join(dir, "index.html"), "utf8");
    let c = capture();
    assert.equal(main(["--project", dir], c.io), 2);
    assert.match(c.buf.err, /2 file \*\.beats\.json; chọn bằng --music/);
    assert.equal(readFileSync(join(dir, "index.html"), "utf8"), before, "nothing written");
    assert.equal(existsSync(join(dir, "timing.json")), false);
    c = capture();
    assert.equal(main(["--project", dir, "--music", "assets/bgm/c.mp3"], c.io), 2);
    assert.match(c.buf.err, /c\.mp3\.beats\.json \(chạy beat-grid\.mjs/);
    c = capture();
    assert.equal(main(["--project", dir, "--music", "assets/bgm/b.mp3"], c.io), 0, c.buf.err);
    const t = JSON.parse(readFileSync(join(dir, "timing.json"), "utf8"));
    assert.deepEqual([t.beat0, t.beatLen], [0.2, 0.6]);
    c = capture();
    assert.equal(main(["--project", dir, "--music"], c.io), 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("injectTiming refuses duplicate markers", () => {
  const two = "/* TIMING:BEGIN */x/* TIMING:END */\n/* TIMING:BEGIN */y/* TIMING:END */";
  assert.throws(() => injectTiming(two, {}), /nhiều hơn một khối/);
  assert.throws(() => injectTiming("<html></html>", {}), /TIMING:BEGIN\/END/);
});

// Runs the skeleton's scripts against a stub GSAP and DOM. The choreography comment is swapped for
// a probe that exposes W/WE/B.
function runSkeleton(timing) {
  const html = readFileSync(SKELETON, "utf8");
  const probeAt = /\/\/ e\.g\. \{ const sid[^\n]*/;
  assert.match(html, probeAt);
  const filled = timing ? injectTiming(html, timing) : html;
  const scripts = [...filled.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const code = scripts.join("\n").replace(probeAt, "window.__probe = { W, WE, B };");
  const warns = [];
  const tlStub = new Proxy({}, { get: () => () => tlStub });
  const el = { childNodes: [], dataset: {}, setAttribute() {}, textContent: "", querySelectorAll: () => [] };
  const window = {};
  const ctx = { window, gsap: { timeline: () => tlStub }, console: { warn: (s) => warns.push(String(s)) },
    document: { querySelector: () => el, querySelectorAll: () => [], createDocumentFragment: () => ({ append() {} }), createElement: () => ({}) } };
  vm.runInNewContext(code, ctx);
  return { window, warns };
}

test("skeleton runs with the empty default TIMING; B refuses the unmeasured grid", () => {
  const { window, warns } = runSkeleton(null);
  assert.ok(window.__timelines.main);
  assert.throws(() => window.__probe.B(4), /B\(\) cần beat-grid\.mjs/);
  assert.deepEqual(warns, []);
});

test("skeleton B follows a measured grid", () => {
  const { window } = runSkeleton({ fps: 30, duration: 10, scenes: {}, beat0: 0.12, beatLen: 0.5, kick: [[0, 16]], drops: [8] });
  assert.equal(window.__probe.B(4), 2.12);
});

test("skeleton W/WE match a folded phrase across punctuation; a miss warns and falls back", () => {
  const dir = project();
  try {
    const { timing } = buildTiming({ dir });
    const { window, warns } = runSkeleton(timing);
    const { W, WE } = window.__probe;
    assert.equal(W("s2", "ma nguon"), 3.22); // "mã" at 2.5 + 0.72
    assert.equal(WE("s2", "Mã nguồn"), 4.1); // "nguồn," ends at 2.5 + 1.6
    assert.equal(W("s2", "Bạn"), 2.6);
    assert.deepEqual(warns, []);
    assert.equal(W("s2", "không có"), 2.5);
    assert.equal(W("s9", "ảnh"), 0);
    assert.deepEqual(warns, ["W miss: s2 không có", "W miss: s9 ảnh"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("skeleton B throws without a beat grid", () => {
  const { window } = runSkeleton({ fps: 30, duration: 10, scenes: {}, beat0: 0, beatLen: 0, kick: [], drops: [] });
  assert.throws(() => window.__probe.B(1), /B\(\) cần beat-grid\.mjs/);
});
