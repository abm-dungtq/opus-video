#!/usr/bin/env node
// word-sync.mjs — does each on-screen keyword appear when the voice says it? Reads the "chữ:" rows
// of the "## Sự kiện" table in PLAN.md and compares each row's time with the moment the voice
// starts the phrase (from the voice words.json files). One line per row:
//   `LEVEL WORD   <t>s "<cụm>" lời <start>s lệch <±N> ms`   (lệch = Thời điểm − lời).
//   node word-sync.mjs --project <dir> [--html index.html] [--json] [--write-qa]
//   node word-sync.mjs --help | -h
// PLAN.md "## Sự kiện" (Thời điểm | Sự kiện | Âm thanh): a row whose Sự kiện starts with "chữ:"
//   (diacritics optional, "chu:" too) is a keyword row; the rest of the cell is the phrase, quotes
//   and trailing punctuation dropped. Âm thanh is usually "—", so sfx-sync skips the row.
//   Example: | 5.8 | chữ: "kiểm thử" | — |
// Spoken words: voice tracks of the HTML (id "vo-*" or data-audio-group="voiceover") and their
//   <src>.words.json, on the root timeline, the same reader as timing.mjs. A phrase matches
//   consecutive words after fold() with punctuation dropped, the rule of W() in the skeleton; the
//   occurrence nearest the row's time is measured.
// Windows: PASS |lệch| ≤ 150 ms · WARN ≤ 250 ms · FAIL otherwise, or when the phrase is not spoken.
// When the HTML holds a TIMING block written by timing.mjs, a phrase not spoken inside the scene
//   that holds the row's time is one more WARN line.
// No keyword row: one line `PASS  WORD   không có hàng chữ`, exit 0.
// --write-qa  append "## WORD (<ISO time>)" with the lines to <project>/QA.md.
// --json      print [{ level, t, phrase, spoken, delta_ms }] instead of lines.
// Legacy project (BRIEF.md has no `direction:` and no `brief_version: 2`): every FAIL becomes WARN.
// Exit: 0 no FAIL · 1 at least one FAIL · 2 bad usage, or PLAN.md / the HTML is missing.

