#!/usr/bin/env node
// timing.mjs — write the TIMING block of a composition from the plan and the voice: scene windows
// from PLAN.md "## Cảnh", every spoken word on the root timeline from the voice words.json files,
// and the beat grid when one was measured. Re-run after every voice change; never edit the
// seconds by hand.
//   node timing.mjs --project <dir> [--html index.html] [--music <file>] [--dry]
//   node timing.mjs --help | -h
// Scenes: one per "## Cảnh" row, id s<#> (the # column), start/end from Thời điểm ("2.5–5.8s").
// Voice: <audio>/<video> whose id starts with "vo-" or ends with "-voice", with
//   data-audio-group="voiceover", or with a src under assets/voice/ (isVoice in audio-mix.mjs); words
//   from <src>.words.json ([{text, start, end}], seconds from the head of the file). A word is
//   heard at data-start + (start − data-media-start) / data-playback-rate; words cut by
//   data-media-start or data-duration are dropped. Each word goes to the scene holding its start.
// TIMING = { fps, duration, scenes: { s<#>: { start, end, lines: [{ id, words: [[text, start,
//   end]] }] } }, beat0, beatLen, kick, drops }, seconds rounded to 3 decimals. duration is the
//   root composition's data-duration; fps comes from hyperframes.json (default 30); beat0, beatLen,
//   kick, drops come from the music's <file>.beats.json written by beat-grid.mjs --write: the one
//   in assets/bgm/, or the one of --music when assets/bgm/ holds several (defaults 0, 0, [], []:
//   B() refuses an unmeasured grid, and so does a beats.json with beatLen 0).
// WARN when a voice track (data-start + data-duration) ends past the root data-duration; the
//   duration is never changed.
// Output: the text between the TIMING:BEGIN and TIMING:END comments of the HTML is replaced, and
//   <dir>/timing.json holds the same object. The markers come from composition.mjs init; a file
//   without them (a project not started from the skeleton) is refused and never edited.
// Prints one line per scene, `TIMING s2 2.500–5.800 words=9`, and `WARN s2 không có từ nào trong
//   words.json` when the scene's Lời đọc cell has text but no word landed in it ("—", "(nhạc)",
//   "không lời", "im lặng"… mean no speech: MUSIC_ONLY in check-preflight.mjs).
// --music <file>  the music bed whose <file>.beats.json gives the beat grid (path from <dir>);
//         required when assets/bgm/ has more than one *.beats.json.
// --dry   print only; write nothing.
// Exit: 0 written (WARN lines allowed) · 1 no TIMING markers, no readable "## Cảnh" table or root
// data-duration · 2 bad usage, PLAN.md or the HTML missing, several assets/bgm/*.beats.json without
// --music, or no <file>.beats.json for --music.

import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { MUSIC_ONLY, SECTIONS, fold, parsePlan, parseTable, sceneId, spanBounds } from "./check-preflight.mjs";
import { isVoice, parseTracks } from "./audio-mix.mjs";
import { trackWords } from "./balance-measure.mjs";
import { derive } from "./gateway.mjs";

export const DEFAULTS = { fps: 30, beat0: 0, beatLen: 0, kick: [], drops: [] };
export const NO_MARKERS = "index.html không có TIMING:BEGIN/END (tạo bằng composition.mjs init)";
const MARK_BEGIN = /\/\*\s*TIMING:BEGIN\s*\*\//g;
const MARK_END = /\/\*\s*TIMING:END\s*\*\//g;
const BLOCK = /([ \t]*)(\/\*\s*TIMING:BEGIN\s*\*\/)[\s\S]*?(\/\*\s*TIMING:END\s*\*\/)/;
const r3 = (n) => Math.round(n * 1000) / 1000;

// Phrase matching, the same rule as W()/WE() in templates/composition/index-skeleton.html (keep
// both in step): a word's key is fold() with dashes turned into spaces and other punctuation
// dropped, so "nguồn," matches "nguồn" and "AI-agent" matches "AI agent".
export const wordKey = (s) => fold(String(s ?? "")).replace(/\p{Pd}+/gu, " ").replace(/[^\p{L}\p{N} ]+/gu, "").replace(/\s+/g, " ").trim();

