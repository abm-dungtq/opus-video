#!/usr/bin/env node
// captions-from-transcript.mjs — burned-in captions from a Whisper word transcript plus a
// correction table the user approves (clip-voiced projects, references/clip-master-canvas.md).
//   node captions-from-transcript.mjs [--project .] [--transcript transcript.json]
//        [--fixes captions.fixes.json] [--out assets/fx/captions.js] [--global CAPTIONS]
//        [--duration <s>]
//   node captions-from-transcript.mjs --help | -h
// transcript.json: [{ text, start, end }] (hyperframes transcribe … -e whisper -l vi).
// captions.fixes.json (all keys optional):
//   { "fix": { "5": "Diên", "188": "" },   word index → shown text ("" drops the word)
//     "unclear": [[112, 119]],              inclusive index spans never captioned (no guessing)
//     "ranges": [[0, 6], [7, 11]] }         cue = inclusive word span; when absent, cues are
//                                           grouped by sentence end, a new capitalised sentence,
//                                           a pause > 0.6 s, MAX_WORDS words or MAX_SPAN seconds.
// Writes (paths relative to --project):
//   <out>                    `window.<global> = [{ start, end, words: [{ t, s }] }]`
//   script/captions.txt      one cue per line, for the viet-pro gate (check-viet-pro lints it)
//   captions.review.md       heard → shown table + cue list, for the user to approve
// Each cue stays up until the next one starts, at most +0.6 s after its last word.
// Exit: 0 written · 2 bad usage / unreadable input.

import { existsSync, readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";

export const MAX_WORDS = 7;
export const MAX_SPAN = 3.5;
export const PAUSE = 0.6;
export const HOLD = 0.6;

const inSpans = (i, spans) => spans.some(([a, b]) => i >= a && i <= b);

// Shown text for word i ("" = not captioned).
export function shownText(words, i, fixes = {}) {
  if (inSpans(i, fixes.unclear || [])) return "";
  const f = fixes.fix || {};
  return (String(i) in f ? f[String(i)] : words[i].text).trim();
}

function autoRanges(words, fixes) {
  const ranges = [];
  let a = -1, n = 0;
  const close = (b) => { if (a >= 0) ranges.push([a, b]); a = -1; n = 0; };
  words.forEach((w, i) => {
    if (!shownText(words, i, fixes)) { close(i - 1); return; }
    const prev = words[i - 1];
    const newSentence = i > 0 && /^\p{Lu}/u.test(w.text) && /[.!?]$/.test(prev?.text || "");
    const pause = prev && a >= 0 && w.start - prev.end > PAUSE;
    if (a >= 0 && (newSentence || pause || n >= MAX_WORDS || w.end - words[a].start > MAX_SPAN)) close(i - 1);
    if (a < 0) a = i;
    n++;
    if (/[.!?]$/.test(w.text) && n >= 2) close(i);
  });
  close(words.length - 1);
  return ranges;
}

export function buildCues(words, fixes = {}, { duration } = {}) {
  const ranges = fixes.ranges || autoRanges(words, fixes);
  const cues = [];
  for (const [a, b] of ranges) {
    const ws = [];
    for (let i = a; i <= b; i++) {
      const t = shownText(words, i, fixes);
      if (t) ws.push({ t, s: words[i].start });
    }
    if (!ws.length) continue;
    ws[ws.length - 1].t = ws[ws.length - 1].t.replace(/[.,]+$/, "");
    cues.push({ start: words[a].start, end: words[b].end, words: ws });
  }
  const last = duration ?? (words.length ? words[words.length - 1].end + HOLD : 0);
  cues.forEach((c, k) => {
    const next = cues[k + 1];
    c.end = +Math.min(next ? next.start : last, c.end + HOLD).toFixed(2);
  });
  return cues;
}

export const cueText = (c) => c.words.map((w) => w.t).join(" ");

export function reviewMd(words, fixes, cues) {
  const rows = [];
  for (const [k, v] of Object.entries(fixes.fix || {})) rows.push(`| ${k} | ${words[k]?.start ?? ""} | ${words[k]?.text ?? ""} | ${v === "" ? "(bỏ)" : v} |`);
  for (const [a, b] of fixes.unclear || []) rows.push(`| ${a}–${b} | ${words[a]?.start ?? ""} | ${words.slice(a, b + 1).map((w) => w.text).join(" ")} | (chưa rõ, không phụ đề) |`);
  return [
    "# Phụ đề: bảng sửa lời nghe máy",
    "",
    "Duyệt bảng này trước khi render. Sửa trong captions.fixes.json rồi chạy lại script.",
    "",
    "| Từ # | Giây | Máy nghe | Hiển thị |",
    "|---|---|---|---|",
    ...rows,
    "",
    "## Các cụm phụ đề",
    "",
    ...cues.map((c) => `- ${c.start.toFixed(2)}–${c.end.toFixed(2)}s: ${cueText(c)}`),
    "",
  ].join("\n");
}

function parseArgs(argv) {
  const o = { project: ".", transcript: "transcript.json", fixes: "captions.fixes.json", out: "assets/fx/captions.js", global: "CAPTIONS" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (["--project", "--transcript", "--fixes", "--out", "--global", "--duration"].includes(a)) o[a.slice(2)] = argv[++i];
    else return { bad: `unknown argument ${a}` };
  }
  if (o.duration !== undefined && !(Number(o.duration) > 0)) return { bad: "--duration must be a positive number of seconds" };
  if (!/^[A-Za-z_$][\w$]*$/.test(o.global)) return { bad: "--global must be a JS identifier" };
  return o;
}

export function main(argv = process.argv.slice(2)) {
  if (wantsHelp(argv)) { process.stdout.write(helpText(import.meta.url)); return 0; }
  const o = parseArgs(argv);
  if (o.bad) { console.error(`captions-from-transcript: ${o.bad}`); return 2; }
  const dir = resolve(o.project);
  const tPath = resolve(dir, o.transcript), fPath = resolve(dir, o.fixes);
  let words, fixes = {};
  try {
    words = JSON.parse(readFileSync(tPath, "utf8"));
    if (!Array.isArray(words)) words = words.words || words.segments;
    if (!Array.isArray(words)) throw new Error("expected a word array");
    if (existsSync(fPath)) fixes = JSON.parse(readFileSync(fPath, "utf8"));
  } catch (e) { console.error(`captions-from-transcript: ${e.message}`); return 2; }
  const cues = buildCues(words, fixes, { duration: o.duration === undefined ? undefined : Number(o.duration) });
  const outPath = resolve(dir, o.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `// Generated by opus-video captions-from-transcript.mjs from ${o.transcript} + ${o.fixes}; do not edit by hand.\nwindow.${o.global} = ${JSON.stringify(cues)};\n`);
  mkdirSync(join(dir, "script"), { recursive: true });
  writeFileSync(join(dir, "script", "captions.txt"), cues.map((c) => cueText(c) + ".").join("\n") + "\n");
  writeFileSync(join(dir, "captions.review.md"), reviewMd(words, fixes, cues));
  console.log(`captions-from-transcript: ${cues.length} cues → ${o.out}, script/captions.txt, captions.review.md`);
  const short = cues.filter((c) => c.words.length === 1).length;
  if (short) console.log(`WARN  ${short} one-word cue(s); consider "ranges" in ${o.fixes}`);
  return 0;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
