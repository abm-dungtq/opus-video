#!/usr/bin/env node
// audio-mix.mjs — rebuild a composition's sound as one WAV with ffmpeg, from the static audio
// attributes in its HTML: every <audio> and every <video> without `muted` (data-volume="0" skipped).
// Reads data-start, data-duration, data-volume, data-media-start, data-playback-rate,
// data-audio-group and data-fx-carve. Ignores data-fx-chain, data-automation and audio inside
// sub-composition files (render-final keeps the HyperFrames mix for those).
//   node audio-mix.mjs --html <file> --duration <seconds> --out <wav> [--base <project dir>]
//                      [--loudnorm] [--stems <dir>] [--dry-run]
//   node audio-mix.mjs --help | -h
// A src resolves from the HTML file's folder; with --base, a src missing there falls back to that
// directory (HyperFrames resolves compositions/*.html paths from the project root).
// data-fx-carve='{"enabled":true,"sources":["voiceover"],"strength":0.8}' on a bed (music): the bed
//   is ducked by ffmpeg sidechaincompress keyed by the sum of its sources (each source matches a
//   track id or a data-audio-group name). Depth D = 2 + 6*strength dB: the threshold sits D dB
//   under the RMS level of the key tracks, measured once with volumedetect (never below -50 dBFS);
//   ratio 20, attack 15 ms, release 350 ms. Malformed data-fx-carve JSON: exit 2.
// --loudnorm: two-pass loudnorm of the mix to -14 LUFS, -1.5 dBTP, LRA 11 (linear), through a
//   work WAV in a temp folder next to --out (removed afterwards).
// --stems <dir>: also writes <dir>/voice.wav (tracks with id vo-*, group voiceover, or a carve
//   source) and <dir>/music.wav (beds: carve on, group music, or a src under bgm/; after ducking),
//   each only when such tracks exist, same length as the mix, before --loudnorm.
// --dry-run prints the ffmpeg commands without writing anything (the voice level of a ducked bed
// is still measured). Every output: 48 kHz stereo WAV, capped at the expected size (sample-count
// trim, -t and -fs) so a misbehaving filter graph cannot fill the disk.
// Exit: 0 ok · 1 ffmpeg failed · 2 bad usage, a src file is missing or data-fx-carve is not JSON.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
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
export const isVoice = (t) => Boolean(t.id && t.id.startsWith("vo-")) || t.group === VOICE_GROUP;
export const isBed = (t) => Boolean(t.carve?.enabled) || t.group === "music" || /(?:^|[\\/])bgm[\\/]/.test(t.src);
// Indices of the tracks that key the duck of tracks[bed]: ids or group names listed in its carve sources.
export function carveKeys(tracks, bed) {
  const c = tracks[bed].carve;
  if (!c?.enabled) return [];
  return tracks.map((t, i) => i).filter((i) => i !== bed && (c.sources.includes(tracks[i].id) || (tracks[i].group != null && c.sources.includes(tracks[i].group))));
}

// Assumption: approximates the level part of HyperFrames' carve (carveProfile duckDb) with a fixed
// depth D = 2 + 6*strength dB under the key's mean RMS; the multi-band EQ of carve is not reproduced.
// The voice level is one mean over the whole key, so a quiet tail would sit near or under the
// threshold; the threshold never goes below CARVE_FLOOR_DB, so a near-silent key cannot make every
// breath duck the bed. Returns the linear threshold for sidechaincompress (0..1).
export const CARVE_FLOOR_DB = -50;
export const carveDepth = (strength) => 2 + 6 * strength;
export function carveThreshold(voiceDb, strength) {
  const db = Number.isFinite(voiceDb) ? voiceDb - carveDepth(strength) : CARVE_FLOOR_DB;
  return +(10 ** (Math.min(0, Math.max(CARVE_FLOOR_DB, db)) / 20)).toFixed(6);
}

export const LOUDNORM = { I: -14, TP: -1.5, LRA: 11 };
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

// Trim, tempo and volume of one track (input i), without placing it on the timeline.
function trackFilters(t) {
  const trim = [`start=${t.mediaStart}`];
  if (t.duration != null) trim.push(`duration=${+(t.duration * t.rate).toFixed(6)}`);
  const f = [`atrim=${trim.join(":")}`, "asetpts=PTS-STARTPTS"];
  if (t.rate !== 1) f.push(...atempoChain(t.rate));
  f.push(`volume=${t.volume}`);
  return f;
}

const outputArgs = (samples, totalSeconds, out) => {
  const maxBytes = samples * 2 * 2 + (1 << 20); // 16-bit stereo PCM + 1 MB for the WAV header
  return ["-ar", "48000", "-ac", "2", "-t", String(totalSeconds), "-fs", String(maxBytes), out];
};

