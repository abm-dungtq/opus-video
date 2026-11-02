#!/usr/bin/env node
// jev-eval.mjs — đo chất lượng model Jev (jev-latest) ở mọi chỗ gọi Jev của opus-video, cộng gợi ý
// hướng của Motion Studio, so với mốc đã lưu. Một lệnh, người dùng tự chạy; không tự đổi model.
//   node jev-eval.mjs [--only audit,rerank-single,rerank-composite,lemo,suggest] [--threshold <số>]
//                     [--max-usd 0.5] [--baseline] [--estimate] [--studio <dir>] [--library <dir>]
//   node jev-eval.mjs --help | -h
// Năm bộ đo (bộ vàng do người dùng duyệt nằm trong data/jev-eval/):
//   audit             jev-audit.mjs trên data/jev-audit-eval.jsonl: F1 gộp theo (dòng, mẫu). Không có
//                     đường không-Jev.
//   rerank-single     rerank-cases.mjs --mode single trên data/jev-eval/rerank-gold.jsonl: hit@5 = tỉ lệ
//                     brief có ít nhất một case đúng trong 5 case đầu. Không-Jev = thứ tự find-cases.
//   rerank-composite  như trên với --mode composite (cùng bộ vàng, cùng pool 40 case).
//   lemo              lemo-pick.mjs rank trên data/jev-eval/lemo-gold.jsonl: recall@3 = trung bình số phong
//                     cách đúng trong 3 gợi ý đầu chia min(3, số phong cách đúng). (hit@3 bão hoà: cả từ khoá
//                     lẫn Jev đều trúng mọi brief.) Không-Jev = thứ tự từ khoá.
//   suggest           scripts/suggest-eval.mjs của Motion Studio (--studio, else $MOTION_STUDIO_HOME,
//                     else /Volumes/2/Motion-Studio): hit@3 tập gold (0–1); không-Jev = phía tất định.
//                     Không thấy Studio → "bỏ qua".
// Trước khi gọi Jev: in chi phí ước tính từng bộ (số ký tự request / 4, × 1,2; suggest lấy từ mốc,
// không có mốc thì 0,05 USD) và dừng nếu tổng vượt --max-usd (mặc định 0,5). --estimate chỉ in ước tính.
// Bảng kết quả: bộ đo | chỉ số | mốc | nay | không-Jev | trạng thái (ổn · tụt · tăng · chưa có mốc · lỗi ·
// bỏ qua). "tụt" khi mốc − nay vượt ngưỡng của bộ đo: mặc định max(0,03; 1/n), để một mục đổi kết quả
// không thành tụt; --threshold đặt một ngưỡng chung. Báo cáo JSON ghi vào
// data/jev-eval/reports/jev-eval-<YYYYMMDD-HHMMSS>.json (không commit). --baseline ghi
// data/jev-eval/baseline.json từ lượt này, chỉ khi mọi bộ đo chạy trọn.
// Không tự ghim model, không tự chuyển phương án: kết quả để người dùng quyết.
// Exit: 0 không tụt · 1 có bộ đo tụt · 2 sai đối số hoặc ước tính vượt --max-usd · 3 không có
// TYPESAFE_API_KEY · 4 có bộ đo lỗi (Jev hỏng giữa chừng, thiếu thư viện lemo…).
// Node built-ins only. Credentials: $TYPESAFE_API_KEY, else ~/.config/opus-video/.env. Never printed.

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync, rmSync } from "node:fs";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MODEL, PRICE_PER_M_INPUT, costOf, loadKey, runPool } from "./jev-client.mjs";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { audit, buildAuditRequest, PATTERNS } from "./jev-audit.mjs";
import { buildPool, buildRequest as singleRequest, rerank } from "./rerank-cases.mjs";
import { compositeRequest, rerankComposite } from "./rerank-composite.mjs";
import { loadFeatures } from "./case-features.mjs";
import { buildRequest as lemoRequest, libraryDir, loadLibrary, rank } from "./lemo-pick.mjs";

const DATA = (p) => fileURLToPath(new URL(`../data/${p}`, import.meta.url));
export const MODULES = ["audit", "rerank-single", "rerank-composite", "lemo", "suggest"];
export const THRESHOLD = 0.03;
export const MAX_USD = 0.5;
export const TARGET_MS = 10 * 60 * 1000;
const SUGGEST_USD = 0.05; // suggest-eval ước tính khi chưa có mốc
const DEFAULT_STUDIO = "/Volumes/2/Motion-Studio";

