#!/usr/bin/env node
// audio-mix.mjs — rebuild a composition's sound as one WAV with ffmpeg, from the static audio
// attributes in its HTML: every <audio> and every <video> without `muted` (data-volume="0" skipped).
// Reads data-start, data-duration, data-volume, data-media-start, data-playback-rate, data-audio-group.
// Ignores Web Audio work done by hyperframes-audio (data-fx-chain, data-automation, data-fx-carve:
// fades, ducking, volume lanes) and audio inside sub-composition files.
//   node audio-mix.mjs --html <file> --duration <seconds> --out <wav> [--dry-run]
//   node audio-mix.mjs --help | -h
// --dry-run prints the ffmpeg command without running it. Output: 48 kHz stereo WAV.
// Exit: 0 ok · 1 ffmpeg failed · 2 bad usage or a src file is missing.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
export function parseTracks(html, baseDir) {
  const flat = html.replace(/<!--[\s\S]*?-->/g, " ").replace(/\r?\n/g, " ");
  const tracks = [];
  for (const [tag, kind] of flat.matchAll(/<(audio|video)\b[^>]*>/gi)) {
    if (kind.toLowerCase() === "video" && hasFlag(tag, "muted")) continue;
    const src = attr(tag, "src");
    if (!src) continue;
    const volume = num(attr(tag, "data-volume"), 1);
    if (volume === 0) continue;
    tracks.push({
      src: resolve(baseDir, src),
      start: num(attr(tag, "data-start"), 0),
      duration: num(attr(tag, "data-duration"), null),
      volume,
      mediaStart: num(attr(tag, "data-media-start"), 0),
      rate: num(attr(tag, "data-playback-rate"), 1),
      group: attr(tag, "data-audio-group") ?? null,
    });
  }
  return tracks;
}

// atempo accepts 0.5..2 per instance; chain instances for rates outside that range.
function atempoChain(rate) {
  const parts = [];
  let r = rate;
  while (r > 2) { parts.push("atempo=2"); r /= 2; }
  while (r < 0.5) { parts.push("atempo=0.5"); r /= 0.5; }
  parts.push(`atempo=${+r.toFixed(6)}`);
  return parts;
}

export function buildArgs(tracks, totalSeconds, outWav) {
  if (!tracks.length) throw new Error("no audible tracks");
  const args = ["-hide_banner", "-v", "error", "-y"];
  for (const t of tracks) args.push("-i", t.src);
  const chains = tracks.map((t, i) => {
    const trim = [`start=${t.mediaStart}`];
    if (t.duration != null) trim.push(`duration=${+(t.duration * t.rate).toFixed(6)}`);
    const f = [`atrim=${trim.join(":")}`, "asetpts=PTS-STARTPTS"];
    if (t.rate !== 1) f.push(...atempoChain(t.rate));
    f.push(`volume=${t.volume}`, `adelay=${Math.round(t.start * 1000)}:all=1`, "aresample=48000");
    return `[${i}:a]${f.join(",")}[a${i}]`;
  });
  const labels = tracks.map((_, i) => `[a${i}]`).join("");
  chains.push(`${labels}amix=inputs=${tracks.length}:normalize=0,apad,atrim=duration=${totalSeconds}[out]`);
  args.push("-filter_complex", chains.join(";"), "-map", "[out]", "-ar", "48000", "-ac", "2", outWav);
  return args;
}

const shellQuote = (a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, "'\\''")}'`);

export function main(argv = process.argv.slice(2), { spawn = spawnSync, log = console.log, err = console.error } = {}) {
  if (wantsHelp(argv)) { process.stdout.write(helpText(import.meta.url)); return 0; }
  const o = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") o.dryRun = true;
    else if (a === "--html" || a === "--duration" || a === "--out") {
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
  const tracks = parseTracks(readFileSync(htmlPath, "utf8"), dirname(htmlPath));
  if (!tracks.length) { err(`audio-mix: no audible <audio>/<video> in ${htmlPath}`); return 2; }
  const missing = [...new Set(tracks.map((t) => t.src).filter((s) => !existsSync(s)))];
  if (missing.length) { err(`audio-mix: src not found:\n  ${missing.join("\n  ")}`); return 2; }
  const args = buildArgs(tracks, total, resolve(o.out));
  if (o.dryRun) { log(["ffmpeg", ...args].map(shellQuote).join(" ")); return 0; }
  const r = spawn("ffmpeg", args, { stdio: "inherit" });
  if (r.error) { err(`audio-mix: cannot run ffmpeg: ${r.error.message}`); return 1; }
  return r.status === 0 ? 0 : 1;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
