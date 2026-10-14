import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTracks, buildArgs, dynamicAudio } from "../audio-mix.mjs";

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
  assert.deepEqual(t[0], { id: "vo", src: "/proj/assets/vo.mp3", start: 1.5, duration: 4, volume: 1, mediaStart: 0, rate: 1, group: "voiceover" });
  assert.deepEqual(t[1], { id: "bgm", src: "/proj/assets/bgm.mp3", start: 0, duration: 10, volume: 0.3, mediaStart: 2, rate: 1, group: null });
  assert.deepEqual(t[2], { id: "talk", src: "/proj/assets/talk.mp4", start: 3, duration: 6, volume: 1, mediaStart: 0, rate: 1.25, group: null });
});

test("parseTracks: a tag without an id gives id null", () => {
  assert.equal(parseTracks(`<audio src="assets/a.mp3" data-start="1"></audio>`, BASE)[0].id, null);
});

test("parseTracks: a <video> written over several lines", () => {
  const html = `<video
    id="pip-video"
    src="assets/video/clip.mp4"
    data-start="0.5" data-duration="60.18" data-has-audio="true" data-volume="0.8"></video>`;
  const t = parseTracks(html, BASE);
  assert.equal(t.length, 1);
  assert.deepEqual(t[0], { id: "pip-video", src: "/proj/assets/video/clip.mp4", start: 0.5, duration: 60.18, volume: 0.8, mediaStart: 0, rate: 1, group: null });
});

test("buildArgs: per-track filters, adelay in ms, amix without normalize, length bounded by samples and -t", () => {
  const t = parseTracks(HTML, BASE);
  const args = buildArgs(t, 12, "/tmp/out.wav");
  const fc = args[args.indexOf("-filter_complex") + 1];
  assert.equal(args.filter((a) => a === "-i").length, 3);
  assert.match(fc, /adelay=1500:all=1/);
  assert.match(fc, /amix=inputs=3:normalize=0,apad=whole_dur=12,atrim=end_sample=576000\[out\]/);
  assert.match(fc, /\[1:a\]atrim=start=2:duration=10,asetpts=PTS-STARTPTS,volume=0\.3,adelay=0:all=1,aresample=48000\[a1\]/);
  assert.match(fc, /\[2:a\]atrim=start=0:duration=7\.5,asetpts=PTS-STARTPTS,atempo=1\.25,volume=1,adelay=3000:all=1/);
  assert.ok(!fc.split(";")[0].includes("atempo"), "rate 1 adds no atempo");
  assert.deepEqual(args.slice(-9), ["-ar", "48000", "-ac", "2", "-t", "12", "-fs", String(576000 * 4 + (1 << 20)), "/tmp/out.wav"]);
  assert.ok(args.includes("-nostdin"));
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

test("dynamicAudio: flags Web Audio attributes and GSAP volume tweens, not the word fade", () => {
  const plain = `<div class="fade-in"></div><audio src="a.mp3" data-volume="0.3"></audio>
<script>tl.to("#t", { opacity: 0 }); // fade out the title</script>`;
  assert.deepEqual(dynamicAudio(plain), []);
  assert.deepEqual(dynamicAudio(`<!-- <audio data-automation="x"> --><p>no</p>`), [], "comments are ignored");
  assert.deepEqual(dynamicAudio(`<audio src="v.mp3" data-audio-group="voiceover"></audio>`), ["data-audio-group"]);
  assert.deepEqual(dynamicAudio(`<audio\n  src="b.mp3"\n  data-automation='[]' data-fx-chain="eq"></audio><audio data-fx-carve="vo"></audio>`), ["data-automation", "data-fx-chain", "data-fx-carve"]);
  assert.deepEqual(dynamicAudio(`<script>tl.to(bgm, { volume: 0, duration: 1 }, 4);</script>`), ["GSAP tween on volume"]);
  assert.deepEqual(dynamicAudio(`<script>gsap.fromTo(a, {"volume": 1}, {"volume": 0});</script>`), ["GSAP tween on volume"]);
  assert.deepEqual(dynamicAudio(`<p>volume: loud</p>`), [], "only inside <script>");
  assert.deepEqual(dynamicAudio(`<script>document.querySelector("#bgm").volume = 0.2;</script>`), ["script sets .volume"]);
  assert.deepEqual(dynamicAudio(`<script>if (a.volume === 1) {}</script>`), [], "a comparison is not an assignment");
});

test("parseTracks/--base: a src missing next to the HTML falls back to the project root", () => {
  const dir = mkdtempSync(join(tmpdir(), "amix-base-"));
  try {
    const sub = join(dir, "compositions");
    mkdirSync(sub);
    mkdirSync(join(dir, "assets"));
    spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", join(dir, "assets/a.wav")]);
    const html = join(sub, "main-9x16.html");
    writeFileSync(html, `<audio src="assets/a.wav" data-start="0" data-duration="1"></audio>`);
    assert.equal(parseTracks(readFileSync(html, "utf8"), sub)[0].src, join(sub, "assets/a.wav"));
    assert.equal(parseTracks(readFileSync(html, "utf8"), sub, dir)[0].src, join(dir, "assets/a.wav"));
    assert.equal(spawnSync("node", [CLI, "--html", html, "--duration", "1", "--out", join(dir, "m.wav")], { encoding: "utf8" }).status, 2, "without --base the src is missing");
    const r = spawnSync("node", [CLI, "--html", html, "--duration", "1", "--out", join(dir, "m.wav"), "--base", dir], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
