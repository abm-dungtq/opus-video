import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditF1, hitAt, recallAt, main, measure, postId, statusOf, table } from "../jev-eval.mjs";

// Jev giả: mọi câu score trả 4 khi phần instructions chứa GOLD, còn lại 1; noul trả 0.1.
const jev = (calls = { n: 0 }) => async (url, init) => {
  calls.n++;
  const body = JSON.parse(init.body);
  const answers = {};
  for (const [k, q] of Object.entries(body.questions)) {
    answers[k] = q.type === "noul" ? { noul: 0.1 } : { score: JSON.stringify(q.instructions).includes("GOLD") ? 4 : 1, confidence: 0.9 };
  }
  return { ok: true, status: 200, json: async () => ({ answers, usage: { input_tokens: 1000, output_tokens: 0 }, model: "jev-test" }) };
};
const down = async () => ({ ok: false, status: 500 });

const kase = (n, gold = false) => ({ id: `c:${n}`, url: `https://x.com/a/status/${n}`, title: gold ? "GOLD case" : `case ${n}`, category: "motion", tags: [], has_full_prompt: true, prompt_len: 100, prompt: "p".repeat(100) });
const style = (slug, gold = false) => ({ slug, name: gold ? `GOLD ${slug}` : slug, group: "g", uses: [], film: "", line: "", essence: "", how: "grammar", guide: "" });

// Pool: case đúng nằm ở vị trí 7, nên thứ tự find-cases trượt top 5 còn Jev kéo nó lên.
const pool = [1, 2, 3, 4, 5, 6].map((n) => kase(n)).concat([kase(7, true)]);
const sets = {
  audit: [{ text: "a", labels: [] }, { text: "b", labels: ["bait"] }],
  rerank: [{ key: "r1", brief: { video_type: "promo", aspect: "16:9" }, relevant_posts: ["7"] }],
  lemo: [{ key: "l1", brief: { video_type: "explainer" }, good: ["b", "d"] }],
  styles: [style("a"), style("b", true), style("c"), style("d")],
  lemoDir: "/nowhere",
};

test("postId lấy id bài X từ url; hitAt đếm brief có nhãn đúng trong k đầu", () => {
  assert.equal(postId("https://x.com/u/status/123?s=1"), "123");
  assert.equal(postId(undefined), null);
  const g = new Set(["x"]);
  assert.equal(hitAt([{ ranked: ["a", "x"], good: g }, { ranked: ["a", "b", "x"], good: g }], 2), 0.5);
  assert.equal(hitAt([], 3), null);
  // recall@k: 1 trong 2 nhãn đúng ở top 3 → 0.5; 3 nhãn đúng mà top 3 có 2 → 2/3.
  assert.equal(recallAt([{ ranked: ["a", "x", "b"], good: new Set(["x", "y"]) }], 3), 0.5);
  assert.equal(recallAt([{ ranked: ["x", "y", "b"], good: new Set(["x", "y", "z", "w"]) }], 3), 2 / 3);
});

test("auditF1 gộp theo cặp (dòng, mẫu)", () => {
  const rows = [{ labels: ["bait"] }, { labels: [] }];
  assert.equal(auditF1(rows, [{ line: 0, pattern: "bait" }]), 1);
  assert.equal(auditF1(rows, [{ line: 1, pattern: "bait" }]), 0);
  assert.equal(auditF1([{ labels: [] }], []), 1);
});

test("statusOf: tụt khi mốc − nay vượt ngưỡng; lỗi, bỏ qua và chưa có mốc", () => {
  assert.equal(statusOf({ now: 0.5 }, { now: 0.6 }), "tụt");
  assert.equal(statusOf({ now: 0.58 }, { now: 0.6 }), "ổn");
  assert.equal(statusOf({ now: 0.7 }, { now: 0.6 }), "tăng");
  assert.equal(statusOf({ now: 0.7 }, null), "chưa có mốc");
  assert.equal(statusOf({ now: null, error: "HTTP 500" }, { now: 0.6 }), "lỗi");
  assert.equal(statusOf({ skipped: true }, { now: 0.6 }), "bỏ qua");
  assert.equal(statusOf({ now: 0.5 }, { now: 0.6 }, 0.2), "ổn");
});

test("measure: Jev kéo case đúng lên top 5; không-Jev giữ thứ tự find-cases", async () => {
  const calls = { n: 0 };
  const r = await measure({ only: ["audit", "rerank-single", "lemo", "suggest"], sets, pools: [pool], features: new Map(), studio: null, apiKey: "k", fetchImpl: jev(calls) });
  const m = r.modules;
  assert.deepEqual([m["rerank-single"].now, m["rerank-single"].no_jev], [1, 0]);
  assert.equal(m["rerank-single"].error, null);
  assert.equal(m.lemo.metric, "recall@3");
  assert.deepEqual([m.lemo.now, m.lemo.no_jev], [0.5, 0.5]); // Jev giả chỉ biết b; từ khoá ra a, b, c
  assert.equal(m.audit.metric, "F1");
  assert.equal(m.audit.now, 0); // mẫu bait có nhãn nhưng Jev giả trả 0.1
  assert.equal(m.suggest.skipped, true);
  assert.ok(m["rerank-single"].usd > 0);
  assert.ok(calls.n > 0);
});

