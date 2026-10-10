#!/usr/bin/env node
// cut.mjs — measure safe cut points in real footage and assemble a cut from a JSON edit list.
//
//   node cut.mjs probe     --in <media> [--min-gap-ms 250] [--out probe.json]
//   node cut.mjs apply-edl --edl <edl.json> --out <cut.mp4> [--fade-ms 12]
//
// probe:     RMS envelope (10 ms windows, 16 kHz mono); noise floor = 10th percentile,
//            threshold = min(floor + 12 dB, floor + 0.35·(peak − floor)); quiet runs ≥ min-gap are gaps.
// apply-edl: ranges are snapped to the frame grid and joined with one ffmpeg concat encode;
//            each join gets a short audio fade to avoid clicks. Sources must agree on fps, size,
//            pixel format and colour tags.
// Exit codes: 0 ok, 1 usage or invalid EDL, 2 unusable input (no speech contrast / incompatible sources),
//             3 ffmpeg failure or duration mismatch.
//
// Adapted from ideas in veedstudio/open-edit (Apache-2.0, © 2026 VEED LIMITED), commit
// 1d3b75b7f46280061bae5ab4cb47b9538276d8fb: speech-probe, edl, apply-edl. Rewritten for opus-video;
// changes: single-file Node script, fade-at-joins instead of overlapping crossfades, no transcript handling.
// See NOTICE and third_party/open-edit/LICENSE.

import { readFileSync, writeFileSync, existsSync, realpathSync, renameSync, rmSync } from "node:fs";
import { dirname, resolve, isAbsolute, basename, extname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const EXIT = { OK: 0, USAGE: 1, INPUT: 2, FFMPEG: 3 };

const SAMPLE_RATE = 16000;
const WINDOW_MS = 10;
const FLOOR_DB = -100;
const COLOUR_FIELDS = ["color_primaries", "color_transfer", "color_space"];
const MATCH_FIELDS = ["fps", "width", "height", "pix_fmt", ...COLOUR_FIELDS];
const HDR_TRANSFERS = new Set(["arib-std-b67", "smpte2084"]);

const r3 = (x) => Math.round(x * 1000) / 1000;
const r1 = (x) => Math.round(x * 10) / 10;

// ---------- pure helpers ----------

export function envelopeDb(samples, sampleRate, windowMs = WINDOW_MS) {
  const size = Math.max(1, Math.round((sampleRate * windowMs) / 1000));
  const out = [];
  for (let i = 0; i < samples.length; i += size) {
    const end = Math.min(samples.length, i + size);
    let sum = 0;
    for (let j = i; j < end; j++) sum += samples[j] * samples[j];
    const rms = Math.sqrt(sum / (end - i));
    out.push(Math.max(FLOOR_DB, 20 * Math.log10(Math.max(rms, 1e-5))));
  }
  return out;
}

export function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return sorted[Math.min(n - 1, Math.floor((p / 100) * n))];
}

export function analyseEnvelope(db, windowMs, minGapMs = 250) {
  if (!db.length) throw new Error("NO_SPEECH_CONTRAST");
  const floor = percentile(db, 10);
  const peak = percentile(db, 99);
  if (peak - floor < 6) throw new Error("NO_SPEECH_CONTRAST");
  const threshold = Math.min(floor + 12, floor + 0.35 * (peak - floor));
  const sec = (i) => r3((i * windowMs) / 1000);
  const duration = sec(db.length);

  const gaps = [];
  let i = 0;
  while (i < db.length) {
    if (db[i] >= threshold) { i++; continue; }
    const i0 = i;
    while (i < db.length && db[i] < threshold) i++;
    const i1 = i - 1;
    if ((i1 - i0 + 1) * windowMs < minGapMs) continue;
    const gap = { start: sec(i0), end: sec(i1 + 1) };
    gap.dur = r3(gap.end - gap.start);
    if (i0 === 0) gap.edge = "head";
    else if (i1 === db.length - 1) gap.edge = "tail";
    gaps.push(gap);
  }

  const speech = [];
  let cursor = 0;
  for (const g of gaps) {
    if (g.start > cursor) speech.push({ start: cursor, end: g.start });
    cursor = g.end;
  }
  if (duration > cursor) speech.push({ start: cursor, end: duration });

  return { floor_db: r1(floor), peak_db: r1(peak), threshold_db: r1(threshold), gaps, speech };
}

