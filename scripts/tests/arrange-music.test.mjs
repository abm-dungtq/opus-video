// arrange-music.mjs and verify-arrangement.mjs: whole bars land on the target grid, a shifted splice is
// caught, and a source whose tempo drifts is still arranged onto the even grid.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main as beatGrid } from "../beat-grid.mjs";
import { main as arrange, loadArrangement, buildGraph } from "../arrange-music.mjs";
import { main as verify } from "../verify-arrangement.mjs";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const skip = !hasFfmpeg && "ffmpeg missing";
const SR = 48000;
const capture = () => {
  const buf = { out: "", err: "" };
  return { buf, io: { out: (s) => { buf.out += s; }, err: (s) => { buf.err += s; } } };
};

// 48 kHz mono WAV: a 30 ms burst at each hit time, three inharmonic sines whose set changes every bar
// (bar k: 437+31k, 1123+53k, 2791+71k Hz), so no two bars correlate and no steady tone makes the
// correlation peak jump by a period.
function writeBursts(file, times, dur) {
  const n = Math.round(SR * dur), x = new Float32Array(n);
  times.forEach((t0, beat) => {
    const k = Math.floor(beat / 4), f = [437 + 31 * k, 1123 + 53 * k, 2791 + 71 * k], a = Math.round(t0 * SR);
    for (let i = 0; i < 0.03 * SR && a + i < n; i++) {
      const t = i / SR;
      x[a + i] = 0.25 * (Math.sin(2 * Math.PI * f[0] * t) + Math.sin(2 * Math.PI * f[1] * t) + Math.sin(2 * Math.PI * f[2] * t));
    }
  });
  const pcm = Buffer.alloc(44 + n * 2);
  pcm.write("RIFF", 0); pcm.writeUInt32LE(36 + n * 2, 4); pcm.write("WAVEfmt ", 8);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
  pcm.write("data", 36); pcm.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2);
  writeFileSync(file, pcm);
}

const PLAN = {
  source: "assets/bgm/raw/bgm-raw.wav", output: "assets/bgm/bgm.wav", crossfade: 0.025,
  segments: [{ to: [0, 8], from: 0, role: "intro" }, { to: [8, 16], from: 24, role: "b" }, { to: [17, 24], from: 8, role: "c" }],
};

// A project with the raw bed measured by beat-grid --write and the plan written.
function project(times, dur) {
  const dir = mkdtempSync(join(tmpdir(), "arrange-music-"));
  mkdirSync(join(dir, "assets/bgm/raw"), { recursive: true });
  const raw = join(dir, PLAN.source);
  writeBursts(raw, times, dur);
  const { buf, io } = capture();
  assert.equal(beatGrid([raw, "--write"], io), 0, buf.out + buf.err);
  writeFileSync(join(dir, "assets/bgm/music-arrangement.json"), JSON.stringify(PLAN));
  return dir;
}

// Onsets in the output: the first sample over 20 % of the peak after at least 50 ms under it.
function burstOnsets(file) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", String(SR), "-f", "f32le", "pipe:1"], { maxBuffer: 1 << 29 });
  assert.equal(r.status, 0, String(r.stderr));
  const x = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4);
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const thr = 0.2 * peak, quiet = 0.05 * SR, on = [];
  let last = -Infinity;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > thr) { if (i - last > quiet) on.push(i / SR); last = i; }
  return on;
}

// Every target beat except the silent one (16) has a burst within 3 ms of beat0 + n·beatLen.
function assertOnGrid(dir) {
  const g = JSON.parse(readFileSync(join(dir, "assets/bgm/bgm.wav.beats.json"), "utf8"));
  assert.ok(g.beats.length >= 24, `beats ${g.beats.length}`);
  assert.equal(g.stability, null);
  assert.equal(g.arranged_from, "assets/bgm/music-arrangement.json");
  const on = burstOnsets(join(dir, "assets/bgm/bgm.wav"));
  for (let n = 0; n < 24; n++) {
    const t = g.beat0 + n * g.beatLen, gap = Math.min(...on.map((o) => Math.abs(o - t)));
    if (n === 16) assert.ok(gap > 0.1, `beat 16 should be silent, burst ${gap}s away`);
    else assert.ok(gap <= 0.003, `beat ${n} at ${t.toFixed(4)}: nearest burst ${(gap * 1000).toFixed(2)} ms away`);
  }
}

function arrangeAndVerify(dir) {
  const a = capture();
  assert.equal(arrange(["--project", dir], a.io), 0, a.buf.out + a.buf.err);
  assert.match(a.buf.out, /^MUSIC assets\/bgm\/bgm\.wav \d+\.\d\ds$/m);
  const v = capture();
  const code = verify(["--project", dir], v.io);
  return { code, out: v.buf.out + v.buf.err };
}

