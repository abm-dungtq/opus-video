import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BED_DEFAULTS, main, normalizeBed, writeGenerated } from "../normalize-bed.mjs";

const SCRIPT = fileURLToPath(new URL("../normalize-bed.mjs", import.meta.url));
const ELEVEN = fileURLToPath(new URL("../eleven.mjs", import.meta.url));
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
const skip = hasFfmpeg ? false : "ffmpeg/ffprobe not installed";

function tmp() { return mkdtempSync(join(tmpdir(), "normalize-bed-")); }

// `silence` seconds of digital silence, then a 440 Hz tone of `tone` seconds with amplitude `amp`
// (0.07 ≈ -26 LUFS mono), optionally with a linear fade-in of `fade` seconds and trailing silence.
function makeBed(file, { silence = 1, tone = 3, amp = 0.07, fade = 0, tail = 0 } = {}) {
  const env = fade > 0 ? `*min(1\\,t/${fade})` : ""; // "\\," escapes the comma inside a filter option
  const parts = [`aevalsrc=0:s=44100:d=${silence}`, `aevalsrc=${amp}*sin(2*PI*440*t)${env}:s=44100:d=${tone}`];
  if (tail > 0) parts.push(`aevalsrc=0:s=44100:d=${tail}`);
  const args = ["-hide_banner", "-v", "error", "-y"];
  for (const p of parts) args.push("-f", "lavfi", "-i", p);
  const ins = parts.map((_, i) => `[${i}]`).join("");
  args.push("-filter_complex", `${ins}concat=n=${parts.length}:v=0:a=1`, "-c:a", "libmp3lame", "-b:a", "192k", file);
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
}

function lufs(file) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8" });
  const all = [...r.stderr.matchAll(/^\s+I:\s+(-?[\d.]+) LUFS/gm)];
  return Number(all[all.length - 1][1]);
}

function duration(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  return Number(r.stdout.trim());
}

function sampleRate(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate,codec_name", "-of", "json", file], { encoding: "utf8" });
  return JSON.parse(r.stdout).streams[0];
}

test("defaults are the bed level of the audio pipeline", () => {
  assert.equal(BED_DEFAULTS.lufs, -12.5);
  assert.equal(BED_DEFAULTS.tp, -1.5);
  assert.equal(BED_DEFAULTS.silenceDb, -50);
  assert.equal(BED_DEFAULTS.keepHead, 0.05);
});

