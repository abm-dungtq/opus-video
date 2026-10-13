#!/usr/bin/env node
// export.mjs — delivery copies per platform from a final MP4 that passed the gate, plus a
// thumbnail taken from an approved demo frame. Runs check-preflight --stage final first.
//   node export.mjs --project <dir> --input <renders/x.mp4> --target <zalo|youtube|tiktok|facebook>[,<...>]
//                   [--thumb-frame <n>] [--no-thumb]
//   node export.mjs --help | -h
// Targets (constant TARGETS in this file; all keep the fps, -pix_fmt yuv420p -preset slow
// -movflags +faststart, AAC 48 kHz, two-pass loudnorm to I=-14 LUFS, TP=-1 dBFS):
//   youtube   same size, H.264 high, 10M (max 12M, buf 20M), AAC 192k
//   tiktok    same size, 8M (max 10M, buf 16M), AAC 192k
//   facebook  same size, 8M (max 10M, buf 16M), AAC 192k
//   zalo      short side 720 (aspect kept, even sizes), 3M (max 4M, buf 6M), AAC 128k
// Thông số zalo và facebook là mặc định giả định, chưa kiểm với tài liệu nền tảng; sửa trong TARGETS.
// Output next to the input: <name>-<target>.mp4 and <name>-thumb.jpg. Existing files are never
// overwritten. Each output is checked after encoding (fps kept, duration within 0.5s, size per
// the table, integrated loudness within 1 LU of -14); a failed check deletes that output.
// Thumbnail: the "- demo/....png (<label>)" lines under "## Frames" in DEMO.md; label 9:16 for a
// portrait input (falls back to main), main for landscape. --thumb-frame picks the n-th (0-based,
// default 0). DEMO.md approval must not be pending. --no-thumb skips the thumbnail.
// Exit: 0 ok · 1 ffmpeg failed or post-export check failed · 2 bad usage or output exists ·
//       5 gate blocked (preflight or demo not approved).

import { existsSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { check, report, approvalOf } from "./check-preflight.mjs";
import { measure } from "./qc-mp4.mjs";

export const GATE_EXIT = 5;
export const LOUDNESS = { I: -14, TP: -1, LRA: 11, tolerance: 1 };
export const DURATION_TOL = 0.5;
export const TARGETS = {
  youtube: { short: null, profile: "high", bv: "10M", maxrate: "12M", bufsize: "20M", ba: "192k" },
  tiktok: { short: null, profile: null, bv: "8M", maxrate: "10M", bufsize: "16M", ba: "192k" },
  facebook: { short: null, profile: null, bv: "8M", maxrate: "10M", bufsize: "16M", ba: "192k" },
  zalo: { short: 720, profile: null, bv: "3M", maxrate: "4M", bufsize: "6M", ba: "128k" },
};

const OPTS = { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 };
const LOUD_KEYS = ["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"];
const tail = (s, n = 4) => String(s || "").trim().split(/\r?\n/).slice(-n).join(" | ");

// Last JSON block that loudnorm prints to stderr → { input_i, input_tp, input_lra, input_thresh, target_offset } as numbers.
export function parseLoudnormJson(stderr) {
  const text = String(stderr);
  const end = text.lastIndexOf("}");
  const start = end < 0 ? -1 : text.lastIndexOf("{", end);
  if (start < 0) throw new Error("loudnorm printed no JSON block");
  let raw;
  try { raw = JSON.parse(text.slice(start, end + 1)); } catch { throw new Error("loudnorm JSON block is not valid JSON"); }
  const out = {};
  for (const k of LOUD_KEYS) {
    const v = Number(raw[k]);
    if (!Number.isFinite(v)) throw new Error(`loudnorm ${k} is "${raw[k]}" (silent or unreadable audio)`);
    out[k] = v;
  }
  return out;
}

const fpsOf = (s) => {
  const [n, d] = String(s || "").split("/").map(Number);
  return d ? n / d : Number(n) || 0;
};

// ffprobe → { width, height, fps, duration, hasAudio }; throws on a tool error.
export function probe(file, run = spawnSync) {
  const r = run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", resolve(file)], OPTS);
  if (r.error) throw new Error(`cannot run ffprobe: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`ffprobe cannot read ${file}: ${tail(r.stderr)}`);
  let info;
  try { info = JSON.parse(r.stdout); } catch { throw new Error(`ffprobe returned invalid JSON for ${file}`); }
  const streams = info.streams || [];
  const v = streams.find((s) => s.codec_type === "video" && !(s.disposition && s.disposition.attached_pic));
  if (!v) throw new Error(`${file} has no video stream`);
  return {
    width: Number(v.width), height: Number(v.height), fps: fpsOf(v.avg_frame_rate) || fpsOf(v.r_frame_rate),
    duration: Number(info.format?.duration) || Number(v.duration) || 0,
    hasAudio: streams.some((s) => s.codec_type === "audio"),
  };
}

// Output size for a target: same size, or short side scaled to `short` keeping aspect (even sizes).
export function targetSize(t, width, height) {
  if (!t.short) return { width, height, scale: null };
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  if (width <= height) return { width: t.short, height: even((height * t.short) / width), scale: `scale=${t.short}:-2` };
  return { width: even((width * t.short) / height), height: t.short, scale: `scale=-2:${t.short}` };
}

export function encodeArgs(input, output, t, src, loud) {
  const size = targetSize(t, src.width, src.height);
  const args = ["-hide_banner", "-nostats", "-n", "-i", resolve(input), "-map", "0:v:0"];
  if (src.hasAudio) args.push("-map", "0:a:0");
  if (size.scale) args.push("-vf", size.scale);
  args.push("-c:v", "libx264");
  if (t.profile) args.push("-profile:v", t.profile);
  args.push("-b:v", t.bv, "-maxrate", t.maxrate, "-bufsize", t.bufsize, "-pix_fmt", "yuv420p", "-preset", "slow");
  if (src.hasAudio) {
    const L = LOUDNESS;
    args.push("-af", `loudnorm=I=${L.I}:TP=${L.TP}:LRA=${L.LRA}:measured_I=${loud.input_i}:measured_TP=${loud.input_tp}:measured_LRA=${loud.input_lra}:measured_thresh=${loud.input_thresh}:offset=${loud.target_offset}:linear=true`,
      "-c:a", "aac", "-b:a", t.ba, "-ar", "48000");
  }
  args.push("-movflags", "+faststart", resolve(output));
  return args;
}

// Post-export check → list of problems (empty = ok).
export function verifyOutput(src, got, t, ebur) {
  const bad = [];
  const want = targetSize(t, src.width, src.height);
  if (Math.abs(got.fps - src.fps) > 0.01) bad.push(`fps ${got.fps} ≠ ${src.fps}`);
  if (Math.abs(got.duration - src.duration) > DURATION_TOL) bad.push(`duration ${got.duration}s vs ${src.duration}s (> ${DURATION_TOL}s)`);
  const sizeOk = t.short
    ? Math.min(got.width, got.height) === t.short && got.width % 2 === 0 && got.height % 2 === 0 && Math.abs(got.width - want.width) <= 2 && Math.abs(got.height - want.height) <= 2
    : got.width === want.width && got.height === want.height;
  if (!sizeOk) bad.push(`size ${got.width}×${got.height}, expected ${want.width}×${want.height}`);
  if (src.hasAudio) {
    if (!ebur || !Number.isFinite(ebur.I)) bad.push("integrated loudness not measurable");
    else if (Math.abs(ebur.I - LOUDNESS.I) > LOUDNESS.tolerance) bad.push(`loudness I ${ebur.I} LUFS, expected ${LOUDNESS.I} ± ${LOUDNESS.tolerance}`);
  }
  return bad;
}

// DEMO.md "## Frames" → [{ path, label }]
export function demoFrames(text) {
  const at = String(text).search(/^##\s+Frames\s*$/im);
  if (at < 0) return [];
  const body = text.slice(at).split(/\r?\n/).slice(1);
  const end = body.findIndex((l) => /^##\s/.test(l));
  return (end < 0 ? body : body.slice(0, end))
    .map((l) => l.match(/^\s*[-*]\s*(demo\/\S+\.png)\s*\(([^)]+)\)/i)).filter(Boolean)
    .map((m) => ({ path: m[1], label: m[2].trim() }));
}

export function pickThumb(frames, portrait, n = 0) {
  const tall = frames.filter((f) => f.label === "9:16");
  const main = frames.filter((f) => f.label === "main");
  const list = portrait && tall.length ? tall : main;
  return list[n] || null;
}

function parseArgs(argv) {
  const o = { project: ".", input: null, targets: null, thumbFrame: 0, noThumb: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[++i]; if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`); return v; };
    if (a === "--project") o.project = val();
    else if (a === "--input") o.input = val();
    else if (a === "--target") o.targets = val().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--thumb-frame") {
      const v = val();
      if (!/^\d+$/.test(v)) throw new Error("--thumb-frame must be a whole number ≥ 0");
      o.thumbFrame = Number(v);
    } else if (a === "--no-thumb") o.noThumb = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!o.input) throw new Error("--input is required");
  if (!o.targets || !o.targets.length) throw new Error("--target is required");
  const unknown = o.targets.filter((t) => !Object.hasOwn(TARGETS, t));
  if (unknown.length) throw new Error(`unknown target ${unknown.join(", ")} (use ${Object.keys(TARGETS).join(", ")})`);
  o.targets = [...new Set(o.targets)];
  return o;
}

