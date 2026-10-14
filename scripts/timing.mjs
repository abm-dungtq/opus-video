#!/usr/bin/env node
// timing.mjs — write the TIMING block of a composition from the plan and the voice: scene windows
// from PLAN.md "## Cảnh", every spoken word on the root timeline from the voice words.json files,
// and the beat grid when one was measured. Re-run after every voice change; never edit the
// seconds by hand.
//   node timing.mjs --project <dir> [--html index.html] [--dry]
//   node timing.mjs --help | -h
// Scenes: one per "## Cảnh" row, id s<#> (the # column), start/end from Thời điểm ("2.5–5.8s").
// Voice: <audio>/<video> whose id starts with "vo-" or with data-audio-group="voiceover"; words
//   from <src>.words.json ([{text, start, end}], seconds from the head of the file). A word is
//   heard at data-start + (start − data-media-start) / data-playback-rate; words cut by
//   data-media-start or data-duration are dropped. Each word goes to the scene holding its start.
// TIMING = { fps, duration, scenes: { s<#>: { start, end, lines: [{ id, words: [[text, start,
//   end]] }] } }, beat0, beatLen, kick, drops }, seconds rounded to 3 decimals. duration is the
//   root composition's data-duration; fps comes from hyperframes.json (default 30); beat0, beatLen,
//   kick, drops come from assets/bgm/*.beats.json when present (defaults 0, 0, [], []: B() refuses an unmeasured grid).
// WARN when a voice track (data-start + data-duration) ends past the root data-duration; the
//   duration is never changed.
// Output: the text between the TIMING:BEGIN and TIMING:END comments of the HTML is replaced, and
//   <dir>/timing.json holds the same object. The markers come from composition.mjs init; a file
//   without them (a project not started from the skeleton) is refused and never edited.
// Prints one line per scene, `TIMING s2 2.500–5.800 words=9`, and `WARN s2 không có từ nào trong
//   words.json` when the scene's Lời đọc cell has text but no word landed in it.
// --dry   print only; write nothing.
// Exit: 0 written (WARN lines allowed) · 1 no TIMING markers, no readable "## Cảnh" table or root
// data-duration · 2 bad usage, PLAN.md or the HTML missing.

import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { SECTIONS, fold, parsePlan, parseTable, spanBounds } from "./check-preflight.mjs";
import { parseTracks } from "./audio-mix.mjs";

export const DEFAULTS = { fps: 30, beat0: 0, beatLen: 0, kick: [], drops: [] };
export const NO_MARKERS = "index.html không có TIMING:BEGIN/END (tạo bằng composition.mjs init)";
const MARK_BEGIN = /\/\*\s*TIMING:BEGIN\s*\*\//g;
const MARK_END = /\/\*\s*TIMING:END\s*\*\//g;
const BLOCK = /([ \t]*)(\/\*\s*TIMING:BEGIN\s*\*\/)[\s\S]*?(\/\*\s*TIMING:END\s*\*\/)/;
const NO_VOICE = /^(?:|-|—|–)$/;
const r3 = (n) => Math.round(n * 1000) / 1000;

const isVoice = (t) => (t.id && t.id.startsWith("vo-")) || t.group === "voiceover";

// Reads <src>.words.json → [{ text, start, end }] (entries without numeric start/end dropped).
// Throws with a short reason when the file is missing or not a JSON array.
function readWords(src) {
  const file = `${src}.words.json`;
  if (!existsSync(file)) throw new Error(`không có ${file}`);
  let data;
  try { data = JSON.parse(readFileSync(file, "utf8")); } catch (e) { throw new Error(`${file} không đọc được: ${e.message}`); }
  if (!Array.isArray(data)) throw new Error(`${file} không phải mảng [{text,start,end}]`);
  return data.filter((w) => w && typeof w.text === "string" && Number.isFinite(w.start) && Number.isFinite(w.end));
}

