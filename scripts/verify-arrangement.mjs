#!/usr/bin/env node
// verify-arrangement.mjs — measure every splice of an arranged music bed against the raw source.
// Adapted from the Python verify-arrangement script of ak:motion-video v1.3.0 (MIT), rewritten in Node; see NOTICE.
//   node verify-arrangement.mjs --project <dir> [--plan assets/bgm/music-arrangement.json]
//                               [--tolerance-ms 2] [--json]
//   node verify-arrangement.mjs --help | -h
// Reads the same plan as arrange-music.mjs. Source and output are decoded to mono float 48 kHz. For each
// segment a window of the output (0.5 s, or the whole segment minus its crossfades when shorter)
// starting 10 ms after the incoming crossfade is matched against the source at the segment's cut point,
// resampled by the segment's stretch ratio, over lags of ±50 ms in steps of one sample (normalised
// cross-correlation, plain loops). The lag is how far the piece sits from where the plan puts it.
// Prints `PASS|WARN|FAIL seg <i> beats a–b lag <x>ms corr <c>` per segment: FAIL when |lag| is over the
// tolerance, WARN when the best correlation is under 0.5 (the window is too quiet to measure). This is
// splice accuracy only; whether the beats of the output sit on the grid is maxDriftMs: the beats of the
// output measured by beat-grid's refineBeats() against the target grid beat0 + n·beatLen of the plan
// (not a grid re-fitted on the output, whose own BPM estimate would add its error). WARN over 20 ms.
// Last line `VERIFY PASS` or `VERIFY FAIL`.
// --json prints { segments: [{ seg, beats, lagMs, corr, status }], maxDriftMs, pass } instead.
// Exit 0 no FAIL, 1 a FAIL, 2 bad usage, bad plan or undecodable audio.
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { loadArrangement } from "./arrange-music.mjs";
import { decode, refineBeats } from "./beat-grid.mjs";

const SR = 48000, MAX_LAG = 0.05, WINDOW = 0.5, LEAD = 0.01, MIN_CORR = 0.5, DRIFT_WARN_MS = 20;

function decode48(file, run) {
  const r = run("ffmpeg", ["-hide_banner", "-nostdin", "-v", "error", "-i", file, "-ac", "1", "-ar", String(SR), "-f", "f32le", "pipe:1"], { maxBuffer: 512 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw new Error(`ffmpeg không giải mã được ${file}: ${r.error?.message ?? String(r.stderr ?? "").trim()}`);
  const buf = Buffer.from(r.stdout);
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4)).slice();
}

// Best lag (seconds) of output window [ws, ws + wl) against the source from `s` onward, the source read
// at `r` source seconds per output second. Returns { lag, corr }.
export function bestLag(src, outp, ws, wl, s, r) {
  const o0 = Math.round(ws * SR), n = Math.min(Math.round(wl * SR), outp.length - o0), maxLag = Math.round(MAX_LAG * SR);
  let ex = 0;
  for (let i = 0; i < n; i++) ex += outp[o0 + i] * outp[o0 + i];
  let best = { lag: 0, corr: -Infinity, short: true };
  for (let L = -maxLag; L <= maxLag; L++) {
    const p0 = s * SR + L;
    if (p0 < 0 || p0 + n * r + 1 >= src.length) continue;
    let num = 0, ey = 0;
    if (r === 1) {
      const q = Math.round(p0);
      for (let i = 0; i < n; i++) { const y = src[q + i]; num += outp[o0 + i] * y; ey += y * y; }
    } else {
      for (let i = 0; i < n; i++) {
        const p = p0 + i * r, k = Math.floor(p), f = p - k, y = src[k] + (src[k + 1] - src[k]) * f;
        num += outp[o0 + i] * y; ey += y * y;
      }
    }
    const c = num / Math.sqrt(ex * ey + 1e-20);
    if (c > best.corr) best = { lag: L / SR, corr: c };
  }
  return best.short ? { lag: 0, corr: 0, short: true } : best;
}

export function main(argv = process.argv.slice(2), { out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s), run = spawnSync } = {}) {
  if (wantsHelp(argv)) { out(helpText(import.meta.url)); return 0; }
  const usage = "usage: node verify-arrangement.mjs --project <dir> [--plan ...] [--tolerance-ms 2] [--json]";
  const o = { project: null, plan: undefined, tol: 2, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project" || a === "--plan") {
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) { err(`verify-arrangement: ${a} cần giá trị\n${usage}\n`); return 2; }
      o[a.slice(2)] = argv[++i];
    } else if (a === "--tolerance-ms") {
      const v = Number(argv[++i]);
      if (!(v > 0)) { err(`verify-arrangement: --tolerance-ms cần số dương\n${usage}\n`); return 2; }
      o.tol = v;
    } else if (a === "--json") o.json = true;
    else { err(`verify-arrangement: tham số lạ ${a}\n${usage}\n`); return 2; }
  }
  if (!o.project) { err(`verify-arrangement: thiếu --project\n${usage}\n`); return 2; }
  let arr, src, outp, drift;
  try {
    arr = loadArrangement(resolve(o.project), o.plan);
    if (!existsSync(arr.output)) throw new Error(`chưa có ${arr.output}; chạy arrange-music.mjs trước`);
    src = decode48(arr.source, run);
    outp = decode48(arr.output, run);
    const { beat0, beatLen } = arr.grid, end = arr.segs.at(-1).b;
    const beats = refineBeats(decode(arr.output, "anull", run), beat0, beatLen).slice(0, end);
    drift = beats.length ? Math.round(Math.max(...beats.map((t, n) => Math.abs(t - (beat0 + n * beatLen)))) * 1e4) / 10 : null;
  } catch (e) { err(`verify-arrangement: ${e.message}\n`); return 2; }

  const segments = arr.segs.map((s) => {
    const ws = s.d0 + arr.xf + LEAD, wl = Math.min(WINDOW, s.d1 - arr.xf - ws);
    const { lag, corr, short } = wl > 0.02 ? bestLag(src, outp, ws, wl, s.s0 + (arr.xf + LEAD) * s.r, s.r) : { lag: 0, corr: 0, short: true };
    const lagMs = Math.round(lag * 1e5) / 100;
    const status = Math.abs(lagMs) > o.tol ? "FAIL" : corr < MIN_CORR ? "WARN" : "PASS";
    return { seg: s.i, beats: [s.a, s.b], lagMs, corr: Math.round(corr * 1000) / 1000, status, ...(short ? { note: "không đủ nguồn để so" } : {}) };
  });
  const pass = segments.every((s) => s.status !== "FAIL");
  if (o.json) out(JSON.stringify({ segments, maxDriftMs: drift, pass }, null, 2) + "\n");
  else {
    const lines = segments.map((s) => `${s.status} seg ${s.seg} beats ${s.beats[0]}–${s.beats[1]} lag ${s.lagMs.toFixed(2)}ms corr ${s.corr.toFixed(3)}${s.note ? `  ${s.note}` : s.status === "WARN" ? "  đoạn quá êm để đo" : ""}`);
    if (drift == null) lines.push("WARN maxDriftMs: không đo được nhịp của output");
    else lines.push(`${drift > DRIFT_WARN_MS ? "WARN" : "INFO"} maxDriftMs ${drift} (beat của output so với lưới đều)`);
    lines.push(`VERIFY ${pass ? "PASS" : "FAIL"}`);
    out(lines.join("\n") + "\n");
  }
  return pass ? 0 : 1;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
