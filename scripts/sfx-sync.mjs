#!/usr/bin/env node
// sfx-sync.mjs — does each sound effect sound when its picture event happens? Reads the
// "## Sự kiện" table in PLAN.md, finds each sound's <audio>/<video> in the HTML, measures the
// silence at the head of the sound file with ffmpeg, and compares the moment the sound is heard
// with the event time. One line per event: `LEVEL SYNC   <t>s <event> ← <sound> lệch <±N> ms`.
//   node sfx-sync.mjs --project <dir> [--html <file>] [--fix] [--write-qa] [--json]
//   node sfx-sync.mjs --help | -h
// PLAN.md "## Sự kiện": a table `Thời điểm | Sự kiện | Âm thanh`; Thời điểm in seconds on the root
//   timeline (6.5, 6.5s, 6,5s, optionally followed by "(đo)" or "(đề xuất)"); Âm thanh is the
//   src as written in the HTML, or "—" for no sound.
//   A section line "không có SFX gắn sự kiện" is valid (one WARN) only when the table has no rows.
//   An empty section, TODO or a header-only table FAILs (WARN for a legacy project).
// Sound heard at: data-start + max(0, leading silence − data-media-start) / data-playback-rate.
//   Leading silence: silencedetect at (file peak − 20 dB), so quiet files are not read as silent;
//   cached per file sha256 in <project>/assets/sfx-onsets.json.
// Windows (ITU-R BT.1359-1, delta = heard − event, positive = sound late):
//   PASS −45…+125 ms · WARN −90…+185 ms · FAIL otherwise.
// Only index.html (or --html) is read: a sound inside a sub-composition has data-start on that
//   composition's clock and is reported as FAIL "không có trong <html>" (as is a sound whose
//   only tag has data-volume="0", which the mixer drops).
// --fix       for each line that is not PASS, print the data-start that would put the sound on
//             the event. Never edits the HTML.
// --write-qa  append "## SYNC (<ISO time>)" with the lines to <project>/QA.md.
// --json      print [{ level, t, label, sound, delta_ms, lead_s }] instead of lines.
// Legacy project (BRIEF.md has no `direction:` and no `brief_version: 2`): every FAIL becomes WARN
//   and a missing "## Sự kiện" is one WARN. A creative project without the section FAILs.
// Exit: 0 no FAIL · 1 at least one FAIL · 2 bad usage, or PLAN.md / the HTML is missing.

import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { frontmatter } from "./check-viet-pro.mjs";
import { fold, parsePlan, parseTable } from "./check-preflight.mjs";
import { parseTracks } from "./audio-mix.mjs";

// check-preflight.mjs imports checkSync from this file: the cycle is safe only while every use of
// an imported binding stays inside a function (never at module level).

// Leading-silence cache, relative to the project. render-final's visual_hash skips it: it is
// measurement data, not picture.
export const ONSET_CACHE = "assets/sfx-onsets.json";
const SECTION = "su kien";
const NONE = "khong co sfx gan su kien";
const NO_SOUND = /^(?:|—|–|-)$/;

// ITU-R BT.1359-1: detectable when sound is 45 ms early or 125 ms late; acceptable when 90 ms
// early or 185 ms late. Sign: deltaMs = (heard − event) × 1000, positive = sound late.
export const WINDOWS = { pass: { early: -45, late: 125 }, warn: { early: -90, late: 185 } };

export const EMPTY = 'PLAN.md "## Sự kiện" không có hàng sự kiện nào; ghi bảng Thời điểm | Sự kiện | Âm thanh có ít nhất một hàng, hoặc dòng "không có SFX gắn sự kiện"';

// PLAN.md text → { events: [{ t, label, sound }], none, missing } (+ error). See parseEventsBody.
export function parseEvents(planText) {
  return parseEventsBody(parsePlan(planText).sections[SECTION]);
}

