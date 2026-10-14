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
// Creative gate (SKILL.md step 1b; data/directions.json), both stages, unless BRIEF.md frontmatter
//   has `creative_override: <reason ≥10 chars>` (printed as a WARN). Active when BRIEF has
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
//     make-demo.mjs --animatic --aspect 9x16 --composition compositions/main-9x16.html, or
//     --hyperframes ../<project-9x16>) newer than PLAN.md, index.html
//     and compositions/*.html, whose
//     motion passes qc-mp4 MOTION (FAIL when ≥60% near-still frames and 90th-pct YDIF < 1.5), and
//     build/RECIPES.md (recipe-pack.mjs) newer than PLAN.md.
//   - PLAN.md "## Sự kiện": a table Thời điểm | Sự kiện | Âm thanh (seconds on the root timeline,
//     src as in the HTML, "—" for no sound), or a line "không có SFX gắn sự kiện" (WARN only).
//     plan: a missing section FAILs. final: a missing section only WARNs (the table asks for a
//     measurement; a delivered project can still re-render), and sfx-sync.mjs measures each event:
//     its FAIL lines (sound outside ITU-R BT.1359-1 −90…+185 ms) block, its WARN lines warn.
// Exit: 0 pass · 1 blocked · 2 bad usage.

import { existsSync, readFileSync, readdirSync, statSync, openSync, readSync, closeSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { frontmatter } from "./check-viet-pro.mjs";
import { loadDirections, classifySeams, tokenExists, upstream, wordBudget } from "./directions.mjs";
import { measureMotion, motionVerdict } from "./qc-mp4.mjs";
import { checkSync } from "./sfx-sync.mjs";

// make-demo needs the 9:16 composition named, else hyperframes renders the 16:9 index.html.
const VERTICAL_HINT = "make-demo.mjs --animatic --aspect 9x16 --composition compositions/main-9x16.html (or --hyperframes ../<project-9x16> for a separate 9:16 project)";

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
const EVENTS_MISSING = 'PLAN.md has no "## Sự kiện" table (Thời điểm | Sự kiện | Âm thanh); write "không có SFX gắn sự kiện" when no sound is tied to a picture event';
const fold = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLowerCase().replace(/\s+/g, " ").trim();

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

const MUSIC_ONLY = /^(?:|-|—|–|\(?nhac\)?|\(?chi nhac\)?|khong loi|\(khong loi\)|\(im lang\)|im lang|music only)$/;
// "0–1.5s", "1.5 - 3s", "0.0s - 4.9s" → seconds (0 when unreadable)
export function spanSeconds(cell) {
  const m = String(cell || "").replace(/,/g, ".").match(/(\d+(?:\.\d+)?)\s*s?\s*[-–—→]\s*(\d+(?:\.\d+)?)/);
  return m ? Math.max(0, Number(m[2]) - Number(m[1])) : 0;
}
const col = (headers, re) => headers.findIndex((h) => re.test(h));

// Creative gate on PLAN.md + BRIEF.md. Pushes into errors/warnings; returns a summary or null.
export function checkCreative({ dir, plan, brief, stage, errors, warnings, data = loadDirections(), up = upstream(), motion = measureMotion, probe = probeSize, sync = checkSync }) {
  const fm = frontmatter(brief);
  if (fm.creative_override) {
    if (fm.creative_override.trim().length < 10) errors.push("BRIEF.md creative_override needs a reason of at least 10 characters");
    else warnings.push(`creative gate skipped: creative_override "${fm.creative_override.trim()}"`);
    return null;
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
    else if (fold(events).includes("khong co sfx gan su kien")) warnings.push('PLAN.md "## Sự kiện": không có SFX gắn sự kiện (sfx-sync has nothing to measure)');
  }

  if (stage === "final") {
    const planTime = statSync(join(dir, "PLAN.md")).mtimeMs;
    const demoMd = join(dir, "DEMO.md");
    const demoText = existsSync(demoMd) ? readFileSync(demoMd, "utf8") : "";
    // aspect both renders a second animatic (make-demo --aspect 9x16 → animatic_9x16:); measure each one.
    const keys = ["animatic", ...(String(fm.aspect || "").trim() === "both" || animaticOf(demoText, "animatic_9x16") ? ["animatic_9x16"] : [])];
    for (const key of keys) {
      const anim = animaticOf(demoText, key);
      const animPath = anim ? resolve(dir, anim) : "";
      const rerun = key === "animatic_9x16" ? VERTICAL_HINT : "make-demo.mjs --animatic";
      let bad;
      if (!anim) errors.push(`DEMO.md has no \`${key}:\` — run ${rerun} so the user approves motion, not stills`);
      else if (!existsSync(animPath)) errors.push(`DEMO.md animatic ${anim} not found`);
      else if (statSync(animPath).mtimeMs < planTime) errors.push(`animatic ${anim} is older than PLAN.md; re-run ${rerun}`);
      else if (newerThan(dir, statSync(animPath).mtimeMs).length) errors.push(`${newerThan(dir, statSync(animPath).mtimeMs).join(", ")} newer than the animatic ${anim}; the user approved older motion, re-run ${rerun}`);
      else if (key === "animatic_9x16" && (bad = notPortrait(probe, animPath, anim))) errors.push(bad);
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
    let s;
    try { s = sync({ dir }); } catch (e) { errors.push(`sfx-sync: ${e.message}`); }
    if (s) {
      if (s.missing) warnings.push(EVENTS_MISSING);
      else { errors.push(...s.errors); warnings.push(...s.warnings); }
    }
    const recipes = join(dir, "build", "RECIPES.md");
    if (!existsSync(recipes)) errors.push("build/RECIPES.md not found — run recipe-pack.mjs --project . and build from it (step 6)");
    else if (statSync(recipes).mtimeMs < planTime) errors.push("build/RECIPES.md is older than PLAN.md; re-run recipe-pack.mjs");
  }
  return out;
}

// A 9:16 animatic rendered without the vertical composition is landscape; the user would approve the
// 16:9 motion as the vertical cut. Returns the error, or "" when height > width.
function notPortrait(probe, path, anim) {
  let s;
  try { s = probe(path); } catch (e) { return `cannot read the frame size of ${anim}: ${e.message}`; }
  return s.height > s.width ? "" : `animatic ${anim} is ${s.width}×${s.height}, not portrait; re-run ${VERTICAL_HINT}`;
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

export function check({ project = ".", stage = "plan", sync = checkSync } = {}) {
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
  out.creative = checkCreative({ dir, plan, brief, stage, errors, warnings, sync });

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