export function parseEdl(obj, baseDir) {
  const bad = (why) => { throw new Error(`INVALID_EDL: ${why}`); };
  if (!obj || typeof obj.sources !== "object" || Array.isArray(obj.sources) || !Object.keys(obj.sources).length)
    bad("sources must be a non-empty object");
  if (!Array.isArray(obj.ranges) || !obj.ranges.length) bad("ranges must be a non-empty array");
  const sources = {};
  for (const [id, p] of Object.entries(obj.sources)) {
    if (typeof p !== "string" || !p) bad(`source ${id} has no path`);
    sources[id] = isAbsolute(p) ? p : resolve(baseDir, p);
  }
  const ranges = obj.ranges.map((r, i) => {
    if (!r || !(r.source in sources)) bad(`range ${i} uses unknown source ${r?.source}`);
    if (!Number.isFinite(r.start) || !Number.isFinite(r.end)) bad(`range ${i} needs numeric start/end`);
    if (r.start < 0) bad(`range ${i} starts before 0`);
    if (r.end <= r.start) bad(`range ${i} ends before it starts`);
    const out = { source: r.source, start: r.start, end: r.end };
    if (r.note) out.note = r.note;
    return out;
  });
  return { sources, ranges };
}

export function snapRanges(ranges, fps) {
  return ranges
    .map((r) => ({ ...r, start: Math.round(r.start * fps) / fps, end: Math.round(r.end * fps) / fps }))
    .filter((r) => r.end > r.start);
}

export function buildFilter(ranges, inputIndexOf, fadeS) {
  const parts = [];
  const pads = [];
  const F = fadeS.toFixed(6);
  ranges.forEach((r, i) => {
    const k = inputIndexOf[r.source];
    const S = r.start.toFixed(6);
    const E = r.end.toFixed(6);
    const D = r.end - r.start;
    parts.push(`[${k}:v]trim=start=${S}:end=${E},setpts=PTS-STARTPTS[v${i}]`);
    let a = `[${k}:a]atrim=start=${S}:end=${E},asetpts=PTS-STARTPTS`;
    if (D > 2 * fadeS) a += `,afade=t=in:d=${F},afade=t=out:st=${(D - fadeS).toFixed(6)}:d=${F}`;
    parts.push(`${a}[a${i}]`);
    pads.push(`[v${i}][a${i}]`);
  });
  parts.push(`${pads.join("")}concat=n=${ranges.length}:v=1:a=1[v][a]`);
  return parts.join(";");
}

// ---------- ffmpeg / ffprobe ----------

function ffprobeJson(path) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", path], { encoding: "utf8" });
  if (r.error) throw Object.assign(new Error(`cannot run ffprobe: ${r.error.message}`), { code: EXIT.FFMPEG });
  if (r.status !== 0) throw Object.assign(new Error(`ffprobe failed for ${path}: ${r.stderr.trim()}`), { code: EXIT.FFMPEG });
  return JSON.parse(r.stdout);
}

function parseRate(s) {
  const [n, d] = String(s).split("/").map(Number);
  return d ? n / d : n;
}

function describeSource(path) {
  const info = ffprobeJson(path);
  const v = info.streams.find((s) => s.codec_type === "video");
  const a = info.streams.find((s) => s.codec_type === "audio");
  if (!v) return { path, missing: "video" };
  const desc = {
    path,
    fps: parseRate(v.r_frame_rate),
    rate: v.r_frame_rate,
    width: v.width,
    height: v.height,
    pix_fmt: v.pix_fmt,
    duration: Number(info.format?.duration),
    hasAudio: Boolean(a),
  };
  for (const f of COLOUR_FIELDS) desc[f] = v[f] || "unknown";
  return desc;
}

