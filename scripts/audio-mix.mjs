#!/usr/bin/env node
// audio-mix.mjs — rebuild a composition's sound as one WAV with ffmpeg, from the static audio
// attributes in its HTML: every <audio> and every <video> without `muted` (data-volume="0" skipped).
// Reads data-start, data-duration, data-volume, data-media-start, data-playback-rate,
// data-fade-in, data-fade-out (seconds of afade at the clip's head and tail on the timeline),
// data-audio-group and data-fx-carve. Ignores data-fx-chain, data-automation and audio inside
// sub-composition files (render-final keeps the HyperFrames mix for those).
//   node audio-mix.mjs --html <file> --duration <seconds> --out <wav> [--base <project dir>]
//                      [--loudnorm] [--stems <dir>] [--dry-run]
//   node audio-mix.mjs --help | -h
// A src resolves from the HTML file's folder; with --base, a src missing there falls back to that
// directory (HyperFrames resolves compositions/*.html paths from the project root).
// data-fx-carve='{"enabled":true,"sources":["voiceover"],"strength":0.8}' on a bed (music): the bed
//   is ducked by ffmpeg sidechaincompress keyed by the sum of its sources (each source matches a
//   track id or a data-audio-group name), aimed at a distance under the voice:
//   target = 4 + 2.5*strength dB; natural = music under voice in a first mix without ducking,
//   measured on its stems in the speech windows of words.json exactly as mix-balance.mjs does;
//   wanted reduction = clamp(target - natural, 0, 12) dB. The threshold (dB under the RMS of the
//   key tracks, volumedetect on the clips back to back, clamped to -50..0 dBFS) is searched by
//   bisection: up to 6 extra trial mixes, each measured the same way, until the reduction got is
//   within 0.3 dB of the wanted one (else the closest trial, with a WARN). Ratio 20, attack 15 ms,
//   release 350 ms. No reduction wanted or music silent during speech: not ducked. A silent voice
//   key: WARN, not ducked. Each bed prints natural, target, wanted, got and threshold on stderr.
//   Malformed data-fx-carve JSON: exit 2.
// --loudnorm: measures the mix with loudnorm (pass 1, -14 LUFS / -1.5 dBTP). When the peak leaves
//   room, one static gain = -14 - measured I with `volume`: no dynamic processing, so the balance of
//   the duck is kept. When the peak caps that gain (the mix would land more than 0.5 LU under -14):
//   the full gain, then a lookahead limiter 0.5 dB under the ceiling on 4× oversampled audio; the
//   output is measured and the gain re-aimed (at most 3 passes, at most 6 dB past the static
//   ceiling). One stderr line "limiter: …" with the numbers; "WARN LOUDNESS" only when the result is
//   still outside -16…-12 LUFS, the range qc-mp4 LOUDNESS passes (both read LOUDNORM). Through a
//   work WAV in a temp folder next to --out (removed afterwards).
// --stems <dir>: also writes <dir>/voice.wav (tracks with id vo-* or *-voice, group voiceover, a
//   src under assets/voice/, or a carve source) and <dir>/music.wav (beds: carve on, group music,
//   or a src under bgm/; after ducking),
//   each only when such tracks exist, same length as the mix, before --loudnorm.
// --dry-run prints the ffmpeg commands and writes nothing next to --out (a ducked bed still gets its
// voice level and undocked mix measured, in a temp folder that is removed). Every output: 48 kHz stereo WAV, capped at the expected size (sample-count
// trim, -t and -fs) so a misbehaving filter graph cannot fill the disk.
// Exit: 0 ok · 1 ffmpeg failed · 2 bad usage, a src file is missing or data-fx-carve is not JSON.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { decodeMono, measureBalance, speechSpans } from "./balance-measure.mjs";

