// Plugin layout: eleven skills under skills/, each with valid frontmatter, short enough to load,
// and every $OV path it names present in the repo; plugin.json version matches the changelog.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SKILLS = ["opus-video", "ov-setup", "ov-brief", "ov-direction", "ov-cases", "ov-script", "ov-audio", "ov-build", "ov-footage", "ov-deliver", "ov-studio"];
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const frontmatter = (text) => {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const fm = {};
  for (const l of m[1].split("\n")) {
    const x = l.match(/^([a-z_-]+):\s*(.*)$/);
    if (x) fm[x[1]] = x[2].replace(/^"(.*)"$/, "$1");
  }
  return fm;
};

test("skills/ holds exactly the eleven skills and no root SKILL.md", () => {
  assert.deepEqual(readdirSync(join(ROOT, "skills")).filter((d) => !d.startsWith(".")).sort(), [...SKILLS].sort());
  assert.ok(!existsSync(join(ROOT, "SKILL.md")), "a root SKILL.md would load the router twice");
});

for (const name of SKILLS) {
  test(`${name}: frontmatter, length and paths`, () => {
    const text = read(`skills/${name}/SKILL.md`);
    const fm = frontmatter(text);
    assert.ok(fm, "frontmatter");
    assert.equal(fm.name, name);
    assert.ok(fm.description && fm.description.length <= 1024, `description length ${fm.description?.length}`);
    assert.ok(/Không dùng/.test(fm.description), "description says when not to use it");
    assert.ok(text.split("\n").length <= 151, `${text.split("\n").length} lines`);
    assert.match(text, /`\$OV` là thư mục gốc plugin opus-video/, "path rule");
    const paths = [...text.matchAll(/\$OV\/((?:scripts|references)\/[\w./-]+\.(?:mjs|md|json))/g)].map((m) => m[1]);
    for (const p of new Set(paths)) assert.ok(existsSync(join(ROOT, p)), `${p} named in ${name} does not exist`);
  });
}

test("plugin.json and marketplace.json agree with the newest CHANGELOG version", () => {
  const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
  const market = JSON.parse(read(".claude-plugin/marketplace.json"));
  const newest = read("CHANGELOG.md").match(/^## v?(\d+\.\d+\.\d+)/m)?.[1];
  assert.equal(plugin.name, "opus-video");
  assert.equal(plugin.skills, "./skills/");
  assert.equal(plugin.version, newest);
  assert.equal(market.plugins[0].name, "opus-video");
  assert.equal(market.plugins[0].version, newest);
});
