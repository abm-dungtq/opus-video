#!/usr/bin/env node
// mix-balance.mjs — how far the music sits under the voice in the audio-mix rebuild of a
// composition (with its sidechain duck), measured on the voice and music stems.
//   node mix-balance.mjs --project <dir> [--html index.html] [--json] [--write-qa] [--no-cache]
//   node mix-balance.mjs --help | -h
// Runs audio-mix.mjs --stems into a temp folder (the length is the root data-duration, else the
// end of the last track), decodes voice.wav and music.wav to 16 kHz mono and takes RMS (dBFS):
//   speech = the spoken words of words.json next to each voice track (id vo-* or *-voice, group
//   voiceover, src under assets/voice/ or a carve source), words closer than 0.3 s merged; a voice
//   track without words.json counts as
//   speaking for its whole clip (balance-measure.mjs, shared with audio-mix's duck).
//   under = voice RMS − music RMS during speech; music RMS outside speech is reported as is.
// Verdict: PASS 4 ≤ under ≤ 7 dB · WARN 2–4 or 7–10 dB · FAIL under 2 or over 10 dB.
//   Older projects (BRIEF without direction: and brief_version: 2) and compositions whose sound
//   audio-mix cannot fully rebuild (data-fx-chain, data-automation, volume tweens) get WARN, not FAIL.
//   No music bed → PASS (không có nhạc nền); no voice → PASS (không có giọng đọc).
// Prints one line: "<LEVEL> BALANCE nhạc dưới giọng 5.1 dB (lúc có lời), nhạc lúc không lời −18.2 dBFS".
// --json prints the numbers instead, with each ducked bed's natural, target, wanted reduction and reduction got (dB); --write-qa appends the line to QA.md under "## BALANCE (<time>)".
// The result is cached in .opus/mix-balance-cache.json by the content of everything measured; an
// unchanged sound answers from the cache ("cached": true in --json). --no-cache measures again.
// Levels are measured before loudnorm: under does not depend on it, the dBFS values are pre-normalization.
// Exit: 0 PASS/WARN · 1 FAIL or ffmpeg failed · 2 bad usage, missing html/src or bad data-fx-carve.

import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { frontmatter } from "./check-viet-pro.mjs";
import { isLegacy } from "./sfx-sync.mjs";
import { parseTracks, dynamicAudio, isBed, voiceIndices, main as audioMix } from "./audio-mix.mjs";
import { decodeMono, measureBalance, speechSpans } from "./balance-measure.mjs";

export const BANDS = { pass: [4, 7], warn: [2, 10] };

class UsageError extends Error {}

export function balanceVerdict(under, soft = false) {
  const [p0, p1] = BANDS.pass, [w0, w1] = BANDS.warn;
  const level = under >= p0 && under <= p1 ? "PASS" : under >= w0 && under <= w1 ? "WARN" : "FAIL";
  return soft && level === "FAIL" ? "WARN" : level;
}

const db = (x) => (x === -Infinity ? "−∞" : `${x < 0 ? "−" : ""}${Math.abs(x).toFixed(1)}`);
const finite = (x) => (Number.isFinite(x) ? +x.toFixed(2) : null);

// The measure is cached in <project>/.opus/mix-balance-cache.json under a sha256 of everything it
// reads: the root HTML (durations, carve, groups, ids), the BRIEF legacy flag, every track file,
// each track's words.json, and this measuring code. The ffmpeg version is not in the key: bump
// CACHE_VERSION when the way the stems are made or measured changes outside these three files.
export const CACHE_VERSION = 1;
export const CACHE_FILE = join(".opus", "mix-balance-cache.json");
const shaFile = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
let codeSha = null;
const measuringCode = () => (codeSha ??= ["./mix-balance.mjs", "./audio-mix.mjs", "./balance-measure.mjs"]
  .map((f) => shaFile(fileURLToPath(new URL(f, import.meta.url)))).join(","));

