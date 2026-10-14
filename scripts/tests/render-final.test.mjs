import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { main as renderFinal, visualHash, audioHash, dynamicAudioReasons, readSidecar, writeSidecar, sidecarPath, PREFLIGHT_EXIT, AUDIO_ONLY_EXIT } from "../render-final.mjs";

const PASS = () => ({ pass: true, stage: "final", errors: [], warnings: [] });
const quiet = { err: () => {}, log: () => {} };

const ff = (args) => {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...args], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
};

// Stands in for `npx hyperframes render`: writes a 3 s lavfi MP4 (picture + 440 Hz tone) at --output.
function fakeRender(calls = []) {
  return (cmd, args, opts) => {
    if (cmd !== "npx") return spawnSync(cmd, args, opts);
    calls.push(args);
    const i = args.indexOf("--output");
    const out = resolve(opts.cwd, args[i + 1]);
    mkdirSync(dirname(out), { recursive: true });
    ff(["-f", "lavfi", "-i", "testsrc=size=160x284:rate=30:duration=3", "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", out]);
    return { status: 0 };
  };
}

const INDEX = `<!doctype html><html><body>
<div id="title">Lô 72 m2</div>
<img src="../ext/photo.png">
<audio id="el-sfx-0" src="assets/sfx/beep.wav" data-start="0.5" data-duration="1" data-volume="0.25"></audio>
<audio id="bgm" src="assets/bgm/tone.wav" data-start="0" data-duration="3" data-volume="0.3"></audio>
<script>gsap.timeline().to("#title", { opacity: 0, duration: 0.5 }); // fade out</script>
</body></html>`;

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "render-final-"));
  const p = join(dir, "proj");
  mkdirSync(join(p, "assets/sfx"), { recursive: true });
  mkdirSync(join(p, "assets/bgm"), { recursive: true });
  mkdirSync(join(dir, "ext"));
  writeFileSync(join(dir, "ext/photo.png"), "photo-v1");
  writeFileSync(join(p, "assets/logo.png"), "logo");
  ff(["-f", "lavfi", "-i", "sine=frequency=880:duration=1", "-ar", "48000", join(p, "assets/sfx/beep.wav")]);
  ff(["-f", "lavfi", "-i", "sine=frequency=220:duration=3", "-ar", "48000", join(p, "assets/bgm/tone.wav")]);
  writeFileSync(join(p, "index.html"), INDEX);
  return { dir, p, edit: (from, to) => writeFileSync(join(p, "index.html"), readFileSync(join(p, "index.html"), "utf8").replace(from, to)) };
}

const probe = (file, sel, entries) => spawnSync("ffprobe", ["-v", "error", "-select_streams", sel, "-show_entries", entries, "-of", "csv=p=0", file], { encoding: "utf8" }).stdout.trim();

