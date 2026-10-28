// lemo-pick.mjs: lemo-opuscar style ranking (Jev mocked, keyword fallback) and the BRIEF.md pick,
// offline, against a fake library laid out like the one `lemo.mjs fetch` checks out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { API_URL } from "../jev-client.mjs";
import { LIBRARY_GLOBS } from "../lemo.mjs";
import { LEVELS, buildRequest, choose, essence, keywordScore, loadLibrary, main, rank, searchLabel, words } from "../lemo-pick.mjs";

const put = (file, text) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); };

const STYLES = {
  watercolor: { en: "Watercolor Brush", category_en: "Hand-drawn & Painting", film: "Follow the Rain", line: "Follow the rain across a painted continent.", uses: ["Nature documentary", "Travel", "Science explainers"] },
  dataviz: { en: "Data Storytelling", category_en: "Information & Keynote", film: "Warming", line: "A century of temperature as charts.", uses: ["Data journalism", "Reports", "Climate & science"] },
  "pixel-rpg": { en: "Pixel RPG", category_en: "Games", film: "Quest", line: "A hero walks a pixel map.", uses: ["Game trailers", "Kids"] },
};

function fakeLibrary() {
  const dir = mkdtempSync(join(tmpdir(), "lemo-lib-"));
  for (const [slug, s] of Object.entries(STYLES)) {
    put(join(dir, "styles", slug, "style.json"), JSON.stringify({ slug, ...s }));
    put(join(dir, "styles", slug, "STYLE.md"), `# ${s.en} — Style Prompt\n\n> One look for ${slug}.\n\n## 1. Essence\n\n- **Paper** and ${slug} marks.\n\n## 2. Materials\n\n- secret-section-two\n`);
  }
  put(join(dir, "styles", "_template", "style.json"), "{}");
  return dir;
}

const lib = fakeLibrary();
test.after(() => rmSync(lib, { recursive: true, force: true }));
const styles = loadLibrary(lib);
const brief = { video_type: "explainer", topic: "monsoon rain and rivers", industry: "science education", tone: "calm", source_material: "not stated" };

// Jev answers in question order; checks the request without ever seeing a real key.
const jev = (scores, seen = {}) => async (url, init) => {
  assert.equal(url, API_URL);
  assert.equal(init.headers.Authorization, "Bearer k");
  const body = JSON.parse(init.body);
  seen.body = body;
  return { ok: true, status: 200, json: async () => ({
    model: "jev-test", usage: { input_tokens: 10, output_tokens: 1 },
    answers: Object.fromEntries(Object.keys(body.questions).map((k, i) => [k, { type: "score", score: scores[i], confidence: 0.8 }])),
  }) };
};

test("fetch checks out every style's style.json and STYLE.md", () => {
  assert.deepEqual(LIBRARY_GLOBS, ["styles/*/style.json", "styles/*/STYLE.md"]);
});

test("loadLibrary: one row per style, skips _template, marks the catalog's canvas styles as layer", () => {
  assert.deepEqual(styles.map((s) => s.slug), ["dataviz", "pixel-rpg", "watercolor"]);
  const w = styles.find((s) => s.slug === "watercolor");
  assert.equal(w.how, "layer");
  assert.equal(w.ten_vi, "Thuỷ màu tự vẽ");
  assert.equal(styles.find((s) => s.slug === "dataviz").how, "grammar");
  assert.match(w.essence, /One look for watercolor/);
  assert.ok(!w.essence.includes("secret-section-two"), "only the opening and section 1");
  assert.deepEqual(loadLibrary(join(lib, "missing")), []);
});

test("words and keywordScore: plural folded, stop words dropped, uses weigh most", () => {
  assert.deepEqual(words("Rivers, the explainers; glass not stated Mưa"), ["river", "explainer", "glass", "mua"]);
  const w = keywordScore(brief, styles.find((s) => s.slug === "watercolor"));
  assert.ok(w.hits.includes("rain") && w.hits.includes("science"), w.hits.join());
  assert.equal(keywordScore(brief, styles.find((s) => s.slug === "pixel-rpg")).score, 0);
  assert.equal(essence("# T\n\n> *Tag* line\n\n## 1. Essence\n\n- **a**\n\n## 2. X\n- b\n"), "Tag line a");
});

