#!/usr/bin/env node
// find-cases.mjs — search the bundled Opus 5.5 video corpus (data/cases.jsonl).
//   node find-cases.mjs [--category c] [--tag t] [--keyword k]... [--full-only]
//                       [--limit 5] [--max-chars 1200] [--json]
// Categories: motion · explainer · 3d · interactive · product · story-music.
// Every result carries author + source URL; prompts belong to their authors.

import { readFileSync } from "node:fs";
import { maybeHelp } from "./cli-help.mjs";
maybeHelp(process.argv.slice(2), import.meta.url);

const argv = process.argv.slice(2);
const keywords = [];
const opts = { limit: 5, "max-chars": 1200 };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith("--")) continue;
  const k = a.slice(2);
  if (k === "full-only" || k === "json") opts[k] = true;
  else if (k === "keyword") keywords.push(String(argv[++i] ?? "").toLowerCase());
  else opts[k] = argv[++i];
}

const rows = readFileSync(new URL("../data/cases.jsonl", import.meta.url), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const scored = rows
  .filter((r) => !opts.category || r.category === opts.category)
  .filter((r) => !opts.tag || r.tags.includes(opts.tag))
  .filter((r) => !opts["full-only"] || r.has_full_prompt)
  .map((r) => {
    const hay = `${r.prompt} ${r.title}`.toLowerCase();
    const hits = keywords.filter((k) => hay.includes(k)).length;
    return { r, hits, score: hits * 10 + Math.min(r.prompt_len, 4000) / 400 + (r.has_full_prompt ? 5 : 0) };
  })
  .filter((s) => keywords.length === 0 || s.hits > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, Number(opts.limit));

const max = Number(opts["max-chars"]);
const clip = (p) => (p.length > max ? p.slice(0, max) + "…" : p);

if (opts.json) {
  console.log(JSON.stringify(scored.map(({ r }) => ({ ...r, prompt: clip(r.prompt) })), null, 2));
} else {
  for (const { r } of scored) {
    console.log(`### ${r.id} · @${r.author} · ${r.category} · ${r.tags.join(", ") || "-"}`);
    console.log(r.url);
    console.log(clip(r.prompt));
    console.log();
  }
  if (!scored.length) console.error("no matching cases");
}