// Spoken words of a composition on the root timeline.
// dir: project directory; html: HTML path relative to dir (default index.html).
// Returns { words: [{ id, text, start, end }] sorted by start, tracks: the voice tracks, warnings: [text] }.
export function voiceWords(dir, html = "index.html") {
  const root = resolve(dir);
  const htmlPath = resolve(root, html);
  const tracks = parseTracks(readFileSync(htmlPath, "utf8"), dirname(htmlPath), root).filter(isVoice);
  const words = [], warnings = [];
  for (const t of tracks) {
    let list;
    try { list = readWords(t.src); } catch (e) { warnings.push(`${t.id ?? t.src}: ${e.message}`); continue; }
    for (const w of list) {
      const rel = (w.start - t.mediaStart) / t.rate;
      if (rel < 0 || (t.duration != null && rel >= t.duration)) continue; // trimmed away, never heard
      const relEnd = (w.end - t.mediaStart) / t.rate;
      const end = t.duration != null ? Math.min(relEnd, t.duration) : relEnd;
      words.push({ id: t.id ?? t.src, text: w.text, start: t.start + rel, end: t.start + end });
    }
  }
  words.sort((a, b) => a.start - b.start);
  return { words, tracks, warnings };
}

// PLAN.md text → [{ sid, start, end, spoken }] in table order. Throws on a missing table or an
// unreadable Thời điểm cell.
export function planScenes(planText) {
  const table = parseTable(parsePlan(planText).sections[SECTIONS.scenes]);
  if (!table.headers.length || !table.rows.length) throw new Error('PLAN.md không có bảng "## Cảnh"');
  const ni = table.headers.findIndex((h) => h === "#");
  const ti = table.headers.findIndex((h) => /thoi diem/.test(h));
  const vi = table.headers.findIndex((h) => /loi doc/.test(h));
  if (ti < 0) throw new Error('bảng "## Cảnh" thiếu cột Thời điểm');
  return table.rows.map((r, i) => {
    const sid = `s${ni >= 0 && String(r[ni] || "").trim() ? String(r[ni]).trim() : i + 1}`;
    const b = spanBounds(r[ti]);
    if (!b) throw new Error(`${sid}: Thời điểm "${String(r[ti] || "").trim()}" không đọc được (ghi dạng 2.5–5.8s)`);
    return { sid, start: b.start, end: b.end, spoken: vi >= 0 && !NO_VOICE.test(fold(String(r[vi] || ""))) };
  });
}

// Beat grid from the single assets/bgm/*.beats.json (first by name when several, with a warning).
// Returns { grid: { beat0, beatLen, kick, drops } | null, warnings }.
export function readBeats(dir) {
  const bgm = join(resolve(dir), "assets", "bgm");
  if (!existsSync(bgm)) return { grid: null, warnings: [] };
  const files = readdirSync(bgm).filter((f) => f.endsWith(".beats.json")).sort();
  if (!files.length) return { grid: null, warnings: [] };
  const warnings = files.length > 1 ? [`nhiều file beats trong assets/bgm, dùng ${files[0]}`] : [];
  try {
    const b = JSON.parse(readFileSync(join(bgm, files[0]), "utf8"));
    if (!Number.isFinite(b?.beat0) || !Number.isFinite(b?.beatLen) || b.beatLen < 0) throw new Error("thiếu beat0/beatLen");
    return { grid: { beat0: b.beat0, beatLen: b.beatLen, kick: Array.isArray(b.kick) ? b.kick : [], drops: Array.isArray(b.drops) ? b.drops : [] }, warnings };
  } catch (e) {
    return { grid: null, warnings: [...warnings, `assets/bgm/${files[0]} không dùng được (${e.message}); giữ nhịp mặc định`] };
  }
}

