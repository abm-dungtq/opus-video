import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { rerank, buildRequest, buildPool, loadKey, LEVELS, API_URL, caseSearchLabel, fallbackWarning } from "../rerank-cases.mjs";

const script = fileURLToPath(new URL("../rerank-cases.mjs", import.meta.url));
const find = fileURLToPath(new URL("../find-cases.mjs", import.meta.url));
const cands = [
  { id: "a", category: "motion", tags: [], title: "A", prompt: "logo sting", has_full_prompt: true },
  { id: "b", category: "product", tags: ["svg"], title: "B", prompt: "skincare ad", has_full_prompt: true },
  { id: "c", category: "explainer", tags: [], title: "", prompt: "x".repeat(5000), has_full_prompt: false },
];
const ok = (scores) => async (url, init) => {
  assert.equal(url, API_URL);
  assert.match(init.headers.Authorization, /^Bearer /);
  const body = JSON.parse(init.body);
  return { ok: true, status: 200, json: async () => ({
    model: "jev-test",
    usage: { input_tokens: 100, output_tokens: 3 },
    answers: Object.fromEntries(Object.keys(body.questions).map((k, i) => [k, { type: "score", score: scores[i], confidence: 0.9 }])),
  }) };
};

test("request has one Score question per candidate with the 5 levels, prompt clipped", () => {
  const req = buildRequest("brief", cands);
  assert.equal(req.model, "jev-latest");
  assert.deepEqual(Object.keys(req.questions), ["c0", "c1", "c2"]);
  for (const q of Object.values(req.questions)) {
    assert.equal(q.type, "score");
    assert.deepEqual(q.criteria, LEVELS);
  }
  assert.ok(req.questions.c2.instructions.candidate_case.prompt.length < 800);
});

test("sorts by Jev score, keeps baseline rank, one call", async () => {
  const out = await rerank({ brief: "b", candidates: cands, limit: 2, apiKey: "k", fetchImpl: ok([1, 3.5, 2]), detailWeight: 0 });
  assert.equal(out.reranked, true);
  assert.equal(out.calls, 1);
  assert.deepEqual(out.results.map((r) => r.id), ["b", "c"]);
  assert.equal(out.results[0].jev.baseline_rank, 2);
  assert.deepEqual(out.usage, { input_tokens: 100, output_tokens: 3 });
});

test("ties keep keyword order", async () => {
  const out = await rerank({ brief: "b", candidates: cands, limit: 3, apiKey: "k", fetchImpl: ok([2, 2, 2]), detailWeight: 0 });
  assert.deepEqual(out.results.map((r) => r.id), ["a", "b", "c"]);
});

test("falls back silently: no key, HTTP error, network error, malformed", async () => {
  const cases = [
    { apiKey: "", fetchImpl: () => assert.fail("must not call") },
    { apiKey: "k", fetchImpl: async () => ({ ok: false, status: 401 }) },
    { apiKey: "k", fetchImpl: async () => { throw new TypeError("fetch failed"); } },
    { apiKey: "k", fetchImpl: async () => ({ ok: true, json: async () => ({ answers: { c0: {} } }) }) },
  ];
  for (const c of cases) {
    const out = await rerank({ brief: "b", candidates: cands, limit: 2, ...c });
    assert.equal(out.reranked, false);
    assert.deepEqual(out.results.map((r) => r.id), ["a", "b"]);
  }
});

test("loadKey prefers env, then file, never throws on missing file", () => {
  assert.equal(loadKey({ TYPESAFE_API_KEY: "e" }, "/nonexistent"), "e");
  assert.equal(loadKey({}, "/nonexistent"), "");
});

test("pool starts with the exact find-cases order", () => {
  const base = JSON.parse(spawnSync("node", [find, "--category", "product", "--keyword", "promo", "--limit", "5", "--json"], { encoding: "utf8" }).stdout);
  const pool = buildPool({ category: "product", keywords: ["promo"], pool: 30 });
  assert.equal(pool.length, 30);
  assert.equal(new Set(pool.map((r) => r.id)).size, 30);
  assert.ok(base.length > 0);
  assert.deepEqual(pool.slice(0, base.length).map((r) => r.id), base.map((r) => r.id));
});

