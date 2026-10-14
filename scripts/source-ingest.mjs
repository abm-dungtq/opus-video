#!/usr/bin/env node
// source-ingest.mjs — fetch the source text behind a script (article URL, PDF file, arXiv id) into
// <project>/sources/ and index it in SOURCES.md, so the viet-pro fact check
// (viet-pro/references/review/fact-check.md) has the original wording to check every number against.
// No AI summary: the agent reads sources/<slug>.txt and writes the key points itself.
//   node source-ingest.mjs --project <dir> <url|file.pdf|arxiv:<id>>... [--max-candidates 8] [--json]
//   node source-ingest.mjs --help | -h
// Per source: <dir>/sources/<slug>.txt (slug from the title, ASCII kebab-case, ≤60 chars, "-2" on a
//   clash) and a "## <title>" entry in <dir>/SOURCES.md with URL/File, Ngày đăng (blank if unknown),
//   Truy cập, Văn bản and "Câu ứng viên" — sentences of 40–300 chars holding a digit or a quote mark,
//   in source order. They are candidates to re-read, not key points. The same URL/File replaces its
//   old entry instead of adding a new one.
// URLs: User-Agent opus-video-ingest/1.0, 30 s timeout, redirects followed; a PDF content-type is
//   handled like a PDF file. PDF text comes from `pdftotext -layout` (poppler).
// Exit: 0 every source ingested · 1 some source failed (the others are still written) ·
//   2 bad usage, or a PDF without pdftotext installed (brew install poppler).

import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { fold } from "./directions.mjs";

const UA = "opus-video-ingest/1.0";
const TIMEOUT_MS = 30000;
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

export const decodeEntities = (s) => String(s || "").replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|nbsp);/gi, (m, e) => {
  const k = e.toLowerCase();
  if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16));
  if (k.startsWith("#")) return k === "#39" ? "'" : String.fromCodePoint(Number(k.slice(1)));
  return ENTITIES[k] ?? m;
});

const DROP = ["script", "style", "nav", "header", "footer", "aside", "form", "noscript"];

export function htmlToText(html) {
  let h = String(html || "").replace(/<!--[\s\S]*?-->/g, "");
  for (const t of DROP) h = h.replace(new RegExp(`<${t}\\b[^>]*>[\\s\\S]*?</${t}\\s*>`, "gi"), " ");
  for (const t of ["article", "main", "body"]) {
    const m = h.match(new RegExp(`<${t}\\b[^>]*>([\\s\\S]*)</${t}\\s*>`, "i"));
    if (m) { h = m[1]; break; }
  }
  h = h.replace(/<\/?(p|br|h[1-6]|li)\b[^>]*>/gi, "\n").replace(/<[^>]*>/g, "");
  return decodeEntities(h).split("\n").map((l) => l.replace(/[\s ]+/g, " ").trim())
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)].map((m) => [m[1].toLowerCase(), m[3] ?? m[4]]));

export function htmlMeta(html) {
  const h = String(html || "");
  const metas = [...h.matchAll(/<meta\b[^>]*>/gi)].map((m) => attrs(m[0]));
  const meta = (key) => metas.find((a) => (a.property || a.name || "").toLowerCase() === key)?.content;
  const ld = [...h.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1].match(/"datePublished"\s*:\s*"([^"]+)"/)).find(Boolean)?.[1];
  const time = [...h.matchAll(/<time\b[^>]*>/gi)].map((m) => attrs(m[0]).datetime).find(Boolean);
  const title = meta("og:title") || h.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  return { title: decodeEntities(title).replace(/\s+/g, " ").trim(), published: (meta("article:published_time") || ld || time || "").trim() };
}

