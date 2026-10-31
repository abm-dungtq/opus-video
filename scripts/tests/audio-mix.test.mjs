import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTracks, buildArgs, dynamicAudio, carveKeys, isVoice, voiceIndices, keyLevelArgs, parseMeanVolume, parseLoudnorm, loudnormPass1Args, staticGain, gainArgs, limitArgs, nextLimitGain, LOUDNORM, MAX_LIMIT_DB, decodeEntities, duckTarget, duckReduction, thresholdAt, searchDrop, CARVE_FLOOR_DB, MAX_REDUCTION_DB } from "../audio-mix.mjs";

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
  assert.deepEqual(t[0], { id: "vo", src: "/proj/assets/vo.mp3", start: 1.5, duration: 4, volume: 1, mediaStart: 0, rate: 1, fadeIn: 0, fadeOut: 0, group: "voiceover", carve: null });
  assert.deepEqual(t[1], { id: "bgm", src: "/proj/assets/bgm.mp3", start: 0, duration: 10, volume: 0.3, mediaStart: 2, rate: 1, fadeIn: 0, fadeOut: 0, group: null, carve: null });
  assert.deepEqual(t[2], { id: "talk", src: "/proj/assets/talk.mp4", start: 3, duration: 6, volume: 1, mediaStart: 0, rate: 1.25, fadeIn: 0, fadeOut: 0, group: null, carve: null });
});