test("even source: arrange writes WAV and beats.json, verify passes, bursts sit on the target grid", { skip }, () => {
  const dir = project(Array.from({ length: 48 }, (_, n) => 0.1 + n * 0.5), 24);
  try {
    const { code, out } = arrangeAndVerify(dir);
    assert.equal(code, 0, out);
    assert.match(out, /^VERIFY PASS$/m);
    assert.equal((out.match(/^PASS seg/gm) ?? []).length, 3, out);
    assertOnGrid(dir);
    const j = capture();
    assert.equal(verify(["--project", dir, "--json"], j.io), 0);
    const r = JSON.parse(j.buf.out);
    assert.ok(r.pass && r.maxDriftMs <= 3, `maxDriftMs ${r.maxDriftMs}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a splice 5 ms late is caught: exit 1 and FAIL seg", { skip }, () => {
  const dir = project(Array.from({ length: 48 }, (_, n) => 0.1 + n * 0.5), 24);
  try {
    assert.equal(arrangeAndVerify(dir).code, 0);
    const outFile = join(dir, "assets/bgm/bgm.wav"), shifted = join(dir, "shifted.wav");
    const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", outFile, "-af", "adelay=5:all=1", "-c:a", "pcm_s16le", shifted]);
    assert.equal(r.status, 0, String(r.stderr));
    renameSync(shifted, outFile);
    const v = capture();
    assert.equal(verify(["--project", dir], v.io), 1, v.buf.out);
    assert.match(v.buf.out, /^FAIL seg/m);
    assert.match(v.buf.out, /^VERIFY FAIL$/m);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("source drifting 120 → 120.5 BPM: arranged onto the even grid, verify passes, bursts within 3 ms", { skip }, () => {
  const T = 24, k = (0.5 / 60) / T, times = [];
  for (let n = 0; ; n++) { const t = 0.1 + (-2 + Math.sqrt(4 + 2 * k * n)) / k; if (t > T - 0.2) break; times.push(t); }
  const dir = project(times, T);
  try {
    const { code, out } = arrangeAndVerify(dir);
    assert.equal(code, 0, out);
    assert.match(out, /^VERIFY PASS$/m);
    assertOnGrid(dir);
    const j = capture();
    assert.equal(verify(["--project", dir, "--json"], j.io), 0);
    const r = JSON.parse(j.buf.out);
    assert.ok(r.pass && r.maxDriftMs <= 3, `maxDriftMs ${r.maxDriftMs}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("--dry prints the table and writes no output; a bad plan exits 2", { skip }, () => {
  const dir = project(Array.from({ length: 48 }, (_, n) => 0.1 + n * 0.5), 24);
  try {
    const d = capture();
    assert.equal(arrange(["--project", dir, "--dry"], d.io), 0, d.buf.err);
    assert.match(d.buf.out, /beats {3}0–8 .*← source beat 0 {2}intro/);
    assert.equal(existsSync(join(dir, "assets/bgm/bgm.wav")), false);
    writeFileSync(join(dir, "bad.json"), JSON.stringify({ ...PLAN, segments: [{ to: [0, 8], from: 0 }, { to: [4, 12], from: 0 }] }));
    const b = capture();
    assert.equal(arrange(["--project", dir, "--plan", "bad.json"], b.io), 2);
    assert.match(b.buf.err, /chồng/);
    rmSync(join(dir, "assets/bgm/raw/bgm-raw.wav.beats.json"));
    const m = capture();
    assert.equal(arrange(["--project", dir], m.io), 2);
    assert.match(m.buf.err, /beat-grid\.mjs .* --write/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("music that starts on its first downbeat (beat0 under the crossfade): no piece reaches before the source", { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), "arrange-music-"));
  try {
    mkdirSync(join(dir, "assets/bgm/raw"), { recursive: true });
    const raw = join(dir, PLAN.source), times = Array.from({ length: 48 }, (_, n) => 0.01 + n * 0.5);
    writeBursts(raw, times, 24);
    // Written by hand: beat-grid may skip a hit this close to the start.
    writeFileSync(`${raw}.beats.json`, JSON.stringify({ bpm: 120, beat0: 0.01, beatLen: 0.5, beats: times, kick: [], drops: [], stability: 0 }));
    writeFileSync(join(dir, "assets/bgm/music-arrangement.json"), JSON.stringify({ ...PLAN, segments: [{ to: [0, 8], from: 8 }, { to: [8, 16], from: 0 }] }));
    const arr = loadArrangement(dir);
    for (const [, start] of buildGraph({ ...arr, fadeOut: null }).matchAll(/atrim=start=(-?[\d.]+)/g)) assert.ok(Number(start) >= 0, `atrim start ${start}`);
    const { code, out } = arrangeAndVerify(dir);
    assert.equal(code, 0, out);
    assert.match(out, /^VERIFY PASS$/m);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
