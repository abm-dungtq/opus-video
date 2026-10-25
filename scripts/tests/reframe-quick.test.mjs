import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REFRAME = fileURLToPath(new URL("../reframe.mjs", import.meta.url));
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
const run = (args) => spawnSync(process.execPath, [REFRAME, ...args], { encoding: "utf8" });
const probe = (file, stream, entries) =>
  spawnSync("ffprobe", ["-v", "error", "-select_streams", stream, "-show_entries", `stream=${entries}`, "-of", "csv=p=0:s=x", file], { encoding: "utf8" }).stdout.trim();

// One 1920x1080, 1 s clip with a tone, shared by the tests below.
let dir, input;
function clip() {
  if (input) return input;
  dir = mkdtempSync(join(tmpdir(), "ov-quick-"));
  input = join(dir, "in.mp4");
  const r = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=1920x1080:rate=30:duration=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", input]);
  assert.equal(r.status, 0, String(r.stderr));
  return input;
}
test.after(() => dir && rmSync(dir, { recursive: true, force: true }));

test("--quick 9x16 lays the video on a blurred fill, keeps audio and warns it is a stopgap", { skip: !hasFfmpeg && "ffmpeg missing" }, () => {
  const r = run(["--quick", "--video", clip(), "--ratio", "9x16"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout + r.stderr, /WARN reframe --quick/);
  const out = join(dir, "in-9x16-quick.mp4");
  assert.match(r.stdout, new RegExp(`QUICK .*in-9x16-quick\\.mp4 1080x1920`));
  assert.equal(probe(out, "v:0", "width,height"), "1080x1920");
  assert.equal(probe(out, "a:0", "codec_type"), "audio");
});

test("--quick 1x1 crops the centre square", { skip: !hasFfmpeg && "ffmpeg missing" }, () => {
  const out = join(workDir(), "sq.mp4");
  const r = run(["--quick", "--video", clip(), "--ratio", "1x1", "--out", out]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(probe(out, "v:0", "width,height"), "1080x1080");
  const again = run(["--quick", "--video", clip(), "--ratio", "1x1", "--out", out]);
  assert.equal(again.status, 2, again.stderr);
  assert.match(again.stderr, /đã có/);
});

test("--quick without --video is a usage error", () => {
  const r = run(["--quick", "--ratio", "9x16"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--video is required/);
});

test("--quick with a bad ratio or an unknown flag is a usage error", () => {
  assert.equal(run(["--quick", "--video", "x.mp4", "--ratio", "4x5"]).status, 2);
  assert.equal(run(["--quick", "--video", "x.mp4", "--ratio", "9x16", "--force"]).status, 2);
});

function workDir() { clip(); return dir; }
