// rerank-composite.mjs — round-2 "composite" scoring for rerank-cases.mjs (optional, TypeSafe/Jev).
// Design (TypeSafe docs: composite scoring, speculative fan-out, jaggedness):
//   * Static per-case features come from the one-time cache data/case-features.jsonl
//     (scripts/case-features.mjs): aspect, genre, subject, richness, ui/data/footage/voiceover/characters.
//   * Per brief: 1 request classifies the normalised brief with the SAME genre/subject options
//     plus "wants_*" Nouls, then two atomic Scores per candidate (kind-of-video fit, topic fit).
//   * Everything is combined in code with tunable WEIGHTS; aspect ratio is a code rule
//     (Jev is literal and weak at "does 16:9 suit a 9:16 brief"; most cases never state it).
//   * Optional pairwise tournament on the top N (Choice A/B, both orders) to fix ranks 1–5.
import { MODEL, post, runPool, addUsage } from "./jev-client.mjs";
import { GENRES, SUBJECTS, NOULS } from "./case-features.mjs";

export const GENRE_FIT = [
  "Different kind of video with a different purpose (e.g. a game or art experiment vs. an advert or explainer).",
  "Different kind of video, but it shares a production technique the brief needs.",
  "Same broad family as the brief (e.g. both promotional, or both educational) but a clearly different format.",
  "Same kind of video with the same purpose as the brief; its structure could be adapted.",
  "Same kind of video, purpose and format as the brief; a near-template for its structure and pacing.",
];
export const TOPIC_FIT = [
  "Unrelated subject.",
  "Distant subject; only a loose thematic link.",
  "Adjacent subject or industry (e.g. a different consumer product, a different app, a related field).",
  "Same industry or domain as the brief.",
  "Same specific topic as the brief.",
];

export const STYLE_FIT = [
  "Different visual style and production technique from what the brief asks for.",
  "Shares only a generic technique with the brief (e.g. both are animated motion graphics).",
  "Partly similar: one of the visual techniques the brief asks for, or a related style.",
  "Same main visual style or technique as the brief asks for (e.g. kinetic typography, charts and maps, UI with cursor, pixel art, paper-cut illustration, real-footage edit, 3D walk-through).",
  "Same visual style and techniques as the brief; its look could be reused directly.",
];
const DIMS = {
  g: { q: "Is `candidate_case` the same kind of video as the brief asks for (format, genre and purpose)? Ignore its subject or industry.", c: GENRE_FIT },
  t: { q: "How close is the subject / industry of `candidate_case` to the subject of the brief? Ignore the kind of video.", c: TOPIC_FIT },
  s: { q: "Does `candidate_case` use the visual style and production technique the brief asks for (see the brief's key visuals)? Ignore its subject.", c: STYLE_FIT },
};
export const DEFAULT_DIMS = ["g", "t", "s"];

// Weights for the composite (sum of the positive weights = 1). Tuned only on briefs B1–B8.
export const WEIGHTS = { genre: 0.35, topic: 0.20, style: 0.15, richness: 0.12, aspect: 0.08, wants: 0.05, prior: 0.05 };
// Aspect rule in code: value in [-1, 1] by (brief aspect, case aspect).
export const ASPECT_FIT = {
  "9:16": { vertical: 1, multiple: 1, square: 0.3, not_stated: 0, horizontal: -1 },
  "16:9": { horizontal: 0.5, multiple: 0.5, not_stated: 0, square: -0.3, vertical: -1 },
  both: { multiple: 1, vertical: 0.6, horizontal: 0.3, square: 0, not_stated: 0 },
};
// Best style_fit (0–4) among the shown results below this → "weak style fit" note. Note only:
// ranking is unchanged (conservative). 2 = "partly similar" on the STYLE_FIT scale.
export const WEAK_STYLE = 2;
export const NO_MATCH = { final: 0.50 }; // best composite below this → "weak matches" note (round 2: flagged 3 of the 4 briefs I judged weakest, 1 false alarm)
const SNIPPET = 500;
export const CHUNK = 100; // questions per request

