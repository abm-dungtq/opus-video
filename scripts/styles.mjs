#!/usr/bin/env node
// styles.mjs — style profiles: the look of a video (palette, type, layout, material, texture,
// camera, transitions, pacing, beat response, UI, diagrams, characters, captions, sound). A second
// axis beside the creative directions A1–A8, which decide how the story is told in pictures.
// Source of truth: data/styles/<id>.json; data/styles/index.json is generated. Node built-ins only.
//   node styles.mjs index [--write]              print (or write) data/styles/index.json
//   node styles.mjs validate                     every profile + index parity; exit 1 on errors
//   node styles.mjs find "<words>" [--json]      best matches: id, alias, then summary words
//   node styles.mjs show <id|alias> [--json]
//   node styles.mjs resolve [--project .] [--json] [--markdown]
//   node styles.mjs css <id|alias>               :root { --bg: …; --ink: …; … } from the palette
//   node styles.mjs suggest --direction <A1..A8> [--energy em|vua|don-dap] [--json]
//   node styles.mjs --help | -h
// index: one JSON object per line (id, ten_vi, name, family, aliases, energy, best_for, summary,
//   mo_ta_vi, depth), sorted by id. depth is "reference" when the profile has a detail document.
// validate: required keys and all 14 dimensions; energy 1–5; bg/ink/accent are #rrggbb (other
//   tokens #rrggbb or rgb()/rgba()); pacing.bpm [lo, hi]; known scene types; pairs_well_with and
//   detail point at real files; ten_vi ≤ 5 words, mo_ta_vi one sentence ≤ 25 words; no alias shared
//   by two styles; index.json equal to `index`.
// find: names fold case, diacritics, separators and filler words ("style", "kiểu", "phong cách").
//   Exact id or alias scores 1; else the best of 0.7 × name similarity (1 when the query holds a
//   whole name or a name holds it, else the bigram Dice score when ≥ 0.5) and 0.6 × the share of
//   query words found in summary, mo_ta_vi, best_for, ten_vi and name. Prints up to 5 lines
//   "id — ten_vi — score".
// resolve: base = BRIEF.md `style_profile:`; layers = the JSON array in a code fence under
//   "## style_layers" ([{ "style", "dimensions": [...], "scenes": { "ids": ["s2"], "types":
//   ["diagram"] }, "palette_mode": "accent|full" }], at most 4); scenes = PLAN.md "## Cảnh" rows,
//   id s<#> (the # column), type from an optional "Loại" column. No PLAN.md resolves the whole video.
//   Rules (references/style-system.md): the base gives every dimension; layers apply in order and a
//   later layer wins; a layer palette adds accents unless palette_mode is full; base constraints
//   bind everywhere, layer constraints only in its scenes. Warns on more than 2 transition
//   languages, a layer that selects no scene, and a borrowed value that names something the base
//   avoids. --markdown prints the block to paste into PLAN.md "## Ý đồ sáng tạo".
// suggest: the direction's styles_goi_y (data/directions.json); --energy keeps profiles whose
//   energy fits it (em 1–2, vua 3, don-dap 4–5).
// Exit: 0 ok · 1 validation or resolution errors, nothing found · 2 bad usage, unknown style or
//   direction, BRIEF.md missing.

import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { OV_DIR } from "./skill-paths.mjs";
import { frontmatter } from "./check-viet-pro.mjs";
import { PLACEHOLDER, SECTIONS, fold, parsePlan, parseTable } from "./check-preflight.mjs";
import { loadDirections } from "./directions.mjs";

export const STYLES_DIR = join(OV_DIR, "data", "styles");
export const INDEX_FILE = "index.json";
export const STYLE_DIMENSIONS = ["palette", "typography", "layout", "material", "texture", "camera", "transitions",
  "pacing", "beat_response", "ui_choreography", "diagrams", "character_motion", "captions", "sound"];
export const SCENE_TYPES = ["cover", "hook", "title", "stats", "feature", "ui-demo", "product-hero", "spec", "diagram", "chart",
  "terminal", "code", "comparison", "timeline", "montage", "quote", "testimonial", "cta", "outro"];