test("isVoice: vo-*, *-voice, group voiceover and a src under assets/voice/ speak; beds and sfx do not", () => {
  const t = parseTracks(`
<audio id="vo-01" src="assets/a.mp3"></audio>
<audio id="el-01-three-jobs-voice" src="assets/el/01.mp3"></audio>
<audio id="narr" src="assets/voice/02.mp3"></audio>
<audio id="n2" src="x.mp3" data-audio-group="voiceover"></audio>
<audio id="bgm" src="assets/bgm/bed.mp3" data-audio-group="music"></audio>
<audio id="sfx-whoosh" src="assets/sfx/whoosh.mp3"></audio>
<audio id="voice-intro" src="assets/voiceover/intro.mp3"></audio>
<audio src="assets/sfx/pop.mp3"></audio>`, BASE);
  assert.deepEqual(t.filter(isVoice).map((x) => x.id), ["vo-01", "el-01-three-jobs-voice", "narr", "n2"]);
  assert.deepEqual(voiceIndices(t), [0, 1, 2, 3]);
  assert.equal(isVoice({ id: null, src: "C:\\proj\\assets\\voice\\01.mp3", group: null }), true, "Windows separators");
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
  assert.deepEqual(t[0], { id: "pip-video", src: "/proj/assets/video/clip.mp4", start: 0.5, duration: 60.18, volume: 0.8, mediaStart: 0, rate: 1, fadeIn: 0, fadeOut: 0, group: null, carve: null });
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

test("buildArgs: data-fade-in / data-fade-out become afade after the volume; no fade, no afade", () => {
  const t = parseTracks(`<audio id="bgm" src="assets/bgm.mp3" data-start="0" data-duration="10" data-volume="0.5" data-fade-in="1" data-fade-out="2"></audio>`, BASE);
  assert.deepEqual([t[0].fadeIn, t[0].fadeOut], [1, 2]);
  const fc = (tracks) => { const a = buildArgs(tracks, 12, "/tmp/out.wav"); return a[a.indexOf("-filter_complex") + 1]; };
  assert.match(fc(t), /volume=0\.5,afade=t=in:st=0:d=1,afade=t=out:st=8:d=2,adelay=0/);
  const sped = fc([{ ...t[0], rate: 2 }]);
  assert.match(sped, /atempo=2,volume=0\.5,afade=t=in:st=0:d=1,afade=t=out:st=8:d=2/, "fade times are seconds on the timeline, after atempo");
  assert.doesNotMatch(fc(parseTracks(HTML, BASE)), /afade/);
  assert.doesNotMatch(fc([{ ...t[0], duration: null, fadeIn: 0 }]), /afade/, "a fade-out needs the clip's duration");
  assert.deepEqual(dynamicAudio(`<audio id="bgm" src="a.mp3" data-fade-in="1" data-fade-out="2"></audio>`), [], "a fade is not dynamic audio");
  assert.match(fc([{ ...t[0], duration: 1.5, fadeIn: 0 }]), /afade=t=out:st=0:d=2,/, "a fade-out longer than the clip starts at 0, never before it");
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
  assert.deepEqual(dynamicAudio(`<audio src="v.mp3" data-audio-group="voiceover"></audio>`), [], "groups are rebuilt");
  assert.deepEqual(dynamicAudio(`<audio\n  src="b.mp3"\n  data-automation='[]' data-fx-chain="eq"></audio><audio data-fx-carve="vo"></audio>`), ["data-automation", "data-fx-chain"], "carve is rebuilt, chain and automation are not");
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

const FIXTURE = fileURLToPath(new URL("./fixtures/audio-mix/carve-index.html", import.meta.url));

test("dynamicAudio: a real composition with data-audio-group and data-fx-carve needs no HyperFrames mixer", () => {
  assert.deepEqual(dynamicAudio(readFileSync(FIXTURE, "utf8")), []);
});

test("parseTracks: data-fx-carve read as {enabled, sources, strength}; sources match an id or a group", () => {
  const t = parseTracks(readFileSync(FIXTURE, "utf8"), BASE);
  const music = t.findIndex((x) => x.id === "music");
  assert.deepEqual(t[music].carve, { enabled: true, sources: ["voiceover"], strength: 0.8 });
  assert.equal(t[music].group, "music");
  assert.deepEqual(carveKeys(t, music).map((i) => t[i].id), ["vo-01", "vo-02"]);
  assert.ok(t.filter((x) => x.id !== "music").every((x) => x.carve === null));
  const byId = parseTracks(`<audio id="vo" src="v.mp3"></audio><audio id="m" src="m.mp3" data-fx-carve='{"sources":["vo","m"]}'></audio>`, BASE);
  assert.deepEqual(byId[1].carve, { enabled: true, sources: ["vo", "m"], strength: 0.5 }, "enabled and strength default");
  assert.deepEqual(carveKeys(byId, 1), [0], "a bed never keys itself");
  const off = parseTracks(`<audio id="vo" src="v.mp3"></audio><audio src="m.mp3" data-fx-carve='{"enabled":false,"sources":["vo"]}'></audio>`, BASE);
  assert.deepEqual(carveKeys(off, 1), []);
  assert.throws(() => parseTracks(`<audio id="music" src="m.mp3" data-fx-carve="voiceover"></audio>`, BASE), /data-fx-carve on <audio #music> is not valid JSON/);
  assert.throws(() => parseTracks(`<audio src="m.mp3" data-fx-carve='[1]'></audio>`, BASE), /src="m\.mp3".*JSON object/);
});

test("duck aim: target 4 + 2.5*strength, wanted = target − natural clamped to 0..12, threshold clamped to −50..0 dBFS", () => {
  assert.equal(duckTarget(0.8), 6);
  assert.equal(duckTarget(0), 4);
  assert.ok(Math.abs(duckReduction(3.7, 0.8) - 2.3) < 1e-9);
  assert.equal(duckReduction(8, 0.8), 0, "already far enough under");
  assert.equal(duckReduction(-20, 1), MAX_REDUCTION_DB);
  assert.equal(duckReduction(Infinity, 0.8), 0, "music silent during speech");
  assert.equal(duckReduction(-Infinity, 0.8), 0, "voice silent");
  assert.equal(thresholdAt(-20, 3), -23);
  assert.equal(thresholdAt(-45, 12), CARVE_FLOOR_DB);
  assert.equal(thresholdAt(-5, -12), 0);
});

test("searchDrop: bisects the drop until the reduction got is within 0.3 dB, at most 6 measures", () => {
  const calls = [];
  const f = (drop) => { calls.push(drop); return 3.9 + 0.52 * drop; };
  for (const wanted of [2.3, 0.8, 6, 9.5]) {
    calls.length = 0;
    const r = searchDrop(wanted, f);
    assert.ok(r.ok && Math.abs(r.got - wanted) <= 0.3, `wanted ${wanted}: got ${r.got}`);
    assert.ok(calls.length <= 6 && r.passes === calls.length);
  }
  const low = searchDrop(0.1, () => 5);
  assert.equal(low.ok, false, "more reduction than wanted everywhere");
  const lowDrops = []; searchDrop(0.1, (d) => { lowDrops.push(d); return 5; });
  assert.equal(lowDrops.length, 6, "stops after 6 measures");
  assert.ok(lowDrops[5] < -11, "walks to the lowest drop");
  const highDrops = []; const high = searchDrop(20, (d) => { highDrops.push(d); return 1; });
  assert.ok(!high.ok && highDrops[5] > 23, "walks to the highest drop");
  const nan = searchDrop(2, (d) => (d === 6 ? 2.6 : NaN));
  assert.deepEqual(nan, { drop: 6, got: 2.6, passes: 1, ok: false }, "a failed measure keeps the best trial");
  assert.deepEqual(searchDrop(2, () => NaN), { drop: null, got: NaN, passes: 0, ok: false });
});

test("buildArgs: a carve bed is sidechain-ducked by the sum of its sources; stems map voice and ducked music", () => {
  const t = parseTracks(readFileSync(FIXTURE, "utf8"), BASE);
  const music = t.findIndex((x) => x.id === "music");
  const thresholds = []; thresholds[music] = 0.0447;
  const args = buildArgs(t, 15, "/tmp/mix.wav", { thresholds, stems: "/tmp/stems" });
  const fc = args[args.indexOf("-filter_complex") + 1];
  assert.match(fc, /\[a0\]asplit=3\[a0_0\]\[a0_1\]\[a0_2\]/, "voice feeds the key, the mix and the voice stem");
  assert.match(fc, /\[a0_0\]\[a1_0\]amix=inputs=2:normalize=0,apad=whole_dur=15\[k2\]/);
  assert.match(fc, /\[a2\]\[k2\]sidechaincompress=threshold=0\.0447:ratio=20:attack=15:release=350:makeup=1\[d2\]/);
  assert.match(fc, /\[a0_1\]\[a1_1\]\[d2_0\]\[a3\]\[a4\]\[a5\]\[a6\]\[a7\]amix=inputs=8:normalize=0,apad=whole_dur=15,atrim=end_sample=720000\[out\]/);
  assert.match(fc, /\[a0_2\]\[a1_2\]amix=inputs=2:normalize=0,apad=whole_dur=15,atrim=end_sample=720000\[voice\]/);
  assert.match(fc, /\[d2_1\]amix=inputs=1:normalize=0,apad=whole_dur=15,atrim=end_sample=720000\[music\]/);
  const fs = String(720000 * 4 + (1 << 20));
  for (const [map, file] of [["[out]", "/tmp/mix.wav"], ["[voice]", "/tmp/stems/voice.wav"], ["[music]", "/tmp/stems/music.wav"]]) {
    const i = args.indexOf(map);
    assert.deepEqual(args.slice(i + 1, i + 10), ["-ar", "48000", "-ac", "2", "-t", "15", "-fs", fs, file], `${map} bounded`);
  }
  const undocked = buildArgs(t, 15, "/tmp/mix.wav", { stems: "/tmp/stems" });
  const ufc = undocked[undocked.indexOf("-filter_complex") + 1];
  assert.ok(!ufc.includes("sidechaincompress"), "no threshold, no duck");
  assert.match(ufc, /\[a0_1\]\[a1_1\]amix=inputs=2:normalize=0,apad=whole_dur=15,atrim=end_sample=720000\[voice\]/, "the voice stem keeps the carve sources");
  assert.deepEqual(voiceIndices(t).map((i) => t[i].id), ["vo-01", "vo-02"]);
  const plain = buildArgs(parseTracks(HTML, BASE), 12, "/tmp/out.wav");
  assert.ok(!plain.join(" ").includes("sidechaincompress") && !plain.includes("[voice]"), "no carve, no stems: graph unchanged");
});

test("loudnorm: pass 1 prints JSON at -14 LUFS / -1.5 dBTP / LRA 11; pass 2 is one static gain, never loudnorm", () => {
  assert.ok(loudnormPass1Args("/tmp/m.wav").includes("loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json"));
  const stderr = `[Parsed_loudnorm_0 @ 0x1]\n{\n\t"input_i" : "-21.30",\n\t"input_tp" : "-3.10",\n\t"input_lra" : "6.20",\n\t"input_thresh" : "-31.70",\n\t"output_i" : "-14.02",\n\t"target_offset" : "0.02"\n}\n`;
  const m = parseLoudnorm(stderr);
  assert.equal(m.input_i, "-21.30");
  assert.throws(() => parseLoudnorm("nothing"), /no measurement/);
  // Peak-limited: +7.3 dB would reach -14 LUFS but the peak allows +1.6 dB only.
  assert.deepEqual(staticGain(m), { gain: 1.6, outputI: -19.7, peakLimited: true });
  // Room under the ceiling: the full gain, also when it is a cut.
  assert.deepEqual(staticGain({ input_i: "-20.00", input_tp: "-12.00" }), { gain: 6, outputI: -14, peakLimited: false });
  assert.deepEqual(staticGain({ input_i: "-10.00", input_tp: "0.50" }), { gain: -4, outputI: -14, peakLimited: false });
  // Within 0.5 LU of the target: no warning.
  assert.equal(staticGain({ input_i: "-16.00", input_tp: "-3.90" }).peakLimited, false);
  assert.throws(() => staticGain({ input_i: "-inf", input_tp: "-inf" }), /measured I=-inf/);
  const a = gainArgs("/tmp/m.wav", 1.6, 15, "/tmp/o.wav");
  assert.equal(a[a.indexOf("-af") + 1], "volume=1.6dB,apad=whole_dur=15,atrim=end_sample=720000");
  assert.deepEqual(a.slice(-9), ["-ar", "48000", "-ac", "2", "-t", "15", "-fs", String(720000 * 4 + (1 << 20)), "/tmp/o.wav"]);
  assert.equal(parseMeanVolume("[Parsed_volumedetect_0] mean_volume: -19.6 dB"), -19.6);
  assert.equal(parseMeanVolume("mean_volume: -inf dB"), -Infinity);
  assert.throws(() => parseMeanVolume(""), /no mean_volume/);
  const k = keyLevelArgs(parseTracks(readFileSync(FIXTURE, "utf8"), BASE), [0, 1]);
  assert.match(k[k.indexOf("-filter_complex") + 1], /\[c0\]\[c1\]concat=n=2:v=0:a=1,volumedetect\[v\]$/);
  assert.ok(!k[k.indexOf("-filter_complex") + 1].includes("adelay"), "the level is measured without the silence between clips");
});

test("attributes: HTML character references are decoded (entity-encoded data-fx-carve, & in src)", () => {
  const html = `<audio id="vo-01" src="vo.wav" data-audio-group="voiceover"></audio>
<audio id="bgm" src="nh&#7841;c &amp; beat.mp3" data-audio-group="music" data-fx-carve="{&quot;enabled&quot;:true,&quot;sources&quot;:[&#34;voiceover&#x22;],&quot;strength&quot;:0.8}"></audio>`;
  const [, bed] = parseTracks(html, "/p");
  assert.deepEqual(bed.carve, { enabled: true, sources: ["voiceover"], strength: 0.8 });
  assert.equal(bed.src, "/p/nhạc & beat.mp3");
  assert.equal(decodeEntities("&amp;quot; &lt;b&gt; &#39;x&apos; &#0; &bogus;"), "&quot; <b> 'x' &#0; &bogus;");
});

test("CLI: malformed data-fx-carve exits 2 naming the tag", () => {
  const dir = mkdtempSync(join(tmpdir(), "amix-"));
  try {
    const html = join(dir, "index.html");
    writeFileSync(html, `<audio id="music" src="m.wav" data-fx-carve='{"sources":'></audio>`);
    const r = spawnSync("node", [CLI, "--html", html, "--duration", "1", "--out", join(dir, "o.wav")], { encoding: "utf8" });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /#music/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
test("CLI: a carve bed ducks to 6 dB under the voice (strength 0.8), the mix lands at -14 LUFS, stems match the mix length", { skip: !hasFfmpeg && "ffmpeg missing" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "amix-duck-"));
  try {
    spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=220:d=6", "-ac", "2", join(dir, "bed.wav")]);
    spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=880:d=2", join(dir, "vo.wav")]);
    const html = join(dir, "index.html");
    writeFileSync(html, `<audio id="vo-01" src="vo.wav" data-start="2" data-duration="2" data-audio-group="voiceover"></audio>
<audio id="bgm" src="bed.wav" data-start="0" data-duration="6" data-audio-group="music" data-fx-carve='{"enabled":true,"sources":["voiceover"],"strength":0.8}'></audio>`);
    const out = join(dir, "mix.wav"), stems = join(dir, "stems");
    const dry = spawnSync("node", [CLI, "--html", html, "--duration", "6", "--out", out, "--stems", stems, "--loudnorm", "--dry-run"], { encoding: "utf8" });
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /sidechaincompress=threshold=/);
    assert.match(dry.stdout, /loudnorm=I=-14:TP=-1\.5:LRA=11:print_format=json/);
    assert.match(dry.stdout, /volume=/);
    assert.equal(dry.stdout.match(/loudnorm=/g).length, 1, "loudnorm only measures");
    assert.deepEqual(readdirSync(dir).sort(), ["bed.wav", "index.html", "vo.wav"], "dry run writes nothing");
    const r = spawnSync("node", [CLI, "--html", html, "--duration", "6", "--out", out, "--stems", stems, "--loudnorm"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /duck #bgm: natural 0\.0 dB, target 6\.0 dB, wanted 6\.0 dB, got \d+\.\d dB after \d pass/);
    assert.deepEqual(readdirSync(dir).sort(), ["bed.wav", "index.html", "mix.wav", "stems", "vo.wav"], "work files removed");
    const level = (file, ss, t) => parseMeanVolume(spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-ss", String(ss), "-t", String(t), "-i", file, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" }).stderr);
    const music = join(stems, "music.wav");
    const under = level(join(stems, "voice.wav"), 2.5, 1.2) - level(music, 2.5, 1.2);
    assert.ok(Math.abs(under - 6) <= 0.5, `music ${under.toFixed(1)} dB under the voice while it speaks`);
    assert.ok(Math.abs(level(music, 0, 1.8) - level(join(dir, "bed.wav"), 0, 1.8)) < 0.5, "not ducked before the voice");
    const ebu = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", out, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" }).stderr;
    const I = Number(ebu.match(/Integrated loudness:\s*\n\s*I:\s+(-?[\d.]+) LUFS/)?.[1]);
    assert.ok(Math.abs(I + 14) <= 1, `integrated ${I} LUFS`);
    for (const f of [out, join(stems, "voice.wav"), music]) {
      const d = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }).stdout);
      assert.ok(Math.abs(d - 6) <= 0.02, `${f}: ${d}s`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("limiter loop: re-aims from the measured output, stops within 0.5 LU or at the cap", () => {
  const m = { input_i: "-16.80", input_tp: "-0.80" }; // a TTS voice: static gain allows only +0.1 dB
  assert.equal(staticGain(m).peakLimited, true);
  assert.deepEqual(nextLimitGain(m, 2.8, { input_i: "-14.30" }), { gain: 2.8, done: true });
  assert.deepEqual(nextLimitGain(m, 2.8, { input_i: "-14.90" }), { gain: 3.7, done: false });
  const cap = LOUDNORM.TP + 0.8 + MAX_LIMIT_DB; // 5.3 dB
  assert.deepEqual(nextLimitGain(m, 4.5, { input_i: "-16.00" }), { gain: cap, done: false });
  assert.deepEqual(nextLimitGain(m, cap, { input_i: "-15.50" }), { gain: cap, done: true });
  const a = limitArgs("/tmp/m.wav", 2.8, 15, "/tmp/o.wav");
  assert.equal(a[a.indexOf("-af") + 1], "volume=2.8dB,aresample=192000,alimiter=limit=0.794328:attack=1:release=60:level=0:latency=1,aresample=48000,apad=whole_dur=15,atrim=end_sample=720000");
});

test("CLI: a voice whose peaks cap the static gain is limited to -14 LUFS under the -1.5 dBTP ceiling", { skip: !hasFfmpeg && "ffmpeg missing" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "amix-limit-"));
  try {
    // A tone with a sharp hit every 0.5 s: about -17.8 LUFS with peaks at -1.5 dBTP, so a static gain
    // cannot lift it at all (the TTS voice of the risograph trial: -16.8 LUFS, peak -0.8 dBFS).
    const e = "0.15*sin(2*PI*1000*t)*(0.6+0.4*sin(2*PI*3*t))+0.75*cos(2*PI*2500*t)*exp(-150*mod(t,0.5))";
    const g = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `aevalsrc='${e}|${e}':s=48000:d=6`, join(dir, "vo.wav")], { encoding: "utf8" });
    assert.equal(g.status, 0, g.stderr);
    const html = join(dir, "index.html");
    writeFileSync(html, `<audio id="vo-01" src="vo.wav" data-start="0" data-duration="6"></audio>`);
    const out = join(dir, "mix.wav");
    const r = spawnSync("node", [CLI, "--html", html, "--duration", "6", "--out", out, "--loudnorm"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /limiter: mix -1[78]\.\d+ LUFS/);
    assert.doesNotMatch(r.stderr, /WARN/);
    const ebu = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", out, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" }).stderr;
    const I = Number(ebu.match(/Integrated loudness:\s*\n\s*I:\s+(-?[\d.]+) LUFS/)?.[1]);
    const TP = Number(ebu.match(/True peak:\s*\n\s*Peak:\s+(-?[\d.]+) dBFS/)?.[1]);
    assert.ok(Math.abs(I - LOUDNORM.I) <= 0.6, `integrated ${I} LUFS`);
    assert.ok(I >= LOUDNORM.low && I <= LOUDNORM.high, `integrated ${I} LUFS inside qc-mp4's range`);
    assert.ok(TP <= LOUDNORM.TP, `true peak ${TP} dBFS`);
    const d = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], { encoding: "utf8" }).stdout);
    assert.ok(Math.abs(d - 6) <= 0.02, `${d}s`);
    assert.deepEqual(readdirSync(dir).sort(), ["index.html", "mix.wav", "vo.wav"], "work files removed");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