// Deterministic aspect from a brief (structured field wins; else regex on the text).
export function briefAspect(brief) {
  if (brief && typeof brief === "object" && brief.aspect) return normAspect(brief.aspect);
  const t = typeof brief === "string" ? brief : JSON.stringify(brief || "");
  const v = /9\s*[:x×]\s*16|vertical|dọc|tiktok|reels?\b|shorts\b/i.test(t);
  const h = /16\s*[:x×]\s*9|horizontal|ngang|youtube(?!\s*shorts)/i.test(t);
  return v && h ? "both" : v ? "9:16" : h ? "16:9" : null;
}
export function normAspect(a) {
  const s = String(a).toLowerCase();
  if (/both|cả hai|multi/.test(s) || (/9\s*:\s*16/.test(s) && /16\s*:\s*9/.test(s))) return "both";
  if (/9\s*:\s*16|vertical|dọc/.test(s)) return "9:16";
  if (/16\s*:\s*9|horizontal|ngang/.test(s)) return "16:9";
  return null;
}

const BRIEF = "The state is a brief for a short video we need to produce.";
export function briefQuestions() {
  const q = {
    genre: { type: "choice", instructions: `${BRIEF} What kind of video does the brief ask for?`, criteria: GENRES },
    subject: { type: "choice", instructions: `${BRIEF} What real-world subject or industry is the video about?`, criteria: SUBJECTS },
  };
  for (const [k, v] of Object.entries(NOULS)) q[`wants_${k}`] = { type: "noul", instructions: `${BRIEF} The requested video must have this element: ${v}` };
  return q;
}

export function labelsOf(f) {
  return f ? { kind_of_video: GENRES[f.genre], subject: SUBJECTS[f.subject], aspect: f.aspect } : undefined;
}

export function compositeRequest(briefState, chunk, features, dims = DEFAULT_DIMS) {
  const questions = {};
  chunk.forEach((r, i) => {
    const candidate_case = {
      title: r.title || "(untitled)",
      english_labels: labelsOf(features?.get(r.id)),
      prompt: r.prompt.length > SNIPPET ? r.prompt.slice(0, SNIPPET) + "…" : r.prompt,
    };
    for (const d of dims) questions[`${d}${i}`] = { type: "score", instructions: { candidate_case, question: `The state is a brief for a video we need to produce. \`candidate_case\` is an existing short video. ${DIMS[d].q}` }, criteria: DIMS[d].c };
  });
  return { state: briefState, model: MODEL, questions };
}

// Probability overlap of two Choice distributions (0..1).
export const overlap = (p, q) => (p && q ? Object.keys(p).reduce((s, k) => s + p[k] * (q[k] || 0), 0) : 0);

// Code-only prior from cached features (no per-case Jev call): used for the "lite" shortlist and as a small term.
export function priorOf(f, cls, aspect) {
  if (!f) return 0;
  const g = overlap(cls?.genre_p, f.genre_p), s = overlap(cls?.subject_p, f.subject_p);
  const a = aspect ? ASPECT_FIT[aspect][f.aspect] ?? 0 : 0;
  return 0.45 * g + 0.25 * s + 0.2 * (f.richness / 4) + 0.1 * a + 0.1 * wantsOf(f, cls);
}
export function wantsOf(f, cls) {
  if (!f || !cls?.wants) return 0;
  const keys = Object.keys(NOULS).filter((k) => (cls.wants[k] ?? 0) >= 0.5);
  if (!keys.length) return 0;
  return keys.reduce((s, k) => s + (f[k] ?? 0), 0) / keys.length;
}

export function combine({ candidates, features, fits, cls, aspect, weights = WEIGHTS }) {
  return candidates.map((r, i) => {
    const f = features?.get(r.id);
    const g = fits[i]?.g ?? 0, t = fits[i]?.t ?? 0, st = fits[i]?.s ?? 0;
    const asp = aspect && f ? ASPECT_FIT[aspect][f.aspect] ?? 0 : 0;
    const parts = {
      genre: g / 4, topic: t / 4, style: st / 4, richness: (f?.richness ?? 0) / 4, aspect: asp,
      wants: wantsOf(f, cls), prior: f && cls ? overlap(cls.genre_p, f.genre_p) : 0,
    };
    const final = Object.entries(weights).reduce((s, [k, w]) => s + w * (parts[k] ?? 0), 0);
    return { r, i, g, t, s: st, f, parts, final };
  });
}