export const FAMILIES = ["aesthetic", "brand-inspired", "house"];
export const REQUIRED = ["id", "name", "ten_vi", "mo_ta_vi", "family", "aliases", "summary", "energy", "best_for", "character",
  "dimensions", "scene_types", "signature_moves", "strengths", "constraints", "avoid", "pairs_well_with"];
// Profile energy 1–5 per opus-video energy (same mapping as references/motion-craft.md).
export const ENERGY_RANGE = { em: [1, 2], vua: [3, 3], "don-dap": [4, 5] };
export const MAX_LAYERS = 4;
const LAYER_KEYS = ["style", "dimensions", "scenes", "palette_mode"];
const PALETTE_MODES = ["accent", "full"];
const HEX = /^#[0-9a-f]{6}$/i;
const CSS_RGB = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/i;

export class StyleError extends Error {
  constructor(message, code = 1) { super(message); this.code = code; }
}

export const energyBucket = (e) => (e <= 2 ? "em" : e === 3 ? "vua" : "don-dap");
const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;

// Case-, diacritic-, separator- and filler-insensitive key: "Glass_Keynote style" == "glass-keynote".
const FILLER = /(^| )(?:style|styled|look|inspired|phong cach|kieu)(?= |$)/g;
export const norm = (name) => fold(String(name ?? "")).replace(/[-_\s]+/g, " ").replace(FILLER, " ").trim().replace(/\s+/g, "-");

// data/styles/*.json (index.json excluded) → { id: profile }, keyed by file name.
export function loadProfiles(dir = STYLES_DIR) {
  const out = {};
  if (!existsSync(dir)) throw new StyleError(`style folder not found: ${dir}`, 2);
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json") && x !== INDEX_FILE).sort()) {
    try { out[f.slice(0, -5)] = JSON.parse(readFileSync(join(dir, f), "utf8")); }
    catch (e) { throw new StyleError(`${f}: ${e.message}`); }
  }
  return out;
}

function nameTable(profiles) {
  const table = new Map();
  for (const [id, p] of Object.entries(profiles)) {
    table.set(norm(id), id);
    for (const a of p.aliases || []) if (!table.has(norm(a))) table.set(norm(a), id);
  }
  return table;
}

// Bigram Dice similarity of two keys, 0–1 (a dependency-free stand-in for difflib's ratio).
export function similarity(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) || 0) + 1); return m; };
  const ga = grams(a), gb = grams(b);
  let both = 0;
  for (const [g, n] of ga) both += Math.min(n, gb.get(g) || 0);
  return (2 * both) / (a.length - 1 + b.length - 1);
}

export function findStyles(query, profiles, limit = 5) {
  const q = norm(query);
  const exact = q ? nameTable(profiles).get(q) : undefined;
  const qWords = [...new Set(q.split("-").filter(Boolean))];
  const ranked = Object.entries(profiles).map(([id, p]) => {
    let score = 0;
    if (id === exact) score = 1;
    else {
      const nameSim = q ? Math.max(0, ...[id, p.name, ...(p.aliases || [])].map((n) => {
        const k = norm(n);
        if (!k) return 0;
        if (`-${k}-`.includes(`-${q}-`) || `-${q}-`.includes(`-${k}-`)) return 1;
        const s = similarity(q, k);
        return s >= 0.5 ? s : 0;
      })) : 0;
      const text = new Set(fold([p.summary, p.mo_ta_vi, (p.best_for || []).join(" "), p.ten_vi, p.name].join(" ")).match(/[a-z0-9]+/g) || []);
      const overlap = qWords.length ? qWords.filter((w) => text.has(w)).length / qWords.length : 0;
      score = Math.round(1000 * Math.max(0.7 * nameSim, 0.6 * overlap)) / 1000;
    }
    return { id, ten_vi: p.ten_vi || "", score, mo_ta_vi: p.mo_ta_vi || "" };
  }).filter((r) => r.score > 0);
  ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return ranked.slice(0, limit);
}

// Exact id or alias; anything else is an error naming the nearest styles.
export function lookup(name, profiles) {
  const id = nameTable(profiles).get(norm(name));
  if (id) return id;
  const near = findStyles(name, profiles, 3).map((m) => m.id);
  throw new StyleError(`unknown style "${name}"; nearest: ${near.join(", ") || "none"}`, 2);
}

