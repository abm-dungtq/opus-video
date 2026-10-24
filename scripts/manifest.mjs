// manifest.mjs — project.json, the one manifest of a project: shots, voice lines, music, assets
// and the version counter. Only gateway.mjs writes it (and manifest-import.mjs creates it);
// everything else reads it through load(). Node built-ins only.
// Shape (schema "opus-video/project@1"):
//   { schema, title, fps, width, height, duration, html,
//     capabilities: { timing_markers, editable, picture_from_code? },
//     shots:  [{ id: "s<#>", name, start, end, transition_in, motion_note, assets: [path] }],
//     lines:  [{ id, shot, text, file, start, duration, gate: "pass"|"stale"|"unknown", speaker? }],
//     music:  [{ id, file, start, end, gain }],
//     assets: [{ path, kind }],
//     events: [{ id, shot, offset, sound?, label, volume?, studio? }],   optional
//     workflow_mode: "dao-dien"|"nhanh"|"tu-nhac"|"timeline",             optional
//     scenes: [{ id: "c<#>", label, shots: [shot id] }],                   optional
//     version, updated }
// An event is a sound effect tied to a shot: id names its <audio id> in the HTML, whose data-start
// the gateway writes as shot.start + offset, so the sound moves with its shot. sound is the src,
// volume (0–1) its data-volume; studio: true marks an event the gateway added (add_event), whose
// <audio data-studio-sfx> tag derive inserts and removes. A music bed's media_start is the second
// of its file played at start (a trimmed head); fade_in / fade_out are seconds of fade in the mix.
// A line's speaker (optional) is the cast role id voicing it (scenes/roles.json of a series episode).
// scenes group shots into the script's scenes (Studio reviews and rebuilds one group at a time):
// each shot is in at most one scene, and listing every scene's shots in order follows the shot
// order. capabilities.picture_from_code marks a project whose picture is built by code from the
// TIMING data (index.html calls buildFilm): its shot windows follow the voice, so the gateway
// refuses resize_shot, add_shot and remove_shot there and only moving a line is allowed.
// workflow_mode is how the project is run (the director leads, quick template, cut to the music,
// or timeline editing); only the gateway op set_workflow_mode writes it.
// Seconds are rounded to 3 decimals. Shots are sorted, back to back from 0, and the last shot's
// end is the duration. Paths are relative and stay inside the project.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const SCHEMA = "opus-video/project@1";
export const FILE = "project.json";
export const GATES = ["pass", "stale", "unknown"];
export const SHOT_ID = /^s\d+[A-Za-z]?$/;
export const WORKFLOW_MODES = Object.freeze(["dao-dien", "nhanh", "tu-nhac", "timeline"]);
export const SPEAKER = /^[a-z0-9][a-z0-9-]{0,40}$/;
export const SCENE_ID = /^c\d+$/;
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
  else if (m.capabilities.picture_from_code != null && typeof m.capabilities.picture_from_code !== "boolean") errs.push("capabilities.picture_from_code phải là boolean");
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
    if (l?.speaker != null && (typeof l.speaker !== "string" || !SPEAKER.test(l.speaker))) errs.push(`${tag}: speaker phải là id vai (chữ thường, số, gạch nối)`);
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
  if (m.scenes != null) errs.push(...validateScenes(m.scenes, m.shots));
  m.assets.forEach((a, i) => { if (!insidePath(a?.path)) errs.push(`asset #${i + 1}: path phải là đường dẫn tương đối trong dự án`); });
  if (m.workflow_mode != null && !WORKFLOW_MODES.includes(m.workflow_mode)) errs.push(`workflow_mode phải là một trong ${WORKFLOW_MODES.join(", ")}`);
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

