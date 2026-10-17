// manifest.mjs — project.json, the one manifest of a project: shots, voice lines, music, assets
// and the version counter. Only gateway.mjs writes it (and manifest-import.mjs creates it);
// everything else reads it through load(). Node built-ins only.
// Shape (schema "opus-video/project@1"):
//   { schema, title, fps, width, height, duration, html,
//     capabilities: { timing_markers, editable },
//     shots:  [{ id: "s<#>", name, start, end, transition_in, motion_note, assets: [path] }],
//     lines:  [{ id, shot, text, file, start, duration, gate: "pass"|"stale"|"unknown" }],
//     music:  [{ id, file, start, end, gain }],
//     assets: [{ path, kind }],
//     events: [{ id, shot, offset, sound?, label, volume?, studio? }],   optional
//     version, updated }
// An event is a sound effect tied to a shot: id names its <audio id> in the HTML, whose data-start
// the gateway writes as shot.start + offset, so the sound moves with its shot. sound is the src,
// volume (0–1) its data-volume; studio: true marks an event the gateway added (add_event), whose
// <audio data-studio-sfx> tag derive inserts and removes. A music bed's media_start is the second
// of its file played at start (a trimmed head); fade_in / fade_out are seconds of fade in the mix.
// Seconds are rounded to 3 decimals. Shots are sorted, back to back from 0, and the last shot's
// end is the duration. Paths are relative and stay inside the project.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const SCHEMA = "opus-video/project@1";
export const FILE = "project.json";
export const GATES = ["pass", "stale", "unknown"];
export const SHOT_ID = /^s\d+[A-Za-z]?$/;
const EPS = 1e-3;
export const r3 = (n) => Math.round(n * 1000) / 1000;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const insidePath = (p) => typeof p === "string" && p !== "" && !p.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(p) && !p.split(/[\\/]/).includes("..");

