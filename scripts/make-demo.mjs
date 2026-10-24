#!/usr/bin/env node
// make-demo.mjs — capture the demo frames that PLAN.md asks for and (re)write DEMO.md with
// `approval: pending`. Show the frames to the user, then record their answer in DEMO.md
// (`approval: <who, when, what>`); render-final.mjs refuses the final render until then.
//   node make-demo.mjs [--project .] [--hyperframes <dir>] [--composition <file>] [--aspect 9x16] [--animatic]
//   node make-demo.mjs [--project .] --from-video <draft.mp4> [--aspect 9x16]
//   node make-demo.mjs [--project .] --record-audio-review <who>
//   node make-demo.mjs --help | -h
// Timestamps: "## Khung hình demo" (or "## Khung hình demo 9:16" with --aspect 9x16) in PLAN.md.
// Output: <project>/demo/ (or demo/9x16/). Old frame-*.png there are removed first.
// Capture:
//   - default: `npx hyperframes snapshot <hyperframes dir> --at t1,t2,… --no-end --describe false`
//     (the project's index.html; --hyperframes points at a separate 9:16 project).
//   - --composition <file>: snapshot cannot pick a composition, so render it at
//     `--quality draft` to a temp MP4 and cut one PNG per timestamp with ffmpeg.
//   - --from-video <mp4>: cut the frames from a draft render the user already watched (no new
//     render). The MP4 must be newer than index.html and compositions/*.html, so it shows the current
//     composition. DEMO.md records the source, so the approval can cite that draft.
//   - --animatic: render the whole composition at `--quality draft`, scaled to 540 px on the short
//     side, to demo/animatic.mp4 (or demo/9x16/animatic.mp4), keep it, cut the PLAN.md frames from it and tile them into
//     contact-sheet.jpg. DEMO.md gets `animatic: <path>` (`animatic_9x16:` with --aspect 9x16).
//     The user approves this MOTION draft, not just stills; check-preflight --stage final requires
//     it for creative projects (BRIEF `direction:`) and measures its motion (qc-mp4 MOTION).
//     Works with --composition and --hyperframes.
//     It also cuts one contact sheet per row of PLAN.md "## Cảnh" (18 frames spread over the scene,
//     tiled 6x3, 320 px wide) to demo/scenes/sheet-s<#>.jpg (demo/9x16/scenes/ with --aspect 9x16)
//     and lists them in DEMO.md as `scene_sheets:` (`scene_sheets_9x16:`). A scene shorter than
//     0.5 s gets a WARN and no sheet; a sheet ffmpeg cannot cut is a WARN, never a failure.
//     With --composition, a composition shorter than the PLAN.md timeline leaves the scenes that
//     start past the animatic's end without a sheet ("ffmpeg không cắt được sheet" WARN).
//     The main animatic of the project's own index.html (no --aspect, --composition or
//     --hyperframes) also writes `visual_hash:` (render-final.mjs pictureHash: the picture without
//     TIMING and sound) and `audio_hash:` (audioHash) to DEMO.md; check-preflight --stage final then
//     compares hashes instead of file dates. Another main animatic removes the two keys (dates again).
//   - --record-audio-review <who>: no capture. Writes or replaces `audio_review: <who> <ISO time>
//     <audioHash now>` in DEMO.md (above "## Frames"; approval: is left as it is): the user listened to
//     the current sound, so the final gate stops warning that the sound changed after the animatic.
//     <who> is letters, digits and . _ @ : + - (user@studio). Exit 2 without DEMO.md, and exit 2 for the
//     director Studio runs (MOTION_STUDIO_RUNNER/OPUS_STUDIO_RUNNER=cli): only the user confirms.
// DEMO.md keeps animatic:, scene_sheets:, visual_hash:, audio_hash: and audio_review: across runs.
// Exit: 0 frames captured · 1 capture failed · 2 bad usage / PLAN.md missing timestamps.

