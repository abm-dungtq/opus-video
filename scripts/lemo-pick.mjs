#!/usr/bin/env node
// lemo-pick.mjs — choose a lemo-opuscar style (github.com/lemomo-ai/lemo-opuscar: code MIT, demo
// films CC BY 4.0, LemoLab) for a brief. Ranks every style of the pinned library by its
// styles/<slug>/style.json and the start of its STYLE.md, with TypeSafe (Jev) when a key is set.
//   node lemo-pick.mjs rank --brief-json BRIEF.case-query.json | --brief "<English brief>"
//                           [--limit 3] [--library <dir>] [--json] [--stats]
//   node lemo-pick.mjs choose --project <dir> --style <slug> [--search "<lemo_search>"] [--library <dir>]
//   node lemo-pick.mjs --help | -h
// Library: --library <dir> (a lemo-opuscar checkout, e.g. Motion Studio's cache), else the cache of
//   `lemo.mjs fetch` at the commit pinned in data/lemo/styles.json ($LEMO_OPUSCAR_HOME/<sha>, default
//   ~/.cache/opus-video/lemo-opuscar/<sha>); fetch checks out styles/*/style.json and STYLE.md.
// rank: brief = the agent-normalised ENGLISH brief JSON of ov-cases (BRIEF.case-query.json); fill only
//   from the user's brief. With a key: one request, one Score per style (does its look and typical
//   uses suit the brief, 0–4), sorted by score, ties by keyword hits. No TYPESAFE_API_KEY, HTTP
//   error, timeout or bad payload → keyword order (exit 0): brief words found in the style's uses
//   (×3), name and group (×2), film line and STYLE.md opening (×1). No key → silent; key present
//   but the call failed → one stderr line "lemo-pick: Jev unavailable (<reason>); showing keyword
//   order". Each result: slug, name, group, uses, why (Vietnamese reason), how ("layer": lemo.mjs add
//   can draw it as a canvas layer; "grammar": build it in the composition from STYLE.md), guide
//   (STYLE.md path), jev ({ score, confidence } or null). "> note: weak matches" when no style
//   shares a word with the brief and Jev did not rank. --stats prints one JSON line on stderr with
//   "lemo_search": "jev" | "keyword (<reason>)" for BRIEF.md.
// choose: records the pick in BRIEF.md frontmatter. A layer style → `lemo_style: <slug>` (the field
//   make-pitch, lemo.mjs and Motion Studio read; drops lemo_ref). A grammar style → `lemo_ref: <slug>`
//   (drops lemo_style, which only names layer styles). Both write `lemo_search:` (--search, default
//   "chọn tay") and add one credit line to assets/CREDITS.md once. Prints the next step.
// Exit: 0 done · 2 bad usage, unknown style or BRIEF.md missing · 4 library missing (run
// node lemo.mjs fetch). Node built-ins only. Credentials: $TYPESAFE_API_KEY, else
// ~/.config/opus-video/.env. Never printed.

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MODEL, loadKey, post } from "./jev-client.mjs";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { CATALOG, cacheHome, repoDir } from "./lemo.mjs";
import { frontmatter } from "./check-viet-pro.mjs";
import { setFrontmatter } from "./make-pitch.mjs";

const STYLES_DIR = fileURLToPath(new URL("../data/styles/", import.meta.url));
const ESSENCE = 600; // chars of each STYLE.md opening sent to Jev and searched by keyword

export const LEVELS = [
  "Unsuitable: its look, subject matter and tone work against the brief.",
  "Weak: only a generic visual idea could be borrowed; its typical uses and tone differ from the brief.",
  "Partial: its tone or one of its typical uses fits, but its look cannot carry the brief's key visuals well.",
  "Strong: its typical uses and tone fit the brief and its look can carry the brief's key visuals.",
  "Excellent: made for this kind of video; its look, uses and tone match the brief closely.",
];
const LEVEL_VI = ["không hợp", "yếu", "hợp một phần", "hợp", "rất hợp"];

const STOP = new Set(["the", "and", "for", "with", "from", "that", "this", "into", "about", "not", "stated", "video", "videos", "film", "style", "seconds", "second", "over", "under", "its", "our", "your", "their", "who", "what", "how", "why", "are", "was", "will", "can", "one", "two", "both"]);
// Lower-case, unaccented words of 3+ letters without stop words; a plural "s" is dropped ("rivers" = "river").
export const words = (s) => [...new Set((String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]{3,}/g) || [])
  .filter((w) => !STOP.has(w)).map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w)))];

