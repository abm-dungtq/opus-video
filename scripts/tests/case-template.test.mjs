import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run, show, jevReason } from "../case-template.mjs";

const script = fileURLToPath(new URL("../case-template.mjs", import.meta.url));
const cases = [
  { id: "y:full", source: "yihui-dev/awesome-opus5-5-videos@92aee2f", license: "MIT", url: "https://x.com/full", demo_url: "https://skillry.dev/v/full", repo_url: "https://github.com/yihui-dev/awesome-opus5-5-videos/blob/92aee2f/prompts/full.md", author: "ann", tags: ["gsap", "kinetic-type"], prompt: "Make a 20s logo sting.\n\nUse bold type.", has_full_prompt: true },
  { id: "y:part", source: "yihui-dev/awesome-opus5-5-videos@92aee2f", license: "MIT", url: "https://x.com/part", author: "bo", tags: [], prompt: "partial", has_full_prompt: false },
  { id: "y:gone", source: "yihui-dev/awesome-opus5-5-videos@7562902", license: "MIT", url: "https://x.com/gone", author: "cy", tags: [], prompt: "old", has_full_prompt: true, upstream_removed: true },
];
function setup(brief = "---\naspect: 9:16\nbrief_version: 2\n---\n\n# Brief: Ra mắt ứng dụng ABM\n") {
  const d = mkdtempSync(join(tmpdir(), "ct-"));
  writeFileSync(join(d, "cases.jsonl"), cases.map((c) => JSON.stringify(c)).join("\n") + "\n");
  writeFileSync(join(d, "BRIEF.md"), brief);
  return d;
}

test("template carries the prompt verbatim, attribution, topic, aspect and checklist; BRIEF gets the quick override", () => {
  const d = setup();
  try {
    const r = run({ project: d, id: "y:full", file: join(d, "cases.jsonl"), log: () => {} });
    assert.equal(r.code, 0);
    const t = readFileSync(join(d, "build", "TEMPLATE.md"), "utf8");
    assert.match(t, /> Make a 20s logo sting\.\n>\n> Use bold type\./);
    for (const s of ["ann", "https://x.com/full", "MIT", "@92aee2f", "Ra mắt ứng dụng ABM", "9:16", "gsap, kinetic-type", "ov-script", "lorem ipsum", "bịa số liệu"]) assert.ok(t.includes(s), s);
    for (const s of ["https://skillry.dev/v/full", "prompts/full.md", "## Vì sao dùng prompt này", "## Prompt chuyển thể", "--show"]) assert.ok(t.includes(s), s);
    const b = readFileSync(join(d, "BRIEF.md"), "utf8");
    assert.match(b, /^creative_override: nhanh theo case y:full$/m);
    assert.match(b, /^case_pick: y:full$/m);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("an existing creative_override is left alone (only case_pick is added); a partial prompt warns and still writes", () => {
  const brief = "---\naspect: 16:9\ncreative_override: dự án cũ chỉ có footage\n---\n# X\n";
  const d = setup(brief);
  try {
    const warns = [];
    assert.equal(run({ project: d, id: "y:part", file: join(d, "cases.jsonl"), log: (m) => warns.push(m) }).code, 0);
    assert.equal(warns[0], "WARN prompt không đầy đủ");
    assert.match(warns[1], /không phải nhanh theo case/);
    assert.ok(existsSync(join(d, "build", "TEMPLATE.md")));
    const b = readFileSync(join(d, "BRIEF.md"), "utf8");
    assert.match(b, /^creative_override: dự án cũ chỉ có footage$/m);
    assert.match(b, /^case_pick: y:part$/m);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("unknown and upstream_removed ids are refused with exit 2 and nothing written", () => {
  const d = setup();
  try {
    for (const id of ["y:nope", "y:gone"]) {
      const r = run({ project: d, id, file: join(d, "cases.jsonl"), log: () => {} });
      assert.equal(r.code, 2, id);
    }
    assert.ok(!existsSync(join(d, "build", "TEMPLATE.md")));
    const cli = spawnSync("node", [script, "--project", d, "--case", "y:does-not-exist"], { encoding: "utf8" });
    assert.equal(cli.status, 2);
    assert.match(cli.stderr, /unknown case id/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("--reference records the pick without the quick override; Jev's reason comes from CASES.md", () => {
  const d = setup();
  try {
    writeFileSync(join(d, "CASES.md"), "1. **y:full** · @ann · logo: sting\n   Vì sao: loại video khớp (4/4)\n   Video demo: https://skillry.dev/v/full\n");
    assert.equal(jevReason(d, "y:full"), "loại video khớp (4/4)");
    assert.equal(jevReason(d, "y:part"), null);
    assert.equal(run({ project: d, id: "y:full", file: join(d, "cases.jsonl"), reference: true, log: () => {} }).code, 0);
    const b = readFileSync(join(d, "BRIEF.md"), "utf8");
    assert.match(b, /^case_pick: y:full$/m);
    assert.doesNotMatch(b, /creative_override/);
    assert.ok(readFileSync(join(d, "build", "TEMPLATE.md"), "utf8").includes("Jev chấm: loại video khớp (4/4)"));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("--show refuses placeholders (exit 3), then prints demo, links, why and the adapted prompt; a rewrite keeps both sections", () => {
  const d = setup();
  const file = join(d, "cases.jsonl");
  try {
    assert.equal(show({ project: d, file }).code, 2);
    run({ project: d, id: "y:full", file, log: () => {} });
    const r0 = show({ project: d, file });
    assert.equal(r0.code, 3);
    assert.match(r0.error, /Vì sao dùng prompt này/);
    const f = join(d, "build", "TEMPLATE.md");
    const why = "Case này là một logo sting ngắn, nhịp nhanh, chữ đậm: giống video ra mắt ABM của bạn. Giữ nhịp và kiểu chữ, đổi logo và câu chữ.";
    const adapted = "Make a 20s launch sting for the ABM app.\n\nUse bold type, the ABM logo and the line from BRIEF.md; vertical 9:16.";
    const t = readFileSync(f, "utf8")
      .replace(/(## Vì sao dùng prompt này\n\n)\(agent viết[^\n]*/, `$1${why}`)
      .replace(/(## Prompt chuyển thể\n\n)\(agent viết[^\n]*/, `$1${adapted}`);
    writeFileSync(f, t);
    const r = show({ project: d, file });
    assert.equal(r.code, 0);
    for (const s of ["## Case đã chọn: y:full · @ann", "Video demo: https://skillry.dev/v/full (bản gốc và bản làm lại)", "Bài gốc: https://x.com/full", "prompts/full.md", why, "```text\n" + adapted + "\n```", "MIT"]) assert.ok(r.text.includes(s), s);
    run({ project: d, id: "y:full", file, log: () => {} });
    assert.equal(show({ project: d, file }).code, 0, "rewriting the same case keeps the written sections");
    run({ project: d, id: "y:part", file, log: () => {} });
    assert.equal(show({ project: d, file }).code, 3, "another case starts from the placeholders");
  } finally { rmSync(d, { recursive: true, force: true }); }
});
