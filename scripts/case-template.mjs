#!/usr/bin/env node
// case-template.mjs — the case the user picked from the suggestion (skill ov-cases), in any route.
//   node case-template.mjs --project <dir> --case <id> [--reference]
//   node case-template.mjs --project <dir> --show
// Writes <dir>/build/TEMPLATE.md: source (author, post, demo video, repo page, license), the BRIEF.md
// topic and aspect, Jev's reason from CASES.md, two sections the agent writes for the user (why this
// prompt fits, in Vietnamese; the case prompt adapted to the user's video), the case prompt verbatim
// and an adaptation checklist. Sets `case_pick: <id>` in BRIEF.md. Quick mode (no --reference) also
// adds `creative_override: nhanh theo case <id>` when the field is absent; --reference (dao-dien,
// tu-nhac) keeps the case as a reference and the direction gate as it is. Writing the same case again
// keeps what the agent already wrote in its two sections. Under the Motion Studio director BRIEF.md is
// the user's, so nothing is written there; the director reports the pick in its receipt.
// --show prints the block to send the user (demo video, links, why, adapted prompt) once both
// sections are written; exit 3 while either is still the placeholder or too short.
// Exit 2: unknown id, an upstream_removed case, no BRIEF.md, or --show without TEMPLATE.md.
// A case without a full prompt prints "WARN prompt không đầy đủ" and still writes.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { maybeHelp } from "./cli-help.mjs";
import { frontmatter } from "./check-viet-pro.mjs";
import { setFrontmatter } from "./make-pitch.mjs";
import { QUICK_MODE } from "./qc-mp4.mjs";
import { underDirector } from "./director-guard.mjs";
import { demoOf } from "./rerank-cases.mjs";

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

// The two sections the agent writes; the placeholder line marks one not written yet.
export const WHY = "Vì sao dùng prompt này";
export const ADAPTED = "Prompt chuyển thể";
export const PLACEHOLDER_LINE = "(agent viết";
const MIN_ADAPTED = 80;
const MIN_WHY = 40;
const PLACEHOLDER = {
  [WHY]: "(agent viết: 2–4 câu tiếng Việt cho người dùng, nói case này giống video của họ ở đâu (loại video, nhịp, cách dựng, kỹ thuật), sẽ giữ gì và đổi gì cho chủ đề của họ)",
  [ADAPTED]: "(agent viết: prompt của case viết lại cho video này, cùng ngôn ngữ với prompt gốc: giữ cấu trúc, nhịp, kỹ thuật và chuyển cảnh của case; thay chủ thể, chữ, số liệu, khổ hình và thời lượng bằng thông tin trong BRIEF.md; không bịa số, tên hay trích dẫn)",
};

const ORIGINAL = "Prompt gốc";
const CHECKLIST = "Checklist chuyển thể";
// The template's own top-level headings. A section ends only at one of these, so an adapted
// prompt that keeps the case's "## Scene 1" style headings is read whole.
const HEADINGS = [WHY, ADAPTED, ORIGINAL, CHECKLIST];
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NEXT = HEADINGS.map((h) => `^## ${escRe(h)}`).join("|");

// Body of a "## <name>" section (to the next template heading or the end), trimmed; "" when missing.
export function sectionOf(text, name) {
  const m = String(text).match(new RegExp(`^## ${escRe(name)}[^\\n]*\\n([\\s\\S]*?)(?=${NEXT}|(?![\\s\\S]))`, "m"));
  return m ? m[1].trim() : "";
}
const written = (body, min) => body.length >= min && !body.startsWith(PLACEHOLDER_LINE);
// No separate demo: the post carries the video, so the line says so instead of repeating the link.
const demoLine = (c) => (demoOf(c) ? `${demoOf(c)}${demoNote(c)}` : "không có trang demo riêng, video nằm trong bài gốc");
const demoNote = (c) => (c.demo_url?.includes("skillry.dev") ? " (bản gốc và bản làm lại)" : "");
// Jev's reason for the case in CASES.md (rerank-cases.mjs --suggest), or null.
export function jevReason(project, id) {
  const f = join(project, "CASES.md");
  if (!existsSync(f)) return null;
  const lines = readFileSync(f, "utf8").split(/\r?\n/);
  const i = lines.findIndex((l) => l.includes(`**${id}**`));
  const why = i >= 0 ? lines.slice(i + 1, i + 4).find((l) => /^\s+Vì sao:/.test(l)) : null;
  return why ? why.trim().replace(/^Vì sao:\s*/, "") : null;
}

