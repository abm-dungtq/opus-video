#!/usr/bin/env node
// reframe.mjs — derive the 9:16 or 1:1 edition of a 16:9 project built from one ratio-aware
// index.html. The edition keeps the master's voice, music, TIMING and mix; only the frame size and
// the html data-ratio flag change, so the layout comes from the master's html[data-ratio="…"] CSS.
// Never crops: write the overrides in the master, then run this again after every master change.
//   node reframe.mjs <project> --ratio 9x16|1x1 [--out <dir>] [--force]
//   node reframe.mjs --help | -h
// --out    edition directory (default <project>-9x16 or <project>-1x1 next to the project).
// --force  rewrite an edition this script wrote before (it holds .reframe.json naming the same
//          master) or an empty directory. Any other existing directory is refused, even with --force.
//          Only what reframe writes is replaced (index.html, BRIEF.md, compositions/, assets/, the
//          copied files and .reframe.json); the edition's renders/, demo/, DEMO.md, QA.md,
//          REVISIONS.md, timing.json and any other file stay.
// Writes: index.html (root data-width/data-height 1080x1920 or 1080x1080, <html> data-ratio and
//   data-resolution, viewport, --W/--H), BRIEF.md (frontmatter aspect: 9:16 or 1:1), copies of
//   compositions/, hyperframes.json, package.json and PLAN.md, and assets/ cloned file by file
//   (APFS copy-on-write clone: no extra space until one side changes; a plain copy where the disk
//   cannot clone, e.g. another volume). A write into the edition's assets/ never reaches the
//   master's file. renders/, demo/, qa/, qc/ and .hyperframes/ are not carried over.
// WARN layout  one line per left/top/width/height ≥ 1080 px in a <style> block or a style=""
//   attribute (index.html and compositions/) outside any html[data-ratio=…] block: a 1920x1080
//   value that will not fit the new frame.
// WARN lemo    the master has a lemo-canvas layer (lemo.mjs add): its scene is drawn for the
//   master's frame (a 2D canvas keeps 1920x1080 and is stretched), so the edition needs its own scene.
// A frame-worker project (compositions/frames/) is refused: its 9:16 edition is a separate project,
//   see references/engine-selection.md.
// Next: cd <edition> && npx --yes hyperframes@0.8.192 lint && npx --yes hyperframes@0.8.192 check
// Exit: 0 written (WARN lines allowed) · 1 edition exists, frame-worker project, no root
//   composition, or a write failed · 2 bad usage, or the project / its index.html is missing.

import { constants, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";

export const RATIOS = {
  "9x16": { width: 1080, height: 1920, aspect: "9:16", resolution: "portrait" },
  "1x1": { width: 1080, height: 1080, aspect: "1:1", resolution: "square" },
};
export const MARKER = ".reframe.json";
const COPIED = ["hyperframes.json", "package.json", "PLAN.md"];
// Everything reframe writes into an edition; --force removes these and nothing else.
export const OWNED = [MARKER, "index.html", "BRIEF.md", "compositions", "assets", ...COPIED];
const LAYOUT_PX = 1080;

// html[data-ratio="…"] rule blocks: written for the edition's frame, so not scanned.
const RATIO_BLOCK = /html\[data-ratio=[^\]]*\][^{}]*\{[^}]*\}/g;
const PX_PROP = /(?<![\w-])(left|top|width|height)\s*:\s*(\d+(?:\.\d+)?)px/g;