// Every occurrence of a phrase in a word list: consecutive words whose keys, joined by one space,
// equal the phrase key (words with an empty key, bare punctuation, are skipped).
// words: [{ text, start, end }], in any order: they are sorted by start first, so the words of
// several voice tracks interleave in spoken order. Returns [{ start, end }] in seconds, in order.
// hit() in templates/composition/index-skeleton.html is a second copy of this match: change both together.
export function phraseHits(words, phrase) {
  const want = wordKey(phrase);
  const ws = [...words].sort((a, b) => a.start - b.start).map((w) => ({ w, k: wordKey(w.text) })).filter((x) => x.k);
  const hits = [];
  for (let i = 0; want && i < ws.length; i++) {
    let s = "";
    for (let j = i; j < ws.length && s.length < want.length; j++) {
      s = s ? `${s} ${ws[j].k}` : ws[j].k;
      if (s === want) hits.push({ start: ws[i].w.start, end: ws[j].w.end });
    }
  }
  return hits;
}

// Spoken words of a composition on the root timeline.
// dir: project directory; html: HTML path relative to dir (default index.html).
// htmlText: the HTML to read instead of the file (gateway.mjs derive passes the not yet written text).
// Returns { words: [{ id, text, start, end }] sorted by start, tracks: the voice tracks, warnings: [text] }.
export function voiceWords(dir, html = "index.html", htmlText = null) {
  const root = resolve(dir);
  const htmlPath = resolve(root, html);
  const tracks = parseTracks(htmlText ?? readFileSync(htmlPath, "utf8"), dirname(htmlPath), root).filter(isVoice);
  const words = [], warnings = [];
  for (const t of tracks) {
    const r = trackWords(t);
    if (r.error) { warnings.push(`${t.id ?? t.src}: ${r.error}`); continue; } // no words: skipped, not counted as speech
    for (const w of r.words) if (typeof w.text === "string") words.push({ id: t.id ?? t.src, ...w });
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
    const sid = sceneId(ni >= 0 ? r[ni] : "", i);
    const b = spanBounds(r[ti]);
    if (!b) throw new Error(`${sid}: Thời điểm "${String(r[ti] || "").trim()}" không đọc được (ghi dạng 2.5–5.8s)`);
    return { sid, start: b.start, end: b.end, spoken: vi >= 0 && !MUSIC_ONLY.test(fold(String(r[vi] || ""))) };
  });
}

// The *.beats.json files in <dir>/assets/bgm/, sorted by name ([] when the folder is missing).
function beatsFiles(dir) {
  const bgm = join(resolve(dir), "assets", "bgm");
  return existsSync(bgm) ? readdirSync(bgm).filter((f) => f.endsWith(".beats.json")).sort().map((f) => join(bgm, f)) : [];
}

// Picks the beats.json for the project: <music>.beats.json when `music` is given (path from dir),
// else the single assets/bgm/*.beats.json. Returns the absolute path or null when there is none.
// Throws (bad usage, exit 2) when several exist without `music`, or `music` has no beats.json.
export function beatsFile(dir, music = null) {
  if (music) {
    const f = `${resolve(resolve(dir), music)}.beats.json`;
    if (!existsSync(f)) throw new Error(`không có ${f} (chạy beat-grid.mjs ${music} --write)`);
    return f;
  }
  const files = beatsFiles(dir);
  if (files.length > 1) throw new Error(`assets/bgm có ${files.length} file *.beats.json; chọn bằng --music <file>`);
  return files[0] ?? null;
}

// Beat grid from beatsFile(dir, music). Returns { grid: { beat0, beatLen, kick, drops } | null,
// warnings }; an unreadable file is a warning and leaves the default (unmeasured) grid.
export function readBeats(dir, music = null) {
  const file = beatsFile(dir, music);
  if (!file) return { grid: null, warnings: [] };
  try {
    const b = JSON.parse(readFileSync(file, "utf8"));
    if (!Number.isFinite(b?.beat0) || !Number.isFinite(b?.beatLen) || b.beatLen < 0) throw new Error("thiếu beat0/beatLen");
    return { grid: { beat0: b.beat0, beatLen: b.beatLen, kick: Array.isArray(b.kick) ? b.kick : [], drops: Array.isArray(b.drops) ? b.drops : [] }, warnings: [] };
  } catch (e) {
    return { grid: null, warnings: [`${file} không dùng được (${e.message}); giữ nhịp mặc định`] };
  }
}

