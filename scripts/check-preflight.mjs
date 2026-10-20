#!/usr/bin/env node
// check-preflight.mjs — gate: a video has a written plan and approved demo frames before the
// final render (SKILL.md steps 4b, 6b and 7). render-final.mjs runs `--stage final` and refuses to
// render on failure.
//   node check-preflight.mjs [--project .] [--stage plan|final] [--json]
//   node check-preflight.mjs --help | -h
// Stage "plan" — PLAN.md in the project with these `##` sections, each non-empty and free of
//   placeholders (headings match without diacritics, so "Canh" = "Cảnh"):
//     Mục tiêu · Cảnh (a markdown table, one row per scene) · Âm thanh · Engine ·
//     Khung hình demo (list lines "- <seconds> — <what to look at>", at least one per scene) · QA
//   BRIEF.md `aspect: both` also needs "Khung hình demo 9:16" (same list format).
// Stage "final" = stage plan plus:
//   - demo/ holds at least as many PNG frames (real PNG signature) as demo timestamps, and
//     demo/9x16/ likewise for 9:16 when required; every frame is newer than PLAN.md.
//   - DEMO.md has `approval: <who/when/what>` that is not empty or "pending". make-demo.mjs
//     resets it to pending whenever it captures new frames.
//   - WARN only: a composition file (index.html, compositions/*.html) newer than the newest
//     demo frame (the demo may not show the current build).
// Creative gate (skill ov-direction, step 1b; data/directions.json), both stages, unless BRIEF.md
//   frontmatter has `creative_override: <reason ≥10 chars>` (printed as a WARN). Quick mode
//   (`creative_override: nhanh theo case <id>`, skill ov-cases) skips the direction checks but
//   keeps the final-stage animatic gate: DEMO.md `animatic:` (and `animatic_9x16:`) present, newer
//   than PLAN.md and the composition, portrait for 9:16, and passing MOTION. Active when BRIEF has
//   `direction:` or `brief_version: 2`; older briefs get one WARN:
//   - BRIEF.md `direction: <A1..A8>` naming a direction in data/directions.json.
//   - PLAN.md "## Ý đồ sáng tạo" with lines for Hướng, Chuyển cảnh and Luật chống slideshow.
//   - "## Cảnh" table has a Blueprint/Rule column and a "Nối sang beat sau" (seam) column.
//     Every row cites ≥1 blueprint or rule that exists in hyperframes-animation; ≥2 distinct
//     tokens overall. Every row but the last names a seam from the vocabulary in
//     data/directions.json: banned seams (fade, crossfade, cut, …) fail; soft seams (focus-pull,
//     blur-crossfade, …) only when the direction has allow_soft.
//   - Rows whose Lời đọc cell is empty / "—" / "(nhạc)" / "không lời" add up to at least
//     BRIEF `music_only_s` seconds (default from the direction's energy, 2s).
//   - final: DEMO.md `animatic: <mp4>` (plus `animatic_9x16:` for aspect both, which must be portrait:
//     reframe.mjs . --ratio 9x16, then make-demo.mjs --animatic --aspect 9x16 --hyperframes
//     ../<project>-9x16; older projects with compositions/main-9x16.html pass --composition) newer than PLAN.md, index.html
//     and compositions/*.html, whose
//     motion passes qc-mp4 MOTION (FAIL when ≥60% near-still frames and 90th-pct YDIF < 1.5), and
//     build/RECIPES.md (recipe-pack.mjs) newer than PLAN.md.
//   - PLAN.md "## Sự kiện": a table Thời điểm | Sự kiện | Âm thanh (seconds on the root timeline,
//     src as in the HTML, "—" for no sound), or a line "không có SFX gắn sự kiện" (WARN only).
//     plan: a missing section, or one with no event row (empty, TODO, header-only table) FAILs;
//     the no-SFX line counts only when the table has no rows. final: a missing section only WARNs (the table asks for a
//     measurement; a delivered project can still re-render), and sfx-sync.mjs measures each event:
//     its FAIL lines (sound outside ITU-R BT.1359-1 −90…+185 ms) block, its WARN lines warn.
//     word-sync.mjs measures each "chữ: <cụm>" row against the spoken word the same way: FAIL
//     (off by more than 250 ms, or never spoken) blocks, WARN warns.
// Style axis (data/styles, styles.mjs), both stages: BRIEF.md `style_profile:` must name a style
//   (id or alias) and resolve with its "## style_layers" against the "## Cảnh" rows (optional Loại
//   column). FAIL in a project that is not legacy (BRIEF has direction: or brief_version: 2), WARN
//   in an older one; the resolver's warnings are WARN lines. No style_profile: is a WARN only when
//   the creative gate is on (no creative_override).
// Mix balance, final stage, every project with index.html: mix-balance.mjs measures how far the
//   music sits under the voice in the audio-mix rebuild (PASS 4–7 dB). Its FAIL blocks; older
//   projects only WARN (mix-balance softens them); a measurement that cannot run is a WARN.
// Readable hold, both stages, every project, WARN only (thresholds not yet calibrated): a "## Cảnh"
//   row whose quoted text ("…", “…”, «…») in the Hình column stays up shorter than
//   max(1s, words / 2.5 + 0.5s) — 2.5 words/s from viet-pro's speech rate, 0.5s eye-landing is
//   an assumption. Quotes in the Lời đọc column do not count. A cell may state `(giữ đến <t>s)` /
//   `(giữ đến hết)`; the hold is then measured to that mark.
// Beat contract, both stages, every project, WARN only (thresholds from 10 s motion films, not yet
//   calibrated): PLAN.md "## Nhịp" with "- Hook: <s>" (≤ 0.5 s), "- Cao trào: cảnh <#>" (that "## Cảnh"
//   row starts within 55–78 % of the runtime) and "- Giữ cuối: <s>" (0.8–1.2 s). A missing section is one WARN.
// REVISIONS.md (references/revisions.md), final stage, every project, WARN only, when the file
//   exists: a round ("## … Vòng …", diacritics optional) with more than 5 "### R<n>" fixes, or a
//   fix missing one of the lines Vị trí: · Lỗi thấy: · Đổi: · Giữ nguyên:. In a creative project whose
//   DEMO.md lists `scene_sheets:` (make-demo.mjs --animatic), also a fix that never names its
//   scene's sheet (sheet-s<#>), e.g. "Vị trí: 6.5s, cảnh 2 (demo/scenes/sheet-s2.jpg)".
// Exit: 0 pass · 1 blocked · 2 bad usage.

