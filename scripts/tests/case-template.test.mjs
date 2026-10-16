import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run } from "../case-template.mjs";

const script = fileURLToPath(new URL("../case-template.mjs", import.meta.url));
const cases = [
  { id: "y:full", source: "yihui-dev/awesome-opus5-5-videos@92aee2f", license: "MIT", url: "https://x.com/full", author: "ann", tags: ["gsap", "kinetic-type"], prompt: "Make a 20s logo sting.\n\nUse bold type.", has_full_prompt: true },
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
    assert.match(readFileSync(join(d, "BRIEF.md"), "utf8"), /^creative_override: nhanh theo case y:full$/m);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("an existing creative_override is left alone; a partial prompt warns and still writes", () => {
  const brief = "---\naspect: 16:9\ncreative_override: dự án cũ chỉ có footage\n---\n# X\n";
  const d = setup(brief);
  try {
    const warns = [];
    assert.equal(run({ project: d, id: "y:part", file: join(d, "cases.jsonl"), log: (m) => warns.push(m) }).code, 0);
    assert.equal(warns[0], "WARN prompt không đầy đủ");
    assert.match(warns[1], /không phải nhanh theo case/);
    assert.ok(existsSync(join(d, "build", "TEMPLATE.md")));
    assert.equal(readFileSync(join(d, "BRIEF.md"), "utf8"), brief);
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
