import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseBlack, parseFreeze, parseSilence, parseEbur, evaluate, summarize, LIMITS } from "../qc-mp4.mjs";
import { LOUDNORM } from "../audio-mix.mjs";

const CLI = fileURLToPath(new URL("../qc-mp4.mjs", import.meta.url));

// Real ffmpeg 8.1 stderr lines (captured from lavfi sources).
const BLACK = `[Parsed_blackdetect_0 @ 0x7bbec3dd40] black_start:0 black_end:1 black_duration:1
[Parsed_blackdetect_0 @ 0x7bbec3dd40] black_start:9.5 black_end:9.9 black_duration:0.4`;
const FREEZE_CLOSED = `[Parsed_freezedetect_1 @ 0x76f9005440] lavfi.freezedetect.freeze_start: 0
[Parsed_freezedetect_1 @ 0x76f9005440] lavfi.freezedetect.freeze_duration: 3
[Parsed_freezedetect_1 @ 0x76f9005440] lavfi.freezedetect.freeze_end: 3`;
const FREEZE_OPEN = `[Parsed_freezedetect_1 @ 0x7bbec3de00] lavfi.freezedetect.freeze_start: 3`;
const SILENCE = `[Parsed_silencedetect_0 @ 0x7ba5038900] silence_start: 2
[Parsed_silencedetect_0 @ 0x7ba5038900] silence_end: 5.01551 | silence_duration: 3.01551
[Parsed_silencedetect_0 @ 0x7ba5038900] silence_start: 8.2`;
const EBUR = `[Parsed_ebur128_0 @ 0x7743004d80] t: 0.0999773  TARGET:-23 LUFS    M:-120.7 S:-120.7     I: -70.0 LUFS       LRA:   0.0 LU  FTPK: -17.8 dBFS  TPK: -17.8 dBFS
[Parsed_ebur128_1 @ 0x7ba50389c0] Summary:

  Integrated loudness:
    I:         -22.1 LUFS
    Threshold: -32.3 LUFS

  Loudness range:
    LRA:         9.8 LU
    Threshold: -46.5 LUFS
    LRA low:   -33.5 LUFS
    LRA high:  -23.8 LUFS

  True peak:
    Peak:      -17.7 dBFS`;
const EBUR_SILENT = `[Parsed_ebur128_1 @ 0x78bf004e40] Summary:

  Integrated loudness:
    I:         -inf LUFS
    Threshold:   0.0 LUFS

  True peak:
    Peak:       -inf dBFS`;

test("parseBlack reads start/end pairs", () => {
  assert.deepEqual(parseBlack(BLACK), [{ start: 0, end: 1 }, { start: 9.5, end: 9.9 }]);
  assert.deepEqual(parseBlack("nothing here"), []);
});

test("parseFreeze pairs start/end and closes an open stretch at duration", () => {
  assert.deepEqual(parseFreeze(FREEZE_CLOSED, 4), [{ start: 0, end: 3 }]);
  assert.deepEqual(parseFreeze(FREEZE_OPEN, 6), [{ start: 3, end: 6 }]);
});

test("parseSilence pairs start/end and closes an open silence at duration", () => {
  assert.deepEqual(parseSilence(SILENCE, 10), [{ start: 2, end: 5.01551 }, { start: 8.2, end: 10 }]);
});

test("parseEbur reads the Summary block, not per-frame I:", () => {
  assert.deepEqual(parseEbur(EBUR), { I: -22.1, peak: -17.7 });
  assert.equal(parseEbur("no summary"), null);
});

test("parseEbur maps -inf to -Infinity, never NaN", () => {
  const r = parseEbur(EBUR_SILENT);
  assert.equal(r.I, -Infinity);
  assert.equal(r.peak, -Infinity);
});

const GOOD = { hasVideo: true, hasAudio: true, width: 1080, height: 1920, bitRate: 8e6, black: [], freeze: [], silence: [], ebur: { I: -14, peak: -1.5 } };
const BRIEF = { aspect: "9:16", duration_s: "60" };
const pick = (rs, code) => rs.filter((r) => r.code === code);
const level = (rs, code) => pick(rs, code).map((r) => r.level);

test("evaluate: clean file passes every check", () => {
  const rs = evaluate(GOOD, BRIEF, 60);
  assert.ok(rs.every((r) => r.level === "PASS"), JSON.stringify(rs));
  assert.equal(summarize(rs).line, "qc-mp4: PASS (0 WARN, 0 FAIL)");
});

test("NO_VIDEO fails without a video stream", () => {
  assert.deepEqual(level(evaluate({ ...GOOD, hasVideo: false }, null, 60), "NO_VIDEO"), ["FAIL"]);
});

