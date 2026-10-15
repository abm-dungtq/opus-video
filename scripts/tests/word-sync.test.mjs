// word-sync.mjs: "chữ:" rows of PLAN.md "## Sự kiện" against the spoken word (words.json),
// ±150 ms PASS, ±250 ms WARN, scene check from TIMING, legacy projects only WARN.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkWords, main, parseWordRows, readTiming, rowPhrase, wordVerdict, NONE_LINE } from "../word-sync.mjs";
import { phraseHits, wordKey } from "../timing.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/word-sync", import.meta.url));
const copy = () => { const d = mkdtempSync(join(tmpdir(), "word-sync-")); cpSync(FIXTURE, d, { recursive: true }); return d; };
const capture = () => {
  const buf = { out: "", err: "" };
  return { buf, io: { out: (s) => { buf.out += s; }, err: (s) => { buf.err += s; } } };
};
const addRow = (d, row) => {
  const p = join(d, "PLAN.md");
  writeFileSync(p, readFileSync(p, "utf8").replace("| 7.5 | Logo", `${row}\n| 7.5 | Logo`));
};

test("wordVerdict: 150 ms PASS, 250 ms WARN, either sign", () => {
  const cases = { 0: "PASS", 150: "PASS", [-150]: "PASS", 151: "WARN", [-250]: "WARN", 250: "WARN", 251: "FAIL", [-300]: "FAIL" };
  for (const [d, level] of Object.entries(cases)) assert.equal(wordVerdict(Number(d)), level, `delta ${d}`);
});

test("rowPhrase / parseWordRows: chữ rows only, quotes and trailing punctuation dropped, diacritics optional", () => {
  assert.equal(rowPhrase('chữ: "kiểm thử"'), "kiểm thử");
  assert.equal(rowPhrase("Chữ: “Ảnh chụp”."), "Ảnh chụp");
  assert.equal(rowPhrase("chu: «mã nguồn»!"), "mã nguồn");
  const rows = parseWordRows("## Sự kiện\n| Thời điểm | Sự kiện | Âm thanh |\n|---|---|---|\n| 5.8 | chữ: \"kiểm thử\" | — |\n| 6,5s (đo) | chu : xong | — |\n| 2 | Nút lún | assets/sfx/a.mp3 |\n| x | chữ: lạ | — |\n");
  assert.deepEqual(rows, [
    { t: 5.8, phrase: "kiểm thử" },
    { t: 6.5, phrase: "xong" },
    { t: NaN, raw: "x", phrase: "lạ" },
  ]);
  assert.deepEqual(parseWordRows("## Cảnh\n| a |\n"), []);
});

test("phraseHits: the W() rule, folded keys without punctuation, every occurrence", () => {
  assert.equal(wordKey("Nguồn,"), "nguon");
  const words = [{ text: "Kiểm", start: 1, end: 1.2 }, { text: "—", start: 1.2, end: 1.3 }, { text: "thử.", start: 1.3, end: 1.5 }, { text: "kiem", start: 4, end: 4.2 }, { text: "thu", start: 4.3, end: 4.5 }];
  assert.deepEqual(phraseHits(words, "kiểm thử"), [{ start: 1, end: 1.5 }, { start: 4, end: 4.5 }]);
  assert.deepEqual(phraseHits(words, "kiểm tra"), []);
  assert.deepEqual(phraseHits(words, ""), []);
});

test("readTiming: JSON block from timing.mjs; the skeleton literal is not a TIMING", () => {
  assert.equal(readTiming("/* TIMING:BEGIN */\nwindow.TIMING = {fps:30, duration:10, scenes:{}};\n/* TIMING:END */"), null);
  assert.equal(readTiming("<html></html>"), null);
  const t = readTiming(readFileSync(join(FIXTURE, "index.html"), "utf8"));
  assert.deepEqual(Object.keys(t.scenes), ["s1", "s2"]);
});

test("fixture: 50 ms PASS, 200 ms WARN, 300 ms FAIL, exit 1; the nearest occurrence is measured", () => {
  const r = checkWords({ dir: FIXTURE });
  assert.deepEqual(r.lines.map((l) => [l.level, l.delta_ms]), [["PASS", 50], ["WARN", 200], ["FAIL", -300]]);
  assert.equal(r.lines[2].spoken, 5, "4.7s is nearer to the first kiểm thử (5.0s) than the second (7.0s)");
  assert.deepEqual(r.errors, ['WORD   4.70s "kiểm thử" lời 5.00s lệch −300 ms']);
  const c = capture();
  assert.equal(main(["--project", FIXTURE], c.io), 1);
  assert.equal(c.buf.out, [
    'PASS  WORD   1.05s "mã nguồn" lời 1.00s lệch +50 ms',
    'WARN  WORD   2.20s "Ảnh chụp" lời 2.00s lệch +200 ms',
    'FAIL  WORD   4.70s "kiểm thử" lời 5.00s lệch −300 ms',
  ].join("\n") + "\n");
});