// Body of "## Sự kiện" (undefined when the section is missing) → { events, none, missing, error? }.
// The no-SFX line counts only when the table has no rows; with rows it is just a note. A section
// with no table (empty, TODO), a header-only table or a table missing a column is an error. A
// table whose rows all have "—" as sound is valid and gives no events. Rows whose sound is empty
// or a dash are dropped. t is NaN when unreadable.
export function parseEventsBody(body) {
  if (body === undefined) return { events: [], none: false, missing: true };
  const table = parseTable(body);
  if (table.rows.length === 0 && fold(body).includes(NONE)) return { events: [], none: true, missing: false };
  if (!table.headers.length) return { events: [], none: false, missing: false, error: EMPTY };
  const col = (re) => table.headers.findIndex((h) => re.test(h));
  const ti = col(/thoi diem/), li = col(/su kien/), si = col(/am thanh/);
  if (ti < 0 || li < 0 || si < 0) return { events: [], none: false, missing: false, error: 'PLAN.md "## Sự kiện" table needs the columns Thời điểm | Sự kiện | Âm thanh' };
  if (table.rows.length === 0) return { events: [], none: false, missing: false, error: EMPTY };
  const events = [];
  for (const r of table.rows) {
    const sound = String(r[si] || "").replace(/`/g, "").trim();
    if (NO_SOUND.test(sound)) continue;
    // plan-demo.md lets a time carry its provenance, "6.5s (đo)" or "6.5s (đề xuất)".
    const m = fold(String(r[ti] || "")).replace(/\s*\((?:do|de xuat)\)$/, "").match(/^(\d+(?:[.,]\d+)?)\s*s?$/);
    events.push({ t: m ? Number(m[1].replace(",", ".")) : NaN, label: String(r[li] || "").trim(), sound, ...(m ? {} : { raw: String(r[ti] || "").trim() }) });
  }
  return { events, none: false, missing: false };
}

// silencedetect stderr → seconds of silence at the head of the file (0 when the first silence
// starts later than 1 ms in, or there is none).
export function leadFromSilence(stderr) {
  const text = String(stderr);
  const s = text.match(/silence_start:\s*(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)/i);
  if (!s || Number(s[1]) > 0.001) return 0;
  const e = text.slice(s.index).match(/silence_end:\s*(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)/i);
  return e ? Math.max(0, Number(e[1])) : 0;
}

// Root-timeline second at which a track's sound is first heard.
export const onsetOf = (track, lead) => track.start + Math.max(0, lead - track.mediaStart) / track.rate;

export function syncVerdict(deltaMs) {
  const { pass, warn } = WINDOWS;
  if (deltaMs >= pass.early && deltaMs <= pass.late) return "PASS";
  if (deltaMs >= warn.early && deltaMs <= warn.late) return "WARN";
  return "FAIL";
}

// Leading silence of one sound file → { lead (s), max_db }. Throws when ffmpeg fails or the file is silent.
export function measureLead(file, run = spawnSync) {
  const opts = { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 };
  const ff = (af) => {
    const r = run("ffmpeg", ["-hide_banner", "-nostdin", "-i", resolve(file), "-af", af, "-f", "null", "-"], opts);
    if (r.error) throw new Error(`cannot run ffmpeg: ${r.error.message}`);
    if (r.status !== 0) throw new Error(`ffmpeg cannot read ${file}: ${String(r.stderr || "").trim().split(/\r?\n/).slice(-2).join(" | ")}`);
    return String(r.stderr || "");
  };
  const m = ff("volumedetect").match(/max_volume:\s*(-?inf|-?\d+(?:\.\d+)?)\s*dB/i);
  const max = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(max)) throw new Error(`file im lặng: ${file}`);
  const lead = leadFromSilence(ff(`silencedetect=n=${(max - 20).toFixed(1)}dB:d=0.005`));
  return { lead, max_db: max };
}

// Cached leadings keyed by file sha256; one ffmpeg measurement per distinct file content.
function leadCache(dir, run) {
  const path = join(dir, ONSET_CACHE);
  let cache = {};
  if (existsSync(path)) {
    try { const c = JSON.parse(readFileSync(path, "utf8")); if (c && typeof c === "object" && !Array.isArray(c)) cache = c; } catch { /* unreadable cache: measure again and overwrite */ }
  }
  let dirty = false;
  return {
    get(file) {
      const key = createHash("sha256").update(readFileSync(file)).digest("hex");
      const hit = cache[key];
      if (hit && Number.isFinite(hit.lead)) return hit;
      cache[key] = measureLead(file, run);
      dirty = true;
      return cache[key];
    },
    // Atomic write (temp file + rename). Returns null, or the error message when the cache cannot
    // be written: the measurements are done, so the caller only warns.
    save() {
      if (!dirty) return null;
      const tmp = `${path}.tmp`;
      try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(tmp, JSON.stringify(cache, null, 2) + "\n");
        renameSync(tmp, path);
        return null;
      } catch (e) {
        try { rmSync(tmp, { force: true }); } catch { /* the temp file never existed */ }
        return e.message;
      }
    },
  };
}

export const isLegacy = (fm) => !String(fm.direction || "").trim() && !(Number(fm.brief_version) >= 2);
export const MISSING = 'PLAN.md không có ## Sự kiện (Thời điểm | Sự kiện | Âm thanh); ghi "không có SFX gắn sự kiện" khi không có tiếng gắn sự kiện';

const fmtT = (t) => `${Number.isFinite(t) ? +t.toFixed(3) : "?"}s`;
const signed = (n) => `${n >= 0 ? "+" : ""}${n}`;

// Measures every event of the project. Throws when PLAN.md, or the HTML needed for events, is missing.
// Returns { lines: [{ level, t, label, sound, delta_ms, lead_s, text, fix }], errors, warnings,
// missing, none, legacy }. errors/warnings hold the text of the FAIL/WARN lines.
export function checkSync({ dir = ".", html, run = spawnSync } = {}) {
  dir = resolve(dir);
  const planPath = join(dir, "PLAN.md");
  if (!existsSync(planPath)) throw new Error(`PLAN.md not found in ${dir}`);
  const briefPath = join(dir, "BRIEF.md");
  const legacy = isLegacy(frontmatter(existsSync(briefPath) ? readFileSync(briefPath, "utf8") : ""));
  const ev = parseEvents(readFileSync(planPath, "utf8"));
  const out = { lines: [], errors: [], warnings: [], missing: ev.missing, none: ev.none, legacy };
  if (ev.missing) { out.warnings.push(MISSING); return out; }
  if (ev.none) { out.warnings.push("PLAN.md ## Sự kiện: không có SFX gắn sự kiện"); return out; }
  if (ev.error) (legacy ? out.warnings : out.errors).push(ev.error);
  if (!ev.events.length) return out;

  const htmlPath = resolve(dir, html || "index.html");
  if (!existsSync(htmlPath)) throw new Error(`HTML not found: ${htmlPath}`);
  const htmlText = readFileSync(htmlPath, "utf8");
  const htmlName = html || "index.html";
  const tracks = parseTracks(htmlText, dirname(htmlPath), dir);
  const cache = leadCache(dir, run);
  const add = (line) => {
    if (legacy && line.level === "FAIL") line.level = "WARN";
    line.text = `${line.level.padEnd(6)}SYNC   ${fmtT(line.t)} ${line.label} ← ${line.sound} ${line.detail}`;
    out.lines.push(line);
    if (line.level === "FAIL") out.errors.push(line.text.slice(6));
    else if (line.level === "WARN") out.warnings.push(line.text.slice(6));
  };
  try {
    for (const e of ev.events) {
      const base = { t: e.t, label: e.label, sound: e.sound, delta_ms: null, lead_s: null, fix: null };
      if (!Number.isFinite(e.t)) { add({ ...base, level: "FAIL", detail: `thời điểm "${e.raw}" không đọc được (ghi số giây, ví dụ 6.5s)` }); continue; }
      const want = resolve(dir, e.sound);
      const cands = tracks.filter((tr) => tr.src === want);
      if (!cands.length) { add({ ...base, level: "FAIL", detail: `"${e.sound}" không có trong ${htmlName} (hoặc data-volume="0"; SFX trong composition con chưa được kiểm)` }); continue; }
      const track = cands.reduce((a, b) => (Math.abs(b.start - e.t) < Math.abs(a.start - e.t) ? b : a));
      let lead;
      try {
        if (!existsSync(track.src)) throw new Error(`không tìm thấy file ${e.sound}`);
        lead = cache.get(track.src).lead;
      } catch (err) { add({ ...base, level: "FAIL", detail: `không đo được: ${err.message}` }); continue; }
      const delta = Math.round((onsetOf(track, lead) - e.t) * 1000);
      const level = syncVerdict(delta);
      const fix = level === "PASS" ? null : `data-start="${(e.t - Math.max(0, lead - track.mediaStart) / track.rate).toFixed(3)}" cho ${track.id ? `<audio id="${track.id}">` : `<audio src="${e.sound}">`}`;
      add({ ...base, level, delta_ms: delta, lead_s: lead, fix, detail: `lệch ${signed(delta)} ms (đầu file im ${Math.round(lead * 1000)} ms)` });
    }
  } finally {
    const e = cache.save();
    if (e) out.warnings.push(`không ghi được ${ONSET_CACHE}: ${e} (đã đo xong, lần sau đo lại)`);
  }
  return out;
}

export function main(argv = process.argv.slice(2), { run = spawnSync, now = () => new Date(), out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}) {
  if (wantsHelp(argv)) { out(helpText(import.meta.url)); return 0; }
  const o = { project: null, html: null, fix: false, writeQa: false, json: false };
  const usage = "usage: node sfx-sync.mjs --project <dir> [--html <file>] [--fix] [--write-qa] [--json]";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project" || a === "--html") { const v = argv[++i]; if (!v || v.startsWith("--")) { err(`sfx-sync: ${a} needs a value\n${usage}\n`); return 2; } o[a.slice(2)] = v; }
    else if (a === "--fix") o.fix = true;
    else if (a === "--write-qa") o.writeQa = true;
    else if (a === "--json") o.json = true;
    else { err(`sfx-sync: unknown argument ${a}\n${usage}\n`); return 2; }
  }
  if (!o.project) { err(`sfx-sync: --project is required\n${usage}\n`); return 2; }

  let r;
  try { r = checkSync({ dir: o.project, html: o.html, run }); } catch (e) { err(`sfx-sync: ${e.message}\n`); return 2; }
  const lines = [...r.lines];
  const note = (level, label) => lines.push({ level, t: null, label, sound: null, delta_ms: null, lead_s: null, fix: null, text: `${level.padEnd(6)}SYNC   ${label}` });
  if (r.missing) note(r.legacy ? "WARN" : "FAIL", r.legacy ? "PLAN.md không có ## Sự kiện (dự án cũ)" : MISSING);
  else {
    for (const w of r.warnings.filter((x) => !lines.some((l) => l.text.slice(6) === x))) note("WARN", w);
    for (const e of r.errors.filter((x) => !lines.some((l) => l.text.slice(6) === x))) note("FAIL", e);
  }

  const text = lines.flatMap((l) => [l.text, ...(o.fix && l.fix ? [`  đề xuất: ${l.fix}`] : [])]);
  if (o.json) out(JSON.stringify(lines.map(({ level, t, label, sound, delta_ms, lead_s }) => ({ level, t, label, sound, delta_ms, lead_s })), null, 2) + "\n");
  else if (text.length) out(text.join("\n") + "\n");
  if (o.writeQa) {
    const qa = join(resolve(o.project), "QA.md");
    try {
      const prev = existsSync(qa) ? readFileSync(qa, "utf8") : "";
      const lead = !prev || prev.endsWith("\n\n") ? "" : prev.endsWith("\n") ? "\n" : "\n\n";
      appendFileSync(qa, `${lead}## SYNC (${now().toISOString()})\n${text.map((l) => `\n${l}`).join("")}\n`);
    } catch (e) { err(`sfx-sync: cannot write ${qa}: ${e.message}\n`); return 2; }
  }
  return lines.some((l) => l.level === "FAIL") ? 1 : 0;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
