#!/usr/bin/env node
// make-pitch.mjs — creative pitch (SKILL.md step 1b): 3 directions, 3 styleframes built from the
// user's own topic, the user picks by eye, the choice is written into BRIEF.md. Works the same on
// every agent: the menu is plain text in PITCH.md plus file paths (no runtime-specific picker).
//   node make-pitch.mjs init   --project . --topic "<chủ đề>" --aspect <16:9|9:16|both>
//                              [--category <motion|explainer|3d|interactive|product|story-music>]
//                              [--energy em|vua|don-dap] [--duration 15]
//   node make-pitch.mjs render --project .
//   node make-pitch.mjs choose --project . (--pick <1|2|3> | --auto) [--style id] [--visual id]
//                              [--effect id] [--transition id] [--sfx id] [--energy e]
//                              [--palette toi|sang|thuong-hieu] [--accept-warnings]
//   node make-pitch.mjs --help | -h
// init: directions.mjs pick → pitch/PICK.json; for each pick a HyperFrames project
//   pitch/<n>-<slug>/ (`hyperframes init --example blank`, portrait for 9:16/both, landscape for
//   16:9) holding STYLEFRAME.md (what to build in ~3 s) and RECIPES.md (recipe-pack for that
//   direction). The agent then writes each index.html from STYLEFRAME.md + RECIPES.md.
// render: renders every pitch/<n>-*/index.html at --quality draft to pitch/<n>.mp4, cuts a poster
//   pitch/<n>.png at 60% of the clip, tiles pitch/sheet.jpg, measures motion (qc-mp4 MOTION) and
//   writes PITCH.md: the 3 options with paths, the two knobs, 3–4 swappable keywords per group
//   and the reply syntax. Show PITCH.md + sheet.jpg (+ the MP4s) to the user and wait.
// choose: compat check (directions.mjs); warnings → exit 3 so the agent asks the user once, then
//   re-run with --accept-warnings if they keep it. Writes BRIEF.md frontmatter: direction,
//   direction_swaps, energy, palette, word_budget, music_only_s, creative_selection (user|auto),
//   styleframe; and a "## creative_direction" body section. --auto = option 1, recorded as auto
//   (only when the user asked to run without stopping).
// Exit: 0 ok · 1 render/init failed · 2 bad usage · 3 compat warnings to confirm.

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { frontmatter } from "./check-viet-pro.mjs";
import { loadDirections, pickDirections, compatWarnings, resolveSelection, wordBudget, upstream, DIMENSIONS, DIM_VI, TIER_VI } from "./directions.mjs";
import { buildRecipes } from "./recipe-pack.mjs";
import { contactSheet } from "./make-demo.mjs";
import { measureMotion, motionVerdict } from "./qc-mp4.mjs";

const WIN = process.platform === "win32";
const posix = (p) => p.split("\\").join("/");
// Reply keys the user types in PITCH.md → choose flags (--style, --visual, …).
export const REPLY_KEY = { style: "phong cách", visual: "hình", effect: "hiệu ứng", transition: "chuyển cảnh", sfx: "âm thanh" };
const SIZE = { "9:16": [1080, 1920], "16:9": [1920, 1080], both: [1080, 1920] };

// Set frontmatter keys in a markdown text (adds the block when missing). Values are single-line.
export function setFrontmatter(text, values) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  let lines = m ? m[1].split(/\r?\n/) : [];
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || v === null || v === "") continue;
    const line = `${k}: ${String(v).replace(/\r?\n/g, " ")}`;
    const i = lines.findIndex((l) => new RegExp(`^${k}:`).test(l));
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

