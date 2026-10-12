// jev-client.mjs — tiny shared TypeSafe (Jev) client for the optional rerank tooling.
// Node built-ins only. The key is read from $TYPESAFE_API_KEY, else ~/.config/opus-video/.env,
// and is never printed.
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const API_URL = "https://api.typesafe.ai/v1/systemone";
export const MODEL = "jev-latest";
export const PRICE_PER_M_INPUT = 0.042; // USD per 1M input tokens (docs); output tokens are free
const ENV_FILE = join(homedir(), ".config", "opus-video", ".env");

export function loadKey(env = process.env, file = ENV_FILE) {
  if (env.TYPESAFE_API_KEY) return env.TYPESAFE_API_KEY;
  if (!existsSync(file)) return "";
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*TYPESAFE_API_KEY\s*=\s*(.*?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  return "";
}

// One POST with retries on 429/529/5xx. Throws Error("HTTP nnn") or the fetch error.
export async function post(body, { apiKey, fetchImpl = globalThis.fetch, timeoutMs = 30000, retries = 2 } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetchImpl(API_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      if (attempt < retries && e?.name !== "AbortError" && e?.name !== "TimeoutError") { await sleep(500 * 2 ** attempt); continue; }
      throw e;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) { await sleep(500 * 2 ** attempt); continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Run async jobs with a concurrency cap, preserving order. Rejects on first failure.
export async function runPool(jobs, concurrency = 8) {
  const out = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (next < jobs.length) { const k = next++; out[k] = await jobs[k](); }
  }));
  return out;
}

export const addUsage = (a, b) => ({ input_tokens: (a?.input_tokens || 0) + (b?.input_tokens || 0), output_tokens: (a?.output_tokens || 0) + (b?.output_tokens || 0) });
export const costOf = (u) => ((u?.input_tokens || 0) / 1e6) * PRICE_PER_M_INPUT;
