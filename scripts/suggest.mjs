#!/usr/bin/env node
// suggest.mjs — deterministic suggestion for a project: the three directions make-pitch init would
// pick (one per tier, directions.mjs pick) with their reasons, and for each one the style profiles
// from its styles_goi_y that fit the brief's energy (styles.mjs suggest). Reads BRIEF.md frontmatter
// (category, aspect, energy, topic) and the brand's banned_directions (brand.mjs, same lookup as
// make-pitch). No network, writes no file. Motion Studio runs it through COMMANDS.suggest.
//   node suggest.mjs --project <dir> [--json]
//   node suggest.mjs --help | -h
// --json prints one line:
//   { "v": 1, "directions": [{ "id", "tier", "tier_vi", "name", "score", "why": [string] }],
//     "styles": { "<direction id>": [style id] }, "energy": string | null }
// energy is the brief's energy when it is em, vua or don-dap, else null (styles are then not
// filtered by energy). Without --json: a short Vietnamese table.
// Exit: 0 printed · 2 bad usage, BRIEF.md missing or brand.json unreadable.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { frontmatter } from "./check-viet-pro.mjs";
import { PLACEHOLDER } from "./check-preflight.mjs";
import { loadDirections, pickDirections, TIER_VI } from "./directions.mjs";
import { ENERGY_RANGE, loadProfiles, suggestStyles } from "./styles.mjs";
import { findBrand } from "./brand.mjs";

export const VERSION = 1;
const value = (v) => (v && !PLACEHOLDER.test(String(v).trim()) ? String(v).trim() : "");

// project dir → { code, result | msg }; result is the --json shape above.
export function suggest(project, data = loadDirections(), profiles = loadProfiles()) {
  const root = resolve(project);
  const briefPath = join(root, "BRIEF.md");
  if (!existsSync(briefPath)) return { code: 2, msg: `BRIEF.md not found in ${root}` };
  const fm = frontmatter(readFileSync(briefPath, "utf8"));
  let brand = null;
  try { brand = findBrand(root); } catch (e) { return { code: 2, msg: e.message }; }
  const energy = ENERGY_RANGE[value(fm.energy)] ? value(fm.energy) : "";
  const picks = pickDirections({ category: value(fm.category), aspect: value(fm.aspect), energy, topic: value(fm.topic),
    exclude: (brand && brand.brand.banned_directions) || [] }, data);
  const directions = picks.map((p) => ({ id: p.id, tier: p.tier, tier_vi: TIER_VI[p.tier], name: p.direction.ten_vi, score: p.score, why: p.why }));
  const styles = Object.fromEntries(picks.map((p) => [p.id, suggestStyles(p.direction, energy, profiles)]));
  return { code: 0, result: { v: VERSION, directions, styles, energy: energy || null } };
}

function table(r) {
  const L = [];
  for (const d of r.directions) {
    L.push(`${d.id} ${d.name} [${d.tier_vi}] điểm ${d.score}${d.why.length ? ` (${d.why.join("; ")})` : ""}`);
    L.push(`   style: ${r.styles[d.id].length ? r.styles[d.id].join(", ") : `không có style hợp nhịp ${r.energy}`}`);
  }
  L.push(r.energy ? `Nhịp theo BRIEF: ${r.energy}` : "BRIEF chưa có nhịp: style không lọc theo nhịp");
  return L.join("\n");
}

function parseArgs(argv) {
  const o = { project: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.json = true;
    else if (a === "--project") { if (argv[i + 1] === undefined) return { bad: "--project needs a value" }; o.project = argv[++i]; }
    else return { bad: `unknown argument ${a}` };
  }
  if (!o.project) return { bad: "--project <dir> is required" };
  return o;
}

export function main(argv = process.argv.slice(2), log = console.log, err = console.error) {
  if (wantsHelp(argv) || !argv.length) { process.stdout.write(helpText(import.meta.url)); return argv.length ? 0 : 2; }
  const o = parseArgs(argv);
  if (o.bad) { err(`suggest: ${o.bad}`); return 2; }
  const r = suggest(o.project);
  if (r.code !== 0) { err(`suggest: ${r.msg}`); return r.code; }
  log(o.json ? JSON.stringify(r.result) : table(r.result));
  return 0;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
