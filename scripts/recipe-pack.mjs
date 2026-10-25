#!/usr/bin/env node
// recipe-pack.mjs — gather the HyperFrames recipes a build must follow into one file, so the
// builder (agent or frame worker) has the real code mechanics in context instead of turning the
// creative keywords into "cards slide up and fade" (SKILL.md step 6, pitch styleframes in 1b).
//   node recipe-pack.mjs --project .                 tokens from PLAN.md (+ BRIEF direction)
//   node recipe-pack.mjs --direction <A1..A8> [--style id] [--visual id] [--effect id]
//                        [--transition id] [--sfx id] --out <file>     (pitch styleframes)
//   node recipe-pack.mjs --help | -h
// Tokens: every blueprint/rule named in PLAN.md "## Ý đồ sáng tạo" and the "## Cảnh"
//   Blueprint/Rule column that exists in hyperframes-animation, plus seams from the
//   "Nối sang beat sau" column; with BRIEF `direction:` the direction's own tokens are added.
// Output (default <project>/build/RECIPES.md): build rules first, then for each token the full
//   upstream file — blueprints/<id>.md, rules/<id>.md, the cut-catalog section for cut seams, the
//   transitions/*.md file naming a css seam, the shader part of transitions/catalog.md and the
//   shader-compatible CSS rules of overview.md for shader seams, the description for native seams.
// check-preflight --stage final requires build/RECIPES.md newer than PLAN.md.
// Exit: 0 written · 1 nothing to pack / upstream missing · 2 bad usage.

import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { frontmatter } from "./check-viet-pro.mjs";
import { parsePlan, parseTable, CREATIVE_SECTION, SECTIONS } from "./check-preflight.mjs";
import { loadDirections, upstream, tokenExists, classifySeams, seamDef, resolveSelection, DIMENSIONS } from "./directions.mjs";

const uniq = (a) => [...new Set(a)];

