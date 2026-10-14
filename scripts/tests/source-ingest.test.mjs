import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText, htmlMeta, slugify, candidates, arxivUrl, sourcesEntry, decodeEntities, main } from "../source-ingest.mjs";

const HTML = readFileSync(fileURLToPath(new URL("fixtures/ingest/article.html", import.meta.url)), "utf8");
const tmp = () => mkdtempSync(join(tmpdir(), "ingest-"));
const quiet = () => {};
const URL1 = "https://bao.example/gia-dat";
const NOW = () => new Date(2026, 9, 14, 9, 0);

// Minimal fetch stub: (url) → Response-like with status, headers.get, text, arrayBuffer.
const stubFetch = (status, body, type = "text/html; charset=utf-8") => async () => ({
  status,
  headers: { get: (k) => (k.toLowerCase() === "content-type" ? type : null) },
  text: async () => body,
  arrayBuffer: async () => new TextEncoder().encode(body).buffer,
});
const countEntries = (md) => (md.match(/^## /gm) || []).length;

test("htmlToText: drops nav/script/aside, keeps the article, decodes &amp;", () => {
  const t = htmlToText(HTML);
  assert.ok(!t.includes("MENU"));
  assert.ok(!t.includes("1234567890") && !t.includes("999") && !t.includes("Bản quyền"));
  assert.ok(t.includes("ngân hàng & hoàn tất"));
  assert.ok(t.includes("\n"));
  assert.equal(htmlToText("<body><p>a&lt;b &#65;&#x42; x&nbsp;&nbsp;y &quot;q&quot; it&#39;s</p></body>"), "a<b AB x y \"q\" it's");
  assert.equal(htmlToText("<main><p>trong main</p></main>"), "trong main");
});

test("htmlMeta: og:title and article:published_time, then JSON-LD / <time> / <title> fallbacks", () => {
  assert.deepEqual(htmlMeta(HTML), { title: "Giá đất Hà Nội tăng 20%", published: "2026-09-30T08:15:00+07:00" });
  const ld = `<title>T &amp; U</title><script type="application/ld+json">{"@type":"NewsArticle","datePublished": "2025-01-02"}</script>`;
  assert.deepEqual(htmlMeta(ld), { title: "T & U", published: "2025-01-02" });
  assert.equal(htmlMeta(`<time class="x" datetime="2024-05-06">6/5</time>`).published, "2024-05-06");
  assert.equal(htmlMeta("<p>none</p>").published, "");
});

test("candidates: only sentences of 40–300 chars with a digit or quote, in order, at most n", () => {
  const c = candidates(htmlToText(HTML), 8);
  assert.equal(c.length, 2);
  assert.ok(c[0].includes("20%") && c[1].includes("1.200"));
  assert.equal(candidates(htmlToText(HTML), 1).length, 1);
  assert.deepEqual(candidates("Ngắn 1. " + "Câu này có dấu ngoặc “trích dẫn” và đủ dài để được giữ lại nhé!", 8), ["Câu này có dấu ngoặc “trích dẫn” và đủ dài để được giữ lại nhé!"]);
  assert.deepEqual(candidates("x1 ".repeat(120), 8), []);
});

test("slugify / arxivUrl / sourcesEntry", () => {
  assert.equal(slugify("Giá đất Hà Nội tăng 20%"), "gia-dat-ha-noi-tang-20");
  assert.ok(slugify("a ".repeat(80)).length <= 60 && !slugify("a ".repeat(80)).endsWith("-"));
  assert.equal(arxivUrl("1706.03762"), "https://arxiv.org/abs/1706.03762");
  const e = sourcesEntry({ title: "T", url: "https://x", published: "", accessed: "2026-10-14", slug: "t", candidates: ["Câu 1"] });
  assert.match(e, /^## T\n/);
  assert.match(e, /^- URL: https:\/\/x$/m);
  assert.match(e, /^- Ngày đăng:$/m);
  assert.match(e, /^- Truy cập: 2026-10-14$/m);
  assert.match(e, /^- Văn bản: sources\/t\.txt$/m);
  assert.match(e, /^- Câu ứng viên \(cần đọc lại, chưa phải ý chính\):\n {2}- Câu 1$/m);
});

test("main + fetch stub: writes sources/<slug>.txt and SOURCES.md; same URL twice keeps one entry", async () => {
  const d = tmp();
  try {
    const deps = { fetch: stubFetch(200, HTML), now: NOW };
    assert.equal(await main(["--project", d, URL1], quiet, quiet, deps), 0);
    const txt = readFileSync(join(d, "sources", "gia-dat-ha-noi-tang-20.txt"), "utf8");
    assert.ok(txt.includes("1.200 giao dịch") && !txt.includes("MENU"));
    let md = readFileSync(join(d, "SOURCES.md"), "utf8");
    assert.equal(countEntries(md), 1);
    assert.match(md, /^## Giá đất Hà Nội tăng 20%$/m);
    assert.match(md, new RegExp(`^- URL: ${URL1}$`, "m"));
    assert.match(md, /^- Ngày đăng: 2026-09-30T08:15:00\+07:00$/m);
    assert.match(md, /^- Truy cập: 2026-10-14$/m);
    assert.match(md, /^- Văn bản: sources\/gia-dat-ha-noi-tang-20\.txt$/m);

    assert.equal(await main(["--project", d, URL1], quiet, quiet, deps), 0);
    md = readFileSync(join(d, "SOURCES.md"), "utf8");
    assert.equal(countEntries(md), 1);
    assert.deepEqual(readdirSync(join(d, "sources")), ["gia-dat-ha-noi-tang-20.txt"]);

    // A different URL with the same title gets "-2"; the first entry is untouched.
    assert.equal(await main(["--project", d, URL1 + "-khac"], quiet, quiet, deps), 0);
    md = readFileSync(join(d, "SOURCES.md"), "utf8");
    assert.equal(countEntries(md), 2);
    assert.match(md, /^- Văn bản: sources\/gia-dat-ha-noi-tang-20-2\.txt$/m);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("main: HTTP 404 exits 1 and still writes the sources that worked", async () => {
  const d = tmp();
  try {
    assert.equal(await main(["--project", d, URL1], quiet, quiet, { fetch: stubFetch(404, "nope"), now: NOW }), 1);
    const fetch = async (url) => (url === URL1 ? stubFetch(200, HTML)() : stubFetch(404, "nope")());
    const errs = [];
    assert.equal(await main(["--project", d, URL1, "https://bao.example/mat"], quiet, (m) => errs.push(m), { fetch, now: NOW }), 1);
    assert.ok(errs.some((m) => m.includes("HTTP 404")));
    assert.equal(countEntries(readFileSync(join(d, "SOURCES.md"), "utf8")), 1);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("main: PDF via pdftotext stub writes the file; ENOENT exits 2; PDF content-type goes through pdftotext", async () => {
  const d = tmp();
  try {
    const pdf = join(d, "bao-cao.pdf");
    writeFileSync(pdf, "%PDF-1.4 stub");
    const calls = [];
    const spawnSync = (cmd, args) => { calls.push([cmd, ...args]); return { status: 0, stdout: "\n  Báo cáo thị trường 2026  \n\nDoanh thu toàn ngành đạt 3.500 tỷ đồng trong sáu tháng đầu năm.\n" }; };
    assert.equal(await main(["--project", d, pdf], quiet, quiet, { spawnSync, now: NOW }), 0);
    assert.deepEqual(calls[0], ["pdftotext", "-layout", pdf, "-"]);
    assert.ok(readFileSync(join(d, "sources", "bao-cao-thi-truong-2026.txt"), "utf8").includes("3.500 tỷ đồng"));
    const md = readFileSync(join(d, "SOURCES.md"), "utf8");
    assert.match(md, new RegExp(`^- File: ${pdf.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
    assert.match(md, /^ {2}- Doanh thu toàn ngành đạt 3\.500 tỷ đồng/m);

    const enoent = () => ({ error: Object.assign(new Error("spawnSync pdftotext ENOENT"), { code: "ENOENT" }) });
    const errs = [];
    assert.equal(await main(["--project", d, pdf], quiet, (m) => errs.push(m), { spawnSync: enoent, now: NOW }), 2);
    assert.ok(errs.some((m) => m.includes("brew install poppler")));
    const d2 = tmp();
    try {
      assert.equal(await main(["--project", d2, URL1, pdf], quiet, quiet, { fetch: stubFetch(200, HTML), spawnSync: enoent, now: NOW }), 2);
      assert.match(readFileSync(join(d2, "SOURCES.md"), "utf8"), new RegExp(`^- URL: ${URL1.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"), "sources fetched before the missing pdftotext are still indexed");
    } finally { rmSync(d2, { recursive: true, force: true }); }

    assert.equal(await main(["--project", d, "https://x.example/paper"], quiet, quiet, { fetch: stubFetch(200, "%PDF", "application/pdf"), spawnSync, now: NOW }), 0);
    assert.equal(calls.length, 2);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("main: bad usage exits 2", async () => {
  assert.equal(await main([URL1], quiet, quiet), 2);
  assert.equal(await main(["--project", "/tmp"], quiet, quiet), 2);
  assert.equal(await main(["--project", "/tmp", "notes.txt"], quiet, quiet), 2);
  assert.equal(await main(["--project", "/tmp", URL1, "--max-candidates", "x"], quiet, quiet), 2);
  assert.equal(await main(["--project", "/tmp", URL1, "--bogus"], quiet, quiet), 2);
});

test("decodeEntities: typographic entities common in news HTML", () => {
  assert.equal(decodeEntities("a&hellip; &ldquo;b&rdquo; &lsquo;c&rsquo; 1&ndash;2 &mdash;"), "a\u2026 \u201cb\u201d \u2018c\u2019 1\u20132 \u2014");
});

test("htmlToText: table cells, rows and adjacent divs never glue numbers or sentences together", () => {
  const html = `<body><table><thead><tr><th>Năm</th><th>Tăng</th></tr></thead><tbody><tr><td>2023</td><td>15%</td></tr><tr><td>2024</td><td>20%</td></tr></tbody></table>`
    + `<div>Giá đất tăng 20% trong năm 2024 theo báo cáo.</div><div>Giao dịch giảm 30% so với cùng kỳ.</div>`
    + `<section><ul><li>a</li></ul><dl><dt>Quận 1</dt><dd>120 triệu/m²</dd></dl></section><p>x<span>1</span><b>2</b></p></body>`;
  const t = htmlToText(html);
  assert.ok(!/202315|15%2024|Tăng2023/.test(t), t);
  const lines = t.split("\n");
  assert.ok(lines.includes("Năm | Tăng") && lines.includes("2023 | 15%") && lines.includes("2024 | 20%"), t);
  assert.ok(lines.includes("Giá đất tăng 20% trong năm 2024 theo báo cáo.") && lines.includes("Giao dịch giảm 30% so với cùng kỳ."), t);
  assert.ok(lines.includes("Quận 1") && lines.includes("120 triệu/m²"), t);
  assert.ok(lines.includes("x 1 2"), t);
});
