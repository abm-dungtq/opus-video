import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { check, checkCreative, checkRevisions, verticalHint, parsePlan, isPng, readableHold, holdWarnings, parseTable, spanBounds, spanSeconds, beatWarnings, parseBeat } from "../check-preflight.mjs";
import { main as renderFinal, PREFLIGHT_EXIT } from "../render-final.mjs";
import { writeDemoMd } from "../make-demo.mjs";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const PLAN = (demo = "- 2 — logo\n- 9.5 — terminal\n", extra = "") => `# PLAN

## Mục tiêu
Giới thiệu repo cho người mới trong 60 giây.

## Cảnh
| # | Thời điểm | Lời đọc | Hình / hiệu ứng | Âm thanh |
|---|---|---|---|---|
| 1 | 0–7s | Hook | Logo bật lên | whoosh |
| 2 | 7–16s | Cài đặt | Terminal gõ lệnh | click |

## Âm thanh
Voice eleven_v4, nhạc nền -20 dB, SFX theo beat.

## Engine
HyperFrames general-video, 16:9.

## Khung hình demo
${demo}
## QA
lint, check, video-lint, judge.
${extra}`;

function proj({ plan = PLAN(), brief = "---\naspect: 16:9\n---\n" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "pf-"));
  writeFileSync(join(dir, "BRIEF.md"), brief);
  if (plan !== null) writeFileSync(join(dir, "PLAN.md"), plan);
  return dir;
}
const past = (f, s = 100) => { const t = Date.now() / 1000 - s; utimesSync(f, t, t); };
function demo(dir, n, sub = "demo") {
  mkdirSync(join(dir, sub), { recursive: true });
  for (let i = 0; i < n; i++) writeFileSync(join(dir, sub, `frame-0${i}-at-${i}s.png`), PNG);
}

test("parsePlan: scenes from the table, timestamps from the demo list (diacritics optional)", () => {
  const p = parsePlan(PLAN("- 2s — a\n- 9,5 — b\n* 15 c\n"));
  assert.equal(p.scenes, 2);
  assert.deepEqual(p.demo, [2, 9.5, 15]);
  assert.equal(p.demo916, null);
  assert.deepEqual(parsePlan(PLAN("- 1\n", "\n## Khung hinh demo 9:16\n- 3\n- 4\n")).demo916, [3, 4]);
});

const HEAD = "| # | Thời điểm | Lời đọc | Hình / hiệu ứng | Âm thanh |\n|---|---|---|---|---|\n";
const SHORT_ROW = '| 1 | 0–1.5s | Hook | Chữ "Từ kế hoạch đến kiểm thử" hiện ra | whoosh |';

test("readableHold: words / 2.5 + 0.5s, never under 1s", () => {
  assert.equal(readableHold(0), 1.0);
  assert.equal(readableHold(5), 2.5);
  assert.equal(readableHold(10), 4.5);
});

test("holdWarnings: quoted on-screen text shorter than its reading time warns", () => {
  const w = holdWarnings(parseTable(HEAD + SHORT_ROW));
  assert.equal(w.length, 1);
  assert.match(w[0], /row 1/);
  assert.match(w[0], /\(6 từ\)/);
  assert.ok(w[0].includes("cần giữ ≥ 2.9s"), w[0]);
  assert.ok(w[0].includes("beat dài 1.5s"), w[0]);
  assert.deepEqual(holdWarnings(parseTable(HEAD + SHORT_ROW.replace("0–1.5s", "0–4s"))), []);
});

test("holdWarnings: quotes in the voice-over column are not on-screen text", () => {
  const row = '| 1 | 0–1s | "Từ kế hoạch đến kiểm thử, mọi bước đều rõ" | Logo bật lên | whoosh |';
  assert.deepEqual(holdWarnings(parseTable(HEAD + row)), []);
});

