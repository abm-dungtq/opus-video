import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dedupeByUrl, whyOf, noteVi, suggestBlock, recordSuggestion, SUGGEST_FILE } from "../rerank-cases.mjs";
import { caseSuggestCheck } from "../check-preflight.mjs";
import { init } from "../make-pitch.mjs";
import { loadDirections } from "../directions.mjs";

const script = fileURLToPath(new URL("../rerank-cases.mjs", import.meta.url));
const row = (id, url, jev = null, extra = {}) => ({ id, url, author: "a", category: "explainer", tags: [], title: "", prompt: `prompt of ${id}`, has_full_prompt: true, jev, ...extra });
const composite = (k, t, s) => ({ final: 0.6, kind_fit: k, topic_fit: t, style_fit: s });
const tmp = () => mkdtempSync(join(tmpdir(), "case-suggest-"));
const QUERY = { video_type: "short explainer", purpose: "teach", topic: "phin coffee", industry: "food", aspect: "16:9", duration_s: 15, tone: "warm", key_visuals: "coffee drip", narration: "Vietnamese", source_material: "not stated" };

test("dedupeByUrl keeps the first row of a post listed by both datasets", () => {
  const out = dedupeByUrl([row("y:a", "https://x.com/1"), row("c:1", "https://x.com/1"), row("y:b", "https://x.com/2")]);
  assert.deepEqual(out.map((r) => r.id), ["y:a", "y:b"]);
});

test("whyOf turns Jev scores into a Vietnamese reason; no score says Jev did not rank", () => {
  assert.match(whyOf(row("y:a", "u", composite(3.2, 1.1, 2.4))), /loại video khớp \(3\.2\/4\), chủ đề khác \(1\.1\/4\), phong cách hình gần \(2\.4\/4\)/);
  assert.match(whyOf(row("y:a", "u", { score: 3, final: 3.4 }, { has_full_prompt: false })), /3\/4, prompt chỉ có một phần/);
  assert.match(whyOf(row("y:a", "u")), /Jev chưa chấm/);
  assert.match(noteVi("weak style fit (best style 1.4/4 < 2): …"), /phong cách hình/);
});

