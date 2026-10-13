import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTracks, buildArgs } from "../audio-mix.mjs";

const CLI = fileURLToPath(new URL("../audio-mix.mjs", import.meta.url));
const BASE = "/proj";

const HTML = `
<!-- quoted in prose, not a clip: <video id="pip-video"> -->
<audio id="vo" src="assets/vo.mp3" data-start="1.5" data-duration="4" data-track-index="2" data-audio-group="voiceover"></audio>
<audio id="bgm" src="assets/bgm.mp3" data-start="0" data-duration="10" data-volume="0.3" data-media-start="2"></audio>
<video id="broll" src="assets/broll.mp4" muted playsinline data-start="0" data-duration="5"></video>
<video id="talk" src="assets/talk.mp4" playsinline data-start="3" data-duration="6" data-has-audio="true" data-playback-rate="1.25"></video>
<audio id="silent" src="assets/x.mp3" data-start="0" data-duration="1" data-volume="0"></audio>
`;

test("parseTracks: audio + unmuted video, defaults, skips muted, volume 0 and comments", () => {
  const t = parseTracks(HTML, BASE);
  assert.equal(t.length, 3);
  assert.deepEqual(t[0], { src: "/proj/assets/vo.mp3", start: 1.5, duration: 4, volume: 1, mediaStart: 0, rate: 1, group: "voiceover" });
  assert.deepEqual(t[1], { src: "/proj/assets/bgm.mp3", start: 0, duration: 10, volume: 0.3, mediaStart: 2, rate: 1, group: null });
  assert.deepEqual(t[2], { src: "/proj/assets/talk.mp4", start: 3, duration: 6, volume: 1, mediaStart: 0, rate: 1.25, group: null });
});

test("parseTracks: a <video> written over several lines", () => {
  const html = `<video
    id="pip-video"
    src="assets/video/clip.mp4"
    data-start="0.5" data-duration="60.18" data-has-audio="true" data-volume="0.8"></video>`;
  const t = parseTracks(html, BASE);
  assert.equal(t.length, 1);
  assert.deepEqual(t[0], { src: "/proj/assets/video/clip.mp4", start: 0.5, duration: 60.18, volume: 0.8, mediaStart: 0, rate: 1, group: null });
});

test("buildArgs: per-track filters, adelay in ms, amix without normalize", () => {
  const t = parseTracks(HTML, BASE);
  const args = buildArgs(t, 12, "/tmp/out.wav");
  const fc = args[args.indexOf("-filter_complex") + 1];
  assert.equal(args.filter((a) => a === "-i").length, 3);
  assert.match(fc, /adelay=1500:all=1/);
  assert.match(fc, /amix=inputs=3:normalize=0,apad,atrim=duration=12\[out\]/);
  assert.match(fc, /\[1:a\]atrim=start=2:duration=10,asetpts=PTS-STARTPTS,volume=0\.3,adelay=0:all=1,aresample=48000\[a1\]/);
  assert.match(fc, /\[2:a\]atrim=start=0:duration=7\.5,asetpts=PTS-STARTPTS,atempo=1\.25,volume=1,adelay=3000:all=1/);
  assert.ok(!fc.split(";")[0].includes("atempo"), "rate 1 adds no atempo");
  assert.deepEqual(args.slice(-5), ["-ar", "48000", "-ac", "2", "/tmp/out.wav"]);
  assert.throws(() => buildArgs([], 3, "/tmp/x.wav"), /no audible tracks/);
});

test("CLI: bad usage and missing src exit 2", () => {
  const dir = mkdtempSync(join(tmpdir(), "amix-"));
  try {
    assert.equal(spawnSync("node", [CLI, "--html"], { encoding: "utf8" }).status, 2);
    assert.equal(spawnSync("node", [CLI, "--bogus"], { encoding: "utf8" }).status, 2);
    const html = join(dir, "index.html");
    writeFileSync(html, `<audio src="nope.mp3" data-start="0" data-duration="1"></audio>`);
    assert.equal(spawnSync("node", [CLI, "--html", html, "--duration", "abc", "--out", join(dir, "o.wav")], { encoding: "utf8" }).status, 2);
    const r = spawnSync("node", [CLI, "--html", html, "--duration", "3", "--out", join(dir, "o.wav")], { encoding: "utf8" });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /src not found/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI: mixes two sine files into a WAV of the requested length", () => {
  const dir = mkdtempSync(join(tmpdir(), "amix-"));
  try {
    for (const [name, f] of [["a.wav", 440], ["b.wav", 660]]) {
      const g = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `sine=f=${f}:d=1`, join(dir, name)], { encoding: "utf8" });
      assert.equal(g.status, 0, g.stderr);
    }
    const html = join(dir, "index.html");
    writeFileSync(html, `<audio src="a.wav" data-start="0" data-duration="1"></audio>\n<audio src="b.wav" data-start="1.5" data-duration="1" data-volume="0.5"></audio>`);
    const out = join(dir, "mix.wav");
    const dry = spawnSync("node", [CLI, "--html", html, "--duration", "3", "--out", out, "--dry-run"], { encoding: "utf8" });
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /^ffmpeg .*amix=inputs=2:normalize=0/);
    const r = spawnSync("node", [CLI, "--html", html, "--duration", "3", "--out", out], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const p = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=sample_rate,channels", "-of", "json", out], { encoding: "utf8" });
    const info = JSON.parse(p.stdout);
    assert.ok(Math.abs(Number(info.format.duration) - 3) <= 0.05, `duration ${info.format.duration}`);
    assert.equal(info.streams[0].sample_rate, "48000");
    assert.equal(info.streams[0].channels, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
