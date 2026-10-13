#!/usr/bin/env node
// video-lint.mjs — catch what `hyperframes check` misses in a HyperFrames project.
//   node video-lint.mjs --hyperframes <dir> [--json] [--skip-runtime]
//   node video-lint.mjs --help
// Codes:
//   LOWERCASE_TRANSFORM  ERROR  text-transform: lowercase (turns "AI" into "ai").
//   FONT_TOO_SMALL       ERROR < 1.6% / WARN < 2.2% of the short canvas edge (px, cqw, vw).
//   SAFE_ZONE_9X16       ERROR  text in the top 12% / bottom 20% UI bands of a portrait
//                               canvas, via `hyperframes check --caption-zone` (runtime).
//   HEDGE_LABEL          ERROR when BRIEF.md has `voice_source: clip` (the user's own content),
//                        WARN otherwise: on-screen hedges such as "minh họa", "không đúng tỉ lệ",
//                        "theo người đăng", "theo lời người nói", "video độc lập", "~" before a
//                        number. Scans rendered text only: HTML text nodes and inline scripts
//                        (tags, attributes and <title> blanked), plus local *.js files the HTML
//                        loads via <script src> (not *.min.js); comments, Error(…) and console.*
//                        lines are skipped, and so is any line containing `hedge-ok`.
// Exit: 0 clean or warnings only · 1 any ERROR · 2 bad usage or tool failure.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { maybeHelp } from "./cli-help.mjs";
import { frontmatter } from "./check-viet-pro.mjs";
maybeHelp(process.argv.slice(2), import.meta.url);

const SEEK = "seek=.05,.15,.25,.35,.45,.55,.65,.75,.85,.95";
const ZONES = [
  { name: "top", spec: `x0=0;y0=0;x1=1;y1=.12;severity=error;${SEEK}` },
  { name: "bottom", spec: `x0=0;y0=.80;x1=1;y1=1;severity=error;${SEEK}`, skipCaptions: true },
];
const FONT_ERROR_RATIO = 0.016;
const FONT_WARN_RATIO = 0.022;

const fail = (msg) => {
  console.error(`video-lint: ${msg}`);
  process.exit(2);
};

const argv = process.argv.slice(2);
const opts = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--json" || a === "--skip-runtime") opts[a.slice(2)] = true;
  else if (a === "--hyperframes") opts.hyperframes = argv[++i];
  else fail(`unknown argument ${a}\nusage: node video-lint.mjs --hyperframes <dir> [--json] [--skip-runtime]  (--help for details)`);
}
if (!opts.hyperframes) fail("missing --hyperframes <dir>");
const dir = resolve(opts.hyperframes);
const indexPath = join(dir, "index.html");
if (!existsSync(indexPath)) fail(`no index.html in ${dir}`);

const indexHtml = readFileSync(indexPath, "utf8");
const dim = (attr) => {
  const m = indexHtml.match(new RegExp(`data-${attr}\\s*=\\s*["']?(\\d+(?:\\.\\d+)?)`));
  if (!m) fail(`no data-${attr} in ${indexPath}`);
  return Number(m[1]);
};
const W = dim("width");
const H = dim("height");
const short = Math.min(W, H);

function htmlFilesUnder(root) {
  if (!existsSync(root)) return [];
  const out = [];
  for (const name of readdirSync(root)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(root, name);
    if (statSync(p).isDirectory()) out.push(...htmlFilesUnder(p));
    else if (name.endsWith(".html")) out.push(p);
  }
  return out.sort();
}

export const HEDGE = /minh\s+h(?:ọa|oạ)|không\s+đúng\s+tỉ\s+lệ|theo\s+người\s+(?:đăng|bán)|theo\s+lời\s+người\s+nói|video\s+độc\s+lập|ví\s+dụ\s+giả\s+lập|~\s?\d/giu;
// Blank out comments (keep offsets, so line numbers stay right): HTML, block and line comments.
const blank = (m) => m.replace(/[^\n]/g, " ");
export const stripComments = (t) =>
  t.replace(/<!--[\s\S]*?-->/g, blank).replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[\s;{}()])\/\/[^\n]*/gm, (m, p) => p + blank(m.slice(p.length)));
