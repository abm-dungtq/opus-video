// MOTION ruler per project: BRIEF `motion_override` measures motion drawn on twos across two frames
// and may move the WARN line with a written reason. The defaults and the FAIL line never move.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { LIMITS, measureMotion, motionOverride, motionStep, motionVerdict } from "../qc-mp4.mjs";
import { checkCreative, parsePlan } from "../check-preflight.mjs";

const REASON = "risograph in theo nhịp hai khung, mỗi bản in giữ một khung";
const brief = (extra = {}) => ({ direction: "A1", energy: "vua", ...extra });

test("the default MOTION limits are unchanged", () => {
  assert.deepEqual(LIMITS.motionFail, { default: { still: 0.6, peak: 1.5 }, em: { still: 0.75, peak: 1.0 } });
  assert.deepEqual(LIMITS.motionWarn, { default: { still: 0.45, peak: 2.0 }, em: { still: 0.6, peak: 1.2 } });
  assert.equal(LIMITS.stillYdif, 0.5);
});

test("motionOverride: needs a reason; step 2|3; still/peak only between the WARN and FAIL lines", () => {
  assert.equal(motionOverride(brief()), null);
  assert.match(motionOverride(brief({ motion_override: "step=2" })).error, /cần lý do/);
  assert.match(motionOverride(brief({ motion_override: "step=2 | ngắn" })).error, /cần lý do/);
  assert.deepEqual(motionOverride(brief({ motion_override: `step=2 | ${REASON}` })), { step: 2, still: 0.45, peak: 2.0, reason: REASON });
  assert.deepEqual(motionOverride(brief({ motion_override: `still=0,55 peak=1.6 | ${REASON}` })), { step: 1, still: 0.55, peak: 1.6, reason: REASON });
  assert.match(motionOverride(brief({ motion_override: `step=4 | ${REASON}` })).error, /step phải là 2 hoặc 3/);
  assert.match(motionOverride(brief({ motion_override: `still=0.7 | ${REASON}` })).error, /still phải trong 0\.45…0\.6/);
  assert.match(motionOverride(brief({ motion_override: `still=0.3 | ${REASON}` })).error, /still phải trong/);
  assert.match(motionOverride(brief({ motion_override: `peak=1.2 | ${REASON}` })).error, /peak phải trong 1\.5…2/);
  assert.match(motionOverride(brief({ energy: "em", motion_override: `still=0.8 | ${REASON}` })).error, /still phải trong 0\.6…0\.75/);
  assert.match(motionOverride(brief({ motion_override: `fps=15 | ${REASON}` })).error, /không hiểu "fps=15"/);
  assert.equal(motionStep(brief({ motion_override: `step=3 | ${REASON}` })), 3);
  assert.equal(motionStep(brief({ motion_override: "step=3" })), 1, "no reason, no step");
});

test("motionVerdict: the WARN line moves with a reason, the FAIL line never does", () => {
  const half = { frames: 449, still: 227, ratio: 0.51, peak: 2.6 }; // the watercolor final
  assert.equal(motionVerdict(half, brief()).level, "WARN");
  const ok = motionVerdict(half, brief({ motion_override: `still=0.55 | ${REASON}` }));
  assert.equal(ok.level, "PASS");
  assert.ok(ok.detail.includes(`motion_override: ${REASON}`), ok.detail);
  assert.match(ok.detail, /WARN ≥55%/);
  const slideshow = { frames: 449, still: 316, ratio: 0.7, peak: 1.12 };
  assert.equal(motionVerdict(slideshow, brief({ motion_override: `still=0.6 peak=1.5 | ${REASON}` })).level, "FAIL");
  const noReason = motionVerdict(half, brief({ motion_override: "still=0.55" }));
  assert.equal(noReason.level, "WARN");
  assert.match(noReason.detail, /motion_override cần lý do .*dùng ngưỡng mặc định/);
});

const skip = spawnSync("ffmpeg", ["-version"]).status === 0 ? false : "ffmpeg not installed";
test("step=2: motion drawn on twos is not read as half still", { skip }, () => {
  const d = mkdtempSync(join(tmpdir(), "motion-twos-"));
  try {
    // A moving test pattern drawn at 15 fps and played at 30: every other frame repeats.
    const f = join(d, "twos.mp4");
    const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=15:d=3", "-vf", "fps=30", "-pix_fmt", "yuv420p", f], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const one = measureMotion(f), two = measureMotion(f, undefined, { step: 2 });
    assert.ok(one.ratio >= LIMITS.motionWarn.default.still, `every frame: ${one.ratio}`);
    assert.equal(motionVerdict(one, brief()).level, "WARN");
    assert.ok(two.ratio < 0.1, `two frames apart: ${two.ratio}`);
    assert.equal(motionVerdict(two, brief({ motion_override: `step=2 | ${REASON}` })).level, "PASS");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("check-preflight measures the animatic with the BRIEF's step", () => {
  const d = mkdtempSync(join(tmpdir(), "pf-motion-"));
  cpSync(fileURLToPath(new URL("./fixtures/creative-good", import.meta.url)), d, { recursive: true });
  try {
    const t = Date.now() / 1000 - 300;
    utimesSync(join(d, "PLAN.md"), t, t);
    mkdirSync(join(d, "demo"), { recursive: true });
    mkdirSync(join(d, "build"), { recursive: true });
    writeFileSync(join(d, "demo", "animatic.mp4"), "x");
    writeFileSync(join(d, "build", "RECIPES.md"), "# RECIPES\n");
    writeFileSync(join(d, "DEMO.md"), "animatic: demo/animatic.mp4\n");
    const text = readFileSync(join(d, "BRIEF.md"), "utf8").replace("energy: don-dap\n", `energy: don-dap\nmotion_override: step=2 | ${REASON}\n`);
    const plan = parsePlan(readFileSync(join(d, "PLAN.md"), "utf8"));
    const calls = [];
    const motion = (file, run, opts) => { calls.push(opts); return { frames: 90, still: 0, ratio: 0, peak: 9 }; };
    checkCreative({ dir: d, plan, brief: text, stage: "final", errors: [], warnings: [], motion, probe: () => ({ width: 540, height: 960 }), sync: () => ({ lines: [], errors: [], warnings: [], none: true }), words: () => ({ errors: [], warnings: [] }) });
    assert.deepEqual(calls, [{ step: 2 }]);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
