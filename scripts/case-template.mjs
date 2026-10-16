#!/usr/bin/env node
// case-template.mjs — quick mode (skill ov-cases): turn one chosen case into a build brief.
//   node case-template.mjs --project <dir> --case <id>
// Writes <dir>/build/TEMPLATE.md: the case prompt verbatim in a quote block, author, URL, license,
// source, the BRIEF.md topic and aspect, and an adaptation checklist. Adds
// `creative_override: nhanh theo case <id>` to BRIEF.md frontmatter when the field is absent.
// Exit 2: unknown id, an upstream_removed case, or no BRIEF.md. A case without a full prompt
// prints "WARN prompt không đầy đủ" and still writes.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { maybeHelp } from "./cli-help.mjs";
import { frontmatter } from "./check-viet-pro.mjs";
import { setFrontmatter } from "./make-pitch.mjs";
import { QUICK_MODE } from "./qc-mp4.mjs";

export const CASES = fileURLToPath(new URL("../data/cases.jsonl", import.meta.url));

export function loadCase(id, file = CASES) {
  for (const l of readFileSync(file, "utf8").split("\n")) {
    if (!l) continue;
    const r = JSON.parse(l);
    if (r.id === id) return r;
  }
  return null;
}

// The brief topic: `topic:` in frontmatter, else the first "# " heading.
export function briefTopic(brief, fm = frontmatter(brief)) {
  if (fm.topic) return fm.topic;
  const h = brief.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").match(/^#\s+(.+)$/m);
  return h ? h[1].replace(/^Brief:\s*/i, "").trim() : "(BRIEF.md chưa ghi chủ đề)";
}

export function renderTemplate(c, brief) {
  const fm = frontmatter(brief);
  const quote = c.prompt.split(/\r?\n/).map((l) => (l ? `> ${l}` : ">")).join("\n");
  return `# Mẫu dựng theo case ${c.id}

## Nguồn

- Tác giả: ${c.author || "(không rõ)"}
- Link: ${c.url}
- License: ${c.license}
- Nguồn dữ liệu: ${c.source}
- Prompt đầy đủ: ${c.has_full_prompt ? "có" : "không (chỉ có một phần, phải tự lấp chỗ thiếu từ brief)"}
- Thẻ kỹ thuật: ${c.tags?.length ? c.tags.join(", ") : "-"}

## Dự án

- Chủ đề: ${briefTopic(brief, fm)}
- Khổ hình: ${fm.aspect || "(BRIEF.md chưa ghi aspect)"}

## Prompt gốc (nguyên văn, thuộc về tác giả)

${quote}

## Checklist chuyển thể

- [ ] Thay chủ thể của case bằng nội dung của người dùng trong BRIEF.md; giữ cấu trúc, nhịp và cách chuyển cảnh.
- [ ] Giữ các thẻ kỹ thuật của case (${c.tags?.length ? c.tags.join(", ") : "đọc từ prompt"}) và map sang blueprint/rule trong references/pattern-library.md.
- [ ] Mọi chữ tiếng Việt trên hình và lời đọc đi qua ov-script (viet-pro đủ các bước) trước khi dựng.
- [ ] Không dùng lorem ipsum hay chữ giữ chỗ.
- [ ] Không bịa số liệu, tên hay trích dẫn; chỉ dùng thông tin có trong brief hoặc tài liệu người dùng đưa.
- [ ] Vẫn viết PLAN.md, chạy make-demo.mjs --animatic và chờ người dùng duyệt clip nháp trước khi render.
`;
}

export function run({ project, id, file = CASES, log = console.error }) {
  const briefPath = join(project, "BRIEF.md");
  if (!existsSync(briefPath)) return { code: 2, error: `no BRIEF.md in ${project}` };
  const c = loadCase(id, file);
  if (!c) return { code: 2, error: `unknown case id ${id} (find-cases.mjs lists ids)` };
  if (c.upstream_removed) return { code: 2, error: `case ${id} was removed upstream; pick another case` };
  if (!c.has_full_prompt) log("WARN prompt không đầy đủ");
  const brief = readFileSync(briefPath, "utf8");
  const out = join(project, "build", "TEMPLATE.md");
  mkdirSync(join(project, "build"), { recursive: true });
  writeFileSync(out, renderTemplate(c, brief));
  const override = frontmatter(brief).creative_override;
  if (!override) writeFileSync(briefPath, setFrontmatter(brief, { creative_override: `nhanh theo case ${id}` }));
  else if (!QUICK_MODE.test(override.trim())) log(`WARN BRIEF.md đã có creative_override "${override.trim()}" (không phải nhanh theo case): check-preflight bỏ cả cổng animatic; đổi thành "nhanh theo case ${id}" nếu đây là hướng nhanh`);
  return { code: 0, out };
}

function main(argv) {
  maybeHelp(argv, import.meta.url);
  const opt = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
  if (!opt.project || !opt.case) { console.error("usage: case-template.mjs --project <dir> --case <id>"); process.exit(2); }
  const r = run({ project: opt.project, id: opt.case });
  if (r.error) console.error(`case-template: ${r.error}`);
  else console.log(`wrote ${r.out}`);
  process.exit(r.code);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
