#!/usr/bin/env node
// rerank-cases.mjs — OPTIONAL TypeSafe (Jev) rerank on top of find-cases.mjs.
//   node rerank-cases.mjs --brief-json BRIEF.json | --brief "<English brief>" | --brief-file BRIEF.md
//                         [--mode composite|single] [--aspect 16:9|9:16|both]
//                         [--category c] [--keyword k]... [--tag t] [--full-only] [--include-removed]
//                         [--pool 40|all] [--shortlist N] [--pair N] [--weights '{"style":0.3}']
//                         [--detail-weight 0.5] [--limit 5] [--max-chars 1200] [--json] [--stats]
//   node rerank-cases.mjs --help | -h
// Candidate pool: --pool N (default 40) = find-cases.mjs category+keywords, then category-only,
//   then keywords in any category; --pool all = that 40-case keyword pool PLUS every other case
//   whose prompt is >= 40 chars (928 of the 1003 shown cases; the other 75 are title/caption-only),
//   so ~930 cases are scored per run (≈ 0.04 USD). Cases removed upstream are skipped.
// --mode composite (default when data/case-features.jsonl exists; round-2 pilot winner):
//   1 request classifies the brief (genre/subject Choice + wants_* Nouls), then 3 atomic Scores per
//   candidate (kind-of-video fit, topic fit, visual style/technique fit). Code combines them with the
//   cached per-case features (richness, aspect, ui/data/footage/voiceover) using WEIGHTS in
//   rerank-composite.mjs; aspect ratio is a code rule (vertical cases promoted for 9:16 briefs).
//   --shortlist N: score only the N best cases by the free cached-feature prior (≈1/12 the cost).
//   --pair N: pairwise tournament on the top N (evaluated in round 2; did not help, off by default).
// --mode single (round 1): one "usefulness" Score per candidate + detail-weight × prompt length.
// No TYPESAFE_API_KEY, HTTP error, timeout or bad payload → falls back to the plain find-cases
// order (exit 0). No key → silent. Key present but the call failed → one stderr line
// "rerank-cases: Jev unavailable (<reason>); showing find-cases order", even without --stats.
// --stats prints one JSON line on stderr incl. "case_search": "jev" | "find-cases (<reason>)"
//   (reason: no TYPESAFE_API_KEY | HTTP 401 | request failed: TimeoutError | …) for BRIEF.md.
// Notes ("> note:" lines, composite mode): weak matches · weak style fit · no vertical (9:16) case.
// --suggest [--project .]: the step that SHOWS the user cases at the start of a new video. Reads
//   <project>/BRIEF.case-query.json (unless --brief-json) and its aspect; without that file, the
//   text of BRIEF.md and its frontmatter aspect (Motion Studio runs it this way). Ranks the whole pool
//   (--pool all), drops a second row of the same post (both datasets list some posts), keeps the
//   top --limit (default 3) and prints a Vietnamese block (id, link, one line, "Vì sao") for the
//   agent to paste to the user unchanged. Writes it to <project>/CASES.md and `case_search:` +
//   `case_refs:` into BRIEF.md (not under the Studio director, which may not write BRIEF.md).
//   Unlike the plain mode, a fallback is never silent here: no key, HTTP error or timeout puts a
//   "⚠ Jev không chạy (…)" line at the top of the block and on stderr. Exit 2 with neither file.
// Node built-ins only.
// Brief: pass the agent-normalised ENGLISH brief (see SKILL.md step 3) as JSON:
//   {"video_type","purpose","topic","industry","aspect":"16:9|9:16|both","duration_s","tone",
//    "key_visuals","narration","source_material"} — fill only from the user's brief, never invent.
// Credentials: $TYPESAFE_API_KEY, else ~/.config/opus-video/.env. Never printed.

import { readFileSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { API_URL, MODEL, loadKey, post } from "./jev-client.mjs";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { loadFeatures } from "./case-features.mjs";
import { rerankComposite, WEIGHTS } from "./rerank-composite.mjs";
import { setFrontmatter } from "./make-pitch.mjs";
import { underDirector } from "./director-guard.mjs";

export { API_URL, MODEL, loadKey };
const FIND = fileURLToPath(new URL("./find-cases.mjs", import.meta.url));
const SNIPPET = 700; // chars of each candidate prompt sent to Jev

export const LEVELS = [
  "Irrelevant: a different kind of video (e.g. game, toy demo, art experiment) with a different purpose; nothing transferable to this brief.",
  "Weak: only shares a generic technique or visual style; purpose, audience and topic differ from the brief.",
  "Partial: same broad kind of video as the brief (e.g. both are product ads, or both are explainers) OR same topic, but differs clearly in format, aspect ratio, tone or audience.",
  "Strong: same kind of video and same purpose as the brief; its structure, pacing and scenes could be adapted with modest changes.",
  "Excellent: near-template for the brief: same kind of video, purpose, format/length and tone, with enough prompt detail to copy its structure.",
];

function find(args) {
  try {
    const out = execFileSync("node", [FIND, ...args, "--json", "--max-chars", "100000"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(out);
  } catch { return []; }
}

// Candidate pool, in baseline (keyword) order. Index 0..limit-1 == plain find-cases output.
export function buildPool({ category, keywords = [], tag, fullOnly, includeRemoved, pool = 40 }) {
  if (pool === "all") {
    const base = buildPool({ category, keywords, tag, fullOnly, includeRemoved, pool: 40 });
    const seen = new Set(base.map((r) => r.id));
    const rest = readFileSync(new URL("../data/cases.jsonl", import.meta.url), "utf8")
      .split("\n").filter(Boolean).map((l) => JSON.parse(l))
      .filter((r) => !seen.has(r.id) && r.prompt_len >= 40 && (includeRemoved || !r.upstream_removed))
      .filter((r) => (!tag || r.tags.includes(tag)) && (!fullOnly || r.has_full_prompt));
    return [...base, ...rest];
  }
  pool = Number(pool);
  const common = [...(tag ? ["--tag", tag] : []), ...(fullOnly ? ["--full-only"] : []), ...(includeRemoved ? ["--include-removed"] : [])];
  const kw = keywords.flatMap((k) => ["--keyword", k]);
  const cat = category ? ["--category", category] : [];
  const n = ["--limit", String(pool)];
  const passes = [[...cat, ...kw, ...common, ...n]];
  if (keywords.length) passes.push([...cat, ...common, ...n]); // SKILL.md fallback: category only
  if (keywords.length && category) passes.push([...kw, ...common, ...n]); // keywords, any category
  const seen = new Set();
  const out = [];
  for (const p of passes) {
    for (const r of find(p)) {
      if (out.length >= pool) break;
      if (!seen.has(r.id)) { seen.add(r.id); out.push(r); }
    }
  }
  return out;
}

const clip = (s, n) => (s.length > n ? s.slice(0, n) + "…" : s);
export const CHUNK = 100; // questions per request (~390 tokens each, well under the 64k budget)
// 0..1: how much a case's prompt gives you to copy. Kept in code (Jev is weak at numbers).
export const detailOf = (r) => (r.has_full_prompt ? Math.min(r.prompt_len ?? r.prompt.length, 2000) / 2000 : 0);

export function buildRequest(brief, candidates) {
  const questions = {};
  candidates.forEach((r, i) => {
    questions[`c${i}`] = {
      type: "score",
      instructions: {
        candidate_case: {
          title: r.title || "(untitled)",
          category: r.category,
          tags: r.tags.join(", ") || "-",
          prompt_is_complete: r.has_full_prompt,
          prompt: clip(r.prompt, SNIPPET),
        },
        question:
          "The state is a video brief. `candidate_case` is a short video someone made from the given prompt. " +
          "How useful is `candidate_case` as a reference to copy structure, pacing and visual approach from when producing the video in the brief? " +
          "Judge kind of video, purpose, topic, format/aspect ratio, length and tone. A case whose prompt is not public is less useful.",
      },
      criteria: LEVELS,
    };
  });
  return { state: brief, model: MODEL, questions };
}

// Returns { results, reranked, usage, ms, calls, model, error }
export async function rerank({ brief, candidates, limit = 5, apiKey, fetchImpl = globalThis.fetch, timeoutMs = 30000, detailWeight = 0.5, concurrency = 4 }) {
  const fallback = (error, extra = {}) => ({ results: candidates.slice(0, limit).map((r) => ({ ...r, jev: null })), reranked: false, error, calls: 0, ...extra });
  if (!apiKey) return fallback("no TYPESAFE_API_KEY");
  if (!candidates.length) return fallback("empty pool");
  const t0 = Date.now();
  const chunks = [];
  for (let i = 0; i < candidates.length; i += CHUNK) chunks.push(candidates.slice(i, i + CHUNK));
  const call = async (chunk) => {
    const data = await post(buildRequest(brief, chunk), { apiKey, fetchImpl, timeoutMs });
    const answers = data?.answers || {};
    const scores = chunk.map((_, i) => answers[`c${i}`]);
    if (!scores.every((a) => a && typeof a.score === "number")) throw new Error("malformed answers");
    return { scores, usage: data.usage, model: data.model };
  };
  let parts;
  try {
    parts = new Array(chunks.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, async () => {
      while (next < chunks.length) { const k = next++; parts[k] = await call(chunks[k]); }
    }));
  } catch (e) {
    return fallback(e?.message?.startsWith("HTTP") || e?.message === "malformed answers" ? e.message : `request failed: ${e?.name || "error"}`, { calls: chunks.length, ms: Date.now() - t0 });
  }
  const ms = Date.now() - t0;
  const answers = parts.flatMap((p) => p.scores);
  const usage = parts.reduce((u, p) => ({ input_tokens: u.input_tokens + (p.usage?.input_tokens || 0), output_tokens: u.output_tokens + (p.usage?.output_tokens || 0) }), { input_tokens: 0, output_tokens: 0 });
  const scored = candidates.map((r, i) => ({ r, i, a: answers[i], final: answers[i].score + detailWeight * detailOf(r) }));
  scored.sort((x, y) => y.final - x.final || x.i - y.i);
  return {
    results: scored.slice(0, limit).map(({ r, i, a, final }) => ({ ...r, jev: { score: +a.score.toFixed(2), final: +final.toFixed(2), confidence: a.confidence, baseline_rank: i + 1 } })),
    all: scored.map(({ r, i, a }) => ({ id: r.id, i, score: a.score, detail: detailOf(r) })),
    reranked: true, usage, ms, calls: chunks.length, model: parts[0].model,
  };
}

function parseArgs(argv) {
  const o = { keywords: [], pool: 40, limit: 5, "max-chars": 1200 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    if (["full-only", "json", "stats", "include-removed", "suggest"].includes(k)) o[k] = true;
    else if (k === "keyword") o.keywords.push(String(argv[++i] ?? "").toLowerCase());
    else o[k] = argv[++i];
  }
  return o;
}

function readBrief(o) {
  if (o["brief-json"]) {
    const v = o["brief-json"];
    try { return JSON.parse(existsSync(v) ? readFileSync(v, "utf8") : v); } catch { return null; }
  }
  const t = o["brief-file"] ? readFileSync(o["brief-file"], "utf8") : o.brief || "";
  return t.trim() || null;
}

// One-line value for BRIEF.md `case_search:`.
export const caseSearchLabel = (out) => (out.reranked ? "jev" : `find-cases (${out.error || "fallback"})`);
// Stderr warning when a key WAS configured but Jev could not be used (no key stays silent).
export function fallbackWarning(out, { hasKey, hasBrief }) {
  if (out.reranked || !hasKey || !hasBrief) return null;
  return `rerank-cases: Jev unavailable (${out.error || "unknown error"}); showing find-cases order. Record case_search: ${caseSearchLabel(out)}`;
}

// ---- --suggest: the block shown to the user -----------------------------------------------------

export const SUGGEST_FILE = "CASES.md";
export const QUERY_FILE = "BRIEF.case-query.json";

// Both datasets list some posts (y:… and c:… with one URL): keep the first, best-ranked row.
export function dedupeByUrl(rows) {
  const seen = new Set();
  return rows.filter((r) => { const k = r.url || r.id; if (seen.has(k)) return false; seen.add(k); return true; });
}

const fit = (x) => (x >= 3 ? "khớp" : x >= 2 ? "gần" : "khác");
// One Vietnamese line from Jev's scores (composite: kind/topic/style 0–4; single: usefulness 0–4).
export function whyOf(r) {
  const j = r.jev;
  if (!j) return "khớp từ khoá/category (Jev chưa chấm)";
  if (j.kind_fit !== undefined) {
    return `loại video ${fit(j.kind_fit)} (${j.kind_fit}/4), chủ đề ${fit(j.topic_fit)} (${j.topic_fit}/4), phong cách hình ${fit(j.style_fit)} (${j.style_fit}/4)` +
      (r.has_full_prompt ? ", có prompt đầy đủ để mượn cấu trúc" : ", prompt chỉ có một phần");
  }
  return `Jev chấm độ hữu ích ${j.score}/4` + (r.has_full_prompt ? ", có prompt đầy đủ" : ", prompt chỉ có một phần");
}

const NOTE_VI = [
  [/^weak matches/, "Thư viện không có mẫu sát brief này: chỉ mượn cấu trúc và kỹ thuật, không bám chủ đề."],
  [/^weak style fit/, "Không case nào cùng phong cách hình với brief: mượn cấu trúc và nhịp, phong cách lấy từ brief."],
  [/^no vertical/, "Không có case dọc 9:16 trong top: tự lo vùng an toàn 9:16."],
];
export const noteVi = (n) => (NOTE_VI.find(([re]) => re.test(n))?.[1] ?? n);

const oneLine = (r, n = 140) => clip(String(r.title || r.prompt || "").replace(/\s+/g, " ").trim(), n);

// The markdown block the agent pastes to the user. out = rerank()/rerankComposite() result.
export function suggestBlock(out, { limit = 3 } = {}) {
  const rows = dedupeByUrl(out.results).slice(0, limit);
  const lines = ["## Gợi ý case từ thư viện mẫu Opus 5.5", ""];
  if (!out.reranked) lines.push(`> ⚠ Jev không chạy (${out.error || "không rõ lý do"}): danh sách dưới đây chỉ xếp theo từ khoá (find-cases), chưa phân tích brief.`, "");
  for (const n of out.notes || []) lines.push(`> ${noteVi(n)}`, "");
  rows.forEach((r, i) => {
    lines.push(`${i + 1}. **${r.id}** · @${r.author} · ${r.category}: ${oneLine(r)}`);
    lines.push(`   Vì sao: ${whyOf(r)}.`);
    lines.push(`   ${r.url}`);
  });
  if (!rows.length) lines.push("Không tìm thấy case nào.");
  lines.push("", `case_search: ${caseSearchLabel(out)}`);
  return { text: lines.join("\n") + "\n", ids: rows.map((r) => r.id) };
}

// Writes CASES.md and (outside the Studio director) case_search/case_refs into BRIEF.md.
export function recordSuggestion(dir, block, out, { director = underDirector() } = {}) {
  writeFileSync(join(dir, SUGGEST_FILE), block.text);
  const brief = join(dir, "BRIEF.md");
  if (director || !existsSync(brief)) return { brief: false };
  writeFileSync(brief, setFrontmatter(readFileSync(brief, "utf8"), { case_search: caseSearchLabel(out), case_refs: block.ids.join(", ") || undefined }));
  return { brief: true };
}

async function main() {
  const argv = process.argv.slice(2);
  if (wantsHelp(argv)) { process.stdout.write(helpText(import.meta.url)); process.exit(0); }
  const o = parseArgs(argv);
  const suggest = o.suggest !== undefined;
  const dir = resolve(o.project || ".");
  if (suggest) {
    if (!o["brief-json"] && !o.brief && !o["brief-file"]) {
      const q = join(dir, QUERY_FILE), b = join(dir, "BRIEF.md");
      if (existsSync(q)) o["brief-json"] = q;
      else if (existsSync(b)) {
        o["brief-file"] = b;
        const a = (readFileSync(b, "utf8").match(/^aspect:\s*["']?(16:9|9:16|both)\b/m) || [])[1];
        if (a && !o.aspect) o.aspect = a;
        console.error(`rerank-cases --suggest: no ${QUERY_FILE}, ranking from BRIEF.md (an English ${QUERY_FILE} ranks better, skill ov-cases)`);
      } else { console.error(`rerank-cases --suggest: neither ${q} nor ${b} found; write the brief first (skills ov-brief, ov-cases)`); process.exit(2); }
    }
    o.pool = "all";
    if (o.limit === 5) o.limit = 3;
  }
  const brief = readBrief(o);
  if (suggest && !o.aspect && brief && typeof brief === "object" && ["16:9", "9:16", "both"].includes(brief.aspect)) o.aspect = brief.aspect;
  const limit = suggest ? Number(o.limit) * 3 : Number(o.limit);
  const candidates = buildPool({ category: o.category, keywords: o.keywords, tag: o.tag, fullOnly: o["full-only"], includeRemoved: o["include-removed"], pool: o.pool === "all" ? "all" : Number(o.pool) });
  const detailWeight = o["detail-weight"] === undefined ? 0.5 : Number(o["detail-weight"]);
  const features = loadFeatures();
  const mode = o.mode || (features.size ? "composite" : "single");
  let weights = WEIGHTS;
  if (o.weights) { try { weights = { ...WEIGHTS, ...JSON.parse(o.weights) }; } catch { /* keep defaults */ } }
  const apiKey = loadKey();
  let out;
  if (!brief) out = { results: candidates.slice(0, limit), reranked: false, error: "no --brief", calls: 0 };
  else if (mode === "composite") out = await rerankComposite({ brief, candidates, features, limit, apiKey, aspect: o.aspect, weights, shortlist: Number(o.shortlist || 0), pair: Number(o.pair || 0) });
  else out = await rerank({ brief: typeof brief === "string" ? brief : JSON.stringify(brief), candidates, limit, apiKey, detailWeight });
  const warn = suggest && !out.reranked
    ? `rerank-cases: Jev unavailable (${out.error || "unknown error"}); showing find-cases order`
    : fallbackWarning(out, { hasKey: !!apiKey, hasBrief: !!brief });
  if (warn) console.error(warn);
  if (o.stats) console.error(JSON.stringify({ case_search: caseSearchLabel(out), mode, reranked: out.reranked, error: out.error, pool: candidates.length, calls: out.calls, ms: out.ms, usage: out.usage, model: out.model, brief_class: out.brief_class }));
  const max = Number(o["max-chars"]);
  if (suggest) {
    const block = suggestBlock(out, { limit: Number(o.limit) });
    const rec = recordSuggestion(dir, block, out);
    process.stdout.write(block.text);
    console.error(`rerank-cases: wrote ${SUGGEST_FILE}${rec.brief ? " and case_search/case_refs in BRIEF.md" : ""}; show the block above to the user as is`);
    return;
  }
  if (o.json) {
    console.log(JSON.stringify(out.results.map((r) => ({ ...r, prompt: clip(r.prompt, max) })), null, 2));
    for (const n of out.notes || []) console.error(`note: ${n}`);
  } else {
    for (const n of out.notes || []) console.log(`> note: ${n}\n`);
    for (const r of out.results) {
      const j = !r.jev ? "" : r.jev.kind_fit !== undefined
        ? ` · jev ${r.jev.final} (kind ${r.jev.kind_fit} · topic ${r.jev.topic_fit} · style ${r.jev.style_fit} /4; ${r.jev.genre}, ${r.jev.aspect}, richness ${r.jev.richness})`
        : ` · jev ${r.jev.score}/4 → ${r.jev.final} (keyword rank #${r.jev.baseline_rank})`;
      console.log(`### ${r.id} · @${r.author} · ${r.category} · ${r.tags.join(", ") || "-"}${j}`);
      console.log(r.url);
      console.log(clip(r.prompt, max));
      console.log();
    }
    if (!out.results.length) console.error("no matching cases");
  }
}

// realpath: SKILL.md calls scripts through the ~/.claude/skills symlink, while import.meta.url is the real path.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
