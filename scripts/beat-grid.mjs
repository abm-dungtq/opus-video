#!/usr/bin/env node
// beat-grid.mjs — measure the beat of a music bed: tempo (BPM), the time of the first beat (BEAT0),
// which beats carry a kick, and the bars where the energy jumps (drops). Measures only; never edits
// or splices the music. timing.mjs reads the written <music>.beats.json so B(n) in the composition
// lands on beat n.
//   node beat-grid.mjs <music> [--min-bpm 70] [--max-bpm 180] [--json] [--write]
//   node beat-grid.mjs --help | -h
// Method (port of ak-motion-video fit-beat-grid.py, no librosa): ffmpeg decodes the file twice to
//   mono f32 at 22050 Hz, full band and under 150 Hz (lowpass=f=150 twice). Onset = rise of log
//   RMS per 256-sample frame. A constant-tempo grid is fitted to low onset + 0.5 × full onset
//   (BPM step 0.02, BEAT0 step 4 ms): the grid whose beats hit the most onset energy wins. When the
//   grid at twice the tempo (inside the range) scores at least 90% as well, the faster one is kept
//   (a half-time grid hitting only the kicks of a four-on-the-floor track is not the tempo).
// Kick: a beat whose low-band onset is above 0.4 × the 70th percentile of all beats. `kick` lists
//   runs of consecutive kicked beats as half-open beat ranges [a, b). `drops` lists the first beat
//   of each bar whose RMS is at least 6 dB above the bar before.
// stability: standard deviation (ms) of the offset between each beat of the grid and the nearest
//   low-band onset peak above the kick threshold within a quarter beat (beats with none skipped;
//   a drifting tempo leaves the onsets anywhere in that window). BEAT0 is moved by the mean offset.
//   Over 45 ms, or fewer than 4 onsets to measure, the tempo drifts or cannot be read: UNSTABLE,
//   exit 1, --write writes nothing (B() must not use a grid the music does not follow). The
//   UNSTABLE line goes to stdout (stderr with --json).
//   45 ms is calibrated on six real beds of the workspace (all read the right tempo; spread 16–40 ms,
//   from swing and soft attacks around a steady grid) against 101 ms for a 100→140 BPM drift.
//   A slow bed that reads at twice its tempo: pass --max-bpm 100.
// Output: `BPM 120.0  BEAT0 0.043 s  stability 6 ms`, then one row per 4-beat bar: beat index,
//   start, kicks per beat ("K" or "."), RMS dB and a bar of #.
// --json   print { bpm, beat0, beatLen, bars: [{ bar, start, kicks, rmsDb }], kick: [[a, b]],
//          drops: [n], stability } instead (stability null when it cannot be measured).
// --write  write the same object to <music>.beats.json next to the file (only when stable).
// Exit: 0 stable · 1 UNSTABLE or too short to fit a grid · 2 bad usage, missing or undecodable file.

import { existsSync, realpathSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";

export const SR = 22050;
export const HOP = 256;
export const FPS = SR / HOP;
export const LIMITS = { stabilityMs: 45, minOnsets: 4, dropDb: 6, octaveRatio: 0.9, bpmStep: 0.02, beat0Step: 0.004 };
const LOW_AF = "lowpass=f=150,lowpass=f=150";

// Mono f32 samples of `file` at SR through the ffmpeg filter `af`. run: spawnSync or a stand-in.
// Throws on failure.
export function decode(file, af, run = spawnSync) {
  const r = run("ffmpeg", ["-hide_banner", "-nostdin", "-v", "error", "-i", file, "-af", af, "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], { maxBuffer: 1 << 30 });
  if (r.error) throw new Error(`cannot run ffmpeg: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${file}: ${String(r.stderr ?? "").trim()}`);
  const buf = Buffer.from(r.stdout);
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4)).slice();
}

// RMS per HOP-sample frame (trailing partial frame dropped).
export function framesRms(x) {
  const n = Math.floor(x.length / HOP), out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i * HOP; j < (i + 1) * HOP; j++) s += x[j] * x[j];
    out[i] = Math.sqrt(s / HOP + 1e-12);
  }
  return out;
}

// Positive rise of log RMS frame to frame (first frame 0).
export function onset(x) {
  const r = framesRms(x), out = new Float64Array(r.length);
  for (let i = 1; i < r.length; i++) out[i] = Math.max(0, Math.log(r[i] + 1e-5) - Math.log(r[i - 1] + 1e-5));
  return out;
}

// Sliding maximum of width `size` centred on each sample (edges clamp), like scipy maximum_filter1d.
export function maxFilter(a, size) {
  const h = Math.floor(size / 2), out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) {
    let m = -Infinity;
    for (let j = i - h; j < i - h + size; j++) m = Math.max(m, a[Math.min(a.length - 1, Math.max(0, j))]);
    out[i] = m;
  }
  return out;
}

