import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  briefAspect, normAspect, compositeRequest, combine, rerankComposite, tournament, priorOf,
  GENRE_FIT, TOPIC_FIT, STYLE_FIT, WEIGHTS, ASPECT_FIT, WEAK_STYLE, weakStyleNote, TOPIC_FLOOR, byComposite,
} from "../rerank-composite.mjs";
import { featureQuestions, parseFeatureAnswers, GENRES, NOULS, loadFeatures } from "../case-features.mjs";
import { post, API_URL } from "../jev-client.mjs";

const cands = [
  { id: "h", category: "product", tags: [], title: "H", prompt: "horizontal promo", has_full_prompt: true },
  { id: "v", category: "product", tags: [], title: "V", prompt: "vertical promo", has_full_prompt: true },
  { id: "n", category: "motion", tags: [], title: "N", prompt: "logo sting", has_full_prompt: false },
];
const feat = (id, aspect, genre, richness = 2) => [id, { id, aspect, genre, genre_p: { [genre]: 1 }, subject: "food_drink", subject_p: { food_drink: 1 }, richness, ui: 0, data: 0, footage: 0, voiceover: 0, characters: 0 }];
const features = new Map([feat("h", "horizontal", "product_promo_ad"), feat("v", "vertical", "product_promo_ad"), feat("n", "not_stated", "brand_motion_intro", 0)]);
const brief = { video_type: "social promo ad", topic: "salted coffee", aspect: "9:16", key_visuals: "big text" };

// Mock API: classify → product_promo_ad; fits from table by candidate title; pair → A wins if A title < B title.
function mockApi(fits, { failOn } = {}) {
  const seen = [];
  const fetchImpl = async (url, init) => {
    assert.equal(url, API_URL);
    const body = JSON.parse(init.body);
    const keys = Object.keys(body.questions);
    seen.push(keys);
    if (failOn && keys.some((k) => failOn.test(k))) return { ok: false, status: 500 };
    const answers = {};
    for (const k of keys) {
      const q = body.questions[k];
      if (k === "genre") answers[k] = { type: "choice", choice: "product_promo_ad", probabilities: { product_promo_ad: 1 }, confidence: 1 };
      else if (k === "subject") answers[k] = { type: "choice", choice: "food_drink", probabilities: { food_drink: 1 }, confidence: 1 };
      else if (k.startsWith("wants_")) answers[k] = { type: "noul", noul: 0.1 };
      else if (/^p\d+_\d+$/.test(k)) { const a = q.instructions.case_A.title, b = q.instructions.case_B.title; answers[k] = { type: "choice", choice: a < b ? "A" : "B", probabilities: a < b ? { A: 0.9, B: 0.1 } : { A: 0.1, B: 0.9 } }; }
      else { const title = q.instructions.candidate_case.title; answers[k] = { type: "score", score: fits[title][k[0]], confidence: 0.8 }; }
    }
    return { ok: true, status: 200, json: async () => ({ model: "jev-test", usage: { input_tokens: 10, output_tokens: 1 }, answers }) };
  };
  return { fetchImpl, seen };
}

test("aspect: structured field wins, text regex otherwise", () => {
  assert.equal(briefAspect({ aspect: "9:16" }), "9:16");
  assert.equal(briefAspect({ aspect: "both" }), "both");
  assert.equal(briefAspect("15s vertical TikTok"), "9:16");
  assert.equal(briefAspect("YouTube 16:9 explainer"), "16:9");
  assert.equal(briefAspect("16:9 for YouTube and 9:16 for Reels"), "both");
  assert.equal(briefAspect("a nice video"), null);
  assert.equal(normAspect("9:16 + 16:9"), "both");
});

test("composite request: kind/topic/style Score per candidate, English labels from the cache", () => {
  const req = compositeRequest(brief, cands, features);
  assert.deepEqual(Object.keys(req.questions), ["g0", "t0", "s0", "g1", "t1", "s1", "g2", "t2", "s2"]);
  assert.deepEqual(req.questions.g0.criteria, GENRE_FIT);
  assert.deepEqual(req.questions.t1.criteria, TOPIC_FIT);
  assert.deepEqual(req.questions.s2.criteria, STYLE_FIT);
  assert.equal(req.questions.g1.instructions.candidate_case.english_labels.aspect, "vertical");
  assert.equal(req.questions.g1.instructions.candidate_case.english_labels.kind_of_video, GENRES.product_promo_ad);
  assert.deepEqual(req.state, brief);
});

test("combine: aspect rule promotes vertical and demotes horizontal for a 9:16 brief", () => {
  const fits = [{ g: 3, t: 3, s: 2 }, { g: 3, t: 3, s: 2 }, { g: 3, t: 3, s: 2 }];
  const out = combine({ candidates: cands, features, fits, cls: null, aspect: "9:16" });
  const by = Object.fromEntries(out.map((x) => [x.r.id, x.final]));
  assert.ok(by.v > by.n && by.n > by.h);
  assert.ok(Math.abs(by.v - by.h - WEIGHTS.aspect * (ASPECT_FIT["9:16"].vertical - ASPECT_FIT["9:16"].horizontal)) < 1e-9);
});