// scenes + shots → [error text]; [] means valid. Shared by validate and the gateway's set_scenes.
export function validateScenes(scenes, shots) {
  if (!Array.isArray(scenes)) return ["scenes phải là mảng"];
  const errs = [];
  const order = new Map((shots ?? []).map((s, i) => [s?.id, i]));
  const ids = new Set();
  const owner = new Map();
  let last = -1;
  scenes.forEach((c, i) => {
    const tag = c?.id ?? `cảnh #${i + 1}`;
    if (!SCENE_ID.test(String(c?.id ?? ""))) errs.push(`${tag}: id cảnh phải dạng c<#>`);
    else if (ids.has(c.id)) errs.push(`${c.id}: id cảnh bị trùng`);
    ids.add(c?.id);
    if (typeof c?.label !== "string") errs.push(`${tag}: label phải là chuỗi`);
    if (!Array.isArray(c?.shots) || !c.shots.length) { errs.push(`${tag}: shots phải là mảng id shot không rỗng`); return; }
    for (const id of c.shots) {
      if (!order.has(id)) { errs.push(`${tag}: shot "${id}" không tồn tại`); continue; }
      if (owner.has(id)) { errs.push(`${tag}: shot ${id} đã thuộc ${owner.get(id)}`); continue; }
      owner.set(id, tag);
      if (order.get(id) < last) errs.push(`${tag}: shot ${id} lệch thứ tự shot (cảnh và shot trong cảnh phải theo thứ tự thời gian)`);
      last = Math.max(last, order.get(id));
    }
  });
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

// ── Series declaration ────────────────────────────────────────────────────────────────────────
// A series folder (shared cast, voices, backgrounds and tools of many episodes) holds
// studio-series.json: what Studio may run there and where it may read and write. Every path is
// relative to the series folder; {char} is a checked character id, {N} / {NN} the episode number,
// and a tool's `writes` may also start with {project} (the episode) or {root} (Studio's root).
// Shape (schema "opus-video/series@1"):
//   { schema, name, characters?, voices?: { <key>: path }, read?: [path],
//     writable?: { <key>: path }, episode?: { tool, name }, delivery_dir?, drive?: { account, folder },
//     image_styles?: { <kind>: prompt },
//     tools: { <name>: { file, flags?: { "--flag": type }, positional?: type, writes?: [path], timeout_s? } } }
// Flag types: bool, int, number, id, word, text, range, slot, path:read, path:write, project,
// root; a trailing * lets the flag (or the positional list) repeat.
export const SERIES_FILE = "studio-series.json";
export const SERIES_SCHEMA = "opus-video/series@1";
export const SERIES_FLAG_TYPES = Object.freeze(["bool", "int", "number", "id", "word", "text", "range", "slot", "path:read", "path:write", "project", "root"]);
const SERIES_TOOL = /^[a-z][a-z0-9-]{0,40}$/;
const SERIES_KEY = /^[a-z][a-z0-9_-]{0,40}$/;
const SERIES_FLAG = /^--[a-z][a-z0-9-]{0,40}$/;
const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);

// A series-relative path template → why it is refused, or null. vars: the placeholders allowed
// anywhere; lead: those allowed only as the whole first segment.
function seriesPathProblem(p, vars, lead = []) {
  if (typeof p !== "string" || !p.trim()) return "cần một đường dẫn";
  if (p.startsWith("/") || /^[A-Za-z]:/.test(p) || p.includes("\\")) return "phải là đường tương đối trong thư mục series";
  const parts = p.split("/");
  for (const [i, seg] of parts.entries()) {
    if (seg === "" || seg === "." || seg === "..") return "không được có đoạn rỗng, '.' hay '..'";
    if (seg.startsWith(".")) return "không được có đoạn bắt đầu bằng dấu chấm";
    for (const m of seg.matchAll(/\{([^}]*)\}/g)) {
      if (lead.includes(m[1])) { if (i !== 0 || seg !== m[0]) return `{${m[1]}} chỉ đứng ở đầu đường`; }
      else if (!vars.includes(m[1])) return `không biết chỗ thay {${m[1]}}`;
    }
  }
  return null;
}
const flagTypeOk = (t) => typeof t === "string" && SERIES_FLAG_TYPES.includes(t.replace(/\*$/, ""));

