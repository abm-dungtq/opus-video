import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { check, checkRevisions, parsePlan, isPng, readableHold, holdWarnings, parseTable, spanBounds, spanSeconds } from "../check-preflight.mjs";
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