test("hashes: data-volume moves only audio_hash; a <div> or an image outside the project moves visual_hash", () => {
  const { dir, p, edit } = fixture();
  try {
    const v0 = visualHash(p), a0 = audioHash(p);
    edit('data-volume="0.25"', 'data-volume="0.1"');
    assert.equal(visualHash(p), v0);
    const a1 = audioHash(p);
    assert.notEqual(a1, a0);
    writeFileSync(join(p, "assets/sfx/beep.wav"), readFileSync(join(p, "assets/sfx/beep.wav")).subarray(0, 2000));
    assert.equal(visualHash(p), v0, "sound files under assets/sfx are not picture");
    assert.notEqual(audioHash(p), a1, "sound file content is in audio_hash");
    edit("Lô 72 m2", "Lô 80 m2");
    const v1 = visualHash(p);
    assert.notEqual(v1, v0);
    writeFileSync(join(dir, "ext/photo.png"), "photo-v2");
    assert.notEqual(visualHash(p), v1);
    rmSync(join(dir, "ext/photo.png"));
    assert.throws(() => visualHash(p), /referenced file not found/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("hashes: renaming an <audio> id leaves audio_hash as it was, so older sidecars stay valid", () => {
  const { dir, p, edit } = fixture();
  try {
    const a0 = audioHash(p);
    edit('id="bgm"', 'id="music"');
    assert.equal(audioHash(p), a0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("sidecar: write/read round trip, missing → null, malformed → throws", () => {
  const dir = mkdtempSync(join(tmpdir(), "sidecar-"));
  try {
    const mp4 = join(dir, "x.mp4");
    assert.equal(readSidecar(mp4), null);
    const data = { composition: "index.html", visual_hash: "v", audio_hash: "a", mode: "full", mixer: "audio-mix", source: null, source_sha256: "s", created: "2026-10-13T00:00:00.000Z" };
    writeSidecar(mp4, data);
    assert.equal(sidecarPath(mp4), `${mp4}.render.json`);
    assert.deepEqual(readSidecar(mp4), data);
    writeFileSync(sidecarPath(mp4), "{");
    assert.throws(() => readSidecar(mp4), /unreadable sidecar/);
    writeFileSync(sidecarPath(mp4), "{}");
    assert.throws(() => readSidecar(mp4), /has no composition/);
    const { source_sha256: _, ...old } = data;
    writeSidecar(mp4, old);
    assert.throws(() => readSidecar(mp4), /has no source_sha256/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("dynamicAudioReasons: attributes on the composition and sound in a data-composition-src sub-scene; picture fades are fine", () => {
  const { dir, p, edit } = fixture();
  try {
    assert.deepEqual(dynamicAudioReasons(p), []);
    mkdirSync(join(p, "compositions/frames"), { recursive: true });
    writeFileSync(join(p, "compositions/frames/01.html"), `<template><div class="fade-in">x</div></template>`);
    writeFileSync(join(p, "compositions/frames/02.html"), `<template><audio src="assets/sfx/beep.wav" data-start="0"></audio></template>`);
    assert.deepEqual(dynamicAudioReasons(p), [], "files not embedded are not sub-scenes");
    edit('<div id="title">', '<div data-composition-src="compositions/frames/01.html"></div>\n<div id="title">');
    assert.deepEqual(dynamicAudioReasons(p), []);
    // 01 embeds 02: followed recursively, 02 resolves its src from the project root
    writeFileSync(join(p, "compositions/frames/01.html"), `<template><div data-composition-src="compositions/frames/02.html"></div></template>`);
    assert.match(dynamicAudioReasons(p).join("\n"), /compositions\/frames\/02\.html: <audio>\/<video> with sound in a sub-scene/);
    writeFileSync(join(p, "compositions/frames/02.html"), `<template><div>quiet</div></template>`);
    const v = visualHash(p);
    writeFileSync(join(p, "compositions/frames/02.html"), `<template><div>changed</div></template>`);
    assert.notEqual(visualHash(p), v, "a nested sub-scene is part of the picture");
    rmSync(join(p, "compositions"), { recursive: true });
    assert.throws(() => visualHash(p), /referenced file not found/, "an embedded sub-scene that is gone");
    edit(/<div data-composition-src[^\n]*\n/, "");
    edit('id="bgm"', 'id="bgm" data-fx-carve="voiceover"');
    assert.deepEqual(dynamicAudioReasons(p), ["index.html: data-fx-carve"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("full render: sound replaced by audio-mix, sidecar mode full; dynamic sound keeps HyperFrames mix", () => {
  const { dir, p, edit } = fixture();
  try {
    const calls = [];
    assert.equal(renderFinal(["--project", p, "--", "--output", "renders/base.mp4"], { checkImpl: PASS, spawn: fakeRender(calls), ...quiet }), 0);
    assert.deepEqual(calls[0], ["hyperframes", "render", "--quality", "delivery", "--output", "renders/base.mp4"]);
    const out = join(p, "renders/base.mp4");
    const side = readSidecar(out);
    assert.equal(side.mode, "full");
    assert.equal(side.mixer, "audio-mix");
    assert.equal(side.composition, "index.html");
    assert.equal(side.visual_hash, visualHash(p));
    assert.equal(side.audio_hash, audioHash(p));
    assert.equal(probe(out, "a", "stream=codec_name").split("\n").length, 1);
    assert.equal(probe(out, "a", "stream=codec_name,sample_rate"), "aac,48000", "48 kHz from audio-mix, not the 44.1 kHz lavfi tone");
    assert.deepEqual(readdirSync(join(p, "renders")).sort(), ["base.mp4", "base.mp4.render.json"]);

    edit('id="bgm"', 'id="bgm" data-automation="volume:0@0,1@1"');
    assert.equal(renderFinal(["--project", p, "--", "--output", "renders/dyn.mp4"], { checkImpl: PASS, spawn: fakeRender(), ...quiet }), 0);
    assert.equal(readSidecar(join(p, "renders/dyn.mp4")).mixer, "hyperframes");
    assert.equal(probe(join(p, "renders/dyn.mp4"), "a", "stream=sample_rate"), "44100", "HyperFrames sound kept");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("--audio-only: usage, preflight, sidecar, picture, dynamic sound, unchanged and changed sound", () => {
  const { dir, p, edit } = fixture();
  const run = (args, extra = {}) => renderFinal(["--project", p, ...args], { checkImpl: PASS, spawn: fakeRender(), ...quiet, ...extra });
  try {
    assert.equal(run(["--", "--output", "renders/base.mp4"]), 0);
    const base = join(p, "renders/base.mp4");

    assert.equal(run(["--audio-only", "renders/base.mp4"]), 2, "--output required");
    assert.equal(run(["--audio-only", "renders/base.mp4", "--", "--output", "renders/base.mp4"]), 2, "must be a new file");
    assert.equal(run(["--audio-only", "renders/base.mp4", "--", "--fps", "60", "--output", "renders/n.mp4"]), 2);
    assert.equal(run(["--audio-only", "renders/nope.mp4", "--", "--output", "renders/n.mp4"]), 2);
    assert.equal(run(["--audio-only", "renders/base.mp4", "--", "--output", "renders/n.mp4"], { checkImpl: () => ({ pass: false, errors: ["x"], warnings: [] }) }), PREFLIGHT_EXIT);

    // same sound: exit 0, nothing new
    assert.equal(run(["--audio-only", "renders/base.mp4", "--", "--output", "renders/same.mp4"]), 0);
    assert.ok(!existsSync(join(p, "renders/same.mp4")));

    // new sound: copied picture, new mix, sidecar
    edit('data-volume="0.25"', 'data-volume="0.1"');
    assert.equal(run(["--audio-only", "renders/base.mp4", "--", "--output", "renders/new.mp4"]), 0);
    const neu = join(p, "renders/new.mp4");
    assert.equal(probe(neu, "v", "stream=codec_name"), probe(base, "v", "stream=codec_name"));
    const psnr = spawnSync("ffmpeg", ["-hide_banner", "-i", base, "-i", neu, "-lavfi", "[0:v][1:v]psnr", "-f", "null", "-"], { encoding: "utf8" });
    assert.match(psnr.stderr, /average:inf/);
    const side = readSidecar(neu);
    assert.equal(side.mode, "audio-only");
    assert.equal(side.source, "renders/base.mp4");
    assert.equal(side.visual_hash, readSidecar(base).visual_hash);
    assert.equal(side.audio_hash, audioHash(p));
    assert.notEqual(side.audio_hash, readSidecar(base).audio_hash);
    assert.ok(!readdirSync(join(p, "renders")).some((n) => n.includes("remix-tmp")));

    // dynamic sound (data-audio-group) → 6
    edit('id="bgm"', 'id="bgm" data-audio-group="music"');
    assert.equal(run(["--audio-only", "renders/base.mp4", "--", "--output", "renders/grp.mp4"]), AUDIO_ONLY_EXIT);
    edit(' data-audio-group="music"', "");

    // picture changed → 6
    edit("Lô 72 m2", "Lô 90 m2");
    assert.equal(run(["--audio-only", "renders/base.mp4", "--", "--output", "renders/pic.mp4"]), AUDIO_ONLY_EXIT);
    assert.ok(!existsSync(join(p, "renders/pic.mp4")));

    // no sidecar → 6
    rmSync(sidecarPath(base));
    assert.equal(run(["--audio-only", "renders/base.mp4", "--", "--output", "renders/x.mp4"]), AUDIO_ONLY_EXIT);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("-c compositions/main-9x16.html: assets/ paths resolve from the project root; a sibling with <audio> is not a sub-scene", () => {
  const { dir, p } = fixture();
  try {
    mkdirSync(join(p, "compositions"));
    // same tracks and picture as index.html, written with root-relative paths like HyperFrames projects do
    writeFileSync(join(p, "compositions/main-9x16.html"), INDEX.replace('<div id="title">', '<div id="title" style="background:url(assets/logo.png)">'));
    const run = (args) => renderFinal(["--project", p, ...args], { checkImpl: PASS, spawn: fakeRender(), ...quiet });
    assert.equal(run(["--", "-c", "compositions/main-9x16.html", "--output", "renders/x-9x16.mp4"]), 0);
    const side = readSidecar(join(p, "renders/x-9x16.mp4"));
    assert.equal(side.mixer, "audio-mix");
    assert.equal(side.composition, "compositions/main-9x16.html");
    assert.equal(probe(join(p, "renders/x-9x16.mp4"), "a", "stream=sample_rate"), "48000");
    // index.html renders with audio-mix too: the 9:16 sibling's <audio> does not make it dynamic
    assert.deepEqual(dynamicAudioReasons(p), []);
    assert.equal(run(["--", "--output", "renders/x-16x9.mp4"]), 0);
    assert.equal(readSidecar(join(p, "renders/x-16x9.mp4")).mixer, "audio-mix");
    // --audio-only on the 9:16 file after a volume change
    writeFileSync(join(p, "compositions/main-9x16.html"), readFileSync(join(p, "compositions/main-9x16.html"), "utf8").replace('data-volume="0.25"', 'data-volume="0.1"'));
    assert.equal(run(["--audio-only", "renders/x-9x16.mp4", "--", "-c", "compositions/main-9x16.html", "--output", "renders/y-9x16.mp4"]), 0);
    assert.equal(readSidecar(join(p, "renders/y-9x16.mp4")).mode, "audio-only");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("--audio-only: a file that is not the one its sidecar describes → 6", () => {
  const { dir, p, edit } = fixture();
  const run = (args) => renderFinal(["--project", p, ...args], { checkImpl: PASS, spawn: fakeRender(), ...quiet });
  try {
    assert.equal(run(["--", "--output", "renders/final.mp4"]), 0);
    // a draft copied over the final's name keeps the old sidecar
    ff(["-f", "lavfi", "-i", "testsrc=size=160x284:rate=30:duration=3", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", join(p, "renders/final.mp4")]);
    edit('data-volume="0.25"', 'data-volume="0.1"');
    assert.equal(run(["--audio-only", "renders/final.mp4", "--", "--output", "renders/new.mp4"]), AUDIO_ONLY_EXIT);
    assert.ok(!existsSync(join(p, "renders/new.mp4")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ffmpeg or ffprobe missing → exit 2 before hyperframes runs", () => {
  for (const tool of ["ffmpeg", "ffprobe"]) {
    const calls = [];
    const spawn = (cmd) => { calls.push(cmd); return cmd === tool ? { error: Object.assign(new Error(`spawnSync ${tool} ENOENT`), { code: "ENOENT" }) } : { status: 0 }; };
    assert.equal(renderFinal(["--project", "/p", "--", "--output", "renders/x.mp4"], { checkImpl: PASS, spawn, ...quiet }), 2);
    assert.ok(!calls.includes("npx"), `${tool} missing: hyperframes never called`);
  }
});

test("no --output and several new MP4s in renders/ → exit 2", () => {
  const { dir, p } = fixture();
  try {
    const spawn = (cmd, args, opts) => {
      if (cmd !== "npx") return spawnSync(cmd, args, opts);
      mkdirSync(join(p, "renders"), { recursive: true });
      for (const n of ["a.mp4", "b.mp4"]) writeFileSync(join(p, "renders", n), "x");
      return { status: 0 };
    };
    const errs = [];
    assert.equal(renderFinal(["--project", p], { checkImpl: PASS, spawn, err: (m) => errs.push(m), log: () => {} }), 2);
    assert.match(errs.join("\n"), /2 new MP4s in renders\/ \(a\.mp4, b\.mp4\).*pass --output/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("render-final quotes npx arguments with spaces through winArgs on Windows", () => {
  const seen = [];
  const spawn = (cmd, args, opts) => { if (cmd === "npx") seen.push({ args, shell: opts.shell }); return { status: cmd === "npx" ? 1 : 0 }; };
  const run = (win) => renderFinal(["--project", "/p", "--", "--output", "renders/my file.mp4"], { checkImpl: PASS, spawn, win, err: () => {}, log: () => {} });
  run(true);
  assert.ok(seen[0].args.includes('"renders/my file.mp4"'), JSON.stringify(seen[0]));
  assert.equal(seen[0].shell, true);
  run(false);
  assert.ok(seen[1].args.includes("renders/my file.mp4"));
  assert.equal(seen[1].shell, false);
});