// Character references in an attribute value, decoded in one pass as a browser does
// (data-fx-carve="{&quot;enabled&quot;:true}", src="a&amp;b.mp3"); "&amp;quot;" stays "&quot;".
const NAMED = { quot: '"', amp: "&", apos: "'", lt: "<", gt: ">" };
export const decodeEntities = (v) => v.replace(/&(?:#(\d+)|#x([\da-f]+)|(quot|amp|apos|lt|gt));/gi, (m, dec, hex, name) => {
  if (name) return NAMED[name.toLowerCase()];
  const cp = dec ? Number(dec) : parseInt(hex, 16);
  return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
});
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3]) : undefined;
};
const hasFlag = (tag, name) => new RegExp(`\\s${name}(?=[\\s>/=])`, "i").test(tag);
const num = (v, dflt) => {
  if (v === undefined || v === "") return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
};

// Tracks that make sound, in document order. Elements without src are skipped (e.g. a tag quoted in prose).
// fallbackDir: where a src missing under baseDir is looked up next (the project root).
export const resolveSrc = (src, baseDir, fallbackDir) => {
  const first = resolve(baseDir, src);
  if (!fallbackDir || existsSync(first)) return first;
  const alt = resolve(fallbackDir, src);
  return existsSync(alt) ? alt : first;
};

// data-fx-carve of one tag → { enabled, sources, strength } or null when absent.
// Throws (naming the tag) when the value is not a JSON object.
function parseCarve(tag) {
  const raw = attr(tag, "data-fx-carve");
  if (raw === undefined) return null;
  const name = attr(tag, "id") ? `#${attr(tag, "id")}` : `src="${attr(tag, "src")}"`;
  let c;
  try { c = JSON.parse(raw); } catch (e) { throw new Error(`data-fx-carve on <audio ${name}> is not valid JSON: ${e.message}`); }
  if (!c || typeof c !== "object" || Array.isArray(c)) throw new Error(`data-fx-carve on <audio ${name}> must be a JSON object {enabled, sources, strength}`);
  const strength = Math.min(1, Math.max(0, num(c.strength, 0.5)));
  return { enabled: c.enabled !== false, sources: Array.isArray(c.sources) ? c.sources.map(String) : [], strength };
}

export function parseTracks(html, baseDir, fallbackDir) {
  const flat = html.replace(/<!--[\s\S]*?-->/g, " ").replace(/\r?\n/g, " ");
  const tracks = [];
  for (const [tag, kind] of flat.matchAll(/<(audio|video)\b[^>]*>/gi)) {
    if (kind.toLowerCase() === "video" && hasFlag(tag, "muted")) continue;
    const src = attr(tag, "src");
    if (!src) continue;
    const volume = num(attr(tag, "data-volume"), 1);
    if (volume === 0) continue;
    tracks.push({
      id: attr(tag, "id") ?? null,
      src: resolveSrc(src, baseDir, fallbackDir),
      start: num(attr(tag, "data-start"), 0),
      duration: num(attr(tag, "data-duration"), null),
      volume,
      mediaStart: num(attr(tag, "data-media-start"), 0),
      rate: num(attr(tag, "data-playback-rate"), 1),
      fadeIn: num(attr(tag, "data-fade-in"), 0),
      fadeOut: num(attr(tag, "data-fade-out"), 0),
      group: attr(tag, "data-audio-group") ?? null,
      carve: parseCarve(tag),
    });
  }
  return tracks;
}

