import { test } from "node:test";
import assert from "node:assert/strict";
import { ping } from "../jev-client.mjs";

test("ping: no key → skipped, without calling fetch", async () => {
  let called = false;
  assert.equal(await ping({ apiKey: "", fetchImpl: async () => { called = true; } }), "skipped");
  assert.equal(called, false);
});

test("ping: answers → reachable; sends one noul question", async () => {
  let body;
  const fetchImpl = async (url, init) => { body = JSON.parse(init.body); return { ok: true, status: 200, json: async () => ({ answers: { q: { noul: 0.9 } } }) }; };
  assert.equal(await ping({ apiKey: "k", fetchImpl }), "reachable");
  assert.equal(body.questions.q.type, "noul");
});

test("ping: HTTP 500 or a thrown fetch → unreachable (no retry)", async () => {
  let n = 0;
  assert.equal(await ping({ apiKey: "k", fetchImpl: async () => { n++; return { ok: false, status: 500 }; } }), "unreachable");
  assert.equal(n, 1);
  assert.equal(await ping({ apiKey: "k", fetchImpl: async () => { throw new TypeError("fetch failed"); } }), "unreachable");
});