export function balanceKey({ root, text, tracks, legacy }) {
  const h = createHash("sha256").update(`v${CACHE_VERSION}\n${measuringCode()}\n${legacy}\n${text}`);
  for (const t of tracks) {
    const words = `${t.src}.words.json`;
    h.update(`\n${JSON.stringify({ ...t, src: relative(root, t.src) })}\n${shaFile(t.src)}\n${existsSync(words) ? shaFile(words) : "none"}`);
  }
  return h.digest("hex");
}

function readCache(root, key) {
  try {
    const c = JSON.parse(readFileSync(join(root, CACHE_FILE), "utf8"));
    return c?.key === key && c.result && typeof c.result === "object" ? c.result : null;
  } catch { return null; }
}

// One entry (the newest), written whole through a temp file so a crash never leaves half a file.
function writeCache(root, key, result) {
  const file = join(root, CACHE_FILE), tmp = `${file}.${process.pid}.tmp`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(tmp, JSON.stringify({ key, result, created: new Date().toISOString() }, null, 2) + "\n");
  renameSync(tmp, file);
}

// Root length: data-duration of the data-composition-id element, else the end of the last track.
function rootDuration(html, tracks) {
  const tag = html.replace(/<!--[\s\S]*?-->/g, " ").match(/<[a-z][^>]*\sdata-composition-id\b[^>]*>/i)?.[0] ?? "";
  const d = Number(tag.match(/\sdata-duration\s*=\s*["']?([\d.]+)/i)?.[1]);
  if (d > 0) return d;
  return Math.max(0, ...tracks.map((t) => t.start + (t.duration ?? 0)));
}

// Measures one composition. Returns { level, line, legacy, notes, ...numbers }. Throws UsageError
// (exit 2) for a missing project/html/src or bad data-fx-carve, Error (exit 1) when ffmpeg fails.
export function checkBalance({ dir = ".", html = "index.html", run = spawnSync, mix = audioMix, cache = true } = {}) {
  const root = resolve(dir);
  const htmlPath = resolve(root, html);
  if (!existsSync(htmlPath)) throw new UsageError(`html not found: ${htmlPath}`);
  const text = readFileSync(htmlPath, "utf8");
  let tracks;
  try { tracks = parseTracks(text, dirname(htmlPath), root); } catch (e) { throw new UsageError(e.message); }
  const brief = join(root, "BRIEF.md");
  const legacy = isLegacy(frontmatter(existsSync(brief) ? readFileSync(brief, "utf8") : ""));
  const notes = [];
  const done = (level, label, extra = {}) => ({ level, line: `${level} BALANCE ${label}`, legacy, notes, ...extra });
  if (!tracks.some(isBed)) return done("PASS", "không có nhạc nền");
  if (!voiceIndices(tracks).length) return done("PASS", "không có giọng đọc");

  const dynamic = dynamicAudio(text);
  if (dynamic.length) notes.push(`âm thanh động (${dynamic.join(", ")}) không đo được, số đo theo audio-mix`);
  if (legacy) notes.push("dự án cũ");
  const total = rootDuration(text, tracks);
  if (!(total > 0)) throw new UsageError(`cannot tell the length of ${htmlPath} (no root data-duration, no track lengths)`);

  const { windows, noWords } = speechSpans(voiceIndices(tracks).map((i) => tracks[i]), total);
  if (noWords.length) notes.push(`không có words.json cho ${noWords.join(", ")}, khoảng có lời theo clip giọng`);

  let key = null;
  if (cache) {
    try { key = balanceKey({ root, text, tracks, legacy }); } catch { key = null; } // an unreadable src fails in audio-mix below
    const hit = key && readCache(root, key);
    if (hit) return { ...hit, cached: true };
  }
  const result = measure();
  if (key) { try { writeCache(root, key, result); } catch (e) { result.notes.push(`không ghi được cache: ${e.message}`); } }
  return result;

  function measure() {
    const work = mkdtempSync(join(tmpdir(), "mix-balance-"));
    try {
      const errs = [], duck = [];
      const code = mix(["--html", htmlPath, "--duration", String(total), "--out", join(work, "mix.wav"), "--base", root, "--stems", work], {
        spawn: run, log: () => {}, err: (s) => errs.push(s),
        onDuck: (d) => duck.push({ id: d.id, natural_db: finite(d.natural), target_db: finite(d.target), reduction_db: finite(d.reduction), got_db: finite(d.got), passes: d.passes }),
      });
      if (code === 2) throw new UsageError(`audio-mix: ${errs.join("; ")}`);
      if (code !== 0) throw new Error(`audio-mix exited ${code}: ${errs.join("; ")}`);
      const m = measureBalance({ voice: decodeMono(join(work, "voice.wav"), run), music: decodeMono(join(work, "music.wav"), run), windows });
      const numbers = { under_db: finite(m.under), voice_speech_dbfs: finite(m.voiceSpeech), music_speech_dbfs: finite(m.musicSpeech), music_quiet_dbfs: m.musicQuiet === null ? null : finite(m.musicQuiet), windows: windows.map(([a, b]) => [+a.toFixed(3), +b.toFixed(3)]), duck };
      const tail = notes.length ? ` (${notes.join("; ")})` : "";
      if (m.musicSpeech === -Infinity) return done("PASS", `nhạc không phát lúc có lời${tail}`, numbers);
      if (m.voiceSpeech === -Infinity) return done(legacy || dynamic.length ? "WARN" : "FAIL", `giọng đọc im lặng trong khoảng có lời${tail}`, numbers);
      const level = balanceVerdict(m.under, legacy || dynamic.length > 0);
      const quiet = m.musicQuiet === null ? "không có đoạn không lời" : `nhạc lúc không lời ${db(m.musicQuiet)} dBFS`;
      return done(level, `nhạc dưới giọng ${db(m.under)} dB (lúc có lời), ${quiet}${tail}`, numbers);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
}

export function main(argv = process.argv.slice(2), { run = spawnSync, now = () => new Date(), out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}) {
  if (wantsHelp(argv)) { out(helpText(import.meta.url)); return 0; }
  const o = { project: null, html: "index.html", json: false, writeQa: false, cache: true };
  const usage = "usage: node mix-balance.mjs --project <dir> [--html index.html] [--json] [--write-qa] [--no-cache]";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project" || a === "--html") { const v = argv[++i]; if (!v || v.startsWith("--")) { err(`mix-balance: ${a} needs a value\n${usage}\n`); return 2; } o[a.slice(2)] = v; }
    else if (a === "--json") o.json = true;
    else if (a === "--write-qa") o.writeQa = true;
    else if (a === "--no-cache") o.cache = false;
    else { err(`mix-balance: unknown argument ${a}\n${usage}\n`); return 2; }
  }
  if (!o.project) { err(`mix-balance: --project is required\n${usage}\n`); return 2; }
  if (!existsSync(resolve(o.project))) { err(`mix-balance: project not found: ${resolve(o.project)}\n`); return 2; }

  let r;
  try { r = checkBalance({ dir: o.project, html: o.html, run, cache: o.cache }); } catch (e) { err(`mix-balance: ${e.message}\n`); return e instanceof UsageError ? 2 : 1; }
  if (o.json) { const { line, ...rest } = r; out(JSON.stringify({ ...rest, line }, null, 2) + "\n"); }
  else out(`${r.line}\n`);
  if (o.writeQa) {
    const qa = join(resolve(o.project), "QA.md");
    try {
      const prev = existsSync(qa) ? readFileSync(qa, "utf8") : "";
      const lead = !prev || prev.endsWith("\n\n") ? "" : prev.endsWith("\n") ? "\n" : "\n\n";
      appendFileSync(qa, `${lead}## BALANCE (${now().toISOString()})\n\n${r.line}\n`);
    } catch (e) { err(`mix-balance: cannot write ${qa}: ${e.message}\n`); return 2; }
  }
  return r.level === "FAIL" ? 1 : 0;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