test("NO_AUDIO warns without an audio stream and skips the audio checks", () => {
  const rs = evaluate({ ...GOOD, hasAudio: false, ebur: null }, null, 60);
  assert.deepEqual(level(rs, "NO_AUDIO"), ["WARN"]);
  assert.deepEqual([...level(rs, "SILENCE"), ...level(rs, "LOUDNESS"), ...level(rs, "TRUE_PEAK")], ["PASS", "PASS", "PASS"]);
});

test("ASPECT fails on mismatch, accepts both, is skipped without a brief", () => {
  assert.deepEqual(level(evaluate({ ...GOOD, width: 1920, height: 1080 }, BRIEF, 60), "ASPECT"), ["FAIL"]);
  assert.deepEqual(level(evaluate({ ...GOOD, width: 1920, height: 1080 }, { aspect: "both" }, 60), "ASPECT"), ["PASS"]);
  // --draft (animatic, 540 px short edge): only the ratio has to match.
  assert.deepEqual(level(evaluate({ ...GOOD, width: 540, height: 960 }, BRIEF, 60), "ASPECT"), ["FAIL"]);
  assert.deepEqual(level(evaluate({ ...GOOD, width: 540, height: 960 }, BRIEF, 60, { draft: true }), "ASPECT"), ["PASS"]);
  assert.deepEqual(level(evaluate({ ...GOOD, width: 960, height: 540 }, BRIEF, 60, { draft: true }), "ASPECT"), ["FAIL"]);
  assert.deepEqual(level(evaluate({ ...GOOD, width: 1920, height: 1080 }, { aspect: "16:9" }, 60), "ASPECT"), ["PASS"]);
  assert.deepEqual(level(evaluate({ ...GOOD, width: 320, height: 240 }, null, 60), "ASPECT"), ["PASS"]);
});

test("DURATION warns beyond 10% of BRIEF duration_s", () => {
  assert.deepEqual(level(evaluate(GOOD, BRIEF, 67), "DURATION"), ["WARN"]);
  assert.deepEqual(level(evaluate(GOOD, BRIEF, 65), "DURATION"), ["PASS"]);
});

test("BLACK_EDGE warns at the head and in the last 0.2s, relative to duration", () => {
  const rs = evaluate({ ...GOOD, black: [{ start: 0.05, end: 0.5 }, { start: 30, end: 31 }, { start: 59.7, end: 59.85 }] }, BRIEF, 60);
  const w = pick(rs, "BLACK_EDGE");
  assert.deepEqual(w.map((r) => r.level), ["WARN", "WARN"]);
  assert.match(w[0].detail, /nền tối có thể báo nhầm, trích khung ra xem/);
  assert.deepEqual(level(evaluate({ ...GOOD, black: [{ start: 59.7, end: 59.85 }] }, BRIEF, 61), "BLACK_EDGE"), ["PASS"]);
});

test("FREEZE warns once per stretch of 2s or more", () => {
  const rs = evaluate({ ...GOOD, freeze: [{ start: 1, end: 3.5 }, { start: 10, end: 11 }, { start: 40, end: 60 }] }, BRIEF, 60);
  assert.deepEqual(level(rs, "FREEZE"), ["WARN", "WARN"]);
});

test("SILENCE warns per gap and fails when the whole file is silent", () => {
  assert.deepEqual(level(evaluate({ ...GOOD, silence: [{ start: 5, end: 7 }, { start: 9, end: 9.5 }] }, BRIEF, 60), "SILENCE"), ["WARN"]);
  assert.deepEqual(level(evaluate({ ...GOOD, silence: [{ start: 0, end: 3.02 }] }, null, 3), "SILENCE"), ["FAIL"]);
});

test("LOUDNESS warns outside [-16, -12] LUFS, including -inf", () => {
  assert.deepEqual(level(evaluate({ ...GOOD, ebur: { I: -20, peak: -3 } }, BRIEF, 60), "LOUDNESS"), ["WARN"]);
  assert.deepEqual(level(evaluate({ ...GOOD, ebur: { I: -11, peak: -3 } }, BRIEF, 60), "LOUDNESS"), ["WARN"]);
  assert.deepEqual(level(evaluate({ ...GOOD, ebur: { I: -Infinity, peak: -Infinity } }, BRIEF, 60), "LOUDNESS"), ["WARN"]);
});

test("TRUE_PEAK warns above -1 dBFS and fails above 0", () => {
  assert.deepEqual(level(evaluate({ ...GOOD, ebur: { I: -14, peak: -0.5 } }, BRIEF, 60), "TRUE_PEAK"), ["WARN"]);
  assert.deepEqual(level(evaluate({ ...GOOD, ebur: { I: -14, peak: 0.4 } }, BRIEF, 60), "TRUE_PEAK"), ["FAIL"]);
  assert.deepEqual(level(evaluate({ ...GOOD, ebur: { I: -14, peak: -Infinity } }, BRIEF, 60), "TRUE_PEAK"), ["PASS"]);
});

