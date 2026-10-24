#!/usr/bin/env node
// render-final.mjs — the only way to make the final (delivery) MP4. Runs the preflight gate
// (check-preflight --stage final: PLAN.md + demo frames + approval in DEMO.md), checks that ffmpeg
// and ffprobe run, then `npx hyperframes render --quality delivery <your args>` in the project
// directory, then swaps the sound for the audio-mix (ffmpeg) mix of the composition (data-fx-carve
// beds ducked under their voice, loudness-normalized to -14 LUFS / -1.5 dBTP) and writes the
// sidecar <output>.render.json {composition, visual_hash, audio_hash, mode, mixer, source,
// source_sha256 (of that MP4), created}.
//   node render-final.mjs [--project .] [--legacy-mtime] -- [hyperframes render args, e.g. -c compositions/main-9x16.html --output renders/x-9x16.mp4]
//   node render-final.mjs [--project .] --audio-only <old final.mp4> -- [-c <composition>] --output <new.mp4>
//   node render-final.mjs --help | -h
// --legacy-mtime is handed to the preflight: the animatic is checked by file dates even when DEMO.md
// has visual_hash: (a WARN says so; the flag goes after 2026-10-31).
// Draft and QA renders (--quality draft|looks) stay plain `hyperframes render`.
// A --quality/-q in the forwarded args is refused: this command always renders delivery.
// Paths in the forwarded args and after --audio-only resolve from the project directory; paths
// inside a composition resolve from its folder, then from the project root (like HyperFrames).
// Without --output the full render takes the one new .mp4 in renders/ (several new ones: exit 2).
// Sub-scenes are the files embedded through data-composition-src (followed recursively); sibling
// compositions such as main-9x16.html next to index.html are not.
// Dynamic sound keeps the HyperFrames mix (sidecar mixer "hyperframes") and blocks --audio-only:
// data-automation, data-fx-chain, a GSAP tween on volume or a script setting .volume, or
// <audio>/unmuted <video> inside a sub-scene. data-audio-group and data-fx-carve go through audio-mix.
// --audio-only <old>: new music, SFX or volumes without re-rendering the picture. Same preflight,
// then needs <old>.render.json whose source_sha256 matches <old>, and the same picture: visual_hash
// covers the composition and its sub-scenes without <audio> and data-volume, non-HTML files under
// compositions/, assets/ except voice/ sfx/ bgm/ and the sfx-sync cache sfx-onsets.json, and every
// local file they reference (src, <link href>, url(), also ../ outside the project). Copies <old>'s video stream, muxes the new
// mix into --output (required, not <old>), writes a sidecar with mode "audio-only".
// Sound unchanged: says so, exit 0, no new file. Work files go next to the output, not to /tmp.
// Exit: the render's exit code · 1 mix or remux failed · 2 bad usage or ffmpeg/ffprobe missing ·
//   5 preflight blocked · 6 sound cannot be swapped (no sidecar, sidecar does not match the file,
//   picture changed, dynamic sound, a referenced file missing).

import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep as SEP } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { check, report } from "./check-preflight.mjs";
import { parseTracks, resolveSrc, dynamicAudio, main as audioMix } from "./audio-mix.mjs";
import { winArgs } from "./make-demo.mjs";
import { ONSET_CACHE } from "./sfx-sync.mjs";

export const PREFLIGHT_EXIT = 5;
export const AUDIO_ONLY_EXIT = 6;
const SOUND_DIRS = ["voice", "sfx", "bgm"];
// assets/gen/ holds the drawing work behind the picture (batch files, raw and keyed drawings, rig
// previews, the thumbnail batch). The composition shows what was synced or copied out of it
// (assets/rig, assets/bg, …), so a folder walk skips it; a file there the composition references
// directly is still hashed through its reference.
const WORK_DIR = "assets/gen/";

const posix = (root, p) => relative(root, p).split(SEP).join("/");
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const shaText = (s) => createHash("sha256").update(s).digest("hex");