test("buildRequest: one Score per style with its uses and look, brief as state", () => {
  const req = buildRequest(brief, styles);
  assert.equal(req.state, JSON.stringify(brief));
  assert.deepEqual(Object.keys(req.questions), ["s0", "s1", "s2"]);
  assert.equal(req.questions.s2.type, "score");
  assert.deepEqual(req.questions.s2.criteria, LEVELS);
  assert.match(req.questions.s2.instructions.candidate_style.typical_uses, /Nature documentary/);
});

test("rank with Jev: sorted by score, reasons name the score and the build path", async () => {
  const seen = {};
  const out = await rank({ brief, styles, limit: 2, apiKey: "k", fetchImpl: jev([3.6, 0.4, 3.1], seen) });
  assert.equal(out.reranked, true);
  assert.equal(searchLabel(out), "jev");
  assert.deepEqual(out.results.map((r) => r.slug), ["dataviz", "watercolor"]);
  assert.deepEqual(out.results[0].jev, { score: 3.6, confidence: 0.8 });
  assert.match(out.results[0].why, /Jev chấm 3\.6\/4 \(rất hợp\)/);
  assert.match(out.results[0].why, /theo ngữ pháp STYLE\.md/);
  assert.match(out.results[1].why, /lớp canvas \(lemo\.mjs add\)/);
  assert.ok(!JSON.stringify(seen.body).includes("Bearer"), "the key stays in the header");
});

test("rank: equal Jev scores fall back to keyword hits", async () => {
  const out = await rank({ brief, styles, limit: 3, apiKey: "k", fetchImpl: jev([2, 2, 2]) });
  assert.equal(out.results[0].slug, "watercolor");
  assert.equal(out.results[2].slug, "pixel-rpg");
});

test("rank falls back to keyword order: no key, HTTP error, network error, malformed answers", async () => {
  const cases = [
    [{ apiKey: "", fetchImpl: () => assert.fail("must not call") }, "no TYPESAFE_API_KEY"],
    [{ apiKey: "k", fetchImpl: async () => ({ ok: false, status: 401 }) }, "HTTP 401"],
    [{ apiKey: "k", fetchImpl: async () => { throw new DOMException("t", "TimeoutError"); } }, "request failed: TimeoutError"],
    [{ apiKey: "k", fetchImpl: async () => ({ ok: true, json: async () => ({ answers: { s0: {} } }) }) }, "malformed answers"],
  ];
  for (const [opts, error] of cases) {
    const out = await rank({ brief, styles, limit: 2, ...opts });
    assert.equal(out.reranked, false);
    assert.equal(out.error, error);
    assert.equal(searchLabel(out), `keyword (${error})`);
    assert.equal(out.results[0].slug, "watercolor");
    assert.equal(out.results[0].jev, null);
    assert.deepEqual(out.notes, []);
  }
});

test("rank: no shared word and no Jev → weak matches note", async () => {
  const out = await rank({ brief: { topic: "quarterly tax filing" }, styles, apiKey: "" });
  assert.deepEqual(out.notes, ["weak matches"]);
});

const run = async (args, opts = {}) => {
  const buf = { out: "", err: "" };
  const code = await main(args, { out: (s) => { buf.out += s; }, err: (s) => { buf.err += s; }, env: { TYPESAFE_API_KEY: "" }, keyFile: join(lib, "no.env"), ...opts });
  return { code, ...buf };
};