test("CLI without key prints plain find-cases results (no network)", () => {
  const home = mkdtempSync(join(tmpdir(), "rr-"));
  try {
    const env = { ...process.env, HOME: home, TYPESAFE_API_KEY: "" };
    const r = spawnSync("node", [script, "--brief", "x", "--category", "3d", "--limit", "3", "--json"], { encoding: "utf8", env });
    assert.equal(r.status, 0);
    const base = JSON.parse(spawnSync("node", [find, "--category", "3d", "--limit", "3", "--json"], { encoding: "utf8" }).stdout);
    assert.deepEqual(JSON.parse(r.stdout).map((x) => x.id), base.map((x) => x.id));
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("CLI without key: no warning on stderr; --stats reports case_search find-cases (no TYPESAFE_API_KEY)", () => {
  const home = mkdtempSync(join(tmpdir(), "rr-"));
  try {
    const env = { ...process.env, HOME: home, TYPESAFE_API_KEY: "" };
    const quiet = spawnSync("node", [script, "--brief", "x", "--category", "3d", "--limit", "2"], { encoding: "utf8", env });
    assert.equal(quiet.status, 0);
    assert.equal(quiet.stderr, "");
    const r = spawnSync("node", [script, "--brief", "x", "--category", "3d", "--limit", "2", "--stats"], { encoding: "utf8", env });
    const stats = JSON.parse(r.stderr.trim().split("\n").pop());
    assert.equal(stats.case_search, "find-cases (no TYPESAFE_API_KEY)");
    assert.equal(stats.reranked, false);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("fallback warning: only when a key was configured and the call failed; never leaks the key", async () => {
  const fail401 = await rerank({ brief: "b", candidates: cands, limit: 2, apiKey: "sk-secret-123", fetchImpl: async () => ({ ok: false, status: 401 }) });
  const w = fallbackWarning(fail401, { hasKey: true, hasBrief: true });
  assert.match(w, /^rerank-cases: Jev unavailable \(HTTP 401\); showing find-cases order\. Record case_search: find-cases \(HTTP 401\)$/);
  assert.ok(!w.includes("sk-secret"));
  const timeout = await rerank({ brief: "b", candidates: cands, limit: 2, apiKey: "k", fetchImpl: async () => { throw new DOMException("t", "TimeoutError"); } });
  assert.equal(caseSearchLabel(timeout), "find-cases (request failed: TimeoutError)");
  const noKey = await rerank({ brief: "b", candidates: cands, limit: 2, apiKey: "" });
  assert.equal(fallbackWarning(noKey, { hasKey: false, hasBrief: true }), null);
  assert.equal(fallbackWarning(fail401, { hasKey: true, hasBrief: false }), null);
  const okRun = await rerank({ brief: "b", candidates: cands, limit: 2, apiKey: "k", fetchImpl: ok([1, 2, 3]) });
  assert.equal(fallbackWarning(okRun, { hasKey: true, hasBrief: true }), null);
  assert.equal(caseSearchLabel(okRun), "jev");
});

test("detail bonus lifts a fuller prompt on a near-tie", async () => {
  const c = [
    { id: "short", category: "product", tags: [], title: "", prompt: "promo", has_full_prompt: true, prompt_len: 50 },
    { id: "rich", category: "product", tags: [], title: "", prompt: "p".repeat(2000), has_full_prompt: true, prompt_len: 2000 },
  ];
  const out = await rerank({ brief: "b", candidates: c, limit: 2, apiKey: "k", fetchImpl: ok([2.2, 2.0]), detailWeight: 0.5 });
  assert.deepEqual(out.results.map((r) => r.id), ["rich", "short"]);
});

test("large pools are split into <=100-question requests and merged", async () => {
  const many = Array.from({ length: 230 }, (_, i) => ({ id: `x${i}`, category: "motion", tags: [], title: "", prompt: "p", has_full_prompt: false, prompt_len: 1 }));
  const sizes = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    const n = Object.keys(body.questions).length;
    sizes.push(n);
    return { ok: true, json: async () => ({ usage: { input_tokens: n, output_tokens: 0 },
      answers: Object.fromEntries(Object.keys(body.questions).map((k, i) => [k, { score: n === 30 && i === 29 ? 4 : 1, confidence: 1 }])) }) };
  };
  const out = await rerank({ brief: "b", candidates: many, limit: 1, apiKey: "k", fetchImpl });
  assert.deepEqual(sizes.sort((a, b) => a - b), [30, 100, 100]);
  assert.equal(out.calls, 3);
  assert.equal(out.usage.input_tokens, 230);
  assert.equal(out.results[0].id, "x229");
});

test("one failing chunk falls back to keyword order (all-or-nothing)", async () => {
  const many = Array.from({ length: 150 }, (_, i) => ({ id: `x${i}`, category: "motion", tags: [], title: "", prompt: `p${i}`, has_full_prompt: false, prompt_len: 1 }));
  // The chunk holding the last candidate keeps failing (5xx is retried by jev-client.post, so a
  // one-off 500 would recover); the others succeed.
  const fetchImpl = async (url, init) => (init.body.includes('"p149"') ? { ok: false, status: 500 } : { ok: true, json: async () => ({ answers: Object.fromEntries(Object.keys(JSON.parse(init.body).questions).map((k) => [k, { score: 1 }])) }) });
  const out = await rerank({ brief: "b", candidates: many, limit: 2, apiKey: "k", fetchImpl });
  assert.equal(out.reranked, false);
  assert.deepEqual(out.results.map((r) => r.id), ["x0", "x1"]);
});

test("buildPool hides upstream_removed cases unless includeRemoved", () => {
  const hidden = buildPool({ pool: "all" });
  assert.ok(hidden.length > 0 && hidden.every((r) => !r.upstream_removed));
  assert.ok(buildPool({ pool: "all", includeRemoved: true }).some((r) => r.upstream_removed));
});