const ROW1 = 'Styleframe đã duyệt: con trỏ nhấp nháy, câu "Sửa lỗi đăng nhập giúp mình" gõ từng cụm, camera bám con trỏ; ba chip đính kèm bật vào hàng đính kèm; nút gửi lún ở 2,2 giây';
const ROW4 = 'Dòng "Kiểm thử" nở thành thẻ kết quả bốn dấu tích; khung lệnh hoá thành thẻ, tiêu đề "Gemini 4 Argon" quét sáng, dòng "Từ kế hoạch đến kiểm thử"; camera lùi chậm, giữ hình khoảng 1 giây cuối';
const REAL = (r1 = ROW1) => HEAD + `| 1 | 0–2.5s | — | ${r1} | keycap |\n| 4 | 11.4–15s | — | ${ROW4} | impact |`;

test("spanBounds: start and end seconds of a Thời điểm cell; spanSeconds unchanged", () => {
  assert.deepEqual(spanBounds("11.4–15s"), { start: 11.4, end: 15 });
  assert.equal(spanBounds("—"), null);
  assert.equal(spanSeconds("0–1.5s"), 1.5);
});

test("holdWarnings: names the longest string; a vague 'giữ hình' is not a hold mark", () => {
  const w = holdWarnings(parseTable(REAL()));
  assert.equal(w.length, 2);
  assert.ok(w[0].includes('"Sửa lỗi đăng nhập giúp mình" (6 từ) cần giữ ≥ 2.9s, beat dài 2.5s'), w[0]);
  assert.ok(w[1].includes('"Từ kế hoạch đến kiểm thử" (11 từ) cần giữ ≥ 4.9s, beat dài 3.6s'), w[1]);
});

test("holdWarnings: (giữ đến <t>s) / (giữ đến hết) measures the hold to that mark", () => {
  let w = holdWarnings(parseTable(REAL(ROW1 + " (giữ đến hết)")));
  assert.equal(w.length, 1);
  assert.match(w[0], /row 2: chữ trên hình "Từ kế hoạch đến kiểm thử"/);
  w = holdWarnings(parseTable(REAL(ROW1 + " (giữ đến 4s)")));
  assert.equal(w.length, 1);
  assert.match(w[0], /row 2: chữ trên hình "Từ kế hoạch đến kiểm thử"/);
  w = holdWarnings(parseTable(REAL(ROW1 + " (giữ tới 2,8s)")));
  assert.equal(w.length, 2);
  assert.ok(w[0].includes("giữ tới 2.8s, được 2.8s"), w[0]);
  w = holdWarnings(parseTable(REAL(ROW1 + " (giữ đến 0s)")));
  assert.ok(w[0].includes("beat dài 2.5s"), w[0]);
});

test("holdWarnings: a beat exactly at the reading time does not warn (float rounding)", () => {
  assert.deepEqual(holdWarnings(parseTable(HEAD + '| 1 | 5.8–8.7s | — | Chữ "Từ kế hoạch đến kiểm thử" hiện ra | whoosh |')), []);
});

