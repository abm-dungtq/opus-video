#!/usr/bin/env node
// make-pitch.mjs — creative pitch (SKILL.md step 1b): 3 directions, 3 styleframes built from the
// user's own topic, the user picks by eye, the choice is written into BRIEF.md. Works the same on
// every agent: the menu is plain text in PITCH.md plus file paths (no runtime-specific picker).
//   node make-pitch.mjs init   --project . --topic "<chủ đề>" --aspect <16:9|9:16|both>
//                              [--category <motion|explainer|3d|interactive|product|story-music|bat-dong-san>]
//                              [--energy em|vua|don-dap] [--duration <s, default BRIEF duration_s, else 15>]
//                              [--brand <brand.json>] [--lemo <watercolor|glass-product|lemo-… profile>]
//   node make-pitch.mjs render --project .
//   node make-pitch.mjs choose --project . (--pick <1|2|3> | --auto) [--style id] [--visual id]
//                              [--effect id] [--transition id] [--sfx id] [--energy e]
//                              [--palette toi|sang|thuong-hieu] [--brand <brand.json>]
//                              [--style-profile <id|alias>] [--accept-warnings]
//   node make-pitch.mjs --help | -h
// init/choose read brand.json (project, then ../shared-assets) when present (brand.mjs): banned
//   directions are dropped from the pick, STYLEFRAME.md gets the brand colours, logo and fonts,
//   choose defaults to palette thuong-hieu, writes brand: and fills voice_id / tts_model when BRIEF
//   has none or only the template default.
// init: directions.mjs pick → pitch/PICK.json; for each pick a HyperFrames project
//   pitch/<n>-<slug>/ (`hyperframes init --example blank`, portrait for 9:16/both, landscape for
//   16:9) holding STYLEFRAME.md (what to build in ~3 s) and RECIPES.md (recipe-pack for that
//   direction). The agent then writes each index.html from STYLEFRAME.md + RECIPES.md. Each pick
//   gets a style profile (styles.mjs): the first of the direction's styles_goi_y that fits the
//   energy and is not used by an earlier pick; STYLEFRAME.md lists its palette (CSS), type,
//   material, transitions, three signature moves, constraints and detail document. Brand colours
//   win over the style palette. The id is kept in pitch/PICK.json.
//   --lemo puts a lemo-canvas style profile (styles.mjs, engine lemo-canvas) on the bold-tier pick:
//   its project starts from the opus-video skeleton (composition.mjs) instead of the blank example,
//   so lemo.mjs add finds its markers, and STYLEFRAME.md says to run lemo.mjs add before building.
//   Without --lemo, a `lemo_style:` in BRIEF.md does the same.
// render: renders every pitch/<n>-*/index.html at --quality draft to pitch/<n>.mp4, cuts a poster
//   pitch/<n>.png at 60% of the clip, tiles pitch/sheet.jpg, measures motion (qc-mp4 MOTION) and
//   writes PITCH.md: the 3 options with paths, the two knobs, 3–4 swappable keywords per group
//   and the reply syntax. Show PITCH.md + sheet.jpg (+ the MP4s) to the user and wait.
// choose: compat check (directions.mjs); warnings → exit 3 so the agent asks the user once, then
//   re-run with --accept-warnings if they keep it. Writes BRIEF.md frontmatter: direction,
//   direction_swaps, energy, palette, word_budget, music_only_s, creative_selection (user|auto),
//   styleframe, style_profile (BRIEF's lemo_style profile, else the pick's style; --style-profile
//   overrides both, and with it compat also warns on
//   an energy mismatch and on a swapped style keyword); and a "## creative_direction" body
//   section. --auto = option 1, recorded as auto (only when the user asked to run without stopping).
// Exit: 0 ok · 1 render/init failed or ffmpeg/ffprobe missing · 2 bad usage · 3 compat warnings to confirm · 4 a styleframe
//   fails MOTION (render; PITCH.md is still written), rebuild it.

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { frontmatter } from "./check-viet-pro.mjs";
import { loadDirections, pickDirections, compatWarnings, resolveSelection, wordBudget, upstream, DIMENSIONS, DIM_VI, TIER_VI } from "./directions.mjs";
import { StyleError, defaultStyle, loadProfiles, lookup, paletteCss } from "./styles.mjs";
import { SKELETON, sizeSkeleton } from "./composition.mjs";
import { OV_DIR } from "./skill-paths.mjs";
import { buildRecipes } from "./recipe-pack.mjs";
import { findBrand, validateBrand, brandAbs } from "./brand.mjs";
import { PLACEHOLDER } from "./check-preflight.mjs";
import { DEFAULT_VOICE, DEFAULT_TTS_MODEL } from "./voice-defaults.mjs";
import { contactSheet, winArgs } from "./make-demo.mjs";
import { measureMotion, motionVerdict } from "./qc-mp4.mjs";