import { existsSync, readFileSync, readdirSync, statSync, openSync, readSync, closeSync, realpathSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { frontmatter } from "./check-viet-pro.mjs";
import { loadDirections, classifySeams, tokenExists, upstream, wordBudget } from "./directions.mjs";
import { measureMotion, motionVerdict, QUICK_MODE } from "./qc-mp4.mjs";
import { checkSync, parseEventsBody, isLegacy } from "./sfx-sync.mjs";
import { resolveProject } from "./styles.mjs";
import { checkWords } from "./word-sync.mjs";
import { checkBalance } from "./mix-balance.mjs";

// make-demo needs the 9:16 source named, else hyperframes renders the 16:9 index.html. The default
// source is the edition reframe.mjs derives next to the project; a project that still keeps its own
// compositions/main-9x16.html names that file instead.
export const verticalHint = (dir) => {
  const edition = `../${basename(resolve(dir))}-9x16`;
  return `reframe.mjs . --ratio 9x16, then make-demo.mjs --animatic --aspect 9x16 --hyperframes ${edition} (a project with its own compositions/main-9x16.html: --composition compositions/main-9x16.html instead)`;
};

// Width and height of the first video stream; throws when ffprobe cannot read the file.
export function probeSize(file, run = spawnSync) {
  const r = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { encoding: "utf8" });
  if (r.error) throw new Error(`cannot run ffprobe: ${r.error.message}`);
  const [width, height] = String(r.stdout || "").trim().split(",").map(Number);
  if (r.status !== 0 || !(width > 0 && height > 0)) throw new Error(`ffprobe cannot read the frame size: ${String(r.stderr || "").trim() || "no video stream"}`);
  return { width, height };
}

export const PLACEHOLDER = /^(?:…|\.{3}|todo|tbd|-|n\/a|chưa|pending|<[^>]*>)$/i;
export const SECTIONS = { goal: "muc tieu", scenes: "canh", audio: "am thanh", engine: "engine", demo: "khung hinh demo", qa: "qa" };
export const CREATIVE_SECTION = "y do sang tao";
export const EVENTS_SECTION = "su kien";
export const BEAT_SECTION = "nhip";
const EVENTS_MISSING = 'PLAN.md has no "## Sự kiện" table (Thời điểm | Sự kiện | Âm thanh); write "không có SFX gắn sự kiện" when no sound is tied to a picture event';
// Heading/label folding shared with sfx-sync: strip diacritics, đ → d, lower case, single spaces.
export const fold = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLowerCase().replace(/\s+/g, " ").trim();

// Markdown table → { headers: [folded], rows: [[cell]] } (separator row dropped).
export function parseTable(body) {
  const lines = (body || "").split(/\r?\n/).filter((l) => /^\s*\|/.test(l));
  const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const real = lines.filter((l) => !/^\s*\|[\s|:-]+\|\s*$/.test(l));
  if (!real.length) return { headers: [], rows: [] };
  return { headers: cells(real[0]).map(fold), rows: real.slice(1).map(cells) };
}