export async function classifyBrief(briefState, { apiKey, fetchImpl }) {
  const data = await post({ state: briefState, model: MODEL, questions: briefQuestions() }, { apiKey, fetchImpl });
  const a = data?.answers || {};
  if (!a.genre?.probabilities || !a.subject?.probabilities) throw new Error("malformed answers");
  return {
    genre: a.genre.choice, genre_p: a.genre.probabilities, subject: a.subject.choice, subject_p: a.subject.probabilities,
    wants: Object.fromEntries(Object.keys(NOULS).map((k) => [k, a[`wants_${k}`]?.noul ?? 0])),
    usage: data.usage,
  };
}

export async function scoreFits(briefState, candidates, features, { apiKey, fetchImpl, concurrency = 8, dims = DEFAULT_DIMS }) {
  const per = Math.floor(CHUNK / dims.length);
  const chunks = [];
  for (let i = 0; i < candidates.length; i += per) chunks.push(candidates.slice(i, i + per));
  const parts = await runPool(chunks.map((chunk) => async () => {
    const data = await post(compositeRequest(briefState, chunk, features, dims), { apiKey, fetchImpl });
    const a = data?.answers || {};
    const fits = chunk.map((_, i) => Object.fromEntries(dims.map((d) => [d, a[`${d}${i}`]?.score])));
    if (!fits.every((x) => dims.every((d) => typeof x[d] === "number"))) throw new Error("malformed answers");
    return { fits, usage: data.usage, model: data.model };
  }), concurrency);
  return { fits: parts.flatMap((p) => p.fits), usage: parts.reduce((u, p) => addUsage(u, p.usage), {}), calls: chunks.length, model: parts[0]?.model };
}

// Pairwise tournament on `top` (array of scored items): every pair asked in both orders,
// strength = mean P(win). Returns the items re-ordered (ties keep composite order).
export function pairRequest(briefState, items, features) {
  const questions = {};
  const view = (r) => ({ title: r.title || "(untitled)", english_labels: labelsOf(features?.get(r.id)), prompt: r.prompt.length > 400 ? r.prompt.slice(0, 400) + "…" : r.prompt });
  for (let i = 0; i < items.length; i++) for (let j = 0; j < items.length; j++) {
    if (i === j) continue;
    questions[`p${i}_${j}`] = {
      type: "choice",
      instructions: { case_A: view(items[i].r), case_B: view(items[j].r), question: "The state is a brief for a video we need to produce. Which existing video is the more useful reference to copy structure, pacing and visual approach from for this brief?" },
      criteria: { A: "`case_A` is the more useful reference.", B: "`case_B` is the more useful reference." },
    };
  }
  return { state: briefState, model: MODEL, questions };
}
export async function tournament(briefState, items, features, { apiKey, fetchImpl }) {
  const req = pairRequest(briefState, items, features);
  const keys = Object.keys(req.questions);
  const chunks = [];
  for (let i = 0; i < keys.length; i += CHUNK) chunks.push(keys.slice(i, i + CHUNK));
  const parts = await runPool(chunks.map((ks) => async () => {
    const data = await post({ ...req, questions: Object.fromEntries(ks.map((k) => [k, req.questions[k]])) }, { apiKey, fetchImpl });
    return { answers: data.answers || {}, usage: data.usage };
  }), 8);
  const ans = Object.assign({}, ...parts.map((p) => p.answers));
  const n = items.length, win = new Array(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i === j) continue;
    const p = ans[`p${i}_${j}`]?.probabilities;
    if (!p || typeof p.A !== "number") throw new Error("malformed answers");
    win[i] += p.A; win[j] += p.B;
  }
  const strength = win.map((w) => w / (2 * (n - 1)));
  const order = items.map((it, k) => ({ it, k, s: strength[k] })).sort((a, b) => b.s - a.s || a.k - b.k);
  return { items: order.map((o) => ({ ...o.it, pair: +o.s.toFixed(3) })), usage: parts.reduce((u, p) => addUsage(u, p.usage), {}), calls: chunks.length };
}