import { existsSync, readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync, mkdtempSync, realpathSync, statSync, renameSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { parsePlan } from "./check-preflight.mjs";
import { planScenes } from "./timing.mjs";
import { audioHash, pictureHash } from "./render-final.mjs";
import { audioReviewRefusal } from "./director-guard.mjs";

const WIN = process.platform === "win32";
// With shell:true (npx on Windows) Node joins args unquoted, so a path with spaces splits in two.
export const winArgs = (args, win = WIN) => (win ? args.map((a) => (/[\s&()^|<>"]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a)) : args);
const run = (cmd, args, opts = {}) => spawnSync(cmd, cmd === "npx" ? winArgs(args) : args, { stdio: "inherit", shell: WIN && cmd === "npx", ...opts });

// DEMO.md keys make-demo owns, in the order they are written above `approval:`.
const DEMO_KEYS = ["animatic", "animatic_9x16", "scene_sheets", "scene_sheets_9x16", "visual_hash", "audio_hash"];
// Written by --record-audio-review, kept by writeDemoMd (just above approval:).
const REVIEW_KEY = "audio_review";
const OWN_KEY = "(?:animatic|scene_sheets)(?:_9x16)?|visual_hash|audio_hash|audio_review";
const REVIEWER = /^[A-Za-z0-9._@:+-]{1,80}$/;

// Rewrite DEMO.md: keep any free text above "## Frames", replace the frame list, reset approval.
// `sheets` (per-scene contact sheets of the animatic) is written as one comma-separated line.
// hashes: undefined keeps visual_hash/audio_hash, null removes them, { visual_hash, audio_hash } sets them.
export function writeDemoMd(project, frames, label, source = "", animatic = "", sheets = [], hashes = undefined) {
  const p = join(project, "DEMO.md");
  const old = existsSync(p) ? readFileSync(p, "utf8") : "";
  const suffix = label === "9:16" ? "_9x16" : "";
  const kept = Object.fromEntries([...old.matchAll(new RegExp(`^\\s*[-*]?\\s*(${OWN_KEY}):\\s*(\\S.*)$`, "gim"))].map((m) => [m[1].toLowerCase(), m[2].trim()]));
  if (animatic) kept[`animatic${suffix}`] = animatic; else delete kept[`animatic${suffix}`];
  if (animatic && sheets.length) kept[`scene_sheets${suffix}`] = sheets.join(", "); else delete kept[`scene_sheets${suffix}`];
  if (hashes !== undefined) for (const k of ["visual_hash", "audio_hash"]) { if (hashes?.[k]) kept[k] = hashes[k]; else delete kept[k]; }
  const head = old.split(/^## Frames/m)[0].replace(new RegExp(`^\\s*[-*]?\\s*(?:approval|${OWN_KEY}):.*$`, "gim"), "").trimEnd() || "# DEMO";
  const keep = (old.split(/^## Frames/m)[1] || "").split(/\r?\n/).filter((l) => l.trim() && !l.includes(`(${label})`) && /^\s*-\s/.test(l));
  const list = [...keep, ...frames.map((f) => `- ${f} (${label})`)];
  const head2 = head.replace(/^\s*source:.*$/gim, "").trimEnd();
  const anim = [...DEMO_KEYS, REVIEW_KEY].filter((k) => kept[k]).map((k) => `${k}: ${kept[k]}\n`).join("");
  writeFileSync(p, `${head2}\n\n${source ? `source: ${source}\n` : ""}${anim}approval: pending\n\n## Frames\n\n${list.join("\n")}\n`);
}

// Writes or replaces DEMO.md `audio_review: <who> <ISO> <audioHash>` and returns the line; the rest
// of the file (approval: included) keeps its bytes. Throws when DEMO.md is missing or the sound
// cannot be hashed.
export function recordAudioReview(project, who, { now = new Date(), hash = audioHash } = {}) {
  if (!REVIEWER.test(String(who ?? ""))) throw Object.assign(new Error(`người nghe "${who}" không hợp lệ (chữ, số và . _ @ : + -)`), { code: "USAGE" });
  const p = join(project, "DEMO.md");
  if (!existsSync(p)) throw Object.assign(new Error("chưa có DEMO.md: chạy make-demo.mjs --animatic trước"), { code: "USAGE" });
  const line = `${REVIEW_KEY}: ${who} ${now.toISOString()} ${hash(project)}`;
  const text = readFileSync(p, "utf8");
  const own = new RegExp(`^[ \\t]*[-*]?[ \\t]*${REVIEW_KEY}:.*$`, "im");
  let next;
  if (own.test(text)) next = text.replace(own, () => line);
  else {
    const at = [/^[ \t]*[-*]?[ \t]*approval:/im, /^## Frames/m].map((re) => text.search(re)).find((i) => i >= 0);
    next = at == null ? `${text.replace(/\n*$/, "\n")}${line}\n` : `${text.slice(0, at)}${line}\n${text.slice(at)}`;
  }
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, next);
  renameSync(tmp, p);
  return line;
}

// Tile PNG frames side by side into one JPEG (best effort; returns false when ffmpeg fails).
export function contactSheet(pngs, out) {
  if (!pngs.length) return false;
  const args = ["-v", "error", "-y", ...pngs.flatMap((f) => ["-i", f]), "-filter_complex",
    `${pngs.map((_, i) => `[${i}:v]scale=-2:640[v${i}]`).join(";")};${pngs.map((_, i) => `[v${i}]`).join("")}hstack=inputs=${pngs.length}`, "-frames:v", "1", "-q:v", "3", out];
  if (pngs.length === 1) args.splice(args.indexOf("-filter_complex"), 2, "-vf", "scale=-2:640");
  return spawnSync("ffmpeg", args, { stdio: "ignore" }).status === 0;
}

// One PNG per timestamp, cut from an MP4 with ffmpeg.
export function cutFrames(mp4, times, outDir) {
  times.forEach((t, i) => {
    const png = join(outDir, `frame-${String(i).padStart(2, "0")}-at-${t}s.png`);
    const x = spawnSync("ffmpeg", ["-v", "error", "-y", "-ss", String(t), "-i", mp4, "-frames:v", "1", png], { stdio: "inherit" });
    if (x.status !== 0) throw new Error(`ffmpeg failed at ${t}s`);
  });
}

// Shortest scene that still gives a readable 18-frame sheet.
export const MIN_SHEET_S = 0.5;

// One 6x3 contact sheet per scene ({ sid, start, end } on the animatic's timeline) into
// <outDir>/scenes/sheet-<sid>.jpg; old sheets there are removed first. Returns the written paths.
export function sceneSheets(mp4, scenes, outDir, { run = spawnSync, warn = (s) => console.error(s) } = {}) {
  const dir = join(outDir, "scenes");
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (/^sheet-.*\.jpg$/i.test(f)) rmSync(join(dir, f));
  const out = [];
  for (const { sid, start, end } of scenes) {
    const len = Math.round((end - start) * 1000) / 1000;
    if (!(len >= MIN_SHEET_S)) { warn(`WARN cảnh ${sid} quá ngắn để làm sheet`); continue; }
    const jpg = join(dir, `sheet-${sid}.jpg`);
    const x = run("ffmpeg", ["-nostdin", "-v", "error", "-y", "-ss", String(start), "-t", String(len), "-i", mp4,
      "-vf", `fps=18/${len},scale=320:-1,tile=6x3`, "-frames:v", "1", jpg], { stdio: "inherit" });
    if (x.status === 0 && existsSync(jpg)) out.push(jpg);
    else warn(`WARN cảnh ${sid}: ffmpeg không cắt được sheet`);
  }
  return out;
}

function parseArgs(argv) {
  const o = { project: "." };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (["--project", "--hyperframes", "--composition", "--aspect"].includes(a)) o[a.slice(2)] = argv[++i];
    else if (a === "--from-video") o.fromVideo = argv[++i];
    else if (a === "--animatic") o.animatic = true;
    else if (a === "--record-audio-review") { o.review = argv[++i]; if (!o.review) return { bad: "--record-audio-review needs a name (user@studio)" }; }
    else return { bad: `unknown argument ${a}` };
  }
  if (o.review !== undefined && (o.animatic || o.fromVideo || o.composition || o.aspect || o.hyperframes)) return { bad: "--record-audio-review captures nothing; pass only --project with it" };
  if (o.fromVideo && o.composition) return { bad: "--from-video and --composition are exclusive" };
  if (o.fromVideo && o.animatic) return { bad: "--from-video and --animatic are exclusive (an animatic is a fresh full draft render)" };
  if (o.aspect && o.aspect !== "9x16") return { bad: "--aspect only accepts 9x16" };
  return o;
}

export function main(argv = process.argv.slice(2)) {
  if (wantsHelp(argv)) { process.stdout.write(helpText(import.meta.url)); return 0; }
  const o = parseArgs(argv);
  if (o.bad) { console.error(`make-demo: ${o.bad}`); return 2; }
  const project = resolve(o.project);
  if (o.review !== undefined) {
    const refused = audioReviewRefusal();
    if (refused) { console.error(`make-demo: ${refused}`); return 2; }
    try { console.log(`make-demo: ${recordAudioReview(project, o.review)}`); return 0; }
    catch (e) { console.error(`make-demo: ${e.message}`); return e.code === "USAGE" ? 2 : 1; }
  }
  const planPath = join(project, "PLAN.md");
  if (!existsSync(planPath)) { console.error("make-demo: PLAN.md not found"); return 2; }
  const plan = parsePlan(readFileSync(planPath, "utf8"));
  const times = o.aspect ? plan.demo916 || [] : plan.demo;
  if (!times.length) { console.error(`make-demo: PLAN.md has no timestamps under "## Khung hình demo${o.aspect ? " 9:16" : ""}"`); return 2; }
  const outDir = o.aspect ? join(project, "demo", "9x16") : join(project, "demo");
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(outDir)) if (/^frame-.*\.png$/i.test(f)) rmSync(join(outDir, f));
  const hf = resolve(o.hyperframes || project);

  let animatic = "", sheets = [], hashes;
  if (o.animatic) {
    const mp4 = join(outDir, "animatic.mp4"), full = join(outDir, "animatic.full.mp4");
    const args = ["hyperframes", "render", ...(o.composition ? ["-c", o.composition] : []), "--quality", "draft", "-o", full];
    const r = run("npx", args, { cwd: hf });
    if (r.status !== 0 || !existsSync(full)) { console.error("make-demo: animatic render failed"); return 1; }
    const scaled = spawnSync("ffmpeg", ["-nostdin", "-v", "error", "-y", "-i", full, "-vf", "scale='if(gt(iw,ih),-2,540)':'if(gt(iw,ih),540,-2)'", "-c:v", "libx264", "-crf", "26", "-preset", "veryfast", "-c:a", "aac", "-b:a", "128k", mp4], { stdio: "inherit" });
    if (scaled.status === 0 && existsSync(mp4)) rmSync(full, { force: true });
    else { renameSync(full, mp4); console.error("WARN animatic kept at full size (ffmpeg scale failed)"); }
    try { cutFrames(mp4, times, outDir); } catch (e) { console.error(`make-demo: ${e.message}`); return 1; }
    animatic = relative(project, mp4).split("\\").join("/");
    let scenes = [];
    try { scenes = planScenes(readFileSync(planPath, "utf8")); } catch (e) { console.error(`WARN không làm sheet từng cảnh: ${e.message}`); }
    sheets = sceneSheets(mp4, scenes, outDir).map((f) => relative(project, f).split("\\").join("/"));
    // Only the main animatic of index.html is what the final gate hashes; any other main one drops
    // the keys so the gate goes back to file dates.
    if (!o.aspect) {
      hashes = null;
      if (!o.composition && hf === project) {
        try { hashes = { visual_hash: pictureHash(project), audio_hash: audioHash(project) }; }
        catch (e) { console.error(`WARN không ghi visual_hash/audio_hash (cổng final so ngày sửa file): ${e.message}`); }
      }
    }
  } else if (o.fromVideo) {
    const mp4 = resolve(o.fromVideo);
    if (!existsSync(mp4)) { console.error(`make-demo: ${o.fromVideo} not found`); return 2; }
    const comp = existsSync(join(hf, "compositions")) ? readdirSync(join(hf, "compositions")).filter((f) => f.endsWith(".html")).map((f) => join(hf, "compositions", f)) : [];
    const newer = [join(hf, "index.html"), ...comp].filter((f) => existsSync(f) && statSync(f).mtimeMs > statSync(mp4).mtimeMs);
    if (newer.length) { console.error(`make-demo: ${o.fromVideo} is older than ${relative(hf, newer[0])}; render a new draft first`); return 2; }
    try { cutFrames(mp4, times, outDir); } catch (e) { console.error(`make-demo: ${e.message}`); return 1; }
  } else if (!o.composition) {
    const r = run("npx", ["hyperframes", "snapshot", hf, "--at", times.join(","), "--no-end", "--describe", "false", "-o", outDir]);
    if (r.status !== 0) { console.error("make-demo: hyperframes snapshot failed"); return 1; }
  } else {
    const tmp = mkdtempSync(join(tmpdir(), "ov-demo-"));
    try {
      const mp4 = join(tmp, "draft.mp4");
      const r = run("npx", ["hyperframes", "render", "-c", o.composition, "--quality", "draft", "-o", mp4], { cwd: hf });
      if (r.status !== 0 || !existsSync(mp4)) { console.error("make-demo: draft render failed"); return 1; }
      cutFrames(mp4, times, outDir);
    } catch (e) { console.error(`make-demo: ${e.message}`); return 1; }
    finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  const frames = readdirSync(outDir).filter((f) => /^frame-.*\.png$/i.test(f)).sort().map((f) => relative(project, join(outDir, f)).split("\\").join("/"));
  writeDemoMd(project, frames, o.aspect ? "9:16" : "main", o.fromVideo ? relative(project, resolve(o.fromVideo)).split("\\").join("/") : "", animatic, sheets, hashes);
  const sheet = join(outDir, "contact-sheet.jpg");
  const sheetOk = contactSheet(frames.map((f) => join(project, f)), sheet);
  console.log(`make-demo: ${frames.length} frames → ${relative(project, outDir) || "."}/${animatic ? ` · animatic ${animatic} · ${sheets.length} scene sheet(s)` : ""}${sheetOk ? ` · ${relative(project, sheet).split("\\").join("/")}` : ""} · DEMO.md approval reset to pending`);
  console.log("Next: show these frames (and demo/contact-sheet.jpg if present) to the user, then write their answer as `approval: …` in DEMO.md.");
  return 0;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