test("suggestBlock: Jev result lists the top cases with link and reason, case_search jev", () => {
  const out = { reranked: true, results: [row("y:a", "https://x.com/1", composite(3, 3, 3)), row("c:1", "https://x.com/1", composite(3, 3, 3)), row("y:b", "https://x.com/2", composite(2, 2, 2)), row("y:c", "https://x.com/3", composite(1, 1, 1)), row("y:d", "https://x.com/4", composite(1, 1, 1))], notes: ["no vertical (9:16) case in the top results: …"] };
  const b = suggestBlock(out, { limit: 3 });
  assert.deepEqual(b.ids, ["y:a", "y:b", "y:c"]);
  assert.match(b.text, /^## Gợi ý case/);
  assert.match(b.text, /1\. \*\*y:a\*\*.*\n   Vì sao: .*\n   https:\/\/x\.com\/1/, "no demo_url: only the post link, which carries the video");
  assert.doesNotMatch(b.text, /Video demo/);
  assert.doesNotMatch(suggestBlock({ reranked: true, results: [row("y:s", "https://x.com/5", composite(3, 3, 3), { demo_url: "https://x.com/5" })] }).text, /Video demo/, "a demo equal to the post is not repeated");
  const d = suggestBlock({ reranked: true, results: [row("y:z", "https://x.com/9", composite(3, 3, 3), { demo_url: "https://skillry.dev/ai-videos/opus-5-5/z" })] });
  assert.match(d.text, /Video demo: https:\/\/skillry\.dev\/ai-videos\/opus-5-5\/z/);
  assert.match(b.text, /Chọn một case/);
  assert.match(b.text, /> Không có case dọc 9:16/);
  assert.doesNotMatch(b.text, /Jev không chạy/);
  assert.match(b.text, /case_search: jev\n$/);
});

test("suggestBlock: a Jev failure is written at the top of the block, never silent", () => {
  const b = suggestBlock({ reranked: false, error: "HTTP 401", results: [row("y:a", "u1")] });
  assert.match(b.text, /⚠ Jev không chạy \(HTTP 401\)/);
  assert.match(b.text, /case_search: find-cases \(HTTP 401\)/);
});

test("recordSuggestion writes CASES.md and BRIEF fields; under the Studio director only CASES.md", () => {
  const d = tmp();
  try {
    const brief = "---\nbrief_version: 2\n---\n# Brief\n";
    writeFileSync(join(d, "BRIEF.md"), brief);
    const out = { reranked: true, results: [row("y:a", "u1", composite(3, 3, 3))] };
    const b = suggestBlock(out);
    assert.deepEqual(recordSuggestion(d, b, out, { director: true }), { brief: false });
    assert.equal(readFileSync(join(d, "BRIEF.md"), "utf8"), brief);
    assert.equal(readFileSync(join(d, SUGGEST_FILE), "utf8"), b.text);
    recordSuggestion(d, b, out, { director: false });
    const fm = readFileSync(join(d, "BRIEF.md"), "utf8");
    assert.match(fm, /^case_search: jev$/m);
    assert.match(fm, /^case_refs: y:a$/m);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("CLI --suggest without a key: block with the Jev warning, CASES.md and BRIEF fields written", () => {
  const d = tmp();
  try {
    writeFileSync(join(d, "BRIEF.case-query.json"), JSON.stringify(QUERY));
    writeFileSync(join(d, "BRIEF.md"), "---\nbrief_version: 2\n---\n# Brief\n");
    const r = spawnSync("node", [script, "--suggest", "--project", d, "--category", "explainer", "--keyword", "recipe"], {
      encoding: "utf8", env: { ...process.env, TYPESAFE_API_KEY: "", HOME: d, MOTION_STUDIO_RUNNER: "", OPUS_STUDIO_RUNNER: "" },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /⚠ Jev không chạy \(no TYPESAFE_API_KEY\)/);
    assert.equal((r.stdout.match(/^\d\. \*\*/gm) || []).length, 3);
    assert.match(r.stderr, /Jev unavailable \(no TYPESAFE_API_KEY\)/);
    assert.ok(existsSync(join(d, "CASES.md")));
    assert.match(readFileSync(join(d, "BRIEF.md"), "utf8"), /^case_search: find-cases \(no TYPESAFE_API_KEY\)$/m);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("CLI --suggest without BRIEF.case-query.json ranks from BRIEF.md; with neither file exits 2", () => {
  const d = tmp();
  try {
    const env = { ...process.env, TYPESAFE_API_KEY: "", HOME: d, MOTION_STUDIO_RUNNER: "", OPUS_STUDIO_RUNNER: "" };
    let r = spawnSync("node", [script, "--suggest", "--project", d], { encoding: "utf8", env });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /neither .*BRIEF\.case-query\.json nor .*BRIEF\.md/);
    writeFileSync(join(d, "BRIEF.md"), "---\nbrief_version: 3\naspect: 9:16\ntopic: cà phê phin\n---\n# Brief\nVideo dạy pha cà phê phin.\n");
    r = spawnSync("node", [script, "--suggest", "--project", d, "--stats"], { encoding: "utf8", env });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /ranking from BRIEF\.md/);
    assert.match(r.stdout, /^## Gợi ý case/);
    assert.ok(existsSync(join(d, "CASES.md")));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("preflight: FAIL for brief_version 3, WARN for 2, nothing for legacy or once suggested", () => {
  const d = tmp();
  try {
    const v3 = caseSuggestCheck({ dir: d, brief: "---\nbrief_version: 3\n---\n" });
    assert.equal(v3.level, "FAIL");
    assert.match(v3.msg, /rerank-cases\.mjs --suggest/);
    assert.equal(caseSuggestCheck({ dir: d, brief: "---\nbrief_version: 2\n---\n" }).level, "WARN");
    assert.equal(caseSuggestCheck({ dir: d, brief: "---\nbrief_version: 3\ncase_search: jev\n---\n" }), null);
    assert.equal(caseSuggestCheck({ dir: d, brief: "---\naspect: 16:9\n---\n" }), null, "legacy briefs are left alone");
    writeFileSync(join(d, "CASES.md"), "x");
    assert.equal(caseSuggestCheck({ dir: d, brief: "---\nbrief_version: 3\n---\n" }), null, "CASES.md from the Studio director counts");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("make-pitch init refuses a brief_version 3 brief before the case suggestion (exit 6)", () => {
  const d = tmp();
  try {
    writeFileSync(join(d, "BRIEF.md"), "---\nbrief_version: 3\naspect: 16:9\n---\n# Brief\n");
    const r = init({ project: d, topic: "cà phê phin", aspect: "16:9" }, loadDirections(), { anim: "x", faceless: "x", creative: "x" });
    assert.equal(r.code, 6);
    assert.match(r.msg, /rerank-cases\.mjs --suggest/);
    assert.ok(!existsSync(join(d, "pitch")), "nothing scaffolded");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("Studio's suggestCases command writes only CASES.md, and that alone opens the pitch gate", async () => {
  const { COMMANDS } = await import("../studio-api.mjs");
  const d = tmp();
  try {
    const brief = "---\nbrief_version: 3\naspect: 16:9\ntopic: cà phê phin\n---\n# Brief\nVideo dạy pha cà phê phin.\n";
    writeFileSync(join(d, "BRIEF.md"), brief);
    const { file, args } = COMMANDS.suggestCases;
    const r = spawnSync("node", [file, ...args.map((a) => a.replaceAll("{project}", d))], {
      encoding: "utf8", env: { ...process.env, TYPESAFE_API_KEY: "", HOME: d, MOTION_STUDIO_RUNNER: "", OPUS_STUDIO_RUNNER: "" },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(join(d, "CASES.md")));
    assert.equal(readFileSync(join(d, "BRIEF.md"), "utf8"), brief, "BRIEF.md is the user's in Studio");
    assert.equal(caseSuggestCheck({ dir: d, brief }), null);
    assert.notEqual(init({ project: d, topic: "cà phê phin", aspect: "16:9" }, loadDirections(), { anim: "x", faceless: "x", creative: "x" }).code, 6);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