test("main rank: --json, --stats, the warning when a key was set but Jev failed", async () => {
  let r = await run(["rank", "--brief-json", JSON.stringify(brief), "--library", lib, "--json", "--stats"]);
  assert.equal(r.code, 0, r.err);
  assert.equal(JSON.parse(r.out)[0].slug, "watercolor");
  assert.match(r.err, /"lemo_search":"keyword \(no TYPESAFE_API_KEY\)"/);
  assert.ok(!r.err.includes("Jev unavailable"), "no key stays silent");

  r = await run(["rank", "--brief-json", JSON.stringify(brief), "--library", lib, "--limit", "1"], { env: { TYPESAFE_API_KEY: "sk-secret-123" }, fetchImpl: async () => ({ ok: false, status: 401 }) });
  assert.equal(r.code, 0);
  assert.match(r.err, /lemo-pick: Jev unavailable \(HTTP 401\); showing keyword order/);
  assert.ok(!(r.out + r.err).includes("sk-secret-123"));
  assert.equal((r.out.match(/^### /gm) || []).length, 1);
  assert.match(r.out, /^### watercolor · Watercolor Brush \(Thuỷ màu tự vẽ\) · Hand-drawn & Painting · lớp canvas$/m);
  assert.match(r.out, /^lý do: /m);

  r = await run(["rank", "--brief-json", JSON.stringify(brief), "--library", lib], { env: { TYPESAFE_API_KEY: "k" }, fetchImpl: jev([1, 0, 3]) });
  assert.match(r.out, /^### watercolor .* · jev 3\/4$/m);
});

test("main: usage errors exit 2, a missing library exits 4", async () => {
  assert.equal((await run(["rank", "--library", lib])).code, 2);
  assert.equal((await run(["rank", "--brief-json", "{bad", "--library", lib])).code, 2);
  assert.equal((await run(["rank", "--brief", "x", "--bogus", "1"])).code, 2);
  assert.equal((await run(["nope"])).code, 2);
  const r = await run(["rank", "--brief", "rain", "--library", join(lib, "missing")]);
  assert.equal(r.code, 4);
  assert.match(r.err, /lemo\.mjs fetch/);
});

test("choose: grammar style → lemo_ref, layer style → lemo_style; credits once", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lemo-pick-proj-"));
  try {
    writeFileSync(join(dir, "BRIEF.md"), "---\naspect: 16:9\nlemo_style: watercolor\n---\n\n# Brief\n");
    let r = choose({ project: dir, style: "dataviz", search: "jev", library: lib });
    assert.equal(r.code, 0, r.msg);
    let b = readFileSync(join(dir, "BRIEF.md"), "utf8");
    assert.match(b, /^lemo_ref: dataviz$/m);
    assert.match(b, /^lemo_search: jev$/m);
    assert.ok(!/^lemo_style:/m.test(b), "lemo_style only names canvas-layer styles");
    assert.match(r.msg, /WARN BRIEF\.md bỏ lemo_style: watercolor/);
    assert.match(r.msg, /dataviz\/STYLE\.md/);

    r = choose({ project: dir, style: "watercolor", library: lib });
    assert.equal(r.code, 0, r.msg);
    b = readFileSync(join(dir, "BRIEF.md"), "utf8");
    assert.match(b, /^lemo_style: watercolor$/m);
    assert.match(b, /^lemo_search: chọn tay$/m);
    assert.ok(!/^lemo_ref:/m.test(b));
    assert.match(r.msg, /lemo\.mjs add --project .* --style watercolor/);

    choose({ project: dir, style: "watercolor", library: lib });
    const credits = readFileSync(join(dir, "assets", "CREDITS.md"), "utf8");
    assert.equal(credits.split("\n").filter((l) => l.includes('"watercolor" theo lemo-opuscar')).length, 1);
    assert.match(credits, /LemoLab: mã MIT, phim mẫu CC BY 4\.0/);
    assert.ok(!credits.includes("\n\n"), "one list line per style");

    assert.equal(choose({ project: dir, style: "nope", library: lib }).code, 2);
    assert.equal(choose({ project: join(dir, "none"), style: "dataviz", library: lib }).code, 2);
    // Without the library a canvas style from the catalog can still be recorded; others cannot.
    assert.equal(choose({ project: dir, style: "glass-product", library: join(lib, "missing") }).code, 0);
    assert.equal(choose({ project: dir, style: "dataviz", library: join(lib, "missing") }).code, 4);
    assert.ok(existsSync(join(dir, "assets", "CREDITS.md")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