const jsonl = (file) => readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
export const postId = (url) => (String(url ?? "").match(/status\/(\d+)/) || [])[1] ?? null;
const r3 = (x) => (x === null || x === undefined ? null : Math.round(x * 1000) / 1000);

// Tỉ lệ dòng có ít nhất một nhãn đúng trong k mục đầu.
export function hitAt(rows, k) {
  if (!rows.length) return null;
  return rows.filter(({ ranked, good }) => ranked.slice(0, k).some((x) => good.has(x))).length / rows.length;
}

// Trung bình số nhãn đúng trong k mục đầu, chia min(k, số nhãn đúng).
export function recallAt(rows, k) {
  if (!rows.length) return null;
  return rows.reduce((t, { ranked, good }) => t + ranked.slice(0, k).filter((x) => good.has(x)).length / Math.min(k, good.size), 0) / rows.length;
}

// F1 gộp trên mọi cặp (dòng, mẫu) của jev-audit.
export function auditF1(rows, warnings) {
  const got = new Set(warnings.map((w) => `${w.line}:${w.pattern}`));
  let tp = 0, fp = 0, fn = 0;
  rows.forEach((r, i) => {
    for (const k of Object.keys(PATTERNS)) {
      const want = r.labels.includes(k), hit = got.has(`${i}:${k}`);
      if (want && hit) tp++; else if (hit) fp++; else if (want) fn++;
    }
  });
  return tp + fp + fn ? (2 * tp) / (2 * tp + fp + fn) : 1;
}

// Ngưỡng của một bộ đo: --threshold nếu có, không thì max(0,03; 1/n), vì với n mục một mục đổi kết quả
// đã lệch 1/n (16 brief → 0,0625).
export function thresholdOf(m, base, threshold = null) {
  if (threshold !== null && threshold !== undefined) return threshold;
  const n = m?.n ?? base?.n;
  return n > 0 ? Math.max(THRESHOLD, 1 / n) : THRESHOLD;
}

// suggest-eval ghi hit3 theo % với một chữ số thập phân, nên điểm lệch tới 0,001 do làm tròn.
const ROUNDING = 0.001;

// Trạng thái một bộ đo so với mốc.
export function statusOf(m, base, threshold = null) {
  if (m.skipped) return "bỏ qua";
  if (m.error) return "lỗi";
  if (!base || typeof base.now !== "number") return "chưa có mốc";
  const d = m.now - base.now;
  const t = thresholdOf(m, base, threshold) + ROUNDING;
  if (d < -t) return "tụt";
  if (d > t) return "tăng";
  return "ổn";
}

const tokensOf = (body) => JSON.stringify(body).length / 4;

export function loadSets({ library } = {}) {
  const lemoDir = libraryDir(library ? { library } : {});
  return {
    audit: jsonl(DATA("jev-audit-eval.jsonl")),
    rerank: jsonl(DATA("jev-eval/rerank-gold.jsonl")),
    lemo: jsonl(DATA("jev-eval/lemo-gold.jsonl")),
    styles: loadLibrary(lemoDir),
    lemoDir,
  };
}

// Pool 40 case của mỗi brief rerank, tính một lần cho cả hai chế độ.
export const poolsOf = (rerankRows, build = buildPool) =>
  rerankRows.map((g) => build({ category: g.category, keywords: g.keywords ?? [], pool: 40 }));

// Chi phí ước tính (USD) từng bộ đo, trước khi gọi Jev.
export function estimate({ sets, pools, features, baseline, only = MODULES }) {
  const usd = (tok) => Math.round((tok * 1.2 / 1e6) * PRICE_PER_M_INPUT * 1e6) / 1e6;
  const est = {};
  if (only.includes("audit")) est.audit = usd(sets.audit.reduce((t, r) => t + tokensOf(buildAuditRequest(r.text)), 0));
  if (only.includes("rerank-single")) est["rerank-single"] = usd(sets.rerank.reduce((t, g, i) => t + tokensOf(singleRequest(JSON.stringify(g.brief), pools[i])), 0));
  if (only.includes("rerank-composite")) est["rerank-composite"] = usd(sets.rerank.reduce((t, g, i) => t + tokensOf(compositeRequest(g.brief, pools[i], features)) + 2000, 0));
  if (only.includes("lemo")) est.lemo = usd(sets.styles.length ? sets.lemo.reduce((t, g) => t + tokensOf(lemoRequest(g.brief, sets.styles)), 0) : 0);
  if (only.includes("suggest")) est.suggest = baseline?.modules?.suggest?.usd ?? SUGGEST_USD;
  return est;
}

