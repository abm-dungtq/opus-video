#!/usr/bin/env node
// render-final.mjs — the only way to make the final (delivery) MP4. Runs the preflight gate
// (check-preflight --stage final: PLAN.md + demo frames + approval in DEMO.md), then
// `npx hyperframes render --quality delivery <your args>` in the project directory.
//   node render-final.mjs [--project .] -- [hyperframes render args, e.g. -c compositions/main-9x16.html --output renders/x-9x16.mp4]
//   node render-final.mjs --help | -h
// Draft and QA renders (--quality draft|looks) stay plain `hyperframes render`.
// A --quality/-q in the forwarded args is refused: this command always renders delivery.
// Exit: the render's exit code · 5 preflight blocked · 2 bad usage.

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { check, report } from "./check-preflight.mjs";

export const PREFLIGHT_EXIT = 5;

export function main(argv = process.argv.slice(2), { checkImpl = check, spawn = spawnSync } = {}) {
  if (wantsHelp(argv.slice(0, argv.includes("--") ? argv.indexOf("--") : argv.length))) { process.stdout.write(helpText(import.meta.url)); return 0; }
  const sep = argv.indexOf("--");
  const own = sep >= 0 ? argv.slice(0, sep) : argv;
  const fwd = sep >= 0 ? argv.slice(sep + 1) : [];
  let project = ".";
  for (let i = 0; i < own.length; i++) {
    if (own[i] === "--project") project = own[++i];
    else { console.error(`render-final: unknown argument ${own[i]} (put hyperframes render args after --)`); return 2; }
  }
  if (fwd.some((a) => a === "-q" || a === "--quality" || a.startsWith("--quality="))) { console.error("render-final: do not pass --quality; the final render is always delivery"); return 2; }
  const r = checkImpl({ project, stage: "final" });
  report(r, (m) => console.error(m));
  if (!r.pass) return PREFLIGHT_EXIT;
  const x = spawn("npx", ["hyperframes", "render", "--quality", "delivery", ...fwd], { cwd: resolve(project), stdio: "inherit", shell: process.platform === "win32" });
  return x.status ?? 1;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
