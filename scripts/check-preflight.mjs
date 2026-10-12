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
// Exit: 0 pass · 1 blocked · 2 bad usage.

import { existsSync, readFileSync, readdirSync, statSync, openSync, readSync, closeSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { frontmatter } from "./check-viet-pro.mjs";

const PLACEHOLDER = /^(?:…|\.{3}|todo|tbd|-|n\/a|chưa|pending|<[^>]*>)$/i;
export const SECTIONS = { goal: "muc tieu", scenes: "canh", audio: "am thanh", engine: "engine", demo: "khung hinh demo", qa: "qa" };
const fold = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLowerCase().replace(/\s+/g, " ").trim();

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

export function check({ project = ".", stage = "plan" } = {}) {
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