function shaFile(path) {
  const h = createHash("sha256");
  const buf = Buffer.allocUnsafe(1 << 20);
  const fd = openSync(path, "r");
  try {
    for (let n; (n = readSync(fd, buf, 0, buf.length, null)) > 0;) h.update(buf.subarray(0, n));
  } finally { closeSync(fd); }
  return h.digest("hex");
}

// Regular files under dir (symlinks followed), dotfiles skipped, sorted by path.
function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).sort(byName)) {
    if (name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (st.isFile()) out.push(p);
  }
  return out;
}

// The picture-only view of an HTML file: comments, <audio> elements and data-volume removed.
const stripAudio = (html) => html
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<audio\b[^>]*>[\s\S]*?<\/audio\s*>/gi, "")
  .replace(/<audio\b[^>]*>/gi, "")
  .replace(/\sdata-volume\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

const REF = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)')|<link\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)')|url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\)/gi;

// HyperFrames resolves paths in compositions/*.html from the project root: try the file's folder
// first, then the root. A leading "/" means the project root.
const resolveRef = (v, root, base) => (v.startsWith("/") ? join(root, v) : resolveSrc(v, base, root));

// Local files an HTML file loads: src of any element, <link href>, url(...). Remote, data:, #frag and
// templated values are skipped.
function localRefs(html, root, base) {
  const out = [];
  for (const m of html.matchAll(REF)) {
    const raw = (m.slice(1).find((x) => x !== undefined) ?? "").trim();
    if (!raw || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(raw) || /\$\{|\{\{/.test(raw)) continue;
    let v = raw.replace(/[?#].*$/, "");
    if (!v) continue;
    try { v = decodeURI(v); } catch { /* keep the raw path */ }
    out.push(resolveRef(v, root, base));
  }
  return out;
}

const compPaths = (project, composition) => {
  const root = resolve(project);
  return { root, comp: resolve(root, composition || "index.html") };
};

const SUB_SRC = /\sdata-composition-src\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

// Sub-scene files embedded through data-composition-src, followed recursively from the composition.
// Sibling compositions (e.g. main-9x16.html next to a 16:9 index.html) are not sub-scenes.
// Returns { found, missing } as absolute paths.
function subScenes(root, comp) {
  const found = [];
  const missing = [];
  const seen = new Set([comp]);
  const queue = [comp];
  while (queue.length) {
    const html = readFileSync(queue.shift(), "utf8").replace(/<!--[\s\S]*?-->/g, "");
    for (const m of html.matchAll(SUB_SRC)) {
      const v = (m[1] ?? m[2] ?? "").trim().replace(/[?#].*$/, "");
      if (!v || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(v)) continue;
      const p = resolveRef(v, root, dirname(comp));
      if (seen.has(p)) continue;
      seen.add(p);
      if (existsSync(p) && statSync(p).isFile()) { found.push(p); queue.push(p); } else missing.push(p);
    }
  }
  return { found, missing };
}

const compTracks = (root, comp) => parseTracks(readFileSync(comp, "utf8"), dirname(comp), root);

// The TIMING block timing.mjs writes from the voice and PLAN.md (the markers stay).
const TIMING_BLOCK = /(\/\*\s*TIMING:BEGIN\s*\*\/)[\s\S]*?(\/\*\s*TIMING:END\s*\*\/)/g;
// Sound files and their sidecars (word timings, viet-pro stamps): never picture, wherever they sit.
const SOUND_FILE = /\.(?:mp3|wav|m4a|aac|ogg|oga|flac|opus)$|\.words\.json$|\.gate\.json$/i;

// What the picture hashes read, in order: [{ path, digest }]. Options:
//   timing "keep" | "drop": hash the TIMING block of the HTML, or only its markers;
//   scenesDir: add every file under scenes/ (the ES modules a buildFilm composition imports);
//   soundFiles "keep" | "drop": hash sound files under assets/ outside the sound folders, or skip them.
function pictureInputs(project, composition, { timing = "keep", scenesDir = false, soundFiles = "keep" } = {}) {
  const { root, comp } = compPaths(project, composition);
  if (!existsSync(comp)) throw new Error(`composition not found: ${comp}`);
  const out = [];
  const add = (p, digest) => out.push({ path: p, digest });
  const view = (text) => {
    const pic = stripAudio(text);
    return timing === "drop" ? pic.replace(TIMING_BLOCK, "$1$2") : pic;
  };
  const html = view(readFileSync(comp, "utf8"));
  add(comp, shaText(html));
  const refs = new Set(localRefs(html, root, dirname(comp)));
  const subs = subScenes(root, comp);
  for (const f of subs.found) {
    const sub = view(readFileSync(f, "utf8"));
    add(f, shaText(sub));
    for (const r of localRefs(sub, root, dirname(comp))) refs.add(r);
  }
  for (const p of subs.missing) refs.add(p);
  // non-HTML files under compositions/ (styles, scripts) can change the picture without a reference
  for (const f of walk(join(root, "compositions"))) if (!f.endsWith(".html")) add(f, shaFile(f));
  if (scenesDir) for (const f of walk(join(root, "scenes"))) add(f, shaFile(f));
  for (const f of walk(join(root, "assets"))) {
    const rel = posix(root, f);
    if (rel === ONSET_CACHE || rel.startsWith(WORK_DIR) || SOUND_DIRS.some((d) => rel.startsWith(`assets/${d}/`))) continue;
    if (soundFiles === "drop" && SOUND_FILE.test(rel)) continue;
    add(f, shaFile(f));
  }
  const files = [...refs].sort(byName);
  const missing = files.filter((p) => !existsSync(p) || !statSync(p).isFile());
  if (missing.length) throw new Error(`referenced file not found:\n  ${missing.join("\n  ")}`);
  for (const p of files) add(p, shaFile(p));
  return { root, inputs: out };
}

const digestOf = ({ root, inputs }) => {
  const h = createHash("sha256");
  for (const { path, digest } of inputs) h.update(`${posix(root, path)}\0${digest}\n`);
  return h.digest("hex");
};

// The picture of a render (--audio-only refuses a changed one): every byte the composition shows,
// TIMING included.
export function visualHash(project, composition = "index.html") {
  return digestOf(pictureInputs(project, composition));
}

// The picture the user approved in the animatic (check-preflight --stage final compares it with
// DEMO.md visual_hash:). Like visualHash, but without the TIMING block (timing.mjs rewrites it from
// the voice and PLAN.md; PLAN.md keeps its own mtime check) and without sound files anywhere under
// assets/, plus every file under scenes/. A new voice take therefore leaves it as it was, while an
// edit to scenes/*.mjs changes it.
export const PICTURE_OPTIONS = Object.freeze({ timing: "drop", scenesDir: true, soundFiles: "drop" });
export function pictureHash(project, composition = "index.html") {
  return digestOf(pictureInputs(project, composition, PICTURE_OPTIONS));
}

// The files pictureHash reads, project-relative, sorted; the gate names the ones edited after the
// animatic when the hash differs.
export function pictureFiles(project, composition = "index.html") {
  const r = pictureInputs(project, composition, PICTURE_OPTIONS);
  return [...new Set(r.inputs.map((x) => posix(r.root, x.path)))].sort(byName);
}

export function audioHash(project, composition = "index.html") {
  const { root, comp } = compPaths(project, composition);
  if (!existsSync(comp)) throw new Error(`composition not found: ${comp}`);
  const tracks = compTracks(root, comp);
  const missing = [...new Set(tracks.map((t) => t.src).filter((s) => !existsSync(s)))];
  if (missing.length) throw new Error(`audio src not found:\n  ${missing.join("\n  ")}`);
  // The element id names the tag, not the sound: leave it out so renaming an id is not a sound change
  // and sidecars written before tracks carried an id still match.
  const h = createHash("sha256").update(JSON.stringify(tracks.map(({ id, ...t }) => ({ ...t, src: posix(root, t.src) }))));
  for (const t of tracks) h.update(`\n${shaFile(t.src)}`);
  return h.digest("hex");
}

// Why the composition's sound needs the HyperFrames mixer; empty when audio-mix rebuilds it exactly.
export function dynamicAudioReasons(project, composition = "index.html") {
  const { root, comp } = compPaths(project, composition);
  const reasons = dynamicAudio(readFileSync(comp, "utf8")).map((r) => `${posix(root, comp)}: ${r}`);
  for (const f of subScenes(root, comp).found) {
    const html = readFileSync(f, "utf8");
    reasons.push(...dynamicAudio(html).map((r) => `${posix(root, f)}: ${r}`));
    if (parseTracks(html, dirname(comp), root).length) reasons.push(`${posix(root, f)}: <audio>/<video> with sound in a sub-scene`);
  }
  return reasons;
}

export const sidecarPath = (mp4) => `${mp4}.render.json`;

export function writeSidecar(out, data) {
  writeFileSync(sidecarPath(out), `${JSON.stringify(data, null, 2)}\n`);
}

// null when there is no sidecar; throws when it exists but is not a render-final sidecar.
export function readSidecar(mp4) {
  const p = sidecarPath(mp4);
  if (!existsSync(p)) return null;
  let d;
  try { d = JSON.parse(readFileSync(p, "utf8")); } catch (e) { throw new Error(`unreadable sidecar ${p}: ${e.message}`); }
  for (const k of ["composition", "visual_hash", "audio_hash", "mode", "source_sha256"]) {
    if (typeof d?.[k] !== "string" || !d[k]) throw new Error(`sidecar ${p} has no ${k}`);
  }
  return d;
}

// Value of -x/--long, -x=v or --long=v in the forwarded args (last one wins, like the CLI parser).
function fwdValue(fwd, short, long) {
  let v;
  for (let i = 0; i < fwd.length; i++) {
    const a = fwd[i];
    if (a === long || (short && a === short)) v = fwd[i + 1];
    else if (a.startsWith(`${long}=`)) v = a.slice(long.length + 1);
    else if (short && a.startsWith(`${short}=`)) v = a.slice(short.length + 1);
  }
  return v;
}

const compositionArg = (fwd) => {
  const c = fwdValue(fwd, "-c", "--composition");
  return !c || c === "." ? "index.html" : c;
};

function probeDuration(file, spawn) {
  const r = spawn("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=duration:format=duration", "-of", "json", file], { encoding: "utf8" });
  if (r.error) throw new Error(`cannot run ffprobe: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`ffprobe failed on ${file}: ${String(r.stderr ?? "").trim()}`);
  const j = JSON.parse(String(r.stdout));
  if (!j.streams?.length) throw new Error(`no video stream in ${file}`);
  const d = Number(j.streams[0].duration) || Number(j.format?.duration);
  if (!(d > 0)) throw new Error(`cannot read the duration of ${file}`);
  return d;
}

// Video stream of videoSrc + audio-mix of the composition → out (via a temp file next to out).
function remix({ videoSrc, comp, root, out, spawn, err }) {
  const duration = probeDuration(videoSrc, spawn);
  // work files stay on the output's disk: the system disk may be nearly full
  mkdirSync(dirname(out), { recursive: true });
  const work = mkdtempSync(join(dirname(out), ".render-final-"));
  const tmp = join(work, "remix.mp4");
  try {
    const silent = !compTracks(root, comp).length;
    const wav = join(work, "mix.wav");
    if (!silent) {
      const code = audioMix(["--html", comp, "--duration", String(duration), "--out", wav, "--base", root, "--loudnorm"], { spawn, log: () => {}, err });
      if (code !== 0) throw new Error(`audio-mix exited ${code}`);
    }
    const args = ["-hide_banner", "-v", "error", "-y", "-i", videoSrc];
    if (silent) args.push("-map", "0:v", "-c:v", "copy", "-an");
    else args.push("-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k");
    args.push("-movflags", "+faststart", tmp);
    const r = spawn("ffmpeg", args, { stdio: "inherit", cwd: root });
    if (r.error) throw new Error(`cannot run ffmpeg: ${r.error.message}`);
    if (r.status !== 0) throw new Error(`ffmpeg remux exited ${r.status}`);
    renameSync(tmp, out);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const sameFile = (a, b) => resolve(a) === resolve(b) || (existsSync(a) && existsSync(b) && realpathSync(a) === realpathSync(b));

// The .mp4 files in renders/ touched since the render started (used when no --output was forwarded).
function newRenders(root, since) {
  const dir = join(root, "renders");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => n.endsWith(".mp4") && !n.startsWith(".")).map((n) => join(dir, n)).filter((p) => statSync(p).mtimeMs >= since);
}

// ffmpeg and ffprobe must run before an expensive render, not after it.
function missingTools(spawn) {
  return ["ffmpeg", "ffprobe"].filter((t) => {
    const r = spawn(t, ["-version"], { encoding: "utf8" });
    return Boolean(r.error) || r.status !== 0;
  });
}

function fullRender({ root, fwd, spawn, err, win }) {
  const started = Date.now() - 1000;
  const x = spawn("npx", winArgs(["hyperframes", "render", "--quality", "delivery", ...fwd], win), { cwd: root, stdio: "inherit", shell: win });
  if ((x.status ?? 1) !== 0) return x.status ?? 1;
  const format = fwdValue(fwd, null, "--format");
  if ((format && format !== "mp4") || fwd.some((a) => a === "--batch" || a.startsWith("--batch="))) {
    err("render-final: not a single MP4 (--format/--batch): kept the HyperFrames sound, no sidecar");
    return 0;
  }
  const o = fwdValue(fwd, "-o", "--output");
  let out = o ? resolve(root, o) : null;
  if (!o) {
    const hits = newRenders(root, started);
    if (hits.length > 1) { err(`render-final: ${hits.length} new MP4s in renders/ (${hits.map((p) => basename(p)).join(", ")}); cannot tell which one this render wrote, pass --output after --`); return 2; }
    out = hits[0] ?? null;
  }
  if (!out || !existsSync(out)) { err(`render-final: render finished but its MP4 was not found (${o ?? "renders/*.mp4"}); pass --output after --`); return 1; }
  const composition = compositionArg(fwd);
  const { comp } = compPaths(root, composition);
  let mixer = "audio-mix";
  try {
    const dyn = dynamicAudioReasons(root, composition);
    if (dyn.length) { mixer = "hyperframes"; err(`render-final: dynamic sound, kept the HyperFrames mix:\n  ${dyn.join("\n  ")}`); }
    else if (!compTracks(root, comp).length) mixer = "hyperframes";
    else remix({ videoSrc: out, comp, root, out, spawn, err });
  } catch (e) { err(`render-final: sound mix failed, ${posix(root, out)} keeps the HyperFrames sound: ${e.message}`); return 1; }
  try {
    writeSidecar(out, { composition, visual_hash: visualHash(root, composition), audio_hash: audioHash(root, composition), mode: "full", mixer, source: null, source_sha256: shaFile(out), created: new Date().toISOString() });
  } catch (e) { err(`render-final: no sidecar written, --audio-only will refuse this file: ${e.message}`); }
  return 0;
}

function audioOnly({ root, old, fwd, spawn, err, log }) {
  const fail = (m) => { err(`render-final --audio-only: ${m}`); return AUDIO_ONLY_EXIT; };
  const composition = compositionArg(fwd);
  const out = resolve(root, fwdValue(fwd, "-o", "--output"));
  let side;
  try { side = readSidecar(old); } catch (e) { return fail(e.message); }
  if (!side) return fail(`${posix(root, old)} has no sidecar (${basename(sidecarPath(old))}); render it in full once`);
  if (shaFile(old) !== side.source_sha256) return fail(`${posix(root, old)} is not the file its sidecar describes (sha256 differs); render in full`);
  if (side.composition !== composition) return fail(`${posix(root, old)} was rendered from ${side.composition}, not ${composition}; render in full`);
  let visual, audio;
  try { visual = visualHash(root, composition); } catch (e) { return fail(e.message); }
  if (visual !== side.visual_hash) return fail("the picture changed since that render; render in full");
  const dyn = dynamicAudioReasons(root, composition);
  if (dyn.length) return fail(`the sound has dynamic effects; render in full:\n  ${dyn.join("\n  ")}`);
  try { audio = audioHash(root, composition); } catch (e) { return fail(e.message); }
  if (audio === side.audio_hash) { log(`render-final --audio-only: sound unchanged, ${posix(root, old)} is still current`); return 0; }
  const { comp } = compPaths(root, composition);
  try { remix({ videoSrc: old, comp, root, out, spawn, err }); } catch (e) { err(`render-final --audio-only: ${e.message}`); return 1; }
  writeSidecar(out, { composition, visual_hash: visual, audio_hash: audio, mode: "audio-only", mixer: "audio-mix", source: posix(root, old), source_sha256: shaFile(out), created: new Date().toISOString() });
  log(`render-final --audio-only: ${posix(root, out)} (picture from ${posix(root, old)}, new sound)`);
  return 0;
}

const AUDIO_ONLY_FWD = new Set(["-c", "--composition", "-o", "--output"]);

export function main(argv = process.argv.slice(2), { checkImpl = check, spawn = spawnSync, err = console.error, log = console.log, win = process.platform === "win32" } = {}) {
  if (wantsHelp(argv.slice(0, argv.includes("--") ? argv.indexOf("--") : argv.length))) { process.stdout.write(helpText(import.meta.url)); return 0; }
  const sep = argv.indexOf("--");
  const own = sep >= 0 ? argv.slice(0, sep) : argv;
  const fwd = sep >= 0 ? argv.slice(sep + 1) : [];
  let project = ".";
  let old;
  let legacyMtime = false;
  for (let i = 0; i < own.length; i++) {
    if (own[i] === "--legacy-mtime") legacyMtime = true;
    else if (own[i] === "--project" || own[i] === "--audio-only") {
      const v = own[++i];
      if (!v || v === "--") { err(`render-final: ${own[i - 1]} needs a value`); return 2; }
      if (own[i - 1] === "--project") project = v; else old = v;
    } else { err(`render-final: unknown argument ${own[i]} (put hyperframes render args after --)`); return 2; }
  }
  if (fwd.some((a) => a === "-q" || a === "--quality" || a.startsWith("--quality="))) { err("render-final: do not pass --quality; the final render is always delivery"); return 2; }
  const root = resolve(project);
  if (old !== undefined) {
    old = resolve(root, old);
    for (let i = 0; i < fwd.length; i++) {
      const a = fwd[i];
      const name = a.includes("=") ? a.slice(0, a.indexOf("=")) : a;
      if (!AUDIO_ONLY_FWD.has(name)) { err(`render-final --audio-only: only -c and --output apply, got ${a}`); return 2; }
      if (!a.includes("=")) i++;
    }
    const o = fwdValue(fwd, "-o", "--output");
    if (!o) { err("render-final --audio-only: --output <new.mp4> is required after --"); return 2; }
    if (!existsSync(old)) { err(`render-final --audio-only: not found: ${old}`); return 2; }
    if (sameFile(old, resolve(root, o))) { err("render-final --audio-only: --output must be a new file, not the old final"); return 2; }
  }
  const r = checkImpl({ project, stage: "final", ...(legacyMtime ? { legacyMtime } : {}) });
  report(r, (m) => err(m));
  if (!r.pass) return PREFLIGHT_EXIT;
  const missing = missingTools(spawn);
  if (missing.length) { err(`render-final: cannot run ${missing.join(" and ")}; install ffmpeg (it ships ffprobe) before the final render`); return 2; }
  return old !== undefined ? audioOnly({ root, old, fwd, spawn, err, log }) : fullRender({ root, fwd, spawn, err, win });
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