// Manifest → [error text]; [] means valid.
export function validate(m) {
  const errs = [];
  if (!m || typeof m !== "object") return ["project.json không phải object"];
  if (m.schema !== SCHEMA) errs.push(`schema phải là "${SCHEMA}"`);
  if (!Number.isInteger(m.version) || m.version < 1) errs.push("version phải là số nguyên ≥ 1");
  for (const k of ["fps", "width", "height"]) if (!isNum(m[k]) || m[k] <= 0) errs.push(`${k} phải là số dương`);
  if (!insidePath(m.html)) errs.push("html phải là đường dẫn tương đối trong dự án");
  if (!m.capabilities || typeof m.capabilities.editable !== "boolean" || typeof m.capabilities.timing_markers !== "boolean") errs.push("capabilities cần editable và timing_markers kiểu boolean");
  for (const k of ["shots", "lines", "music", "assets"]) if (!Array.isArray(m[k])) errs.push(`${k} phải là mảng`);
  if (errs.length) return errs;

  if (!m.shots.length) errs.push("cần ít nhất một shot");
  const ids = new Set();
  let prevEnd = 0;
  m.shots.forEach((s, i) => {
    const tag = s?.id ?? `shot #${i + 1}`;
    if (!SHOT_ID.test(String(s?.id ?? ""))) errs.push(`${tag}: id shot phải dạng s<#>`);
    else if (ids.has(s.id)) errs.push(`${s.id}: id shot bị trùng`);
    ids.add(s?.id);
    if (!isNum(s?.start) || !isNum(s?.end) || s.start < 0 || s.end <= s.start) { errs.push(`${tag}: cần 0 ≤ start < end`); return; }
    if (Math.abs(s.start - prevEnd) > EPS) errs.push(`${tag}: start ${s.start}s không nối tiếp shot trước (${r3(prevEnd)}s), có khoảng hở hoặc chồng lấn`);
    prevEnd = s.end;
    if (s.assets != null && (!Array.isArray(s.assets) || !s.assets.every(insidePath))) errs.push(`${tag}: assets phải là đường dẫn tương đối trong dự án`);
  });
  if (!isNum(m.duration) || (m.shots.length && Math.abs(m.duration - prevEnd) > EPS)) errs.push(`duration ${m.duration}s phải bằng end của shot cuối (${r3(prevEnd)}s)`);

  const lineIds = new Set();
  m.lines.forEach((l, i) => {
    const tag = l?.id ?? `line #${i + 1}`;
    if (!l?.id || typeof l.id !== "string") errs.push(`${tag}: line cần id`);
    else if (lineIds.has(l.id)) errs.push(`${l.id}: id line bị trùng`);
    lineIds.add(l?.id);
    if (!ids.has(l?.shot)) errs.push(`${tag}: shot "${l?.shot}" không tồn tại`);
    if (!isNum(l?.start) || l.start < 0) errs.push(`${tag}: start phải ≥ 0`);
    if (l?.duration != null && (!isNum(l.duration) || l.duration <= 0)) errs.push(`${tag}: duration phải là số dương`);
    if (!GATES.includes(l?.gate)) errs.push(`${tag}: gate phải là ${GATES.join(" | ")}`);
    if (l?.file != null && !insidePath(l.file)) errs.push(`${tag}: file phải là đường dẫn tương đối trong dự án`);
    if (typeof l?.text !== "string") errs.push(`${tag}: text phải là chuỗi`);
  });
  m.music.forEach((b, i) => {
    const tag = b?.id ?? `music #${i + 1}`;
    if (!insidePath(b?.file)) errs.push(`${tag}: file phải là đường dẫn tương đối trong dự án`);
    if (!isNum(b?.gain) || b.gain < 0 || b.gain > 1) errs.push(`${tag}: gain phải trong 0–1`);
    if (!isNum(b?.start) || b.start < 0 || (b.end != null && (!isNum(b.end) || b.end <= b.start))) errs.push(`${tag}: cần 0 ≤ start < end`);
    if (b?.media_start != null && (!isNum(b.media_start) || b.media_start < 0)) errs.push(`${tag}: media_start phải ≥ 0`);
    const fadeIn = b?.fade_in != null && (!isNum(b.fade_in) || b.fade_in < 0) ? (errs.push(`${tag}: fade_in phải ≥ 0`), null) : b?.fade_in ?? 0;
    const fadeOut = b?.fade_out != null && (!isNum(b.fade_out) || b.fade_out < 0) ? (errs.push(`${tag}: fade_out phải ≥ 0`), null) : b?.fade_out ?? 0;
    if (fadeIn != null && fadeOut != null && isNum(b?.start) && fadeIn + fadeOut > (b.end ?? m.duration) - b.start + EPS) errs.push(`${tag}: fade_in + fade_out dài hơn khối nhạc`);
  });
  m.assets.forEach((a, i) => { if (!insidePath(a?.path)) errs.push(`asset #${i + 1}: path phải là đường dẫn tương đối trong dự án`); });
  if (m.events != null) {
    if (!Array.isArray(m.events)) { errs.push("events phải là mảng"); return errs; }
    const evIds = new Set();
    const shotOf = new Map(m.shots.map((s) => [s.id, s]));
    m.events.forEach((e, i) => {
      const tag = e?.id ?? `event #${i + 1}`;
      if (!e?.id || typeof e.id !== "string") errs.push(`${tag}: sự kiện cần id (id của thẻ <audio>)`);
      else if (evIds.has(e.id)) errs.push(`${e.id}: id sự kiện bị trùng`);
      else if (lineIds.has(e.id)) errs.push(`${e.id}: id sự kiện trùng id câu thoại`);
      evIds.add(e?.id);
      const s = shotOf.get(e?.shot);
      if (!s) errs.push(`${tag}: shot "${e?.shot}" không tồn tại`);
      if (!isNum(e?.offset)) errs.push(`${tag}: offset phải là số giây`);
      else if (s && s.start + e.offset < -EPS) errs.push(`${tag}: thời điểm ${r3(s.start + e.offset)}s trước 0s`);
      if (e?.sound != null && !insidePath(e.sound)) errs.push(`${tag}: sound phải là đường dẫn tương đối trong dự án`);
      if (typeof e?.label !== "string") errs.push(`${tag}: label phải là chuỗi`);
      if (e?.volume != null && (!isNum(e.volume) || e.volume < 0 || e.volume > 1)) errs.push(`${tag}: volume phải trong 0–1`);
      if (e?.studio != null && typeof e.studio !== "boolean") errs.push(`${tag}: studio phải là boolean`);
    });
  }
  return errs;
}

// <dir>/project.json → manifest, or null when the file is missing. Throws on unreadable JSON.
export function load(dir) {
  const f = join(resolve(dir), FILE);
  if (!existsSync(f)) return null;
  return JSON.parse(readFileSync(f, "utf8"));
}

// Writes <dir>/project.json through a temp file and a rename, so a reader never sees half a file.
export function save(dir, m) {
  const f = join(resolve(dir), FILE);
  const tmp = `${f}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(m, null, 2) + "\n");
  renameSync(tmp, f);
}
