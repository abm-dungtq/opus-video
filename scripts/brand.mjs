#!/usr/bin/env node
// brand.mjs — shared brand kit (logo, watermark, fonts, 4 colours, voice_id, banned directions)
// read by make-pitch (step 1b). Start from references/brand.example.json, save it as
// shared-assets/brand.json (or <project>/brand.json); file paths are relative to that file.
//   node brand.mjs check [--project .] [--file <brand.json>] [--json]
//   node brand.mjs --help | -h
// Lookup order: --file (must exist; relative to --project) → <project>/brand.json →
//   <project>/../shared-assets/brand.json.
// ERROR: palette.bg/fg/accent not #rrggbb (accent2 optional, same form when set); a
//   banned_directions id that is not in data/directions.json.
// WARN: logo / watermark / fonts.heading / fonts.body set but the file is missing; a heading font
//   that is not .ttf/.otf/.woff2.
// No brand.json is fine (the kit is optional): prints a hint and exits 0.
// Exit: 0 valid or no brand · 1 ERROR · 2 bad usage or broken JSON.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { loadDirections } from "./directions.mjs";

const HEX = /^#[0-9a-f]{6}$/i;
const FILE_KEYS = ["logo", "watermark", "fonts.heading", "fonts.body"];
const get = (obj, key) => key.split(".").reduce((v, k) => (v && typeof v === "object" ? v[k] : undefined), obj);

// → { path, dir, brand } or null; broken JSON, or an explicit path that does not exist, throws
// Error("brand.json: <path>: <message>"). A relative explicit path resolves from the project.
export function findBrand(project, explicit = "") {
  const root = resolve(project || ".");
  const candidates = explicit ? [resolve(root, explicit)] : [join(root, "brand.json"), join(dirname(root), "shared-assets", "brand.json")];
  for (const path of candidates) {
    if (!existsSync(path)) { if (explicit) throw new Error(`brand.json: ${path}: not found`); continue; }
    try { return { path, dir: dirname(path), brand: JSON.parse(readFileSync(path, "utf8")) }; }
    catch (e) { throw new Error(`brand.json: ${path}: ${e.message}`); }
  }
  return null;
}

export function validateBrand(brand, dir, data = loadDirections()) {
  const errors = [], warnings = [];
  const pal = (brand && brand.palette) || {};
  for (const k of ["bg", "fg", "accent"]) if (!HEX.test(String(pal[k] ?? ""))) errors.push(`palette.${k} must be #rrggbb (got ${JSON.stringify(pal[k] ?? null)})`);
  if (pal.accent2 !== undefined && pal.accent2 !== "" && !HEX.test(String(pal.accent2))) errors.push(`palette.accent2 must be #rrggbb (got ${JSON.stringify(pal.accent2)})`);
  const ids = new Set(data.directions.map((d) => d.id));
  for (const id of (brand && brand.banned_directions) || []) if (!ids.has(id)) errors.push(`banned_directions: unknown direction ${id} (known: ${[...ids].join(", ")})`);
  for (const key of FILE_KEYS) {
    const v = get(brand, key);
    if (v && !existsSync(resolve(dir, v))) warnings.push(`${key}: file not found: ${resolve(dir, v)}`);
  }
  const heading = get(brand, "fonts.heading");
  if (heading && !/\.(ttf|otf|woff2)$/i.test(heading)) warnings.push(`fonts.heading should be .ttf, .otf or .woff2 (got ${heading})`);
  return { errors, warnings };
}

// Absolute path of a file field ("logo", "fonts.heading"); "" when missing or empty.
export function brandAbs(found, key) {
  const v = found && get(found.brand, key);
  return v ? resolve(found.dir, String(v)) : "";
}

function parseArgs(argv) {
  const o = { cmd: argv[0] };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.json = true;
    else if (a === "--project" || a === "--file") { if (argv[i + 1] === undefined) return { bad: `${a} needs a value` }; o[a.slice(2)] = argv[++i]; }
    else return { bad: `unknown argument ${a}` };
  }
  if (o.cmd !== "check") return { bad: `unknown command ${o.cmd ?? ""} (check)` };
  return o;
}

export function main(argv = process.argv.slice(2), log = console.log, err = console.error) {
  if (wantsHelp(argv)) { process.stdout.write(helpText(import.meta.url)); return 0; }
  const o = parseArgs(argv);
  if (o.bad) { err(`brand: ${o.bad}`); return 2; }
  let found;
  try { found = findBrand(o.project || ".", o.file || ""); } catch (e) { err(e.message); return 2; }
  if (!found) {
    if (o.json) log(JSON.stringify({ path: null, errors: [], warnings: [] }));
    else log("no brand.json found (optional: copy references/brand.example.json to shared-assets/brand.json)");
    return 0;
  }
  const { errors, warnings } = validateBrand(found.brand, found.dir);
  if (o.json) log(JSON.stringify({ path: found.path, errors, warnings }));
  else {
    for (const e of errors) log(`ERROR ${e}`);
    for (const w of warnings) log(`WARN  ${w}`);
    log(`${errors.length ? "FAIL" : "PASS"} brand ${found.path}`);
  }
  return errors.length ? 1 : 0;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