// STYLE.md opening: the tagline quote and section 1 ("Essence"), headings and markup stripped.
export function essence(md) {
  const body = md.split(/\n## 2\./)[0].replace(/^# .*$/m, "").replace(/^##? .*$/gm, "");
  return body.replace(/^\s*[-*] /gm, "").replace(/[>*`_]/g, "").replace(/\s+/g, " ").trim().slice(0, ESSENCE);
}

export const libraryDir = (o = {}, env = process.env, catalog = CATALOG) =>
  o.library ? resolve(o.library) : repoDir(cacheHome(env), JSON.parse(readFileSync(catalog, "utf8")));

// Every style of a lemo-opuscar checkout: { slug, name, group, uses, film, line, essence, guide, how, ten_vi }.
export function loadLibrary(dir, catalog = CATALOG) {
  const root = join(dir, "styles");
  if (!existsSync(root)) return [];
  const cat = JSON.parse(readFileSync(catalog, "utf8"));
  const out = [];
  for (const slug of readdirSync(root).sort()) {
    if (slug.startsWith("_") || slug.startsWith(".")) continue;
    const sj = join(root, slug, "style.json"), guide = join(root, slug, "STYLE.md");
    if (!existsSync(sj)) continue;
    let s; try { s = JSON.parse(readFileSync(sj, "utf8")); } catch { continue; }
    const layer = !!cat.styles[slug] && existsSync(join(STYLES_DIR, `lemo-${slug}.json`));
    let tenVi = "";
    if (layer) { try { tenVi = JSON.parse(readFileSync(join(STYLES_DIR, `lemo-${slug}.json`), "utf8")).ten_vi || ""; } catch { /* name only */ } }
    out.push({
      slug, name: s.en || slug, group: s.category_en || "", uses: s.uses || [], film: s.film || "", line: s.line || "",
      essence: existsSync(guide) ? essence(readFileSync(guide, "utf8")) : "", guide, how: layer ? "layer" : "grammar", ten_vi: tenVi,
    });
  }
  return out;
}

const briefText = (brief) => (typeof brief === "string" ? brief : Object.values(brief || {}).join(" "));

// Keyword hits of the brief in one style: { score, hits }.
export function keywordScore(brief, s) {
  const want = words(briefText(brief));
  const fields = [[s.uses.join(" "), 3], [`${s.name} ${s.group}`, 2], [`${s.film} ${s.line} ${s.essence}`, 1]].map(([t, w]) => [new Set(words(t)), w]);
  let score = 0; const hits = [];
  for (const w of want) {
    const best = Math.max(0, ...fields.filter(([set]) => set.has(w)).map(([, wt]) => wt));
    if (best) { score += best; hits.push(w); }
  }
  return { score, hits };
}

export function buildRequest(brief, styles) {
  const questions = {};
  styles.forEach((s, i) => {
    questions[`s${i}`] = {
      type: "score",
      instructions: {
        candidate_style: { name: s.name, group: s.group, typical_uses: s.uses.join(", ") || "-", demo_film: s.line || "-", look: s.essence || "-" },
        question:
          "The state is a brief for a video we need to produce. `candidate_style` is a film style: a visual grammar (materials, colour, type, camera, motion) " +
          "shown by one demo film. How well does this style suit the video in the brief? Judge whether its typical uses and tone fit the brief's purpose, topic and audience, " +
          "and whether its look can carry the brief's key visuals and narration. Ignore the demo film's own story.",
      },
      criteria: LEVELS,
    };
  });
  return { state: typeof brief === "string" ? brief : JSON.stringify(brief), model: MODEL, questions };
}

const why = (s, kw, jev) => {
  const parts = [];
  if (jev) parts.push(`Jev chấm ${jev.score}/4 (${LEVEL_VI[Math.max(0, Math.min(4, Math.round(jev.score)))]})`);
  if (kw.hits.length) parts.push(`brief và phong cách cùng nói tới: ${kw.hits.slice(0, 6).join(", ")}`);
  if (s.uses.length) parts.push(`hợp cho: ${s.uses.join(", ")}`);
  parts.push(s.how === "layer" ? "dựng được thành lớp canvas (lemo.mjs add)" : "dựng theo ngữ pháp STYLE.md trong composition");
  return parts.join("; ");
};

// Returns { results, reranked, error, notes, usage, ms, model }.
export async function rank({ brief, styles, limit = 3, apiKey, fetchImpl = globalThis.fetch, timeoutMs = 30000 }) {
  const kw = styles.map((s) => keywordScore(brief, s));
  const keywordOrder = styles.map((s, i) => ({ s, i, kw: kw[i] })).sort((a, b) => b.kw.score - a.kw.score || a.s.slug.localeCompare(b.s.slug));
  const shape = ({ s, kw: k }, jev = null) => ({
    slug: s.slug, name: s.name, ten_vi: s.ten_vi, group: s.group, uses: s.uses, how: s.how, guide: s.guide, keyword: k.score, jev, why: why(s, k, jev),
  });
  const fallback = (error, extra = {}) => {
    const results = keywordOrder.slice(0, limit).map((x) => shape(x));
    const notes = keywordOrder[0]?.kw.score ? [] : ["weak matches"];
    return { results, reranked: false, error, notes, ...extra };
  };
  if (!styles.length) return fallback("empty library");
  if (!apiKey) return fallback("no TYPESAFE_API_KEY");
  const t0 = Date.now();
  let data;
  try {
    data = await post(buildRequest(brief, styles), { apiKey, fetchImpl, timeoutMs });
    const a = styles.map((_, i) => data?.answers?.[`s${i}`]);
    if (!a.every((x) => x && typeof x.score === "number")) throw new Error("malformed answers");
    data.scores = a;
  } catch (e) {
    return fallback(e?.message?.startsWith("HTTP") || e?.message === "malformed answers" ? e.message : `request failed: ${e?.name || "error"}`, { ms: Date.now() - t0 });
  }
  const scored = styles.map((s, i) => ({ s, i, kw: kw[i], a: data.scores[i] }))
    .sort((x, y) => y.a.score - x.a.score || y.kw.score - x.kw.score || x.s.slug.localeCompare(y.s.slug));
  return {
    results: scored.slice(0, limit).map((x) => shape(x, { score: +x.a.score.toFixed(2), confidence: x.a.confidence })),
    reranked: true, notes: [], usage: data.usage, model: data.model, ms: Date.now() - t0,
  };
}

// One-line value for BRIEF.md `lemo_search:`.
export const searchLabel = (out) => (out.reranked ? "jev" : `keyword (${out.error || "fallback"})`);
export function fallbackWarning(out, { hasKey }) {
  if (out.reranked || !hasKey) return null;
  return `lemo-pick: Jev unavailable (${out.error || "unknown error"}); showing keyword order. Record lemo_search: ${searchLabel(out)}`;
}

export function credit(slug, sha) {
  return `- Phong cách hình "${slug}" theo lemo-opuscar (https://github.com/lemomo-ai/lemo-opuscar${sha ? `, commit ${sha.slice(0, 7)}` : ""}) của LemoLab: mã MIT, phim mẫu CC BY 4.0. Chỉ học ngữ pháp hình; không chép câu chuyện, cảnh hay chữ ký của phim mẫu.`;
}

// project dir + slug → { code, msg }. Writes BRIEF.md frontmatter and assets/CREDITS.md.
export function choose({ project, style, search = "chọn tay", library, catalog = CATALOG }) {
  const root = resolve(project);
  const briefPath = join(root, "BRIEF.md");
  if (!existsSync(briefPath)) return { code: 2, msg: `BRIEF.md not found in ${root}` };
  const cat = JSON.parse(readFileSync(catalog, "utf8"));
  const lib = loadLibrary(library, catalog);
  const s = lib.find((x) => x.slug === style);
  const layer = s ? s.how === "layer" : !!cat.styles[style] && existsSync(join(STYLES_DIR, `lemo-${style}.json`));
  if (!s && !layer) return { code: lib.length ? 2 : 4, msg: lib.length ? `unknown style ${style}; known: ${lib.map((x) => x.slug).join(", ")}` : `library missing at ${library}; run node lemo.mjs fetch` };
  const text = readFileSync(briefPath, "utf8");
  const before = frontmatter(text);
  writeFileSync(briefPath, setFrontmatter(text, layer
    ? { lemo_style: style, lemo_ref: null, lemo_search: search }
    : { lemo_ref: style, lemo_style: null, lemo_search: search }));
  const credits = join(root, "assets", "CREDITS.md");
  const line = credit(style, cat.sha);
  const has = existsSync(credits) && readFileSync(credits, "utf8").includes(`"${style}" theo lemo-opuscar`);
  if (!has) {
    mkdirSync(join(root, "assets"), { recursive: true });
    const gap = existsSync(credits) && !readFileSync(credits, "utf8").endsWith("\n") ? "\n" : "";
    appendFileSync(credits, `${gap}${line}\n`);
  }
  const guide = s?.guide || join(library, "styles", style, "STYLE.md");
  const lines = [`lemo-pick: BRIEF.md ← ${layer ? "lemo_style" : "lemo_ref"}: ${style} · lemo_search: ${search}${has ? "" : " · assets/CREDITS.md + 1 dòng"}`];
  if (!layer && before.lemo_style) lines.push(`WARN BRIEF.md bỏ lemo_style: ${before.lemo_style}; lớp canvas đã thêm thì chạy node lemo.mjs remove --project ${root}`);
  lines.push(layer
    ? `next: make-pitch init tự dùng lemo_style cho hướng táo bạo; khi dựng chạy node lemo.mjs add --project ${root} --style ${style}, rồi đọc ${guide}`
    : `next: đọc ${guide} và dựng bằng GSAP/DOM/canvas trong composition theo ngữ pháp đó; chữ tiếng Việt ở lớp DOM, hình là hàm thuần của t`);
  return { code: 0, msg: lines.join("\n") };
}

function parseArgs(argv) {
  const o = { limit: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) return { bad: `unexpected "${a}"` };
    const k = a.slice(2);
    if (k === "json" || k === "stats") { o[k] = true; continue; }
    if (!["brief-json", "brief", "limit", "library", "project", "style", "search"].includes(k)) return { bad: `unknown argument ${a}` };
    const v = argv[++i];
    if (v === undefined || v.startsWith("--")) return { bad: `${a} needs a value` };
    o[k] = v;
  }
  return o;
}

function readBrief(o) {
  if (o["brief-json"]) {
    const v = o["brief-json"];
    try { return JSON.parse(existsSync(v) ? readFileSync(v, "utf8") : v); } catch { return null; }
  }
  return o.brief?.trim() || null;
}

export async function main(argv = process.argv.slice(2), { out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s), env = process.env, fetchImpl = globalThis.fetch, keyFile } = {}) {
  if (wantsHelp(argv)) { out(helpText(import.meta.url)); return 0; }
  const usage = "usage: node lemo-pick.mjs rank --brief-json <file|json> [--limit 3] [--library <dir>] [--json] [--stats] | choose --project <dir> --style <slug> [--search <label>]";
  const [cmd, ...rest] = argv;
  const o = parseArgs(rest);
  if (o.bad) { err(`lemo-pick: ${o.bad}\n${usage}\n`); return 2; }
  const library = libraryDir(o, env);

  if (cmd === "choose") {
    if (!o.project || !o.style) { err(`lemo-pick: choose needs --project and --style\n${usage}\n`); return 2; }
    const r = choose({ project: o.project, style: o.style, search: o.search, library });
    (r.code ? err : out)(`${r.code ? "lemo-pick: " : ""}${r.msg}\n`);
    return r.code;
  }

  if (cmd === "rank") {
    const brief = readBrief(o);
    if (!brief) { err(`lemo-pick: rank needs --brief-json (valid JSON) or --brief\n${usage}\n`); return 2; }
    const styles = loadLibrary(library);
    if (!styles.length) { err(`lemo-pick: no lemo-opuscar library at ${library}; run node lemo.mjs fetch (or pass --library)\n`); return 4; }
    const apiKey = keyFile === undefined ? loadKey(env) : loadKey(env, keyFile);
    const r = await rank({ brief, styles, limit: Math.max(1, Number(o.limit) || 3), apiKey, fetchImpl });
    const warn = fallbackWarning(r, { hasKey: !!apiKey });
    if (warn) err(`${warn}\n`);
    if (o.stats) err(JSON.stringify({ lemo_search: searchLabel(r), reranked: r.reranked, error: r.error, styles: styles.length, ms: r.ms, usage: r.usage, model: r.model }) + "\n");
    if (o.json) {
      out(JSON.stringify(r.results, null, 2) + "\n");
      for (const n of r.notes) err(`note: ${n}\n`);
      return 0;
    }
    const L = r.notes.map((n) => `> note: ${n}\n`);
    for (const x of r.results) {
      L.push(`### ${x.slug} · ${x.name}${x.ten_vi ? ` (${x.ten_vi})` : ""} · ${x.group} · ${x.how === "layer" ? "lớp canvas" : "theo ngữ pháp"}${x.jev ? ` · jev ${x.jev.score}/4` : ""}`);
      L.push(`lý do: ${x.why}`);
      L.push(`STYLE.md: ${x.guide}`, "");
    }
    out(L.join("\n") + "\n");
    return 0;
  }

  err(`lemo-pick: ${cmd ? `unknown command ${cmd}` : "missing command"}\n${usage}\n`);
  return 2;
}

// realpath: SKILL.md calls scripts through the ~/.claude/skills symlink, while import.meta.url is the real path.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) process.exitCode = await main();