test("plan stage: a brief without direction still gets the hold WARN and passes", () => {
  const dir = proj({ plan: PLAN().replace("| 1 | 0–7s | Hook | Logo bật lên | whoosh |", SHORT_ROW) });
  try {
    const r = check({ project: dir });
    assert.equal(r.pass, true, r.errors.join("\n"));
    assert.ok(r.warnings.some((w) => w.includes("cần giữ ≥ 2.9s")), r.warnings.join("\n"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("plan stage: missing PLAN.md, missing or placeholder sections, too few timestamps", () => {
  const none = proj({ plan: null });
  const thin = proj({ plan: PLAN("- 2 — logo\n").replace("HyperFrames general-video, 16:9.", "TODO") });
  const ok = proj();
  try {
    assert.match(check({ project: none }).errors[0], /PLAN\.md not found/);
    const r = check({ project: thin });
    assert.equal(r.pass, false);
    assert.ok(r.errors.some((e) => e.includes('"## engine" is empty or a placeholder')));
    assert.ok(r.errors.some((e) => e.includes("1 timestamps for 2 scenes")));
    assert.equal(check({ project: ok }).pass, true);
  } finally { for (const d of [none, thin, ok]) rmSync(d, { recursive: true, force: true }); }
});

test("aspect both needs a 9:16 demo list and demo/9x16 frames", () => {
  const dir = proj({ brief: "---\naspect: both\n---\n" });
  try {
    assert.ok(check({ project: dir }).errors.some((e) => e.includes("Khung hình demo 9:16")));
    writeFileSync(join(dir, "PLAN.md"), PLAN(undefined, "\n## Khung hình demo 9:16\n- 2\n- 9\n"));
    past(join(dir, "PLAN.md"));
    assert.equal(check({ project: dir }).pass, true);
    demo(dir, 2);
    writeFileSync(join(dir, "DEMO.md"), "approval: user 2026-10-12 \"ok, làm tiếp\"\n");
    const r = check({ project: dir, stage: "final" });
    assert.ok(r.errors.some((e) => e.startsWith("demo/9x16/ has 0 PNG")));
    demo(dir, 2, "demo/9x16");
    assert.equal(check({ project: dir, stage: "final" }).pass, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("final stage: frames, PNG signature, freshness vs PLAN.md, approval", () => {
  const dir = proj();
  try {
    past(join(dir, "PLAN.md"));
    let r = check({ project: dir, stage: "final" });
    assert.ok(r.errors.some((e) => e.includes("demo/ has 0 PNG")));
    assert.ok(r.errors.some((e) => e.includes("DEMO.md not found")));
    demo(dir, 2);
    writeFileSync(join(dir, "demo", "fake.png"), "not a png");
    writeFileSync(join(dir, "DEMO.md"), "approval: pending\n");
    r = check({ project: dir, stage: "final" });
    assert.ok(r.errors.some((e) => e.includes("not PNG images")));
    assert.ok(r.errors.some((e) => e.includes("approval is missing or pending")));
    rmSync(join(dir, "demo", "fake.png"));
    writeFileSync(join(dir, "DEMO.md"), "# DEMO\n\napproval: user 2026-10-12 \"ok, làm tiếp\"\n");
    assert.equal(check({ project: dir, stage: "final" }).pass, true);
    writeFileSync(join(dir, "PLAN.md"), PLAN());
    r = check({ project: dir, stage: "final" });
    assert.ok(r.errors.some((e) => e.includes("older than PLAN.md")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("final stage: composition edited after the demo is a WARN, not a FAIL", () => {
  const dir = proj();
  try {
    past(join(dir, "PLAN.md"), 200);
    demo(dir, 2);
    for (const f of ["frame-00-at-0s.png", "frame-01-at-1s.png"]) past(join(dir, "demo", f), 100);
    writeFileSync(join(dir, "DEMO.md"), "approval: user ok 2026-10-12\n");
    writeFileSync(join(dir, "index.html"), "<html></html>");
    const r = check({ project: dir, stage: "final" });
    assert.equal(r.pass, true);
    assert.ok(r.warnings.some((w) => /index\.html/.test(w)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("final stage: mix balance FAIL blocks, WARN warns, a measurement error warns, no index.html is not measured", () => {
  const dir = proj();
  try {
    past(join(dir, "PLAN.md"), 200);
    demo(dir, 2);
    writeFileSync(join(dir, "DEMO.md"), "approval: user ok 2026-10-12\n");
    const calls = [];
    const stub = (level) => (o) => { calls.push(o.dir); return { level, line: `${level} BALANCE nhạc dưới giọng 11.1 dB (lúc có lời), nhạc lúc không lời −22.4 dBFS` }; };
    assert.equal(check({ project: dir, stage: "final", balance: stub("FAIL") }).pass, true);
    assert.deepEqual(calls, [], "no index.html, nothing to measure");
    writeFileSync(join(dir, "index.html"), "<html></html>");
    let r = check({ project: dir, stage: "final", balance: stub("FAIL") });
    assert.equal(r.pass, false);
    assert.ok(r.errors.includes("BALANCE nhạc dưới giọng 11.1 dB (lúc có lời), nhạc lúc không lời −22.4 dBFS"), r.errors.join("\n"));
    assert.equal(r.balance.level, "FAIL");
    r = check({ project: dir, stage: "final", balance: stub("WARN") });
    assert.equal(r.pass, true);
    assert.ok(r.warnings.some((w) => w.startsWith("BALANCE nhạc dưới giọng")));
    r = check({ project: dir, stage: "final", balance: stub("PASS") });
    assert.ok(!r.warnings.some((w) => w.includes("BALANCE")) && r.pass);
    r = check({ project: dir, stage: "final", balance: () => { throw new Error("ffmpeg exited 1"); } });
    assert.equal(r.pass, true);
    assert.ok(r.warnings.includes("mix-balance: không đo được (ffmpeg exited 1)"));
    assert.equal(check({ project: dir, stage: "plan", balance: stub("FAIL") }).pass, true, "plan stage does not measure");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("isPng reads the signature; writeDemoMd lists frames and resets approval", () => {
  const dir = proj();
  try {
    demo(dir, 1);
    assert.equal(isPng(join(dir, "demo", "frame-00-at-0s.png")), true);
    assert.equal(isPng(join(dir, "PLAN.md")), false);
    writeFileSync(join(dir, "DEMO.md"), "# DEMO\nGhi chú của người dùng.\n\napproval: user ok\n\n## Frames\n\n- demo/9x16/frame-00-at-1s.png (9:16)\n- demo/old.png (main)\n");
    writeDemoMd(dir, ["demo/frame-00-at-2s.png"], "main");
    const md = readFileSync(join(dir, "DEMO.md"), "utf8");
    assert.match(md, /Ghi chú của người dùng\./);
    assert.match(md, /^approval: pending$/m);
    assert.ok(!md.includes("approval: user ok"));
    assert.ok(md.includes("- demo/9x16/frame-00-at-1s.png (9:16)"));
    assert.ok(md.includes("- demo/frame-00-at-2s.png (main)"));
    assert.ok(!md.includes("demo/old.png"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("render-final: blocked preflight → exit 5 without rendering; pass → delivery render with forwarded args, render's exit code", () => {
  const calls = [];
  // ffmpeg/ffprobe -version succeed; the render itself fails with 3
  const spawn = (cmd, args, opts) => { if (cmd !== "npx") return { status: 0 }; calls.push({ cmd, args, cwd: opts.cwd }); return { status: 3 }; };
  assert.equal(renderFinal(["--project", "/p"], { checkImpl: () => ({ pass: false, stage: "final", errors: ["x"], warnings: [] }), spawn }), PREFLIGHT_EXIT);
  assert.equal(calls.length, 0);
  assert.equal(renderFinal(["--project", "/p", "--", "-c", "compositions/main-9x16.html", "--output", "renders/x.mp4"], { checkImpl: () => ({ pass: true, stage: "final", errors: [], warnings: [] }), spawn }), 3);
  assert.equal(calls.length, 1, "a failed render is not remixed");
  assert.deepEqual(calls[0].args, ["hyperframes", "render", "--quality", "delivery", "-c", "compositions/main-9x16.html", "--output", "renders/x.mp4"]);
  assert.equal(calls[0].cwd, "/p");
  assert.equal(renderFinal(["--", "--quality", "draft"], { checkImpl: () => ({ pass: true, errors: [], warnings: [] }), spawn }), 2);
});

test("replace-in-file: global regex pairs applied in order, with counts", async () => {
  const { replaceAll } = await import("../replace-in-file.mjs");
  const css = ":root{--cap-band-top: 1600px; --cap-band-height: 240px;}";
  const r = replaceAll(css, [["--cap-band-top: [0-9]*px;", "--cap-band-top: 1340px;"], ["--cap-band-height: [0-9]*px;", "--cap-band-height: 200px;"]]);
  assert.equal(r.text, ":root{--cap-band-top: 1340px; --cap-band-height: 200px;}");
  assert.deepEqual(r.counts, [1, 1]);
});

test("make-demo --from-video cuts PLAN.md frames from an approved draft and records the source", { skip: spawnSync("ffmpeg", ["-version"]).status !== 0 }, () => {
  const dir = proj();
  const script = fileURLToPath(new URL("../make-demo.mjs", import.meta.url));
  try {
    writeFileSync(join(dir, "index.html"), "<html></html>");
    past(join(dir, "index.html"));
    const mp4 = join(dir, "draft.mp4");
    const g = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=purple:s=64x64:d=11", "-pix_fmt", "yuv420p", mp4]);
    assert.equal(g.status, 0);
    const r = spawnSync("node", [script, "--project", dir, "--from-video", mp4], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const demo = readFileSync(join(dir, "DEMO.md"), "utf8");
    assert.match(demo, /^source: draft\.mp4$/m);
    assert.match(demo, /approval: pending/);
    assert.match(demo, /demo\/frame-01-at-9\.5s\.png \(main\)/);
    past(mp4, 200);
    const stale = spawnSync("node", [script, "--project", dir, "--from-video", mp4], { encoding: "utf8" });
    assert.equal(stale.status, 2);
    assert.match(stale.stderr, /older than index\.html/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const REVISION = (n, skip = "") => `### R${n}
- Vị trí: 6.5s (khung 195 ở 30 fps), cảnh 2
- Lỗi thấy: con trỏ đè lên nhãn kết quả
- Đổi: con trỏ rời nút trong 6.8–7.0s, dừng cách nhãn 24 px
- Giữ nguyên: lúc nhấn 6.5s, lúc hiện kết quả 7.0s, chữ, tiếng
- Kiểm: snapshot --at 6.4,6.5,7.0,7.4 · check --at-transitions
`.split("\n").filter((l) => !skip || !l.includes(skip)).join("\n");
const ROUND = '# REVISIONS\n\n## Vòng 1 (2026-10-14 15:00) — lời người dùng: "con trỏ che chữ"\n\n';

test("checkRevisions: the reference template gives no WARN", () => {
  assert.deepEqual(checkRevisions(ROUND + REVISION(1)), []);
});

test("checkRevisions: a round with six fixes warns once", () => {
  const text = ROUND + [1, 2, 3, 4, 5, 6].map((n) => REVISION(n)).join("\n");
  const w = checkRevisions(text);
  assert.equal(w.length, 1);
  assert.match(w[0], /^REVISIONS\.md Vòng 1 .*: 6 mục, tối đa 5 mỗi vòng \(references\/revisions\.md\)$/);
  // Rounds are counted separately; headings match without diacritics.
  const split = ROUND + [1, 2, 3].map((n) => REVISION(n)).join("\n") + "\n## Vong 2\n\n" + [4, 5, 6].map((n) => REVISION(n)).join("\n");
  assert.deepEqual(checkRevisions(split), []);
});

test("checkRevisions: a fix missing Giữ nguyên warns once, diacritics optional", () => {
  assert.deepEqual(checkRevisions(ROUND + REVISION(1, "Giữ nguyên")), ["REVISIONS.md R1: thiếu Giữ nguyên"]);
  const plain = ROUND + "### R2\n- Vi tri: 3s\n- Loi thay: chu mo\n- Doi: tang tuong phan\n- Giu nguyen: tieng\n";
  assert.deepEqual(checkRevisions(plain), []);
});

test("final stage: REVISIONS.md warnings only when the file exists, never blocking", () => {
  const dir = proj();
  try {
    past(join(dir, "PLAN.md"));
    demo(dir, 2);
    writeFileSync(join(dir, "DEMO.md"), "approval: user ok 2026-10-12\n");
    let r = check({ project: dir, stage: "final" });
    assert.equal(r.pass, true);
    assert.equal(r.warnings.filter((w) => w.startsWith("REVISIONS.md")).length, 0);
    writeFileSync(join(dir, "REVISIONS.md"), ROUND + REVISION(1, "Lỗi thấy"));
    r = check({ project: dir, stage: "final" });
    assert.equal(r.pass, true);
    assert.deepEqual(r.warnings.filter((w) => w.startsWith("REVISIONS.md")), ["REVISIONS.md R1: thiếu Lỗi thấy"]);
    r = check({ project: dir, stage: "plan" });
    assert.equal(r.warnings.filter((w) => w.startsWith("REVISIONS.md")).length, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("checkRevisions: with scene sheets, a fix that never names its sheet warns once", () => {
  const SHEET_WARN = "REVISIONS.md R1: Vị trí chưa trỏ sheet của cảnh (vd. cảnh 3 (demo/scenes/sheet-s3.jpg))";
  assert.deepEqual(checkRevisions(ROUND + REVISION(1), { sheets: true }), [SHEET_WARN]);
  const pointed = ROUND + REVISION(1).replace("cảnh 2", "cảnh 2 (demo/scenes/sheet-s2.jpg)");
  assert.deepEqual(checkRevisions(pointed, { sheets: true }), []);
  assert.deepEqual(checkRevisions(ROUND + REVISION(1)), []);
});

test("final stage: the sheet WARN only for a creative project whose DEMO.md lists scene_sheets, never blocking", () => {
  const stubs = { sync: () => ({ lines: [], errors: [], warnings: [], missing: false, none: true }), words: () => ({ lines: [], errors: [], warnings: [] }), balance: () => ({ level: "PASS", line: "BALANCE ok" }) };
  const sheetWarns = (r) => r.warnings.filter((w) => w.includes("sheet của cảnh"));
  const d = mkdtempSync(join(tmpdir(), "pf-sheets-"));
  cpSync(fileURLToPath(new URL("./fixtures/creative-good", import.meta.url)), d, { recursive: true });
  try {
    writeFileSync(join(d, "REVISIONS.md"), ROUND + REVISION(1));
    writeFileSync(join(d, "DEMO.md"), "animatic: demo/animatic.mp4\napproval: user ok 2026-10-12\n");
    assert.deepEqual(sheetWarns(check({ project: d, stage: "final", ...stubs })), []);
    writeFileSync(join(d, "DEMO.md"), "animatic: demo/animatic.mp4\nscene_sheets: demo/scenes/sheet-s1.jpg, demo/scenes/sheet-s2.jpg\napproval: user ok 2026-10-12\n");
    const r = check({ project: d, stage: "final", ...stubs });
    assert.deepEqual(sheetWarns(r), ["REVISIONS.md R1: Vị trí chưa trỏ sheet của cảnh (vd. cảnh 3 (demo/scenes/sheet-s3.jpg))"]);
    assert.ok(!r.errors.some((e) => e.includes("sheet")), JSON.stringify(r.errors));
    writeFileSync(join(d, "REVISIONS.md"), ROUND + REVISION(1).replace("cảnh 2", "cảnh 2 (demo/scenes/sheet-s2.jpg)"));
    assert.deepEqual(sheetWarns(check({ project: d, stage: "final", ...stubs })), []);
  } finally { rmSync(d, { recursive: true, force: true }); }
  const legacy = proj();
  try {
    past(join(legacy, "PLAN.md"));
    demo(legacy, 2);
    writeFileSync(join(legacy, "DEMO.md"), "scene_sheets: demo/scenes/sheet-s1.jpg\napproval: user ok 2026-10-12\n");
    writeFileSync(join(legacy, "REVISIONS.md"), ROUND + REVISION(1));
    const r = check({ project: legacy, stage: "final", ...stubs });
    assert.equal(r.pass, true, JSON.stringify(r.errors));
    assert.deepEqual(sheetWarns(r), []);
  } finally { rmSync(legacy, { recursive: true, force: true }); }
});

test("final stage: word-sync FAIL lines block, WARN lines warn, an error blocks; a legacy project never runs it", () => {
  const d = mkdtempSync(join(tmpdir(), "pf-words-"));
  cpSync(fileURLToPath(new URL("./fixtures/creative-good", import.meta.url)), d, { recursive: true });
  try {
    past(join(d, "PLAN.md"), 300);
    mkdirSync(join(d, "demo"), { recursive: true });
    mkdirSync(join(d, "build"), { recursive: true });
    writeFileSync(join(d, "demo", "animatic.mp4"), "x");
    writeFileSync(join(d, "build", "RECIPES.md"), "# RECIPES\n");
    writeFileSync(join(d, "DEMO.md"), "animatic: demo/animatic.mp4\n");
    const brief = readFileSync(join(d, "BRIEF.md"), "utf8"), plan = parsePlan(readFileSync(join(d, "PLAN.md"), "utf8"));
    const sync = () => ({ lines: [], errors: [], warnings: [], missing: false, none: true });
    const run = (words) => {
      const errors = [], warnings = [];
      checkCreative({ dir: d, plan, brief, stage: "final", errors, warnings, motion: () => ({ frames: 90, still: 0, ratio: 0, peak: 9 }), probe: () => ({ width: 540, height: 960 }), sync, words });
      return { errors, warnings };
    };
    const calls = [];
    const r = run((o) => { calls.push(o.dir); return { lines: [], errors: ['WORD   4.70s "kiểm thử" lời 5.00s lệch −300 ms'], warnings: ['WORD   2.20s "ảnh chụp" lời 2.00s lệch +200 ms'] }; });
    assert.deepEqual(calls, [d]);
    assert.ok(r.errors.includes('WORD   4.70s "kiểm thử" lời 5.00s lệch −300 ms'), JSON.stringify(r.errors));
    assert.ok(r.warnings.includes('WORD   2.20s "ảnh chụp" lời 2.00s lệch +200 ms'), JSON.stringify(r.warnings));
    assert.ok(run(() => { throw new Error("HTML not found: x"); }).errors.includes("word-sync: HTML not found: x"));
    const planOnly = [], warnings = [];
    checkCreative({ dir: d, plan, brief, stage: "plan", errors: planOnly, warnings, words: () => { throw new Error("plan stage must not measure"); } });
    assert.ok(!planOnly.some((e) => e.startsWith("word-sync")), JSON.stringify(planOnly));
  } finally { rmSync(d, { recursive: true, force: true }); }
  const legacy = proj();
  try {
    past(join(legacy, "PLAN.md"));
    demo(legacy, 2);
    writeFileSync(join(legacy, "DEMO.md"), "approval: user ok 2026-10-12\n");
    const r = check({ project: legacy, stage: "final", words: () => { throw new Error("legacy project must not run word-sync"); } });
    assert.equal(r.pass, true, JSON.stringify(r.errors));
  } finally { rmSync(legacy, { recursive: true, force: true }); }
});

test("aspect both: a missing or landscape animatic_9x16 points at the reframe edition next to the project first", () => {
  assert.match(verticalHint("/w/promo"), /^reframe\.mjs \. --ratio 9x16, then make-demo\.mjs --animatic --aspect 9x16 --hyperframes \.\.\/promo-9x16 /);
  assert.match(verticalHint("/w/promo/"), /--hyperframes \.\.\/promo-9x16 /, "trailing slash");
  const d = mkdtempSync(join(tmpdir(), "pf-vertical-"));
  cpSync(fileURLToPath(new URL("./fixtures/creative-good", import.meta.url)), d, { recursive: true });
  try {
    writeFileSync(join(d, "BRIEF.md"), readFileSync(join(d, "BRIEF.md"), "utf8").replace(/^aspect: .*$/m, "aspect: both"));
    past(join(d, "PLAN.md"), 300);
    mkdirSync(join(d, "demo", "9x16"), { recursive: true });
    for (const f of ["animatic.mp4", join("9x16", "animatic.mp4")]) writeFileSync(join(d, "demo", f), "x");
    const brief = readFileSync(join(d, "BRIEF.md"), "utf8"), plan = parsePlan(readFileSync(join(d, "PLAN.md"), "utf8"));
    const run = (demoMd) => {
      writeFileSync(join(d, "DEMO.md"), demoMd);
      const errors = [];
      checkCreative({ dir: d, plan, brief, stage: "final", errors, warnings: [], motion: () => ({ frames: 90, still: 0, ratio: 0, peak: 9 }), probe: () => ({ width: 960, height: 540 }), sync: () => ({ errors: [], warnings: [], none: true }), words: () => ({ errors: [], warnings: [] }) });
      return errors;
    };
    const edition = `--hyperframes ../${d.split(/[\\/]/).pop()}-9x16`;
    const missing = run("animatic: demo/animatic.mp4\n").find((e) => e.includes("no `animatic_9x16:`"));
    assert.ok(missing && missing.includes("reframe.mjs . --ratio 9x16") && missing.includes(edition), missing);
    assert.ok(missing.indexOf("reframe.mjs") < missing.indexOf("compositions/main-9x16.html"), "the reframe edition comes before the legacy composition");
    const landscape = run("animatic: demo/animatic.mp4\nanimatic_9x16: demo/9x16/animatic.mp4\n").find((e) => e.includes("not portrait"));
    assert.ok(landscape && landscape.includes(edition), landscape);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

// ---------- beat contract ("## Nhịp") ----------

const beatPlan = (beat) => parsePlan(`# P\n\n## Cảnh\n| # | Thời điểm |\n|---|---|\n| 1 | 0–5s |\n| 2 | 5–9s |\n| 3 | 9–14s |\n| 4 | 14–20s |\n${beat === null ? "" : `\n## Nhịp\n${beat}\n`}`);
const beat = (hook, hero, hold) => `- Hook: ${hook}\n- Cao trào: cảnh ${hero}\n- Giữ cuối: ${hold}`;

test("beat contract: a missing section is one WARN", () => {
  const w = beatWarnings(beatPlan(null));
  assert.equal(w.length, 1);
  assert.ok(w[0].includes("## Nhịp"));
});

test("beat contract: hook, hero band and end hold within thresholds give no WARN", () => {
  assert.deepEqual(beatWarnings(beatPlan(beat("0.3s", 4, "1s"))), []);
});

test("beat contract: each threshold miss is one WARN", () => {
  const late = beatWarnings(beatPlan(beat("0.8s", 4, "1s")));
  assert.equal(late.length, 1);
  assert.ok(late[0].includes("hook 0.8s"));
  const early = beatWarnings(beatPlan(beat("0.3s", 2, "1s")));
  assert.equal(early.length, 1);
  assert.ok(early[0].includes("25%") && early[0].includes("55–78%"), early[0]);
  const long = beatWarnings(beatPlan(beat("0.3s", 4, "2,5s")));
  assert.equal(long.length, 1);
  assert.ok(long[0].includes("giữ cuối 2.5s"));
  const unknown = beatWarnings(beatPlan(beat("0.3s", 9, "1s")));
  assert.equal(unknown.length, 1);
  assert.ok(unknown[0].includes("không có trong"));
});

test("parseBeat reads lines without diacritics and with decimal commas", () => {
  assert.deepEqual(parseBeat("- hook: 0,4 s\n- Cao trao: s3\n- Giu cuoi: 0.9"), { hook: 0.4, hero: "3", hold: 0.9 });
  assert.equal(parseBeat("- Cao trào: cảnh #3").hero, "3");
});