export const slugify = (s) => fold(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");

export function candidates(text, n = 8) {
  return String(text || "").split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 300 && /[0-9"“”]/.test(s)).slice(0, n);
}

export const arxivUrl = (id) => `https://arxiv.org/abs/${id}`;

// meta: { title, url | file, published, accessed, slug, candidates }
export function sourcesEntry(meta) {
  const lines = [`## ${meta.title}`, ""];
  lines.push(meta.url ? `- URL: ${meta.url}` : `- File: ${meta.file}`);
  lines.push(`- Ngày đăng: ${meta.published || ""}`.trimEnd(), `- Truy cập: ${meta.accessed}`, `- Văn bản: sources/${meta.slug}.txt`);
  lines.push("- Câu ứng viên (cần đọc lại, chưa phải ý chính):");
  for (const c of meta.candidates || []) lines.push(`  - ${c.replace(/\s+/g, " ")}`);
  return lines.join("\n") + "\n";
}

// SOURCES.md → { head, entries: [{ text, key, slug }] }; key is the URL or File value.
function parseSources(md) {
  const parts = String(md || "").split(/^(?=## )/m);
  const head = parts[0].startsWith("## ") ? "" : parts.shift();
  return {
    head,
    entries: parts.map((text) => ({
      text: text.replace(/\s+$/, "") + "\n",
      key: text.match(/^- (?:URL|File): (.+)$/m)?.[1].trim(),
      slug: text.match(/^- Văn bản: sources\/(.+)\.txt$/m)?.[1],
    })),
  };
}

const today = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

class NoPdftotext extends Error {}

function pdfText(file, deps) {
  const r = deps.spawnSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.error?.code === "ENOENT") throw new NoPdftotext("pdftotext not found — brew install poppler");
  if (r.error) throw new Error(`pdftotext: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`pdftotext exit ${r.status}: ${String(r.stderr || "").trim().slice(0, 200)}`);
  const text = String(r.stdout || "").replace(/\f/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
  return { text, title: (text.split("\n").find((l) => l.trim()) || "").trim().replace(/\s+/g, " ").slice(0, 120) };
}

async function fetchSource(url, deps) {
  let res;
  try {
    res = await deps.fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) { throw new Error(`fetch failed: ${e.cause?.message || e.message}`); }
  if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
  if (/pdf/i.test(res.headers?.get?.("content-type") || "")) {
    const dir = mkdtempSync(join(tmpdir(), "source-ingest-"));
    try {
      const f = join(dir, "source.pdf");
      writeFileSync(f, Buffer.from(await res.arrayBuffer()));
      return { ...pdfText(f, deps), published: "" };
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  const html = await res.text();
  const m = htmlMeta(html);
  return { text: htmlToText(html), title: m.title, published: m.published };
}

function parseArgs(argv) {
  const o = { sources: [], max: 8, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project" || a === "--max-candidates") {
      if (argv[i + 1] === undefined) return { bad: `${a} needs a value` };
      const v = argv[++i];
      if (a === "--project") o.project = v;
      else { o.max = Number(v); if (!Number.isInteger(o.max) || o.max < 0) return { bad: `--max-candidates must be a whole number ≥ 0, got ${v}` }; }
    } else if (a === "--json") o.json = true;
    else if (a.startsWith("--")) return { bad: `unknown argument ${a}` };
    else if (/^arxiv:\S+$/i.test(a)) o.sources.push({ arg: a, url: arxivUrl(a.slice(6)) });
    else if (/^https?:\/\/\S+$/i.test(a)) o.sources.push({ arg: a, url: a });
    else if (/\.pdf$/i.test(a)) o.sources.push({ arg: a, file: resolve(a) });
    else return { bad: `not a URL, .pdf file or arxiv:<id>: ${a}` };
  }
  if (!o.project) return { bad: "need --project <dir>" };
  if (!o.sources.length) return { bad: "need at least one <url|file.pdf|arxiv:<id>>" };
  return o;
}

export async function main(argv = process.argv.slice(2), log = console.log, err = console.error, deps = {}) {
  if (wantsHelp(argv)) { process.stdout.write(helpText(import.meta.url)); return 0; }
  deps = { fetch: globalThis.fetch, spawnSync, now: () => new Date(), ...deps };
  const o = parseArgs(argv);
  if (o.bad) { err(`source-ingest: ${o.bad}`); return 2; }
  const dir = resolve(o.project);
  const srcDir = join(dir, "sources");
  const mdPath = join(dir, "SOURCES.md");
  try { mkdirSync(srcDir, { recursive: true }); } catch (e) { err(`source-ingest: cannot create ${srcDir}: ${e.message}`); return 1; }
  const doc = parseSources(existsSync(mdPath) ? readFileSync(mdPath, "utf8") : "# SOURCES\n\n");
  const accessed = today(deps.now());
  const results = [];
  let failed = 0;
  for (const s of o.sources) {
    const key = s.url || s.file;
    try {
      let got;
      if (s.url) got = await fetchSource(s.url, deps);
      else if (!existsSync(s.file)) throw new Error(`file not found: ${s.file}`);
      else got = { ...pdfText(s.file, deps), published: "" };
      if (!got.text) throw new Error("no text extracted");
      const title = got.title || (s.url ? s.url : basename(s.file));
      const old = doc.entries.find((e) => e.key === key);
      const taken = new Set([...doc.entries.filter((e) => e !== old).map((e) => e.slug), ...results.map((r) => r.slug)]);
      const base = slugify(title) || "source";
      let slug = old?.slug?.startsWith(base) ? old.slug : base;
      for (let k = 2; taken.has(slug) || (slug !== old?.slug && existsSync(join(srcDir, `${slug}.txt`))); k++) slug = `${base}-${k}`;
      writeFileSync(join(srcDir, `${slug}.txt`), got.text + "\n");
      const meta = { title, ...(s.url ? { url: s.url } : { file: s.file }), published: got.published, accessed, slug, candidates: candidates(got.text, o.max) };
      const entry = { text: sourcesEntry(meta), key, slug };
      if (old) doc.entries[doc.entries.indexOf(old)] = entry; else doc.entries.push(entry);
      results.push({ source: s.arg, ok: true, ...meta, path: join(srcDir, `${slug}.txt`) });
      if (!o.json) log(`source-ingest: ${title} → sources/${slug}.txt (${meta.candidates.length} câu ứng viên)`);
    } catch (e) {
      if (e instanceof NoPdftotext) { err(`source-ingest: ${s.arg}: ${e.message}`); return 2; }
      failed++;
      results.push({ source: s.arg, ok: false, error: e.message });
      err(`source-ingest: ${s.arg}: ${e.message}`);
    }
  }
  if (results.some((r) => r.ok)) {
    const head = doc.head.replace(/\s+$/, "");
    writeFileSync(mdPath, (head ? head + "\n\n" : "") + doc.entries.map((e) => e.text).join("\n"));
  }
  if (o.json) log(JSON.stringify(results, null, 2));
  else log(`source-ingest: ${results.length - failed}/${results.length} nguồn → ${mdPath}${failed ? "" : "\nNext: đọc sources/<slug>.txt, viết ý chính có trích câu gốc; mọi số liệu trong kịch bản trỏ về một mục SOURCES.md."}`);
  return failed ? 1 : 0;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) main().then((c) => process.exit(c), (e) => { console.error(`source-ingest: ${e.message}`); process.exit(1); });