test("1 s of silence then a quiet tone: about 1 s shorter and at -12.5 ± 1 LUFS", { skip }, () => {
  const d = tmp();
  try {
    const src = join(d, "in.mp3"), out = join(d, "out.mp3");
    makeBed(src);
    assert.ok(Math.abs(lufs(src) + 26) < 2, `fixture loudness ${lufs(src)}`);
    const r = normalizeBed({ input: src, output: out });
    assert.ok(Math.abs(lufs(out) + 12.5) <= 1, `output loudness ${lufs(out)}`);
    assert.ok(Math.abs(r.lufsOut + 12.5) <= 1, `reported ${r.lufsOut}`);
    const cut = duration(src) - duration(out);
    assert.ok(cut > 0.85 && cut < 1.1, `trimmed ${cut} s`);
    assert.ok(r.trimmedHead > 0.85 && r.trimmedHead < 1.0, `trimmed_head ${r.trimmedHead}`);
    assert.ok(r.trimmedTail < 0.1, `trimmed_tail ${r.trimmedTail}`);
    assert.deepEqual(sampleRate(out), { codec_name: "mp3", sample_rate: "44100" });
    assert.ok(existsSync(src), "input kept when --out is given");
    assert.deepEqual(readdirSync(d).sort(), ["in.mp3", "out.mp3"], "no temp file left");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("a fade-in after the silence is not cut by more than 0.1 s; trailing silence is trimmed", { skip }, () => {
  const d = tmp();
  try {
    const src = join(d, "fade.mp3"), out = join(d, "fade-out.mp3");
    makeBed(src, { silence: 1, tone: 3, fade: 0.5, tail: 0.8 });
    const r = normalizeBed({ input: src, output: out });
    assert.ok(r.trimmedHead <= 1.0 + 0.1 && r.trimmedHead > 0.85, `trimmed_head ${r.trimmedHead}`);
    assert.ok(r.trimmedTail > 0.6 && r.trimmedTail < 0.85, `trimmed_tail ${r.trimmedTail}`);
    // 3 s of tone survive (the mp3 encoder adds a few ms of padding).
    assert.ok(duration(out) >= 3 - 0.1, `output ${duration(out)} s`);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("without --out the input is replaced in place", { skip }, () => {
  const d = tmp();
  try {
    const src = join(d, "bed.mp3");
    makeBed(src);
    const r = main(["--in", src, "--lufs", "-14"], { out: () => {}, err: () => {} });
    assert.equal(r, 0);
    assert.ok(Math.abs(lufs(src) + 14) <= 1, `in-place loudness ${lufs(src)}`);
    assert.deepEqual(readdirSync(d), ["bed.mp3"]);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("CLI prints one NORMALIZE line and exits 0", { skip }, () => {
  const d = tmp();
  try {
    const src = join(d, "in.mp3"), out = join(d, "out.mp3");
    makeBed(src);
    const r = spawnSync("node", [SCRIPT, "--in", src, "--out", out], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^NORMALIZE .*out\.mp3 lufs_in=-2\d\.\d+ lufs_out=-1[23]\.\d+ trimmed_head=0\.9\d* trimmed_tail=0(\.\d+)?\n$/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("CLI: bad usage exits 2, a silent file exits 1 and is left untouched", { skip }, () => {
  const d = tmp();
  try {
    const quiet = (argv) => main(argv, { out: () => {}, err: () => {} });
    assert.equal(quiet([]), 2);
    assert.equal(quiet(["--in"]), 2);
    assert.equal(quiet(["--in", join(d, "missing.mp3")]), 2);
    assert.equal(quiet(["--in", "x.mp3", "--lufs", "loud"]), 2);
    assert.equal(quiet(["--bogus", "1"]), 2);
    const silent = join(d, "silent.mp3");
    makeBed(silent, { silence: 2, tone: 0.01, amp: 0 });
    const before = readFileSync(silent);
    const errs = [];
    assert.equal(main(["--in", silent], { out: () => {}, err: (s) => errs.push(s) }), 1);
    assert.match(errs.join(""), /silent/);
    assert.deepEqual(readFileSync(silent), before);
    assert.deepEqual(readdirSync(d), ["silent.mp3"]);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("--help prints the header block", () => {
  const r = spawnSync("node", [SCRIPT, "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.startsWith("normalize-bed.mjs — "));
  assert.match(r.stdout, /Exit: 0 done/);
  assert.equal(r.stderr, "");
});

test("writeGenerated: API bytes are written then normalized; --no-normalize keeps them as is", { skip }, () => {
  const d = tmp();
  try {
    const fixture = join(d, "fixture.mp3");
    makeBed(fixture);
    const buf = readFileSync(fixture);
    const logs = [], warns = [];
    const out = join(d, "sub", "music.mp3");
    const r = writeGenerated(out, buf, { log: (s) => logs.push(s), warn: (s) => warns.push(s) });
    assert.ok(r && Math.abs(lufs(out) + 12.5) <= 1, `normalized loudness ${lufs(out)}`);
    assert.ok(duration(out) < duration(fixture) - 0.85);
    assert.match(logs[0], /^NORMALIZE .*music\.mp3 lufs_in=/);
    assert.deepEqual(warns, []);

    const raw = join(d, "raw.mp3");
    assert.equal(writeGenerated(raw, buf, { normalize: false, log: (s) => logs.push(s) }), null);
    assert.deepEqual(readFileSync(raw), buf);
    assert.equal(logs.length, 1);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("writeGenerated: a failed normalize keeps the written file and warns", () => {
  const d = tmp();
  try {
    const out = join(d, "sfx.mp3");
    const buf = Buffer.from("not really audio");
    const warns = [];
    const failing = () => ({ status: 1, stdout: "", stderr: "Invalid data found when processing input" });
    assert.equal(writeGenerated(out, buf, { run: failing, warn: (s) => warns.push(s) }), null);
    assert.deepEqual(readFileSync(out), buf);
    assert.equal(warns.length, 1);
    assert.match(warns[0], /^WARN normalize: ffprobe exited 1/);
    assert.deepEqual(readdirSync(d), ["sfx.mp3"]);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("eleven.mjs documents and parses --no-normalize for sfx and music", () => {
  const text = readFileSync(ELEVEN, "utf8");
  assert.match(text, /sfx {3}--text .*\[--no-normalize\]/);
  assert.match(text, /music --prompt .*\[--no-normalize\]/);
  assert.match(text, /writeBed\(need\("out"\), buf\);\n {4}console\.error\(`sfx/);
  assert.match(text, /writeBed\(out, buf\);\n {8}console\.error\(`music/);
  // A missing key fails before any request, so this never reaches the API.
  const home = tmp();
  try {
    const r = spawnSync("node", [ELEVEN, "sfx", "--text", "x", "--seconds", "1", "--out", join(home, "x.mp3"), "--no-normalize"], { encoding: "utf8", env: { ...process.env, HOME: home, ELEVENLABS_API_KEY: "" }, timeout: 15000 });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /ELEVENLABS_API_KEY not set/);
    assert.equal(existsSync(join(home, "x.mp3")), false);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