// PLAN.md → { sections: { foldedHeading: body }, scenes: n, demo: [seconds], demo916: [seconds] | null }
export function parsePlan(text) {
  const sections = {};
  for (const part of text.split(/^##\s+/m).slice(1)) {
    const [title, ...body] = part.split(/\r?\n/);
    sections[fold(title)] = body.join("\n").trim();
  }
  const rows = (sections[SECTIONS.scenes] || "").split(/\r?\n/).filter((l) => /^\s*\|/.test(l));
  const scenes = Math.max(0, rows.filter((l) => !/^\s*\|[\s|:-]+\|\s*$/.test(l)).length - 1);
  const times = (body) => (body || "").split(/\r?\n/).map((l) => l.match(/^\s*[-*]\s*(\d+(?:[.,]\d+)?)\s*s?\b/)).filter(Boolean).map((m) => Number(m[1].replace(",", ".")));
  const k916 = Object.keys(sections).find((k) => k.startsWith(SECTIONS.demo) && /9\s*[:x]\s*16/.test(k));
  return { sections, scenes, demo: times(sections[SECTIONS.demo]), demo916: k916 ? times(sections[k916]) : null };
}

// Scene id from the "#" cell of "## Cảnh" (row index i when empty): "2" → "s2"; a cell already
// written "s2" (or "S2") stays "s2", never "ss2". One rule for timing.mjs and styles.mjs.
export const sceneId = (cell, i) => {
  const c = String(cell ?? "").trim();
  return c ? `s${c.replace(/^s(?=.)/i, "")}` : `s${i + 1}`;
};
// A folded Lời đọc cell that means no speech in the scene (also read by timing.mjs).
export const MUSIC_ONLY = /^(?:|-|—|–|\(?nhac\)?|\(?chi nhac\)?|khong loi|\(khong loi\)|\(im lang\)|im lang|music only)$/;
// "0–1.5s", "1.5 - 3s", "0.0s - 4.9s" → seconds (0 when unreadable)
export function spanSeconds(cell) {
  const b = spanBounds(cell);
  return b ? Math.max(0, b.end - b.start) : 0;
}
// Same cell → { start, end } in seconds, or null when unreadable.
export function spanBounds(cell) {
  const m = String(cell || "").replace(/,/g, ".").match(/(\d+(?:\.\d+)?)\s*s?\s*[-–—→]\s*(\d+(?:\.\d+)?)/);
  return m ? { start: Number(m[1]), end: Number(m[2]) } : null;
}
const col = (headers, re) => headers.findIndex((h) => re.test(h));

// Readable hold for on-screen text (WARN only, every project: the thresholds are not yet
// calibrated on delivered videos).
// Tốc độ nói của viet-pro (references/publishing/video-script.md: 2,5–3 từ/giây); đọc chữ trên hình lấy mức chậm.
export const READ_WPS = 2.5;
// Giả định: thời gian mắt tìm tới chữ, chưa hiệu chỉnh.
export const EYE_LAND_S = 0.5;
export const MIN_HOLD_S = 1.0;
const QUOTED = /"([^"]+)"|“([^”]+)”|«([^»]+)»/g;

// Seconds a piece of on-screen text with `words` words must stay up.
export function readableHold(words) {
  return Math.max(MIN_HOLD_S, words / READ_WPS + EYE_LAND_S);
}

// Hold mark in the picture cell: "(giữ đến 15s)", "(giữ tới 2,8s)", "(giữ đến hết)" — seconds on the
// root timeline (same convention as "## Sự kiện"). "giữ hình khoảng 1 giây cuối" is not a mark.
const HOLD_MARK = /giu (?:den|toi) (?:(het)|(\d+(?:\.\d+)?))/;

// parseTable output of "## Cảnh" → WARN lines for rows whose quoted text in the picture column
// ("Hình / hiệu ứng") leaves before it can be read. Lời đọc quotes are not on-screen text;
// rows with an unreadable Thời điểm cell are skipped. Without a hold mark the text is assumed to
// leave when the beat ends; a mark later than the beat start measures the hold to that mark.
export function holdWarnings(table) {
  const pic = col(table.headers, /hinh/);
  const tm = col(table.headers, /thoi diem|thoi gian|^t$|time/);
  if (pic < 0 || tm < 0) return [];
  const ends = table.rows.map((r) => spanBounds(r[tm])).filter(Boolean).map((b) => b.end);
  const lastEnd = ends.length ? Math.max(...ends) : 0;
  const out = [];
  table.rows.forEach((r, i) => {
    const len = spanSeconds(r[tm]);
    if (!len) return;
    const cell = String(r[pic] || "");
    const quotes = [...cell.matchAll(QUOTED)].map((m) => (m[1] ?? m[2] ?? m[3]).trim()).filter(Boolean);
    if (!quotes.length) return;
    const counts = quotes.map((q) => q.split(/\s+/).filter(Boolean).length);
    const words = counts.reduce((a, b) => a + b, 0);
    const need = readableHold(words);
    const { start } = spanBounds(r[tm]);
    const mark = fold(cell.replace(/,/g, ".")).match(HOLD_MARK);
    const until = mark ? (mark[1] ? lastEnd : Number(mark[2])) : null;
    const marked = until !== null && until > start;
    const hold = marked ? until - start : len;
    if (hold + 1e-6 >= need) return;
    const longest = quotes[counts.indexOf(Math.max(...counts))];
    const tail = marked ? `giữ tới ${Number(until.toFixed(2))}s, được ${hold.toFixed(1)}s` : `beat dài ${Number(len.toFixed(2))}s`;
    out.push(`PLAN.md "## Cảnh" row ${i + 1}: chữ trên hình "${longest.slice(0, 40)}" (${words} từ) cần giữ ≥ ${need.toFixed(1)}s, ${tail}`);
  });
  return out;
}