const WIN = process.platform === "win32";
const posix = (p) => p.split("\\").join("/");
const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
// Reply keys the user types in PITCH.md → choose flags (--style, --visual, …).
export const REPLY_KEY = { style: "phong cách", visual: "hình", effect: "hiệu ứng", transition: "chuyển cảnh", sfx: "âm thanh" };
// A BRIEF value copied from the template ("<số giây>", "…") counts as not set.
const setv = (v) => (v && !PLACEHOLDER.test(String(v).trim()) ? v : "");
const SIZE = { "9:16": [1080, 1920], "16:9": [1920, 1080], both: [1080, 1920] };

// Set frontmatter keys in a markdown text (adds the block when missing). Values are single-line;
// null deletes the key, undefined/"" leave it as is. Duplicated keys collapse to one line.
export function setFrontmatter(text, values) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  let lines = m ? m[1].split(/\r?\n/) : [];
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || v === "") continue;
    const re = new RegExp(`^${k}:`);
    const i = lines.findIndex((l) => re.test(l));
    lines = lines.filter((l, j) => j === i || !re.test(l));
    if (v === null) { if (i >= 0) lines.splice(i, 1); continue; }
    const line = `${k}: ${String(v).replace(/\r?\n/g, " ")}`;
    if (i >= 0) lines[i] = line; else lines.push(line);
  }
  const body = m ? text.slice(m[0].length) : text;
  return `---\n${lines.join("\n")}\n---\n${body.startsWith("\n") || !body ? "" : "\n"}${body}`;
}

// Replace (or append) a "## <name>" section.
export function setSection(text, name, content) {
  const re = new RegExp(`^## ${name}\\s*$[\\s\\S]*?(?=^## |(?![\\s\\S]))`, "m");
  const block = `## ${name}\n\n${content.trim()}\n\n`;
  return re.test(text) ? text.replace(re, block) : `${text.trimEnd()}\n\n${block}`;
}

function brandMd(found) {
  if (!found) return "";
  const p = found.brand.palette || {};
  const files = [["Logo", "logo"], ["Font heading", "fonts.heading"], ["Font body", "fonts.body"]].map(([label, key]) => [label, brandAbs(found, key)]).filter(([, v]) => v);
  return `## Thương hiệu
- Màu: nền \`${p.bg}\` · chữ \`${p.fg}\` · nhấn \`${p.accent}\`${p.accent2 ? ` · nhấn phụ \`${p.accent2}\`` : ""}
${files.map(([label, v]) => `- ${label}: \`${v}\``).join("\n")}${files.length ? "\n" : ""}- Dùng đúng các màu này; logo xuất hiện ở cảnh cuối, không đặt ở góc.

`;
}

// The look of the styleframe from a style profile. Brand colours, when given, win over its palette.
export function styleMd(style, direction, brand = null) {
  if (!style) return "";
  const dims = style.dimensions || {};
  const list = (xs) => (xs || []).join("; ");
  return `## Style: ${style.ten_vi} (${style.id})
${style.mo_ta_vi}

Style quyết định giao diện (màu, chữ, chất liệu) và thắng token style/preset của hướng ở trên khi hai bên khác nhau; hướng ${direction.id} vẫn quyết định cách kể bằng hình. Seam giữa các beat vẫn lấy từ hướng (cổng sáng tạo chặn fade, cut); chuyển cảnh của style chỉ là chất liệu cho seam đó.
${brand ? "- **Màu thương hiệu thắng:** dùng màu ở mục Thương hiệu thay cho bảng màu dưới đây; từ style chỉ lấy chữ, chất liệu, chuyển động.\n" : ""}- Bảng màu (${dims.palette?.mode || "?"}): ${dims.palette?.rule || "—"}