// "weak style fit" note: none of the shown cases shares the brief's look (best style_fit < WEAK_STYLE).
// Points at the best style match elsewhere in the scored pool when one clears the bar. Null otherwise.
export function weakStyleNote(top, scored = top, threshold = WEAK_STYLE) {
  const has = (x) => typeof x?.s === "number";
  if (!top.length || !top.every(has)) return null;
  const best = Math.max(...top.map((x) => x.s));
  if (best >= threshold) return null;
  const shown = new Set(top.map((x) => x.r.id));
  const alt = scored.filter((x) => has(x) && !shown.has(x.r.id)).sort((a, b) => b.s - a.s)[0];
  const hint = alt && alt.s >= threshold ? ` Best style match outside the top results: ${alt.r.id} (style ${alt.s.toFixed(2)}/4); read it for look only.` : "";
  return `weak style fit (best style ${best.toFixed(2)}/4 < ${threshold}): none of these cases shares the brief's visual style; use them for structure/pacing only and take the look from the brief's key visuals + references/pattern-library.md (thẻ kỹ thuật).${hint}`;
}

// End-to-end composite rerank. Same result shape as rerank() in rerank-cases.mjs.
// Any API failure → keyword-order fallback (all-or-nothing), never throws.
export async function rerankComposite({ brief, candidates, features, limit = 5, apiKey, fetchImpl = globalThis.fetch, aspect, weights = WEIGHTS, shortlist = 0, pair = 0, concurrency = 12 }) {
  const fallback = (error, extra = {}) => ({ results: candidates.slice(0, limit).map((r) => ({ ...r, jev: null })), reranked: false, error, calls: 0, ...extra });
  if (!apiKey) return fallback("no TYPESAFE_API_KEY");
  if (!candidates.length) return fallback("empty pool");
  if (!features?.size) return fallback("no case-features cache");
  aspect = aspect ?? briefAspect(brief);
  const t0 = Date.now();
  let calls = 0, usage = {};
  try {
    const cls = await classifyBrief(brief, { apiKey, fetchImpl }); calls++; usage = addUsage(usage, cls.usage);
    let pool = candidates.map((r, i) => ({ r, i }));
    if (shortlist > 0 && shortlist < pool.length) {
      pool = pool.map((x) => ({ ...x, p: priorOf(features.get(x.r.id), cls, aspect) })).sort((a, b) => b.p - a.p || a.i - b.i).slice(0, shortlist);
    }
    const s = await scoreFits(brief, pool.map((x) => x.r), features, { apiKey, fetchImpl, concurrency });
    calls += s.calls; usage = addUsage(usage, s.usage);
    let scored = combine({ candidates: pool.map((x) => x.r), features, fits: s.fits, cls, aspect, weights })
      .map((x, k) => ({ ...x, i: pool[k].i })).sort((a, b) => b.final - a.final || a.i - b.i);
    if (pair > 1) {
      const t = await tournament(brief, scored.slice(0, pair), features, { apiKey, fetchImpl });
      calls += t.calls; usage = addUsage(usage, t.usage);
      scored = [...t.items, ...scored.slice(pair)];
    }
    const top = scored.slice(0, limit);
    const notes = [];
    if (top.length && top[0].final < NO_MATCH.final) notes.push(`weak matches (best composite ${top[0].final.toFixed(2)} < ${NO_MATCH.final}): the corpus has no close template for this brief; take structure/technique from these cases and the matching section of references/pattern-library.md, not the topic.`);
    const styleNote = weakStyleNote(top, scored);
    if (styleNote) notes.push(styleNote);
    if (aspect === "9:16" && !top.some((x) => ["vertical", "multiple"].includes(x.f?.aspect))) notes.push("no vertical (9:16) case in the top results: plan the 9:16 safe area yourself (pattern-library: 'giữ nội dung trong vùng an toàn 9:16').");
    return {
      results: top.map((x) => ({ ...x.r, jev: {
        final: +x.final.toFixed(3), kind_fit: +x.g.toFixed(2), topic_fit: +x.t.toFixed(2), style_fit: +(x.s ?? 0).toFixed(2),
        richness: x.f?.richness ?? null, aspect: x.f?.aspect ?? null, genre: x.f?.genre ?? null, subject: x.f?.subject ?? null,
        ...(x.pair !== undefined ? { pair: x.pair } : {}), baseline_rank: x.i + 1,
      } })),
      reranked: true, mode: "composite", brief_class: { genre: cls.genre, subject: cls.subject, aspect }, notes, usage, ms: Date.now() - t0, calls, model: s.model,
    };
  } catch (e) {
    return fallback(e?.message?.startsWith("HTTP") || e?.message === "malformed answers" ? e.message : `request failed: ${e?.name || "error"}`, { calls, ms: Date.now() - t0 });
  }
}
