// balance-measure.mjs — shared measurement of how far music sits under voice, used by audio-mix.mjs
// (to aim its duck) and mix-balance.mjs (to report it), so both read the same speech windows the
// same way. Library only, no CLI. Node built-ins only: audio-mix imports this file, so it must not
// import audio-mix, timing or check-preflight (no import cycle).
//   speechSpans(voiceTracks, total) — spoken spans on the root timeline from <src>.words.json
//     (a track without a readable words.json counts as speaking for its whole clip).
//   speechWindows(spans) — spans closer than 0.3 s merged.
//   decodeMono(file, run) — ffmpeg → Float32Array, mono, 16 kHz.
//   measureBalance({ voice, music, windows }) — RMS dBFS of voice and music in speech, music outside.

import { existsSync, readFileSync } from "node:fs";

export const RATE = 16000;
export const MERGE_GAP_S = 0.3;

// Words of one track's <src>.words.json mapped to the root timeline: words trimmed away by
// data-media-start / data-duration are dropped, a word cut by data-duration ends there.
// Returns [[start, end]] or null when the file is missing or not a [{text,start,end}] array.
function trackWordSpans(t) {
  const file = `${t.src}.words.json`;
  if (!existsSync(file)) return null;
  let data;
  try { data = JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
  if (!Array.isArray(data)) return null;
  const out = [];
  for (const w of data) {
    if (!w || !Number.isFinite(w.start) || !Number.isFinite(w.end)) continue;
    const rel = (w.start - t.mediaStart) / t.rate;
    if (rel < 0 || (t.duration != null && rel >= t.duration)) continue;
    const relEnd = (w.end - t.mediaStart) / t.rate;
    out.push([t.start + rel, t.start + (t.duration != null ? Math.min(relEnd, t.duration) : relEnd)]);
  }
  return out;
}

// voiceTracks: parsed tracks (audio-mix parseTracks) that speak. total: root length in seconds.
// Returns { windows: merged [[start, end]], noWords: [id or src of tracks measured by their clip] }.
export function speechSpans(voiceTracks, total) {
  const spans = [], noWords = [];
  for (const t of voiceTracks) {
    const words = trackWordSpans(t);
    if (words) spans.push(...words);
    else {
      noWords.push(t.id ?? t.src);
      spans.push([t.start, t.start + (t.duration ?? Math.max(0, total - t.start))]);
    }
  }
  return { windows: speechWindows(spans), noWords };
}

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
// Returns { voiceSpeech, musicSpeech, musicQuiet (null when all is speech), under } in dB.
export function measureBalance({ voice, music, windows, rate = RATE }) {
  const inSpeech = new Uint8Array(Math.max(voice.length, music.length));
  for (const [s, e] of windows) inSpeech.fill(1, Math.max(0, Math.round(s * rate)), Math.min(inSpeech.length, Math.round(e * rate)));
  const voiceSpeech = rmsDb(voice, (i) => inSpeech[i] === 1);
  const musicSpeech = rmsDb(music, (i) => inSpeech[i] === 1);
  const quiet = inSpeech.some((v) => v === 0);
  return { voiceSpeech, musicSpeech, musicQuiet: quiet ? rmsDb(music, (i) => inSpeech[i] === 0) : null, under: voiceSpeech - musicSpeech };
}

// A WAV decoded by ffmpeg to mono f32 at RATE. run: spawnSync or a stand-in. Throws on failure.
export function decodeMono(file, run) {
  const r = run("ffmpeg", ["-hide_banner", "-nostdin", "-v", "error", "-i", file, "-f", "f32le", "-ac", "1", "-ar", String(RATE), "-"], { maxBuffer: 1 << 30 });
  if (r.error) throw new Error(`cannot run ffmpeg: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${file}: ${String(r.stderr ?? "").trim()}`);
  const buf = Buffer.from(r.stdout);
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4)).slice();
}