test("rerankComposite: classify + one fan-out, sorted by composite, vertical wins a tie", async () => {
  const { fetchImpl, seen } = mockApi({ H: { g: 3, t: 3, s: 2 }, V: { g: 3, t: 3, s: 2 }, N: { g: 0, t: 0, s: 0 } });
  const out = await rerankComposite({ brief, candidates: cands, features, limit: 3, apiKey: "k", fetchImpl });
  assert.equal(out.reranked, true);
  assert.equal(out.calls, 2);
  assert.equal(seen[0].includes("genre"), true);
  assert.deepEqual(out.results.map((r) => r.id), ["v", "h", "n"]);
  assert.equal(out.results[0].jev.aspect, "vertical");
  assert.equal(out.results[0].jev.baseline_rank, 2);
  assert.equal(out.brief_class.aspect, "9:16");
  assert.deepEqual(out.usage, { input_tokens: 20, output_tokens: 2 });
});

test("topic floor: an off-topic case with the best kind and style cannot lead topic-matching cases", async () => {
  // The shape seen live on a phin-coffee brief: a "what is Claude Code" collage explainer (kind 4,
  // style 4, topic 0.21) outscored two coffee cases (topic 3.39 and 3.01) on the composite alone.
  const fits = { N: { g: 4, t: 0.21, s: 4 }, H: { g: 2, t: 3.39, s: 1 }, V: { g: 2, t: 3.01, s: 1 } };
  const rich = new Map([...features].map(([k, v]) => [k, { ...v, aspect: "multiple", richness: k === "n" ? 4 : 1 }]));
  const raw = combine({ candidates: cands, features: rich, fits: cands.map((c) => fits[c.title]), cls: null, aspect: "16:9" });
  assert.ok(raw.find((x) => x.r.id === "n").final > Math.max(...raw.filter((x) => x.r.id !== "n").map((x) => x.final)), "the composite alone puts the off-topic case first");
  const out = await rerankComposite({ brief: { ...brief, aspect: "16:9" }, candidates: cands, features: rich, limit: 3, apiKey: "k", fetchImpl: mockApi(fits).fetchImpl });
  assert.deepEqual(out.results.map((r) => r.id), ["h", "v", "n"]);
  // No topic match in the pool: the composite order stands.
  const none = byComposite([{ i: 0, t: 0.2, final: 0.9 }, { i: 1, t: 1.5, final: 0.5 }]);
  assert.deepEqual(none.map((x) => x.i), [0, 1]);
  // A case at or above the floor keeps its composite place.
  const kept = byComposite([{ i: 0, t: TOPIC_FLOOR.off, final: 0.9 }, { i: 1, t: 3, final: 0.5 }]);
  assert.deepEqual(kept.map((x) => x.i), [0, 1]);
});

test("weak-match and no-vertical notes", async () => {
  const f2 = new Map([...features].map(([k, v]) => [k, { ...v, aspect: "not_stated" }]));
  const { fetchImpl } = mockApi({ H: { g: 1, t: 0, s: 0 }, V: { g: 1, t: 0, s: 0 }, N: { g: 0, t: 0, s: 0 } });
  const out = await rerankComposite({ brief, candidates: cands, features: f2, limit: 2, apiKey: "k", fetchImpl });
  assert.equal(out.notes.length, 3);
  assert.match(out.notes[0], /weak matches/);
  assert.match(out.notes[1], /^weak style fit \(best style 0\.00\/4 < 2\)/);
  assert.match(out.notes[1], /pattern-library/);
  assert.match(out.notes[2], /9:16/);
});

test("weak style fit: note only below the threshold, ranking unchanged, hints a better-styled case", async () => {
  // style 2 on the shown cases = at threshold -> no note
  const atBar = await rerankComposite({ brief, candidates: cands, features, limit: 3, apiKey: "k", fetchImpl: mockApi({ H: { g: 3, t: 3, s: 2 }, V: { g: 3, t: 3, s: 2 }, N: { g: 0, t: 0, s: 0 } }).fetchImpl });
  assert.ok(!atBar.notes.some((n) => /weak style/.test(n)));
  // top 2 have style 1; the third (not shown, limit 2) has style 4 -> note + hint naming it
  const low = { H: { g: 4, t: 4, s: 1 }, V: { g: 4, t: 4, s: 1 }, N: { g: 0, t: 0, s: 4 } };
  const out = await rerankComposite({ brief, candidates: cands, features, limit: 2, apiKey: "k", fetchImpl: mockApi(low).fetchImpl });
  const note = out.notes.find((n) => /^weak style fit/.test(n));
  assert.ok(note, "expected a weak style fit note");
  assert.match(note, /Best style match outside the top results: n \(style 4\.00\/4\)/);
  // note only: the composite order is untouched (n has the best style but stays out of the top 2)
  assert.deepEqual(out.results.map((r) => r.id), ["v", "h"]);
  assert.ok(out.results.every((r) => r.jev.style_fit < WEAK_STYLE));
});

