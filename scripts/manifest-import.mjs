#!/usr/bin/env node
// manifest-import.mjs — build project.json for a project that has none (every project made before
// the manifest), reading only: index.html, PLAN.md, audio_meta.json, script/NN.txt, BRIEF.md,
// hyperframes.json and the assets/ listing. No existing file is changed; --write adds only
// project.json and .opus/ (version 1, actor "import").
//   node manifest-import.mjs --project <dir> [--write] [--force]
//   node manifest-import.mjs --help | -h
// Shots, first source found: the PLAN.md "## Cảnh" table · the root's scene sub-compositions
//   (data-composition-src without data-track-kind, each running to the next one's start) · audio_meta.json voices back to
//   back · one shot over the root data-duration. Windows are snapped back to back from 0 and the
//   last one reaches the root data-duration; every snap is a WARN line.
// Lines: the voice tracks (isVoice in audio-mix.mjs) with their id, src, data-start and
//   data-duration; text from script/<NN>.txt matching the voice file name, else the audio_meta.json
//   words, else the <voice>.words.json sidecar; gate "unknown". Each line belongs to the shot holding its midpoint.
// Music: the bed tracks (isBed) with data-volume as gain.
// capabilities.timing_markers and editable: whether index.html has TIMING:BEGIN. A project without
//   it is view only in Studio and the gateway (the director edits its HTML directly).
// Without --write the manifest is printed and nothing is written.
// Prints `IMPORT <dir> shots=N lines=N music=N editable=<bool>` and the WARN lines.
// --force  import again over an existing project.json, as the next version (history is kept).
// Exit: 0 ok · 1 unreadable project or invalid result · 2 bad usage or no index.html ·
// 6 project.json exists (use --force) · 8 BUSY (another writer holds .opus/lock).
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { SCHEMA, load, validate, r3 } from "./manifest.mjs";
import { record, takeLock } from "./gateway.mjs";
import { planScenes } from "./timing.mjs";
import { parseTracks, isVoice, isBed } from "./audio-mix.mjs";

const EPS = 1e-3;
const KINDS = { ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image", ".gif": "image", ".svg": "image", ".mp4": "video", ".mov": "video", ".webm": "video" };
const MAX_ASSETS = 500;
const rel = (root, p) => relative(root, p).split("\\").join("/");
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] ?? null;

function rootInfo(html) {
  const flat = html.replace(/<!--[\s\S]*?-->/g, " ").replace(/\s+/g, " ");
  const tags = [...flat.matchAll(/<[a-z][^>]*\sdata-composition-id\s*=[^>]*>/gi)].map((m) => m[0]);
  const root = tags[0] ?? "";
  return {
    duration: Number(attr(root, "data-duration")),
    width: Number(attr(root, "data-width")) || 1920,
    height: Number(attr(root, "data-height")) || 1080,
    // Scene sub-compositions only: overlays such as captions carry data-track-kind and span the video.
    scenes: tags.slice(1).filter((t) => attr(t, "data-composition-src") && !attr(t, "data-track-kind")).map((t) => ({ sid: attr(t, "data-composition-id"), start: Number(attr(t, "data-start")) || 0 })),
  };
}