test("BITRATE warns above 12 Mbit/s and asks to compress", () => {
  const w = pick(evaluate({ ...GOOD, bitRate: 50e6 }, BRIEF, 60), "BITRATE");
  assert.equal(w[0].level, "WARN");
  assert.match(w[0].detail, /chạy export\.mjs/);
});

// CLI: usage errors need no ffmpeg.
const cli = (args, cwd) => spawnSync("node", [CLI, ...args], { encoding: "utf8", cwd, timeout: 60000 });

test("CLI: bad usage and unreadable file exit 2", () => {
  assert.equal(cli([]).status, 2);
  assert.equal(cli(["--bogus", "x.mp4"]).status, 2);
  assert.equal(cli(["/nonexistent/x.mp4"]).status, 2);
  assert.equal(cli(["x.mp4", "--write-qa"]).status, 2);
});

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
const ff = (args) => { const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); };

test("CLI on a black, silent MP4: exit 1 with FAIL SILENCE", { skip: !hasFfmpeg && "ffmpeg not found" }, () => {
  const d = mkdtempSync(join(tmpdir(), "qc-mp4-"));
  try {
    const f = join(d, "bad.mp4");
    ff(["-f", "lavfi", "-i", "color=black:s=320x240:d=3", "-f", "lavfi", "-i", "anullsrc", "-shortest", f]);
    const r = cli([f]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /^FAIL SILENCE /m);
    assert.match(r.stdout.trim().split("\n").at(-1), /^qc-mp4: FAIL /);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("CLI on testsrc + sine: exit 0; --json and --write-qa work in a temp project", { skip: !hasFfmpeg && "ffmpeg not found" }, () => {
  const d = mkdtempSync(join(tmpdir(), "qc-mp4-"));
  try {
    const f = join(d, "good.mp4");
    ff(["-f", "lavfi", "-i", "testsrc=d=3", "-f", "lavfi", "-i", "sine=f=440:d=3", "-shortest", f]);
    const r = cli([f]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout.trim().split("\n").at(-1), /^qc-mp4: (PASS|WARN) /);

    const j = cli([f, "--json"]);
    assert.equal(j.status, 0, j.stderr);
    const arr = JSON.parse(j.stdout);
    assert.ok(arr.some((x) => x.code === "LOUDNESS" && typeof x.level === "string"));

    writeFileSync(join(d, "BRIEF.md"), "---\naspect: 16:9\nduration_s: 3\n---\n# Brief\n");
    writeFileSync(join(d, "QA.md"), "# QA\nexisting");
    const q = cli([f, "--project", d, "--write-qa"]);
    assert.equal(q.status, 1, q.stdout); // testsrc is 320x240, BRIEF says 16:9
    assert.match(q.stdout, /^FAIL ASPECT /m);
    const qa = readFileSync(join(d, "QA.md"), "utf8");
    assert.match(qa, /^# QA\nexisting\n\n## qc-mp4 good\.mp4 \d{4}-\d\d-\d\d \d\d:\d\d\n\n- PASS NO_VIDEO /);
    assert.match(qa, /- qc-mp4: FAIL \(\d+ WARN, \d+ FAIL\)\n$/);

    const p2 = mkdtempSync(join(tmpdir(), "qc-mp4-proj-"));
    try {
      writeFileSync(join(p2, "BRIEF.md"), "---\naspect: both\n---\n");
      assert.equal(cli([f, "--project", p2, "--write-qa"]).status, 1);
      assert.ok(existsSync(join(p2, "QA.md")));
      assert.match(readFileSync(join(p2, "QA.md"), "utf8"), /^## qc-mp4 good\.mp4 /);
    } finally { rmSync(p2, { recursive: true, force: true }); }
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("CLI: --project without BRIEF.md exits 2", { skip: !hasFfmpeg && "ffmpeg not found" }, () => {
  const d = mkdtempSync(join(tmpdir(), "qc-mp4-"));
  try {
    const f = join(d, "a.mp4");
    ff(["-f", "lavfi", "-i", "testsrc=d=1", f]);
    assert.equal(cli([f, "--project", d]).status, 2);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("LOUDNESS range is the audio-mix contract: the mix target sits inside it", () => {
  assert.deepEqual([LIMITS.loudLow, LIMITS.loudHigh], [LOUDNORM.low, LOUDNORM.high]);
  assert.ok(LOUDNORM.I > LOUDNORM.low && LOUDNORM.I < LOUDNORM.high);
  assert.ok(LOUDNORM.TP <= LIMITS.peakWarn, "the mix ceiling is under qc-mp4's TRUE_PEAK warning");
});
