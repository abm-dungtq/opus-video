#!/usr/bin/env node
// qc-mp4.mjs — technical QA of a rendered MP4 before delivery (SKILL.md step 8). One ffprobe,
// one ffmpeg pass for picture, one for sound; prints one line per check: `LEVEL CODE detail`.
//   node qc-mp4.mjs <file.mp4> [--project <dir>] [--write-qa] [--json]
//   node qc-mp4.mjs --help | -h
// Checks (WARN never blocks; FAIL does):
//   NO_VIDEO   FAIL no video stream          NO_AUDIO   WARN no audio stream
//   ASPECT     FAIL size differs from BRIEF.md `aspect` (16:9 → 1920×1080, 9:16 → 1080×1920,
//              both → either); only with --project
//   DURATION   WARN differs from BRIEF.md `duration_s` by more than 10%; only with --project
//   BLACK_EDGE WARN black (blackdetect d=0.2 pix_th=0.1) starting before 0.1s or ending in the
//              last 0.2s; dark backgrounds can trigger it, extract the frame and look
//   FREEZE     WARN each still stretch of 2s or more (freezedetect n=0.003 d=2)
//   SILENCE    WARN each silence of 1.5s or more (silencedetect -50dB d=1.5) · FAIL whole file silent
//   LOUDNESS   WARN integrated loudness (ebur128) outside [-16, -12] LUFS
//   TRUE_PEAK  WARN above -1 dBFS · FAIL above 0 dBFS
//   BITRATE    WARN above 12 Mbit/s (not compressed yet, compress before delivery)
// --project <dir>  read <dir>/BRIEF.md frontmatter (aspect, duration_s).
// --write-qa       append a "## qc-mp4 <file> <YYYY-MM-DD HH:mm>" block to <project>/QA.md
//                  (created if missing); needs --project.
// --json           print the result array as JSON instead of lines.
// Last line (text mode): `qc-mp4: PASS|WARN|FAIL (<n> WARN, <m> FAIL)`.
// Exit: 0 no FAIL · 1 at least one FAIL · 2 bad usage or unreadable file.

