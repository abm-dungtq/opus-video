#!/usr/bin/env node
// normalize-bed.mjs — trim the silence at the head and tail of a music bed or SFX file and bring
// it to a fixed loudness, so a generated or downloaded file never lands in a mix at -26 LUFS with
// a second of silence before the first note.
//   node normalize-bed.mjs --in <file> [--out <file>] [--lufs -12.5] [--tp -1.5] [--silence-db -50] [--keep-head 0.05]
//   node normalize-bed.mjs --help | -h
// Without --out the input is replaced, through a temp file in the same folder renamed over it.
// Trim: silenceremove at the head, then the same on the reversed audio for the tail (peak
//   detection, threshold --silence-db dBFS); --keep-head seconds of the silence are kept at each
//   end so the attack of a soft first note is not cut.
// Loudness: loudnorm in two passes (pass 1 measures the trimmed audio, pass 2 applies it with the
//   measured values, linear when the true-peak ceiling allows) to I=--lufs, TP=--tp, LRA=11. The
//   sample rate of the input is kept; an .mp3 output is encoded as MP3 192 kbit/s.
// Prints one line: "NORMALIZE <file> lufs_in=<x> lufs_out=<y> trimmed_head=<s> trimmed_tail=<s>"
//   (lufs_in is measured on the trimmed audio, lufs_out on the written file).
// eleven.mjs sfx and music call normalizeBed() on every file they write (pass --no-normalize there).
// Exit: 0 done · 1 ffmpeg/ffprobe failed or the file is silent · 2 bad usage or missing input.

import { existsSync, mkdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";

export const BED_DEFAULTS = Object.freeze({ lufs: -12.5, tp: -1.5, lra: 11, silenceDb: -50, keepHead: 0.05 });

class UsageError extends Error {}

const BUF = { encoding: "utf8", maxBuffer: 64 << 20 };

function tool(run, name, args) {
  const r = run(name, args, BUF);
  if (r.error) throw new Error(`cannot run ${name}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${name} exited ${r.status}: ${String(r.stderr).trim().split("\n").slice(-3).join(" | ")}`);
  return r;
}

function probe(run, file) {
  const r = tool(run, "ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate:format=duration", "-of", "json", file]);
  let info;
  try { info = JSON.parse(r.stdout); } catch { throw new Error(`ffprobe returned invalid JSON for ${file}`); }
  const rate = Number(info.streams?.[0]?.sample_rate);
  const duration = Number(info.format?.duration);
  if (!(rate > 0)) throw new Error(`no audio stream in ${file}`);
  return { rate, duration: Number.isFinite(duration) ? duration : NaN };
}

// One silenceremove at the head; the tail is the same filter on the reversed audio.
export function trimFilter({ silenceDb = BED_DEFAULTS.silenceDb, keepHead = BED_DEFAULTS.keepHead } = {}) {
  const head = `silenceremove=start_periods=1:start_duration=0:start_threshold=${silenceDb}dB:start_silence=${keepHead}:detection=peak`;
  return { head, both: `${head},areverse,${head},areverse` };
}

const loudnormBase = (o) => `loudnorm=I=${o.lufs}:TP=${o.tp}:LRA=${o.lra}`;

// Last JSON object loudnorm printed (print_format=json).
export function parseLoudnormJson(stderr) {
  const m = String(stderr).match(/\{[^{}]*"input_i"[^{}]*\}/g);
  if (!m) throw new Error("loudnorm printed no measurement");
  return JSON.parse(m[m.length - 1]);
}

// Final out_time of `-progress pipe:1`, in seconds.
function progressSeconds(stdout) {
  const all = [...String(stdout).matchAll(/^out_time_us=(\d+)/gm)];
  return all.length ? Number(all[all.length - 1][1]) / 1e6 : NaN;
}

const nullOut = ["-f", "null", "-", "-progress", "pipe:1", "-nostats"];

function measure(run, file, filter, o) {
  const r = tool(run, "ffmpeg", ["-hide_banner", "-nostdin", "-i", file, "-af", `${filter ? `${filter},` : ""}${loudnormBase(o)}:print_format=json`, ...nullOut]);
  return { m: parseLoudnormJson(r.stderr), seconds: progressSeconds(r.stdout) };
}

const codecArgs = (out) => (extname(out).toLowerCase() === ".mp3" ? ["-c:a", "libmp3lame", "-b:a", "192k"] : []);
const round = (x, d = 2) => (Number.isFinite(x) ? +x.toFixed(d) : null);

