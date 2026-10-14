#!/usr/bin/env node
// directions.mjs — creative directions and keywords (SKILL.md step 1b). Source of truth:
// data/directions.json. Node built-ins only.
//   node directions.mjs check [--json]          every token exists in the installed HyperFrames
//   node directions.mjs pick --category <c> --aspect <16:9|9:16|both> [--energy em|vua|don-dap]
//                            [--topic "<chủ đề>"] [--json]
//   node directions.mjs show <A1..A8> [--json]
//   node directions.mjs compat --direction <id> [--energy e] [--style id] [--visual id]
//                            [--effect id] [--transition id] [--sfx id] [--json]
//   node directions.mjs doc [--write]            render references/creative-directions.md
//   node directions.mjs --help | -h
// check: blueprint → hyperframes-animation/blueprints/<n>.md · rule → rules/<n>.md ·
//   preset → hyperframes-creative/frame-presets/<n>/ · style → "## N. <name>" in
//   hyperframes-creative/references/visual-styles.md · seam → listed in data "seams" and, by kind,
//   a "## N. <heading>" in faceless-explainer/references/cut-catalog.md, a rule file, or the name in
//   hyperframes-animation/transitions/*.md (css, shader); kind native is opus-video's own.
// pick: 3 contrasting directions — one per tier (fit, continuous, bold) — scored by category (+3),
//   topic keywords (+2 each, max 4), energy (+1), aspect (required). Ties break on a hash of the
//   topic, so different topics do not always get the same order. Deterministic, no network.
// compat: WARN lines when a swapped keyword clashes with the direction, the energy or another
//   swapped keyword (tags vs clash in directions.json). The user still decides.
// Exit: 0 ok · 1 check failed · 2 bad usage · 3 compat warnings (ask the user once).

import { existsSync, readFileSync, readdirSync, writeFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { findSkill, OV_DIR } from "./skill-paths.mjs";

export const DATA = join(OV_DIR, "data", "directions.json");
export const DOC = join(OV_DIR, "references", "creative-directions.md");
export const DIMENSIONS = ["style", "visual", "effect", "transition", "sfx"];
export const DIM_VI = { style: "Phong cách", visual: "Hình chủ đạo", effect: "Hiệu ứng", transition: "Chuyển cảnh", sfx: "Âm thanh" };
export const TIERS = ["fit", "continuous", "bold"];
export const TIER_VI = { fit: "khớp chủ đề nhất", continuous: "liền mạch, không cắt", bold: "táo bạo" };

export const fold = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLowerCase().replace(/\s+/g, " ").trim();
export const loadDirections = (path = DATA) => JSON.parse(readFileSync(path, "utf8"));

export function upstream() {
  const anim = findSkill("hyperframes-animation");
  const creative = findSkill("hyperframes-creative");
  const faceless = findSkill("faceless-explainer");
  return { anim, creative, faceless };
}

const cache = new Map();
const read = (p) => { if (!cache.has(p)) cache.set(p, existsSync(p) ? readFileSync(p, "utf8") : ""); return cache.get(p); };
const transitionsText = (up) => {
  const dir = join(up.anim, "transitions");
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => read(join(dir, f))).join("\n") : "";
};
const flexible = (name) => new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/-/g, "[-\\s]"), "i");

export function seamDef(name, data) { return (data.seams || []).find((s) => s.id === name) || null; }

// → true when the token names something real in the installed HyperFrames (or is opus-video's own).
export function tokenExists(token, data, up = upstream()) {
  const { kind, name } = token;
  if (kind === "sfx") return Array.isArray(token.prompts) && token.prompts.length > 0;
  if (kind === "blueprint") return !!up.anim && existsSync(join(up.anim, "blueprints", `${name}.md`));
  if (kind === "rule") return !!up.anim && existsSync(join(up.anim, "rules", `${name}.md`));
  if (kind === "preset") return !!up.creative && existsSync(join(up.creative, "frame-presets", name));
  if (kind === "style") return !!up.creative && new RegExp(`^##\\s+\\d+\\.\\s+${name}\\b`, "m").test(read(join(up.creative, "references", "visual-styles.md")));
  if (kind === "seam") {
    const s = seamDef(name, data);
    if (!s) return false;
    if (s.kind === "native") return true;
    if (s.kind === "rule") return tokenExists({ kind: "rule", name }, data, up);
    if (s.kind === "cut-catalog") return !!up.faceless && new RegExp(`^##\\s+\\d+\\.\\s+${s.heading}`, "m").test(read(join(up.faceless, "references", "cut-catalog.md")));
    if (s.kind === "css" || s.kind === "shader") return !!up.anim && flexible(name).test(transitionsText(up));
  }
  return false;
}