// numpy.percentile with linear interpolation.
export function percentile(a, p) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y), k = (s.length - 1) * p / 100, f = Math.floor(k);
  return f + 1 < s.length ? s[f] + (s[f + 1] - s[f]) * (k - f) : s[f];
}

// Best BEAT0 for one tempo: { score, beat0 } = mean env at the grid beats (null when the clip
// holds fewer than one beat).
function scoreTempo(env, dur, bpm) {
  const n = env.length, beat = 60 / bpm, nk = Math.floor((dur - beat) / beat);
  if (nk < 1) return null;
  let best = null;
  for (let j = 0; j * LIMITS.beat0Step < beat; j++) {
    const b0 = j * LIMITS.beat0Step;
    let s = 0;
    for (let k = 0; k < nk; k++) s += env[Math.min(n - 1, Math.max(0, Math.round((b0 + beat * k) * FPS)))];
    s /= nk;
    if (!best || s > best.score) best = { score: s, beat0: b0 };
  }
  return best;
}

// Constant grid whose beats hit the most onset energy → { bpm, beat0, score }, or null when the
// clip is too short for any tempo in the range. A tempo twice as fast (inside the range) that scores
// at least octaveRatio of the best is preferred.
export function fitGrid(env, dur, minBpm, maxBpm) {
  const steps = Math.round((maxBpm - minBpm) / LIMITS.bpmStep);
  let best = null;
  for (let i = 0; i <= steps; i++) {
    const bpm = minBpm + i * LIMITS.bpmStep;
    const r = scoreTempo(env, dur, bpm);
    if (r && (!best || r.score > best.score)) best = { bpm, beat0: r.beat0, score: r.score };
  }
  if (!best) return null;
  if (best.bpm * 2 <= maxBpm) {
    // search the double tempo within ±0.1 BPM: grid steps do not land exactly on 2 × bpm
    let dbl = null;
    for (let d = -5; d <= 5; d++) {
      const bpm = best.bpm * 2 + d * LIMITS.bpmStep;
      if (bpm < minBpm || bpm > maxBpm) continue;
      const r = scoreTempo(env, dur, bpm);
      if (r && (!dbl || r.score > dbl.score)) dbl = { bpm, beat0: r.beat0, score: r.score };
    }
    if (dbl && dbl.score >= LIMITS.octaveRatio * best.score) best = dbl;
  }
  return best;
}

// Local maxima of the low-band onset above `thr` → frame indices.
function onsetPeaks(lowOn, thr) {
  const out = [];
  for (let i = 1; i < lowOn.length - 1; i++) if (lowOn[i] > thr && lowOn[i] >= lowOn[i - 1] && lowOn[i] > lowOn[i + 1]) out.push(i);
  return out;
}

const r2 = (n) => Math.round(n * 100) / 100;
const r3 = (n) => Math.round(n * 1000) / 1000;

// full, low: Float32Array mono at SR (full band, under 150 Hz). Returns the beats object
// { bpm, beat0, beatLen, bars, kick, drops, stability } or null when the clip is too short.
export function analyze(full, low, { minBpm = 70, maxBpm = 180 } = {}) {
  const dur = full.length / SR;
  const lowOn = onset(low), fullOn = onset(full), rms = framesRms(full);
  const n = Math.min(lowOn.length, fullOn.length);
  let lm = 0, fm = 0;
  for (const v of lowOn) lm = Math.max(lm, v);
  for (const v of fullOn) fm = Math.max(fm, v);
  const mix = new Float64Array(n);
  for (let i = 0; i < n; i++) mix[i] = lowOn[i] / (lm + 1e-9) + 0.5 * fullOn[i] / (fm + 1e-9);
  const fit = fitGrid(maxFilter(mix, 3), dur, minBpm, maxBpm);
  if (!fit) return null;
  const beat = 60 / fit.bpm;
  let b0 = fit.beat0;
  // Kick strength at each beat of a grid starting at `t0`: low-band onset within ±2 frames.
  const lo = maxFilter(lowOn, 5);
  const strengthAt = (t0) => {
    const v = [];
    for (let i = 0; i < Math.floor((dur - t0) / beat); i++) v.push(lo[Math.min(lo.length - 1, Math.round((t0 + i * beat) * FPS))]);
    return v;
  };
  // A kick is above 0.4 × the 70th percentile of the beats (a lone loud onset, such as the music
  // starting from silence, does not set the bar).
  const thr = percentile(strengthAt(b0), 70) * 0.4;

  // Offset of every grid beat to the nearest low-band onset peak above the kick threshold within a
  // quarter beat (beats with none are skipped). On a steady track each beat finds its kick; a
  // drifting tempo leaves the onsets anywhere in the window.
  const peaks = onsetPeaks(lowOn, thr).map((i) => i / FPS), offsets = [];
  for (let i = 0, j = 0; i < Math.floor((dur - b0) / beat); i++) {
    const t = b0 + i * beat;
    while (j < peaks.length && peaks[j] < t - beat / 4) j++;
    let near = null;
    for (let k = j; k < peaks.length && peaks[k] <= t + beat / 4; k++) if (near == null || Math.abs(peaks[k] - t) < Math.abs(near - t)) near = peaks[k];
    if (near != null) offsets.push(near - t);
  }
  let stability = null;
  if (offsets.length >= LIMITS.minOnsets) {
    const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
    stability = Math.sqrt(offsets.reduce((a, b) => a + (b - mean) ** 2, 0) / offsets.length) * 1000;
    b0 = ((b0 + mean) % beat + beat) % beat;
  }

  const kicked = strengthAt(b0).map((k) => k > thr);
  const kick = [];
  kicked.forEach((k, i) => {
    if (!k) return;
    const last = kick[kick.length - 1];
    if (last && last[1] === i) last[1] = i + 1;
    else kick.push([i, i + 1]);
  });
  const bars = [], drops = [];
  for (let bar = 0; bar < Math.floor(kicked.length / 4); bar++) {
    const t = b0 + bar * 4 * beat;
    const i0 = Math.floor(t * FPS), i1 = Math.min(rms.length, Math.floor((t + 4 * beat) * FPS));
    let s = 0;
    for (let i = i0; i < i1; i++) s += rms[i];
    const db = 20 * Math.log10((i1 > i0 ? s / (i1 - i0) : 0) + 1e-9);
    if (bars.length && db - bars[bars.length - 1].rmsDb >= LIMITS.dropDb) drops.push(bar * 4);
    bars.push({ bar, start: r3(t), kicks: kicked.slice(bar * 4, bar * 4 + 4).map((k) => (k ? "K" : ".")).join(""), rmsDb: Math.round(db * 10) / 10 });
  }
  return { bpm: r2(fit.bpm), beat0: r3(b0), beatLen: Math.round(beat * 1e6) / 1e6, bars, kick, drops, stability: stability == null ? null : Math.round(stability * 10) / 10 };
}

