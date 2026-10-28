#!/usr/bin/env node
// lemo.mjs — add a lemo-opuscar style (github.com/lemomo-ai/lemo-opuscar, MIT) as a canvas layer
// under a HyperFrames composition. The style's engine draws into #bg; the GSAP timeline drives it
// through window.lemoRender(t, win), so the player, Motion Studio and render-final stay unchanged.
// Vietnamese text stays in the DOM layer. Styles and the pinned commit live in data/lemo/styles.json.
//   node lemo.mjs fetch
//   node lemo.mjs list [--json]
//   node lemo.mjs add --project <dir> --style <slug> [--force]
//   node lemo.mjs remove --project <dir>
//   node lemo.mjs --help | -h
// fetch   partial, sparse clone of the pinned commit (the files the catalog names, plus every
//         style's style.json and STYLE.md for lemo-pick.mjs) into
//         $LEMO_OPUSCAR_HOME/<sha> (default ~/.cache/opus-video/lemo-opuscar), and `npm pack` of
//         three@<version> into $LEMO_OPUSCAR_HOME/three-<version>. An existing clone is checked,
//         never reset; a style added to the catalog later is checked out on the next fetch.
// add     needs the cache from fetch (works offline after it). Copies the style's engine files to
//         <dir>/assets/lemo/; 2D styles get paper.jpg from the style's paper.py (Python with numpy
//         and Pillow: $OV_PYTHON, else ~/.claude/skills/.venv/bin/python3, else python3); 3D styles
//         get three under <dir>/assets/three/{lib,addons}. Fills the LEMO-LAYER markers in #bg (the
//         canvas, scripts or importmap) and the LEMO markers in the timeline script (the bridge),
//         writes LICENSE-lemo-opuscar, LICENSE-three and CREDITS, and starts assets/lemo/scene.js
//         (2D) or scene3d.js (3D) from templates/lemo/ only when that file does not exist yet.
// remove  empties both marker pairs and deletes what add copied; keeps scene.js / scene3d.js.
// Exit: 0 done · 2 bad usage or unknown style · 3 index.html missing or without the markers ·
// 4 cache missing or wrong commit, fetch failed, or paper.py failed · 5 layer or engine files
// already there (pass --force to replace them).

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";

export const CATALOG = fileURLToPath(new URL("../data/lemo/styles.json", import.meta.url));
export const TEMPLATES = fileURLToPath(new URL("../templates/lemo/", import.meta.url));
const STYLES_DIR = fileURLToPath(new URL("../data/styles/", import.meta.url));

export const MARK = {
  layer: ["<!-- LEMO-LAYER:BEGIN -->", "<!-- LEMO-LAYER:END -->"],
  bridge: ["/* LEMO:BEGIN */", "/* LEMO:END */"],
};

export const cacheHome = (env = process.env) => env.LEMO_OPUSCAR_HOME || join(homedir(), ".cache", "opus-video", "lemo-opuscar");
export const repoDir = (home, cat) => join(home, cat.sha);
export const threeDir = (home, cat) => join(home, `three-${cat.three}`, "package");

// The library data every style has, for lemo-pick.mjs (styles/<slug>/style.json and STYLE.md).
export const LIBRARY_GLOBS = ["styles/*/style.json", "styles/*/STYLE.md"];

// Every repo path the catalog needs, for the sparse checkout.
export function sparsePaths(cat) {
  const paths = new Set(["LICENSE"]);
  for (const s of Object.values(cat.styles)) for (const p of [...s.files, s.paper, s.guide]) if (p) paths.add(p);
  return [...paths];
}

const between = (text, [a, b]) => {
  const i = text.indexOf(a), j = text.indexOf(b);
  return i < 0 || j < i ? null : text.slice(i + a.length, j);
};
const fill = (text, [a, b], body) => text.slice(0, text.indexOf(a) + a.length) + body + text.slice(text.indexOf(b));

// The indent of the line a marker sits on, so filled blocks line up with the skeleton.
const indentOf = (text, mark) => { const i = text.indexOf(mark); return text.slice(text.lastIndexOf("\n", i) + 1, i); };