function title(root) {
  const brief = join(root, "BRIEF.md");
  if (existsSync(brief)) {
    const t = readFileSync(brief, "utf8");
    const fm = t.match(/^---\n([\s\S]*?)\n---/)?.[1]?.match(/^(?:title|topic|chu_de):\s*(.+)$/m)?.[1];
    if (fm) return fm.replace(/^["']|["']$/g, "").trim();
    const h = t.match(/^#\s+(.+)$/m)?.[1];
    if (h) return h.trim();
  }
  return basename(root);
}

function listAssets(root) {
  const out = [];
  const walk = (d) => {
    if (out.length >= MAX_ASSETS || !existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (KINDS[extname(e.name).toLowerCase()] && out.length < MAX_ASSETS) out.push({ path: rel(root, p), kind: KINDS[extname(e.name).toLowerCase()] });
    }
  };
  walk(join(root, "assets"));
  return out;
}

// Project dir → { manifest, warnings }. Reads only.
export function importProject(dir) {
  const root = resolve(dir);
  const html = readFileSync(join(root, "index.html"), "utf8");
  const info = rootInfo(html);
  const warnings = [];
  if (!(info.duration > 0)) throw new Error("index.html: root composition không có data-duration");
  let meta = null;
  if (existsSync(join(root, "audio_meta.json"))) { try { meta = JSON.parse(readFileSync(join(root, "audio_meta.json"), "utf8")); } catch { warnings.push("audio_meta.json không đọc được, bỏ qua"); } }

  // Shot windows from the first available source.
  let raw = null, source = "";
  if (existsSync(join(root, "PLAN.md"))) {
    try { raw = planScenes(readFileSync(join(root, "PLAN.md"), "utf8")).map((s) => ({ id: s.sid, name: "", start: s.start, end: s.end })); source = "PLAN.md"; }
    catch (e) { warnings.push(`PLAN.md: ${e.message}; lấy shot từ nguồn khác`); }
  }
  if (!raw && info.scenes.length) {
    const sc = [...info.scenes].sort((a, b) => a.start - b.start);
    raw = sc.map((s, i) => ({ id: `s${i + 1}`, name: s.sid, start: s.start, end: sc[i + 1]?.start ?? info.duration }));
    source = "sub-composition";
  }
  if (!raw && meta?.voices?.length) {
    let t = 0;
    raw = meta.voices.map((v, i) => { const s = { id: `s${v.frame ?? i + 1}`, name: "", start: t, end: t + (Number(v.duration_s) || 0) }; t = s.end; return s; });
    source = "audio_meta.json";
  }
  if (!raw) { raw = [{ id: "s1", name: "", start: 0, end: info.duration }]; source = "root"; }

  const shots = [];
  let prev = 0;
  for (const s of raw) {
    const start = r3(prev);
    let end = r3(s.end);
    if (Math.abs(s.start - prev) > EPS) warnings.push(`${s.id}: start ${s.start}s nắn về ${start}s cho nối tiếp shot trước`);
    if (end <= start) { warnings.push(`${s.id}: bỏ vì không còn độ dài sau khi nắn`); continue; }
    shots.push({ id: s.id, name: s.name, start, end, transition_in: "", motion_note: "", assets: [] });
    prev = end;
  }
  const last = shots.at(-1);
  if (Math.abs(last.end - info.duration) > EPS) { warnings.push(`${last.id}: end ${last.end}s nắn về root data-duration ${r3(info.duration)}s`); last.end = r3(info.duration); }

  const tracks = parseTracks(html, root, root);
  // A line belongs to the shot holding its midpoint: PLAN.md rounds its windows, so a voice that
  // starts 0.04 s before its scene still lands in it.
  const holder = (t) => (shots.find((s, i) => t >= s.start - EPS && (t < s.end || i === shots.length - 1)) ?? shots[0]).id;
  const lines = tracks.filter(isVoice).map((t, i) => {
    const file = rel(root, t.src);
    const nn = basename(file, extname(file));
    let text = "";
    const txt = join(root, "script", `${nn}.txt`);
    if (existsSync(txt)) text = readFileSync(txt, "utf8").trim();
    else {
      const v = meta?.voices?.find((x) => x.path === file);
      let words = v?.words ?? null;
      if (!words && existsSync(`${t.src}.words.json`)) { try { words = JSON.parse(readFileSync(`${t.src}.words.json`, "utf8")); } catch { warnings.push(`${file}.words.json không đọc được`); } }
      if (Array.isArray(words)) text = words.map((w) => w.text).join(" ");
    }
    return { id: t.id ?? `vo-${String(i + 1).padStart(2, "0")}`, shot: holder(t.start + (t.duration ?? 0) / 2), text, file, start: r3(t.start), duration: t.duration != null ? r3(t.duration) : null, gate: "unknown" };
  });
  const music = tracks.filter((t) => isBed(t) && !isVoice(t)).map((t, i) => ({ id: t.id ?? `bgm-${i + 1}`, file: rel(root, t.src), start: r3(t.start), end: t.duration != null ? r3(t.start + t.duration) : r3(info.duration), gain: Math.min(1, r3(t.volume)) }));

  let fps = 30;
  try { const v = Number(JSON.parse(readFileSync(join(root, "hyperframes.json"), "utf8")).fps); if (v > 0) fps = v; } catch { /* no hyperframes.json or no fps: HyperFrames defaults to 30 */ }
  const markers = /\/\*\s*TIMING:BEGIN\s*\*\//.test(html);
  const manifest = {
    schema: SCHEMA, title: title(root), fps, width: info.width, height: info.height, duration: last.end, html: "index.html",
    capabilities: { timing_markers: markers, editable: markers },
    shots, lines, music, assets: listAssets(root),
    version: 1, updated: new Date().toISOString(),
  };
  return { manifest, warnings, source };
}

export function main(argv = process.argv.slice(2), { out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}) {
  if (wantsHelp(argv)) { out(helpText(import.meta.url)); return 0; }
  const usage = "usage: node manifest-import.mjs --project <dir> [--write] [--force]";
  const o = { project: null, write: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project") { o.project = argv[++i]; if (!o.project) { err(`manifest-import: --project needs a value\n${usage}\n`); return 2; } }
    else if (a === "--write" || a === "--force") o[a.slice(2)] = true;
    else { err(`manifest-import: unknown argument ${a}\n${usage}\n`); return 2; }
  }
  if (!o.project) { err(`manifest-import: --project is required\n${usage}\n`); return 2; }
  const dir = resolve(o.project);
  if (!existsSync(join(dir, "index.html"))) { err(`manifest-import: không có index.html trong ${dir}\n`); return 2; }
  // Hold the gateway lock so a Studio or director write cannot take the same version number.
  const release = o.write ? takeLock(dir) : () => {};
  if (!release) { err(`manifest-import: BUSY: project.json đang được ghi bởi tiến trình khác, thử lại sau\n`); return 8; }
  try { return run(dir, o, out, err); } finally { release(); }
}

function run(dir, o, out, err) {
  const existing = load(dir);
  if (existing && !o.force) { err(`manifest-import: ${dir}/project.json đã có (thêm --force để nhập lại thành phiên bản mới)\n`); return 6; }
  let r;
  try { r = importProject(dir); } catch (e) { err(`manifest-import: ${e.message}\n`); return 1; }
  const errors = validate(r.manifest);
  if (errors.length) { err(`manifest-import: kết quả không hợp lệ: ${errors.join("; ")}\n`); return 1; }
  const m = r.manifest;
  out(`IMPORT ${dir} shots=${m.shots.length} lines=${m.lines.length} music=${m.music.length} editable=${m.capabilities.editable} (shot từ ${r.source})\n`);
  for (const w of r.warnings) out(`WARN ${w}\n`);
  if (!o.write) { out(JSON.stringify(m, null, 2) + "\n"); return 0; }
  if (existing) m.version = existing.version + 1;
  try { record(dir, m, { actor: "import", base: existing?.version ?? 0, ops: [], receipt: [`nhập từ ${r.source}`] }); }
  catch (e) { err(`manifest-import: không ghi được: ${e.message}\n`); return 1; }
  out(`đã ghi ${dir}/project.json (v${m.version})\n`);
  return 0;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
