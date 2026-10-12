import { test } from "node:test";
import assert from "node:assert/strict";
import { audit, buildAuditRequest, PATTERNS } from "../jev-audit.mjs";

const answer = (over = {}) => async (url, init) => {
  const qs = Object.keys(JSON.parse(init.body).questions);
  return { ok: true, status: 200, json: async () => ({ answers: Object.fromEntries(qs.map((k) => [k, { noul: over[k] ?? 0.1 }])), usage: { input_tokens: 100, output_tokens: 8 } }) };
};

test("request: one line, every pattern as a noul question", () => {
  const r = buildAuditRequest("Xin chào");
  assert.equal(r.state, "Xin chào");
  assert.equal(Object.keys(r.questions).length, 8);
  assert.deepEqual(Object.keys(r.questions), Object.keys(PATTERNS));
  assert.ok(Object.values(r.questions).every((q) => q.type === "noul"));
});

test("low probabilities → no warnings; usage is summed per line", async () => {
  const r = await audit(["a", "b"], { apiKey: "k", fetchImpl: answer() });
  assert.deepEqual(r.warnings, []);
  assert.equal(r.error, null);
  assert.equal(r.usage.input_tokens, 200);
});

test("a pattern at or above the threshold → one warning with line and p", async () => {
  const r = await audit(["Đừng lướt qua nhé"], { apiKey: "k", fetchImpl: answer({ bait: 0.9 }) });
  assert.deepEqual(r.warnings, [{ line: 0, pattern: "bait", p: 0.9 }]);
});

test("HTTP 500 → error string, no throw; no key → error without fetch", async () => {
  const r = await audit(["a"], { apiKey: "k", fetchImpl: async () => ({ ok: false, status: 500 }), timeoutMs: 1000 });
  assert.equal(r.error, "HTTP 500");
  let called = false;
  const n = await audit(["a"], { apiKey: "", fetchImpl: async () => { called = true; } });
  assert.equal(n.error, "no TYPESAFE_API_KEY");
  assert.equal(called, false);
});
