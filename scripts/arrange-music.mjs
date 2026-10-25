#!/usr/bin/env node
// arrange-music.mjs — re-arrange a raw music bed on its own beat grid so sections land on the beats the
// video needs. ElevenLabs does not keep the section lengths of a composition plan, so whole bars are
// copied from the raw track to target beats and joined with short crossfades that end on each downbeat.
// Adapted from ak:motion-video v1.3.0 arrange-music.mjs (MIT); see NOTICE.
//   node arrange-music.mjs --project <dir> [--plan assets/bgm/music-arrangement.json] [--dry]
//   node arrange-music.mjs --help | -h
// Plan (paths from <dir>):
//   { "source": "assets/bgm/raw/bgm-raw.mp3", "output": "assets/bgm/bgm.wav", "crossfade": 0.025,
//     "fadeOut": { "beat": 244, "seconds": 6.5 },
//     "segments": [ { "to": [0, 16], "from": 0, "role": "intro", "drop": false } ] }
//   to: target beats [a, b) in increasing order, never overlapping (a gap is a silent stop); from: the
//   source beat copied to target beat a. crossfade (default 0.025 s) and fadeOut are optional; "drop":
//   true marks target beat a as a drop.
// Grid: no bpm or beat0 in the plan. They come from <source>.beats.json (beat-grid.mjs <source>
//   --write, required). Cut points in the source are its measured beats[] (to the sample); the target
//   is the even grid beat0 + n·beatLen that B() uses. A piece whose source length differs from its
//   target length by more than 5 ms is resampled to fit (asetrate, see stretch below); a ratio off by
//   more than 0.5 % prints a WARN (audible pitch). A segment must end before the last measured beat.
// Output: WAV PCM 16-bit 48 kHz stereo (no mp3 encoder delay to shift the beats), and
//   <output>.beats.json { bpm, beat0, beatLen, beats, kick, drops, stability: null, arranged_from }
//   with kick ranges and drops of the source carried to their target beats.
// Prints one line per segment, `beats   0–16  (0.10s) ← source beat 0  intro`, then
//   `MUSIC <output> <duration>s`. --dry prints the table and writes nothing.
// Exit 0 done, 1 ffmpeg failed, 2 bad usage, bad plan or missing beats.json.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";

const SR = 48000, STRETCH_MIN = 0.005, DEFAULT_PLAN = "assets/bgm/music-arrangement.json";
const int = (v) => Number.isInteger(v) && v >= 0;

class PlanError extends Error {}