export function renderTemplate(c, brief, { reason = null, keep = {} } = {}) {
  const fm = frontmatter(brief);
  const quote = c.prompt.split(/\r?\n/).map((l) => (l ? `> ${l}` : ">")).join("\n");
  return `# Mẫu dựng theo case ${c.id}

## Nguồn

- Tác giả: ${c.author || "(không rõ)"}
- Bài gốc: ${c.url}
- Video demo: ${demoLine(c)}
- Trang mẫu trong repo: ${c.repo_url || "(không có)"}
- License: ${c.license}
- Nguồn dữ liệu: ${c.source}
- Prompt đầy đủ: ${c.has_full_prompt ? "có" : "không (chỉ có một phần, phải tự lấp chỗ thiếu từ brief)"}
- Thẻ kỹ thuật: ${c.tags?.length ? c.tags.join(", ") : "-"}

## Dự án

- Chủ đề: ${briefTopic(brief, fm)}
- Khổ hình: ${fm.aspect || "(BRIEF.md chưa ghi aspect)"}
- Thời lượng: ${fm.duration_s ? `${fm.duration_s} giây` : "(BRIEF.md chưa ghi duration_s)"}
- Jev chấm: ${reason || "(không có trong CASES.md)"}

## ${WHY}

${keep[WHY] || PLACEHOLDER[WHY]}

## ${ADAPTED}

${keep[ADAPTED] || PLACEHOLDER[ADAPTED]}

## ${ORIGINAL} (nguyên văn, thuộc về tác giả)

${quote}

## ${CHECKLIST}

- [ ] Viết hai mục "${WHY}" và "${ADAPTED}", rồi chạy case-template.mjs --show và gửi nguyên khối in ra cho người dùng.
- [ ] Thay chủ thể của case bằng nội dung của người dùng trong BRIEF.md; giữ cấu trúc, nhịp và cách chuyển cảnh.
- [ ] Giữ các thẻ kỹ thuật của case (${c.tags?.length ? c.tags.join(", ") : "đọc từ prompt"}) và map sang blueprint/rule trong references/pattern-library.md.
- [ ] Mọi chữ tiếng Việt trên hình và lời đọc đi qua ov-script (viet-pro đủ các bước) trước khi dựng.
- [ ] Không dùng lorem ipsum hay chữ giữ chỗ.
- [ ] Không bịa số liệu, tên hay trích dẫn; chỉ dùng thông tin có trong brief hoặc tài liệu người dùng đưa.
- [ ] Vẫn viết PLAN.md, chạy make-demo.mjs --animatic và chờ người dùng duyệt clip nháp trước khi render.
`;
}