test("weakStyleNote: null when style was not scored or results are empty", () => {
  assert.equal(weakStyleNote([]), null);
  assert.equal(weakStyleNote([{ r: { id: "a" }, s: undefined }]), null);
  assert.equal(weakStyleNote([{ r: { id: "a" }, s: 2.5 }]), null);
  assert.match(weakStyleNote([{ r: { id: "a" }, s: 1.2 }]), /best style 1\.20\/4/);
});

test("falls back to keyword order: no key, no cache, HTTP error, malformed", async () => {
  const good = mockApi({ H: { g: 0, t: 0, s: 0 }, V: { g: 4, t: 4, s: 4 }, N: { g: 0, t: 0, s: 0 } }).fetchImpl;
  const cases = [
    { apiKey: "", fetchImpl: () => assert.fail("must not call") },
    { apiKey: "k", features: new Map(), fetchImpl: () => assert.fail("must not call") },
    { apiKey: "k", fetchImpl: mockApi({}, { failOn: /^g/ }).fetchImpl },
    { apiKey: "k", fetchImpl: async (u, i) => { const r = await good(u, i); const d = await r.json(); for (const k of Object.keys(d.answers)) if (k.startsWith("t")) delete d.answers[k]; return { ...r, json: async () => d }; } },
  ];
  for (const c of cases) {
    const out = await rerankComposite({ brief, candidates: cands, features, limit: 2, ...c });
    assert.equal(out.reranked, false, String(out.error));
    assert.deepEqual(out.results.map((r) => r.id), ["h", "v"]);
  }
});

test("shortlist scores only the N best by the cached-feature prior", async () => {
  const { fetchImpl, seen } = mockApi({ H: { g: 3, t: 3, s: 2 }, V: { g: 3, t: 3, s: 2 }, N: { g: 4, t: 4, s: 4 } });
  const out = await rerankComposite({ brief, candidates: cands, features, limit: 3, apiKey: "k", fetchImpl, shortlist: 2 });
  assert.equal(seen[1].length, 6); // 2 candidates × 3 dims
  assert.deepEqual(out.results.map((r) => r.id), ["v", "h"]);
  assert.ok(priorOf(features.get("v"), { genre_p: { product_promo_ad: 1 } }, "9:16") > priorOf(features.get("n"), { genre_p: { product_promo_ad: 1 } }, "9:16"));
});

test("pairwise tournament asks both orders and re-orders by mean win probability", async () => {
  const { fetchImpl, seen } = mockApi({});
  const items = ["C", "A", "B"].map((t, i) => ({ r: { id: t, title: t, prompt: t }, i }));
  const out = await tournament(brief, items, features, { apiKey: "k", fetchImpl });
  assert.equal(seen[0].length, 6);
  assert.deepEqual(out.items.map((x) => x.r.id), ["A", "B", "C"]);
});

test("case-features: question set and strict answer parsing", () => {
  const q = featureQuestions();
  assert.deepEqual(Object.keys(q), ["aspect", "genre", "subject", "richness", ...Object.keys(NOULS)]);
  const a = { aspect: { choice: "vertical", probabilities: { vertical: 0.9, not_stated: 0.1 } }, genre: { choice: "music_video", probabilities: { music_video: 1 } }, subject: { choice: "abstract", probabilities: { abstract: 1 } }, richness: { score: 2.345 }, ...Object.fromEntries(Object.keys(NOULS).map((k) => [k, { noul: 0.5 }])) };
  const f = parseFeatureAnswers("x", "h", a);
  assert.equal(f.aspect, "vertical");
  assert.equal(f.richness, 2.35);
  assert.throws(() => parseFeatureAnswers("x", "h", { ...a, ui: {} }), /malformed/);
});

test("bundled cache covers every case in the corpus", () => {
  const ids = spawnSync("node", ["-e", "const fs=require('fs');process.stdout.write(JSON.stringify(fs.readFileSync(process.argv[1],'utf8').split('\\n').filter(Boolean).map(l=>JSON.parse(l).id)))", fileURLToPath(new URL("../../data/cases.jsonl", import.meta.url))], { encoding: "utf8" });
  const f = loadFeatures();
  for (const id of JSON.parse(ids.stdout)) assert.ok(f.has(id), id);
});

test("jev-client post retries 429 then succeeds", async () => {
  let n = 0;
  const out = await post({ x: 1 }, { apiKey: "k", fetchImpl: async () => (++n < 2 ? { ok: false, status: 429 } : { ok: true, status: 200, json: async () => ({ ok: n }) }) });
  assert.deepEqual(out, { ok: 2 });
});