import { appendFileSync, existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { frontmatter } from "./check-viet-pro.mjs";

export const LIMITS = {
  blackStart: 0.1, blackTail: 0.2, freezeMin: 2, silenceMin: 1.5, silentFileSlack: 0.25,
  durationTol: 0.1, loudLow: -16, loudHigh: -12, peakWarn: -1, peakFail: 0, bitrateMax: 12e6,
};
export const SIZES = { "16:9": [1920, 1080], "9:16": [1080, 1920] };

const num = (s) => (/^-?inf$/i.test(s) ? (s.startsWith("-") ? -Infinity : Infinity) : Number(s));
const NUM = "(-?inf|-?\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?)";
const fmt = (n) => (Number.isFinite(n) ? String(Math.round(n * 100) / 100) : n === -Infinity ? "-inf" : n === Infinity ? "inf" : String(n));

// Pairs start/end marks into [{ start, end }]; a start with no end closes at `duration`.
function spans(stderr, startRe, endRe, duration) {
  const out = [];
  let open = null;
  for (const line of String(stderr).split(/\r?\n/)) {
    const s = line.match(startRe);
    if (s) { if (open === null) open = num(s[1]); continue; }
    const e = line.match(endRe);
    if (e && open !== null) { out.push({ start: open, end: num(e[1]) }); open = null; }
  }
  if (open !== null) out.push({ start: open, end: Number.isFinite(duration) ? duration : open });
  return out;
}

// blackdetect: "black_start:0 black_end:1 black_duration:1" → [{ start, end }]
export function parseBlack(stderr) {
  const re = new RegExp(`black_start:\\s*${NUM}\\s+black_end:\\s*${NUM}`, "i");
  return String(stderr).split(/\r?\n/).map((l) => l.match(re)).filter(Boolean).map((m) => ({ start: num(m[1]), end: num(m[2]) }));
}

// freezedetect: "lavfi.freezedetect.freeze_start: 3" … "lavfi.freezedetect.freeze_end: 5"
export function parseFreeze(stderr, duration) {
  return spans(stderr, new RegExp(`freeze_start:\\s*${NUM}`), new RegExp(`freeze_end:\\s*${NUM}`), duration);
}

// silencedetect: "silence_start: 2" … "silence_end: 5.01 | silence_duration: 3.01"
export function parseSilence(stderr, duration) {
  return spans(stderr, new RegExp(`silence_start:\\s*${NUM}`), new RegExp(`silence_end:\\s*${NUM}`), duration);
}

// ebur128 Summary block → { I (LUFS), peak (dBFS) }; null when there is no summary.
// Per-frame lines also carry "I:", so only the text after the last "Summary:" is read.
export function parseEbur(stderr) {
  const text = String(stderr);
  const at = text.lastIndexOf("Summary:");
  if (at < 0) return null;
  const tail = text.slice(at);
  const i = tail.match(new RegExp(`\\bI:\\s*${NUM}\\s*LUFS`, "i"));
  const p = tail.match(new RegExp(`True peak:\\s*Peak:\\s*${NUM}\\s*dBFS`, "i"));
  if (!i && !p) return null;
  return { I: i ? num(i[1]) : null, peak: p ? num(p[1]) : null };
}

// metrics: { hasVideo, hasAudio, width, height, bitRate, black, freeze, silence, ebur }
// brief: { aspect, duration_s } from BRIEF.md frontmatter, or null without --project.
export function evaluate(metrics, brief, duration) {
  const L = LIMITS;
  const out = [];
  const add = (code, level, detail) => out.push({ code, level, detail });
  const m = metrics;

  if (!m.hasVideo) add("NO_VIDEO", "FAIL", "không có stream hình");
  else add("NO_VIDEO", "PASS", `${m.width}×${m.height}`);
  add("NO_AUDIO", m.hasAudio ? "PASS" : "WARN", m.hasAudio ? "có stream tiếng" : "không có stream tiếng");

  if (!brief) add("ASPECT", "PASS", "không kiểm (thiếu --project)");
  else {
    const a = String(brief.aspect || "").trim().toLowerCase();
    const ok = a === "both" ? Object.values(SIZES) : SIZES[a] ? [SIZES[a]] : null;
    if (!ok) add("ASPECT", "PASS", `không kiểm (BRIEF aspect "${brief.aspect ?? ""}" không rõ)`);
    else if (!m.hasVideo) add("ASPECT", "FAIL", "không có hình để so khổ");
    else if (ok.some(([w, h]) => w === m.width && h === m.height)) add("ASPECT", "PASS", `${m.width}×${m.height} khớp aspect ${a}`);
    else add("ASPECT", "FAIL", `${m.width}×${m.height} lệch aspect ${a} (cần ${ok.map(([w, h]) => `${w}×${h}`).join(" hoặc ")})`);
  }

  const want = brief ? Number(brief.duration_s) : NaN;
  if (!brief || !(want > 0)) add("DURATION", "PASS", `${fmt(duration)}s, không kiểm (${brief ? "BRIEF thiếu duration_s" : "thiếu --project"})`);
  else {
    const off = Math.abs(duration - want) / want;
    add("DURATION", off > L.durationTol ? "WARN" : "PASS", `${fmt(duration)}s so với BRIEF ${fmt(want)}s (lệch ${fmt(off * 100)}%)`);
  }

  const edges = (m.black || []).filter((b) => b.start < L.blackStart || b.end >= duration - L.blackTail);
  if (!m.hasVideo) add("BLACK_EDGE", "PASS", "không kiểm (không có hình)");
  else if (!edges.length) add("BLACK_EDGE", "PASS", "không có khung đen ở đầu/cuối");
  else for (const b of edges) add("BLACK_EDGE", "WARN", `đen ${fmt(b.start)}–${fmt(b.end)}s ở ${b.start < L.blackStart ? "đầu" : "cuối"} video; nền tối có thể báo nhầm, trích khung ra xem`);

  const freezes = (m.freeze || []).filter((f) => f.end - f.start >= L.freezeMin);
  if (!m.hasVideo) add("FREEZE", "PASS", "không kiểm (không có hình)");
  else if (!freezes.length) add("FREEZE", "PASS", "không có đoạn đứng hình ≥ 2s");
  else for (const f of freezes) add("FREEZE", "WARN", `đứng hình ${fmt(f.start)}–${fmt(f.end)}s (${fmt(f.end - f.start)}s)`);

  if (!m.hasAudio) {
    for (const code of ["SILENCE", "LOUDNESS", "TRUE_PEAK"]) add(code, "PASS", "không kiểm (không có tiếng)");
  } else {
    const sil = (m.silence || []).filter((s) => s.end - s.start >= L.silenceMin);
    const total = sil.reduce((t, s) => t + (s.end - s.start), 0);
    if (duration > 0 && total >= duration - L.silentFileSlack) add("SILENCE", "FAIL", `lặng cả file (${fmt(total)}s / ${fmt(duration)}s)`);
    else if (!sil.length) add("SILENCE", "PASS", "không có đoạn lặng ≥ 1.5s");
    else for (const s of sil) add("SILENCE", "WARN", `lặng ${fmt(s.start)}–${fmt(s.end)}s (${fmt(s.end - s.start)}s)`);

    const e = m.ebur;
    if (!e || e.I === null) add("LOUDNESS", "WARN", "không đo được độ to (ebur128)");
    else add("LOUDNESS", e.I < L.loudLow || e.I > L.loudHigh ? "WARN" : "PASS", `I ${fmt(e.I)} LUFS (mục tiêu ${L.loudLow}…${L.loudHigh})`);
    if (!e || e.peak === null) add("TRUE_PEAK", "WARN", "không đo được true peak (ebur128)");
    else add("TRUE_PEAK", e.peak > L.peakFail ? "FAIL" : e.peak > L.peakWarn ? "WARN" : "PASS", `Peak ${fmt(e.peak)} dBFS (tối đa ${L.peakWarn})`);
  }

  const br = Number(m.bitRate);
  if (!(br > 0)) add("BITRATE", "PASS", "không đọc được bit_rate");
  else add("BITRATE", br > L.bitrateMax ? "WARN" : "PASS", `${fmt(br / 1e6)} Mbit/s${br > L.bitrateMax ? " (chưa nén, cần nén trước khi giao)" : ""}`);
  return out;
}

export function summarize(results) {
  const warn = results.filter((r) => r.level === "WARN").length;
  const fail = results.filter((r) => r.level === "FAIL").length;
  return { warn, fail, level: fail ? "FAIL" : warn ? "WARN" : "PASS", line: `qc-mp4: ${fail ? "FAIL" : warn ? "WARN" : "PASS"} (${warn} WARN, ${fail} FAIL)` };
}

const stamp = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// Runs ffprobe + ffmpeg on `file`; throws Error with a readable message when a tool fails.
export function measure(file, run = spawnSync) {
  const opts = { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 };
  file = resolve(file); // absolute path: a name starting with "-" or holding ":" is not read as an option or protocol
  const probe = run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], opts);
  if (probe.error) throw new Error(`cannot run ffprobe: ${probe.error.message}`);
  if (probe.status !== 0) throw new Error(`ffprobe cannot read ${file}: ${String(probe.stderr).trim()}`);
  let info;
  try { info = JSON.parse(probe.stdout); } catch { throw new Error(`ffprobe returned invalid JSON for ${file}`); }
  const streams = info.streams || [];
  const v = streams.find((s) => s.codec_type === "video" && !(s.disposition && s.disposition.attached_pic));
  const a = streams.find((s) => s.codec_type === "audio");
  const duration = Number(info.format?.duration) || Number(v?.duration) || Number(a?.duration) || 0;
  const metrics = { hasVideo: !!v, hasAudio: !!a, width: v ? Number(v.width) : 0, height: v ? Number(v.height) : 0, bitRate: Number(info.format?.bit_rate) || 0, black: [], freeze: [], silence: [], ebur: null };
  const ff = (args) => {
    const r = run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, ...args, "-f", "null", "-"], opts);
    if (r.error) throw new Error(`cannot run ffmpeg: ${r.error.message}`);
    if (r.status !== 0) throw new Error(`ffmpeg failed on ${file}: ${String(r.stderr).trim().split(/\r?\n/).slice(-3).join(" | ")}`);
    return String(r.stderr);
  };
  if (v) {
    const err = ff(["-map", `0:${v.index}`, "-vf", `blackdetect=d=0.2:pix_th=0.1,freezedetect=n=0.003:d=${LIMITS.freezeMin}`, "-an"]);
    metrics.black = parseBlack(err);
    metrics.freeze = parseFreeze(err, duration);
  }
  if (a) {
    const err = ff(["-map", `0:${a.index}`, "-af", `silencedetect=noise=-50dB:d=${LIMITS.silenceMin},ebur128=peak=true:framelog=verbose`, "-vn"]);
    metrics.silence = parseSilence(err, duration);
    metrics.ebur = parseEbur(err);
  }
  return { metrics, duration };
}