function videoDuration(path) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=duration:format=duration", "-of", "json", path], { encoding: "utf8" });
  const j = JSON.parse(r.stdout || "{}");
  const d = Number(j.streams?.[0]?.duration);
  return Number.isFinite(d) ? d : Number(j.format?.duration);
}

const samePath = (a, b) => {
  const real = (p) => (existsSync(p) ? realpathSync(p) : resolve(p));
  return real(a) === real(b);
};

// ---------- commands ----------

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    args[key] = next !== undefined && !next.startsWith("--") ? (i++, next) : true;
  }
  return args;
}

function probe(args) {
  const input = args.in;
  if (typeof input !== "string" || !existsSync(input)) {
    console.error("usage: cut.mjs probe --in <media> [--min-gap-ms 250] [--out probe.json]");
    return EXIT.USAGE;
  }
  const minGapMs = args["min-gap-ms"] ? Number(args["min-gap-ms"]) : 250;
  if (!(minGapMs > 0)) {
    console.error("--min-gap-ms must be a positive number");
    return EXIT.USAGE;
  }
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", input, "-vn", "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "f32le", "-"],
    { maxBuffer: 1024 ** 3 });
  if (r.error || r.status !== 0) {
    console.error(`ffmpeg failed: ${r.error ? r.error.message : String(r.stderr).trim()}`);
    return EXIT.FFMPEG;
  }
  const buf = r.stdout;
  const ab = new ArrayBuffer(buf.length - (buf.length % 4));
  new Uint8Array(ab).set(buf.subarray(0, ab.byteLength));
  const samples = new Float32Array(ab);

  let analysis;
  try {
    analysis = analyseEnvelope(envelopeDb(samples, SAMPLE_RATE), WINDOW_MS, minGapMs);
  } catch (err) {
    console.error(err.message);
    return EXIT.INPUT;
  }
  const result = {
    source: input,
    duration: r3(samples.length / SAMPLE_RATE),
    floor_db: analysis.floor_db,
    peak_db: analysis.peak_db,
    threshold_db: analysis.threshold_db,
    min_gap_ms: minGapMs,
    gaps: analysis.gaps,
    speech: analysis.speech,
  };
  const text = JSON.stringify(result, null, 2);
  if (typeof args.out === "string") writeFileSync(args.out, text + "\n");
  console.log(text);
  return EXIT.OK;
}

