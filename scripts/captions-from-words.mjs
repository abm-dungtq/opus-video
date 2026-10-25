#!/usr/bin/env node
// captions-from-words.mjs — an SRT subtitle file for upload (YouTube, Facebook) from the voice
// lines of project.json and the word timings of their takes. Burned-in captions are another job
// (captions-from-transcript.mjs).
//   node captions-from-words.mjs --project <dir> --out <file.srt> [--max-chars 42] [--max-lines 2]
//   node captions-from-words.mjs --help | -h
// Lines: project.json lines in start order (a project without project.json is imported in memory
// by manifest-import.mjs, nothing written). Words of a line: the audio_meta.json voice of its file,
// else the <file>.words.json sidecar ([{ text, start, end }], seconds from the start of the take),
// placed at line.start + word time. A line without words gets its text spread evenly over its
// duration (a WARN line).
// Cues never cross two voice lines. A cue holds at most --max-lines lines of at most --max-chars
// characters (a single longer word stands alone on its line) and lasts 1–6 s: a cue ends after a
// sentence end (. ! ? …), after a comma once it is half full, when the next word does not fit,
// or when the next word would end past 6 s. It stays up until its last word ends, at least 1 s
// when the next cue leaves room, never past the next cue.
// "[bíp]" (the beep that hides a swear word in the voice) is dropped from the shown text.
// Prints `CAPTIONS <out> cues=N lines=N` and the WARN lines. Never overwrites a file that exists.
// Exit: 0 written · 1 unreadable project · 2 bad usage or --out exists.
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { load } from "./manifest.mjs";
import { importProject } from "./manifest-import.mjs";