// keyDb[i]: measured RMS (dBFS) of the key of bed i (see keyLevelArgs); a bed with keys but no
// level ducks at the floor threshold. stems: directory for voice.wav / music.wav, or null.
export function buildArgs(tracks, totalSeconds, outWav, { keyDb = [], stems = null } = {}) {
  if (!tracks.length) throw new Error("no audible tracks");
  const idx = tracks.map((_, i) => i);
  const keys = idx.map((i) => carveKeys(tracks, i));
  const ducked = idx.filter((i) => keys[i].length);
  const voice = stems ? idx.filter((i) => isVoice(tracks[i]) || ducked.some((b) => keys[b].includes(i))) : [];
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
    const threshold = carveThreshold(keyDb[b], tracks[b].carve.strength);
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

export function loudnormPass2Args(inWav, m, totalSeconds, outWav) {
  const samples = Math.round(totalSeconds * 48000);
  const f = `${LOUDNORM_BASE}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  // loudnorm resamples to 192 kHz internally: back to 48 kHz, then the same sample-count bound.
  return ["-hide_banner", "-nostdin", "-v", "error", "-y", "-i", inWav, "-af", `${f},aresample=48000,apad=whole_dur=${totalSeconds},atrim=end_sample=${samples}`, ...outputArgs(samples, totalSeconds, outWav)];
}

const shellQuote = (a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, "'\\''")}'`);
const MEASURE = { encoding: "utf8", maxBuffer: 64 << 20 };

export function main(argv = process.argv.slice(2), { spawn = spawnSync, log = console.log, err = console.error } = {}) {
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

  // Voice level of each ducked bed's key, measured once before the mix.
  const keyDb = [];
  for (let b = 0; b < tracks.length; b++) {
    if (!tracks[b].carve?.enabled) continue;
    const keys = carveKeys(tracks, b);
    if (!keys.length) { err(`audio-mix: ${tracks[b].id ?? tracks[b].src}: data-fx-carve sources ${JSON.stringify(tracks[b].carve.sources)} match no track id or group; not ducked`); continue; }
    const r = spawn("ffmpeg", keyLevelArgs(tracks, keys), MEASURE);
    if (r.error) { err(`audio-mix: cannot run ffmpeg: ${r.error.message}`); return 1; }
    try {
      if (r.status !== 0) throw new Error(`ffmpeg exited ${r.status}`);
      keyDb[b] = parseMeanVolume(r.stderr);
    } catch (e) { err(`audio-mix: cannot measure the voice level for ${tracks[b].id ?? tracks[b].src}: ${e.message}`); return 1; }
  }

  const run = (args, opts = { stdio: "inherit" }) => {
    const r = spawn("ffmpeg", args, opts);
    if (r.error) throw new Error(`cannot run ffmpeg: ${r.error.message}`);
    if (r.status !== 0) throw new Error(`ffmpeg exited ${r.status}`);
    return r;
  };
  const show = (args) => log(["ffmpeg", ...args].map(shellQuote).join(" "));
  if (!o.loudnorm) {
    const args = buildArgs(tracks, total, out, { keyDb, stems });
    if (o.dryRun) { show(args); return 0; }
    if (stems) mkdirSync(stems, { recursive: true });
    try { run(args); } catch (e) { err(`audio-mix: ${e.message}`); return 1; }
    return 0;
  }
  if (o.dryRun) {
    const mix = join(dirname(out), ".audio-mix-XXXXXX", "mix.wav");
    show(buildArgs(tracks, total, mix, { keyDb, stems }));
    show(loudnormPass1Args(mix));
    show(loudnormPass2Args(mix, { input_i: "<I>", input_tp: "<TP>", input_lra: "<LRA>", input_thresh: "<thresh>", target_offset: "<offset>" }, total, out));
    return 0;
  }
  // The work WAV stays on the output's disk: the system disk may be nearly full.
  mkdirSync(dirname(out), { recursive: true });
  if (stems) mkdirSync(stems, { recursive: true });
  const work = mkdtempSync(join(dirname(out), ".audio-mix-"));
  try {
    const mix = join(work, "mix.wav");
    run(buildArgs(tracks, total, mix, { keyDb, stems }));
    const m = parseLoudnorm(run(loudnormPass1Args(mix), MEASURE).stderr);
    if (!Number.isFinite(Number(m.input_i))) { err("audio-mix: the mix is silent; loudnorm skipped"); renameSync(mix, out); return 0; }
    run(loudnormPass2Args(mix, m, total, out));
    return 0;
  } catch (e) {
    err(`audio-mix: ${e.message}`);
    return 1;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