function applyEdl(args) {
  if (typeof args.edl !== "string" || typeof args.out !== "string" || !existsSync(args.edl)) {
    console.error("usage: cut.mjs apply-edl --edl <edl.json> --out <cut.mp4> [--fade-ms 12]");
    return EXIT.USAGE;
  }
  const fadeMs = args["fade-ms"] !== undefined ? Number(args["fade-ms"]) : 12;
  if (!(fadeMs >= 0)) {
    console.error("--fade-ms must be a number ≥ 0");
    return EXIT.USAGE;
  }
  const fadeS = fadeMs / 1000;

  let edl;
  try {
    edl = parseEdl(JSON.parse(readFileSync(args.edl, "utf8")), dirname(resolve(args.edl)));
  } catch (err) {
    console.error(err.message);
    return EXIT.USAGE;
  }

  const ids = Object.keys(edl.sources);
  const descs = {};
  for (const id of ids) {
    if (!existsSync(edl.sources[id])) {
      console.error(`INVALID_EDL: source ${id} not found: ${edl.sources[id]}`);
      return EXIT.USAGE;
    }
    if (samePath(edl.sources[id], args.out)) {
      console.error(`OUTPUT_IS_SOURCE: --out would overwrite source ${id}`);
      return EXIT.USAGE;
    }
    descs[id] = describeSource(edl.sources[id]);
  }

  const first = descs[ids[0]];
  const problems = new Set();
  for (const id of ids) {
    const d = descs[id];
    if (d.missing) { problems.add(`${id} has no ${d.missing}`); continue; }
    if (!d.hasAudio) problems.add(`${id} has no audio`);
    for (const f of MATCH_FIELDS) if (d[f] !== first[f]) problems.add(f);
  }
  if (problems.size) {
    console.error(`INCOMPATIBLE_SOURCES: ${[...problems].join(", ")}`);
    return EXIT.INPUT;
  }

  if (/1[02]le|1[02]be|p16/.test(first.pix_fmt) || HDR_TRANSFERS.has(first.color_transfer)) {
    console.error(`UNSUPPORTED_HDR_OR_10BIT: ${first.pix_fmt}, ${first.color_transfer}; convert to 8-bit SDR first`);
    return EXIT.INPUT;
  }

  for (const [i, r] of edl.ranges.entries()) {
    if (!(r.end <= descs[r.source].duration + 0.001)) {
      console.error(`INVALID_EDL: range beyond source (range ${i}: end ${r.end} > ${descs[r.source].duration})`);
      return EXIT.USAGE;
    }
  }

  const fps = first.fps;
  const ranges = snapRanges(edl.ranges, fps);
  if (ranges.length < edl.ranges.length)
    console.error(`warning: ${edl.ranges.length - ranges.length} range(s) shorter than one frame were dropped`);
  if (!ranges.length) {
    console.error("INVALID_EDL: no range left after snapping to the frame grid");
    return EXIT.USAGE;
  }

  const inputIndexOf = Object.fromEntries(ids.map((id, i) => [id, i]));
  const ff = ["-y", "-v", "error"];
  for (const id of ids) ff.push("-i", edl.sources[id]);
  ff.push("-filter_complex", buildFilter(ranges, inputIndexOf, fadeS),
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", first.rate,
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart");
  if (first.color_primaries !== "unknown") ff.push("-color_primaries", first.color_primaries);
  if (first.color_transfer !== "unknown") ff.push("-color_trc", first.color_transfer);
  if (first.color_space !== "unknown") ff.push("-colorspace", first.color_space);
  // Encode to a sibling temp file; the final path only appears once the result is verified.
  const ext = extname(args.out);
  const partial = join(dirname(resolve(args.out)), `.${basename(args.out, ext)}.partial${ext}`);
  ff.push(partial);

  const r = spawnSync("ffmpeg", ff, { encoding: "utf8" });
  if (r.error || r.status !== 0) {
    rmSync(partial, { force: true });
    console.error(`ffmpeg failed: ${r.error ? r.error.message : r.stderr.trim()}`);
    return EXIT.FFMPEG;
  }

  const expected = r3(ranges.reduce((s, x) => s + (x.end - x.start), 0));
  const actual = r3(videoDuration(partial));
  if (!(Math.abs(actual - expected) <= 1 / fps + 0.001)) {
    rmSync(partial, { force: true });
    console.error(`DURATION_MISMATCH: expected ${expected}s, got ${actual}s`);
    return EXIT.FFMPEG;
  }
  renameSync(partial, args.out);
  console.log(JSON.stringify({ out: args.out, fps, ranges, expected_duration: expected, actual_duration: actual }, null, 2));
  return EXIT.OK;
}

export function main(argv = process.argv.slice(2)) {
  const [cmd, ...rest] = argv;
  const commands = { probe, "apply-edl": applyEdl };
  if (!commands[cmd]) {
    console.error("usage: cut.mjs probe|apply-edl [options]");
    return EXIT.USAGE;
  }
  try {
    return commands[cmd](parseArgs(rest));
  } catch (err) {
    console.error(`error: ${err.message}`);
    return err.code ?? EXIT.FFMPEG;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
