#!/usr/bin/env node
// mix-balance.mjs — how far the music sits under the voice in the audio-mix rebuild of a
// composition (with its sidechain duck), measured on the voice and music stems.
//   node mix-balance.mjs --project <dir> [--html index.html] [--json] [--write-qa]
//   node mix-balance.mjs --help | -h
// Runs audio-mix.mjs --stems into a temp folder (the length is the root data-duration, else the
// end of the last track), decodes voice.wav and music.wav to 16 kHz mono and takes RMS (dBFS):
//   speech = the spoken words of words.json next to each voice mp3 (timing.mjs voiceWords), words
//   closer than 0.3 s merged; a project without words.json falls back to the voice clips' spans.
//   under = voice RMS − music RMS during speech; music RMS outside speech is reported as is.
// Verdict: PASS 4 ≤ under ≤ 7 dB · WARN 2–4 or 7–10 dB · FAIL under 2 or over 10 dB.
//   Older projects (BRIEF without direction: and brief_version: 2) and compositions whose sound
//   audio-mix cannot fully rebuild (data-fx-chain, data-automation, volume tweens) get WARN, not FAIL.
//   No music bed → PASS (không có nhạc nền); no voice → PASS (không có giọng đọc).
// Prints one line: "<LEVEL> BALANCE nhạc dưới giọng 5.1 dB (lúc có lời), nhạc lúc không lời −18.2 dBFS".
// --json prints the numbers instead; --write-qa appends the line to QA.md under "## BALANCE (<time>)".
// Levels are measured before loudnorm: under does not depend on it, the dBFS values are pre-normalization.
// Exit: 0 PASS/WARN · 1 FAIL or ffmpeg failed · 2 bad usage, missing html/src or bad data-fx-carve.

import { appendFileSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { frontmatter } from "./check-viet-pro.mjs";
import { isLegacy } from "./sfx-sync.mjs";
import { parseTracks, dynamicAudio, isVoice, isBed, main as audioMix } from "./audio-mix.mjs";
import { voiceWords } from "./timing.mjs";

export const RATE = 16000;
export const MERGE_GAP_S = 0.3;
export const BANDS = { pass: [4, 7], warn: [2, 10] };

class UsageError extends Error {}

// Sorted spans [start, end] merged when the gap between them is under `gap` seconds.
export function speechWindows(spans, gap = MERGE_GAP_S) {
  const out = [];
  for (const [s, e] of [...spans].sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1];
    if (last && s - last[1] < gap) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

// RMS in dBFS of the samples selected by `pick(i)`; -Infinity for silence or no samples.
export function rmsDb(samples, pick = () => true) {
  let sum = 0, n = 0;
  for (let i = 0; i < samples.length; i++) if (pick(i)) { sum += samples[i] * samples[i]; n++; }
  return n && sum > 0 ? 10 * Math.log10(sum / n) : -Infinity;
}

// voice, music: Float32Array mono at `rate`; windows: [[start, end]] in seconds.
export function measureBalance({ voice, music, windows, rate = RATE }) {
  const inSpeech = new Uint8Array(Math.max(voice.length, music.length));
  for (const [s, e] of windows) inSpeech.fill(1, Math.max(0, Math.round(s * rate)), Math.min(inSpeech.length, Math.round(e * rate)));
  const voiceSpeech = rmsDb(voice, (i) => inSpeech[i] === 1);
  const musicSpeech = rmsDb(music, (i) => inSpeech[i] === 1);
  const quiet = inSpeech.some((v) => v === 0);
  return { voiceSpeech, musicSpeech, musicQuiet: quiet ? rmsDb(music, (i) => inSpeech[i] === 0) : null, under: voiceSpeech - musicSpeech };
}

export function balanceVerdict(under, soft = false) {
  const [p0, p1] = BANDS.pass, [w0, w1] = BANDS.warn;
  const level = under >= p0 && under <= p1 ? "PASS" : under >= w0 && under <= w1 ? "WARN" : "FAIL";
  return soft && level === "FAIL" ? "WARN" : level;
}

const db = (x) => (x === -Infinity ? "−∞" : `${x < 0 ? "−" : ""}${Math.abs(x).toFixed(1)}`);
const finite = (x) => (Number.isFinite(x) ? +x.toFixed(2) : null);

// Root length: data-duration of the data-composition-id element, else the end of the last track.
function rootDuration(html, tracks) {
  const tag = html.replace(/<!--[\s\S]*?-->/g, " ").match(/<[a-z][^>]*\sdata-composition-id\b[^>]*>/i)?.[0] ?? "";
  const d = Number(tag.match(/\sdata-duration\s*=\s*["']?([\d.]+)/i)?.[1]);
  if (d > 0) return d;
  return Math.max(0, ...tracks.map((t) => t.start + (t.duration ?? 0)));
}

function decode(file, run) {
  const r = run("ffmpeg", ["-hide_banner", "-nostdin", "-v", "error", "-i", file, "-f", "f32le", "-ac", "1", "-ar", String(RATE), "-"], { maxBuffer: 1 << 30 });
  if (r.error) throw new Error(`cannot run ffmpeg: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${file}: ${String(r.stderr ?? "").trim()}`);
  const buf = Buffer.from(r.stdout);
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4)).slice();
}

// Measures one composition. Returns { level, line, legacy, notes, ...numbers }. Throws UsageError
// (exit 2) for a missing project/html/src or bad data-fx-carve, Error (exit 1) when ffmpeg fails.
export function checkBalance({ dir = ".", html = "index.html", run = spawnSync, mix = audioMix } = {}) {
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
  if (!tracks.some(isVoice)) return done("PASS", "không có giọng đọc");

  const dynamic = dynamicAudio(text);
  if (dynamic.length) notes.push(`âm thanh động (${dynamic.join(", ")}) không đo được, số đo theo audio-mix`);
  if (legacy) notes.push("dự án cũ");
  const total = rootDuration(text, tracks);
  if (!(total > 0)) throw new UsageError(`cannot tell the length of ${htmlPath} (no root data-duration, no track lengths)`);

  const { words } = voiceWords(root, html);
  let spans = words.map((w) => [w.start, w.end]);
  if (!spans.length) {
    spans = tracks.filter(isVoice).map((t) => [t.start, t.start + (t.duration ?? total - t.start)]);
    notes.push("không có words.json, khoảng có lời theo clip giọng");
  }
  const windows = speechWindows(spans);

  const work = mkdtempSync(join(tmpdir(), "mix-balance-"));
  try {
    const errs = [];
    const code = mix(["--html", htmlPath, "--duration", String(total), "--out", join(work, "mix.wav"), "--base", root, "--stems", work], { spawn: run, log: () => {}, err: (s) => errs.push(s) });
    if (code === 2) throw new UsageError(`audio-mix: ${errs.join("; ")}`);
    if (code !== 0) throw new Error(`audio-mix exited ${code}: ${errs.join("; ")}`);
    const m = measureBalance({ voice: decode(join(work, "voice.wav"), run), music: decode(join(work, "music.wav"), run), windows });
    const numbers = { under_db: finite(m.under), voice_speech_dbfs: finite(m.voiceSpeech), music_speech_dbfs: finite(m.musicSpeech), music_quiet_dbfs: m.musicQuiet === null ? null : finite(m.musicQuiet), windows: windows.map(([a, b]) => [+a.toFixed(3), +b.toFixed(3)]) };
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

export function main(argv = process.argv.slice(2), { run = spawnSync, now = () => new Date(), out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}) {
  if (wantsHelp(argv)) { out(helpText(import.meta.url)); return 0; }
  const o = { project: null, html: "index.html", json: false, writeQa: false };
  const usage = "usage: node mix-balance.mjs --project <dir> [--html index.html] [--json] [--write-qa]";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project" || a === "--html") { const v = argv[++i]; if (!v || v.startsWith("--")) { err(`mix-balance: ${a} needs a value\n${usage}\n`); return 2; } o[a.slice(2)] = v; }
    else if (a === "--json") o.json = true;
    else if (a === "--write-qa") o.writeQa = true;
    else { err(`mix-balance: unknown argument ${a}\n${usage}\n`); return 2; }
  }
  if (!o.project) { err(`mix-balance: --project is required\n${usage}\n`); return 2; }
  if (!existsSync(resolve(o.project))) { err(`mix-balance: project not found: ${resolve(o.project)}\n`); return 2; }

  let r;
  try { r = checkBalance({ dir: o.project, html: o.html, run }); } catch (e) { err(`mix-balance: ${e.message}\n`); return e instanceof UsageError ? 2 : 1; }
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