export function buildIndex(profiles) {
  const rows = Object.keys(profiles).sort().map((id) => {
    const p = profiles[id];
    return JSON.stringify({ id, ten_vi: p.ten_vi, name: p.name, family: p.family, aliases: p.aliases || [], energy: p.energy,
      best_for: p.best_for || [], summary: p.summary, mo_ta_vi: p.mo_ta_vi, depth: p.detail ? "reference" : "profile" });
  });
  return `[\n${rows.join(",\n")}\n]\n`;
}

export function validateProfiles(profiles, { dir = STYLES_DIR, root = OV_DIR } = {}) {
  const errors = [];
  const owners = new Map();
  for (const [id, p] of Object.entries(profiles)) {
    const err = (m) => errors.push(`${id}: ${m}`);
    for (const k of REQUIRED) if (p[k] === undefined) err(`missing key ${k}`);
    if (p.id !== id) err(`id "${p.id}" does not match the file name`);
    if (!FAMILIES.includes(p.family)) err(`family must be one of ${FAMILIES.join(", ")}`);
    if (!Number.isInteger(p.energy) || p.energy < 1 || p.energy > 5) err("energy must be an integer 1-5");
    if (!Array.isArray(p.best_for) || p.best_for.length < 1 || p.best_for.length > 4) err("best_for needs 1-4 tags");
    if (String(p.summary || "").length > 120) err("summary longer than 120 characters");
    if (p.ten_vi !== undefined && (!String(p.ten_vi).trim() || words(p.ten_vi) > 5)) err("ten_vi needs 1-5 words");
    if (p.mo_ta_vi !== undefined && (!String(p.mo_ta_vi).trim() || words(p.mo_ta_vi) > 25)) err("mo_ta_vi needs 1-25 words");
    const dims = p.dimensions || {};
    const missing = STYLE_DIMENSIONS.filter((d) => !(d in dims));
    const extra = Object.keys(dims).filter((d) => !STYLE_DIMENSIONS.includes(d));
    if (missing.length) err(`missing dimensions ${missing.join(", ")}`);
    if (extra.length) err(`unknown dimensions ${extra.join(", ")}`);
    const palette = dims.palette || {};
    if (!["dark", "light", "mixed"].includes(palette.mode)) err("palette.mode must be dark, light or mixed");
    const colors = palette.colors || {};
    for (const k of ["bg", "ink", "accent"]) if (!HEX.test(String(colors[k] || ""))) err(`palette.colors.${k} must be #rrggbb`);
    for (const [k, v] of Object.entries(colors)) if (!HEX.test(String(v)) && !CSS_RGB.test(String(v))) err(`palette.colors.${k} "${v}" is not #rrggbb or rgb()/rgba()`);
    const bpm = (dims.pacing || {}).bpm;
    if (!(Array.isArray(bpm) && bpm.length === 2 && bpm.every(Number.isInteger) && bpm[0] >= 40 && bpm[0] <= bpm[1] && bpm[1] <= 200)) err("pacing.bpm must be [lo, hi] integers within 40-200");
    for (const d of STYLE_DIMENSIONS.filter((x) => x !== "palette" && x !== "pacing")) {
      const v = dims[d];
      if (d in dims && !(Array.isArray(v) && v.length && v.every((s) => typeof s === "string"))) err(`dimension ${d} must be a non-empty list of strings`);
    }
    for (const bucket of ["prefer", "avoid"]) {
      const unknown = ((p.scene_types || {})[bucket] || []).filter((t) => !SCENE_TYPES.includes(t));
      if (unknown.length) err(`scene_types.${bucket} has unknown types ${unknown.join(", ")}`);
    }
    for (const other of p.pairs_well_with || []) if (!profiles[other]) err(`pairs_well_with names unknown style "${other}"`);
    if (p.detail && !existsSync(join(root, p.detail))) err(`detail file ${p.detail} not found`);
    for (const name of [id, ...(p.aliases || [])]) {
      const key = norm(name);
      if (!key) { err(`name "${name}" is empty once filler words are removed`); continue; }
      if (owners.has(key) && owners.get(key) !== id) err(`name "${name}" collides with ${owners.get(key)}`);
      if (!owners.has(key)) owners.set(key, id);
    }
  }
  const index = join(dir, INDEX_FILE);
  if (!existsSync(index) || readFileSync(index, "utf8") !== buildIndex(profiles)) errors.push(`${INDEX_FILE} is stale: run node scripts/styles.mjs index --write`);
  return errors;
}