// Builds the TIMING object. Throws (exit 1) on plan or root problems.
// Returns { timing, lines: [text], warnings: [text] }.
export function buildTiming({ dir, html = "index.html" }) {
  const root = resolve(dir);
  const htmlText = readFileSync(resolve(root, html), "utf8");
  const rootTag = htmlText.replace(/<!--[\s\S]*?-->/g, " ").match(/<[a-z][^>]*\sdata-composition-id\s*=[^>]*>/i);
  const duration = Number(rootTag?.[0].match(/\sdata-duration\s*=\s*["']?([\d.]+)/i)?.[1]);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`${html}: root composition không có data-duration`);
  let fps = DEFAULTS.fps;
  const hf = join(root, "hyperframes.json");
  if (existsSync(hf)) {
    try { const v = Number(JSON.parse(readFileSync(hf, "utf8")).fps); if (v > 0) fps = v; } catch { /* unreadable hyperframes.json: HyperFrames itself reports it; keep the default fps */ }
  }
  const scenes = planScenes(readFileSync(join(root, "PLAN.md"), "utf8"));
  const voice = voiceWords(root, html);
  const beats = readBeats(root);
  const warnings = [...voice.warnings, ...beats.warnings];

  const out = {};
  for (const s of scenes) out[s.sid] = { start: r3(s.start), end: r3(s.end), lines: [] };
  let outside = 0;
  for (const w of voice.words) {
    const s = scenes.find((x, i) => w.start >= x.start && (w.start < x.end || (i === scenes.length - 1 && w.start <= x.end)));
    if (!s) { outside++; continue; }
    const lines = out[s.sid].lines;
    let line = lines.find((l) => l.id === w.id);
    if (!line) lines.push((line = { id: w.id, words: [] }));
    line.words.push([w.text, r3(w.start), r3(w.end)]);
  }
  if (outside) warnings.push(`${outside} từ nằm ngoài mọi cảnh của "## Cảnh"`);
  // A voice past the root duration is cut off in renders; the duration is the author's call.
  for (const t of voice.tracks) {
    const end = t.duration != null ? t.start + t.duration : null;
    if (end != null && end > duration + 1e-6) warnings.push(`${t.id ?? t.src} kết thúc ${end.toFixed(3)}s, root data-duration ${r3(duration)}s`);
  }

  const lines = [];
  for (const s of scenes) {
    const n = out[s.sid].lines.reduce((a, l) => a + l.words.length, 0);
    lines.push(`TIMING ${s.sid} ${s.start.toFixed(3)}–${s.end.toFixed(3)} words=${n}`);
    if (s.spoken && !n) warnings.push(`${s.sid} không có từ nào trong words.json`);
  }
  const grid = beats.grid ?? { beat0: DEFAULTS.beat0, beatLen: DEFAULTS.beatLen, kick: DEFAULTS.kick, drops: DEFAULTS.drops };
  return { timing: { fps, duration: r3(duration), scenes: out, ...grid }, lines, warnings };
}

// HTML text → the same text with the TIMING block replaced. Throws when the markers are not there
// exactly once each.
export function injectTiming(htmlText, timing) {
  const nb = (htmlText.match(MARK_BEGIN) || []).length, ne = (htmlText.match(MARK_END) || []).length;
  if (nb === 0 || ne === 0) throw new Error(NO_MARKERS);
  if (nb > 1 || ne > 1) throw new Error("HTML có nhiều hơn một khối TIMING:BEGIN/END");
  const m = htmlText.match(BLOCK);
  if (!m) throw new Error("TIMING:END đứng trước TIMING:BEGIN");
  const indent = m[1];
  return htmlText.replace(BLOCK, () => `${indent}${m[2]}\n${indent}window.TIMING = ${JSON.stringify(timing)};\n${indent}${m[3]}`);
}

export function main(argv = process.argv.slice(2), { out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}) {
  if (wantsHelp(argv)) { out(helpText(import.meta.url)); return 0; }
  const usage = "usage: node timing.mjs --project <dir> [--html index.html] [--dry]";
  const o = { project: null, html: "index.html", dry: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project" || a === "--html") { const v = argv[++i]; if (!v || v.startsWith("--")) { err(`timing: ${a} needs a value\n${usage}\n`); return 2; } o[a.slice(2)] = v; }
    else if (a === "--dry") o.dry = true;
    else { err(`timing: unknown argument ${a}\n${usage}\n`); return 2; }
  }
  if (!o.project) { err(`timing: --project is required\n${usage}\n`); return 2; }
  const dir = resolve(o.project);
  const htmlPath = resolve(dir, o.html);
  if (!existsSync(join(dir, "PLAN.md"))) { err(`timing: PLAN.md not found in ${dir}\n`); return 2; }
  if (!existsSync(htmlPath)) { err(`timing: HTML not found: ${htmlPath}\n`); return 2; }

  const htmlText = readFileSync(htmlPath, "utf8");
  let r, next;
  try {
    // Check the markers first: a legacy composition is refused before anything else is read.
    injectTiming(htmlText, {});
    r = buildTiming({ dir, html: o.html });
    next = injectTiming(htmlText, r.timing);
  } catch (e) { err(`timing: ${e.message}\n`); return 1; }

  out([...r.lines, ...r.warnings.map((w) => `WARN ${w}`)].join("\n") + "\n");
  if (o.dry) return 0;
  try {
    writeFileSync(htmlPath, next);
    writeFileSync(join(dir, "timing.json"), JSON.stringify(r.timing, null, 2) + "\n");
  } catch (e) { err(`timing: cannot write: ${e.message}\n`); return 1; }
  out(`đã ghi TIMING vào ${o.html} và timing.json\n`);
  return 0;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
