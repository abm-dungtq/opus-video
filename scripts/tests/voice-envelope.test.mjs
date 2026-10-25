// voice-envelope.mjs: loudness per frame of the voice tracks, cached until a track changes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { voiceEnvelope } from "../voice-envelope.mjs";

const skip = spawnSync("ffmpeg", ["-version"]).status !== 0 && "ffmpeg missing";
const HTML = `<!DOCTYPE html><html lang="vi" data-voice-env><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="4">
<audio id="vo-01" src="assets/voice/01.wav" data-start="0" data-duration="1"></audio>
<audio id="vo-02" src="assets/voice/02.wav" data-start="2" data-duration="1"></audio>
</div></body></html>`;

function project() {
  const dir = mkdtempSync(join(tmpdir(), "venv-"));
  mkdirSync(join(dir, "assets/voice"), { recursive: true });
  for (const n of ["01", "02"]) {
    const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=1", join(dir, `assets/voice/${n}.wav`)]);
    assert.equal(r.status, 0, String(r.stderr));
  }
  writeFileSync(join(dir, "index.html"), HTML);
  return dir;
}
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

test("two voice tracks: one value per frame, loud while they speak, near zero between, cached", { skip }, () => {
  const dir = project();
  try {
    let calls = 0;
    const run = (...a) => { calls++; return spawnSync(...a); };
    const args = { dir, htmlPath: join(dir, "index.html"), fps: 30, duration: 4, run };
    const first = voiceEnvelope(args);
    assert.deepEqual(first.warnings, []);
    assert.equal(first.env.length, 120);
    assert.ok(mean(first.env.slice(0, 30)) > 0.5, String(mean(first.env.slice(0, 30))));
    assert.ok(mean(first.env.slice(35, 56)) < 0.05, String(mean(first.env.slice(35, 56))));
    assert.ok(mean(first.env.slice(60, 90)) > 0.5);
    const n = calls;
    assert.equal(n, 2);
    const again = voiceEnvelope(args);
    assert.deepEqual(again.env, first.env);
    assert.equal(calls, n, "the cached envelope does not run ffmpeg");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a changed data-duration or data-media-start misses the cache; media start skips the head of the file", { skip }, () => {
  const dir = project();
  try {
    let calls = 0;
    const run = (...a) => { calls++; return spawnSync(...a); };
    const htmlPath = join(dir, "index.html");
    voiceEnvelope({ dir, htmlPath, fps: 30, duration: 4, run });
    const n = calls;
    writeFileSync(htmlPath, HTML.replace('data-start="2" data-duration="1"', 'data-start="2" data-duration="0.5"'));
    const cut = voiceEnvelope({ dir, htmlPath, fps: 30, duration: 4, run });
    assert.ok(calls > n, "a new data-duration decodes again");
    assert.ok(mean(cut.env.slice(78, 90)) < 0.05, "the cut tail is silent");
    writeFileSync(htmlPath, HTML.replace('data-start="2" data-duration="1"', 'data-start="2" data-duration="1" data-media-start="0.5"'));
    const m = calls;
    const late = voiceEnvelope({ dir, htmlPath, fps: 30, duration: 4, run });
    assert.ok(calls > m);
    assert.ok(mean(late.env.slice(60, 72)) > 0.5, "the second half of the file plays from 2 s");
    assert.ok(mean(late.env.slice(78, 90)) < 0.05, "and ends 0.5 s later");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a missing voice file: env [] and a warning, no throw", () => {
  const dir = mkdtempSync(join(tmpdir(), "venv-"));
  try {
    writeFileSync(join(dir, "index.html"), HTML);
    const r = voiceEnvelope({ dir, htmlPath: join(dir, "index.html"), fps: 30, duration: 4 });
    assert.deepEqual(r.env, []);
    assert.match(r.warnings[0], /^voice-env: không thấy .*01\.wav$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