// Reads and checks the plan and the source grid. Returns { plan, file, source, output, xf, grid, segs }
// where each seg has its source cut points and target span in seconds and the stretch ratio r.
export function loadArrangement(project, planPath = DEFAULT_PLAN) {
  const file = resolve(project, planPath);
  if (!existsSync(file)) throw new PlanError(`không thấy plan ${file}`);
  let plan;
  try { plan = JSON.parse(readFileSync(file, "utf8")); } catch (e) { throw new PlanError(`${planPath} không phải JSON: ${e.message}`); }
  if (typeof plan.source !== "string" || typeof plan.output !== "string") throw new PlanError("plan cần source và output (đường dẫn từ dự án)");
  const xf = plan.crossfade ?? 0.025;
  if (!(typeof xf === "number" && xf > 0 && xf <= 0.5)) throw new PlanError("crossfade phải trong (0, 0.5] giây");
  if (plan.fadeOut != null && !(int(plan.fadeOut.beat) && plan.fadeOut.seconds > 0)) throw new PlanError("fadeOut cần { beat: số nguyên ≥ 0, seconds > 0 }");
  if (!Array.isArray(plan.segments) || !plan.segments.length) throw new PlanError("segments phải là mảng không rỗng");
  const source = resolve(project, plan.source), output = resolve(project, plan.output);
  if (!existsSync(source)) throw new PlanError(`không thấy nhạc nguồn ${source}`);
  const gridFile = `${source}.beats.json`;
  if (!existsSync(gridFile)) throw new PlanError(`thiếu ${gridFile}; chạy: node beat-grid.mjs ${plan.source} --write`);
  const grid = JSON.parse(readFileSync(gridFile, "utf8"));
  if (!Array.isArray(grid.beats) || !grid.beats.length || !(grid.beatLen > 0)) throw new PlanError(`${gridFile} không có beats[]; đo lại bằng beat-grid.mjs --write`);
  const { beats, beatLen, beat0 } = grid;
  const src = (n) => beats[n];
  const dst = (n) => beat0 + n * beatLen;
  let prevEnd = 0;
  const segs = plan.segments.map((s, i) => {
    const [a, b] = Array.isArray(s.to) ? s.to : [];
    if (!int(a) || !int(b) || a >= b) throw new PlanError(`segment ${i}: to phải là [a, b] số nguyên, a < b`);
    if (a < prevEnd) throw new PlanError(`segment ${i}: to [${a}, ${b}] chồng hoặc lùi so với segment trước (kết thúc ở ${prevEnd})`);
    if (!int(s.from)) throw new PlanError(`segment ${i}: from phải là số nguyên ≥ 0`);
    if (s.from + (b - a) >= beats.length) throw new PlanError(`segment ${i}: from ${s.from} + ${b - a} beat vượt beat cuối (${beats.length - 1}) của nguồn`);
    prevEnd = b;
    const s0 = src(s.from), s1 = src(s.from + b - a), d0 = dst(a), d1 = dst(b);
    const r = Math.abs((s1 - s0) - (d1 - d0)) > STRETCH_MIN ? (s1 - s0) / (d1 - d0) : 1;
    return { i, a, b, from: s.from, role: s.role ?? "", drop: s.drop === true, s0, s1, d0, d1, r };
  });
  return { plan, file, source, output, xf, grid, segs, dst };
}

// The filter graph. Each piece covers target [d0 − pre, d1]: it fades in during `pre` before its first
// downbeat and fades out during the crossfade before the next piece's downbeat. A first piece copied
// from source beat 0 takes the source's own lead-in before its downbeat; any other piece fades in over
// the crossfade only, and never reaches before the start of the source.
//
// stretch: a piece whose source span differs from its target span is resampled with
// asetrate=48000·r,aresample=48000, r = source/target length. This is exact to the sample, unlike
// atempo (which works in overlapping blocks and moves transients by milliseconds). The pitch shifts by
// the same ratio, ≤ 0.5 % for the slow tempo drift of generated music, which is not audible.
export function buildGraph({ xf, segs, fadeOut, dst }) {
  const FMT = `aresample=${SR},aformat=sample_fmts=fltp:channel_layouts=stereo`;
  const g = [`[0:a]${FMT},asplit=${segs.length}${segs.map((s) => `[s${s.i}]`).join("")}`];
  for (const s of segs) {
    const pre = Math.min(s.i === 0 && s.from === 0 ? s.d0 : Math.min(s.d0, xf), s.s0 / s.r);
    // Length of the piece once stretched; below STRETCH_MIN it can be shorter than the target span, so
    // the fade-out ends on the piece's own last sample.
    const start = s.s0 - pre * s.r, len = ((s.s1 - s.s0) + pre * s.r) / s.r;
    const stretch = s.r === 1 ? "" : `asetrate=${Math.round(SR * s.r)},aresample=${SR},`;
    g.push(`[s${s.i}]atrim=start=${start.toFixed(6)}:duration=${((s.s1 - s.s0) + pre * s.r).toFixed(6)},asetpts=PTS-STARTPTS,${stretch}` +
      `afade=t=in:d=${Math.max(pre, 0.001).toFixed(6)},afade=t=out:st=${(len - xf).toFixed(6)}:d=${xf},` +
      `adelay=delays=${Math.round((s.d0 - pre) * SR)}S:all=1[p${s.i}]`);
  }
  const end = segs.at(-1).d1;
  const fade = fadeOut ? `afade=t=out:st=${dst(fadeOut.beat).toFixed(6)}:d=${fadeOut.seconds},` : "";
  g.push(`${segs.map((s) => `[p${s.i}]`).join("")}amix=inputs=${segs.length}:normalize=0:dropout_transition=0,${fade}atrim=end=${end.toFixed(6)}[out]`);
  return g.join(";");
}