export const isStable = (r) => r.stability != null && r.stability <= LIMITS.stabilityMs;

export function main(argv = process.argv.slice(2), { out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s), run = spawnSync } = {}) {
  if (wantsHelp(argv)) { out(helpText(import.meta.url)); return 0; }
  const usage = "usage: node beat-grid.mjs <music> [--min-bpm 70] [--max-bpm 180] [--json] [--write]";
  const o = { file: null, minBpm: 70, maxBpm: 180, json: false, write: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--min-bpm" || a === "--max-bpm") {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v) || v <= 0) { err(`beat-grid: ${a} needs a positive number\n${usage}\n`); return 2; }
      o[a === "--min-bpm" ? "minBpm" : "maxBpm"] = v;
    } else if (a === "--json") o.json = true;
    else if (a === "--write") o.write = true;
    else if (a.startsWith("--") || o.file) { err(`beat-grid: unknown argument ${a}\n${usage}\n`); return 2; }
    else o.file = a;
  }
  if (!o.file) { err(`beat-grid: music file is required\n${usage}\n`); return 2; }
  if (o.minBpm >= o.maxBpm) { err(`beat-grid: --min-bpm must be below --max-bpm\n`); return 2; }
  const file = resolve(o.file);
  if (!existsSync(file)) { err(`beat-grid: file not found: ${file}\n`); return 2; }

  let r;
  try {
    r = analyze(decode(file, "anull", run), decode(file, LOW_AF, run), o);
  } catch (e) { err(`beat-grid: ${e.message}\n`); return 2; }
  if (!r) { err(`beat-grid: ${o.file} quá ngắn để đo nhịp trong ${o.minBpm}–${o.maxBpm} BPM\n`); return 1; }
  const stable = isStable(r);

  if (o.json) out(JSON.stringify(r, null, 2) + "\n");
  else {
    const lines = [`BPM ${r.bpm.toFixed(1)}  BEAT0 ${r.beat0.toFixed(3)} s  stability ${r.stability == null ? "?" : Math.round(r.stability)} ms`];
    for (const b of r.bars) lines.push(` beat ${String(b.bar * 4).padStart(3)} ${b.start.toFixed(2).padStart(7)} s  ${b.kicks}  ${b.rmsDb.toFixed(1).padStart(6)} dB  ${"#".repeat(Math.max(0, Math.floor(b.rmsDb + 40)))}`);
    out(lines.join("\n") + "\n");
  }
  if (!stable) {
    const why = r.stability == null ? `dưới ${LIMITS.minOnsets} onset dải thấp để đo độ lệch` : `stability ${Math.round(r.stability)} ms > ${LIMITS.stabilityMs} ms`;
    (o.json ? err : out)(`UNSTABLE ${why}: nhịp trôi hoặc không đọc được; không ghi beats.json, B() không dùng được\n`);
    return 1;
  }
  if (o.write) {
    const target = `${file}.beats.json`;
    try { writeFileSync(target, JSON.stringify(r, null, 2) + "\n"); } catch (e) { err(`beat-grid: cannot write ${target}: ${e.message}\n`); return 1; }
    out(`đã ghi ${target}\n`);
  }
  return 0;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
