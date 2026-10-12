#!/usr/bin/env node
// jev-audit-eval.mjs — score the Jev voice-line audit (jev-audit.mjs) against the labelled
// eval set data/jev-audit-eval.jsonl ({ text, labels: [pattern…] } per line).
//   node jev-audit-eval.mjs [--threshold 0.7] [--set path]
// Prints, per pattern: tp | fp | fn | precision | recall, then token usage and cost.
// A pattern is a candidate for a FAIL rule only at precision ≥ 0.9 on this set (a human decides).
// Needs TYPESAFE_API_KEY (environment, else the opus-video env file read by jev-client; never printed).
// Exit: 0 report printed (also when the API failed part-way), 3 no key.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { audit, PATTERNS } from "./jev-audit.mjs";
import { loadKey, costOf } from "./jev-client.mjs";
import { maybeHelp } from "./cli-help.mjs";
maybeHelp(process.argv.slice(2), import.meta.url);

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const set = opt("set", fileURLToPath(new URL("../data/jev-audit-eval.jsonl", import.meta.url)));
const threshold = Number(opt("threshold", 0.7));
const rows = readFileSync(set, "utf8").trim().split("\n").map((l) => JSON.parse(l));

const apiKey = loadKey();
if (!apiKey) { console.log("no TYPESAFE_API_KEY"); process.exit(3); }

const res = await audit(rows.map((r) => r.text), { apiKey, threshold });
if (res.error) console.log(`WARN  audit error: ${res.error} (partial results)`);
const hit = new Set(res.warnings.map((w) => `${w.line}:${w.pattern}`));
const pct = (n, d) => (d ? (n / d).toFixed(2) : "-");
console.log("pattern | tp | fp | fn | precision | recall");
for (const k of Object.keys(PATTERNS)) {
  let tp = 0, fp = 0, fn = 0;
  rows.forEach((r, i) => {
    const want = r.labels.includes(k), got = hit.has(`${i}:${k}`);
    if (want && got) tp++; else if (got) fp++; else if (want) fn++;
  });
  console.log(`${k} | ${tp} | ${fp} | ${fn} | ${pct(tp, tp + fp)} | ${pct(tp, tp + fn)}`);
}
console.log(`lines ${rows.length} · threshold ${threshold} · input tokens ${res.usage.input_tokens} · cost $${costOf(res.usage).toFixed(6)}`);
