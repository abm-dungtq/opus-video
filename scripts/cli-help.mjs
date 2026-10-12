// cli-help.mjs — shared --help/-h for the opus-video scripts. Node built-ins only.
// The usage text is the script's own leading `//` comment block (single source of truth),
// so help never drifts from the header. Call maybeHelp() before any side effect.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const wantsHelp = (argv) => argv.some((a) => a === "--help" || a === "-h");

export function helpText(moduleUrl) {
  const lines = readFileSync(fileURLToPath(moduleUrl), "utf8").split(/\r?\n/);
  let i = lines[0]?.startsWith("#!") ? 1 : 0;
  const out = [];
  for (; i < lines.length && lines[i].startsWith("//"); i++) out.push(lines[i].replace(/^\/\/ ?/, ""));
  return out.join("\n").replace(/\s+$/, "") + "\n";
}

// Prints the header and exits 0 when argv has --help or -h; otherwise returns false.
export function maybeHelp(argv, moduleUrl) {
  if (!wantsHelp(argv)) return false;
  process.stdout.write(helpText(moduleUrl));
  process.exit(0);
}