// Beat contract (WARN only, thresholds from 10-second motion films, not yet calibrated on 30–90 s videos):
// hook ≤ 0.5 s, hero scene starting within 55–78 % of the runtime, end hold 0.8–1.2 s.
export const HOOK_MAX_S = 0.5;
export const HERO_BAND = [0.55, 0.78];
export const END_HOLD_S = [0.8, 1.2];
const BEAT_MISSING = 'PLAN.md has no "## Nhịp" section (- Hook: <s> · - Cao trào: cảnh <#> · - Giữ cuối: <s>; mẫu ở references/plan-demo.md)';

// "## Nhịp" body → { hook, hero, hold } (null when a line is missing or unreadable).
export function parseBeat(body) {
  const f = fold(String(body || "").replace(/,/g, "."));
  const num = (re) => { const m = f.match(re); return m ? Number(m[1]) : null; };
  return {
    hook: num(/hook\s*:\s*(\d+(?:\.\d+)?)/),
    hero: (() => { const m = f.match(/cao trao\s*:\s*(?:canh\s*)?#?\s*s?(\d+)/); return m ? m[1] : null; })(),
    hold: num(/giu cuoi\s*:\s*(\d+(?:\.\d+)?)/),
  };
}

// plan = parsePlan output → WARN lines for the beat contract.
export function beatWarnings(plan) {
  const body = plan.sections[BEAT_SECTION];
  if (body === undefined) return [BEAT_MISSING];
  const out = [];
  const { hook, hero, hold } = parseBeat(body);
  if (hook === null) out.push('PLAN.md "## Nhịp": thiếu hoặc không đọc được dòng "- Hook: <giây>"');
  else if (hook > HOOK_MAX_S) out.push(`PLAN.md "## Nhịp": hook ${hook}s, nên ≤ ${HOOK_MAX_S}s (chuyển động hoặc chữ đầu tiên)`);
  if (hold === null) out.push('PLAN.md "## Nhịp": thiếu hoặc không đọc được dòng "- Giữ cuối: <giây>"');
  else if (hold < END_HOLD_S[0] || hold > END_HOLD_S[1]) out.push(`PLAN.md "## Nhịp": giữ cuối ${hold}s, nên trong ${END_HOLD_S[0]}–${END_HOLD_S[1]}s`);
  if (hero === null) { out.push('PLAN.md "## Nhịp": thiếu hoặc không đọc được dòng "- Cao trào: cảnh <#>"'); return out; }
  const table = parseTable(plan.sections[SECTIONS.scenes]);
  const tm = col(table.headers, /thoi diem|thoi gian|^t$|time/);
  if (tm < 0) return out;
  const bounds = table.rows.map((r) => spanBounds(r[tm]));
  const ends = bounds.filter(Boolean).map((b) => b.end);
  const total = ends.length ? Math.max(...ends) : 0;
  const idx = table.rows.findIndex((r, i) => sceneId(r[0], i) === `s${hero}`);
  if (idx < 0 || !bounds[idx] || !total) { out.push(`PLAN.md "## Nhịp": cao trào cảnh ${hero} không có trong "## Cảnh" hoặc thiếu Thời điểm`); return out; }
  const at = bounds[idx].start / total;
  if (at < HERO_BAND[0] || at > HERO_BAND[1]) out.push(`PLAN.md "## Nhịp": cao trào cảnh ${hero} bắt đầu ở ${bounds[idx].start}s = ${Math.round(at * 100)}% thời lượng ${total}s, nên trong ${Math.round(HERO_BAND[0] * 100)}–${Math.round(HERO_BAND[1] * 100)}%`);
  return out;
}

export { QUICK_MODE };

// The approved animatic (and the 9:16 one when required) exists, is newer than PLAN.md and the
// composition, is portrait for 9:16, and moves (qc-mp4 MOTION). Records motion into out.
function checkAnimatic({ dir, fm, out, errors, warnings, motion, probe }) {
  const planTime = statSync(join(dir, "PLAN.md")).mtimeMs;
  const demoMd = join(dir, "DEMO.md");
  const demoText = existsSync(demoMd) ? readFileSync(demoMd, "utf8") : "";
  // aspect both renders a second animatic (make-demo --aspect 9x16 → animatic_9x16:); measure each one.
  const keys = ["animatic", ...(String(fm.aspect || "").trim() === "both" || animaticOf(demoText, "animatic_9x16") ? ["animatic_9x16"] : [])];
  for (const key of keys) {
    const anim = animaticOf(demoText, key);
    const animPath = anim ? resolve(dir, anim) : "";
    const rerun = key === "animatic_9x16" ? verticalHint(dir) : "make-demo.mjs --animatic";
    let bad;
    if (!anim) errors.push(`DEMO.md has no \`${key}:\` — run ${rerun} so the user approves motion, not stills`);
    else if (!existsSync(animPath)) errors.push(`DEMO.md animatic ${anim} not found`);
    else if (statSync(animPath).mtimeMs < planTime) errors.push(`animatic ${anim} is older than PLAN.md; re-run ${rerun}`);
    else if (newerThan(dir, statSync(animPath).mtimeMs).length) errors.push(`${newerThan(dir, statSync(animPath).mtimeMs).join(", ")} newer than the animatic ${anim}; the user approved older motion, re-run ${rerun}`);
    else if (key === "animatic_9x16" && (bad = notPortrait(probe, animPath, anim, rerun))) errors.push(bad);
    else {
      let m;
      try { m = motion(animPath); } catch (e) { errors.push(`cannot measure motion of ${anim}: ${e.message}`); }
      if (m !== undefined) {
        const v = motionVerdict(m, fm);
        out[key === "animatic" ? "motion" : "motion_9x16"] = { ...m, level: v.level };
        if (v.level === "FAIL") errors.push(`animatic ${anim}: ${v.detail}`);
        else if (v.level === "WARN") warnings.push(`animatic ${anim}: ${v.detail}`);
      }
    }
  }
}

// Creative gate on PLAN.md + BRIEF.md. Pushes into errors/warnings; returns a summary or null.
export function checkCreative({ dir, plan, brief, stage, errors, warnings, data = loadDirections(), up = upstream(), motion = measureMotion, probe = probeSize, sync = checkSync, words = checkWords }) {
  const fm = frontmatter(brief);
  if (fm.creative_override) {
    const reason = fm.creative_override.trim();
    if (reason.length < 10) { errors.push("BRIEF.md creative_override needs a reason of at least 10 characters"); return null; }
    const quick = reason.match(QUICK_MODE);
    if (!quick) { warnings.push(`creative gate skipped: creative_override "${reason}"`); return null; }
    warnings.push(`creative direction checks skipped: quick mode from case ${quick[1]} (the animatic gate stays)`);
    const out = { quick: quick[1] };
    if (stage === "final") checkAnimatic({ dir, fm, out, errors, warnings, motion, probe });
    return out;
  }
  const id = String(fm.direction || "").trim().toUpperCase().split(/\s/)[0];
  if (!id) {
    if (Number(fm.brief_version) >= 2) errors.push("BRIEF.md has no `direction:` — run step 1b (directions.mjs pick → make-pitch.mjs init/render → make-pitch.mjs choose), or set `creative_override: <lý do ≥10 ký tự>` for a footage-only project");
    else warnings.push("creative gate skipped: BRIEF.md has no direction: and no brief_version: 2 (dự án cũ)");
    return null;
  }
  const direction = data.directions.find((d) => d.id === id);
  if (!direction) { errors.push(`BRIEF.md direction "${id}" is not in data/directions.json`); return null; }
  const out = { direction: id, tokens: [], seams: 0, musicOnly: 0 };

  const creative = plan.sections[CREATIVE_SECTION];
  if (creative === undefined) errors.push('PLAN.md has no "## Ý đồ sáng tạo" section (Hướng · Style · Hình chủ đạo · Hiệu ứng · Chuyển cảnh · SFX · Luật chống slideshow)');
  else {
    const lines = creative.split(/\r?\n/).map(fold);
    for (const [key, label] of [["huong", "Hướng"], ["chuyen canh", "Chuyển cảnh"], ["chong slideshow", "Luật chống slideshow"]]) {
      if (!lines.some((l) => new RegExp(`^[-*]?\\s*[^:]*${key}[^:]*:\\s*\\S`).test(l))) errors.push(`PLAN.md "## Ý đồ sáng tạo" needs a "${label}: …" line`);
    }
  }

  const t = parseTable(plan.sections[SECTIONS.scenes]);
  const bp = col(t.headers, /blueprint|\brule\b/);
  const sm = col(t.headers, /noi sang|seam|chuyen canh/);
  const vo = col(t.headers, /loi doc|^loi\b|voice/);
  const tm = col(t.headers, /thoi diem|thoi gian|^t$|time/);
  if (bp < 0) errors.push('PLAN.md "## Cảnh" needs a "Blueprint/Rule" column (template in references/plan-demo.md)');
  if (sm < 0) errors.push('PLAN.md "## Cảnh" needs a "Nối sang beat sau" column naming the seam into the next beat');
  if (bp >= 0) {
    const all = new Set();
    t.rows.forEach((r, i) => {
      const words = [...new Set((r[bp] || "").replace(/`/g, " ").match(/[a-z0-9]+(?:-[a-z0-9]+)+/g) || [])];
      const real = words.filter((w) => tokenExists({ kind: "blueprint", name: w }, data, up) || tokenExists({ kind: "rule", name: w }, data, up));
      const fake = words.filter((w) => !real.includes(w));
      for (const w of fake) errors.push(`PLAN.md "## Cảnh" row ${i + 1}: "${w}" is not a blueprint or rule in hyperframes-animation`);
      if (!words.length) errors.push(`PLAN.md "## Cảnh" row ${i + 1} cites no blueprint/rule (each beat names how it is built)`);
      real.forEach((w) => all.add(w));
    });
    out.tokens = [...all];
    if (t.rows.length && all.size < 2) errors.push(`PLAN.md "## Cảnh" cites ${all.size} distinct blueprint/rule token(s); need at least 2`);
  }
  if (sm >= 0) {
    t.rows.slice(0, -1).forEach((r, i) => {
      const seams = classifySeams(r[sm], data);
      const banned = seams.filter((s) => s.class === "banned");
      const ok = seams.filter((s) => s.class === "continuous" || (s.class === "soft" && direction.allow_soft));
      const soft = seams.filter((s) => s.class === "soft" && !direction.allow_soft);
      if (banned.length) errors.push(`PLAN.md "## Cảnh" row ${i + 1}: seam "${banned.map((s) => s.token).join(", ")}" is a slide swap (banned); use a seam from references/creative-directions.md`);
      else if (soft.length && !ok.length) errors.push(`PLAN.md "## Cảnh" row ${i + 1}: soft seam "${soft.map((s) => s.token).join(", ")}" is only allowed for directions with allow_soft (${id} has none)`);
      else if (!ok.length) errors.push(`PLAN.md "## Cảnh" row ${i + 1}: no known seam in "${r[sm] || ""}" (e.g. ${direction.seams.join(", ")})`);
      else out.seams++;
    });
  }
  if (vo >= 0 && tm >= 0) {
    out.musicOnly = t.rows.filter((r) => MUSIC_ONLY.test(fold(r[vo] || ""))).reduce((s, r) => s + spanSeconds(r[tm]), 0);
    const need = Number(fm.music_only_s) || wordBudget(fm.energy || direction.energy[0], fm.duration_s, data).music_only_s;
    if (out.musicOnly + 1e-6 < need) errors.push(`PLAN.md "## Cảnh" has ${out.musicOnly.toFixed(1)}s without voice; need ≥ ${need}s of music-and-picture beats (Lời đọc "—" or "(nhạc)")`);
  } else if (t.rows.length) errors.push('PLAN.md "## Cảnh" needs "Thời điểm" and "Lời đọc" columns to measure the music-only beats');

  if (stage !== "final") {
    const events = plan.sections[EVENTS_SECTION];
    if (events === undefined) errors.push(EVENTS_MISSING);
    else {
      const ev = parseEventsBody(events);
      if (ev.error) errors.push(ev.error);
      else if (ev.none) warnings.push('PLAN.md "## Sự kiện": không có SFX gắn sự kiện (sfx-sync has nothing to measure)');
    }
  }

  if (stage === "final") {
    const planTime = statSync(join(dir, "PLAN.md")).mtimeMs;
    checkAnimatic({ dir, fm, out, errors, warnings, motion, probe });
    let s;
    try { s = sync({ dir }); } catch (e) { errors.push(`sfx-sync: ${e.message}`); }
    if (s) {
      if (s.missing) warnings.push(EVENTS_MISSING);
      else { errors.push(...s.errors); warnings.push(...s.warnings); }
    }
    let w;
    try { w = words({ dir }); } catch (e) { errors.push(`word-sync: ${e.message}`); }
    if (w) { errors.push(...w.errors); warnings.push(...w.warnings); }
    const recipes = join(dir, "build", "RECIPES.md");
    if (!existsSync(recipes)) errors.push("build/RECIPES.md not found — run recipe-pack.mjs --project . and build from it (step 6)");
    else if (statSync(recipes).mtimeMs < planTime) errors.push("build/RECIPES.md is older than PLAN.md; re-run recipe-pack.mjs");
  }
  return out;
}

// Style gate on BRIEF.md style_profile + "## style_layers". Pushes into errors/warnings; returns
// { base, layers } or null.
export function checkStyle({ dir, brief, errors, warnings, resolveFn = resolveProject }) {
  const fm = frontmatter(brief);
  const id = String(fm.style_profile || "").trim();
  if (!id || PLACEHOLDER.test(id)) {
    if (!isLegacy(fm) && !fm.creative_override) warnings.push("BRIEF.md has no style_profile: (make-pitch.mjs choose writes it; ids in data/styles/index.json) — the look falls back to the direction's style keyword");
    return null;
  }
  try {
    const r = resolveFn(dir);
    for (const w of r.warnings) warnings.push(`style_profile ${r.base}: ${w}`);
    return { base: r.base, layers: r.layers.length };
  } catch (e) {
    (isLegacy(fm) ? warnings : errors).push(`style_profile "${id}": ${e.message}`);
    return null;
  }
}

// A 9:16 animatic rendered without the vertical composition is landscape; the user would approve the
// 16:9 motion as the vertical cut. Returns the error, or "" when height > width.
function notPortrait(probe, path, anim, hint) {
  let s;
  try { s = probe(path); } catch (e) { return `cannot read the frame size of ${anim}: ${e.message}`; }
  return s.height > s.width ? "" : `animatic ${anim} is ${s.width}×${s.height}, not portrait; re-run ${hint}`;
}

// index.html and compositions/*.html edited after `time` (the build the user has not seen).
function newerThan(dir, time) {
  const comp = join(dir, "compositions");
  const files = ["index.html", ...(existsSync(comp) ? readdirSync(comp).filter((f) => f.endsWith(".html")).map((f) => `compositions/${f}`) : [])];
  return files.filter((f) => existsSync(join(dir, f)) && statSync(join(dir, f)).mtimeMs > time);
}

export function animaticOf(text, key = "animatic") {
  const m = text.match(new RegExp(`^\\s*[-*]?\\s*${key}:\\s*(\\S.*)$`, "im"));
  return m ? m[1].trim() : "";
}

export function isPng(file) {
  try {
    const fd = openSync(file, "r");
    const b = Buffer.alloc(8);
    readSync(fd, b, 0, 8, 0);
    closeSync(fd);
    return b.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  } catch { return false; }
}

const pngs = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".png")).map((f) => join(dir, f)) : []);

export function approvalOf(text) {
  const m = text.match(/^\s*[-*]?\s*approval:\s*(.*)$/im);
  return m ? m[1].trim() : "";
}

// REVISIONS.md fields every "### R<n>" fix must carry (references/revisions.md).
const REVISION_FIELDS = ["Vị trí", "Lỗi thấy", "Đổi", "Giữ nguyên"];
const MAX_FIXES_PER_ROUND = 5;

// WARN sentences for a REVISIONS.md text: rounds ("## …Vòng…") over five fixes, fixes missing a field
// and, with `sheets` (DEMO.md lists per-scene contact sheets), fixes that never name a sheet-s<#>.
export function checkRevisions(text, { sheets = false } = {}) {
  const warnings = [];
  const rounds = [];
  let round = null, fix = null;
  const closeFix = () => {
    if (!fix) return;
    for (const f of REVISION_FIELDS) if (!fix.fields.has(fold(f))) warnings.push(`REVISIONS.md ${fix.name}: thiếu ${f}`);
    if (sheets && !fix.sheet) warnings.push(`REVISIONS.md ${fix.name}: Vị trí chưa trỏ sheet của cảnh (vd. cảnh 3 (demo/scenes/sheet-s3.jpg))`);
    fix = null;
  };
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      closeFix();
      round = fold(h2[1]).includes("vong") ? { name: h2[1].trim(), fixes: 0 } : null;
      if (round) rounds.push(round);
      continue;
    }
    const h3 = line.match(/^###\s+(R\d+)\b/i);
    if (h3) {
      closeFix();
      fix = { name: h3[1], fields: new Set(), sheet: false };
      if (round) round.fixes++;
      continue;
    }
    if (/^#{1,3}\s/.test(line)) { closeFix(); continue; }
    if (!fix) continue;
    if (/sheet-s/i.test(line)) fix.sheet = true;
    const label = fold(line.replace(/^[-*]\s*/, "").replace(/\*\*/g, "")).match(/^([^:]+?)\s*:/);
    if (label) fix.fields.add(label[1]);
  }
  closeFix();
  for (const r of rounds) {
    if (r.fixes > MAX_FIXES_PER_ROUND) warnings.push(`REVISIONS.md ${r.name}: ${r.fixes} mục, tối đa ${MAX_FIXES_PER_ROUND} mỗi vòng (references/revisions.md)`);
  }
  return warnings;
}

export function check({ project = ".", stage = "plan", sync = checkSync, words = checkWords, balance = checkBalance } = {}) {
  const dir = resolve(project);
  const errors = [], warnings = [];
  const out = { project: dir, stage, pass: false, errors, warnings, plan: null, demo: null };
  const planPath = join(dir, "PLAN.md");
  if (!existsSync(planPath)) {
    errors.push("PLAN.md not found (write it after STORYBOARD.md; template in references/plan-demo.md)");
    return out;
  }
  const plan = parsePlan(readFileSync(planPath, "utf8"));
  out.plan = { scenes: plan.scenes, demo: plan.demo, demo916: plan.demo916 };
  for (const [key, head] of Object.entries(SECTIONS)) {
    const body = plan.sections[head];
    if (body === undefined) errors.push(`PLAN.md has no "## ${head}" section`);
    else if (!body || body.split(/\r?\n/).every((l) => PLACEHOLDER.test(l.replace(/^\s*[-*|]\s*/, "").trim()) || !l.trim())) errors.push(`PLAN.md "## ${head}" is empty or a placeholder`);
    else if (key === "scenes" && plan.scenes < 1) errors.push('PLAN.md "## Cảnh" needs a table with one row per scene');
  }
  if (plan.scenes > 0 && plan.demo.length < plan.scenes) errors.push(`PLAN.md "## Khung hình demo" lists ${plan.demo.length} timestamps for ${plan.scenes} scenes (need at least one per scene)`);
  const brief = existsSync(join(dir, "BRIEF.md")) ? readFileSync(join(dir, "BRIEF.md"), "utf8") : "";
  const both = /^both$/i.test((frontmatter(brief).aspect || "").trim());
  if (both && !(plan.demo916 && plan.demo916.length)) errors.push('BRIEF.md aspect: both — PLAN.md needs "## Khung hình demo 9:16" with timestamps');
  out.creative = checkCreative({ dir, plan, brief, stage, errors, warnings, sync, words });
  out.style = checkStyle({ dir, brief, errors, warnings });
  warnings.push(...holdWarnings(parseTable(plan.sections[SECTIONS.scenes])));
  warnings.push(...beatWarnings(plan));

  if (stage === "final") {
    const planTime = statSync(planPath).mtimeMs;
    const sets = [{ dir: join(dir, "demo"), label: "demo/", need: plan.demo.length }];
    if (both) sets.push({ dir: join(dir, "demo", "9x16"), label: "demo/9x16/", need: (plan.demo916 || []).length });
    let newest = 0;
    out.demo = {};
    for (const s of sets) {
      const files = pngs(s.dir);
      const valid = files.filter(isPng);
      out.demo[s.label] = valid.length;
      if (valid.length < Math.max(1, s.need)) errors.push(`${s.label} has ${valid.length} PNG frames, PLAN.md asks for ${s.need} (run make-demo.mjs)`);
      if (files.length > valid.length) errors.push(`${s.label} has ${files.length - valid.length} file(s) named .png that are not PNG images`);
      const stale = valid.filter((f) => statSync(f).mtimeMs < planTime);
      if (stale.length) errors.push(`${s.label} has ${stale.length} frame(s) older than PLAN.md — the plan changed after the demo; re-run make-demo.mjs`);
      for (const f of valid) newest = Math.max(newest, statSync(f).mtimeMs);
    }
    const demoMd = join(dir, "DEMO.md");
    if (!existsSync(demoMd)) errors.push("DEMO.md not found (make-demo.mjs writes it)");
    else {
      const a = approvalOf(readFileSync(demoMd, "utf8"));
      if (!a || PLACEHOLDER.test(a) || a.length < 6) errors.push('DEMO.md approval is missing or pending: show the demo frames to the user, then record "approval: <who, when, what was approved>"');
    }
    const comps = ["index.html", ...(existsSync(join(dir, "compositions")) ? readdirSync(join(dir, "compositions")).filter((f) => f.endsWith(".html")).map((f) => join("compositions", f)) : [])]
      .map((f) => join(dir, f)).filter(existsSync);
    const changed = comps.filter((f) => statSync(f).mtimeMs > newest);
    if (newest && changed.length) warnings.push(`composition changed after the demo (${changed.map((f) => f.slice(dir.length + 1)).join(", ")}); re-run make-demo.mjs if the look changed`);
    const revisions = join(dir, "REVISIONS.md");
    if (existsSync(revisions)) {
      const sheets = Boolean(out.creative) && existsSync(demoMd) && /^\s*[-*]?\s*scene_sheets(?:_9x16)?:\s*\S/im.test(readFileSync(demoMd, "utf8"));
      warnings.push(...checkRevisions(readFileSync(revisions, "utf8"), { sheets }));
    }
    if (existsSync(join(dir, "index.html"))) {
      try {
        const b = balance({ dir });
        out.balance = b;
        const text = b.line.replace(/^\S+\s+/, "");
        if (b.level === "FAIL") errors.push(text);
        else if (b.level === "WARN") warnings.push(text);
      } catch (e) { warnings.push(`mix-balance: không đo được (${e.message})`); }
    }
  }
  out.pass = errors.length === 0;
  return out;
}

function parseArgs(argv) {
  const o = { project: ".", stage: "plan" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.json = true;
    else if (["--project", "--stage"].includes(a)) o[a.slice(2)] = argv[++i];
    else return { bad: `unknown argument ${a}` };
  }
  if (!["plan", "final"].includes(o.stage)) return { bad: "--stage must be plan or final" };
  return o;
}

export function report(r, log = console.log) {
  for (const w of r.warnings) log(`WARN  ${w}`);
  for (const e of r.errors) log(`FAIL  ${e}`);
  log(r.pass ? `PASS  preflight (${r.stage})` : `BLOCKED  preflight (${r.stage}): fix the FAIL lines before ${r.stage === "plan" ? "building" : "the final render"}`);
}

export function main(argv = process.argv.slice(2)) {
  if (wantsHelp(argv)) { process.stdout.write(helpText(import.meta.url)); return 0; }
  const o = parseArgs(argv);
  if (o.bad) { console.error(`check-preflight: ${o.bad}\nusage: node check-preflight.mjs [--project .] [--stage plan|final] [--json]`); return 2; }
  const r = check(o);
  if (o.json) console.log(JSON.stringify(r, null, 2));
  else report(r);
  return r.pass ? 0 : 1;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