// Trims and normalizes `input` into `output` (default: in place). Returns
// { file, lufsIn, lufsOut, trimmedHead, trimmedTail }. Throws UsageError for a missing input,
// Error when ffmpeg/ffprobe fails or the audio is silent. `output` is written through a temp file
// in its own folder, so a failure never leaves a half-written file in place of the original.
export function normalizeBed({ input, output, run = spawnSync, ...opts } = {}) {
  const o = { ...BED_DEFAULTS, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)) };
  for (const k of ["lufs", "tp", "lra", "silenceDb", "keepHead"]) if (!Number.isFinite(Number(o[k]))) throw new UsageError(`${k} must be a number, got ${o[k]}`);
  if (!(o.keepHead >= 0)) throw new UsageError(`keepHead must be >= 0, got ${o.keepHead}`);
  if (!input) throw new UsageError("input is required");
  const src = resolve(input);
  if (!existsSync(src) || !statSync(src).isFile()) throw new UsageError(`input not found: ${src}`);
  const dst = resolve(output || src);

  const { rate, duration } = probe(run, src);
  const { head, both } = trimFilter(o);
  const headOnly = tool(run, "ffmpeg", ["-hide_banner", "-nostdin", "-i", src, "-af", head, ...nullOut]);
  const afterHead = progressSeconds(headOnly.stdout);
  const pass1 = measure(run, src, both, o);
  const m = pass1.m;
  if (!Number.isFinite(Number(m.input_i)) || !(pass1.seconds > 0)) throw new Error(`${src} is silent (nothing above ${o.silenceDb} dBFS)`);

  const apply = `${both},${loudnormBase(o)}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=summary`;
  const tmp = join(dirname(dst), `.${basename(dst, extname(dst))}.normalize-${process.pid}${extname(dst)}`);
  try {
    tool(run, "ffmpeg", ["-hide_banner", "-nostdin", "-nostats", "-y", "-i", src, "-af", apply, "-ar", String(rate), ...codecArgs(dst), tmp]);
    const after = measure(run, tmp, "", o).m;
    renameSync(tmp, dst);
    return {
      file: dst,
      lufsIn: round(Number(m.input_i)),
      lufsOut: round(Number(after.input_i)),
      trimmedHead: round(Math.max(0, duration - afterHead), 3),
      trimmedTail: round(Math.max(0, afterHead - pass1.seconds), 3),
    };
  } finally {
    rmSync(tmp, { force: true });
  }
}

// What eleven.mjs sfx/music do with the bytes the API returned: write them to `out`, then
// normalize in place unless `normalize` is false. A failed normalize keeps the file as written
// (the generation was already paid for) and reports `WARN normalize: <reason>` through `warn`.
// Returns the normalizeBed() result, or null when skipped or failed.
export function writeGenerated(out, buf, { normalize = true, run = spawnSync, log = () => {}, warn = () => {}, ...opts } = {}) {
  const dst = resolve(out);
  mkdirSync(dirname(dst), { recursive: true });
  writeFileSync(dst, buf);
  if (!normalize) return null;
  try {
    const r = normalizeBed({ input: dst, run, ...opts });
    log(normalizeLine(r));
    return r;
  } catch (e) {
    warn(`WARN normalize: ${e.message}`);
    return null;
  }
}

export const normalizeLine = (r) => `NORMALIZE ${r.file} lufs_in=${r.lufsIn} lufs_out=${r.lufsOut} trimmed_head=${r.trimmedHead} trimmed_tail=${r.trimmedTail}`;

const FLAGS = { "--in": "input", "--out": "output", "--lufs": "lufs", "--tp": "tp", "--silence-db": "silenceDb", "--keep-head": "keepHead" };
const NUMERIC = new Set(["lufs", "tp", "silenceDb", "keepHead"]);

export function main(argv = process.argv.slice(2), { run = spawnSync, out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}) {
  if (wantsHelp(argv)) { out(helpText(import.meta.url)); return 0; }
  const usage = "usage: node normalize-bed.mjs --in <file> [--out <file>] [--lufs -12.5] [--tp -1.5] [--silence-db -50] [--keep-head 0.05]";
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const key = FLAGS[argv[i]];
    if (!key) { err(`normalize-bed: unknown argument ${argv[i]}\n${usage}\n`); return 2; }
    const v = argv[++i];
    // Negative numbers (-12.5) are values, other dash-led words are a missing value.
    if (v === undefined || (v.startsWith("--") && !/^-\d/.test(v))) { err(`normalize-bed: ${argv[i - 1]} needs a value\n${usage}\n`); return 2; }
    if (NUMERIC.has(key) && !Number.isFinite(Number(v))) { err(`normalize-bed: ${argv[i - 1]} needs a number, got ${v}\n`); return 2; }
    o[key] = NUMERIC.has(key) ? Number(v) : v;
  }
  if (!o.input) { err(`normalize-bed: --in is required\n${usage}\n`); return 2; }
  try {
    out(`${normalizeLine(normalizeBed({ ...o, run }))}\n`);
    return 0;
  } catch (e) {
    err(`normalize-bed: ${e.message}\n`);
    return e instanceof UsageError ? 2 : 1;
  }
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