// Master index.html → the edition's index.html. Throws when there is no root composition or <html>.
export function editionHtml(text, ratio) {
  const f = RATIOS[ratio];
  if (!f) throw new Error(`unknown ratio ${ratio}`);
  const rootRe = /<[a-z][\w-]*\b[^>]*\bdata-composition-id="[^"]*"[^>]*>/i;
  const root = text.match(rootRe);
  if (!root || !/\bdata-width="\d+"/.test(root[0]) || !/\bdata-height="\d+"/.test(root[0])) {
    throw new Error('không thấy composition gốc có data-composition-id, data-width="…" và data-height="…"');
  }
  const rootTag = root[0].replace(/\bdata-width="\d+"/, `data-width="${f.width}"`).replace(/\bdata-height="\d+"/, `data-height="${f.height}"`);
  let out = text.replace(rootRe, () => rootTag);
  const html = out.match(/<html\b[^>]*>/i);
  if (!html) throw new Error("không thấy thẻ <html>");
  const htmlTag = html[0].replace(/\s(data-ratio|data-resolution)="[^"]*"/g, "").replace(/>$/, ` data-resolution="${f.resolution}" data-ratio="${ratio}">`);
  out = out.replace(/<html\b[^>]*>/i, () => htmlTag);
  out = out.replace(/(<meta name="viewport" content=")[^"]*(")/, `$1width=${f.width}, height=${f.height}$2`);
  const vars = /(--W:\s*)\d+(px;\s*--H:\s*)\d+(px)/;
  if (vars.test(out)) out = out.replace(vars, `$1${f.width}$2${f.height}$3`);
  else out = out.replace(/<\/head>/i, `<style>/* reframe */ :root { --W: ${f.width}px; --H: ${f.height}px; }</style>\n</head>`);
  return out;
}

// BRIEF.md → the same text with frontmatter `aspect:` set for the edition (added when missing).
// A BRIEF without frontmatter is returned unchanged.
export function editionBrief(text, ratio) {
  const aspect = RATIOS[ratio].aspect;
  const fm = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return text;
  const body = /^aspect:.*$/m.test(fm[1]) ? fm[1].replace(/^aspect:.*$/m, `aspect: ${aspect}`) : `aspect: ${aspect}\n${fm[1]}`;
  return text.replace(fm[1], () => body);
}

// Pixel values for a 1920x1080 frame in one HTML text: [{ line, prop, px }] for every
// left/top/width/height ≥ 1080 px inside a <style> block or a style="" attribute, outside any
// html[data-ratio=…] block.
export function layoutWarnings(text) {
  const src = String(text);
  const found = [];
  const regions = /<style\b[^>]*>([\s\S]*?)<\/style>|\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  for (const m of src.matchAll(regions)) {
    const body = m[1] ?? m[2] ?? m[3] ?? "";
    const offset = m.index + m[0].indexOf(body);
    const scan = body.replace(RATIO_BLOCK, (b) => b.replace(/[^\n]/g, " ")); // keep offsets
    for (const p of scan.matchAll(PX_PROP)) {
      const px = Number(p[2]);
      if (px < LAYOUT_PX) continue;
      const line = src.slice(0, offset + p.index).split("\n").length;
      found.push({ line, prop: p[1], px });
    }
  }
  return found;
}

const htmlFiles = (dir) => (existsSync(dir) ? readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith(".html")).sort() : []);

// Clones every file under src into dst (symlinks followed, loops skipped). COPYFILE_FICLONE makes
// an APFS copy-on-write clone and falls back to a real copy where cloning is unsupported; never a
// hard link, which would let a write in the edition (a new voice take, beat-grid --write) change
// the master's file. Returns { files, skipped: [path] }.
export function cloneTree(src, dst) {
  const res = { files: 0, skipped: [] };
  const walk = (s, d, chain) => {
    const real = realpathSync(s);
    if (chain.includes(real)) { res.skipped.push(s); return; }
    mkdirSync(d, { recursive: true });
    for (const name of readdirSync(s).sort()) {
      const sp = join(s, name), dp = join(d, name);
      let st;
      try { st = statSync(sp); } catch { res.skipped.push(sp); continue; } // broken symlink
      if (st.isDirectory()) { walk(sp, dp, [...chain, real]); continue; }
      if (!st.isFile()) { res.skipped.push(sp); continue; }
      copyFileSync(realpathSync(sp), dp, constants.COPYFILE_FICLONE);
      res.files++;
    }
  };
  walk(src, dst, []);
  return res;
}

// child is parent itself or lies under it. macOS volumes (APFS, HFS+) are case-insensitive by
// default, so on darwin /Volumes/2/edit-video and /Volumes/2/Edit-Video are the same folder.
export const inside = (child, parent, platform = process.platform) => {
  const fold = platform === "darwin" ? (s) => s.toLowerCase() : (s) => s;
  const r = relative(fold(parent), fold(child));
  return r !== ".." && !r.startsWith(`..${sep}`) && !isAbsolute(r);
};

// A directory --force may replace: empty, or an edition of this same master.
function replaceable(out, project) {
  if (!readdirSync(out).length) return { ok: true };
  const marker = join(out, MARKER);
  if (!existsSync(marker)) return { ok: false, why: `${out} không do reframe.mjs tạo (không có ${MARKER}); xoá tay hoặc chọn --out khác` };
  let master;
  try { master = JSON.parse(readFileSync(marker, "utf8")).master; } catch (e) { return { ok: false, why: `${marker} không đọc được (${e.message}); xoá tay hoặc chọn --out khác` }; }
  if (typeof master !== "string" || resolve(master) !== project) return { ok: false, why: `${out} là bản của ${master}; chọn --out khác` };
  return { ok: true };
}

