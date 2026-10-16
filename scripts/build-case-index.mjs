#!/usr/bin/env node
// build-case-index.mjs — normalize both "awesome Opus 5.5 videos" datasets into data/cases.jsonl.
//   node build-case-index.mjs <yihui videos.json> <chuspeeism cases.json> <out.jsonl>
//        --yihui-commit <sha> [--chus-commit 028bc52] [--previous <old cases.jsonl>]
// --previous keeps every y: case that upstream removed, with its old fields and
// `upstream_removed: true` (find-cases / rerank-cases hide those unless --include-removed).
// Prints ADDED n · KEPT n · REMOVED n · TOTAL n (ADDED/KEPT/REMOVED count y: ids against --previous).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { maybeHelp } from "./cli-help.mjs";

const CHUS_CATEGORY = {
  "动效与片头": "motion",
  "品牌与产品": "product",
  "叙事与音乐": "story-music",
  "知识与教学": "explainer",
  "三维与空间": "3d",
};
const HIDDEN = "原帖未公开";

export function buildCases({ yihui, chus, previous = [], yihuiCommit, chusCommit = "028bc52" }) {
  const fresh = yihui.map((v) => ({
    id: `y:${v.slug}`,
    source: `yihui-dev/awesome-opus5-5-videos@${yihuiCommit}`,
    license: "MIT",
    url: v.post_url,
    author: v.author,
    category: v.category,
    tags: v.tech_tags ?? [],
    title: "",
    prompt: v.prompt ?? "",
    has_full_prompt: !v.prompt_partial,
    prompt_len: (v.prompt ?? "").length,
    added: v.added ?? "",
  }));
  const freshIds = new Set(fresh.map((r) => r.id));
  const oldY = previous.filter((r) => r.id.startsWith("y:"));
  const oldIds = new Set(oldY.map((r) => r.id));
  const removed = oldY.filter((r) => !freshIds.has(r.id)).map((r) => ({ ...r, upstream_removed: true }));
  const c = chus.map((x) => {
    const hidden = String(x.prompt ?? "").startsWith(HIDDEN);
    const prompt = hidden ? x.summary ?? "" : x.prompt ?? "";
    return {
      id: `c:${String(x.sourceUrl).match(/(\d+)\D*$/)?.[1] ?? x.title}`,
      source: `chuspeeism/awesome-opus-5-5-videos@${chusCommit}`,
      license: "MIT",
      url: x.sourceUrl,
      author: x.sourceAuthor,
      category: CHUS_CATEGORY[x.category] ?? x.category,
      tags: [],
      title: x.title ?? "",
      prompt,
      has_full_prompt: !hidden,
      prompt_len: prompt.length,
      added: String(x.sourcePublishedAt ?? "").slice(0, 10),
    };
  });
  const rows = [...fresh, ...removed, ...c].sort((a, b) => a.id.localeCompare(b.id));
  const kept = fresh.filter((r) => oldIds.has(r.id)).length;
  return { rows, counts: { added: fresh.length - kept, kept, removed: removed.length, total: rows.length } };
}

const readJsonl = (p) => readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

function main(argv) {
  maybeHelp(argv, import.meta.url);
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
    else pos.push(argv[i]);
  }
  const [yihuiPath, chusPath, outPath] = pos;
  if (!yihuiPath || !chusPath || !outPath || !opt["yihui-commit"]) {
    console.error("usage: build-case-index.mjs <videos.json> <cases.json> <out.jsonl> --yihui-commit <sha> [--chus-commit <sha>] [--previous <jsonl>]");
    process.exit(2);
  }
  const { rows, counts } = buildCases({
    yihui: JSON.parse(readFileSync(yihuiPath, "utf8")),
    chus: JSON.parse(readFileSync(chusPath, "utf8")),
    previous: opt.previous ? readJsonl(opt.previous) : [],
    yihuiCommit: opt["yihui-commit"],
    chusCommit: opt["chus-commit"],
  });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`ADDED ${counts.added} · KEPT ${counts.kept} · REMOVED ${counts.removed} · TOTAL ${counts.total}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