\`\`\`css
${paletteCss(style)}
\`\`\`

- Chữ: ${list(dims.typography)} (font thiếu dấu tiếng Việt thì thay bằng Be Vietnam Pro)
- Chất liệu: ${list(dims.material)}
- Chuyển cảnh: ${list(dims.transitions)}
- Nước đi đặc trưng: ${list((style.signature_moves || []).slice(0, 3))}
- Ràng buộc: ${list(style.constraints)}
${style.engine === "lemo-canvas" ? `- **Engine lemo-canvas (${style.lemo.kind}):** trong thư mục này chạy \`node ${join(OV_DIR, "scripts", "lemo.mjs")} add --project . --style ${style.lemo.style}\` (lần đầu chạy \`lemo.mjs fetch\`), đọc hướng dẫn phong cách mà lệnh in ra, rồi viết \`assets/lemo/${style.lemo.kind === "2d" ? "scene.js" : "scene3d.js"}\` theo chủ đề. Chữ tiếng Việt ở lớp DOM, không vẽ lên canvas. Cách dùng: \`${join(OV_DIR, "references", "lemo-canvas.md")}\`.\n` : ""}${style.detail ? `- Chi tiết: \`${join(OV_DIR, style.detail)}\`\n` : ""}
`;
}

// One finished styleframe per direction (from a real pitch), shown to the agent as a reference.
const EXAMPLES = fileURLToPath(new URL("../references/styleframe-examples/", import.meta.url));

export function styleframeMd({ n, pick, topic, aspect, energy, data, brand = null, style = null }) {
  const d = pick.direction;
  const example = join(EXAMPLES, `${d.id}.html`);
  const [w, h] = SIZE[aspect] || SIZE["9:16"];
  const sel = resolveSelection(d, {}, data);
  return `# STYLEFRAME ${n} — ${d.id} ${d.ten_vi}

Chủ đề của người dùng: **${topic}**
Khung: ${w}×${h}, dài **3 giây**, 30 fps. Nhịp: ${data.energy[energy]?.ten_vi || energy}.

## Dựng gì trong 3 giây
${d.styleframe_vi}

- Hook: ${d.hook_vi}
- Luật chống slideshow: ${d.anti_slideshow_vi}
- Style: ${sel.style.kind} \`${sel.style.name}\` · Blueprint: ${sel.blueprints.map((b) => `\`${b}\``).join(", ")} · Rule: ${sel.rules.map((r) => `\`${r}\``).join(", ")} · Seam: ${sel.seams.map((s) => `\`${s}\``).join(", ")}
${existsSync(example) ? `- Ví dụ cùng hướng: \`${example}\` (styleframe mẫu từ một pitch thật, chủ đề khác; học cách dựng, không chép chữ hay màu)\n` : ""}
${styleMd(style, d, brand)}${brandMd(brand)}## Bắt buộc
1. Đọc hết \`RECIPES.md\` cùng thư mục trước khi viết \`index.html\`; dựng bằng đúng các cơ chế trong đó.
2. Dùng chữ thật của chủ đề (tên sản phẩm, con số, câu hook ngắn), không lorem ipsum, không bịa số liệu.
3. ${brand ? "Font heading của brand nếu có đủ dấu tiếng Việt; không thì Be Vietnam Pro." : "Font có đủ dấu tiếng Việt (Be Vietnam Pro hoặc font preset đã kiểm dấu)."}
4. Không đặt chữ/khung trang trí ở 4 góc (dấu hiệu video AI); ${aspect === "16:9" ? "giữ chủ thể trong vùng an toàn 90%" : "9:16: không đặt chữ ở 12% trên và 20% dưới (vùng UI TikTok)"}.
5. Chuyển động liên tục suốt 3 giây, không có đoạn đứng yên quá 0,5 giây; không thẻ trượt lên rồi mờ dần.
6. Không cần âm thanh. Đây là bản mẫu để người dùng chọn bằng mắt; bản được chọn sẽ thành cảnh mở đầu của video thật.
`;
}