export function layerBlock(slug, style, size, indent) {
  const lines = [`<!-- lemo-style: ${slug} -->`];
  if (style.kind === "2d") {
    lines.push(
      `<style>#paper, #wc { position: absolute; left: 0; top: 0; width: var(--W); height: var(--H); }</style>`,
      `<img id="paper" src="assets/lemo/paper.jpg" alt="">`,
      `<canvas id="wc" width="${size.width}" height="${size.height}"></canvas>`,
      ...style.files.map((f) => `<script src="assets/lemo/${basename(f)}"></script>`),
      `<script src="assets/lemo/scene.js"></script>`,
    );
  } else {
    lines.push(
      `<style>#gl { position: absolute; left: 0; top: 0; width: var(--W); height: var(--H); }</style>`,
      `<script type="importmap">{"imports":{"three":"./assets/three/lib/three.module.js","three/addons/":"./assets/three/addons/"}}</script>`,
      `<script type="module" src="assets/lemo/scene3d.js"></script>`,
    );
  }
  return "\n" + lines.map((l) => indent + l).join("\n") + "\n" + indent;
}

export function bridgeBlock(indent) {
  const lines = [
    "// A proxy tween on this paused timeline calls window.lemoRender(t, win) on every seek. win maps each",
    "// scene id to its [start, end], so a shot resized on the timeline stretches the layer with it. A 3D",
    "// scene is an ES module that loads after this script, so the last asked time is kept for it.",
    "const win = Object.fromEntries(WINDOWS.map(([, sid], i) => [sid, [winStart(i), i < WINDOWS.length - 1 ? winStart(i + 1) : T.duration]]));",
    "const lemoClock = { t: 0 };",
    "window.__lemoWin = win;",
    "const seekLemo = () => { window.__lemoT = lemoClock.t; if (window.lemoRender) window.lemoRender(lemoClock.t, win); };",
    'tl.fromTo(lemoClock, { t: 0 }, { t: T.duration, duration: T.duration, ease: "none", immediateRender: true, onUpdate: seekLemo }, 0);',
    "seekLemo();",
  ];
  return "\n" + lines.map((l) => indent + l).join("\n") + "\n" + indent;
}

const credits = (slug, style, cat) => [
  `Lemo-Opuscar style "${slug}" (github.com/lemomo-ai/lemo-opuscar, commit ${cat.sha}), MIT licence`,
  `(LICENSE-lemo-opuscar). Engine files copied unchanged: ${style.files.map((f) => basename(f)).join(", ")}.`,
  ...(style.paper ? [`paper.jpg: generated by that style's ${basename(style.paper)}.`] : []),
  ...(style.kind === "3d" ? [`three.js ${cat.three} under assets/three (MIT, LICENSE-three).`] : []),
  `Style guide: ${style.guide} in that commit. Do not copy the demo film's story, scenes or signature.`,
  `${style.kind === "2d" ? "scene.js" : "scene3d.js"}: written for this project on top of that engine.`,
  "",
].join("\n");

function tenVi(slug) {
  try { return JSON.parse(readFileSync(join(STYLES_DIR, `lemo-${slug}.json`), "utf8")).ten_vi || ""; } catch { return ""; }
}

function defaultPython(env) {
  if (env.OV_PYTHON) return env.OV_PYTHON;
  const venv = join(homedir(), ".claude", "skills", ".venv", "bin", "python3");
  return existsSync(venv) ? venv : "python3";
}

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: "utf8", ...opts });

function fetchCache(cat, home, { out, err }) {
  const dir = repoDir(home, cat);
  const git = (...a) => run("git", ["-C", dir, ...a]);
  if (!existsSync(join(dir, ".git"))) {
    mkdirSync(dir, { recursive: true });
    for (const a of [["init", "-q"], ["remote", "add", "origin", cat.repo], ["sparse-checkout", "init", "--no-cone"]]) {
      const r = git(...a);
      if (r.status !== 0) { err(`lemo: git ${a[0]} failed: ${r.stderr}`); return 4; }
    }
  }
  const head = git("rev-parse", "-q", "--verify", "HEAD").stdout?.trim();
  if (head && head !== cat.sha) { err(`lemo: ${dir} is at ${head}, catalog pins ${cat.sha}; remove that directory and fetch again\n`); return 4; }
  let r = git("sparse-checkout", "set", "--no-cone", ...[...sparsePaths(cat), ...LIBRARY_GLOBS].map((p) => `/${p}`));
  if (r.status !== 0) { err(`lemo: sparse-checkout failed: ${r.stderr}`); return 4; }
  if (!head) {
    out(`lemo: fetching ${cat.repo} @ ${cat.sha.slice(0, 7)}\n`);
    r = git("fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", cat.sha);
    if (r.status !== 0) { err(`lemo: fetch failed: ${r.stderr}`); return 4; }
    r = git("checkout", "-q", "--detach", "FETCH_HEAD");
  } else {
    r = git("checkout", "-q", "--detach", cat.sha);
  }
  if (r.status !== 0) { err(`lemo: checkout failed: ${r.stderr}`); return 4; }

  const three = threeDir(home, cat);
  if (!existsSync(join(three, "package.json"))) {
    const parent = join(home, `three-${cat.three}`);
    mkdirSync(parent, { recursive: true });
    out(`lemo: npm pack three@${cat.three}\n`);
    r = run("npm", ["pack", `three@${cat.three}`, "--pack-destination", parent, "--silent"]);
    if (r.status !== 0) { err(`lemo: npm pack failed: ${r.stderr}`); return 4; }
    r = run("tar", ["-xzf", join(parent, `three-${cat.three}.tgz`), "-C", parent]);
    if (r.status !== 0) { err(`lemo: tar failed: ${r.stderr}`); return 4; }
  }
  out(`lemo: cache ready at ${home}\n`);
  return 0;
}

