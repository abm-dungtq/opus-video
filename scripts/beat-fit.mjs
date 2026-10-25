#!/usr/bin/env node
// beat-fit.mjs — put every cut between shots on a beat of the music, after the voice of the shot before
// has ended, and move pinned lines onto their beat. Proposes gateway ops; --apply sends them as one
// change (actor timing), undoable with gateway.mjs undo.
//   node beat-fit.mjs --project <dir> [--music <file>] [--tight] [--apply] [--base <n>] [--json]
//   node beat-fit.mjs --help | -h
// Grid: the same as B() of the composition skeleton and gateway derive, beat(n) = beat0 + n·beatLen from
// the music's <file>.beats.json: --music, else the first bed of project.json that has one (beat-grid.mjs
// <music> --write). beats[] is not used, so cuts and B() effects stay on one grid. A beats.json whose
// maxDriftMs is over half a frame prints a WARN: arrange-music.mjs gives an even grid.
// For each shot k ≥ 1, in order: voiceEnd = the last word end of the lines of shot k−1 (words from
// audio_meta.json or <file>.words.json; a line without words ends at start + duration).
//   cut_beat pinned (gateway op pin_beat)  → the cut is on beat(cut_beat)                     (pin)
//   --tight                                → the first beat at or after voiceEnd + 0.12 s     (voice)
//   otherwise                              → the first beat at or after max(voiceEnd + 0.12,
//                                            current start − beatLen/2), keeping a set pause  (voice)
//   shot k−1 has no line                   → the first beat at or after start − beatLen/2     (hold)
// A pinned cut that cuts into the voice is a WARN. Each cut is a resize_shot of shot k−1, applied in
// turn so later shots ripple. The lines of a shot with at_beat move (move_line) so their first word
// lands on beat(at_beat) before the cut after that shot is placed, so the cut follows the moved voice.
// A last pass WARNs any cut that still falls within 0.12 s of the voice before it.
// Prints `shot | cũ start | mới start | beat | lý do`; --json prints { ops, rows, warnings }.
// --apply: patch with --base (default: the current version); prints `APPLIED v<n>` and the undo line,
// and a WARN when DEMO.md records an approved animatic (visual_hash:), which must be made again.
// A project whose picture is built by code (capabilities.picture_from_code) is skipped with a WARN.
// Exit 0 done or nothing to do · 2 bad usage, no project.json, no beat grid · 3/5/8 from the gateway.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { load, r3 } from "./manifest.mjs";
import { readBeats } from "./timing.mjs";
import { lineWords } from "./captions-from-words.mjs";

export const GAP = 0.12;
const EPS = 1e-3;

// The beat grid of a project, chosen as gateway derive chooses it. Returns { grid, warnings, error }.
// --music naming another file than that bed is a WARN: B() and cues.mjs check use the bed's grid.
export function projectGrid(dir, m, music = null) {
  try {
    const bed = m.music.find((b) => existsSync(join(dir, `${b.file}.beats.json`)));
    const { grid, warnings } = readBeats(dir, music ?? bed?.file ?? null);
    if (!grid || !(grid.beatLen > 0)) return { grid: null, warnings, error: `không có lưới beat; chạy beat-grid.mjs <nhạc> --write` };
    if (music && bed && resolve(dir, music) !== resolve(dir, bed.file)) warnings.push(`--music ${music} khác nhạc nền ${bed.file} mà B() dùng; cắt cảnh sẽ lệch lưới của B()`);
    return { grid, warnings, error: null };
  } catch (e) { return { grid: null, warnings: [], error: e.message }; }
}

export const beatAt = (grid, n) => grid.beat0 + n * grid.beatLen;
// Index of the first beat at or after t.
export const nextBeat = (grid, t) => Math.max(0, Math.ceil((t - grid.beat0) / grid.beatLen - 1e-6));

export const audioMeta = (dir) => { try { return JSON.parse(readFileSync(join(dir, "audio_meta.json"), "utf8")); } catch { return null; } };
// Absolute end of the voice of a line (its last word, else start + duration).
const lineEnd = (dir, l, meta) => {
  const w = lineWords(dir, l, meta);
  return w.length ? Math.max(...w.map((x) => x.end)) : l.start + (l.duration ?? 0);
};
// Absolute onset of the first word of a line (its start when it has no words).
export const lineOnset = (dir, l, meta) => {
  const w = lineWords(dir, l, meta);
  return w.length ? Math.min(...w.map((x) => x.start)) : l.start;
};

