import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { sceneSheets, writeDemoMd, MIN_SHEET_S } from "../make-demo.mjs";
import { planScenes } from "../timing.mjs";

const HAS_FFMPEG = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
const PLAN = (rows) => `# PLAN

## Cảnh
| # | Thời điểm | Lời đọc | Hình |
|---|---|---|---|
${rows}
`;

test("sceneSheets: one 6x3 sheet per scene of a 6 s animatic", { skip: !HAS_FFMPEG && "ffmpeg not found" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ov-sheets-"));
  try {
    const mp4 = join(dir, "animatic.mp4");
    const r = spawnSync("ffmpeg", ["-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=480x270:rate=30:duration=6", "-c:v", "libx264", "-pix_fmt", "yuv420p", mp4]);
    assert.equal(r.status, 0, String(r.stderr));
    mkdirSync(join(dir, "scenes"));
    writeFileSync(join(dir, "scenes", "sheet-s9.jpg"), "stale");
    const scenes = planScenes(PLAN("| 1 | 0–3s | Mở | Logo |\n| 2 | 3–6s | Kết | CTA |"));
    const warns = [];
    const out = sceneSheets(mp4, scenes, dir, { warn: (s) => warns.push(s) });
    assert.deepEqual(warns, []);
    assert.deepEqual(out, [join(dir, "scenes", "sheet-s1.jpg"), join(dir, "scenes", "sheet-s2.jpg")]);
    assert.deepEqual(readdirSync(join(dir, "scenes")).sort(), ["sheet-s1.jpg", "sheet-s2.jpg"]);
    const size = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", out[0]], { encoding: "utf8" });
    assert.equal(size.stdout.trim(), "1920,540"); // 6 x 320 wide, 3 x 180 high
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("sceneSheets: a scene shorter than 0.5 s is skipped with a WARN; the ffmpeg call matches the review recipe", () => {
  const dir = mkdtempSync(join(tmpdir(), "ov-sheets-"));
  try {
    const calls = [], warns = [];
    const run = (cmd, args) => { calls.push([cmd, args]); writeFileSync(args[args.length - 1], "jpg"); return { status: 0 }; };
    const out = sceneSheets("a.mp4", [{ sid: "s1", start: 0, end: MIN_SHEET_S - 0.1 }, { sid: "s2", start: 0.4, end: 2.9 }], dir, { run, warn: (s) => warns.push(s) });
    assert.deepEqual(warns, ["WARN cảnh s1 quá ngắn để làm sheet"]);
    assert.deepEqual(out, [join(dir, "scenes", "sheet-s2.jpg")]);
    assert.equal(calls.length, 1);
    const args = calls[0][1];
    assert.equal(args[args.indexOf("-ss") + 1], "0.4");
    assert.equal(args[args.indexOf("-t") + 1], "2.5");
    assert.equal(args[args.indexOf("-vf") + 1], "fps=18/2.5,scale=320:-1,tile=6x3");
    assert.equal(args[args.indexOf("-frames:v") + 1], "1");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("sceneSheets: a failed ffmpeg call is a WARN and the sheet is not listed", () => {
  const dir = mkdtempSync(join(tmpdir(), "ov-sheets-"));
  try {
    const warns = [];
    const out = sceneSheets("a.mp4", [{ sid: "s1", start: 0, end: 2 }], dir, { run: () => ({ status: 1 }), warn: (s) => warns.push(s) });
    assert.deepEqual(out, []);
    assert.deepEqual(warns, ["WARN cảnh s1: ffmpeg không cắt được sheet"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("writeDemoMd: scene_sheets follows the animatic of its aspect and is dropped by a stills-only run", () => {
  const dir = mkdtempSync(join(tmpdir(), "ov-demo-md-"));
  try {
    const read = () => readFileSync(join(dir, "DEMO.md"), "utf8");
    writeDemoMd(dir, ["demo/frame-00-at-1s.png"], "main", "", "demo/animatic.mp4", ["demo/scenes/sheet-s1.jpg", "demo/scenes/sheet-s2.jpg"]);
    assert.match(read(), /^animatic: demo\/animatic\.mp4\nscene_sheets: demo\/scenes\/sheet-s1\.jpg, demo\/scenes\/sheet-s2\.jpg\napproval: pending$/m);
    writeDemoMd(dir, ["demo/9x16/frame-00-at-1s.png"], "9:16", "", "demo/9x16/animatic.mp4", ["demo/9x16/scenes/sheet-s1.jpg"]);
    assert.match(read(), /^scene_sheets: demo\/scenes\/sheet-s1\.jpg, demo\/scenes\/sheet-s2\.jpg$/m);
    assert.match(read(), /^scene_sheets_9x16: demo\/9x16\/scenes\/sheet-s1\.jpg$/m);
    assert.equal(read().match(/^scene_sheets:/gm).length, 1);
    writeDemoMd(dir, ["demo/frame-00-at-1s.png"], "main");
    assert.doesNotMatch(read(), /^(?:animatic|scene_sheets):/m);
    assert.match(read(), /^scene_sheets_9x16: /m);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