async function measureAudit({ sets, apiKey, fetchImpl }) {
  const res = await audit(sets.audit.map((r) => r.text), { apiKey, fetchImpl });
  return { metric: "F1", n: sets.audit.length, now: auditF1(sets.audit, res.warnings), no_jev: null, usage: res.usage, error: res.error || null };
}

async function measureRerank(mode, { sets, pools, features, apiKey, fetchImpl }) {
  const one = async (g, i) => {
    const candidates = pools[i];
    const out = mode === "composite"
      ? await rerankComposite({ brief: g.brief, candidates, features, limit: 5, apiKey, fetchImpl, aspect: g.brief.aspect })
      : await rerank({ brief: JSON.stringify(g.brief), candidates, limit: 5, apiKey, fetchImpl });
    const good = new Set(g.relevant_posts);
    return { key: g.key, good, ranked: out.results.map((r) => postId(r.url)), base: candidates.map((r) => postId(r.url)), usage: out.usage, error: out.reranked ? null : out.error };
  };
  const rows = await runPool(sets.rerank.map((g, i) => () => one(g, i)), 4);
  const failed = rows.filter((r) => r.error);
  return {
    metric: "hit@5", n: rows.length,
    now: failed.length ? null : hitAt(rows, 5),
    no_jev: hitAt(rows.map((r) => ({ ranked: r.base, good: r.good })), 5),
    usage: rows.reduce((u, r) => ({ input_tokens: u.input_tokens + (r.usage?.input_tokens || 0) }), { input_tokens: 0 }),
    error: failed.length ? `${failed.length}/${rows.length} brief lỗi (${failed[0].error})` : null,
    items: rows.map((r) => ({ key: r.key, top: r.ranked.slice(0, 5), hit: r.ranked.slice(0, 5).some((x) => r.good.has(x)) })),
  };
}

async function measureLemo({ sets, apiKey, fetchImpl }) {
  if (!sets.styles.length) return { metric: "recall@3", n: sets.lemo.length, now: null, no_jev: null, error: `thiếu thư viện lemo-opuscar ở ${sets.lemoDir} (chạy node lemo.mjs fetch)` };
  const rows = await runPool(sets.lemo.map((g) => async () => {
    const [jev, kw] = [await rank({ brief: g.brief, styles: sets.styles, limit: 3, apiKey, fetchImpl }), await rank({ brief: g.brief, styles: sets.styles, limit: 3, apiKey: "" })];
    return { key: g.key, good: new Set(g.good), ranked: jev.results.map((r) => r.slug), kw: kw.results.map((r) => r.slug), usage: jev.usage, error: jev.reranked ? null : jev.error };
  }), 4);
  const failed = rows.filter((r) => r.error);
  return {
    metric: "recall@3", n: rows.length,
    now: failed.length ? null : recallAt(rows, 3),
    no_jev: recallAt(rows.map((r) => ({ ranked: r.kw, good: r.good })), 3),
    usage: rows.reduce((u, r) => ({ input_tokens: u.input_tokens + (r.usage?.input_tokens || 0) }), { input_tokens: 0 }),
    error: failed.length ? `${failed.length}/${rows.length} brief lỗi (${failed[0].error})` : null,
    items: rows.map((r) => ({ key: r.key, top: r.ranked, hit: r.ranked.some((x) => r.good.has(x)) })),
  };
}

// suggest-eval ghi hit@k theo phần trăm (0–100).
const frac = (p) => (typeof p === "number" ? Math.round(p * 10) / 1000 : null);

// Chạy suggest-eval của Studio như một tiến trình con; đọc báo cáo JSON nó ghi.
export function studioDir(o = {}, env = process.env) {
  const dir = o.studio || env.MOTION_STUDIO_HOME || DEFAULT_STUDIO;
  return existsSync(join(dir, "scripts", "suggest-eval.mjs")) ? dir : null;
}

