// studio/media.mjs — footage the user picks on this machine (no HTTP upload). browse(path) lists a
// folder under BROWSE_ROOTS (home and /Volumes); register(root, dir, src) adds a media file to
// <dir>/.opus/media.json, where the director reads it. A file already inside <root>/footage,
// <root>/shared-assets or <dir>/assets is used in place; any other file is copied to
// <root>/footage/raw/<basename> (a taken name gets -2, -3, … before the extension; never
// overwritten). Every path is checked by realpath, so a symlink cannot lead outside the roots.
// Metadata comes from ffprobe (no shell, 20 s timeout); a failed probe still registers.
import { constants, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { basename, dirname, extname, join, relative, sep } from "node:path";

export const BROWSE_ROOTS = [homedir(), "/Volumes"];
export const VIDEO_EXT = [".mp4", ".mov", ".m4v", ".mkv", ".webm"];
export const AUDIO_EXT = [".mp3", ".wav", ".m4a", ".aac"];
export const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
export const MEDIA_EXT = [...VIDEO_EXT, ...AUDIO_EXT, ...IMAGE_EXT];
const LIST_MAX = 500;
const PROBE_TIMEOUT_MS = 20000;

const fail = (status, error) => Object.assign(new Error(error), { status });
const real = (p) => { try { return realpathSync(p); } catch { return null; } };
const inside = (p, base) => Boolean(base) && (p === base || p.startsWith(base + sep));
const kindOf = (f) => {
  const e = extname(f).toLowerCase();
  return VIDEO_EXT.includes(e) ? "video" : AUDIO_EXT.includes(e) ? "audio" : IMAGE_EXT.includes(e) ? "image" : null;
};

// The realpath of p when it lies inside one of roots (themselves resolved), else throws 403/404.
function allowed(p, roots) {
  if (typeof p !== "string" || !p.startsWith("/") || p.includes("\0")) throw fail(400, "cần đường dẫn tuyệt đối");
  if (!existsSync(p)) throw fail(404, "không có đường dẫn này");
  const r = real(p);
  if (!r) throw fail(404, "không đọc được đường dẫn");
  if (!roots.map(real).some((b) => inside(r, b))) throw fail(403, "chỉ duyệt được trong thư mục nhà và /Volumes");
  return r;
}

// { path, parent, entries: [{ name, path, type: "dir"|"file", kind?, size? }] } — folders (no
// dotfolders) first, then media files, at most 500. parent is null at a browse root.
export function browse(path = homedir(), { roots = BROWSE_ROOTS } = {}) {
  const dir = allowed(path, roots);
  if (!statSync(dir).isDirectory()) throw fail(400, "không phải thư mục");
  const dirs = [], files = [];
  let names;
  try { names = readdirSync(dir, { withFileTypes: true }); } catch { throw fail(403, "không đọc được thư mục này"); }
  for (const e of names.sort((a, b) => a.name.localeCompare(b.name))) {
    if (dirs.length + files.length >= LIST_MAX) break;
    if (e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) dirs.push({ name: e.name, path: p, type: "dir" });
    else if (st.isFile() && kindOf(e.name)) files.push({ name: e.name, path: p, type: "file", kind: kindOf(e.name), size: st.size });
  }
  const atRoot = roots.map(real).includes(dir);
  return { path: dir, parent: atRoot ? null : dirname(dir), entries: [...dirs, ...files] };
}

export const mediaFile = (dir) => join(dir, ".opus", "media.json");
export function readMedia(dir) {
  try { const v = JSON.parse(readFileSync(mediaFile(dir), "utf8")); return Array.isArray(v) ? v : []; } catch { return []; }
}
function writeMedia(dir, list) {
  mkdirSync(join(dir, ".opus"), { recursive: true });
  const f = mediaFile(dir);
  const tmp = `${f}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(list, null, 2) + "\n");
  renameSync(tmp, f);
}

const ffprobeBin = () => (existsSync("/opt/homebrew/bin/ffprobe") ? "/opt/homebrew/bin/ffprobe" : "ffprobe");

// { duration, width, height, codec } or null when ffprobe fails.
export function probe(file) {
  return new Promise((res) => {
    execFile(ffprobeBin(), ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], { encoding: "utf8", timeout: PROBE_TIMEOUT_MS, maxBuffer: 8 << 20, shell: false }, (err, stdout) => {
      if (err) return res(null);
      try {
        const j = JSON.parse(stdout);
        const streams = j.streams ?? [];
        const v = streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic) ?? null;
        const a = streams.find((s) => s.codec_type === "audio") ?? null;
        const d = Number(j.format?.duration);
        res({ duration: Number.isFinite(d) ? d : null, width: v?.width ?? null, height: v?.height ?? null, codec: (v ?? a)?.codec_name ?? null });
      } catch { res(null); }
    });
  });
}

function copyFree(src, destDir) {
  mkdirSync(destDir, { recursive: true });
  const ext = extname(src), stem = basename(src, ext);
  for (let n = 1; n < 10000; n++) {
    const dest = join(destDir, n === 1 ? `${stem}${ext}` : `${stem}-${n}${ext}`);
    try { copyFileSync(src, dest, constants.COPYFILE_EXCL); return dest; } catch (e) { if (e.code !== "EEXIST") throw e; }
  }
  throw fail(500, "không tìm được tên trống trong footage/raw");
}

// Registers src for the project at dir. Returns { media, copied, existing }.
export async function register(root, dir, src, { roots = BROWSE_ROOTS, probeFn = probe } = {}) {
  const file = allowed(src, roots);
  if (!statSync(file).isFile()) throw fail(400, "chỉ đăng ký được file thường");
  const kind = kindOf(file);
  if (!kind) throw fail(400, `đuôi file không hỗ trợ; dùng ${MEDIA_EXT.join(" ")}`);
  const rootReal = real(root), dirReal = real(dir);
  const list = readMedia(dir);
  const old = list.find((m) => m.path === file || m.source === file);
  if (old) return { media: old, copied: false, existing: true };
  const inPlace = [join(rootReal, "footage"), join(rootReal, "shared-assets"), join(dirReal, "assets")].map(real).some((b) => inside(file, b));
  const path = inPlace ? file : copyFree(file, join(rootReal, "footage", "raw"));
  const size = statSync(path).size;
  const meta = kind === "image" ? null : await probeFn(path);
  // Read the list again just before writing: the probe takes time and another register may have landed.
  const now = readMedia(dir);
  const dup = now.find((m) => m.path === path || m.source === file);
  if (dup) return { media: dup, copied: false, existing: true };
  const media = {
    id: `m${1 + Math.max(0, ...now.map((m) => Number(String(m.id).slice(1)) || 0))}`,
    path, rel: relative(rootReal, path).split(sep).join("/"), kind, source: file, size,
    duration: meta?.duration ?? null, width: meta?.width ?? null, height: meta?.height ?? null, codec: meta?.codec ?? null,
    ...(kind === "image" ? {} : { probe: meta ? "ok" : null }), added: new Date().toISOString(),
  };
  writeMedia(dir, [...now, media]);
  return { media, copied: !inPlace, existing: false };
}