// project.json shots → the planScenes() shape; a shot is spoken when a voice line belongs to it.
export const manifestScenes = (m) => m.shots.map((s) => ({ sid: s.id, start: s.start, end: s.end, spoken: m.lines.some((l) => l.shot === s.id) }));

// Builds the TIMING object. Throws (exit 1) on plan or root problems.
// scenes: scene windows to use instead of PLAN.md "## Cảnh" (manifestScenes of project.json);
// htmlText: the HTML to read instead of the file.
// Returns { timing, lines: [text], warnings: [text] }.
export function buildTiming({ dir, html = "index.html", music = null, scenes: given = null, htmlText: givenHtml = null }) {
  const root = resolve(dir);
  const htmlText = givenHtml ?? readFileSync(resolve(root, html), "utf8");
  const rootTag = htmlText.replace(/<!--[\s\S]*?-->/g, " ").match(/<[a-z][^>]*\sdata-composition-id\s*=[^>]*>/i);
  const duration = Number(rootTag?.[0].match(/\sdata-duration\s*=\s*["']?([\d.]+)/i)?.[1]);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`${html}: root composition không có data-duration`);
  let fps = DEFAULTS.fps;
  const hf = join(root, "hyperframes.json");
  if (existsSync(hf)) {
    try { const v = Number(JSON.parse(readFileSync(hf, "utf8")).fps); if (v > 0) fps = v; } catch { /* unreadable hyperframes.json: HyperFrames itself reports it; keep the default fps */ }
  }
  const scenes = given ?? planScenes(readFileSync(join(root, "PLAN.md"), "utf8"));
  const voice = voiceWords(root, html, htmlText);
  const beats = readBeats(root, music);
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
  const usage = "usage: node timing.mjs --project <dir> [--html index.html] [--music <file>] [--dry]";
  const o = { project: null, html: "index.html", music: null, dry: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project" || a === "--html" || a === "--music") { const v = argv[++i]; if (!v || v.startsWith("--")) { err(`timing: ${a} needs a value\n${usage}\n`); return 2; } o[a.slice(2)] = v; }
    else if (a === "--dry") o.dry = true;
    else { err(`timing: unknown argument ${a}\n${usage}\n`); return 2; }
  }
  if (!o.project) { err(`timing: --project is required\n${usage}\n`); return 2; }
  const dir = resolve(o.project);
  // A project with project.json takes its scene windows from the manifest, through the gateway.
  if (existsSync(join(dir, "project.json"))) {
    if (o.html !== "index.html" || o.music) err("timing: dự án có project.json, bỏ qua --html/--music (html và nhạc lấy từ project.json)\n");
    const r = derive(dir, { dry: o.dry });
    if (r.code) { err(`timing: ${r.error}\n`); return r.code === 4 ? 1 : r.code; }
    out([...r.lines, ...r.warnings.map((w) => `WARN ${w}`)].join("\n") + "\n");
    if (!o.dry) out("đã ghi TIMING từ project.json (gateway.mjs derive)\n");
    return 0;
  }
  const htmlPath = resolve(dir, o.html);
  if (!existsSync(join(dir, "PLAN.md"))) { err(`timing: PLAN.md not found in ${dir}\n`); return 2; }
  if (!existsSync(htmlPath)) { err(`timing: HTML not found: ${htmlPath}\n`); return 2; }
  try { beatsFile(dir, o.music); } catch (e) { err(`timing: ${e.message}\n`); return 2; }

  const htmlText = readFileSync(htmlPath, "utf8");
  let r, next;
  try {
    // Check the markers first: a legacy composition is refused before anything else is read.
    injectTiming(htmlText, {});
    r = buildTiming({ dir, html: o.html, music: o.music });
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