// BRIEF.md "## style_layers" → the layer array from its ```json (or ~~~) fence; [] when absent.
export function parseLayers(briefText) {
  const body = parsePlan(String(briefText || "")).sections.style_layers;
  if (body === undefined || !body.trim()) return [];
  const m = body.match(/^(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^\1\s*$/m);
  if (!m) throw new StyleError('BRIEF.md "## style_layers" needs a ```json code fence holding the layer list');
  let v;
  try { v = JSON.parse(m[2]); } catch (e) { throw new StyleError(`BRIEF.md "## style_layers" is not valid JSON: ${e.message}`); }
  if (!Array.isArray(v)) throw new StyleError('BRIEF.md "## style_layers" must be a JSON array of layers');
  return v;
}

// PLAN.md "## Cảnh" → [{ id: "s<#>", type }]; type from an optional "Loại" column.
export function planSceneList(planText) {
  const t = parseTable(parsePlan(String(planText || "")).sections[SECTIONS.scenes]);
  const ni = t.headers.indexOf("#");
  const li = t.headers.findIndex((h) => /^loai\b/.test(h));
  return t.rows.map((r, i) => {
    const id = `s${ni >= 0 && String(r[ni] || "").trim() ? String(r[ni]).trim() : i + 1}`;
    const raw = li >= 0 ? String(r[li] || "").replace(/`/g, "").trim().toLowerCase() : "";
    if (!raw || /^[-—–]$/.test(raw)) return { id, type: null };
    if (!SCENE_TYPES.includes(raw)) throw new StyleError(`PLAN.md "## Cảnh" ${id}: loại cảnh "${raw}" không có; dùng một trong ${SCENE_TYPES.join(", ")}`);
    return { id, type: raw };
  });
}

function checkSelector(sel, where) {
  if (sel === undefined || sel === null) return;
  if (typeof sel !== "object" || Array.isArray(sel) || !Object.keys(sel).length || Object.keys(sel).some((k) => !["ids", "types"].includes(k))) {
    throw new StyleError(`${where}: scenes must be an object with "ids" and/or "types" lists`);
  }
  for (const [k, v] of Object.entries(sel)) if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw new StyleError(`${where}: scenes.${k} must be a list of strings`);
  const unknown = (sel.types || []).filter((t) => !SCENE_TYPES.includes(t));
  if (unknown.length) throw new StyleError(`${where}: unknown scene types ${unknown.join(", ")}; use one of ${SCENE_TYPES.join(", ")}`);
}

const selects = (sel, scene) => !sel || (sel.ids || []).includes(scene.id) || (sel.ids || []).includes(scene.id.split("-")[0]) || (!!scene.type && (sel.types || []).includes(scene.type));

// Content words of a phrase, plural "s" dropped, generic words removed; used to spot a borrowed
// value that names something the base avoids.
const GENERIC = new Set(["motion", "scene", "colour", "color", "video", "frame", "every", "other", "light", "heavy", "small", "large", "dense", "inside", "without", "before", "after", "under", "across", "between", "about", "style", "subtle"]);
const contentWords = (s) => (fold(String(s)).match(/[a-z0-9]+/g) || []).map((w) => w.replace(/s$/, "")).filter((w) => w.length >= 5 && !GENERIC.has(w));
const dimText = (p, d) => {
  const v = (p.dimensions || {})[d];
  return Array.isArray(v) ? v.join(" ") : v && typeof v === "object" ? Object.values(v).filter((x) => typeof x === "string").join(" ") : String(v || "");
};

// spec { base, layers, scenes: [{ id, type }] } → per-scene table, binding constraints, warnings.
export function resolveSpec(spec, profiles) {
  if (!spec || !spec.base) throw new StyleError("a style spec needs a base style");
  const base = lookup(spec.base, profiles);
  const layers = spec.layers || [];
  if (!Array.isArray(layers)) throw new StyleError("layers must be a list");
  if (layers.length > MAX_LAYERS) throw new StyleError(`${layers.length} layers; at most ${MAX_LAYERS} are allowed`);
  const scenes = spec.scenes && spec.scenes.length ? spec.scenes : [{ id: "(cả video)", type: null }];
  const warnings = [];
  const resolved = layers.map((layer, n) => {
    const i = n + 1;
    if (!layer || typeof layer !== "object" || Array.isArray(layer) || !layer.style) throw new StyleError(`layer ${i}: must be an object with a style`);
    const extra = Object.keys(layer).filter((k) => !LAYER_KEYS.includes(k));
    if (extra.length) throw new StyleError(`layer ${i}: unknown keys ${extra.join(", ")}; allowed: ${LAYER_KEYS.join(", ")}`);
    let style;
    try { style = lookup(layer.style, profiles); } catch (e) { throw new StyleError(`layer ${i}: ${e.message}`); }
    const dims = layer.dimensions;
    if (!Array.isArray(dims) || !dims.length || dims.some((d) => !STYLE_DIMENSIONS.includes(d))) throw new StyleError(`layer ${i} (${style}): dimensions must be a non-empty subset of ${STYLE_DIMENSIONS.join(", ")}`);
    const paletteMode = layer.palette_mode ?? "accent";
    if (!PALETTE_MODES.includes(paletteMode)) throw new StyleError(`layer ${i} (${style}): palette_mode must be accent or full`);
    checkSelector(layer.scenes, `layer ${i} (${style})`);
    const hit = scenes.filter((s) => selects(layer.scenes, s)).map((s) => s.id);
    if (!hit.length) warnings.push(`lớp ${i} (${style}) không chọn cảnh nào; kiểm cột # và Loại của PLAN.md "## Cảnh"`);
    return { style, dimensions: dims, scenes: hit, palette_mode: paletteMode };
  });
  const rows = scenes.map((scene) => {
    const dims = Object.fromEntries(STYLE_DIMENSIONS.map((d) => [d, base]));
    for (const l of resolved) {
      if (!l.scenes.includes(scene.id)) continue;
      for (const d of l.dimensions) dims[d] = d === "palette" && l.palette_mode !== "full" ? `${base} + ${l.style} accents` : l.style;
    }
    return { id: scene.id, type: scene.type, dimensions: dims };
  });
  const transitions = new Set(rows.map((r) => r.dimensions.transitions));
  if (transitions.size > 2) warnings.push(`${transitions.size} ngôn ngữ chuyển cảnh trong một video (${[...transitions].sort().join(", ")}); giữ tối đa 2`);
  const bp = profiles[base];
  const banned = [...(bp.avoid || []), ...(bp.constraints || []).filter((c) => /^(no|never|avoid)\b/i.test(c))];
  resolved.forEach((l, n) => {
    if (!l.scenes.length) return;
    for (const d of l.dimensions) {
      const have = new Set(contentWords(dimText(profiles[l.style], d)));
      for (const b of banned) {
        const hit = contentWords(b).find((w) => have.has(w));
        if (hit) warnings.push(`lớp ${n + 1} (${l.style}) mượn ${d} có "${hit}", trái ràng buộc của base ${base}: "${b}"; giữ giá trị của base ở chỗ đó và ghi vào PLAN`);
      }
    }
  });
  const constraints = [{ style: base, scenes: "all", rules: bp.constraints || [] },
    ...resolved.filter((l) => l.scenes.length).map((l) => ({ style: l.style, scenes: l.scenes, rules: profiles[l.style].constraints || [] }))];
  return { base, layers: resolved, scenes: rows, constraints, detail: bp.detail || null, warnings };
}

// Project folder → resolveSpec result from BRIEF.md (style_profile, ## style_layers) and PLAN.md.
export function resolveProject(dir, profiles = loadProfiles()) {
  const briefPath = join(resolve(dir), "BRIEF.md");
  if (!existsSync(briefPath)) throw new StyleError(`BRIEF.md not found in ${resolve(dir)}`, 2);
  const brief = readFileSync(briefPath, "utf8");
  const base = String(frontmatter(brief).style_profile || "").trim();
  if (!base || PLACEHOLDER.test(base)) throw new StyleError("BRIEF.md has no style_profile: (make-pitch.mjs choose writes it; ids in data/styles/index.json)");
  const planPath = join(resolve(dir), "PLAN.md");
  const scenes = existsSync(planPath) ? planSceneList(readFileSync(planPath, "utf8")) : [];
  return resolveSpec({ base, layers: parseLayers(brief), scenes }, profiles);
}

const cell = (v, base) => (v === base ? "base" : v.replace(`${base} + `, "base + ").replace(/ accents$/, " (màu nhấn)"));

// Resolved spec → markdown block for PLAN.md "## Ý đồ sáng tạo" (no ## headings inside).
export function renderMarkdown(r, profiles) {
  const b = profiles[r.base];
  const L = [`- Style nền: ${b.ten_vi} (\`${r.base}\`)${r.detail ? `, chi tiết \`${r.detail}\`` : ""}`];
  r.layers.forEach((l, i) => L.push(`- Lớp ${i + 1}: \`${l.style}\` (${profiles[l.style].ten_vi}) → ${l.dimensions.join(", ")} · cảnh ${l.scenes.join(", ") || "không có"}`));
  const changed = STYLE_DIMENSIONS.filter((d) => r.scenes.some((s) => s.dimensions[d] !== r.base));
  if (changed.length) {
    L.push("", `| Cảnh | Loại | ${changed.join(" | ")} |`, `|---|---|${"---|".repeat(changed.length)}`);
    for (const s of r.scenes) L.push(`| ${s.id} | ${s.type || "—"} | ${changed.map((d) => cell(s.dimensions[d], r.base)).join(" | ")} |`);
    L.push("", "Các chiều không có trong bảng lấy từ style nền ở mọi cảnh.");
  } else L.push("- Mọi chiều lấy từ style nền ở mọi cảnh.");
  L.push("- Ràng buộc còn hiệu lực (cùng lớp bất biến trong references/style-system.md):");
  for (const c of r.constraints) for (const rule of c.rules) L.push(`  - [${c.style} · ${c.scenes === "all" ? "mọi cảnh" : c.scenes.join(", ")}] ${rule}`);
  for (const w of r.warnings) L.push(`- Cảnh báo: ${w}`);
  return L.join("\n");
}