export function styleframeMd({ n, pick, topic, aspect, energy, data }) {
  const d = pick.direction;
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

## Bắt buộc
1. Đọc hết \`RECIPES.md\` cùng thư mục trước khi viết \`index.html\`; dựng bằng đúng các cơ chế trong đó.
2. Dùng chữ thật của chủ đề (tên sản phẩm, con số, câu hook ngắn), không lorem ipsum, không bịa số liệu.
3. Font có đủ dấu tiếng Việt (Be Vietnam Pro hoặc font preset đã kiểm dấu).
4. Không đặt chữ/khung trang trí ở 4 góc (dấu hiệu video AI); ${aspect === "16:9" ? "giữ chủ thể trong vùng an toàn 90%" : "9:16: không đặt chữ ở 12% trên và 20% dưới (vùng UI TikTok)"}.
5. Chuyển động liên tục suốt 3 giây, không có đoạn đứng yên quá 0,5 giây; không thẻ trượt lên rồi mờ dần.
6. Không cần âm thanh. Đây là bản mẫu để người dùng chọn bằng mắt; bản được chọn sẽ thành cảnh mở đầu của video thật.
`;
}

function hfInit(cwd, name, aspect) {
  return spawnSync("npx", ["hyperframes", "init", name, "--example", "blank", "--resolution", aspect === "16:9" ? "landscape" : "portrait", "--non-interactive"],
    { cwd, stdio: "inherit", shell: WIN, env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: "1" } });
}