function hfInit(cwd, name, aspect) {
  return spawnSync("npx", winArgs(["hyperframes", "init", name, "--example", "blank", "--resolution", aspect === "16:9" ? "landscape" : "portrait", "--non-interactive"]),
    { cwd, stdio: "inherit", shell: WIN, env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: "1" } });
}

// --lemo value → the lemo-canvas profile id: a profile id or alias, or the lemo catalog slug it draws.
export function lemoProfile(value, profiles) {
  const hit = Object.values(profiles).find((p) => p.engine === "lemo-canvas" && p.lemo?.style === value);
  if (hit) return hit.id;
  const id = lookup(value, profiles);
  if (profiles[id].engine !== "lemo-canvas") throw new StyleError(`${id} is not a lemo-canvas style; use one of ${Object.values(profiles).filter((p) => p.engine === "lemo-canvas").map((p) => p.lemo.style).join(", ")}`, 2);
  return id;
}

// BRIEF.md `lemo_style:` locks the look the user chose; its lemo-canvas profile id, or null.
function briefLemo(project, profiles) {
  const p = join(project, "BRIEF.md");
  const v = existsSync(p) ? setv(frontmatter(readFileSync(p, "utf8")).lemo_style) : "";
  return v ? lemoProfile(v, profiles) : null;
}

export function init(o, data, up = upstream()) {
  if (!o.topic || !o.aspect) return { code: 2, msg: "init needs --topic and --aspect" };
  if (!SIZE[o.aspect]) return { code: 2, msg: "--aspect must be 16:9, 9:16 or both" };
  const profiles = loadProfiles();
  const project = resolve(o.project);
  let lemoId = null;
  try { lemoId = o.lemo ? lemoProfile(o.lemo, profiles) : briefLemo(project, profiles); } catch (e) { if (e instanceof StyleError) return { code: 2, msg: `${o.lemo ? "--lemo" : "BRIEF lemo_style"}: ${e.message}` }; throw e; }
  const energy = o.energy || "vua";
  if (!data.energy[energy]) return { code: 2, msg: `--energy must be ${Object.keys(data.energy).join(", ")}` };
  let brand = null, brandWarn = "";
  try { brand = findBrand(project, o.brand || ""); } catch (e) { return { code: 2, msg: e.message }; }
  if (brand) {
    const { errors, warnings } = validateBrand(brand.brand, brand.dir, data);
    if (errors.length) return { code: 2, msg: `${brand.path}:\n${errors.map((e) => `ERROR ${e}`).join("\n")}` };
    brandWarn = warnings.map((w) => `\nWARN brand ${w}`).join("");
  }
  const picks = pickDirections({ category: o.category || "", aspect: o.aspect, energy, topic: o.topic, exclude: (brand && brand.brand.banned_directions) || [] }, data);
  if (!up.anim || !up.faceless || !up.creative) return { code: 1, msg: "make-pitch: HyperFrames skills (hyperframes-animation, hyperframes-creative, faceless-explainer) not found; run setup-check.mjs" };
  const briefPath = join(project, "BRIEF.md");
  const briefFm = existsSync(briefPath) ? frontmatter(readFileSync(briefPath, "utf8")) : {};
  const pitch = join(project, "pitch");
  mkdirSync(pitch, { recursive: true });
  // Keep the scaffold hash of styleframes that already exist, so render can still spot an unwritten one.
  let old = [];
  try { old = JSON.parse(readFileSync(join(pitch, "PICK.json"), "utf8")).picks || []; } catch { /* first init */ }
  const used = new Set(lemoId ? [lemoId] : []);
  const rows = [];
  const lemoPick = lemoId ? (picks.find((p) => p.tier === "bold") || picks[picks.length - 1]) : null;
  for (const p of picks) {
    const styleId = p === lemoPick ? lemoId : defaultStyle(p.direction, energy, profiles, used);
    if (styleId) used.add(styleId);
    const name = `${p.n}-${p.direction.slug}`;
    const dir = join(pitch, name);
    const prev = old.find((r) => r.dir === posix(relative(project, dir)));
    let scaffold = prev?.scaffold || "";
    if (!existsSync(join(dir, "index.html"))) {
      const r = hfInit(pitch, name, o.aspect);
      if (r.status !== 0 || !existsSync(join(dir, "index.html"))) return { code: 1, msg: `hyperframes init failed for ${name}` };
      // lemo.mjs add needs the skeleton's markers; the pitch frame is portrait unless 16:9
      if (p === lemoPick) writeFileSync(join(dir, "index.html"), sizeSkeleton(readFileSync(SKELETON, "utf8"), o.aspect === "16:9" ? "16:9" : "9:16"));
      scaffold = sha(join(dir, "index.html"));
    }
    writeFileSync(join(dir, "STYLEFRAME.md"), styleframeMd({ n: p.n, pick: p, topic: o.topic, aspect: o.aspect, energy, data, brand, style: styleId ? profiles[styleId] : null }));
    const sel = resolveSelection(p.direction, {}, data);
    writeFileSync(join(dir, "RECIPES.md"), buildRecipes({ blueprints: sel.blueprints, rules: sel.rules, seams: sel.seams, direction: p.direction, style: sel.style }, data, up));
    rows.push({ n: p.n, id: p.id, tier: p.tier, dir: posix(relative(project, dir)), why: p.why, scaffold, ...(styleId ? { style_profile: styleId } : {}) });
  }
  writeFileSync(join(pitch, "PICK.json"), JSON.stringify({ topic: o.topic, aspect: o.aspect, category: o.category || "", energy, duration_s: Number(o.duration) || Number(briefFm.duration_s) || 15, ...(brand ? { brand: brand.path } : {}), picks: rows }, null, 2) + "\n");
  return { code: 0, msg: `make-pitch: 3 hướng → ${rows.map((r) => `${r.n}. ${r.id}${r.style_profile ? ` + ${r.style_profile}` : ""} (${r.dir})`).join(" · ")}${brandWarn}\nNext: viết index.html 3 giây cho từng thư mục theo STYLEFRAME.md + RECIPES.md, rồi chạy make-pitch.mjs render --project .` };
}