// Every token the data names, with where it is used.
export function allTokens(data) {
  const out = [];
  for (const d of data.directions) {
    out.push({ where: `${d.id}.style`, token: d.style });
    for (const n of d.blueprints) out.push({ where: `${d.id}.blueprints`, token: { kind: "blueprint", name: n } });
    for (const n of d.rules) out.push({ where: `${d.id}.rules`, token: { kind: "rule", name: n } });
    for (const n of d.seams) out.push({ where: `${d.id}.seams`, token: { kind: "seam", name: n } });
  }
  for (const dim of DIMENSIONS) for (const k of data.keywords[dim] || []) out.push({ where: `keywords.${dim}.${k.id}`, token: k.token });
  for (const s of data.seams) out.push({ where: `seams.${s.id}`, token: { kind: "seam", name: s.id } });
  return out;
}

export function checkData(data, up = upstream()) {
  const errors = [];
  if (!up.anim || !up.creative || !up.faceless) errors.push(`HyperFrames skills not found (hyperframes-animation: ${up.anim || "missing"}, hyperframes-creative: ${up.creative || "missing"}, faceless-explainer: ${up.faceless || "missing"})`);
  const ids = new Set();
  for (const d of data.directions) {
    if (ids.has(d.id)) errors.push(`duplicate direction id ${d.id}`);
    ids.add(d.id);
    for (const f of ["slug", "ten_vi", "mo_ta_vi", "hook_vi", "styleframe_vi", "anti_slideshow_vi", "tier", "categories", "aspects", "energy", "tags", "style", "blueprints", "rules", "seams", "sfx"]) {
      if (d[f] === undefined || (Array.isArray(d[f]) && !d[f].length) || d[f] === "") errors.push(`${d.id}: field ${f} is missing or empty`);
    }
    if (!TIERS.includes(d.tier)) errors.push(`${d.id}: tier "${d.tier}" not in ${TIERS.join("/")}`);
    for (const e of d.energy || []) if (!data.energy[e]) errors.push(`${d.id}: energy "${e}" not defined`);
    if (new Set([...(d.blueprints || []), ...(d.rules || [])]).size < 2) errors.push(`${d.id}: needs at least 2 distinct blueprint/rule tokens`);
  }
  for (const t of TIERS) if (!data.directions.some((d) => d.tier === t)) errors.push(`no direction in tier ${t}`);
  for (const dim of DIMENSIONS) {
    const list = data.keywords[dim] || [];
    if (list.length < 3) errors.push(`keywords.${dim}: needs at least 3 options`);
    for (const k of list) if (!k.ten_vi || !k.mo_ta_vi) errors.push(`keywords.${dim}.${k.id}: ten_vi and mo_ta_vi are required`);
  }
  const missing = allTokens(data).filter((t) => !tokenExists(t.token, data, up));
  for (const m of missing) errors.push(`${m.where}: ${m.token.kind} "${m.token.name}" not found in the installed HyperFrames`);
  return { pass: errors.length === 0, errors, tokens: allTokens(data).length };
}

const hash = (s) => parseInt(createHash("sha256").update(s).digest("hex").slice(0, 8), 16);

export function scoreDirection(d, { category = "", aspect = "", energy = "", topic = "" } = {}) {
  let score = 0;
  const why = [];
  if (category && d.categories.includes(category)) { score += 3; why.push(`hợp nhóm ${category}`); }
  const t = fold(topic);
  const word = (k) => new RegExp(`(^|[^a-z0-9])${fold(k).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`);
  const hits = t ? d.topic_keywords.filter((k) => word(k).test(t)) : [];
  if (hits.length) { score += Math.min(4, hits.length * 2); why.push(`chủ đề có "${hits.slice(0, 2).join('", "')}"`); }
  if (energy && d.energy.includes(energy)) { score += 1; why.push(`hợp nhịp ${energy}`); }
  return { score, why };
}

export function pickDirections(opts = {}, data = loadDirections()) {
  const { aspect = "", topic = "" } = opts;
  const pool = data.directions.filter((d) => !aspect || d.aspects.includes(aspect));
  const ranked = pool.map((d) => ({ d, ...scoreDirection(d, opts), tie: hash(`${fold(topic)}|${d.id}`) }))
    .sort((a, b) => b.score - a.score || a.tie - b.tie);
  const chosen = [];
  for (const tier of TIERS) {
    const best = ranked.find((r) => r.d.tier === tier && !chosen.includes(r));
    if (best) chosen.push(best);
  }
  for (const r of ranked) if (chosen.length < 3 && !chosen.includes(r)) chosen.push(r);
  return chosen.slice(0, 3).map((r, i) => ({ n: i + 1, id: r.d.id, tier: r.d.tier, score: r.score, why: r.why, direction: r.d }));
}

