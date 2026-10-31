// case-fingerprint.mjs — which brief a case suggestion (CASES.md) was ranked for.
// rerank-cases.mjs --suggest writes `brief_fingerprint: <hex>` as the last line of CASES.md; Motion
// Studio (studio-api.mjs casesStale) ranks again when the brief no longer matches it.
// The fingerprint covers what the ranking reads: BRIEF.case-query.json, the BRIEF.md body and its
// topic and aspect. Other frontmatter keys are left out, because the pipeline writes them after the
// suggestion (case_search, case_pick, direction, style_profile…) and the cases stay valid.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const CASES_FILE = "CASES.md";
export const QUERY_FILE = "BRIEF.case-query.json";
const LINE = /^brief_fingerprint:\s*([0-9a-f]+)\s*$/m;

const read = (f) => (existsSync(f) ? readFileSync(f, "utf8") : "");

export function briefFingerprint(dir) {
  const brief = read(join(dir, "BRIEF.md")).replace(/\r\n/g, "\n");
  const m = brief.match(/^---\n([\s\S]*?)\n---\n?/);
  const fm = m ? m[1] : "";
  const key = (k) => (fm.match(new RegExp(`^${k}:\\s*(.*)$`, "m")) || [])[1]?.trim() ?? "";
  const body = (m ? brief.slice(m[0].length) : brief).trim();
  const parts = [read(join(dir, QUERY_FILE)).trim(), key("topic"), key("aspect"), body];
  return createHash("sha256").update(parts.join("\n\u0000\n")).digest("hex").slice(0, 16);
}

export const fingerprintLine = (dir) => `brief_fingerprint: ${briefFingerprint(dir)}`;

// True when CASES.md exists and was ranked for another brief. A CASES.md without the line (older
// plugin) is not stale: there is nothing to compare, and ranking again costs a Jev call.
export function casesStale(dir) {
  const t = read(join(dir, CASES_FILE));
  const m = t.match(LINE);
  return Boolean(m && m[1] !== briefFingerprint(dir));
}