function keywordMenu(data, picks) {
  const tags = new Set(picks.flatMap((p) => p.direction.tags));
  const L = [];
  for (const dim of DIMENSIONS) {
    const list = data.keywords[dim];
    const fit = [...list.filter((k) => !k.clash.some((t) => tags.has(t))), ...list.filter((k) => k.clash.some((t) => tags.has(t)))].slice(0, 4);
    L.push(`- **${DIM_VI[dim]}** (\`${REPLY_KEY[dim]}: <mã>\`): ${fit.map((k) => `\`${k.id}\` ${k.ten_vi} (${k.mo_ta_vi})`).join(" · ")}`);
  }
  return L.join("\n");
}

function render(o, data) {
  const project = resolve(o.project);
  const pitch = join(project, "pitch");
  const pickPath = join(pitch, "PICK.json");
  if (!existsSync(pickPath)) return { code: 2, msg: "pitch/PICK.json not found; run make-pitch.mjs init first" };
  const info = JSON.parse(readFileSync(pickPath, "utf8"));
  for (const r of info.picks) {
    const dir = join(project, r.dir);
    if (!existsSync(join(dir, "index.html"))) return { code: 2, msg: `${r.dir}/index.html not found` };
    if (r.scaffold && sha(join(dir, "index.html")) === r.scaffold) return { code: 2, msg: `${r.dir}/index.html is still the blank hyperframes scaffold (styleframe chưa viết); write it from STYLEFRAME.md + RECIPES.md first` };
  }
  const missing = ["ffmpeg", "ffprobe"].filter((t) => spawnSync(t, ["-version"], { stdio: "ignore" }).status !== 0);
  if (missing.length) return { code: 1, msg: `${missing.join(" and ")} not found; install ffmpeg (brew install ffmpeg) and re-run make-pitch.mjs render` };
  const posters = [], lines = [];
  for (const r of info.picks) {
    const dir = join(project, r.dir);
    const mp4 = join(pitch, `${r.n}.mp4`);
    const x = spawnSync("npx", winArgs(["hyperframes", "render", "--quality", "draft", "-o", mp4]), { cwd: dir, stdio: "inherit", shell: WIN, env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: "1" } });
    if (x.status !== 0 || !existsSync(mp4)) return { code: 1, msg: `render failed for ${r.dir}` };
    const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4], { encoding: "utf8" });
    const dur = Number(String(probe.stdout).trim()) || 3;
    const png = join(pitch, `${r.n}.png`);
    rmSync(png, { force: true });
    spawnSync("ffmpeg", ["-v", "error", "-y", "-ss", String((dur * 0.6).toFixed(2)), "-i", mp4, "-frames:v", "1", png], { stdio: "inherit" });
    if (!existsSync(png)) return { code: 1, msg: `ffmpeg could not cut a poster from pitch/${r.n}.mp4 (${dur}s)` };
    posters.push(png);
    let motion = null;
    try { motion = measureMotion(mp4); } catch { /* reported below as unmeasured */ }
    const v = motionVerdict(motion, { direction: r.id, energy: info.energy });
    lines.push({ ...r, mp4: posix(relative(project, mp4)), png: posix(relative(project, png)), motion: v });
  }
  const sheet = join(pitch, "sheet.jpg");
  const sheetOk = contactSheet(posters, sheet);
  const picks = info.picks.map((r) => ({ ...r, direction: data.directions.find((d) => d.id === r.id) }));
  const md = [`# PITCH — ${info.topic}`, "",
    `Khổ ${info.aspect} · ${info.duration_s} giây. Xem ${sheetOk ? "`pitch/sheet.jpg` (3 khung xếp theo thứ tự 1 · 2 · 3) và " : ""}3 clip 3 giây bên dưới, rồi chọn bằng mắt.`, "",
    "## 3 hướng", "",
    ...lines.flatMap((l) => { const d = data.directions.find((x) => x.id === l.id); return [`### ${l.n}. ${d.ten_vi} (${TIER_VI[l.tier]})`, "", d.mo_ta_vi, "", `- Mở đầu: ${d.hook_vi}`, `- Clip: \`${l.mp4}\` · khung: \`${l.png}\``, `- Đo chuyển động: ${l.motion.level} — ${l.motion.detail}`, ""]; }),
    "## Chỉnh thêm (không bắt buộc)", "",
    `- **Nhịp** (\`nhịp: <mã>\`): ${Object.entries(data.energy).map(([k, v]) => `\`${k}\` ${v.ten_vi}`).join(" · ")}`,
    `- **Tông màu** (\`màu: <mã>\`): ${Object.entries(data.palette).map(([k, v]) => `\`${k}\` ${v.ten_vi}`).join(" · ")}`,
    keywordMenu(data, picks), "",
    "## Cách trả lời", "",
    "- Chỉ cần gõ số: `2`",
    "- Hoặc số kèm điều chỉnh: `2, chuyển cảnh: lao-xuyen-tam, nhịp: em`",
    "- Muốn agent tự chọn: `tự chọn` (ghi là auto trong BRIEF.md)", ""].join("\n");
  writeFileSync(join(pitch, "PITCH.md"), md);
  return renderResult(lines, sheetOk);
}

// PITCH.md and sheet.jpg are written either way; a styleframe that fails MOTION exits 4 so the agent
// rebuilds it instead of showing a slideshow to the user.
export function renderResult(lines, sheetOk) {
  const head = `make-pitch: ${lines.length} clip → pitch/ · ${sheetOk ? "pitch/sheet.jpg · " : ""}pitch/PITCH.md`;
  const bad = lines.filter((l) => l.motion.level === "FAIL").map((b) => b.n);
  if (bad.length) return { code: 4, msg: `${head}\nFAIL  styleframe ${bad.join(", ")} gần như đứng yên (MOTION)\nNext: dựng lại styleframe ${bad.join(", ")} theo RECIPES.md rồi chạy lại make-pitch.mjs render; chưa gửi cho người dùng.` };
  return { code: 0, msg: `${head}\nNext: gửi PITCH.md + sheet.jpg (và 3 clip) cho người dùng, dừng chờ câu trả lời, rồi chạy make-pitch.mjs choose.` };
}

function choose(o, data) {
  const project = resolve(o.project);
  const pickPath = join(project, "pitch", "PICK.json");
  if (!existsSync(pickPath)) return { code: 2, msg: "pitch/PICK.json not found; run make-pitch.mjs init + render first" };
  const info = JSON.parse(readFileSync(pickPath, "utf8"));
  const n = o.auto ? 1 : Number(o.pick);
  const row = info.picks.find((r) => r.n === n);
  if (!row) return { code: 2, msg: "choose needs --pick 1|2|3 (or --auto)" };
  const direction = data.directions.find((d) => d.id === row.id);
  const energy = o.energy || info.energy || direction.energy[0];
  if (!data.energy[energy]) return { code: 2, msg: `--energy must be ${Object.keys(data.energy).join(", ")}` };
  if (o.palette && !data.palette[o.palette]) return { code: 2, msg: `--palette must be ${Object.keys(data.palette).join(", ")}` };
  let brand = null, brandWarn = "";
  try { brand = findBrand(project, o.brand || ""); } catch (e) { return { code: 2, msg: e.message }; }
  if (!o.brand && info.brand) {
    if (existsSync(info.brand)) { try { brand = findBrand(project, info.brand); } catch (e) { return { code: 2, msg: e.message }; } }
    else brandWarn = `\nWARN brand trong PICK.json không còn: ${info.brand}; dùng ${brand ? brand.path : "không brand"}`;
  }
  if (o.palette === "thuong-hieu" && !brand) return { code: 2, msg: "--palette thuong-hieu cần brand.json (chép references/brand.example.json thành shared-assets/brand.json)" };
  const swaps = Object.fromEntries(DIMENSIONS.filter((d) => o[d]).map((d) => [d, o[d]]));
  const profiles = loadProfiles();
  let styleId = row.style_profile && profiles[row.style_profile] ? row.style_profile : defaultStyle(direction, energy, profiles);
  // A lemo_style in BRIEF.md outranks the pick's own style: the chosen direction is drawn in that look.
  try { styleId = briefLemo(project, profiles) || styleId; } catch (e) { if (e instanceof StyleError) return { code: 2, msg: `BRIEF lemo_style: ${e.message}` }; throw e; }
  if (o["style-profile"]) {
    try { styleId = lookup(o["style-profile"], profiles); } catch (e) { if (e instanceof StyleError) return { code: 2, msg: `--style-profile: ${e.message}` }; throw e; }
  }
  const style = styleId ? profiles[styleId] : null;
  const warnings = compatWarnings(direction, swaps, energy, data, o["style-profile"] ? style : null);
  if (warnings.some((w) => w.startsWith("không có từ khoá"))) return { code: 2, msg: warnings.join("\n") };
  if (warnings.length && !o["accept-warnings"]) return { code: 3, msg: `${warnings.map((w) => `WARN  ${w}`).join("\n")}\nchoose: hỏi người dùng một lần; nếu họ vẫn giữ lựa chọn thì chạy lại với --accept-warnings` };
  const sel = resolveSelection(direction, swaps, data);
  const briefPath = join(project, "BRIEF.md");
  let brief = existsSync(briefPath) ? readFileSync(briefPath, "utf8") : "";
  const fm = frontmatter(brief);
  const budget = wordBudget(energy, Number(setv(fm.duration_s)) || info.duration_s, data);
  const aspectWarn = setv(fm.aspect) && fm.aspect !== info.aspect ? `\nWARN aspect BRIEF ${fm.aspect} ≠ pitch ${info.aspect}` : "";
  brief = setFrontmatter(brief, {
    aspect: setv(fm.aspect) || info.aspect,
    duration_s: setv(fm.duration_s) || info.duration_s,
    direction: direction.id,
    direction_swaps: Object.entries(swaps).map(([k, v]) => `${k}=${v}`).join("; ") || "none",
    energy,
    palette: o.palette || setv(fm.palette) || (brand ? "thuong-hieu" : ""),
    brand: brand ? brand.path : null,
    voice_id: brand && brand.brand.voice_id && (!setv(fm.voice_id) || fm.voice_id === DEFAULT_VOICE) ? brand.brand.voice_id : "",
    tts_model: brand && brand.brand.tts_model && (!setv(fm.tts_model) || fm.tts_model === DEFAULT_TTS_MODEL) ? brand.brand.tts_model : "",
    word_budget: budget.words,
    music_only_s: budget.music_only_s,
    creative_selection: o.auto ? "auto" : "user",
    styleframe: `${row.dir}/index.html`,
    style_profile: styleId || "",
    creative_override: null,
  });
  brief = setSection(brief, "creative_direction", [
    `- Hướng: ${direction.id} — ${direction.ten_vi} (${o.auto ? "agent tự chọn theo yêu cầu chạy không dừng" : `người dùng chọn phương án ${n}`})`,
    `- Mô tả: ${direction.mo_ta_vi}`,
    `- Style: ${sel.style.kind} \`${sel.style.name}\``,
    ...(style ? [`- Style profile: ${style.ten_vi} (\`${style.id}\`), giao diện lấy từ \`data/styles/${style.id}.json\`${brand ? "; màu thương hiệu thắng bảng màu của style" : ""}`] : []),
    `- Blueprint: ${sel.blueprints.map((b) => `\`${b}\``).join(", ")} · Rule: ${sel.rules.map((r) => `\`${r}\``).join(", ")}`,
    `- Chuyển cảnh: ${sel.seams.map((s) => `\`${s}\``).join(", ")}${sel.allow_soft ? " (cho phép chuyển cảnh mềm)" : ""}`,
    `- SFX: ${sel.sfx.map((s) => `"${s}"`).join(", ")}`,
    `- Nhịp: ${data.energy[energy].ten_vi} · Ngân sách lời: ≤ ${budget.words} từ, ≥ ${budget.music_only_s}s chỉ có nhạc và hình`,
    `- Luật chống slideshow: ${direction.anti_slideshow_vi}`,
    `- Styleframe làm cảnh mở đầu: \`${row.dir}/index.html\``,
    ...(brand ? [`- Thương hiệu: ${brand.brand.name || "(chưa đặt tên)"} (${brand.path})`] : []),
    ...(warnings.length ? [`- Cảnh báo phối đã được người dùng chấp nhận: ${warnings.join("; ")}`] : []),
  ].join("\n"));
  writeFileSync(briefPath, brief);
  return { code: 0, msg: `make-pitch: BRIEF.md ← direction ${direction.id}${styleId ? `, style_profile ${styleId}` : ""}, energy ${energy}, word_budget ${budget.words}, music_only_s ${budget.music_only_s}${Object.keys(swaps).length ? `, swaps ${Object.entries(swaps).map(([k, v]) => `${k}=${v}`).join(", ")}` : ""}${aspectWarn}${brandWarn}\nNext: bước 2 viết kịch bản viet-pro theo ngân sách lời này (hình dẫn, lời theo).` };
}

function parseArgs(argv) {
  const o = { cmd: argv[0], project: "." };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--auto" || a === "--accept-warnings") o[a.slice(2)] = true;
    else if (/^--[a-z-]+$/.test(a)) { if (argv[i + 1] === undefined) return { bad: `${a} needs a value` }; o[a.slice(2)] = argv[++i]; }
    else return { bad: `unknown argument ${a}` };
  }
  return o;
}

export function main(argv = process.argv.slice(2), log = console.log, err = console.error) {
  if (wantsHelp(argv) || !argv.length) { process.stdout.write(helpText(import.meta.url)); return argv.length ? 0 : 2; }
  const o = parseArgs(argv);
  if (o.bad) { err(`make-pitch: ${o.bad}`); return 2; }
  const data = loadDirections();
  const fn = { init, render, choose }[o.cmd];
  if (!fn) { err(`make-pitch: unknown command ${o.cmd} (init | render | choose)`); return 2; }
  const r = fn(o, data);
  (r.code === 0 ? log : err)(r.code === 2 ? `make-pitch: ${r.msg}` : r.msg);
  return r.code;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