function measureSuggest({ studio, apiKey, exec = execFile }) {
  if (!studio) return Promise.resolve({ metric: "hit@3", skipped: true, now: null, no_jev: null, error: null, note: "không thấy Motion Studio" });
  const out = join(tmpdir(), `jev-eval-suggest-${process.pid}-${Date.now()}.json`);
  return new Promise((resolve) => {
    exec("node", [join(studio, "scripts", "suggest-eval.mjs"), "--out", out], { cwd: studio, env: { ...process.env, TYPESAFE_API_KEY: apiKey }, timeout: TARGET_MS }, (err) => {
      let r = null;
      try { r = JSON.parse(readFileSync(out, "utf8")); } catch { /* no report */ }
      rmSync(out, { force: true });
      const gold = r?.sets?.gold;
      if (!gold) return resolve({ metric: "hit@3", now: null, no_jev: null, error: `suggest-eval không trả báo cáo (exit ${err?.code ?? "?"})` });
      resolve({
        metric: "hit@3", n: gold.n, now: frac(gold.jev?.hit3), no_jev: frac(gold.det?.hit3), usd: r.cost?.usd ?? null,
        error: err ? `suggest-eval exit ${err.code}` : gold.jev?.n < gold.n ? `Jev trả lời ${gold.jev.n}/${gold.n}` : null,
      });
    });
  });
}

// Đo các bộ được chọn. Trả { modules: { id: {...} }, ms }.
export async function measure({ only = MODULES, sets, pools, features, studio, apiKey, fetchImpl = globalThis.fetch, exec }) {
  const t0 = Date.now();
  const modules = {};
  const run = {
    audit: () => measureAudit({ sets, apiKey, fetchImpl }),
    "rerank-single": () => measureRerank("single", { sets, pools, features, apiKey, fetchImpl }),
    "rerank-composite": () => measureRerank("composite", { sets, pools, features, apiKey, fetchImpl }),
    lemo: () => measureLemo({ sets, apiKey, fetchImpl }),
    suggest: () => measureSuggest({ studio, apiKey, exec }),
  };
  await Promise.all(only.map(async (id) => {
    const s = Date.now();
    let m;
    try { m = await run[id](); } catch (e) { m = { now: null, no_jev: null, error: `lỗi ngoài dự kiến: ${e?.message ?? e}` }; }
    if (m.usage && m.usd === undefined) m.usd = r3(costOf(m.usage) * 1000) / 1000;
    modules[id] = { ...m, ms: Date.now() - s };
  }));
  return { modules, ms: Date.now() - t0 };
}

const pct = (x) => (typeof x === "number" ? x.toFixed(2) : "-");

export function table(modules, baseline, threshold = null) {
  const lines = ["bộ đo | chỉ số | mốc | nay | không-Jev | trạng thái"];
  for (const id of MODULES) {
    const m = modules[id];
    if (!m) continue;
    const st = statusOf(m, baseline?.modules?.[id], threshold);
    const why = m.error ? ` (${m.error})` : m.note ? ` (${m.note})` : "";
    lines.push(`${id} | ${m.metric ?? "-"}${m.n ? ` n=${m.n}` : ""} | ${pct(baseline?.modules?.[id]?.now)} | ${pct(m.now)} | ${pct(m.no_jev)} | ${st}${why}`);
  }
  return lines.join("\n");
}

function parseArgs(argv) {
  const o = { only: MODULES, threshold: null, maxUsd: MAX_USD, baseline: false, estimate: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === "--baseline") o.baseline = true;
    else if (a === "--estimate") o.estimate = true;
    else if (a === "--only") { o.only = String(v ?? "").split(",").filter(Boolean); i++; }
    else if (a === "--threshold") { o.threshold = Number(v); i++; }
    else if (a === "--max-usd") { o.maxUsd = Number(v); i++; }
    else if (a === "--studio") { o.studio = v; i++; }
    else if (a === "--library") { o.library = v; i++; }
    else throw new Error(`không hiểu đối số ${a}`);
  }
  if (!o.only.length || o.only.some((m) => !MODULES.includes(m))) throw new Error(`--only nhận: ${MODULES.join(",")}`);
  if (!(o.threshold === null || o.threshold >= 0) || !(o.maxUsd > 0)) throw new Error("--threshold và --max-usd cần một số dương");
  return o;
}

