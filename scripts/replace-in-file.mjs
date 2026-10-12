#!/usr/bin/env node
// replace-in-file.mjs — portable in-place regex replace (macOS, Linux, Windows; replaces
// `sed -i` in SKILL.md recipes, whose flags differ between BSD and GNU sed).
//   node replace-in-file.mjs <file> <regex> <replacement> [<regex> <replacement> …]
//   node replace-in-file.mjs --help | -h
// Every regex is applied globally (JavaScript syntax; $1 etc. work in the replacement), in order.
// Prints how many matches each pair replaced. Exit: 0 written (or nothing matched) · 2 bad usage.

import { readFileSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";

export function replaceAll(text, pairs) {
  const counts = [];
  for (const [re, rep] of pairs) {
    const rx = new RegExp(re, "g");
    counts.push((text.match(rx) || []).length);
    text = text.replace(rx, rep);
  }
  return { text, counts };
}

export function main(argv = process.argv.slice(2)) {
  if (wantsHelp(argv)) { process.stdout.write(helpText(import.meta.url)); return 0; }
  const [file, ...rest] = argv;
  if (!file || rest.length === 0 || rest.length % 2) { console.error("usage: node replace-in-file.mjs <file> <regex> <replacement> [...]"); return 2; }
  if (!existsSync(file)) { console.error(`replace-in-file: ${file} not found`); return 2; }
  const pairs = [];
  for (let i = 0; i < rest.length; i += 2) pairs.push([rest[i], rest[i + 1]]);
  const before = readFileSync(file, "utf8");
  const { text, counts } = replaceAll(before, pairs);
  if (text !== before) writeFileSync(file, text);
  pairs.forEach(([re], i) => console.log(`${counts[i]} × ${re}`));
  return 0;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