export function run({ project, id, file = CASES, reference = false, director = underDirector(), log = console.error }) {
  const briefPath = join(project, "BRIEF.md");
  if (!existsSync(briefPath)) return { code: 2, error: `no BRIEF.md in ${project}` };
  const c = loadCase(id, file);
  if (!c) return { code: 2, error: `unknown case id ${id} (find-cases.mjs lists ids)` };
  if (c.upstream_removed) return { code: 2, error: `case ${id} was removed upstream; pick another case` };
  if (!c.has_full_prompt) log("WARN prompt không đầy đủ");
  const brief = readFileSync(briefPath, "utf8");
  const out = join(project, "build", "TEMPLATE.md");
  const old = existsSync(out) ? readFileSync(out, "utf8") : "";
  const keep = old.startsWith(`# Mẫu dựng theo case ${id}\n`)
    ? Object.fromEntries([WHY, ADAPTED].map((k) => [k, sectionOf(old, k)]).filter(([, v]) => v && !v.startsWith(PLACEHOLDER_LINE)))
    : {};
  mkdirSync(join(project, "build"), { recursive: true });
  writeFileSync(out, renderTemplate(c, brief, { reason: jevReason(project, id), keep }));
  if (director) return { code: 0, out };
  const values = { case_pick: id };
  const override = frontmatter(brief).creative_override;
  if (!reference && !override) values.creative_override = `nhanh theo case ${id}`;
  else if (!reference && !QUICK_MODE.test(override.trim())) log(`WARN BRIEF.md đã có creative_override "${override.trim()}" (không phải nhanh theo case): check-preflight bỏ cả cổng animatic; đổi thành "nhanh theo case ${id}" nếu đây là hướng nhanh`);
  writeFileSync(briefPath, setFrontmatter(brief, values));
  return { code: 0, out };
}

// The block for the user once the agent wrote both sections. { code, text?, error? }
export function show({ project, file = CASES }) {
  const f = join(project, "build", "TEMPLATE.md");
  if (!existsSync(f)) return { code: 2, error: `no build/TEMPLATE.md in ${project}; run case-template.mjs --case <id> first` };
  const t = readFileSync(f, "utf8");
  const id = (t.match(/^# Mẫu dựng theo case (\S+)/m) || [])[1];
  const c = id ? loadCase(id, file) : null;
  if (!c) return { code: 2, error: "build/TEMPLATE.md names no known case" };
  const why = sectionOf(t, WHY), adapted = sectionOf(t, ADAPTED);
  const missing = [[WHY, why, MIN_WHY], [ADAPTED, adapted, MIN_ADAPTED]].filter(([, b, n]) => !written(b, n)).map(([k]) => k);
  if (missing.length) return { code: 3, error: `build/TEMPLATE.md: viết mục ${missing.map((k) => `"## ${k}"`).join(" và ")} trước (thay dòng "${PLACEHOLDER_LINE}…"), rồi chạy lại --show` };
  const fence = adapted.includes("```") ? "~~~" : "```";
  const text = [
    `## Case đã chọn: ${c.id} · @${c.author}`,
    "",
    `- Video demo: ${demoLine(c)}`,
    `- Bài gốc: ${c.url}`,
    ...(c.repo_url ? [`- Prompt gốc trong repo: ${c.repo_url}`] : []),
    "",
    `### ${WHY}`,
    "",
    why,
    "",
    `### ${ADAPTED} cho video của bạn`,
    "",
    `${fence}text`,
    adapted,
    fence,
    "",
    `Prompt gốc thuộc về @${c.author} (${c.license}); bản chuyển thể chỉ mượn cấu trúc và kỹ thuật.`,
  ].join("\n") + "\n";
  return { code: 0, text };
}

function main(argv) {
  maybeHelp(argv, import.meta.url);
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    if (["--reference", "--show"].includes(argv[i])) opt[argv[i].slice(2)] = true;
    else if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
  }
  if (opt.show) {
    const r = show({ project: opt.project || "." });
    if (r.error) console.error(`case-template: ${r.error}`);
    else process.stdout.write(r.text);
    process.exit(r.code);
  }
  if (!opt.project || !opt.case) { console.error("usage: case-template.mjs --project <dir> --case <id> [--reference] | --project <dir> --show"); process.exit(2); }
  const r = run({ project: opt.project, id: opt.case, reference: Boolean(opt.reference) });
  if (r.error) console.error(`case-template: ${r.error}`);
  else console.log(`wrote ${r.out}: viết hai mục "${WHY}" và "${ADAPTED}", rồi chạy case-template.mjs --project ${opt.project} --show và gửi khối in ra cho người dùng`);
  process.exit(r.code);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