// Sound audio-mix cannot rebuild, by attribute or tween key (never by words like "fade", which
// also names GSAP picture fades): hyperframes-audio Web Audio work declared as data-automation or
// data-fx-chain, and a GSAP tween on `volume` in an inline <script>. data-audio-group and
// data-fx-carve are rebuilt here (groups name carve sources; carve becomes a sidechain duck).
// Returns the reasons found; empty means audio-mix rebuilds the sound.
export const DYNAMIC_AUDIO_ATTRS = ["data-automation", "data-fx-chain"];
export function dynamicAudio(html) {
  const flat = html.replace(/<!--[\s\S]*?-->/g, " ");
  const reasons = DYNAMIC_AUDIO_ATTRS.filter((name) => new RegExp(`<[a-z][^>]*\\s${name}(?=[\\s>/=])`, "i").test(flat));
  const scripts = [...flat.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map((m) => m[1]).join("\n");
  if (/(?:^|[\s,{(])["']?volume["']?\s*:/.test(scripts)) reasons.push("GSAP tween on volume");
  if (/\.volume\s*=(?!=)/.test(scripts)) reasons.push("script sets .volume");
  return reasons;
}

// Roles used for ducking and stems.
export const VOICE_GROUP = "voiceover";
// Narration: id vo-* or *-voice (faceless-explainer names them el-NN-…-voice), group voiceover, or a
// src under assets/voice/. The one voice rule for audio-mix, mix-balance, timing and word-sync.
export const isVoice = (t) => Boolean(t.id && (t.id.startsWith("vo-") || t.id.endsWith("-voice"))) || t.group === VOICE_GROUP || /(?:^|[\\/])assets[\\/]voice[\\/]/.test(t.src ?? "");
export const isBed = (t) => Boolean(t.carve?.enabled) || t.group === "music" || /(?:^|[\\/])bgm[\\/]/.test(t.src);
// Indices of the tracks that key the duck of tracks[bed]: ids or group names listed in its carve sources.
export function carveKeys(tracks, bed) {
  const c = tracks[bed].carve;
  if (!c?.enabled) return [];
  return tracks.map((t, i) => i).filter((i) => i !== bed && (c.sources.includes(tracks[i].id) || (tracks[i].group != null && c.sources.includes(tracks[i].group))));
}

// Indices of the tracks on the voice stem: isVoice, or a key of any carve bed.
export function voiceIndices(tracks) {
  const keyed = new Set(tracks.flatMap((_, b) => carveKeys(tracks, b)));
  return tracks.map((_, i) => i).filter((i) => isVoice(tracks[i]) || keyed.has(i));
}

// Assumption: HyperFrames' carve (multi-band EQ plus a duck from carveProfile) is approximated by
// a level-only duck aimed at a distance under the voice; the EQ is not reproduced.
export const CARVE_FLOOR_DB = -50;
export const MAX_REDUCTION_DB = 12;
export const duckTarget = (strength) => 4 + 2.5 * strength;
// natural: music under voice in dB without ducking (+Infinity when the music is silent during
// speech, -Infinity when the voice is). Returns the dB to take off the bed while the voice speaks.
export function duckReduction(natural, strength) {
  if (!Number.isFinite(natural)) return 0;
  return Math.min(MAX_REDUCTION_DB, Math.max(0, duckTarget(strength) - natural));
}
// Threshold in dBFS `drop` dB under the voice RMS; the floor keeps a near-silent key from making
// every breath duck the bed.
export const thresholdAt = (voiceDb, drop) => Math.min(0, Math.max(CARVE_FLOOR_DB, voiceDb - drop));

// The threshold is found by measurement, not computed: the compressor follows the key's
// short-term level, so the reduction it gives depends on how the voice's level is spread around
// its mean (one TTS voice measured 3.9 dB at drop 0 and +0.52 dB per dB of drop), not on the mean
// alone. measure(drop) → reduction got in dB (larger drop, more reduction; NaN when it could not
// be measured). Bisects drop in [lo, hi]; returns { drop, got, passes, ok } for the closest trial.
export const DUCK_SEARCH = { lo: -12, hi: 24, tol: 0.3, passes: 6 };
export function searchDrop(wanted, measure, { lo, hi, tol, passes } = DUCK_SEARCH) {
  let best = null;
  for (let n = 1; n <= passes; n++) {
    const drop = (lo + hi) / 2;
    const got = measure(drop);
    if (!Number.isFinite(got)) break;
    if (!best || Math.abs(got - wanted) < Math.abs(best.got - wanted)) best = { drop, got, passes: n };
    if (Math.abs(got - wanted) <= tol) break;
    if (got < wanted) lo = drop; else hi = drop;
  }
  return best ? { ...best, ok: Math.abs(best.got - wanted) <= tol } : { drop: null, got: NaN, passes: 0, ok: false };
}
const linear = (db) => +(10 ** (db / 20)).toFixed(6);

// The one loudness contract of the delivery mix: audio-mix aims at I and stays under the TP ceiling;
// qc-mp4 LOUDNESS passes [low, high] (it reads these numbers, so the two cannot drift apart).
export const LOUDNORM = { I: -14, TP: -1.5, LRA: 11, low: -16, high: -12 };
const LOUDNORM_BASE = `loudnorm=I=${LOUDNORM.I}:TP=${LOUDNORM.TP}:LRA=${LOUDNORM.LRA}`;

// atempo accepts 0.5..2 per instance; chain instances for rates outside that range.
function atempoChain(rate) {
  const parts = [];
  let r = rate;
  while (r > 2) { parts.push("atempo=2"); r /= 2; }
  while (r < 0.5) { parts.push("atempo=0.5"); r /= 0.5; }
  parts.push(`atempo=${+r.toFixed(6)}`);
  return parts;
}

// Trim, tempo, volume and fades of one track (input i), without placing it on the timeline. The
// fades run after asetpts and atempo, so their times are seconds of the clip on the timeline; a
// fade-out needs the clip's duration.
function trackFilters(t) {
  const trim = [`start=${t.mediaStart}`];
  if (t.duration != null) trim.push(`duration=${+(t.duration * t.rate).toFixed(6)}`);
  const f = [`atrim=${trim.join(":")}`, "asetpts=PTS-STARTPTS"];
  if (t.rate !== 1) f.push(...atempoChain(t.rate));
  f.push(`volume=${t.volume}`);
  if (t.fadeIn > 0) f.push(`afade=t=in:st=0:d=${t.fadeIn}`);
  if (t.fadeOut > 0 && t.duration != null) f.push(`afade=t=out:st=${+Math.max(0, t.duration - t.fadeOut).toFixed(6)}:d=${t.fadeOut}`);
  return f;
}

const outputArgs = (samples, totalSeconds, out) => {
  const maxBytes = samples * 2 * 2 + (1 << 20); // 16-bit stereo PCM + 1 MB for the WAV header
  return ["-ar", "48000", "-ac", "2", "-t", String(totalSeconds), "-fs", String(maxBytes), out];
};

// thresholds[i]: linear sidechaincompress threshold of bed i; a bed without one is not ducked.
// stems: directory for voice.wav / music.wav, or null.
export function buildArgs(tracks, totalSeconds, outWav, { thresholds = [], stems = null } = {}) {
  if (!tracks.length) throw new Error("no audible tracks");
  const idx = tracks.map((_, i) => i);
  const keys = idx.map((i) => carveKeys(tracks, i));
  const ducked = idx.filter((i) => keys[i].length && thresholds[i] != null);
  const voice = stems ? voiceIndices(tracks) : [];
  const music = stems ? idx.filter((i) => isBed(tracks[i])) : [];
  // How many filters read each label; labels read more than once go through asplit.
  const uses = new Map();
  const want = (label) => uses.set(label, (uses.get(label) ?? 0) + 1);
  const base = (i) => (ducked.includes(i) ? `d${i}` : `a${i}`);
  idx.forEach((i) => want(base(i)));
  ducked.forEach((b) => { want(`a${b}`); keys[b].forEach((k) => want(`a${k}`)); });
  voice.forEach((i) => want(`a${i}`));
  music.forEach((i) => want(base(i)));
  const taken = new Map();
  const use = (label) => {
    if (uses.get(label) === 1) return `[${label}]`;
    const n = taken.get(label) ?? 0;
    taken.set(label, n + 1);
    return `[${label}_${n}]`;
  };
  const split = (label) => (uses.get(label) > 1 ? [`[${label}]asplit=${uses.get(label)}${Array.from({ length: uses.get(label) }, (_, n) => `[${label}_${n}]`).join("")}`] : []);

  const args = ["-hide_banner", "-nostdin", "-v", "error", "-y"];
  for (const t of tracks) args.push("-i", t.src);
  const chains = tracks.map((t, i) => `[${i}:a]${[...trackFilters(t), `adelay=${Math.round(t.start * 1000)}:all=1`, "aresample=48000"].join(",")}[a${i}]`);
  idx.forEach((i) => chains.push(...split(`a${i}`)));
  // amix (ffmpeg 8.x) can emit pts=NOPTS frames after an input ends, so a pts-based trim after apad
  // may never fire and the WAV grows until the disk is full: pad and trim by sample count, never by pts.
  const samples = Math.round(totalSeconds * 48000);
  for (const b of ducked) {
    const ks = keys[b].map((k) => use(`a${k}`));
    const threshold = thresholds[b];
    // The key is padded to the full length so the bed is never cut where the voice ends.
    chains.push(`${ks.join("")}amix=inputs=${ks.length}:normalize=0,apad=whole_dur=${totalSeconds}[k${b}]`);
    chains.push(`${use(`a${b}`)}[k${b}]sidechaincompress=threshold=${threshold}:ratio=20:attack=15:release=350:makeup=1[d${b}]`);
    chains.push(...split(`d${b}`));
  }
  const bus = (labels, out) => `${labels.join("")}amix=inputs=${labels.length}:normalize=0,apad=whole_dur=${totalSeconds},atrim=end_sample=${samples}[${out}]`;
  chains.push(bus(idx.map((i) => use(base(i))), "out"));
  if (voice.length) chains.push(bus(voice.map((i) => use(`a${i}`)), "voice"));
  if (music.length) chains.push(bus(music.map((i) => use(base(i))), "music"));
  args.push("-filter_complex", chains.join(";"), "-map", "[out]", ...outputArgs(samples, totalSeconds, outWav));
  if (voice.length) args.push("-map", "[voice]", ...outputArgs(samples, totalSeconds, join(stems, "voice.wav")));
  if (music.length) args.push("-map", "[music]", ...outputArgs(samples, totalSeconds, join(stems, "music.wav")));
  return args;
}

// ffmpeg args that print the mean RMS (volumedetect) of the given tracks played back to back,
// without the silence between them: the level of the voice while it speaks.
export function keyLevelArgs(tracks, keyIdx) {
  const args = ["-hide_banner", "-nostdin", "-nostats"];
  for (const k of keyIdx) args.push("-i", tracks[k].src);
  const chains = keyIdx.map((k, n) => `[${n}:a]${[...trackFilters(tracks[k]), "aformat=sample_rates=48000:channel_layouts=stereo"].join(",")}[c${n}]`);
  chains.push(`${keyIdx.map((_, n) => `[c${n}]`).join("")}concat=n=${keyIdx.length}:v=0:a=1,volumedetect[v]`);
  args.push("-filter_complex", chains.join(";"), "-map", "[v]", "-f", "null", "-");
  return args;
}

// mean_volume from volumedetect stderr → dB (-Infinity for silence); throws when absent.
export function parseMeanVolume(stderr) {
  const m = String(stderr).match(/mean_volume:\s*(-?inf|-?[\d.]+)\s*dB/);
  if (!m) throw new Error("volumedetect printed no mean_volume");
  return /inf/.test(m[1]) ? -Infinity : Number(m[1]);
}

export const loudnormPass1Args = (inWav) => ["-hide_banner", "-nostdin", "-nostats", "-i", inWav, "-af", `${LOUDNORM_BASE}:print_format=json`, "-f", "null", "-"];

// Last JSON object printed by loudnorm (print_format=json) → its fields as strings; throws when absent.
export function parseLoudnorm(stderr) {
  const m = String(stderr).match(/\{[^{}]*"input_i"[^{}]*\}/g);
  if (!m) throw new Error("loudnorm printed no measurement");
  return JSON.parse(m[m.length - 1]);
}

// A second loudnorm pass turns dynamic whenever the peak leaves no room for the full gain (and
// whenever measured LRA is 0 or over 11): it then rides the gain over time and moves the music
// away from the distance the duck aimed at. One static gain from pass 1 instead: the loudness
// target, capped by the true-peak ceiling. Returns { gain, outputI, peakLimited } in dB / LUFS.
export const LOUDNESS_TOLERANCE = 0.5;
export function staticGain(m) {
  const i = Number(m.input_i), tp = Number(m.input_tp);
  if (!Number.isFinite(i) || !Number.isFinite(tp)) throw new Error(`loudnorm measured I=${m.input_i}, TP=${m.input_tp}`);
  const gain = +Math.min(LOUDNORM.I - i, LOUDNORM.TP - tp).toFixed(2);
  const outputI = +(i + gain).toFixed(2);
  return { gain, outputI, peakLimited: outputI < LOUDNORM.I - LOUDNESS_TOLERANCE };
}

// Peak-limited mix: the full gain to the target, then a lookahead limiter (alimiter on 4× oversampled
// audio, so it catches inter-sample peaks) LIMIT_MARGIN dB under the TP ceiling. It only acts on the
// few peaks over that line (TTS consonants, SFX hits), so the duck balance is kept. The limiter also
// takes some loudness off; limitGains re-aims from the measured output, at most LIMIT_PASSES times,
// never pushing more than MAX_LIMIT_DB past the static ceiling.
export const LIMIT_MARGIN = 0.5, MAX_LIMIT_DB = 6, LIMIT_PASSES = 3;
export function limitArgs(inWav, gainDb, totalSeconds, outWav) {
  const samples = Math.round(totalSeconds * 48000);
  const limit = +(10 ** ((LOUDNORM.TP - LIMIT_MARGIN) / 20)).toFixed(6);
  return ["-hide_banner", "-nostdin", "-v", "error", "-y", "-i", inWav, "-af",
    `volume=${gainDb}dB,aresample=192000,alimiter=limit=${limit}:attack=1:release=60:level=0:latency=1,aresample=48000,apad=whole_dur=${totalSeconds},atrim=end_sample=${samples}`,
    ...outputArgs(samples, totalSeconds, outWav)];
}

// Next gain of the limiter loop from the pass-1 measure m and the output measure out (both loudnorm
// JSON): { gain, done }. done when the output is within LOUDNESS_TOLERANCE of the target or the gain
// hit the cap (static ceiling gain + MAX_LIMIT_DB).
export function nextLimitGain(m, gain, out) {
  const cap = +(LOUDNORM.TP - Number(m.input_tp) + MAX_LIMIT_DB).toFixed(2);
  const miss = LOUDNORM.I - Number(out.input_i);
  if (Math.abs(miss) <= LOUDNESS_TOLERANCE || (miss > 0 && gain >= cap)) return { gain, done: true };
  return { gain: +Math.min(cap, gain + miss).toFixed(2), done: false };
}

export function gainArgs(inWav, gainDb, totalSeconds, outWav) {
  const samples = Math.round(totalSeconds * 48000);
  return ["-hide_banner", "-nostdin", "-v", "error", "-y", "-i", inWav, "-af", `volume=${gainDb}dB,apad=whole_dur=${totalSeconds},atrim=end_sample=${samples}`, ...outputArgs(samples, totalSeconds, outWav)];
}

const shellQuote = (a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, "'\\''")}'`);
const MEASURE = { encoding: "utf8", maxBuffer: 64 << 20 };

// onDuck receives { id, natural, target, reduction (wanted), got, passes, voiceDb, thresholdDb } per ducked carve bed.
export function main(argv = process.argv.slice(2), { spawn = spawnSync, log = console.log, err = console.error, onDuck = () => {} } = {}) {
  if (wantsHelp(argv)) { process.stdout.write(helpText(import.meta.url)); return 0; }
  const o = { dryRun: false, loudnorm: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") o.dryRun = true;
    else if (a === "--loudnorm") o.loudnorm = true;
    else if (a === "--html" || a === "--duration" || a === "--out" || a === "--base" || a === "--stems") {
      const v = argv[++i];
      if (v === undefined) { err(`audio-mix: ${a} needs a value`); return 2; }
      o[a.slice(2)] = v;
    } else { err(`audio-mix: unknown argument ${a}`); return 2; }
  }
  if (!o.html || !o.duration || !o.out) { err("audio-mix: --html, --duration and --out are required"); return 2; }
  const total = Number(o.duration);
  if (!Number.isFinite(total) || total <= 0) { err(`audio-mix: --duration must be a positive number, got ${o.duration}`); return 2; }
  const htmlPath = resolve(o.html);
  if (!existsSync(htmlPath)) { err(`audio-mix: html not found: ${htmlPath}`); return 2; }
  if (o.base && !existsSync(resolve(o.base))) { err(`audio-mix: --base not found: ${resolve(o.base)}`); return 2; }
  let tracks;
  try { tracks = parseTracks(readFileSync(htmlPath, "utf8"), dirname(htmlPath), o.base ? resolve(o.base) : undefined); } catch (e) { err(`audio-mix: ${e.message}`); return 2; }
  if (!tracks.length) { err(`audio-mix: no audible <audio>/<video> in ${htmlPath}`); return 2; }
  const missing = [...new Set(tracks.map((t) => t.src).filter((s) => !existsSync(s)))];
  if (missing.length) { err(`audio-mix: src not found:\n  ${missing.join("\n  ")}`); return 2; }
  const out = resolve(o.out);
  const stems = o.stems ? resolve(o.stems) : null;
  const run = (args, opts = { stdio: "inherit" }) => {
    const r = spawn("ffmpeg", args, opts);
    if (r.error) throw new Error(`cannot run ffmpeg: ${r.error.message}`);
    if (r.status !== 0) throw new Error(`ffmpeg exited ${r.status}`);
    return r;
  };
  const show = (args) => log(["ffmpeg", ...args].map(shellQuote).join(" "));
  const name = (t) => (t.id ? `#${t.id}` : t.src);
  // Work files (undocked mix, loudnorm input) stay on the output's disk: the system disk may be nearly full.
  let work = null;
  const workDir = () => {
    if (!work) { mkdirSync(dirname(out), { recursive: true }); work = mkdtempSync(join(dirname(out), ".audio-mix-")); }
    return work;
  };
  try {
    const thresholds = [];
    const beds = tracks.map((_, b) => b).filter((b) => tracks[b].carve?.enabled);
    const keyed = [];
    for (const b of beds) {
      const keys = carveKeys(tracks, b);
      if (!keys.length) { err(`audio-mix: ${name(tracks[b])}: data-fx-carve sources ${JSON.stringify(tracks[b].carve.sources)} match no track id or group; not ducked`); continue; }
      let voiceDb;
      try { voiceDb = parseMeanVolume(run(keyLevelArgs(tracks, keys), MEASURE).stderr); } catch (e) { throw new Error(`cannot measure the voice level for ${name(tracks[b])}: ${e.message}`); }
      if (!Number.isFinite(voiceDb)) { err(`audio-mix: WARN ${name(tracks[b])}: the voice keying it is silent; not ducked`); continue; }
      keyed.push({ b, voiceDb });
    }
    if (keyed.length) {
      // Natural distance: the same mix without ducking, measured like mix-balance.mjs; every trial
      // of the threshold search is measured the same way, on the post-duck stems.
      const dir = workDir();
      const { windows } = speechSpans(voiceIndices(tracks).map((i) => tracks[i]), total);
      const under = (th) => {
        run(buildArgs(tracks, total, join(dir, "trial.wav"), { thresholds: th, stems: dir }));
        return measureBalance({ voice: decodeMono(join(dir, "voice.wav"), spawn), music: decodeMono(join(dir, "music.wav"), spawn), windows }).under;
      };
      const natural = under([]);
      const at = (drop) => { const th = []; for (const { b, voiceDb } of keyed) th[b] = linear(thresholdAt(voiceDb, drop)); return th; };
      // All beds share one drop (one summed music stem can meet one target): aim at the largest wanted.
      const strengths = [...new Set(keyed.map(({ b }) => tracks[b].carve.strength))];
      if (strengths.length > 1) err(`audio-mix: WARN carve beds have different strengths (${strengths.join(", ")}); ducked together toward the largest target`);
      const aim = keyed.reduce((a, k) => (duckTarget(tracks[k.b].carve.strength) > duckTarget(tracks[a.b].carve.strength) ? k : a));
      const target = duckTarget(tracks[aim.b].carve.strength);
      const wanted = duckReduction(natural, tracks[aim.b].carve.strength);
      const fmt = (x) => (Number.isFinite(x) ? x.toFixed(1) : String(x));
      const found = wanted > 0 ? searchDrop(wanted, (drop) => under(at(drop)) - natural) : null;
      if (found?.drop != null) Object.assign(thresholds, at(found.drop));
      for (const { b, voiceDb } of keyed) {
        const thresholdDb = found?.drop != null ? thresholdAt(voiceDb, found.drop) : null;
        const how = !found ? " (not ducked)" : found.drop == null ? " (could not measure; not ducked)" : `, got ${fmt(found.got)} dB after ${found.passes} pass${found.passes > 1 ? "es" : ""}, threshold ${fmt(thresholdDb)} dBFS`;
        err(`audio-mix: ${found && !found.ok ? "WARN " : ""}duck ${name(tracks[b])}: natural ${fmt(natural)} dB, target ${fmt(target)} dB, wanted ${fmt(wanted)} dB${how}`);
        onDuck({ id: tracks[b].id, natural, target, reduction: wanted, got: found?.got ?? 0, passes: found?.passes ?? 0, voiceDb, thresholdDb });
      }
    }

    if (!o.loudnorm) {
      const args = buildArgs(tracks, total, out, { thresholds, stems });
      if (o.dryRun) { show(args); return 0; }
      if (stems) mkdirSync(stems, { recursive: true });
      run(args);
      return 0;
    }
    if (o.dryRun) {
      const mix = join(dirname(out), ".audio-mix-XXXXXX", "mix.wav");
      show(buildArgs(tracks, total, mix, { thresholds, stems }));
      show(loudnormPass1Args(mix));
      show(gainArgs(mix, "<min(-14-I, -1.5-TP)>", total, out));
      log("# đỉnh chặn mức tăng (-14-I > -1.5-TP): thay lệnh trên bằng limiter, đo lại và chỉnh tối đa 3 lượt");
      show(limitArgs(mix, "<-14-I>", total, out));
      return 0;
    }
    if (stems) mkdirSync(stems, { recursive: true });
    const mix = join(workDir(), "mix.wav");
    run(buildArgs(tracks, total, mix, { thresholds, stems }));
    const m = parseLoudnorm(run(loudnormPass1Args(mix), MEASURE).stderr);
    if (!Number.isFinite(Number(m.input_i))) { err("audio-mix: the mix is silent; loudnorm skipped"); renameSync(mix, out); return 0; }
    const g = staticGain(m);
    if (!g.peakLimited) { run(gainArgs(mix, g.gain, total, out)); return 0; }
    let gain = +(LOUDNORM.I - Number(m.input_i)).toFixed(2), got = null;
    for (let pass = 1; pass <= LIMIT_PASSES; pass++) {
      run(limitArgs(mix, gain, total, out));
      got = parseLoudnorm(run(loudnormPass1Args(out), MEASURE).stderr);
      const next = nextLimitGain(m, gain, got);
      if (next.done || pass === LIMIT_PASSES) break;
      gain = next.gain;
    }
    const I = Number(got.input_i), tp = Number(got.input_tp);
    err(`audio-mix: limiter: mix ${m.input_i} LUFS, đỉnh ${m.input_tp} dBTP; tăng ${gain} dB (tĩnh chỉ được ${g.gain} dB), chặn đỉnh ở ${LOUDNORM.TP - LIMIT_MARGIN} dBFS → ${I.toFixed(1)} LUFS, đỉnh ${tp.toFixed(1)} dBTP`);
    if (I < LOUDNORM.low || I > LOUDNORM.high) err(`audio-mix: WARN LOUDNESS ${I.toFixed(1)} LUFS ngoài ${LOUDNORM.low}…${LOUDNORM.high} sau limiter (đã chặn tối đa ${MAX_LIMIT_DB} dB trên trần tĩnh); hạ đỉnh của track gây đỉnh (SFX, giọng) rồi trộn lại`);
    if (tp > LOUDNORM.TP) err(`audio-mix: WARN TRUE_PEAK ${tp.toFixed(1)} dBTP trên trần ${LOUDNORM.TP} dBTP sau limiter`);
    return 0;
  } catch (e) {
    err(`audio-mix: ${e.message}`);
    return 1;
  } finally {
    if (work) rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
