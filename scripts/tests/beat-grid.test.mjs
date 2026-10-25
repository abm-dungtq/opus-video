// beat-grid.mjs: tempo, first beat, kicks and drops of a music bed; UNSTABLE when the tempo drifts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FPS, LIMITS, SR, analyze, fitGrid, maxFilter, percentile, main } from "../beat-grid.mjs";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const capture = () => {
  const buf = { out: "", err: "" };
  return { buf, io: { out: (s) => { buf.out += s; }, err: (s) => { buf.err += s; } } };
};
// 20 s of 60 Hz kick pulses, sample exact (ffmpeg aevalsrc): a pulse starts each time `phase` (an
// expression of t counting beats) crosses an integer and lasts `width` of a beat.
const kickTrain = (file, phase, width) => {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `aevalsrc='if(lt(mod(${phase},1),${width}),0.8*sin(2*PI*60*t),0)':s=22050:d=20`, file]);
  assert.equal(r.status, 0, String(r.stderr));
};
// Circular distance between two beat phases (seconds) on a grid of `beat` seconds.
const phaseGap = (a, b, beat) => { const d = Math.abs(a - b) % beat; return Math.min(d, beat - d); };

test("120 BPM kick train: BPM 118–122, BEAT0 within 20 ms of the first kick, stable, --write", { skip: !hasFfmpeg && "ffmpeg missing" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "beat-grid-"));
  try {
    const f = join(dir, "bgm.wav");
    kickTrain(f, "(t-0.25)*2+1", 0.1); // 50 ms every 0.5 s from 0.25 s
    const { buf, io } = capture();
    assert.equal(main([f, "--write"], io), 0, buf.err);
    assert.match(buf.out, /^BPM 1[12]\d\.\d  BEAT0 \d\.\d{3} s  stability \d+ ms$/m);
    const r = JSON.parse(readFileSync(`${f}.beats.json`, "utf8"));
    assert.ok(r.bpm >= 118 && r.bpm <= 122, `bpm ${r.bpm}`);
    assert.ok(phaseGap(r.beat0, 0.25, r.beatLen) <= 0.02, `beat0 ${r.beat0}`);
    assert.ok(Math.abs(r.beatLen - 60 / r.bpm) < 1e-5);
    assert.ok(r.stability <= 25, `stability ${r.stability}`);
    assert.deepEqual(Object.keys(r), ["bpm", "beat0", "beatLen", "beats", "maxDriftMs", "bars", "kick", "drops", "stability"]);
    assert.ok(r.kick.length >= 1 && r.kick[0][1] - r.kick[0][0] >= 30, JSON.stringify(r.kick));
    assert.deepEqual(r.drops, []);
    assert.match(r.bars[1].kicks, /^KKKK$/);
    // beats[] land on the start of every kick (a pure 60 Hz sine: no click to time, so 3 ms).
    assert.ok(r.beats.length >= 39, `beats ${r.beats.length}`);
    r.beats.forEach((t, n) => assert.ok(Math.abs(t - (0.25 + n * 0.5)) <= 0.003, `beat ${n}: ${t}`));
    assert.ok(r.maxDriftMs <= 1, `maxDriftMs ${r.maxDriftMs}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("90 BPM kick train reads 88–92, not the double or a neighbour of 120", { skip: !hasFfmpeg && "ffmpeg missing" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "beat-grid-"));
  try {
    const f = join(dir, "bgm.wav");
    kickTrain(f, "(t-0.25)*1.5+1", 0.075); // 50 ms every 0.667 s from 0.25 s
    const { buf, io } = capture();
    assert.equal(main([f, "--json"], io), 0, buf.err);
    const r = JSON.parse(buf.out);
    assert.ok(r.bpm >= 88 && r.bpm <= 92, `bpm ${r.bpm}`);
    assert.ok(phaseGap(r.beat0, 0.25, r.beatLen) <= 0.02, `beat0 ${r.beat0}`);
    assert.equal(existsSync(`${f}.beats.json`), false, "no --write, no file");
    assert.ok(r.beats.length >= 29, `beats ${r.beats.length}`);
    r.beats.forEach((t, n) => assert.ok(Math.abs(t - (0.25 + n * 60 / 90)) <= 0.003, `beat ${n}: ${t}`));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a tempo drifting from 100 to 140 BPM is UNSTABLE: exit 1, --write writes nothing", { skip: !hasFfmpeg && "ffmpeg missing" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "beat-grid-"));
  try {
    const f = join(dir, "bgm.wav");
    kickTrain(f, "1.6667*t+0.0167*t*t", 0.1); // 100 BPM at 0 s, 140 BPM at 20 s
    const { buf, io } = capture();
    assert.equal(main([f, "--write"], io), 1);
    assert.match(buf.out, /^UNSTABLE stability \d+ ms > 45 ms/m);
    const ms = Number(/^UNSTABLE stability (\d+) ms/m.exec(buf.out)[1]);
    assert.ok(ms >= 2 * LIMITS.stabilityMs, `drift ${ms} ms should sit far above the ${LIMITS.stabilityMs} ms limit`);
    assert.equal(existsSync(`${f}.beats.json`), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("analyze: kicks run over the whole clip, a bar 18 dB louder is a drop at its first beat", () => {
  const x = new Float32Array(SR * 20);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    if ((t + 0.25) % 0.5 < 0.05) x[i] = (t < 8 ? 0.1 : 0.8) * Math.sin(2 * Math.PI * 60 * t);
  }
  const r = analyze(x, x);
  assert.ok(r.bpm >= 119 && r.bpm <= 121, `bpm ${r.bpm}`);
  assert.ok(phaseGap(r.beat0, 0.25, r.beatLen) <= 0.02, `beat0 ${r.beat0}`);
  assert.deepEqual(r.kick, [[0, 39]]);
  assert.deepEqual(r.drops, [16], "bar 4 starts at 0.25 + 16 × 0.5 = 8.25 s, the first loud bar");
  assert.equal(analyze(new Float32Array(SR / 4), new Float32Array(SR / 4)), null, "a quarter second fits no grid");
});

test("fitGrid: a four-on-the-floor 150 BPM envelope reads 150, not the half-time 75", () => {
  const env = new Float64Array(Math.round(20 * FPS));
  for (let t = 0.3; t < 20; t += 0.4) env[Math.round(t * FPS)] = 1;
  const r = fitGrid(maxFilter(env, 3), 20, 70, 180);
  assert.ok(Math.abs(r.bpm - 150) <= 0.5, `bpm ${r.bpm}`);
  assert.equal(fitGrid(maxFilter(env, 3), 20, 70, 140).bpm < 76, true, "150 outside the range: half time is all that fits");
});

test("percentile and maxFilter match numpy / scipy on small arrays", () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 70), 3.8);
  assert.equal(percentile([], 70), 0);
  assert.deepEqual([...maxFilter(Float64Array.from([0, 3, 0, 0, 1]), 3)], [3, 3, 3, 1, 1]);
});

test("bad usage, missing and undecodable files exit 2", { skip: !hasFfmpeg && "ffmpeg missing" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "beat-grid-"));
  try {
    const bad = join(dir, "x.mp3");
    writeFileSync(bad, "not audio");
    for (const argv of [[], ["--min-bpm"], ["a.mp3", "--min-bpm", "abc"], ["a.mp3", "--min-bpm", "150", "--max-bpm", "100"], ["a.mp3", "b.mp3"], ["a.mp3", "--loud"], [join(dir, "missing.mp3")], [bad]]) {
      const { buf, io } = capture();
      assert.equal(main(argv, io), 2, `${argv.join(" ")}: ${buf.err}`);
      assert.match(buf.err, /^beat-grid: /);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// 48 kHz mono 16-bit WAV with a hit at each time in `times`: a 10 ms 1 kHz click on top of a 60 ms
// 60 Hz pulse (the low band needs energy too, or stability cannot be measured).
const writeHits = (file, times, dur) => {
  const sr = 48000, n = Math.round(sr * dur), pcm = Buffer.alloc(44 + n * 2);
  pcm.write("RIFF", 0); pcm.writeUInt32LE(36 + n * 2, 4); pcm.write("WAVEfmt ", 8);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(sr, 24); pcm.writeUInt32LE(sr * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
  pcm.write("data", 36); pcm.writeUInt32LE(n * 2, 40);
  const x = new Float32Array(n);
  for (const t0 of times) {
    const a = Math.round(t0 * sr);
    for (let i = 0; i < 0.06 * sr && a + i < n; i++) {
      const t = i / sr;
      x[a + i] += 0.5 * Math.sin(2 * Math.PI * 60 * t) * (1 - t / 0.06) + (t < 0.01 ? 0.4 * Math.sin(2 * Math.PI * 1000 * t) : 0);
    }
  }
  for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2);
  writeFileSync(file, pcm);
};
const jsonOf = (f) => { const { buf, io } = capture(); const code = main([f, "--json"], io); return { code, r: buf.out ? JSON.parse(buf.out) : null, err: buf.err }; };
// The measured beat nearest to each true hit time.
const nearestGap = (beats, t) => Math.min(...beats.map((b) => Math.abs(b - t)));

test("beats[]: clicks every 0.5 s are measured to 2 ms, maxDriftMs stays small", { skip: !hasFfmpeg && "ffmpeg missing" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "beat-grid-"));
  try {
    const f = join(dir, "even.wav"), truth = Array.from({ length: 40 }, (_, n) => 0.1 + n * 0.5);
    writeHits(f, truth, 20);
    const { code, r, err } = jsonOf(f);
    assert.equal(code, 0, err);
    assert.ok(r.beats.length >= 39, `beats ${r.beats.length}`);
    for (const t of truth.slice(0, 39)) assert.ok(nearestGap(r.beats, t) <= 0.002, `hit ${t}: ${nearestGap(r.beats, t)}`);
    assert.ok(r.maxDriftMs <= 1, `maxDriftMs ${r.maxDriftMs}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("beats[]: a tempo ramp 120 → 120.5 BPM stays stable, beats follow it to 3 ms, maxDriftMs ≥ 5", { skip: !hasFfmpeg && "ffmpeg missing" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "beat-grid-"));
  try {
    // Beats per second rise linearly 2 → 2.0083 over 24 s; phase(t) = 2t + k t²/2, hit n where phase = n.
    const T = 24, k = (0.5 / 60) / T, truth = [];
    for (let n = 0; ; n++) { const t = 0.1 + (-2 + Math.sqrt(4 + 2 * k * n)) / k; if (t > T - 0.2) break; truth.push(t); }
    const f = join(dir, "ramp.wav");
    writeHits(f, truth, T);
    const { code, r, err } = jsonOf(f);
    assert.equal(code, 0, err);
    assert.ok(r.stability <= LIMITS.stabilityMs, `stability ${r.stability}`);
    assert.ok(r.maxDriftMs >= 5, `maxDriftMs ${r.maxDriftMs}`);
    for (const t of truth) assert.ok(nearestGap(r.beats, t) <= 0.003, `hit ${t.toFixed(4)}: ${nearestGap(r.beats, t).toFixed(4)}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
