// voice-envelope.mjs — how loud the voice is on every frame, 0–1, for TIMING.env (a mascot's mouth,
// a waveform, a HUD that breathes with the voice). Adapted from the voice envelope of ak:motion-video
// (MIT, AgentKit v1.3.0), rewritten on the voice tracks opus-video already reads.
// voiceEnvelope({ dir, htmlPath, htmlText, fps, duration, run }) → { env: number[], warnings }.
// Voice tracks: parseTracks(html).filter(isVoice) (audio-mix.mjs). Each file is decoded by ffmpeg to
// mono f32 at 24 kHz from data-media-start, laid on the timeline at data-start (data-playback-rate
// and data-duration honoured), summed, then cut into frames of 24000/fps samples. env[i] is the RMS of
// frame i over ref, the 95th percentile of the frames louder than 0.005, capped at 1, two decimals.
// Cache: <dir>/assets/gen/vo-envelope.json { key, env }, key = sha1 of fps, duration and each track's
// src, mtime, size, start, duration, media start and rate; a matching key returns the cached env without ffmpeg.
// A missing file or ffmpeg gives env [] and a warning; it never throws.
// The cache is written even by a dry derive (it is not project state).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { isVoice, parseTracks } from "./audio-mix.mjs";

export const RATE = 24000;
const FLOOR = 0.005;
export const cachePath = (dir) => join(dir, "assets/gen/vo-envelope.json");

function decode(file, mediaStart, run) {
  const args = ["-hide_banner", "-nostdin", "-v", "error", ...(mediaStart > 0 ? ["-ss", String(mediaStart)] : []), "-i", file, "-f", "f32le", "-ac", "1", "-ar", String(RATE), "-"];
  const r = run("ffmpeg", args, { maxBuffer: 1 << 30 });
  if (r.error) throw new Error(`không chạy được ffmpeg: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`ffmpeg không giải mã được ${file}: ${String(r.stderr ?? "").trim()}`);
  const buf = Buffer.from(r.stdout);
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4)).slice();
}

export function voiceEnvelope({ dir, htmlPath, htmlText = null, fps, duration, run = spawnSync }) {
  const warnings = [];
  const tracks = parseTracks(htmlText ?? readFileSync(htmlPath, "utf8"), dirname(htmlPath), dir).filter(isVoice);
  const missing = tracks.filter((t) => !existsSync(t.src));
  if (missing.length) return { env: [], warnings: missing.map((t) => `voice-env: không thấy ${t.src}`) };
  const key = createHash("sha1").update(JSON.stringify([fps, duration, ...tracks.map((t) => {
    const st = statSync(t.src);
    return [t.src, st.mtimeMs, st.size, t.start, t.duration, t.mediaStart, t.rate];
  })])).digest("hex");
  const cache = cachePath(dir);
  try { const c = JSON.parse(readFileSync(cache, "utf8")); if (c.key === key && Array.isArray(c.env)) return { env: c.env, warnings }; } catch { /* no cache yet */ }

  const total = Math.ceil(duration * RATE), mix = new Float32Array(total);
  try {
    for (const t of tracks) {
      const pcm = decode(t.src, t.mediaStart, run);
      const rate = t.rate > 0 ? t.rate : 1;
      const heard = t.duration != null ? Math.min(pcm.length / rate, t.duration * RATE) : pcm.length / rate;
      const at = Math.round(t.start * RATE);
      for (let i = 0; i < heard && at + i < total; i++) {
        if (at + i < 0) continue;
        mix[at + i] += pcm[Math.floor(i * rate)] ?? 0;
      }
    }
  } catch (e) { return { env: [], warnings: [`voice-env: ${e.message}`] }; }

  const frames = Math.round(duration * fps), per = RATE / fps, rms = new Array(frames);
  for (let f = 0; f < frames; f++) {
    const a = Math.round(f * per), b = Math.min(total, Math.round((f + 1) * per));
    let s = 0;
    for (let i = a; i < b; i++) s += mix[i] * mix[i];
    rms[f] = b > a ? Math.sqrt(s / (b - a)) : 0;
  }
  const loud = rms.filter((x) => x > FLOOR).sort((x, y) => x - y);
  const ref = loud.length ? loud[Math.min(loud.length - 1, Math.floor(loud.length * 0.95))] : 0;
  const env = rms.map((x) => (ref > 0 ? Math.round(Math.min(1, x / ref) * 100) / 100 : 0));
  try {
    mkdirSync(dirname(cache), { recursive: true });
    writeFileSync(cache, JSON.stringify({ key, env }) + "\n");
  } catch (e) { warnings.push(`voice-env: không ghi được cache ${cache}: ${e.message}`); }
  return { env, warnings };
}
