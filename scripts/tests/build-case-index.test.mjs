import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../build-case-index.mjs", import.meta.url));
const v = (slug, prompt = "p") => ({ slug, post_url: `https://x.com/${slug}`, author: "a", category: "motion", tech_tags: ["gsap"], prompt });

test("rebuild counts added, kept and removed y: cases and flags only the removed ones", () => {
  const d = mkdtempSync(join(tmpdir(), "bci-"));
  try {
    writeFileSync(join(d, "videos.json"), JSON.stringify([v("keep", "new prompt"), v("fresh")]));
    writeFileSync(join(d, "cases.json"), JSON.stringify([{ sourceUrl: "https://x.com/s/123", sourceAuthor: "b", category: "三维与空间", prompt: "q" }]));
    const old = [
      { id: "y:keep", source: "yihui-dev/awesome-opus5-5-videos@7562902", prompt: "old prompt" },
      { id: "y:gone", source: "yihui-dev/awesome-opus5-5-videos@7562902", prompt: "gone prompt", author: "g" },
      { id: "c:123", source: "chuspeeism/awesome-opus-5-5-videos@028bc52" },
    ];
    writeFileSync(join(d, "prev.jsonl"), old.map((r) => JSON.stringify(r)).join("\n") + "\n");
    const out = join(d, "out.jsonl");
    const r = spawnSync("node", [script, join(d, "videos.json"), join(d, "cases.json"), out, "--yihui-commit", "92aee2f", "--previous", join(d, "prev.jsonl")], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /ADDED 1 · KEPT 1 · REMOVED 1 · TOTAL 4/);
    const rows = Object.fromEntries(readFileSync(out, "utf8").trim().split("\n").map((l) => JSON.parse(l)).map((x) => [x.id, x]));
    assert.equal(rows["y:keep"].prompt, "new prompt");
    assert.equal(rows["y:keep"].source, "yihui-dev/awesome-opus5-5-videos@92aee2f");
    assert.equal(rows["y:gone"].upstream_removed, true);
    assert.equal(rows["y:gone"].prompt, "gone prompt");
    assert.equal(rows["y:gone"].source, "yihui-dev/awesome-opus5-5-videos@7562902");
    assert.equal(rows["c:123"].category, "3d");
    assert.equal(Object.values(rows).filter((x) => x.upstream_removed).length, 1);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("rebuild without --yihui-commit exits 2", () => {
  const r = spawnSync("node", [script, "a", "b", "c"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--yihui-commit/);
});

test("data/cases.jsonl matches the upstream commits recorded in data/SOURCES.md", () => {
  const sources = readFileSync(fileURLToPath(new URL("../../data/SOURCES.md", import.meta.url)), "utf8");
  const commit = (repo) => sources.match(new RegExp(`${repo}\\s*\\|\\s*([0-9a-f]{7,})`))?.[1];
  const want = { y: commit("yihui-dev/awesome-opus5-5-videos"), c: commit("chuspeeism/awesome-opus-5-5-videos") };
  assert.ok(want.y && want.c, "SOURCES.md names both commits");
  const rows = readFileSync(fileURLToPath(new URL("../../data/cases.jsonl", import.meta.url)), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  for (const r of rows.filter((x) => !x.upstream_removed)) assert.ok(r.source.endsWith(`@${want[r.id[0]]}`), `${r.id} from ${r.source}`);
});