// Ops that put the cuts and pinned lines on beats. applyOps: gateway's, passed in by the caller.
export function fitBeats(dir, m, grid, { tight = false, applyOps }) {
  let sim = structuredClone(m);
  const meta = audioMeta(dir), ops = [], rows = [], warnings = [];
  const apply = (op) => { ops.push(op); sim = applyOps(sim, [op]).next; };
  const voiceOf = (shot) => {
    let end = -Infinity, last = null;
    for (const l of sim.lines.filter((x) => x.shot === shot.id)) { const e = lineEnd(dir, l, meta); if (e > end) { end = e; last = l; } }
    return { end, last };
  };
  const pinLines = (shot) => {
    for (const id of sim.lines.filter((x) => x.shot === shot.id && x.at_beat != null).map((x) => x.id)) {
      const line = sim.lines.find((x) => x.id === id);
      const shift = beatAt(grid, line.at_beat) - lineOnset(dir, line, meta);
      if (Math.abs(shift) >= EPS) apply({ op: "move_line", id, start: r3(line.start + shift) });
    }
  };
  if (sim.shots.length) pinLines(sim.shots[0]);
  for (let k = 1; k < sim.shots.length; k++) {
    const prev = sim.shots[k - 1], cur = sim.shots[k], old = m.shots[k].start;
    const lines = sim.lines.filter((l) => l.shot === prev.id);
    const { end: voiceEnd, last } = voiceOf(prev);
    let n, reason;
    if (cur.cut_beat != null) { n = cur.cut_beat; reason = "pin"; }
    else if (lines.length) { n = nextBeat(grid, tight ? voiceEnd + GAP : Math.max(voiceEnd + GAP, cur.start - grid.beatLen / 2)); reason = "voice"; }
    else { n = nextBeat(grid, cur.start - grid.beatLen / 2); reason = "hold"; }
    const target = r3(beatAt(grid, n));
    if (last && target < voiceEnd + GAP - EPS) warnings.push(`cắt ${cur.id} ở beat ghim ${n} sẽ cắt lời ${last.id}`);
    if (target <= prev.start + EPS) { warnings.push(`${cur.id}: beat ${n} (${target}s) không sau đầu ${prev.id}; giữ nguyên`); rows.push({ shot: cur.id, old, start: cur.start, beat: null, reason }); }
    else {
      if (Math.abs(target - cur.start) >= EPS) apply({ op: "resize_shot", id: prev.id, duration: r3(target - prev.start) });
      rows.push({ shot: cur.id, old, start: target, beat: n, reason });
    }
    pinLines(sim.shots[k]);
  }
  for (let k = 1; k < sim.shots.length; k++) {
    const { end, last } = voiceOf(sim.shots[k - 1]);
    if (last && last.at_beat != null && sim.shots[k].start < end + GAP - EPS) warnings.push(`câu ${last.id} ghim beat ${last.at_beat} chồng lên cắt ${sim.shots[k].id}`);
  }
  return { ops, rows, warnings, next: sim };
}

export async function main(argv = process.argv.slice(2), { out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}) {
  if (wantsHelp(argv)) { out(helpText(import.meta.url)); return 0; }
  const usage = "usage: node beat-fit.mjs --project <dir> [--music <file>] [--tight] [--apply] [--base <n>] [--json]";
  const o = { project: null, music: null, tight: false, apply: false, base: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project" || a === "--music" || a === "--base") {
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) { err(`beat-fit: ${a} cần giá trị\n${usage}\n`); return 2; }
      o[a.slice(2)] = argv[++i];
    } else if (a === "--tight" || a === "--apply" || a === "--json") o[a.slice(2)] = true;
    else { err(`beat-fit: tham số lạ ${a}\n${usage}\n`); return 2; }
  }
  if (!o.project) { err(`beat-fit: thiếu --project\n${usage}\n`); return 2; }
  const dir = resolve(o.project);
  const m = load(dir);
  if (!m) { err("beat-fit cần project.json; chạy manifest-import.mjs trước\n"); return 2; }
  if (m.capabilities?.picture_from_code === true) { out("WARN beat-fit bỏ qua: hình dựng từ code, gateway không đổi được khung shot\n"); return 0; }
  const { grid, warnings: gw, error } = projectGrid(dir, m, o.music);
  if (!grid) { err(`beat-fit: ${error}\n`); return 2; }
  const gateway = await import("./gateway.mjs");
  const fit = fitBeats(dir, m, grid, { tight: o.tight, applyOps: gateway.applyOps });
  const warnings = [...gw, ...fit.warnings];
  if (grid.maxDriftMs > 1000 / m.fps / 2) warnings.unshift(`nhạc trôi ${grid.maxDriftMs}ms; chạy arrange-music.mjs để có lưới đều`);
  if (o.json) out(JSON.stringify({ ops: fit.ops, rows: fit.rows, warnings }, null, 2) + "\n");
  else {
    const lines = ["shot | cũ start | mới start | beat | lý do"];
    for (const r of fit.rows) lines.push(`${r.shot} | ${r.old.toFixed(3)} | ${r.start.toFixed(3)} | ${r.beat ?? "—"} | ${r.reason}`);
    for (const w of warnings) lines.push(`WARN ${w}`);
    out(lines.join("\n") + "\n");
  }
  if (!fit.ops.length) { if (!o.json) out("beat-fit: đã khớp beat\n"); return 0; }
  if (!o.apply) return 0;
  const base = o.base != null ? Number(o.base) : m.version;
  const r = gateway.patch(dir, { actor: "timing", base, ops: fit.ops, note: "beat-fit" });
  if (r.code) { err(`beat-fit: ${r.error}\n`); return r.code; }
  out(`APPLIED v${r.version}\nhoàn tác: gateway.mjs undo --project ${o.project} --base ${r.version}\n`);
  const demo = join(dir, "DEMO.md");
  if (existsSync(demo) && /^visual_hash:/m.test(readFileSync(demo, "utf8"))) out("WARN animatic đã duyệt; phải làm lại animatic (make-demo --animatic)\n");
  if (m.events?.some((e) => e.anchor)) out(`tiếp: cues.mjs place --project ${o.project} --apply (đặt lại SFX theo anchor)\n`);
  out(`tiếp: recipe-pack.mjs --project ${o.project} (PLAN.md vừa được ghi lại)\n`);
  return 0;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) main().then((c) => process.exit(c));