export const MAX_CUE_S = 6;
export const MIN_CUE_S = 1;
const BEEP = /\[bíp\]/giu;
const SENTENCE_END = /[.!?…]["”»)]*$/u;
const PAUSE_MARK = /[,;:–—]["”»)]*$/u;
const r3 = (n) => Math.round(n * 1000) / 1000;

// Shown text of a word: the beep mark dropped, spaces squeezed.
export const shown = (t) => String(t ?? "").replace(BEEP, "").replace(/\s+/g, " ").trim();

function readJson(f) { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } }

// The timed words of a line, absolute seconds: [{ text, start, end }]; [] when it has none.
export function lineWords(dir, line, meta = null) {
  const v = meta?.voices?.find((x) => x.path === line.file);
  const words = Array.isArray(v?.words) ? v.words : readJson(join(dir, `${line.file}.words.json`));
  if (!Array.isArray(words)) return [];
  return words
    .filter((w) => Number.isFinite(w?.start) && Number.isFinite(w?.end))
    .map((w) => ({ text: shown(w.text), start: r3(line.start + w.start), end: r3(line.start + Math.max(w.start, w.end)) }))
    .filter((w) => w.text);
}

// The text of a line spread over its duration, each word as long as its share of characters.
export function spreadWords(line) {
  const parts = shown(line.text).split(" ").filter(Boolean);
  const total = parts.reduce((n, p) => n + p.length, 0);
  const len = Number(line.duration) > 0 ? Number(line.duration) : Math.max(MIN_CUE_S, parts.length / 3.5);
  let t = line.start;
  return parts.map((p) => {
    const d = (p.length / total) * len;
    const w = { text: p, start: r3(t), end: r3(t + d) };
    t += d;
    return w;
  });
}

// Words laid out in lines of at most maxChars; a word longer than that stands on its own line.
export function wrap(words, maxChars) {
  const lines = [];
  for (const w of words) {
    const cur = lines.at(-1);
    if (cur != null && cur.length + 1 + w.length <= maxChars) lines[lines.length - 1] = `${cur} ${w}`;
    else lines.push(w);
  }
  return lines;
}

// Timed words of one voice line → cues [{ start, end, lines }]. maxWords caps the words of a cue (karaoke).
export function cuesOf(words, { maxChars = 42, maxLines = 2, maxWords = Infinity } = {}) {
  const cues = [];
  let cur = [];
  const flush = () => { if (cur.length) cues.push({ start: cur[0].start, end: cur.at(-1).end, lines: wrap(cur.map((w) => w.text), maxChars) }); cur = []; };
  const room = maxChars * maxLines;
  for (const w of words) {
    if (cur.length) {
      const fits = wrap([...cur, w].map((x) => x.text), maxChars).length <= maxLines;
      if (!fits || cur.length >= maxWords || w.end - cur[0].start > MAX_CUE_S) flush();
    }
    cur.push(w);
    const size = cur.reduce((n, x) => n + x.text.length + 1, -1);
    if (SENTENCE_END.test(w.text) || (PAUSE_MARK.test(w.text) && size >= room / 2)) flush();
  }
  flush();
  return cues;
}

// Every cue of the project in time order, with the 1 s floor and no overlap.
export function buildCues(dir, manifest, opts = {}) {
  const meta = readJson(join(dir, "audio_meta.json"));
  const warnings = [];
  const cues = [];
  for (const line of [...(manifest.lines ?? [])].sort((a, b) => a.start - b.start)) {
    let words = lineWords(dir, line, meta);
    if (!words.length) {
      if (!shown(line.text)) continue;
      warnings.push(`${line.id}: không có words.json, chia đều lời theo độ dài câu`);
      words = spreadWords(line);
    }
    cues.push(...cuesOf(words, opts));
  }
  cues.sort((a, b) => a.start - b.start);
  cues.forEach((c, i) => {
    const next = cues[i + 1]?.start ?? Infinity;
    c.end = r3(Math.min(Math.max(c.end, c.start + MIN_CUE_S), next, c.start + MAX_CUE_S));
    if (c.end <= c.start) c.end = r3(c.start + 0.001);
  });
  return { cues, warnings };
}

const pad = (n, w = 2) => String(n).padStart(w, "0");
export function srtTime(s) {
  const ms = Math.max(0, Math.round(s * 1000));
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}
export const toSrt = (cues) => cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.lines.join("\n")}\n`).join("\n");

export function main(argv = process.argv.slice(2), { out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}) {
  if (wantsHelp(argv)) { out(helpText(import.meta.url)); return 0; }
  const usage = "usage: node captions-from-words.mjs --project <dir> --out <file.srt> [--max-chars 42] [--max-lines 2]";
  const o = { project: null, out: null, maxChars: 42, maxLines: 2 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === "--project" || a === "--out") { if (!v) { err(`captions-from-words: ${a} cần giá trị\n${usage}\n`); return 2; } o[a.slice(2)] = v; i++; }
    else if (a === "--max-chars" || a === "--max-lines") {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > (a === "--max-chars" ? 200 : 6)) { err(`captions-from-words: ${a} cần số nguyên hợp lệ\n${usage}\n`); return 2; }
      o[a === "--max-chars" ? "maxChars" : "maxLines"] = n; i++;
    } else { err(`captions-from-words: không biết đối số ${a}\n${usage}\n`); return 2; }
  }
  if (!o.project || !o.out) { err(`captions-from-words: cần --project và --out\n${usage}\n`); return 2; }
  const dir = resolve(o.project);
  const file = resolve(o.out);
  if (existsSync(file)) { err(`captions-from-words: ${file} đã có, không ghi đè\n`); return 2; }
  let manifest;
  try { manifest = load(dir) ?? importProject(dir).manifest; } catch (e) { err(`captions-from-words: không đọc được dự án ${dir}: ${e.message}\n`); return 1; }
  const { cues, warnings } = buildCues(dir, manifest, { maxChars: o.maxChars, maxLines: o.maxLines });
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, toSrt(cues), { flag: "wx" });
  out(`CAPTIONS ${file} cues=${cues.length} lines=${manifest.lines?.length ?? 0}\n`);
  for (const w of warnings) out(`WARN ${w}\n`);
  return 0;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