export const keyword = (data, dim, id) => (data.keywords[dim] || []).find((k) => k.id === id) || null;
const energyTags = (e) => (e === "em" ? ["calm"] : e === "don-dap" ? ["loud"] : []);

// swaps: { style?: id, visual?: id, effect?: id, transition?: id, sfx?: id }
export function compatWarnings(direction, swaps = {}, energy = "", data = loadDirections()) {
  const warnings = [];
  const chosen = Object.entries(swaps).filter(([, id]) => id).map(([dim, id]) => ({ dim, k: keyword(data, dim, id) }));
  for (const c of chosen) if (!c.k) warnings.push(`không có từ khoá "${swaps[c.dim]}" trong nhóm ${DIM_VI[c.dim]}`);
  const valid = chosen.filter((c) => c.k);
  if (energy && direction.energy && !direction.energy.includes(energy)) warnings.push(`hướng ${direction.id} "${direction.ten_vi}" vốn ở nhịp ${direction.energy.map((e) => data.energy[e]?.ten_vi || e).join("/")}, chọn nhịp ${data.energy[energy]?.ten_vi || energy} có thể làm mất chất của hướng`);
  const base = [...direction.tags, ...energyTags(energy)];
  for (const c of valid) {
    const others = [...base.map((t) => ({ t, from: energyTags(energy).includes(t) && !direction.tags.includes(t) ? `nhịp ${data.energy[energy]?.ten_vi}` : `hướng ${direction.id}` })),
      ...valid.filter((o) => o !== c).flatMap((o) => o.k.tags.map((t) => ({ t, from: `${DIM_VI[o.dim]} "${o.k.ten_vi}"` })))];
    for (const o of others) if (c.k.clash.includes(o.t)) warnings.push(`${DIM_VI[c.dim]} "${c.k.ten_vi}" không hợp với ${o.from} (${o.t}); video dễ bị lộn xộn`);
  }
  return [...new Set(warnings)];
}

// Effective tokens after swaps: swapped keyword first, then the direction's own.
export function resolveSelection(direction, swaps = {}, data = loadDirections()) {
  const k = (dim) => (swaps[dim] ? keyword(data, dim, swaps[dim]) : null);
  const uniq = (a) => [...new Set(a)];
  const style = k("style")?.token || direction.style;
  const visual = k("visual")?.token.name;
  const effect = k("effect")?.token.name;
  const seam = k("transition")?.token.name;
  return {
    style,
    blueprints: uniq([...(visual ? [visual] : []), ...direction.blueprints]),
    rules: uniq([...(effect ? [effect] : []), ...direction.rules]),
    seams: uniq([...(seam ? [seam] : []), ...direction.seams]),
    sfx: k("sfx")?.token.prompts || direction.sfx,
    allow_soft: !!direction.allow_soft,
  };
}

export function wordBudget(energy, duration, data = loadDirections()) {
  const e = data.energy[energy] || data.energy.vua;
  return { words: Math.max(8, Math.round((e.words_per_15s * (Number(duration) || 15)) / 15)), music_only_s: e.music_only_s };
}