// PLAN.md text → { blueprints, rules, seams } (only names that exist upstream / in the seam list)
export function planTokens(planText, data, up) {
  const plan = parsePlan(planText);
  const t = parseTable(plan.sections[SECTIONS.scenes]);
  const bp = t.headers.findIndex((h) => /blueprint|\brule\b/.test(h));
  const sm = t.headers.findIndex((h) => /noi sang|seam|chuyen canh/.test(h));
  const text = [plan.sections[CREATIVE_SECTION] || "", ...(bp >= 0 ? t.rows.map((r) => r[bp] || "") : [])].join("\n");
  const words = uniq(text.replace(/`/g, " ").match(/[a-z0-9]+(?:-[a-z0-9]+)+/g) || []);
  const seamText = [plan.sections[CREATIVE_SECTION] || "", ...(sm >= 0 ? t.rows.map((r) => r[sm] || "") : [])].join(",");
  return {
    blueprints: words.filter((w) => tokenExists({ kind: "blueprint", name: w }, data, up)),
    rules: words.filter((w) => tokenExists({ kind: "rule", name: w }, data, up)),
    seams: uniq([...classifySeams(seamText, data).filter((s) => s.class !== "banned" && s.class !== "unknown").map((s) => s.token),
      ...words.filter((w) => seamDef(w, data))]),
  };
}

function section(text, headingRe) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => headingRe.test(l));
  if (start < 0) return "";
  const level = lines[start].match(/^#+/)[0].length;
  const end = lines.findIndex((l, i) => i > start && new RegExp(`^#{1,${level}}\\s`).test(l));
  return lines.slice(start, end < 0 ? undefined : end).join("\n").trim();
}
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
// Upstream headings go two levels down so they nest under this file's "## blueprint …" headings.
const demote = (t) => String(t || "").replace(/^(#{1,4}) /gm, "$1## ");

export function buildRecipes({ blueprints = [], rules = [], seams = [], direction = null, style = null }, data, up) {
  const out = [];
  const src = (p) => `<!-- source: ${p} -->`;
  out.push("# RECIPES — công thức bắt buộc cho bản dựng này", "");
  out.push("> Sinh bằng `recipe-pack.mjs`. Đọc hết trước khi viết HTML. Mỗi beat trong PLAN.md phải dựng bằng đúng blueprint/rule/seam dưới đây, không tự chế bằng `opacity` + `y`.", "");
  out.push("## Luật dựng (opus-video)", "");
  out.push("1. **Không dồn hết lên đầu cảnh.** Phần tử của một beat lộ dần theo `words.json`, phần lớn rơi vào nửa sau của beat; không đặt toàn bộ DOM ở t=0 rồi đứng yên.");
  out.push("2. **Không exit-rồi-enter.** Cấm cảnh cũ mờ về 0 rồi cảnh mới mới hiện (third_party/hyperframes-skills/hyperframes-animation/transitions/overview.md của opus-video). Hai cảnh phải chồng nhau trong seam đã khai.");
  out.push("3. **Mỗi beat một chuyển động bậc cao** (scale/morph, camera, clip/mask, 3D, path draw, shader), không chỉ trượt và mờ. qc-mp4 MOTION chặn bản render có ≥60% khung đứng yên.");
  out.push("4. **Beat không lời là beat hình**: ở các đoạn `(nhạc)` trong PLAN.md, hình phải tự kể (morph, camera bay, chữ đập theo beat).");
  out.push("5. **Giữ Kỷ luật GSAP** của references/edit-method.md (`immediateRender:false`, không `.from` khi seek, id không bắt đầu bằng số).", "");
  if (direction) {
    out.push(`## Hướng ${direction.id} — ${direction.ten_vi}`, "", `- ${direction.mo_ta_vi}`, `- Hook: ${direction.hook_vi}`, `- Luật chống slideshow: ${direction.anti_slideshow_vi}`);
    if (style) out.push(`- Style: ${style.kind} \`${style.name}\`${style.kind === "style" ? " — đọc mục tương ứng trong hyperframes-creative/references/visual-styles.md" : " — preset trong hyperframes/assets/frame-presets/" + style.name + "/"}`);
    out.push("");
  }
  if (style && style.kind === "style") {
    const vs = read(join(up.creative, "references", "visual-styles.md"));
    const body = section(vs, new RegExp(`^##\\s+\\d+\\.\\s+${style.name}\\b`));
    if (body) out.push(src("hyperframes-creative/references/visual-styles.md"), demote(body), "");
  }
  for (const b of uniq(blueprints)) {
    const p = join(up.anim, "blueprints", `${b}.md`);
    out.push(`## blueprint \`${b}\``, "", src(relative(dirname(up.anim), p)), demote(read(p).trim()), "");
  }
  for (const r of uniq(rules)) {
    const p = join(up.anim, "rules", `${r}.md`);
    out.push(`## rule \`${r}\``, "", src(relative(dirname(up.anim), p)), demote(read(p).trim()), "");
  }
  const cut = read(join(up.faceless, "references", "cut-catalog.md"));
  const tdir = join(up.anim, "transitions");
  const tfiles = existsSync(tdir) ? readdirSync(tdir).filter((f) => f.endsWith(".md")).sort() : [];
  const done = new Set();
  let blurLogic = false, shaderDone = false;
  for (const id of uniq(seams)) {
    const s = seamDef(id, data);
    if (!s) continue;
    out.push(`## seam \`${id}\` (${s.kind})`, "");
    if (s.kind === "cut-catalog") {
      if (!blurLogic && /zoom-through/.test(id)) { out.push(demote(section(cut, /^##\s+Blur Logic/)), ""); blurLogic = true; }
      out.push(src("faceless-explainer/references/cut-catalog.md"), demote(section(cut, new RegExp(`^##\\s+\\d+\\.\\s+${s.heading}`))), "");
    } else if (s.kind === "rule") {
      if (rules.includes(id)) out.push(`Xem mục rule \`${id}\` ở trên.`, "");
      else out.push(src(`hyperframes-animation/rules/${id}.md`), demote(read(join(up.anim, "rules", `${id}.md`)).trim()), "");
    } else if (s.kind === "css") {
      const re = new RegExp(id.replace(/-/g, "[-\\s]"), "i");
      const f = tfiles.find((x) => x.startsWith("css-") && re.test(read(join(tdir, x))));
      if (f && !done.has(f)) { out.push(src(`hyperframes-animation/transitions/${f}`), demote(read(join(tdir, f)).trim()), ""); done.add(f); }
      else out.push(f ? `Xem transitions/${f} ở trên.` : "Xem hyperframes-animation/transitions/catalog.md.", "");
    } else if (s.kind === "shader") {
      if (!shaderDone) {
        out.push(src("hyperframes-animation/transitions/catalog.md"), demote(section(read(join(tdir, "catalog.md")), /^##\s+Shader Transitions/)), "");
        out.push(src("hyperframes-animation/transitions/overview.md"), demote(section(read(join(tdir, "overview.md")), /^##\s+CSS vs Shader/)), demote(section(read(join(tdir, "overview.md")), /^##\s+Shader-Compatible CSS Rules/)), "");
        shaderDone = true;
      }
      out.push(`Dùng \`HyperShader.init({ … transitions: [{ time, shader: "${id}", duration }] })\` từ \`@hyperframes/shader-transitions\`.`, "");
    } else out.push(s.mo_ta || "", "");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const k = a.replace(/^--/, "");
    if (["--project", "--direction", "--out", ...DIMENSIONS.map((d) => `--${d}`)].includes(a)) { if (argv[i + 1] === undefined) return { bad: `${a} needs a value` }; o[k] = argv[++i]; }
    else return { bad: `unknown argument ${a}` };
  }
  if (!o.project && !o.direction) return { bad: "need --project or --direction" };
  if (o.direction && !o.project && !o.out) return { bad: "--direction without --project needs --out" };
  return o;
}

export function main(argv = process.argv.slice(2), log = console.log, err = console.error) {
  if (wantsHelp(argv)) { process.stdout.write(helpText(import.meta.url)); return 0; }
  const o = parseArgs(argv);
  if (o.bad) { err(`recipe-pack: ${o.bad}`); return 2; }
  const data = loadDirections();
  const up = upstream();
  if (!up.anim || !up.faceless || !up.creative) { err("recipe-pack: HyperFrames recipes (hyperframes-animation, hyperframes-creative, faceless-explainer) not found: third_party/hyperframes-skills is missing from the plugin; reinstall opus-video"); return 1; }
  let tokens = { blueprints: [], rules: [], seams: [] }, direction = null, style = null;
  const swaps = Object.fromEntries(DIMENSIONS.filter((d) => o[d]).map((d) => [d, o[d]]));
  let dirId = o.direction;
  if (o.project) {
    const dir = resolve(o.project);
    const plan = join(dir, "PLAN.md");
    if (!o.direction && existsSync(plan)) tokens = planTokens(readFileSync(plan, "utf8"), data, up);
    const fm = existsSync(join(dir, "BRIEF.md")) ? frontmatter(readFileSync(join(dir, "BRIEF.md"), "utf8")) : {};
    dirId = dirId || fm.direction;
    for (const part of String(fm.direction_swaps || "").split(/[;,]/)) { const [k, v] = part.split("=").map((x) => (x || "").trim()); if (DIMENSIONS.includes(k) && v && !swaps[k]) swaps[k] = v; }
  }
  if (dirId) {
    direction = data.directions.find((d) => d.id === String(dirId).trim().toUpperCase().split(/\s/)[0]) || null;
    if (!direction) { err(`recipe-pack: unknown direction ${dirId}`); return 2; }
    const sel = resolveSelection(direction, swaps, data);
    style = sel.style;
    tokens = { blueprints: uniq([...tokens.blueprints, ...sel.blueprints]), rules: uniq([...tokens.rules, ...sel.rules]), seams: uniq([...tokens.seams, ...sel.seams]) };
  }
  if (!tokens.blueprints.length && !tokens.rules.length && !tokens.seams.length) { err("recipe-pack: no blueprint/rule/seam found (PLAN.md \"## Cảnh\" Blueprint/Rule column, or BRIEF direction)"); return 1; }
  const out = resolve(o.out || join(resolve(o.project), "build", "RECIPES.md"));
  mkdirSync(dirname(out), { recursive: true });
  const md = buildRecipes({ ...tokens, direction, style }, data, up);
  writeFileSync(out, md);
  log(`recipe-pack: ${tokens.blueprints.length} blueprint, ${tokens.rules.length} rule, ${tokens.seams.length} seam → ${out} (${Math.round(md.length / 1024)} KB)`);
  log("Next: đọc hết file này (hoặc chép vào prompt frame worker) trước khi viết HTML.");
  return 0;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