// HTML: keep only text between tags (inline <script>/<style> bodies included); <title> is not on screen.
export const htmlText = (t) => stripComments(t).replace(/<title>[\s\S]*?<\/title>/gi, blank).replace(/<[^>]*>/g, blank);
const notRendered = (line) => /\bError\(|\bconsole\.|hedge-ok/.test(line);
// Local scripts an HTML file loads (relative src, not CDN, not minified bundles).
const scriptSrcs = (html, file) => [...html.matchAll(/<script[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)]
  .map((m) => m[1]).filter((s) => !/^[a-z]+:|^\/\//i.test(s) && !/\.min\.js$/i.test(s))
  .map((s) => resolve(dirname(file), s.split(/[?#]/)[0])).filter((p) => p.startsWith(dir) && existsSync(p));

const files = [indexPath, ...htmlFilesUnder(join(dir, "compositions"))];
const skin = join(dir, ".hyperframes", "caption-skin.html");
if (existsSync(skin)) files.push(skin);

const findings = [];
const add = (severity, code, file, line, message) =>
  findings.push({ severity, code, file: relative(dir, file) || file, line, message });
const lineAt = (text, index) => text.slice(0, index).split("\n").length;

const briefPath = join(dir, "BRIEF.md");
const clipVoice = existsSync(briefPath) && /^clip$/i.test((frontmatter(readFileSync(briefPath, "utf8")).voice_source || "").trim());
const scripts = [...new Set(files.flatMap((f) => scriptSrcs(readFileSync(f, "utf8"), f)))];
for (const file of [...files, ...scripts]) {
  const raw = readFileSync(file, "utf8").normalize("NFC");
  const text = file.endsWith(".html") ? htmlText(raw) : stripComments(raw);
  const lines = raw.split("\n");
  for (const m of text.matchAll(HEDGE)) {
    const line = lineAt(text, m.index);
    if (notRendered(lines[line - 1])) continue;
    add(clipVoice ? "ERROR" : "WARN", "HEDGE_LABEL", file, line,
      `"${m[0]}" hedges the user's own content on screen; show the fact plainly and keep source notes in BRIEF.md/PLAN.md or code comments`);
  }
}

for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/text-transform\s*:\s*lowercase/gi)) {
    add("ERROR", "LOWERCASE_TRANSFORM", file, lineAt(text, m.index),
      `"${m[0]}" lowercases acronyms and proper nouns; use none and write the case you want`);
  }
  for (const m of text.matchAll(/font-size\s*:\s*([\d.]+)(px|cqw|vw)\b/gi)) {
    const value = Number(m[1]);
    if (!Number.isFinite(value)) continue;
    const px = m[2].toLowerCase() === "px" ? value : (value * W) / 100;
    const severity = px < FONT_ERROR_RATIO * short ? "ERROR" : px < FONT_WARN_RATIO * short ? "WARN" : null;
    if (!severity) continue;
    const floor = (severity === "ERROR" ? FONT_ERROR_RATIO : FONT_WARN_RATIO) * short;
    add(severity, "FONT_TOO_SMALL", file, lineAt(text, m.index),
      `${m[0]} = ${px.toFixed(1)}px < ${floor.toFixed(1)}px on a ${W}x${H} canvas`);
  }
}

// Locate `id="x"` for a `#x` selector so runtime findings still point at a line.
function lineOfSelector(file, selector) {
  const id = selector?.match(/#([\w-]+)\s*$/)?.[1];
  if (!id || !existsSync(file)) return 0;
  const text = readFileSync(file, "utf8");
  const m = text.match(new RegExp(`id\\s*=\\s*["']${id}["']`));
  return m ? lineAt(text, m.index) : 0;
}

function runCheck(zone) {
  const r = spawnSync("hyperframes", ["check", "--json", "--caption-zone", zone.spec], {
    cwd: dir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 10 * 60 * 1000,
    env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: "1" },
  });
  if (r.error) fail(`hyperframes check (${zone.name} zone) failed to run: ${r.error.message}`);
  const out = r.stdout ?? "";
  const start = out.indexOf("{");
  try {
    if (start < 0) throw new Error("no JSON on stdout");
    return JSON.parse(out.slice(start));
  } catch (e) {
    fail(`hyperframes check (${zone.name} zone) exit ${r.status}: ${e.message}\n${(r.stderr ?? "").slice(-2000)}`);
  }
}

if (H > W && !opts["skip-runtime"]) {
  const captionsSrc = indexHtml.match(/<[^>]*\bid\s*=\s*["']el-captions["'][^>]*>/)?.[0]
    .match(/data-composition-src\s*=\s*["']([^"']+)["']/)?.[1];
  const isCaption = (f) =>
    /#el-captions\b/.test(f.selector ?? "") || (captionsSrc && f.sourceFile === captionsSrc);
  for (const zone of ZONES) {
    const report = runCheck(zone);
    const seen = new Set();
    for (const f of report?.layout?.findings ?? []) {
      if (f.code !== "caption_zone_collision") continue;
      if (zone.skipCaptions && isCaption(f)) continue;
      const key = `${f.sourceFile}|${f.selector}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const file = join(dir, f.sourceFile ?? "index.html");
      const text = f.text ? ` "${f.text}"` : "";
      add("ERROR", "SAFE_ZONE_9X16", file, lineOfSelector(file, f.selector),
        `${f.selector}${text} enters the ${zone.name} UI band at ${f.time}s`);
    }
  }
}

if (opts.json) console.log(JSON.stringify(findings, null, 2));
else {
  for (const f of findings) console.log(`${f.severity} ${f.code} ${f.file}:${f.line} ${f.message}`);
  if (!findings.length) console.log("video-lint: clean");
}
process.exitCode = findings.some((f) => f.severity === "ERROR") ? 1 : 0;