function init(o, data) {
  if (!o.topic || !o.aspect) return { code: 2, msg: "init needs --topic and --aspect" };
  if (!SIZE[o.aspect]) return { code: 2, msg: "--aspect must be 16:9, 9:16 or both" };
  const project = resolve(o.project);
  const energy = o.energy || "vua";
  if (!data.energy[energy]) return { code: 2, msg: `--energy must be ${Object.keys(data.energy).join(", ")}` };
  const picks = pickDirections({ category: o.category || "", aspect: o.aspect, energy, topic: o.topic }, data);
  const pitch = join(project, "pitch");
  mkdirSync(pitch, { recursive: true });
  const up = upstream();
  const rows = [];
  for (const p of picks) {
    const name = `${p.n}-${p.direction.slug}`;
    const dir = join(pitch, name);
    if (!existsSync(join(dir, "index.html"))) {
      const r = hfInit(pitch, name, o.aspect);
      if (r.status !== 0 || !existsSync(dir)) return { code: 1, msg: `hyperframes init failed for ${name}` };
    }
    writeFileSync(join(dir, "STYLEFRAME.md"), styleframeMd({ n: p.n, pick: p, topic: o.topic, aspect: o.aspect, energy, data }));
    const sel = resolveSelection(p.direction, {}, data);
    writeFileSync(join(dir, "RECIPES.md"), buildRecipes({ blueprints: sel.blueprints, rules: sel.rules, seams: sel.seams, direction: p.direction, style: sel.style }, data, up));
    rows.push({ n: p.n, id: p.id, tier: p.tier, dir: posix(relative(project, dir)), why: p.why });
  }
  writeFileSync(join(pitch, "PICK.json"), JSON.stringify({ topic: o.topic, aspect: o.aspect, category: o.category || "", energy, duration_s: Number(o.duration) || 15, picks: rows }, null, 2) + "\n");
  return { code: 0, msg: `make-pitch: 3 hướng → ${rows.map((r) => `${r.n}. ${r.id} (${r.dir})`).join(" · ")}\nNext: viết index.html 3 giây cho từng thư mục theo STYLEFRAME.md + RECIPES.md, rồi chạy make-pitch.mjs render --project .` };
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
  const posters = [], lines = [];
  for (const r of info.picks) {
    const dir = join(project, r.dir);
    if (!existsSync(join(dir, "index.html"))) return { code: 2, msg: `${r.dir}/index.html not found` };
    const mp4 = join(pitch, `${r.n}.mp4`);
    const x = spawnSync("npx", ["hyperframes", "render", "--quality", "draft", "-o", mp4], { cwd: dir, stdio: "inherit", shell: WIN, env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: "1" } });
    if (x.status !== 0 || !existsSync(mp4)) return { code: 1, msg: `render failed for ${r.dir}` };
    const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4], { encoding: "utf8" });
    const dur = Number(String(probe.stdout).trim()) || 3;
    const png = join(pitch, `${r.n}.png`);
    spawnSync("ffmpeg", ["-v", "error", "-y", "-ss", String((dur * 0.6).toFixed(2)), "-i", mp4, "-frames:v", "1", png], { stdio: "inherit" });
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
  const bad = lines.filter((l) => l.motion.level === "FAIL");
  return { code: 0, msg: `make-pitch: ${lines.length} clip → pitch/ · ${sheetOk ? "pitch/sheet.jpg · " : ""}pitch/PITCH.md${bad.length ? `\nWARN  styleframe ${bad.map((b) => b.n).join(", ")} gần như đứng yên; dựng lại trước khi cho người dùng xem` : ""}\nNext: gửi PITCH.md + sheet.jpg (và 3 clip) cho người dùng, dừng chờ câu trả lời, rồi chạy make-pitch.mjs choose.` };
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
  const swaps = Object.fromEntries(DIMENSIONS.filter((d) => o[d]).map((d) => [d, o[d]]));
  const warnings = compatWarnings(direction, swaps, energy, data);
  if (warnings.some((w) => w.startsWith("không có từ khoá"))) return { code: 2, msg: warnings.join("\n") };
  if (warnings.length && !o["accept-warnings"]) return { code: 3, msg: `${warnings.map((w) => `WARN  ${w}`).join("\n")}\nchoose: hỏi người dùng một lần; nếu họ vẫn giữ lựa chọn thì chạy lại với --accept-warnings` };
  const sel = resolveSelection(direction, swaps, data);
  const budget = wordBudget(energy, info.duration_s, data);
  const briefPath = join(project, "BRIEF.md");
  let brief = existsSync(briefPath) ? readFileSync(briefPath, "utf8") : "";
  const fm = frontmatter(brief);
  brief = setFrontmatter(brief, {
    aspect: fm.aspect || info.aspect,
    duration_s: fm.duration_s || info.duration_s,
    direction: direction.id,
    direction_swaps: Object.entries(swaps).map(([k, v]) => `${k}=${v}`).join("; ") || "none",
    energy,
    palette: o.palette || fm.palette || "",
    word_budget: budget.words,
    music_only_s: budget.music_only_s,
    creative_selection: o.auto ? "auto" : "user",
    styleframe: `${row.dir}/index.html`,
  });
  brief = setSection(brief, "creative_direction", [
    `- Hướng: ${direction.id} — ${direction.ten_vi} (${o.auto ? "agent tự chọn theo yêu cầu chạy không dừng" : `người dùng chọn phương án ${n}`})`,
    `- Mô tả: ${direction.mo_ta_vi}`,
    `- Style: ${sel.style.kind} \`${sel.style.name}\``,
    `- Blueprint: ${sel.blueprints.map((b) => `\`${b}\``).join(", ")} · Rule: ${sel.rules.map((r) => `\`${r}\``).join(", ")}`,
    `- Chuyển cảnh: ${sel.seams.map((s) => `\`${s}\``).join(", ")}${sel.allow_soft ? " (cho phép chuyển cảnh mềm)" : ""}`,
    `- SFX: ${sel.sfx.map((s) => `"${s}"`).join(", ")}`,
    `- Nhịp: ${data.energy[energy].ten_vi} · Ngân sách lời: ≤ ${budget.words} từ, ≥ ${budget.music_only_s}s chỉ có nhạc và hình`,
    `- Luật chống slideshow: ${direction.anti_slideshow_vi}`,
    `- Styleframe làm cảnh mở đầu: \`${row.dir}/index.html\``,
    ...(warnings.length ? [`- Cảnh báo phối đã được người dùng chấp nhận: ${warnings.join("; ")}`] : []),
  ].join("\n"));
  writeFileSync(briefPath, brief);
  return { code: 0, msg: `make-pitch: BRIEF.md ← direction ${direction.id}, energy ${energy}, word_budget ${budget.words}, music_only_s ${budget.music_only_s}${Object.keys(swaps).length ? `, swaps ${Object.entries(swaps).map(([k, v]) => `${k}=${v}`).join(", ")}` : ""}\nNext: bước 2 viết kịch bản viet-pro theo ngân sách lời này (hình dẫn, lời theo).` };
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