test("a phrase never spoken FAILs; a legacy project turns every FAIL into WARN", () => {
  const d = copy();
  try {
    addRow(d, "| 6 | chữ: giao hàng | — |");
    let r = checkWords({ dir: d });
    assert.ok(r.errors.includes('WORD   6.00s "giao hàng" không có trong lời đọc'), r.errors.join("\n"));
    writeFileSync(join(d, "BRIEF.md"), "---\naspect: 16:9\n---\n");
    r = checkWords({ dir: d });
    assert.equal(r.legacy, true);
    assert.deepEqual(r.errors, []);
    assert.ok(r.warnings.includes('WORD   6.00s "giao hàng" không có trong lời đọc'));
    const c = capture();
    assert.equal(main(["--project", d], c.io), 0, c.buf.out);
    assert.doesNotMatch(c.buf.out, /^FAIL/m);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("TIMING scene check: a word shown in the scene before the one it is spoken in WARNs", () => {
  const d = copy();
  try {
    addRow(d, "| 2.95 | chữ: xong | — |");
    const r = checkWords({ dir: d });
    const lines = r.lines.filter((l) => l.phrase === "xong").map((l) => l.text);
    assert.deepEqual(lines, [
      'PASS  WORD   2.95s "xong" lời 3.05s lệch −100 ms',
      'WARN  WORD   2.95s "xong" không có trong lời của cảnh s1 (TIMING); chữ hiện ở cảnh khác với lời',
    ]);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("no chữ row: one PASS line, exit 0, the HTML is not needed", () => {
  const d = mkdtempSync(join(tmpdir(), "word-sync-"));
  try {
    writeFileSync(join(d, "PLAN.md"), "## Sự kiện\n| Thời điểm | Sự kiện | Âm thanh |\n|---|---|---|\n| 2 | Nút lún | assets/sfx/a.mp3 |\n");
    const c = capture();
    assert.equal(main(["--project", d], c.io), 0, c.buf.err);
    assert.equal(c.buf.out, `${NONE_LINE}\n`);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("unreadable time, an empty phrase and a voice without words.json", () => {
  const d = copy();
  try {
    addRow(d, "| sớm | chữ: xong | — |\n| 3 | chữ: | — |");
    rmSync(join(d, "assets", "voice", "01.mp3.words.json"));
    const r = checkWords({ dir: d });
    assert.ok(r.warnings.some((w) => w.startsWith("WORD   vo-01: không có")), r.warnings.join("\n"));
    assert.ok(r.errors.includes('WORD   "xong" thời điểm "sớm" không đọc được (ghi số giây, ví dụ 5.8s)'), r.errors.join("\n"));
    assert.ok(r.errors.includes('WORD   3.00s hàng chữ không có cụm từ (ghi chữ: "<cụm>")'), r.errors.join("\n"));
    assert.ok(r.errors.includes('WORD   1.05s "mã nguồn" không có trong lời đọc'));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("--write-qa appends a WORD section; --json prints the measurements", () => {
  const d = copy();
  try {
    writeFileSync(join(d, "QA.md"), "# QA\nPASS — FPS");
    let c = capture();
    assert.equal(main(["--project", d, "--write-qa"], { ...c.io, now: () => new Date("2026-10-15T01:00:00Z") }), 1);
    assert.equal(readFileSync(join(d, "QA.md"), "utf8"), `# QA\nPASS — FPS\n\n## WORD (2026-10-15T01:00:00.000Z)\n\n${c.buf.out.trimEnd()}\n`);
    c = capture();
    assert.equal(main(["--project", d, "--json"], c.io), 1);
    assert.deepEqual(JSON.parse(c.buf.out)[1], { level: "WARN", t: 2.2, phrase: "Ảnh chụp", spoken: 2, delta_ms: 200 });
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("CLI: bad usage, missing PLAN.md or HTML exit 2", () => {
  const d = copy();
  try {
    let c = capture();
    assert.equal(main([], c.io), 2);
    assert.equal(main(["--project"], c.io), 2);
    assert.equal(main(["--project", d, "--bogus"], c.io), 2);
    c = capture();
    assert.equal(main(["--project", d, "--html", "nope.html"], c.io), 2);
    assert.match(c.buf.err, /HTML not found/);
    rmSync(join(d, "PLAN.md"));
    c = capture();
    assert.equal(main(["--project", d], c.io), 2);
    assert.match(c.buf.err, /PLAN\.md not found/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