const stamp = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

export async function main(argv = process.argv.slice(2), { out = (s) => process.stdout.write(s), env = process.env, fetchImpl = globalThis.fetch, keyFile, exec, dataDir = DATA("jev-eval") } = {}) {
  if (wantsHelp(argv)) { out(helpText(import.meta.url)); return 0; }
  let o;
  try { o = parseArgs(argv); } catch (e) { out(`jev-eval: ${e.message}\n`); return 2; }
  const apiKey = keyFile === undefined ? loadKey(env) : loadKey(env, keyFile);
  const baseFile = join(dataDir, "baseline.json");
  const baseline = existsSync(baseFile) ? JSON.parse(readFileSync(baseFile, "utf8")) : null;
  const sets = loadSets(o);
  const needPools = o.only.some((m) => m.startsWith("rerank"));
  const pools = needPools ? poolsOf(sets.rerank) : [];
  const features = loadFeatures();
  const studio = o.only.includes("suggest") ? studioDir(o, env) : null;

  const est = estimate({ sets, pools, features, baseline, only: o.only });
  const total = Object.values(est).reduce((a, b) => a + b, 0);
  out(`chi phí ước tính: ${Object.entries(est).map(([k, v]) => `${k} ${v.toFixed(4)}`).join(" · ")} · tổng ${total.toFixed(4)} USD (trần ${o.maxUsd})\n`);
  if (o.estimate) return 0;
  if (total > o.maxUsd) { out(`jev-eval: ước tính ${total.toFixed(4)} USD vượt trần ${o.maxUsd} USD; không gọi Jev (đổi --only hoặc --max-usd)\n`); return 2; }
  if (!apiKey) { out("no TYPESAFE_API_KEY\n"); return 3; }

  const res = await measure({ only: o.only, sets, pools, features, studio, apiKey, fetchImpl, exec });
  const usd = Object.values(res.modules).reduce((a, m) => a + (m.usd || 0), 0);
  out(`model ${MODEL} · ${table(res.modules, baseline, o.threshold).split("\n").length - 1} bộ đo · ${(res.ms / 1000).toFixed(0)} s · ${usd.toFixed(4)} USD\n`);
  out(table(res.modules, baseline, o.threshold) + "\n");
  if (res.ms > TARGET_MS) out(`cảnh báo: lượt đo mất ${(res.ms / 60000).toFixed(1)} phút, quá mục tiêu 10 phút\n`);

  const statuses = Object.fromEntries(Object.entries(res.modules).map(([id, m]) => [id, statusOf(m, baseline?.modules?.[id], o.threshold)]));
  const thresholds = Object.fromEntries(Object.entries(res.modules).map(([id, m]) => [id, r3(thresholdOf(m, baseline?.modules?.[id], o.threshold))]));
  const report = { at: new Date().toISOString(), model: MODEL, thresholds, ms: res.ms, usd: r3(usd * 1000) / 1000, estimate_usd: est, baseline_at: baseline?.at ?? null, statuses, modules: res.modules };
  mkdirSync(join(dataDir, "reports"), { recursive: true });
  const file = join(dataDir, "reports", `jev-eval-${stamp()}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
  out(`báo cáo: ${file}\n`);

  const errored = Object.values(statuses).includes("lỗi");
  if (o.baseline) {
    if (errored) out("không ghi mốc: có bộ đo lỗi\n");
    else {
      const modules = Object.fromEntries(Object.entries(res.modules).filter(([, m]) => !m.skipped).map(([id, m]) => [id, { metric: m.metric, n: m.n, now: m.now, no_jev: m.no_jev, usd: m.usd ?? null }]));
      writeFileSync(baseFile, JSON.stringify({ at: report.at, model: MODEL, modules: { ...(baseline?.modules ?? {}), ...modules } }, null, 2) + "\n");
      out(`đã ghi mốc: ${baseFile}\n`);
    }
  }
  if (Object.values(statuses).includes("tụt")) return 1;
  return errored ? 4 : 0;
}

// realpath: SKILL.md calls scripts through the ~/.claude/skills symlink, while import.meta.url is the real path.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().then((code) => { process.exitCode = code; }, (e) => { console.error(`jev-eval: ${e?.stack ?? e}`); process.exitCode = 1; });
}