export function main(argv = process.argv.slice(2), { out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}) {
  if (wantsHelp(argv)) { out(helpText(import.meta.url)); return 0; }
  const usage = "usage: node reframe.mjs <project> --ratio 9x16|1x1 [--out <dir>] [--force]";
  const o = { project: null, ratio: null, out: null, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ratio" || a === "--out") { const v = argv[++i]; if (!v || v.startsWith("--")) { err(`reframe: ${a} needs a value\n${usage}\n`); return 2; } o[a.slice(2)] = v; }
    else if (a === "--force") o.force = true;
    else if (a.startsWith("--") || o.project) { err(`reframe: unknown argument ${a}\n${usage}\n`); return 2; }
    else o.project = a;
  }
  if (!o.project) { err(`reframe: project directory is required\n${usage}\n`); return 2; }
  if (!RATIOS[o.ratio]) { err(`reframe: --ratio must be 9x16 or 1x1\n${usage}\n`); return 2; }
  const project = resolve(o.project);
  const index = join(project, "index.html");
  if (!existsSync(project) || !statSync(project).isDirectory()) { err(`reframe: project directory not found: ${project}\n`); return 2; }
  if (!existsSync(index)) { err(`reframe: index.html not found in ${project}\n`); return 2; }
  if (existsSync(join(project, "compositions", "frames"))) {
    err("reframe: workflow frame-worker: làm bản 9:16 theo references/engine-selection.md\n");
    return 1;
  }

  const dest = resolve(o.out ?? join(dirname(project), `${basename(project)}-${o.ratio}`));
  if (inside(dest, project) || inside(project, dest)) { err(`reframe: thư mục bản ${dest} không được nằm trong dự án gốc hay chứa nó\n`); return 1; }
  if (existsSync(dest)) {
    if (!o.force) { err(`reframe: ${dest} đã có; thêm --force để ghi đè\n`); return 1; }
    if (!statSync(dest).isDirectory()) { err(`reframe: ${dest} không phải thư mục\n`); return 1; }
    const r = replaceable(dest, realpathSync(project));
    if (!r.ok) { err(`reframe: ${r.why}\n`); return 1; }
  }

  let html;
  try { html = editionHtml(readFileSync(index, "utf8"), o.ratio); } catch (e) { err(`reframe: index.html: ${e.message}\n`); return 1; }
  const lines = [];
  for (const rel of ["index.html", ...htmlFiles(join(project, "compositions")).map((f) => join("compositions", f))]) {
    for (const w of layoutWarnings(readFileSync(join(project, rel), "utf8"))) {
      lines.push(`WARN  layout ${rel}:${w.line} ${w.prop}: ${w.px}px nằm ngoài khối html[data-ratio=…]; khung ${o.ratio} chỉ rộng ${RATIOS[o.ratio].width}px`);
    }
  }

  const lemo = readFileSync(index, "utf8").match(/<!-- lemo-style: (\S+) -->/)?.[1];
  if (lemo) lines.push(`WARN  lemo index.html: lớp lemo-canvas ${lemo} vẽ theo khung gốc; khung ${o.ratio} cần cảnh riêng, xem lại từng shot trước khi giao`);

  let assets = { files: 0, skipped: [] };
  try {
    for (const name of OWNED) rmSync(join(dest, name), { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, MARKER), `${JSON.stringify({ master: realpathSync(project), ratio: o.ratio }, null, 2)}\n`);
    writeFileSync(join(dest, "index.html"), html);
    for (const name of COPIED) if (existsSync(join(project, name))) copyFileSync(join(project, name), join(dest, name));
    const brief = join(project, "BRIEF.md");
    if (existsSync(brief)) writeFileSync(join(dest, "BRIEF.md"), editionBrief(readFileSync(brief, "utf8"), o.ratio));
    if (existsSync(join(project, "compositions"))) cpSync(join(project, "compositions"), join(dest, "compositions"), { recursive: true, dereference: true });
    if (existsSync(join(project, "assets"))) assets = cloneTree(join(project, "assets"), join(dest, "assets"));
  } catch (e) { err(`reframe: cannot write ${dest}: ${e.message}\n`); return 1; }
  for (const s of assets.skipped) lines.push(`WARN  assets bỏ qua ${relative(project, s)} (liên kết hỏng, vòng lặp hoặc không phải tệp)`);

  const f = RATIOS[o.ratio];
  out(lines.map((l) => `${l}\n`).join(""));
  out(`OK    reframe ${o.ratio} ${f.width}x${f.height} → ${dest} (assets: ${assets.files} tệp clone)\n`);
  out(`next: cd ${dest} && npx --yes hyperframes@0.8.192 lint && npx --yes hyperframes@0.8.192 check\n`);
  return 0;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