import { appendFileSync, existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { frontmatter } from "./check-viet-pro.mjs";
import { fold, parsePlan, parseTable } from "./check-preflight.mjs";
import { eventTime, isLegacy } from "./sfx-sync.mjs";
import { phraseHits, voiceWords } from "./timing.mjs";

// check-preflight.mjs imports checkWords from this file: the cycle is safe only while every use
// of an imported binding stays inside a function (never at module level).

const SECTION = "su kien";
const WORD_ROW = /^chu\s*:/;
export const WINDOWS_MS = { pass: 150, warn: 250 };
export const NONE_LINE = "PASS  WORD   không có hàng chữ";

export function wordVerdict(deltaMs) {
  const a = Math.abs(deltaMs);
  return a <= WINDOWS_MS.pass ? "PASS" : a <= WINDOWS_MS.warn ? "WARN" : "FAIL";
}

// "chữ: “kiểm thử”." → "kiểm thử": text after the first colon, quotes and trailing punctuation dropped.
export function rowPhrase(label) {
  const rest = String(label || "").slice(String(label || "").indexOf(":") + 1).trim();
  return rest.replace(/^["“«'‘]+/, "").replace(/[\s"”»'’.,;:!?…]+$/, "").replace(/["“”«»]/g, "").trim();
}

// PLAN.md text → [{ t, raw?, phrase }] for the "chữ:" rows of "## Sự kiện" ([] when there is none).
export function parseWordRows(planText) {
  const table = parseTable(parsePlan(planText).sections[SECTION]);
  const ti = table.headers.findIndex((h) => /thoi diem/.test(h));
  const li = table.headers.findIndex((h) => /su kien/.test(h));
  if (ti < 0 || li < 0) return [];
  return table.rows.filter((r) => WORD_ROW.test(fold(String(r[li] || "")))).map((r) => ({ ...eventTime(r[ti]), phrase: rowPhrase(r[li]) }));
}

// The TIMING object of an HTML written by timing.mjs (JSON between the markers), or null when the
// block is missing, still the skeleton literal, or has no scenes.
export function readTiming(htmlText) {
  const m = String(htmlText).match(/\/\*\s*TIMING:BEGIN\s*\*\/\s*window\.TIMING\s*=\s*([\s\S]*?);?\s*\/\*\s*TIMING:END\s*\*\//);
  if (!m) return null;
  try {
    const t = JSON.parse(m[1]);
    return t && t.scenes && typeof t.scenes === "object" && Object.keys(t.scenes).length ? t : null;
  } catch { return null; } // skeleton literal (not JSON) before timing.mjs ran: no scene check
}

// Scene of TIMING holding second t: [sid, scene] or null. The last scene includes its end.
function sceneAt(timing, t) {
  const list = Object.entries(timing.scenes);
  return list.find(([, s], i) => t >= s.start && (t < s.end || (i === list.length - 1 && t <= s.end))) ?? null;
}

const fmtT = (t) => `${Number.isFinite(t) ? t.toFixed(2) : "?"}s`;
const signed = (n) => `${n < 0 ? "−" : "+"}${Math.abs(n)}`;

// Measures every keyword row of the project. Throws when PLAN.md, or the HTML needed for rows, is missing.
// Returns { lines: [{ level, t, phrase, spoken, delta_ms, text }], errors, warnings, none, legacy }.
// errors/warnings hold the FAIL/WARN line texts without the level column.
export function checkWords({ dir = ".", html = "index.html" } = {}) {
  dir = resolve(dir);
  const planPath = join(dir, "PLAN.md");
  if (!existsSync(planPath)) throw new Error(`PLAN.md not found in ${dir}`);
  const briefPath = join(dir, "BRIEF.md");
  const legacy = isLegacy(frontmatter(existsSync(briefPath) ? readFileSync(briefPath, "utf8") : ""));
  const rows = parseWordRows(readFileSync(planPath, "utf8"));
  const out = { lines: [], errors: [], warnings: [], none: rows.length === 0, legacy };
  if (out.none) return out;

  const htmlPath = resolve(dir, html);
  if (!existsSync(htmlPath)) throw new Error(`HTML not found: ${htmlPath}`);
  const voice = voiceWords(dir, html);
  const timing = readTiming(readFileSync(htmlPath, "utf8"));
  const add = (line) => {
    if (legacy && line.level === "FAIL") line.level = "WARN";
    line.text = `${line.level.padEnd(6)}WORD   ${line.detail}`;
    delete line.detail;
    out.lines.push(line);
    if (line.level === "FAIL") out.errors.push(line.text.slice(6));
    else if (line.level === "WARN") out.warnings.push(line.text.slice(6));
  };
  for (const w of voice.warnings) add({ level: "WARN", t: null, phrase: null, spoken: null, delta_ms: null, detail: w });

  for (const r of rows) {
    const base = { t: Number.isFinite(r.t) ? r.t : null, phrase: r.phrase, spoken: null, delta_ms: null };
    const head = `${fmtT(r.t)} "${r.phrase}"`;
    if (!Number.isFinite(r.t)) { add({ ...base, level: "FAIL", detail: `"${r.phrase}" thời điểm "${r.raw}" không đọc được (ghi số giây, ví dụ 5.8s)` }); continue; }
    if (!r.phrase) { add({ ...base, level: "FAIL", detail: `${fmtT(r.t)} hàng chữ không có cụm từ (ghi chữ: "<cụm>")` }); continue; }
    const hits = phraseHits(voice.words, r.phrase);
    if (!hits.length) { add({ ...base, level: "FAIL", detail: `${head} không có trong lời đọc` }); continue; }
    const hit = hits.reduce((a, b) => (Math.abs(b.start - r.t) < Math.abs(a.start - r.t) ? b : a));
    const delta = Math.round((r.t - hit.start) * 1000);
    add({ ...base, level: wordVerdict(delta), spoken: hit.start, delta_ms: delta, detail: `${head} lời ${fmtT(hit.start)} lệch ${signed(delta)} ms` });
    if (timing) {
      const sc = sceneAt(timing, r.t);
      const sceneWords = sc ? sc[1].lines.flatMap((l) => l.words).map(([text, start, end]) => ({ text, start, end })) : [];
      if (!sc) add({ ...base, level: "WARN", detail: `${head} thời điểm nằm ngoài mọi cảnh của TIMING` });
      else if (!phraseHits(sceneWords, r.phrase).length) add({ ...base, level: "WARN", detail: `${head} không có trong lời của cảnh ${sc[0]} (TIMING); chữ hiện ở cảnh khác với lời` });
    }
  }
  return out;
}

export function main(argv = process.argv.slice(2), { now = () => new Date(), out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}) {
  if (wantsHelp(argv)) { out(helpText(import.meta.url)); return 0; }
  const o = { project: null, html: "index.html", writeQa: false, json: false };
  const usage = "usage: node word-sync.mjs --project <dir> [--html index.html] [--json] [--write-qa]";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project" || a === "--html") { const v = argv[++i]; if (!v || v.startsWith("--")) { err(`word-sync: ${a} needs a value\n${usage}\n`); return 2; } o[a.slice(2)] = v; }
    else if (a === "--write-qa") o.writeQa = true;
    else if (a === "--json") o.json = true;
    else { err(`word-sync: unknown argument ${a}\n${usage}\n`); return 2; }
  }
  if (!o.project) { err(`word-sync: --project is required\n${usage}\n`); return 2; }

  let r;
  try { r = checkWords({ dir: o.project, html: o.html }); } catch (e) { err(`word-sync: ${e.message}\n`); return 2; }
  const lines = r.none ? [{ level: "PASS", t: null, phrase: null, spoken: null, delta_ms: null, text: NONE_LINE }] : r.lines;
  const text = lines.map((l) => l.text);
  if (o.json) out(JSON.stringify(lines.map(({ level, t, phrase, spoken, delta_ms }) => ({ level, t, phrase, spoken, delta_ms })), null, 2) + "\n");
  else out(text.join("\n") + "\n");
  if (o.writeQa) {
    const qa = join(resolve(o.project), "QA.md");
    try {
      const prev = existsSync(qa) ? readFileSync(qa, "utf8") : "";
      const lead = !prev || prev.endsWith("\n\n") ? "" : prev.endsWith("\n") ? "\n" : "\n\n";
      appendFileSync(qa, `${lead}## WORD (${now().toISOString()})\n${text.map((l) => `\n${l}`).join("")}\n`);
    } catch (e) { err(`word-sync: cannot write ${qa}: ${e.message}\n`); return 2; }
  }
  return lines.some((l) => l.level === "FAIL") ? 1 : 0;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