// Source kick ranges and drops carried to target beats; adjacent kick ranges merged.
export function targetGrid({ grid, segs, dst }, arrangedFrom) {
  const kick = [], drops = new Set();
  for (const s of segs) {
    const len = s.b - s.a;
    for (const [k0, k1] of grid.kick ?? []) {
      const lo = Math.max(k0, s.from), hi = Math.min(k1, s.from + len);
      if (lo < hi) kick.push([s.a + lo - s.from, s.a + hi - s.from]);
    }
    for (const d of grid.drops ?? []) if (d >= s.from && d < s.from + len) drops.add(s.a + d - s.from);
    if (s.drop) drops.add(s.a);
  }
  kick.sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const k of kick) {
    const last = merged.at(-1);
    if (last && k[0] <= last[1]) last[1] = Math.max(last[1], k[1]);
    else merged.push([...k]);
  }
  const n = segs.at(-1).b;
  return {
    bpm: grid.bpm, beat0: grid.beat0, beatLen: grid.beatLen,
    beats: Array.from({ length: n }, (_, i) => Math.round(dst(i) * 1e4) / 1e4),
    kick: merged, drops: [...drops].sort((x, y) => x - y), stability: null, arranged_from: arrangedFrom,
  };
}

export function main(argv = process.argv.slice(2), { out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s), run = spawnSync } = {}) {
  if (wantsHelp(argv)) { out(helpText(import.meta.url)); return 0; }
  const usage = "usage: node arrange-music.mjs --project <dir> [--plan assets/bgm/music-arrangement.json] [--dry]";
  const o = { project: null, plan: DEFAULT_PLAN, dry: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project" || a === "--plan") {
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) { err(`arrange-music: ${a} cần giá trị\n${usage}\n`); return 2; }
      o[a.slice(2)] = argv[++i];
    } else if (a === "--dry") o.dry = true;
    else { err(`arrange-music: tham số lạ ${a}\n${usage}\n`); return 2; }
  }
  if (!o.project) { err(`arrange-music: thiếu --project\n${usage}\n`); return 2; }
  const project = resolve(o.project);
  let arr;
  try { arr = loadArrangement(project, o.plan); } catch (e) {
    if (e instanceof PlanError) { err(`arrange-music: ${e.message}\n`); return 2; }
    throw e;
  }
  const lines = arr.segs.map((s) => `beats ${String(s.a).padStart(3)}–${String(s.b).padEnd(3)} (${s.d0.toFixed(2)}s) ← source beat ${s.from}  ${s.role}${s.r === 1 ? "" : `  stretch ×${s.r.toFixed(5)}`}`);
  out(lines.join("\n") + "\n");
  for (const s of arr.segs) if (Math.abs(s.r - 1) > 0.005) err(`WARN segment ${s.i}: kéo giãn ×${s.r.toFixed(4)}, lệch cao độ quá 0,5 %; chọn đoạn nguồn có tempo gần hơn\n`);
  const end = arr.segs.at(-1).d1;
  if (o.dry) { out(`DRY ${relative(project, arr.output)} ${end.toFixed(2)}s (không ghi file)\n`); return 0; }
  const r = run("ffmpeg", ["-hide_banner", "-nostdin", "-v", "error", "-y", "-i", arr.source, "-filter_complex", buildGraph({ ...arr, fadeOut: arr.plan.fadeOut }),
    "-map", "[out]", "-ar", String(SR), "-ac", "2", "-c:a", "pcm_s16le", arr.output], { encoding: "utf8" });
  if (r.error || r.status !== 0) { err(`arrange-music: ffmpeg lỗi: ${r.error?.message ?? String(r.stderr).trim()}\n`); return 1; }
  writeFileSync(`${arr.output}.beats.json`, JSON.stringify(targetGrid(arr, relative(project, arr.file)), null, 2) + "\n");
  out(`MUSIC ${relative(project, arr.output)} ${end.toFixed(2)}s\n`);
  return 0;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
