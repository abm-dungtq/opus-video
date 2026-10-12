#!/usr/bin/env node
// build-case-index.mjs — normalize both "awesome Opus 5.5 videos" datasets into data/cases.jsonl.
//   node build-case-index.mjs <yihui videos.json> <chuspeeism cases.json> <out.jsonl>

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { maybeHelp } from "./cli-help.mjs";
maybeHelp(process.argv.slice(2), import.meta.url);

const [yihuiPath, chusPath, outPath] = process.argv.slice(2);
if (!yihuiPath || !chusPath || !outPath) {
  console.error("usage: build-case-index.mjs <videos.json> <cases.json> <out.jsonl>");
  process.exit(2);
}

const YIHUI_SRC = "yihui-dev/awesome-opus5-5-videos@7562902";
const CHUS_SRC = "chuspeeism/awesome-opus-5-5-videos@028bc52";
const CHUS_CATEGORY = {
  "动效与片头": "motion",
  "品牌与产品": "product",
  "叙事与音乐": "story-music",
  "知识与教学": "explainer",
  "三维与空间": "3d",
};
const HIDDEN = "原帖未公开";

const yihui = JSON.parse(readFileSync(yihuiPath, "utf8")).map((v) => ({
  id: `y:${v.slug}`,
  source: YIHUI_SRC,
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

const chus = JSON.parse(readFileSync(chusPath, "utf8")).map((c) => {
  const hidden = String(c.prompt ?? "").startsWith(HIDDEN);
  const prompt = hidden ? c.summary ?? "" : c.prompt ?? "";
  return {
    id: `c:${String(c.sourceUrl).match(/(\d+)\D*$/)?.[1] ?? c.title}`,
    source: CHUS_SRC,
    license: "MIT",
    url: c.sourceUrl,
    author: c.sourceAuthor,
    category: CHUS_CATEGORY[c.category] ?? c.category,
    tags: [],
    title: c.title ?? "",
    prompt,
    has_full_prompt: !hidden,
    prompt_len: prompt.length,
    added: String(c.sourcePublishedAt ?? "").slice(0, 10),
  };
});

const all = [...yihui, ...chus].sort((a, b) => a.id.localeCompare(b.id));
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, all.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.error(`cases: ${all.length} (yihui ${yihui.length}, chuspeeism ${chus.length}) → ${outPath}`);
