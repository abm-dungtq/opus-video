#!/usr/bin/env node
// composition.mjs — start a project's index.html from the opus-video composition skeleton
// (templates/composition/index-skeleton.html): animation vocabulary, W()/WE() anchors on spoken
// phrases, B() on the measured beat grid, and an empty TIMING block for timing.mjs to fill.
//   node composition.mjs init --project <dir> [--aspect 16:9|9:16]
//   node composition.mjs --help | -h
// --aspect   frame size: 16:9 → 1920x1080, 9:16 → 1080x1920. Without it, `aspect:` in the BRIEF.md
//            frontmatter decides; `both` starts from 16:9 (the 9:16 edition is derived from it);
//            no BRIEF.md and no --aspect → 16:9.
// Writes <dir>/index.html with data-width/data-height on the root composition, data-ratio and
// data-resolution on <html>, the viewport and the --W/--H CSS variables set for that frame.
// Never overwrites: an existing index.html exits 1.
// Next: node timing.mjs --project <dir>
// Exit: 0 written · 1 index.html exists or cannot be written · 2 bad usage, unknown aspect or
// missing project directory.

import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { frontmatter } from "./check-viet-pro.mjs";

export const SKELETON = fileURLToPath(new URL("../templates/composition/index-skeleton.html", import.meta.url));

// Supported frames. `both` is resolved to 16:9 before lookup.
export const FRAMES = {
  "16:9": { width: 1920, height: 1080, ratio: "16x9", resolution: "landscape" },
  "9:16": { width: 1080, height: 1920, ratio: "9x16", resolution: "portrait" },
};

// --aspect value or BRIEF.md aspect → a FRAMES key, or null when unsupported.
export function aspectKey(value) {
  const v = String(value ?? "").trim().toLowerCase().replace(/x/g, ":");
  if (!v || v === "both") return "16:9";
  return FRAMES[v] ? v : null;
}

// Skeleton text → the same text sized for one frame. Throws when the skeleton lost an anchor.
export function sizeSkeleton(text, key) {
  const f = FRAMES[key];
  if (!f) throw new Error(`unknown aspect ${key}`);
  const subs = [
    [/(<div id="root"[^>]*\sdata-width=")\d+(")/, `$1${f.width}$2`],
    [/(<div id="root"[^>]*\sdata-height=")\d+(")/, `$1${f.height}$2`],
    [/(<html\b[^>]*\sdata-ratio=")[^"]*(")/, `$1${f.ratio}$2`],
    [/(<html\b[^>]*\sdata-resolution=")[^"]*(")/, `$1${f.resolution}$2`],
    [/(<meta name="viewport" content="width=)\d+(, height=)\d+(")/, `$1${f.width}$2${f.height}$3`],
    [/(--W:\s*)\d+(px;\s*--H:\s*)\d+(px)/, `$1${f.width}$2${f.height}$3`],
  ];
  let out = text;
  for (const [re, rep] of subs) {
    if (!re.test(out)) throw new Error(`skeleton has no match for ${re}`);
    out = out.replace(re, rep);
  }
  return out;
}

export function main(argv = process.argv.slice(2), { out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s), skeleton = SKELETON } = {}) {
  if (wantsHelp(argv)) { out(helpText(import.meta.url)); return 0; }
  const usage = "usage: node composition.mjs init --project <dir> [--aspect 16:9|9:16]";
  const [cmd, ...rest] = argv;
  if (cmd !== "init") { err(`composition: ${cmd ? `unknown command ${cmd}` : "missing command"}\n${usage}\n`); return 2; }
  const o = { project: null, aspect: null };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--project" || a === "--aspect") { const v = rest[++i]; if (!v || v.startsWith("--")) { err(`composition: ${a} needs a value\n${usage}\n`); return 2; } o[a.slice(2)] = v; }
    else { err(`composition: unknown argument ${a}\n${usage}\n`); return 2; }
  }
  if (!o.project) { err(`composition: --project is required\n${usage}\n`); return 2; }
  const dir = resolve(o.project);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) { err(`composition: project directory not found: ${dir}\n`); return 2; }

  let source = o.aspect;
  if (source == null) {
    const brief = join(dir, "BRIEF.md");
    source = existsSync(brief) ? frontmatter(readFileSync(brief, "utf8")).aspect : undefined;
  }
  const key = aspectKey(source);
  if (!key) { err(`composition: aspect "${source}" không hỗ trợ (dùng 16:9, 9:16 hoặc both)\n`); return 2; }

  const target = join(dir, "index.html");
  if (existsSync(target)) { err("composition: index.html đã có; không ghi đè\n"); return 1; }
  let html;
  try { html = sizeSkeleton(readFileSync(skeleton, "utf8"), key); } catch (e) { err(`composition: cannot read the skeleton ${skeleton}: ${e.message}\n`); return 1; }
  try { writeFileSync(target, html, { flag: "wx" }); } catch (e) { err(`composition: cannot write ${target}: ${e.message}\n`); return 1; }
  const f = FRAMES[key];
  out(`index.html ${f.width}x${f.height} (${key}) → ${target}\nnext: node timing.mjs --project ${o.project}\n`);
  return 0;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
