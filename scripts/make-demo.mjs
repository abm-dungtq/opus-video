#!/usr/bin/env node
// make-demo.mjs — capture the demo frames that PLAN.md asks for and (re)write DEMO.md with
// `approval: pending`. Show the frames to the user, then record their answer in DEMO.md
// (`approval: <who, when, what>`); render-final.mjs refuses the final render until then.
//   node make-demo.mjs [--project .] [--hyperframes <dir>] [--composition <file>] [--aspect 9x16]
//   node make-demo.mjs [--project .] --from-video <draft.mp4> [--aspect 9x16]
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
// Exit: 0 frames captured · 1 capture failed · 2 bad usage / PLAN.md missing timestamps.

import { existsSync, readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync, mkdtempSync, realpathSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { parsePlan } from "./check-preflight.mjs";

const WIN = process.platform === "win32";
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { stdio: "inherit", shell: WIN && cmd === "npx", ...opts });

// Rewrite DEMO.md: keep any free text above "## Frames", replace the frame list, reset approval.
export function writeDemoMd(project, frames, label, source = "") {
  const p = join(project, "DEMO.md");
  const old = existsSync(p) ? readFileSync(p, "utf8") : "";
  const head = old.split(/^## Frames/m)[0].replace(/^\s*[-*]?\s*approval:.*$/gim, "").trimEnd() || "# DEMO";
  const keep = (old.split(/^## Frames/m)[1] || "").split(/\r?\n/).filter((l) => l.trim() && !l.includes(`(${label})`) && /^\s*-\s/.test(l));
  const list = [...keep, ...frames.map((f) => `- ${f} (${label})`)];
  const head2 = head.replace(/^\s*source:.*$/gim, "").trimEnd();
  writeFileSync(p, `${head2}\n\n${source ? `source: ${source}\n` : ""}approval: pending\n\n## Frames\n\n${list.join("\n")}\n`);
}

// One PNG per timestamp, cut from an MP4 with ffmpeg.
export function cutFrames(mp4, times, outDir) {
  times.forEach((t, i) => {
    const png = join(outDir, `frame-${String(i).padStart(2, "0")}-at-${t}s.png`);
    const x = spawnSync("ffmpeg", ["-v", "error", "-y", "-ss", String(t), "-i", mp4, "-frames:v", "1", png], { stdio: "inherit" });
    if (x.status !== 0) throw new Error(`ffmpeg failed at ${t}s`);
  });
}

function parseArgs(argv) {
  const o = { project: "." };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (["--project", "--hyperframes", "--composition", "--aspect"].includes(a)) o[a.slice(2)] = argv[++i];
    else if (a === "--from-video") o.fromVideo = argv[++i];
    else return { bad: `unknown argument ${a}` };
  }
  if (o.fromVideo && o.composition) return { bad: "--from-video and --composition are exclusive" };
  if (o.aspect && o.aspect !== "9x16") return { bad: "--aspect only accepts 9x16" };
  return o;
}

export function main(argv = process.argv.slice(2)) {
  if (wantsHelp(argv)) { process.stdout.write(helpText(import.meta.url)); return 0; }
  const o = parseArgs(argv);
  if (o.bad) { console.error(`make-demo: ${o.bad}`); return 2; }
  const project = resolve(o.project);
  const planPath = join(project, "PLAN.md");
  if (!existsSync(planPath)) { console.error("make-demo: PLAN.md not found"); return 2; }
  const plan = parsePlan(readFileSync(planPath, "utf8"));
  const times = o.aspect ? plan.demo916 || [] : plan.demo;
  if (!times.length) { console.error(`make-demo: PLAN.md has no timestamps under "## Khung hình demo${o.aspect ? " 9:16" : ""}"`); return 2; }
  const outDir = o.aspect ? join(project, "demo", "9x16") : join(project, "demo");
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(outDir)) if (/^frame-.*\.png$/i.test(f)) rmSync(join(outDir, f));
  const hf = resolve(o.hyperframes || project);

  if (o.fromVideo) {
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
  writeDemoMd(project, frames, o.aspect ? "9:16" : "main", o.fromVideo ? relative(project, resolve(o.fromVideo)).split("\\").join("/") : "");
  console.log(`make-demo: ${frames.length} frames → ${relative(project, outDir) || "."}/ · DEMO.md approval reset to pending`);
  console.log("Next: show these frames (and demo/contact-sheet.jpg if present) to the user, then write their answer as `approval: …` in DEMO.md.");
  return 0;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