// Seam cell text → [{ token, class: continuous|soft|banned|unknown }]
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasWord = (text, word) => new RegExp(`(^|[^a-z0-9-])${esc(word)}($|[^a-z0-9-])`).test(text);
export function classifySeams(cell, data = loadDirections()) {
  const banned = [...new Set(data.seam_classes.banned.map(fold))];
  const soft = new Set(data.seam_classes.soft);
  const seams = [...(data.seams || [])].sort((a, b) => b.id.length - a.id.length);
  const whole = fold(String(cell || "").replace(/`/g, ""));
  const parts = whole.split(/[,;+·/]|\s+va\s+|\s+roi\s+|\s+sau do\s+|\s+then\s+/).map((s) => s.trim()).filter(Boolean);
  const out = parts.map((f) => {
    const id = seams.find((s) => hasWord(f, s.id))?.id;
    if (id) return { token: id, class: soft.has(id) ? "soft" : "continuous" };
    const b = banned.find((w) => hasWord(f, w));
    if (b) return { token: b, class: "banned" };
    return { token: f, class: "unknown" };
  });
  // A banned swap left over once known seam ids are masked ("push-slide-fade") still blocks.
  let rest = whole;
  for (const s of seams) rest = rest.replace(new RegExp(`(^|[^a-z0-9-])${esc(s.id)}(?=$|[^a-z0-9-])`, "g"), "$1 ");
  rest = rest.replace(/-/g, " ");
  for (const w of banned) if (hasWord(rest, w) && !out.some((x) => x.class === "banned" && x.token === w)) out.push({ token: w, class: "banned" });
  return out;
}

const tokenLabel = (t) => (t.kind === "sfx" ? t.prompts.map((p) => `"${p}"`).join(", ") : `${t.kind} \`${t.name}\``);

export function renderDoc(data = loadDirections()) {
  const L = [];
  L.push("# Hướng đạo diễn và từ khoá sáng tạo", "");
  L.push("> File sinh tự động từ `data/directions.json` bằng `node scripts/directions.mjs doc --write`. Không sửa tay; sửa JSON rồi sinh lại. `node scripts/directions.mjs check` kiểm mọi token có thật trong HyperFrames đã cài.", "");
  L.push("Dùng ở **bước 1b** (`SKILL.md`): agent chọn 3 hướng bằng `directions.mjs pick`, dựng styleframe bằng `make-pitch.mjs`, người dùng chọn bằng mắt rồi đổi tối đa vài từ khoá. Người dùng chỉ thấy cột tiếng Việt; token kỹ thuật ghi vào `BRIEF.md` và `PLAN.md`.", "");
  L.push("## Hai núm chỉnh", "");
  L.push("| Núm | Lựa chọn |", "|---|---|");
  L.push(`| Nhịp (\`energy\`) | ${Object.entries(data.energy).map(([k, v]) => `\`${k}\` ${v.ten_vi}: ${v.mo_ta_vi} (≈${v.words_per_15s} từ/15s, ≥${v.music_only_s}s không lời)`).join("<br>")} |`);
  L.push(`| Tông màu (\`palette\`) | ${Object.entries(data.palette).map(([k, v]) => `\`${k}\` ${v.ten_vi}: ${v.mo_ta_vi}`).join("<br>")} |`, "");
  L.push("## 8 hướng đạo diễn", "");
  L.push("| Mã | Tên (người dùng thấy) | Mô tả | Nhóm pick | Luật chống slideshow |", "|---|---|---|---|---|");
  for (const d of data.directions) L.push(`| ${d.id} | **${d.ten_vi}** | ${d.mo_ta_vi} | ${TIER_VI[d.tier]} | ${d.anti_slideshow_vi} |`);
  L.push("");
  for (const d of data.directions) {
    L.push(`### ${d.id} — ${d.ten_vi}`, "");
    L.push(`- Hook: ${d.hook_vi}`);
    L.push(`- Styleframe 3 giây: ${d.styleframe_vi}`);
    L.push(`- Style: ${tokenLabel(d.style)} · Blueprint: ${d.blueprints.map((b) => `\`${b}\``).join(", ")} · Rule: ${d.rules.map((r) => `\`${r}\``).join(", ")}`);
    L.push(`- Chuyển cảnh: ${d.seams.map((s) => `\`${s}\``).join(", ")}${d.allow_soft ? " (cho phép chuyển cảnh mềm: " + data.seam_classes.soft.map((s) => `\`${s}\``).join(", ") + ")" : ""}`);
    L.push(`- SFX: ${d.sfx.map((s) => `"${s}"`).join(", ")} · Nhịp: ${d.energy.join("/")} · Nhóm: ${d.categories.join(", ")}`);
    if (d.cases.length) L.push(`- Case tham khảo: ${d.cases.map((c) => `\`${c}\``).join(", ")}`);
    L.push("");
  }
  L.push("## Từ khoá đổi được (5 nhóm)", "");
  L.push("Người dùng chọn một hướng rồi đổi từng nhóm bằng mã từ khoá. Phối không hợp thì `directions.mjs compat` cảnh báo (thẻ `tags` gặp `clash`).", "");
  for (const dim of DIMENSIONS) {
    L.push(`### ${DIM_VI[dim]} (\`${dim}\`)`, "");
    L.push("| Mã | Tên | Người dùng hình dung | Token | Không hợp với |", "|---|---|---|---|---|");
    for (const k of data.keywords[dim]) L.push(`| \`${k.id}\` | ${k.ten_vi} | ${k.mo_ta_vi} | ${tokenLabel(k.token)} | ${k.clash.length ? k.clash.join(", ") : "—"} |`);
    L.push("");
  }
  L.push("## Từ vựng chuyển cảnh (cột \"Nối sang beat sau\" trong PLAN.md)", "");
  L.push(`- **Bị chặn:** ${data.seam_classes.banned.map((s) => `\`${s}\``).join(", ")}.`);
  L.push(`- **Mềm** (chỉ hướng có \`allow_soft\`): ${data.seam_classes.soft.map((s) => `\`${s}\``).join(", ")}.`);
  L.push(`- **Liền mạch:** ${data.seams.filter((s) => !data.seam_classes.soft.includes(s.id)).map((s) => `\`${s.id}\` (${s.kind})`).join(", ")}.`);
  L.push("- Nguồn công thức: `cut-catalog` → `faceless-explainer/references/cut-catalog.md`; `rule` → `hyperframes-animation/rules/<id>.md`; `css`/`shader` → `hyperframes-animation/transitions/`; `native` → mô tả trong `data/directions.json`.", "");
  return L.join("\n");
}

function parseArgs(argv) {
  const o = { cmd: argv[0], rest: [] };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json" || a === "--write") o[a.slice(2)] = true;
    else if (/^--[a-z]+$/.test(a)) { if (argv[i + 1] === undefined) return { bad: `${a} needs a value` }; o[a.slice(2)] = argv[++i]; }
    else o.rest.push(a);
  }
  return o;
}

export function main(argv = process.argv.slice(2), log = console.log, err = console.error) {
  if (wantsHelp(argv) || !argv.length) { process.stdout.write(helpText(import.meta.url)); return argv.length ? 0 : 2; }
  const o = parseArgs(argv);
  if (o.bad) { err(`directions: ${o.bad}`); return 2; }
  const data = loadDirections();
  if (o.cmd === "check") {
    const r = checkData(data);
    if (o.json) log(JSON.stringify(r, null, 2));
    else { for (const e of r.errors) log(`FAIL  ${e}`); log(r.pass ? `PASS  directions (${data.directions.length} hướng, ${r.tokens} token có thật)` : `BLOCKED  directions: ${r.errors.length} lỗi`); }
    return r.pass ? 0 : 1;
  }
  if (o.cmd === "pick") {
    if (!o.aspect) { err("directions pick: --aspect is required"); return 2; }
    const picks = pickDirections({ category: o.category || "", aspect: o.aspect, energy: o.energy || "", topic: o.topic || "" }, data);
    if (o.json) log(JSON.stringify(picks.map(({ direction, ...p }) => ({ ...p, ten_vi: direction.ten_vi, mo_ta_vi: direction.mo_ta_vi })), null, 2));
    else for (const p of picks) log(`${p.n}. ${p.id} ${p.direction.ten_vi} [${TIER_VI[p.tier]}] score ${p.score}${p.why.length ? ` (${p.why.join("; ")})` : ""}\n   ${p.direction.mo_ta_vi}`);
    return 0;
  }
  if (o.cmd === "show") {
    const d = data.directions.find((x) => x.id === (o.rest[0] || "").toUpperCase());
    if (!d) { err(`directions show: unknown id ${o.rest[0] || ""}`); return 2; }
    log(o.json ? JSON.stringify(d, null, 2) : `${d.id} ${d.ten_vi}\n${d.mo_ta_vi}\nHook: ${d.hook_vi}\nStyleframe: ${d.styleframe_vi}\nChống slideshow: ${d.anti_slideshow_vi}\nTokens: ${tokenLabel(d.style)} · ${d.blueprints.join(", ")} · ${d.rules.join(", ")} · seams ${d.seams.join(", ")}`);
    return 0;
  }
  if (o.cmd === "compat") {
    const d = data.directions.find((x) => x.id === String(o.direction || "").toUpperCase());
    if (!d) { err("directions compat: --direction <A1..A8> is required"); return 2; }
    const swaps = Object.fromEntries(DIMENSIONS.filter((k) => o[k]).map((k) => [k, o[k]]));
    const w = compatWarnings(d, swaps, o.energy || "", data);
    if (o.json) log(JSON.stringify({ direction: d.id, swaps, warnings: w, selection: resolveSelection(d, swaps, data) }, null, 2));
    else { for (const x of w) log(`WARN  ${x}`); log(w.length ? `compat: ${w.length} cảnh báo — hỏi người dùng một lần, họ vẫn quyết` : "compat: ok"); }
    return w.length ? 3 : 0;
  }
  if (o.cmd === "doc") {
    const md = renderDoc(data) + "\n";
    if (o.write) { writeFileSync(DOC, md); log(`directions: wrote ${DOC}`); }
    else process.stdout.write(md);
    return 0;
  }
  err(`directions: unknown command ${o.cmd} (check | pick | show | compat | doc)`);
  return 2;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