test("measure: Jev hỏng → bộ đo lỗi, now null, vẫn có cột không-Jev", async () => {
  const r = await measure({ only: ["rerank-single", "rerank-composite", "lemo"], sets, pools: [pool], features: new Map([["c:1", {}]]), studio: null, apiKey: "k", fetchImpl: down });
  for (const id of ["rerank-single", "rerank-composite", "lemo"]) {
    assert.equal(r.modules[id].now, null, id);
    assert.match(r.modules[id].error, /1\/1 brief lỗi/, id);
  }
  assert.equal(r.modules["rerank-single"].no_jev, 0);
  assert.equal(statusOf(r.modules.lemo, { now: 1 }), "lỗi");
});

test("measure: thiếu thư viện lemo → lỗi có hướng dẫn fetch", async () => {
  const r = await measure({ only: ["lemo"], sets: { ...sets, styles: [] }, apiKey: "k", fetchImpl: jev() });
  assert.match(r.modules.lemo.error, /lemo.mjs fetch/);
});

test("measure: suggest đọc báo cáo JSON của suggest-eval qua tiến trình con", async () => {
  const exec = (cmd, args, opts, cb) => {
    const out = args[args.indexOf("--out") + 1];
    writeFileSync(out, JSON.stringify({ sets: { gold: { n: 14, det: { hit3: 92.9 }, jev: { n: 14, hit3: 85.7 } } }, cost: { usd: 0.02 } }));
    assert.equal(opts.env.TYPESAFE_API_KEY, "k");
    cb(null);
  };
  const r = await measure({ only: ["suggest"], sets, studio: "/studio", apiKey: "k", exec });
  assert.deepEqual([r.modules.suggest.now, r.modules.suggest.no_jev, r.modules.suggest.usd, r.modules.suggest.error], [0.857, 0.929, 0.02, null]);
  const bad = await measure({ only: ["suggest"], sets, studio: "/studio", apiKey: "k", exec: (c, a, o, cb) => cb(Object.assign(new Error("x"), { code: 3 })) });
  assert.match(bad.modules.suggest.error, /exit 3/);
});

test("table: một dòng mỗi bộ đo với mốc, nay, không-Jev và trạng thái", () => {
  const t = table({ lemo: { metric: "recall@3", n: 20, now: 0.5, no_jev: 0.4 } }, { modules: { lemo: { now: 0.6 } } });
  assert.equal(t.split("\n")[1], "lemo | recall@3 n=20 | 0.60 | 0.50 | 0.40 | tụt");
});

const run = async (argv, extra = {}) => {
  let s = "";
  const code = await main(argv, { out: (x) => { s += x; }, env: {}, keyFile: "/nonexistent/.env", dataDir: mkdtempSync(join(tmpdir(), "jev-eval-")), ...extra });
  return { code, s };
};

test("main: --estimate in chi phí và không gọi Jev; không key → exit 3; vượt trần → exit 2", async () => {
  let called = false;
  const f = async () => { called = true; };
  const e = await run(["--only", "audit", "--estimate"], { fetchImpl: f });
  assert.equal(e.code, 0);
  assert.match(e.s, /chi phí ước tính: audit [\d.]+ · tổng/);
  const k = await run(["--only", "audit"], { fetchImpl: f });
  assert.equal(k.code, 3);
  assert.match(k.s, /no TYPESAFE_API_KEY/);
  const c = await run(["--only", "audit", "--max-usd", "0.000001"], { fetchImpl: f });
  assert.equal(c.code, 2);
  assert.match(c.s, /vượt trần/);
  assert.equal(called, false);
  assert.equal((await run(["--threshold", "x"])).code, 2);
});

test("main: --baseline ghi mốc; lượt sau tụt so với mốc → exit 1; báo cáo JSON có tên theo ngày", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "jev-eval-"));
  const env = { TYPESAFE_API_KEY: "k" };
  const first = await run(["--only", "audit", "--baseline"], { env, dataDir, fetchImpl: jev() });
  assert.equal(first.code, 0);
  const base = JSON.parse(readFileSync(join(dataDir, "baseline.json"), "utf8"));
  assert.equal(base.modules.audit.now, 0);
  assert.ok(!first.s.includes("k\n") && !first.s.includes('"k"'));
  // Mốc cao giả để lượt sau thành "tụt".
  writeFileSync(join(dataDir, "baseline.json"), JSON.stringify({ ...base, modules: { audit: { ...base.modules.audit, now: 0.9 } } }));
  const second = await run(["--only", "audit"], { env, dataDir, fetchImpl: jev() });
  assert.equal(second.code, 1);
  assert.match(second.s, /audit \| F1 n=\d+ \| 0.90 \| 0.00 \| - \| tụt/);
  const reports = readdirSync(join(dataDir, "reports"));
  assert.ok(reports.every((f) => /^jev-eval-\d{8}-\d{6}\.json$/.test(f)));
  // Lỗi Jev → exit 4 và không ghi đè mốc.
  const third = await run(["--only", "audit", "--baseline"], { env, dataDir, fetchImpl: down });
  assert.equal(third.code, 4);
  assert.match(third.s, /không ghi mốc/);
  assert.equal(JSON.parse(readFileSync(join(dataDir, "baseline.json"), "utf8")).modules.audit.now, 0.9);
  assert.ok(existsSync(join(dataDir, "reports")));
});
