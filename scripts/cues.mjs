#!/usr/bin/env node
// cues.mjs — sound effects that follow what they mark: a word, a beat or a second. An event's anchor
// (project.json, manifest.mjs rules) says where its sound is heard; this places the event so the
// sound's first audible sample lands there, and places it again after timing changes.
//   node cues.mjs add   --project <dir> --sound <path> (--shot <id> --word "<phrase>" [--nth n] |
//                       --beat n | --abs t | --shot <id> --at t) [--vol v] [--label s] [--apply]
//   node cues.mjs place --project <dir> [--apply]
//   node cues.mjs check --project <dir> [--json]
//   node cues.mjs --help | -h
// Anchors: { word, nth, shot } the nth time the phrase is spoken in that shot (matched like W() of the
// skeleton, phraseHits in timing.mjs); { beat } beat0 + n·beatLen, the grid of B() and beat-fit.mjs;
// { abs } seconds. --shot --at is a plain offset in the shot (no anchor). The event starts at
// anchor − lead, lead being the silence at the head of the sound file (sfx-sync.mjs, cached in
// assets/sfx-onsets.json), recorded as anchor.lead; a start before 0 is clamped to 0 with a WARN.
// add: an add_event op (a studio event, so derive writes its <audio data-studio-sfx> tag).
// place: a move_event { keep_anchor: true } for each anchored event more than half a frame off.
// Without --apply both only print the ops; --apply sends them as one gateway change (actor timing).
// check: WARN for an anchored event more than a frame off ("chạy cues.mjs place --apply"), and for a
// shot whose cut_beat or a line whose at_beat is more than a frame off its beat ("chạy beat-fit.mjs
// --apply"); FAIL for an anchor that cannot be found or that falls after the end of the video, and for
// a sound whose onset cannot be measured. place skips a FAIL event, re-seats the others and exits 1.
// check-preflight --stage final runs check.
// Moving an event by hand (move_event without keep_anchor) drops its anchor; check leaves it alone.
// Exit 0 ok · 1 check or place found a FAIL · 2 bad usage, no project.json, anchor not found · 3/5/8 gateway.
import { existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { load, r3 } from "./manifest.mjs";
import { phraseHits } from "./timing.mjs";
import { lineWords } from "./captions-from-words.mjs";
import { leadCache } from "./sfx-sync.mjs";
import { audioMeta, beatAt, lineOnset, projectGrid } from "./beat-fit.mjs";

// Absolute second an anchor names → { t } or { error }.
export function resolveAnchor(anchor, m, grid, dir, meta = audioMeta(dir)) {
  if (anchor.word != null) {
    const nth = anchor.nth ?? 1;
    const words = m.lines.filter((l) => l.shot === anchor.shot).flatMap((l) => lineWords(dir, l, meta));
    const hit = phraseHits(words, anchor.word)[nth - 1];
    return hit ? { t: hit.start } : { error: `không thấy "${anchor.word}" lần ${nth} trong ${anchor.shot}` };
  }
  if (anchor.beat != null) return grid ? { t: beatAt(grid, anchor.beat) } : { error: `anchor beat ${anchor.beat}: không có lưới beat (beat-grid.mjs <nhạc> --write)` };
  return { t: anchor.abs };
}

const startOf = (m, e) => m.shots.find((s) => s.id === e.shot).start + e.offset;

// Lead of a sound file (seconds), through the shared onset cache. fallback when the file is missing.
function leads(dir, run) {
  const cache = leadCache(dir, run);
  return {
    of: (sound, fallback = 0) => (sound && existsSync(join(dir, sound)) ? cache.get(join(dir, sound)).lead : fallback),
    save: () => cache.save(),
  };
}

// Where every anchored event should start: [{ id, have, want, lead, clamped, error }].
export function placements(dir, m, { run = spawnSync, grid = undefined } = {}) {
  const g = grid !== undefined ? grid : projectGrid(dir, m).grid;
  const meta = audioMeta(dir), L = leads(dir, run), out = [];
  for (const e of m.events ?? []) {
    if (!e.anchor) continue;
    const r = resolveAnchor(e.anchor, m, g, dir, meta);
    if (r.error) { out.push({ id: e.id, error: r.error }); continue; }
    let lead;
    try { lead = r3(L.of(e.sound, e.anchor.lead ?? 0)); } catch (x) { out.push({ id: e.id, error: `không đo được đầu tiếng của ${e.sound}: ${x.message}` }); continue; }
    const want = r3(r.t - lead);
    if (Math.max(0, want) > m.duration + 1e-3) { out.push({ id: e.id, error: `mốc ${r3(r.t)}s nằm ngoài video (${m.duration}s)` }); continue; }
    out.push({ id: e.id, have: r3(startOf(m, e)), want: Math.max(0, want), lead, clamped: want < 0, anchor: e.anchor });
  }
  L.save();
  return out;
}

// Pure report for check and check-preflight: { fails: [text], warns: [text] }.
export function checkCues(dir, m, { run = spawnSync } = {}) {
  const fails = [], warns = [], frame = 1 / m.fps;
  const { grid } = projectGrid(dir, m);
  for (const p of placements(dir, m, { run, grid })) {
    if (p.error) fails.push(`${p.id}: ${p.error}`);
    else if (Math.abs(p.have - p.want) > frame + 1e-6) warns.push(`${p.id} lệch ${Math.round((p.have - p.want) * 1000)}ms so với anchor; chạy cues.mjs place --apply`);
  }
  if (grid) {
    for (const s of m.shots) if (s.cut_beat != null && Math.abs(s.start - beatAt(grid, s.cut_beat)) > frame + 1e-6) warns.push(`${s.id} lệch ghim beat ${s.cut_beat}; chạy beat-fit.mjs --apply`);
    const meta = audioMeta(dir);
    for (const l of m.lines) if (l.at_beat != null && Math.abs(lineOnset(dir, l, meta) - beatAt(grid, l.at_beat)) > frame + 1e-6) warns.push(`${l.id} lệch ghim beat ${l.at_beat}; chạy beat-fit.mjs --apply`);
  } else if (m.shots.some((s) => s.cut_beat != null) || m.lines.some((l) => l.at_beat != null)) warns.push("có ghim beat nhưng không có lưới beat (beat-grid.mjs <nhạc> --write)");
  return { fails, warns };
}

async function send(dir, m, ops, out, err) {
  const { patch } = await import("./gateway.mjs");
  const r = patch(dir, { actor: "timing", base: m.version, ops, note: "cues" });
  if (r.code) { err(`cues: ${r.error}\n`); return r.code; }
  out(`APPLIED v${r.version}\nhoàn tác: gateway.mjs undo --project ${dir} --base ${r.version}\n`);
  return 0;
}

const FLAGS = ["--project", "--sound", "--shot", "--word", "--nth", "--beat", "--abs", "--at", "--vol", "--label"];

export async function main(argv = process.argv.slice(2), { out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s), run = spawnSync } = {}) {
  if (wantsHelp(argv)) { out(helpText(import.meta.url)); return 0; }
  const usage = "usage: node cues.mjs add|place|check --project <dir> … (node cues.mjs --help)";
  const [cmd, ...rest] = argv;
  if (!["add", "place", "check"].includes(cmd)) { err(`cues: lệnh phải là add | place | check\n${usage}\n`); return 2; }
  const o = { apply: false, json: false };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (FLAGS.includes(a)) {
      if (rest[i + 1] == null || rest[i + 1].startsWith("--")) { err(`cues: ${a} cần giá trị\n${usage}\n`); return 2; }
      o[a.slice(2)] = rest[++i];
    } else if (a === "--apply" || a === "--json") o[a.slice(2)] = true;
    else { err(`cues: tham số lạ ${a}\n${usage}\n`); return 2; }
  }
  if (!o.project) { err(`cues: thiếu --project\n${usage}\n`); return 2; }
  const dir = resolve(o.project);
  const m = load(dir);
  if (!m) { err("cues cần project.json; chạy manifest-import.mjs trước\n"); return 2; }

  if (cmd === "check") {
    const r = checkCues(dir, m, { run });
    if (o.json) out(JSON.stringify(r, null, 2) + "\n");
    else out([...r.fails.map((x) => `FAIL ${x}`), ...r.warns.map((x) => `WARN ${x}`), r.fails.length ? "CUES FAIL" : "CUES OK"].join("\n") + "\n");
    return r.fails.length ? 1 : 0;
  }

  if (cmd === "place") {
    const ops = [];
    let failed = 0;
    for (const p of placements(dir, m, { run })) {
      if (p.error) { err(`FAIL ${p.id}: ${p.error}\n`); failed++; continue; }
      if (p.clamped) out(`WARN ${p.id}: lead lớn hơn thời điểm anchor, đặt ở 0s\n`);
      if (Math.abs(p.have - p.want) > 0.5 / m.fps) ops.push({ op: "move_event", id: p.id, start: p.want, keep_anchor: true, anchor: { ...p.anchor, lead: p.lead } });
    }
    if (!ops.length) { if (!failed) out("cues: mọi SFX đã đúng anchor\n"); return failed ? 1 : 0; }
    out(JSON.stringify(ops) + "\n");
    const code = o.apply ? await send(dir, m, ops, out, err) : 0;
    return code || (failed ? 1 : 0);
  }

  // add
  if (!o.sound) { err(`cues add: thiếu --sound\n${usage}\n`); return 2; }
  if (!existsSync(join(dir, o.sound))) { err(`cues add: không thấy ${o.sound} trong dự án\n`); return 2; }
  const num = (k, int) => { const v = Number(o[k]); return Number.isFinite(v) && v >= 0 && (!int || Number.isInteger(v)) ? v : null; };
  const forms = [o.word != null, o.beat != null, o.abs != null, o.at != null].filter(Boolean).length;
  if (forms !== 1) { err(`cues add: chọn đúng một trong --word, --beat, --abs, --at\n${usage}\n`); return 2; }
  if ((o.word != null || o.at != null) && !m.shots.some((s) => s.id === o.shot)) { err(`cues add: --word và --at cần --shot là id shot có thật\n`); return 2; }
  const extra = { ...(o.vol != null ? { volume: Number(o.vol) } : {}), ...(o.label != null ? { label: o.label } : {}) };
  let op;
  if (o.at != null) {
    const at = num("at");
    if (at == null) { err("cues add: --at phải là số giây ≥ 0\n"); return 2; }
    op = { op: "add_event", start: r3(m.shots.find((s) => s.id === o.shot).start + at), sound: o.sound, ...extra };
  } else {
    let anchor;
    if (o.word != null) {
      const nth = o.nth == null ? 1 : num("nth", true);
      if (!nth) { err("cues add: --nth phải là số nguyên ≥ 1\n"); return 2; }
      anchor = { word: o.word, nth, shot: o.shot };
    } else if (o.beat != null) {
      if (num("beat", true) == null) { err("cues add: --beat phải là số nguyên ≥ 0\n"); return 2; }
      anchor = { beat: num("beat", true) };
    } else {
      if (num("abs") == null) { err("cues add: --abs phải là số giây ≥ 0\n"); return 2; }
      anchor = { abs: num("abs") };
    }
    const r = resolveAnchor(anchor, m, projectGrid(dir, m).grid, dir);
    if (r.error) { err(`FAIL ${r.error}\n`); return 2; }
    const L = leads(dir, run);
    let lead;
    try { lead = r3(L.of(o.sound)); } catch (x) { err(`cues add: không đo được đầu tiếng của ${o.sound}: ${x.message}\n`); return 2; }
    L.save();
    if (r.t - lead > m.duration + 1e-3) { err(`FAIL mốc ${r3(r.t)}s nằm ngoài video (${m.duration}s)\n`); return 2; }
    let start = r3(r.t - lead);
    if (start < 0) { out(`WARN cue mới: lead lớn hơn thời điểm anchor, đặt ở 0s\n`); start = 0; }
    op = { op: "add_event", start, sound: o.sound, anchor: { ...anchor, lead }, ...extra };
  }
  out(JSON.stringify([op]) + "\n");
  return o.apply ? send(dir, m, [op], out, err) : 0;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) main().then((c) => process.exit(c));
