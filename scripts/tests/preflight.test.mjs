import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { check, parsePlan, isPng } from "../check-preflight.mjs";
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
    assert.match(r.warnings[0], /index\.html/);
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