const USAGE = "usage: node export.mjs --project <dir> --input <renders/x.mp4> --target <zalo|youtube|tiktok|facebook>[,...] [--thumb-frame <n>] [--no-thumb]";

export function main(argv = process.argv.slice(2), { run = spawnSync, checkImpl = check, out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}) {
  if (wantsHelp(argv)) { out(helpText(import.meta.url)); return 0; }
  let o;
  try { o = parseArgs(argv); } catch (e) { err(`export: ${e.message}\n${USAGE}\n`); return 2; }

  const gate = checkImpl({ project: o.project, stage: "final" });
  report(gate, (m) => err(`${m}\n`));
  if (!gate.pass) return GATE_EXIT;

  if (!existsSync(o.input)) { err(`export: input not found: ${o.input}\n`); return 2; }
  const dir = dirname(resolve(o.input));
  const name = basename(o.input, extname(o.input));
  const outputs = o.targets.map((t) => ({ target: t, file: join(dir, `${name}-${t}.mp4`) }));
  const thumbOut = join(dir, `${name}-thumb.jpg`);
  const taken = [...outputs.map((x) => x.file), ...(o.noThumb ? [] : [thumbOut])].filter(existsSync);
  if (taken.length) { err(`export: refusing to overwrite ${taken.join(", ")}\n`); return 2; }

  let src;
  try { src = probe(o.input, run); } catch (e) { err(`export: ${e.message}\n`); return 1; }

  let thumbSrc = null;
  if (!o.noThumb) {
    const demoMd = join(resolve(o.project), "DEMO.md");
    const text = existsSync(demoMd) ? readFileSync(demoMd, "utf8") : "";
    const approval = approvalOf(text);
    if (!approval || /^pending$/i.test(approval)) { err("export: demo chưa duyệt (DEMO.md approval pending hoặc thiếu)\n"); return GATE_EXIT; }
    const frame = pickThumb(demoFrames(text), src.height > src.width, o.thumbFrame);
    if (!frame) { err(`export: DEMO.md "## Frames" has no frame #${o.thumbFrame} for this aspect\n`); return 2; }
    thumbSrc = join(resolve(o.project), frame.path);
    if (!existsSync(thumbSrc)) { err(`export: demo frame not found: ${thumbSrc}\n`); return 1; }
  }

  let loud = null;
  if (src.hasAudio) {
    const L = LOUDNESS;
    const r = run("ffmpeg", ["-hide_banner", "-nostats", "-i", resolve(o.input), "-map", "0:a:0", "-af", `loudnorm=I=${L.I}:TP=${L.TP}:LRA=${L.LRA}:print_format=json`, "-f", "null", "-"], OPTS);
    if (r.error) { err(`export: cannot run ffmpeg: ${r.error.message}\n`); return 1; }
    if (r.status !== 0) { err(`export: loudnorm measure failed: ${tail(r.stderr)}\n`); return 1; }
    try { loud = parseLoudnormJson(r.stderr); } catch (e) { err(`export: ${e.message}\n`); return 1; }
  }

  for (const { target, file } of outputs) {
    const t = TARGETS[target];
    out(`export: ${target} → ${file}\n`);
    const r = run("ffmpeg", encodeArgs(o.input, file, t, src, loud), OPTS);
    if (r.error || r.status !== 0) {
      rmSync(file, { force: true });
      err(`export: ffmpeg failed for ${target}: ${r.error ? r.error.message : tail(r.stderr)}\n`);
      return 1;
    }
    let bad;
    try {
      const got = probe(file, run);
      const m = measure(file, run);
      bad = verifyOutput(src, got, t, m.metrics.ebur);
      out(`export: ${target} ${got.width}×${got.height} ${got.fps}fps ${Math.round(got.duration * 100) / 100}s I ${m.metrics.ebur?.I ?? "?"} LUFS\n`);
    } catch (e) { bad = [e.message]; }
    if (bad.length) {
      rmSync(file, { force: true });
      err(`export: ${target} failed the post-export check, removed ${file}: ${bad.join("; ")}\n`);
      return 1;
    }
  }

  if (thumbSrc) {
    const r = run("ffmpeg", ["-hide_banner", "-nostats", "-n", "-i", thumbSrc, "-frames:v", "1", "-q:v", "2", thumbOut], OPTS);
    if (r.error || r.status !== 0) {
      rmSync(thumbOut, { force: true });
      err(`export: thumbnail failed: ${r.error ? r.error.message : tail(r.stderr)}\n`);
      return 1;
    }
    out(`export: thumb → ${thumbOut} (from ${thumbSrc})\n`);
  }
  return 0;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
