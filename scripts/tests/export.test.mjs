import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, parseLoudnormJson, demoFrames, pickThumb, targetSize, verifyOutput, TARGETS, GATE_EXIT } from "../export.mjs";

// Real loudnorm print_format=json tail (ffmpeg 8.1).
const LOUD = `[Parsed_loudnorm_0 @ 0x7c1a004d80]
{
	"input_i" : "-21.45",
	"input_tp" : "-17.62",
	"input_lra" : "0.00",
	"input_thresh" : "-31.45",
	"output_i" : "-14.05",
	"output_tp" : "-10.21",
	"output_lra" : "0.00",
	"output_thresh" : "-24.05",
	"normalization_type" : "linear",
	"target_offset" : "0.05"
}`;

const PLAN = `# PLAN

## Mục tiêu
Thử xuất theo nơi đăng.

## Cảnh
| # | Thời điểm | Lời đọc | Hình / hiệu ứng | Âm thanh |
|---|---|---|---|---|
| 1 | 0–3s | Thử | Màu | sine |

## Âm thanh
Sine 440 Hz.

## Engine
HyperFrames general-video, 16:9.

## Khung hình demo
- 1 — khung thử

## QA
qc-mp4.
`;

const quiet = { out: () => {}, err: () => {} };
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
const ff = (args) => { const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); };

// Project that passes check-preflight --stage final; demo frame is a real PNG made by ffmpeg.
function project({ approval = 'approval: test 2026-10-13 "ok"' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "export-"));
  writeFileSync(join(dir, "BRIEF.md"), "---\naspect: 16:9\ncreative_override: legacy fixture without a creative pitch\n---\n");
  writeFileSync(join(dir, "PLAN.md"), PLAN);
  const t = Date.now() / 1000 - 100;
  utimesSync(join(dir, "PLAN.md"), t, t);
  mkdirSync(join(dir, "demo"));
  mkdirSync(join(dir, "renders"));
  ff(["-f", "lavfi", "-i", "testsrc=s=320x180:d=1", "-frames:v", "1", join(dir, "demo", "frame-00-at-1s.png")]);
  writeFileSync(join(dir, "DEMO.md"), `# DEMO\n\n${approval}\n\n## Frames\n\n- demo/frame-00-at-1s.png (main)\n`);
  return dir;
}

test("parseLoudnormJson reads the five measured values from the last JSON block", () => {
  assert.deepEqual(parseLoudnormJson(`noise {"input_i":"0"}\n${LOUD}`), { input_i: -21.45, input_tp: -17.62, input_lra: 0, input_thresh: -31.45, target_offset: 0.05 });
  assert.throws(() => parseLoudnormJson("no json here"), /no JSON/);
  assert.throws(() => parseLoudnormJson(LOUD.replace('"-21.45"', '"-inf"')), /input_i/);
});

test("targetSize: zalo scales the short side to 720, others keep the size", () => {
  assert.deepEqual(targetSize(TARGETS.zalo, 1080, 1920), { width: 720, height: 1280, scale: "scale=720:-2" });
  assert.deepEqual(targetSize(TARGETS.zalo, 1920, 1080), { width: 1280, height: 720, scale: "scale=-2:720" });
  assert.deepEqual(targetSize(TARGETS.youtube, 1080, 1920), { width: 1080, height: 1920, scale: null });
});

test("verifyOutput flags fps, duration, size and loudness drift", () => {
  const src = { width: 1280, height: 720, fps: 30, duration: 3, hasAudio: true };
  assert.deepEqual(verifyOutput(src, { ...src }, TARGETS.youtube, { I: -14.3 }), []);
  const bad = verifyOutput(src, { width: 1280, height: 720, fps: 25, duration: 3.8 }, TARGETS.zalo, { I: -16 });
  assert.equal(bad.length, 3);
  assert.ok(bad.some((b) => b.startsWith("fps")) && bad.some((b) => b.startsWith("duration")) && bad.some((b) => b.startsWith("loudness")));
  assert.deepEqual(verifyOutput(src, { width: 1280, height: 720, fps: 30, duration: 3 }, TARGETS.zalo, { I: -14 }), []);
  assert.ok(verifyOutput(src, { width: 1920, height: 1080, fps: 30, duration: 3 }, TARGETS.zalo, { I: -14 })[0].startsWith("size"));
});

test("demoFrames / pickThumb: 9:16 label for portrait, falls back to main", () => {
  const md = "approval: x\n\n## Frames\n\n- demo/a.png (main)\n- demo/b.png (main)\n- demo/9x16/c.png (9:16)\n\n## Notes\n- demo/z.png (main)\n";
  const f = demoFrames(md);
  assert.equal(f.length, 3);
  assert.equal(pickThumb(f, true).path, "demo/9x16/c.png");
  assert.equal(pickThumb(f, false, 1).path, "demo/b.png");
  assert.equal(pickThumb(f.filter((x) => x.label === "main"), true).path, "demo/a.png");
  assert.equal(pickThumb(f, false, 5), null);
});

test("bad usage exits 2", () => {
  assert.equal(main([], quiet), 2);
  assert.equal(main(["--input", "x.mp4"], quiet), 2);
  assert.equal(main(["--input", "x.mp4", "--target", "myspace"], quiet), 2);
  assert.equal(main(["--input", "x.mp4", "--target", "zalo", "--thumb-frame", "-1"], quiet), 2);
  assert.equal(main(["--input", "x.mp4", "--target", "zalo", "--bogus"], quiet), 2);
});

test("gate runs before the input check: no PLAN.md exits 5 even with a missing input", () => {
  const dir = mkdtempSync(join(tmpdir(), "export-"));
  try {
    assert.equal(main(["--project", dir, "--input", join(dir, "missing.mp4"), "--target", "zalo"], quiet), GATE_EXIT);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("DEMO.md approval pending exits 5", { skip: !hasFfmpeg && "ffmpeg not found" }, () => {
  const dir = project({ approval: "approval: pending" });
  try {
    writeFileSync(join(dir, "renders", "x.mp4"), "");
    assert.equal(main(["--project", dir, "--input", join(dir, "renders", "x.mp4"), "--target", "zalo"], quiet), GATE_EXIT);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("exports zalo + youtube with a thumbnail; refuses to overwrite", { skip: !hasFfmpeg && "ffmpeg not found" }, () => {
  const dir = project();
  try {
    const input = join(dir, "renders", "clip.mp4");
    ff(["-f", "lavfi", "-i", "testsrc=s=1280x720:r=30:d=3", "-f", "lavfi", "-i", "sine=f=440:d=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", input]);
    assert.equal(main(["--project", dir, "--input", join(dir, "renders", "nope.mp4"), "--target", "zalo"], quiet), 2);
    const logs = [];
    const code = main(["--project", dir, "--input", input, "--target", "zalo,youtube"], { out: (s) => logs.push(s), err: (s) => logs.push(s) });
    assert.equal(code, 0, logs.join(""));
    for (const f of ["clip-zalo.mp4", "clip-youtube.mp4", "clip-thumb.jpg"]) assert.ok(existsSync(join(dir, "renders", f)), f);
    const p = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", join(dir, "renders", "clip-zalo.mp4")], { encoding: "utf8" });
    const [w, h] = p.stdout.trim().split(",").map(Number);
    assert.equal(Math.min(w, h), 720);
    assert.equal(main(["--project", dir, "--input", input, "--target", "zalo"], quiet), 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