// studio-series.json → [error text]; [] means valid.
export function validateSeries(s) {
  if (!isObj(s)) return ["studio-series.json phải là một object"];
  const errs = [];
  const path = (where, p, vars = ["char"], lead = []) => { const why = seriesPathProblem(p, vars, lead); if (why) errs.push(`${where}: ${why}`); };
  if (s.schema !== SERIES_SCHEMA) errs.push(`schema phải là ${SERIES_SCHEMA}`);
  if (typeof s.name !== "string" || !s.name.trim() || s.name.length > 80) errs.push("thiếu name (tên series, tối đa 80 ký tự)");
  if (s.characters !== undefined) path("characters", s.characters, []);
  if (s.voices !== undefined) {
    if (!isObj(s.voices)) errs.push("voices phải là object { khóa: đường }");
    else for (const [k, v] of Object.entries(s.voices)) path(`voices.${k}`, v, []);
  }
  if (s.read !== undefined) {
    if (!Array.isArray(s.read)) errs.push("read phải là mảng đường");
    else s.read.forEach((p, i) => path(`read[${i}]`, p, []));
  }
  if (s.writable !== undefined) {
    if (!isObj(s.writable)) errs.push("writable phải là object { khóa: đường }");
    else for (const [k, v] of Object.entries(s.writable)) {
      if (!SERIES_KEY.test(k)) errs.push(`writable: khóa "${k}" không hợp lệ`);
      path(`writable.${k}`, v);
    }
  }
  if (s.delivery_dir !== undefined) path("delivery_dir", s.delivery_dir, ["N", "NN"]);
  if (s.drive !== undefined && !(isObj(s.drive) && typeof s.drive.account === "string" && /^[^@\s]+@[^@\s]+$/.test(s.drive.account) && typeof s.drive.folder === "string" && s.drive.folder.trim()))
    errs.push("drive phải là { account: email, folder: tên thư mục }");
  if (s.image_styles !== undefined) {
    if (!isObj(s.image_styles)) errs.push("image_styles phải là object { loại: prompt }");
    else for (const [k, v] of Object.entries(s.image_styles)) {
      if (!SERIES_KEY.test(k)) errs.push(`image_styles: loại "${k}" không hợp lệ`);
      if (typeof v !== "string" || !v.trim()) errs.push(`image_styles.${k}: cần prompt`);
    }
  }
  if (!isObj(s.tools) || !Object.keys(s.tools).length) errs.push("thiếu tools (ít nhất một công cụ)");
  else for (const [name, t] of Object.entries(s.tools)) {
    const tag = `tools.${name}`;
    if (!SERIES_TOOL.test(name)) errs.push(`${tag}: tên công cụ phải khớp ${SERIES_TOOL}`);
    if (!isObj(t)) { errs.push(`${tag}: phải là object`); continue; }
    path(`${tag}.file`, t.file);
    if (typeof t.file === "string" && !t.file.endsWith(".mjs")) errs.push(`${tag}.file: phải là file .mjs`);
    if (t.flags !== undefined) {
      if (!isObj(t.flags)) errs.push(`${tag}.flags phải là object { "--cờ": kiểu }`);
      else for (const [f, type] of Object.entries(t.flags)) {
        if (!SERIES_FLAG.test(f)) errs.push(`${tag}: cờ "${f}" sai dạng (--chữ-thường)`);
        if (!flagTypeOk(type)) errs.push(`${tag}: cờ ${f} có kiểu lạ "${type}" (được: ${SERIES_FLAG_TYPES.join(", ")}, thêm * để lặp)`);
      }
    }
    if (t.positional !== undefined && !flagTypeOk(t.positional)) errs.push(`${tag}.positional: kiểu lạ "${t.positional}"`);
    if (t.writes !== undefined) {
      if (!Array.isArray(t.writes)) errs.push(`${tag}.writes phải là mảng đường`);
      else t.writes.forEach((p, i) => path(`${tag}.writes[${i}]`, p, ["char"], ["project", "root"]));
    }
    if (t.timeout_s !== undefined && !(Number.isInteger(t.timeout_s) && t.timeout_s >= 1 && t.timeout_s <= 3600)) errs.push(`${tag}.timeout_s phải là số nguyên 1–3600`);
  }
  if (s.episode !== undefined) {
    if (!isObj(s.episode) || typeof s.episode.tool !== "string" || typeof s.episode.name !== "string") errs.push("episode phải là { tool, name }");
    else {
      if (isObj(s.tools) && !s.tools[s.episode.tool]) errs.push(`episode.tool: không có công cụ "${s.episode.tool}" trong tools`);
      if (!/^[A-Za-z0-9._-]*\{NN?\}[A-Za-z0-9._-]*$/.test(s.episode.name)) errs.push("episode.name: một tên thư mục có {N} hoặc {NN}, ví dụ a-{NN}");
    }
  }
  return errs;
}

// The BRIEF.md frontmatter key `series:`, else the line "- Thư mục series: <path>" under
// "## series_bible" (older episodes) → the series folder, absolute; null without one or when the
// folder holds no studio-series.json. A relative path is taken from the project folder.
export function seriesDirOf(projectDir) {
  const base = resolve(projectDir);
  let text;
  try { text = readFileSync(join(base, "BRIEF.md"), "utf8"); } catch { return null; }
  let p = null;
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const key = fm?.[1].match(/^series:\s*(.*?)\s*(?:\s#.*)?$/m);
  if (key?.[1]) p = key[1].replace(/^["']|["']$/g, "");
  if (!p) {
    const sec = text.split(/^##\s+/m).find((x) => /^series_bible\s*$/m.test(x.split(/\r?\n/)[0]));
    p = sec?.match(/^\s*-\s*Thư mục series:\s*(.+?)\s*$/m)?.[1]?.replace(/^`|`$/g, "") ?? null;
  }
  if (!p) return null;
  const dir = resolve(base, p);
  return existsSync(join(dir, SERIES_FILE)) ? dir : null;
}