export function readBrief(project) {
  const p = join(resolve(project), "BRIEF.md");
  if (!existsSync(p)) throw new Error(`no BRIEF.md in ${resolve(project)}`);
  return frontmatter(readFileSync(p, "utf8"));
}

export function main(argv = process.argv.slice(2), { run = spawnSync, now = () => new Date(), out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}) {
  if (wantsHelp(argv)) { out(helpText(import.meta.url)); return 0; }
  let file = null, project = null, writeQa = false, json = false;
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--project") { project = argv[++i]; if (!project) { err("qc-mp4: --project needs a directory\n"); return 2; } }
    else if (x === "--write-qa") writeQa = true;
    else if (x === "--json") json = true;
    else if (x.startsWith("-")) { err(`qc-mp4: unknown argument ${x}\n`); return 2; }
    else if (file === null) file = x;
    else { err(`qc-mp4: only one file, got extra ${x}\n`); return 2; }
  }
  if (!file) { err("qc-mp4: usage: node qc-mp4.mjs <file.mp4> [--project <dir>] [--write-qa] [--json]\n"); return 2; }
  if (writeQa && !project) { err("qc-mp4: --write-qa needs --project\n"); return 2; }
  if (!existsSync(file)) { err(`qc-mp4: file not found: ${file}\n`); return 2; }

  let brief = null, measured;
  try {
    if (project) brief = readBrief(project);
    measured = measure(file, run);
  } catch (e) { err(`qc-mp4: ${e.message}\n`); return 2; }

  const results = evaluate(measured.metrics, brief, measured.duration);
  const sum = summarize(results);
  const lines = [...results.map((r) => `${r.level} ${r.code} ${r.detail}`), sum.line];
  if (json) out(JSON.stringify(results, null, 2) + "\n");
  else out(lines.join("\n") + "\n");
  if (writeQa) {
    const qa = join(resolve(project), "QA.md");
    try {
      const prev = existsSync(qa) ? readFileSync(qa, "utf8") : "";
      const lead = !prev || prev.endsWith("\n\n") ? "" : prev.endsWith("\n") ? "\n" : "\n\n";
      appendFileSync(qa, `${lead}## qc-mp4 ${basename(file)} ${stamp(now())}\n\n${lines.map((l) => `- ${l}`).join("\n")}\n`);
    } catch (e) { err(`qc-mp4: cannot write ${qa}: ${e.message}\n`); return 2; }
  }
  return sum.fail ? 1 : 0;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