function parseOpts(rest, flags, usage, err) {
  const o = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if ((a === "--force" || a === "--json") && flags.includes(a)) { o[a.slice(2)] = true; continue; }
    if (flags.includes(a) && a !== "--force" && a !== "--json") { const v = rest[++i]; if (!v || v.startsWith("--")) { err(`lemo: ${a} needs a value\n${usage}\n`); return null; } o[a.slice(2)] = v; continue; }
    err(`lemo: unknown argument ${a}\n${usage}\n`); return null;
  }
  return o;
}

function readIndex(dir, err) {
  const file = join(dir, "index.html");
  if (!existsSync(file)) { err(`lemo: ${file} not found\n`); return null; }
  const html = readFileSync(file, "utf8");
  for (const m of [...MARK.layer, ...MARK.bridge]) {
    if (html.split(m).length !== 2) {
      err(`lemo: index.html needs ${m} exactly once. Projects started before these markers: put\n  ${MARK.layer.join(" ")} inside <div id="bg">\n  ${MARK.bridge.join(" ")} after the WINDOWS.forEach block of the timeline script\n`);
      return null;
    }
  }
  return { file, html };
}

export function main(argv = process.argv.slice(2), { out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s), env = process.env, catalog = CATALOG, python } = {}) {
  if (wantsHelp(argv)) { out(helpText(import.meta.url)); return 0; }
  const usage = "usage: node lemo.mjs fetch | list [--json] | add --project <dir> --style <slug> [--force] | remove --project <dir>";
  const [cmd, ...rest] = argv;
  const cat = JSON.parse(readFileSync(catalog, "utf8"));
  const home = cacheHome(env);

  if (cmd === "fetch") { if (rest.length) { err(`lemo: fetch takes no arguments\n${usage}\n`); return 2; } return fetchCache(cat, home, { out, err }); }

  if (cmd === "list") {
    const o = parseOpts(rest, ["--json"], usage, err); if (!o) return 2;
    const rows = Object.entries(cat.styles).map(([slug, s]) => ({ slug, ten_vi: tenVi(slug), kind: s.kind, status: s.status }));
    out(o.json ? JSON.stringify(rows, null, 2) + "\n" : rows.map((r) => `${r.slug.padEnd(16)} ${r.kind}  ${r.status.padEnd(9)} ${r.ten_vi}`).join("\n") + "\n");
    return 0;
  }

  if (cmd === "add") {
    const o = parseOpts(rest, ["--project", "--style", "--force"], usage, err); if (!o) return 2;
    if (!o.project || !o.style) { err(`lemo: add needs --project and --style\n${usage}\n`); return 2; }
    const style = cat.styles[o.style];
    if (!style) { err(`lemo: unknown style ${o.style}; known: ${Object.keys(cat.styles).join(", ")}\n`); return 2; }
    const dir = resolve(o.project);
    const idx = readIndex(dir, err); if (!idx) return 3;
    const lemoDir = join(dir, "assets", "lemo");
    const targets = style.files.map((f) => join(lemoDir, basename(f)));
    if (!o.force) {
      if (between(idx.html, MARK.layer).trim() || between(idx.html, MARK.bridge).trim()) { err("lemo: index.html already has a lemo layer; run remove first or pass --force\n"); return 5; }
      const there = targets.filter(existsSync);
      if (there.length) { err(`lemo: already there: ${there.map((f) => basename(f)).join(", ")}; pass --force to replace\n`); return 5; }
    }
    const repo = repoDir(home, cat), three = threeDir(home, cat);
    const need = [...style.files, ...(style.paper ? [style.paper] : []), "LICENSE"].map((p) => join(repo, p));
    if (style.kind === "3d") need.push(join(three, "package.json"));
    const missing = need.filter((p) => !existsSync(p));
    if (missing.length) { err(`lemo: cache missing ${missing[0]}; run node lemo.mjs fetch\n`); return 4; }

    mkdirSync(lemoDir, { recursive: true });
    style.files.forEach((f, i) => cpSync(join(repo, f), targets[i]));
    cpSync(join(repo, "LICENSE"), join(lemoDir, "LICENSE-lemo-opuscar"));
    writeFileSync(join(lemoDir, "CREDITS"), credits(o.style, style, cat));
    if (style.paper) {
      const py = python || defaultPython(env);
      const r = run(py, [join(repo, style.paper)], { cwd: lemoDir });
      if (r.status !== 0 || !existsSync(join(lemoDir, "paper.jpg"))) {
        err(`lemo: ${basename(style.paper)} failed with ${py} (needs numpy and Pillow; set OV_PYTHON): ${r.stderr || r.error?.message || ""}\n`);
        return 4;
      }
    }
    if (style.kind === "3d") {
      const dst = join(dir, "assets", "three");
      for (const d of ["lib", "addons"]) mkdirSync(join(dst, d), { recursive: true });
      for (const f of ["three.module.js", "three.core.js"]) if (existsSync(join(three, "build", f))) cpSync(join(three, "build", f), join(dst, "lib", f));
      for (const a of style.three_addons || []) cpSync(join(three, "examples", "jsm", a), join(dst, "addons", a), { recursive: true });
      cpSync(join(three, "LICENSE"), join(dst, "LICENSE-three"));
    }
    const sceneName = style.kind === "2d" ? "scene.js" : "scene3d.js";
    const scene = join(lemoDir, sceneName);
    const started = !existsSync(scene);
    if (started) cpSync(join(TEMPLATES, style.kind === "2d" ? "scene-2d.js" : "scene3d.js"), scene);

    const rootTag = idx.html.match(/<div id="root"[^>]*>/)?.[0] || "";
    const size = { width: Number(rootTag.match(/data-width="(\d+)"/)?.[1] || 1920), height: Number(rootTag.match(/data-height="(\d+)"/)?.[1] || 1080) };
    let html = fill(idx.html, MARK.layer, layerBlock(o.style, style, size, indentOf(idx.html, MARK.layer[0])));
    html = fill(html, MARK.bridge, bridgeBlock(indentOf(html, MARK.bridge[0])));
    writeFileSync(idx.file, html);

    if (style.status !== "verified") err(`lemo: WARN style ${o.style} is ${style.status}; run the smoke test before delivery\n`);
    out([
      `lemo: ${o.style} (${style.kind}) added to ${dir}`,
      `  engine → assets/lemo/${targets.map((f) => basename(f)).join(", ")}${style.kind === "3d" ? " · three → assets/three" : ""}`,
      `  ${started ? "started" : "kept"} assets/lemo/${sceneName}`,
      `next: read ${style.guide} (in ${repo}), write assets/lemo/${sceneName} for the brief, then npx hyperframes lint`,
      "",
    ].join("\n"));
    return 0;
  }

  if (cmd === "remove") {
    const o = parseOpts(rest, ["--project"], usage, err); if (!o) return 2;
    if (!o.project) { err(`lemo: remove needs --project\n${usage}\n`); return 2; }
    const dir = resolve(o.project);
    const idx = readIndex(dir, err); if (!idx) return 3;
    const slug = between(idx.html, MARK.layer).match(/<!-- lemo-style: (\S+) -->/)?.[1];
    const style = slug && cat.styles[slug];
    let html = fill(idx.html, MARK.layer, "\n" + indentOf(idx.html, MARK.layer[0]));
    html = fill(html, MARK.bridge, "\n" + indentOf(html, MARK.bridge[0]));
    writeFileSync(idx.file, html);
    const lemoDir = join(dir, "assets", "lemo");
    const gone = ["LICENSE-lemo-opuscar", "CREDITS", "paper.jpg", ...(style ? style.files.map((f) => basename(f)) : [])];
    for (const f of gone) rmSync(join(lemoDir, f), { force: true });
    if (style?.kind === "3d") rmSync(join(dir, "assets", "three"), { recursive: true, force: true });
    if (existsSync(lemoDir) && readdirSync(lemoDir).length === 0) rmSync(lemoDir, { recursive: true });
    out(`lemo: removed ${slug || "the lemo layer"} from ${dir}; scene files kept\n`);
    return 0;
  }

  err(`lemo: ${cmd ? `unknown command ${cmd}` : "missing command"}\n${usage}\n`);
  return 2;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