export function paletteCss(p) {
  const pal = (p.dimensions || {}).palette || {};
  const vars = Object.entries(pal.colors || {}).map(([k, v]) => `  --${k.replace(/_/g, "-")}: ${v};`);
  return [`/* ${p.id} · ${pal.mode || "?"}${pal.rule ? ` · ${pal.rule.replace(/\*\//g, "* /")}` : ""} */`, ":root {", ...vars, "}"].join("\n");
}

// Direction → its styles_goi_y profiles, optionally only those whose energy fits `energy`.
export function suggestStyles(direction, energy, profiles) {
  if (energy && !ENERGY_RANGE[energy]) throw new StyleError(`--energy must be ${Object.keys(ENERGY_RANGE).join(", ")}`, 2);
  return (direction.styles_goi_y || []).filter((id) => profiles[id] && (!energy || energyBucket(profiles[id].energy) === energy));
}

// The style a styleframe starts from: first suggestion that fits the energy and is not yet used,
// then any unused suggestion, then the first one. null when the direction suggests none.
export function defaultStyle(direction, energy, profiles, used = new Set()) {
  const all = (direction.styles_goi_y || []).filter((id) => profiles[id]);
  const fit = suggestStyles(direction, ENERGY_RANGE[energy] ? energy : "", profiles);
  return [...fit, ...all].find((id) => !used.has(id)) || all[0] || null;
}

const showText = (p) => [
  `${p.id} — ${p.ten_vi} (${p.name}, ${p.family}, năng lượng ${p.energy}/5 = ${energyBucket(p.energy)})`,
  p.mo_ta_vi, p.summary,
  `Hợp: ${(p.best_for || []).join(", ")} · cảnh nên dùng: ${(p.scene_types?.prefer || []).join(", ")} · tránh: ${(p.scene_types?.avoid || []).join(", ") || "—"}`,
  `Nước đi đặc trưng: ${(p.signature_moves || []).join("; ")}`,
  `Ràng buộc: ${(p.constraints || []).join("; ")}`,
  `Tránh: ${(p.avoid || []).join("; ")}`,
  `Đi cùng: ${(p.pairs_well_with || []).join(", ")}${p.detail ? `\nChi tiết: ${join(OV_DIR, p.detail)}` : ""}`,
].join("\n");

function parseArgs(argv) {
  const o = { cmd: argv[0], rest: [], project: "." };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (["--json", "--write", "--markdown"].includes(a)) o[a.slice(2)] = true;
    else if (/^--[a-z-]+$/.test(a)) { if (argv[i + 1] === undefined) return { bad: `${a} needs a value` }; o[a.slice(2)] = argv[++i]; }
    else o.rest.push(a);
  }
  return o;
}

export function main(argv = process.argv.slice(2), log = console.log, err = console.error, { dir = STYLES_DIR } = {}) {
  if (wantsHelp(argv) || !argv.length) { process.stdout.write(helpText(import.meta.url)); return argv.length ? 0 : 2; }
  const o = parseArgs(argv);
  if (o.bad) { err(`styles: ${o.bad}`); return 2; }
  try {
    const profiles = loadProfiles(dir);
    if (o.cmd === "index") {
      const text = buildIndex(profiles);
      if (o.write) { writeFileSync(join(dir, INDEX_FILE), text); log(`styles: wrote ${join(dir, INDEX_FILE)} (${Object.keys(profiles).length} styles)`); }
      else process.stdout.write(text);
      return 0;
    }
    if (o.cmd === "validate") {
      const errors = validateProfiles(profiles, { dir });
      for (const e of errors) log(`FAIL  ${e}`);
      log(errors.length ? `BLOCKED  styles: ${errors.length} lỗi trong ${Object.keys(profiles).length} profile` : `PASS  styles (${Object.keys(profiles).length} profile)`);
      return errors.length ? 1 : 0;
    }
    if (o.cmd === "find") {
      const q = o.rest.join(" ").trim();
      if (!q) { err('styles find: needs "<words>"'); return 2; }
      const hits = findStyles(q, profiles);
      if (o.json) log(JSON.stringify(hits, null, 2));
      else if (!hits.length) log(`styles: không có style nào khớp "${q}"`);
      else for (const h of hits) log(`${h.id} — ${h.ten_vi} — ${h.score.toFixed(3)}`);
      return hits.length ? 0 : 1;
    }
    if (o.cmd === "show" || o.cmd === "css") {
      if (!o.rest[0]) { err(`styles ${o.cmd}: needs <id|alias>`); return 2; }
      const p = profiles[lookup(o.rest.join(" "), profiles)];
      log(o.cmd === "css" ? paletteCss(p) : o.json ? JSON.stringify(p, null, 2) : showText(p));
      return 0;
    }
    if (o.cmd === "resolve") {
      const r = resolveProject(o.project, profiles);
      if (o.json) log(JSON.stringify(r, null, 2));
      else if (o.markdown) log(renderMarkdown(r, profiles));
      else {
        log(renderMarkdown({ ...r, warnings: [] }, profiles));
        for (const w of r.warnings) log(`WARN  ${w}`);
        log(`resolve: ${r.base} · ${r.layers.length} lớp · ${r.scenes.length} cảnh`);
      }
      return 0;
    }
    if (o.cmd === "suggest") {
      const d = loadDirections().directions.find((x) => x.id === String(o.direction || "").toUpperCase());
      if (!d) { err("styles suggest: --direction <A1..A8> is required"); return 2; }
      const ids = suggestStyles(d, o.energy || "", profiles);
      if (o.json) log(JSON.stringify(ids.map((id) => ({ id, ten_vi: profiles[id].ten_vi, energy: profiles[id].energy, mo_ta_vi: profiles[id].mo_ta_vi })), null, 2));
      else if (!ids.length) log(`styles: hướng ${d.id} không có style gợi ý ở nhịp ${o.energy}; bỏ --energy để xem cả ${(d.styles_goi_y || []).length}`);
      else for (const id of ids) log(`${id} — ${profiles[id].ten_vi} — năng lượng ${profiles[id].energy}/5\n   ${profiles[id].mo_ta_vi}`);
      return 0;
    }
  } catch (e) {
    if (!(e instanceof StyleError)) throw e;
    err(`styles: ${e.message}`);
    return e.code;
  }
  err(`styles: unknown command ${o.cmd} (index | validate | find | show | resolve | css | suggest)`);
  return 2;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
