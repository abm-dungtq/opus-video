// jev-audit.mjs — optional Jev (TypeSafe) audit of Vietnamese voice lines, used by
// `check-viet-pro.mjs --jev-audit`. One request per line, one noul (probability) question per
// pattern. Advisory only: results are WARN lines and never change the gate's pass/fail.
// A pattern may become a FAIL only after the eval set (data/jev-audit-eval.jsonl, scored by
// scripts/jev-audit-eval.mjs) shows precision ≥ 0.9 for it — that decision is made by a person.

import { MODEL, post, runPool, addUsage } from "./jev-client.mjs";

const LINE = "The state is one spoken line from a Vietnamese video voice-over script.";
export const PATTERNS = {
  significance: `${LINE} Does it inflate significance, legacy or importance (e.g. "đánh dấu bước ngoặt", "mang tính lịch sử") without concrete support?`,
  promo: `${LINE} Does it use promotional, advert-like adjectives (e.g. "tuyệt vời", "đỉnh cao", "vượt trội", "hoàn hảo") instead of concrete facts?`,
  vague_attr: `${LINE} Does it attribute a claim to vague, unnamed authorities (e.g. "các chuyên gia cho rằng", "nhiều người nói")?`,
  ing_tail: `${LINE} Does it end with a tacked-on padding clause that restates or inflates the point (e.g. ", góp phần…", ", giúp…", ", mở ra…")?`,
  long_intro: `${LINE} Does it open with long generic scene-setting before the point (e.g. "Trong thời đại công nghệ phát triển như hiện nay")?`,
  bait: `${LINE} Is it engagement bait (e.g. "đừng lướt qua", "xem đến cuối", "99% người không biết", "sự thật gây sốc", "like và share")?`,
  invented_firsthand: `${LINE} Does the speaker claim a personal first-hand experience or result (e.g. "mình đã dùng 3 tháng", "tôi thử rồi")?`,
  unsourced_number: `${LINE} Does it state a statistic, percentage or measured number without naming its source?`,
};

export function buildAuditRequest(line) {
  return {
    state: line,
    model: MODEL,
    questions: Object.fromEntries(Object.entries(PATTERNS).map(([k, v]) => [k, { type: "noul", instructions: v }])),
  };
}

// → { warnings: [{ line, pattern, p }], usage, error }. Never throws.
export async function audit(lines, { apiKey, fetchImpl = globalThis.fetch, threshold = 0.7, concurrency = 4, timeoutMs = 30000 } = {}) {
  const warnings = [];
  let usage = { input_tokens: 0, output_tokens: 0 };
  if (!apiKey) return { warnings, usage, error: "no TYPESAFE_API_KEY" };
  const results = new Array(lines.length);
  try {
    await runPool(lines.map((text, i) => async () => {
      const data = await post(buildAuditRequest(text), { apiKey, fetchImpl, timeoutMs });
      results[i] = data;
      usage = addUsage(usage, data?.usage);
    }), concurrency);
  } catch (e) {
    collect();
    return { warnings, usage, error: e?.message?.startsWith("HTTP") ? e.message : `request failed: ${e?.name || "error"}` };
  }
  collect();
  return { warnings, usage, error: null };

  function collect() {
    results.forEach((data, i) => {
      for (const k of Object.keys(PATTERNS)) {
        const p = data?.answers?.[k]?.noul;
        if (typeof p === "number" && p >= threshold) warnings.push({ line: i, pattern: k, p });
      }
    });
  }
}
