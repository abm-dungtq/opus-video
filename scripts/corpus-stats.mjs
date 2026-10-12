#!/usr/bin/env node
// corpus-stats.mjs — summarize the two "awesome Opus 5.5 videos" datasets.
//   node corpus-stats.mjs <yihui videos.json> <chuspeeism cases.json>
// Prints {"yihui":{total,full_prompts,by_category,tech_tags,keywords},
//         "chuspeeism":{total,public_prompts,by_category,keywords}}

import { readFileSync } from "node:fs";
import { maybeHelp } from "./cli-help.mjs";
maybeHelp(process.argv.slice(2), import.meta.url);

const [yihuiPath, chusPath] = process.argv.slice(2);
if (!yihuiPath || !chusPath) {
  console.error("usage: corpus-stats.mjs <videos.json> <cases.json>");
  process.exit(2);
}

const KEYWORDS = [
  "remotion", "hyperframes", "gsap", "three", "ffmpeg", "playwright", "elevenlabs",
  "storyboard", "bpm", "9:16", "vertical", "15-second", "30-second",
];
const KEYWORDS_ZH = ["旁白", "配音", "配乐", "音效", "字幕", "剪辑", "blender", "after effects", "remotion", "elevenlabs"];

const count = (items, pick) =>
  items.reduce((acc, it) => {
    for (const k of [].concat(pick(it) ?? [])) acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
const keywordHits = (texts, words) =>
  Object.fromEntries(words.map((w) => [w, texts.filter((t) => t.toLowerCase().includes(w)).length]));

const yihui = JSON.parse(readFileSync(yihuiPath, "utf8"));
const chus = JSON.parse(readFileSync(chusPath, "utf8"));

console.log(
  JSON.stringify(
    {
      yihui: {
        total: yihui.length,
        full_prompts: yihui.filter((v) => !v.prompt_partial).length,
        by_category: count(yihui, (v) => v.category),
        tech_tags: count(yihui, (v) => v.tech_tags),
        keywords: keywordHits(yihui.map((v) => v.prompt || ""), KEYWORDS),
      },
      chuspeeism: {
        total: chus.length,
        public_prompts: chus.filter((c) => !String(c.prompt).startsWith("原帖未公开")).length,
        by_category: count(chus, (c) => c.category),
        keywords: keywordHits(chus.map((c) => `${c.prompt} ${c.summary}`), KEYWORDS_ZH),
      },
    },
    null,
    2,
  ),
);
