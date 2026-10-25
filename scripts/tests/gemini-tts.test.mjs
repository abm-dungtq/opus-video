import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fakeApi } from "./fixtures/fake-api.mjs";
import { fakeVp, RECORD } from "./fixtures/fake-vp.mjs";
import { pcmToWav, GEMINI_RATE } from "../gemini-tts.mjs";
import { stampMatches, writeStamp } from "../script-md.mjs";

const ELEVEN = fileURLToPath(new URL("../eleven.mjs", import.meta.url));
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const MODEL = "gemini-3.8-flash-tts";

// 0.5 s of a 440 Hz sine as PCM s16le 24 kHz mono, the shape Gemini returns.
function sinePcm(seconds = 0.5) {
  const n = Math.round(GEMINI_RATE * seconds), buf = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / GEMINI_RATE) * 8000), i * 2);
  return buf;
}
const WORDS = [{ text: "Xin", start: 0.05, end: 0.2 }, { text: "chào", start: 0.22, end: 0.432 }];
const routes = () => ({
  [`POST /v1beta/models/${MODEL}:generateContent`]: () => ({ status: 200, body: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;rate=24000", data: sinePcm().toString("base64") } }] } }] } }),
  "POST /v1/forced-alignment": () => ({ status: 200, body: { characters: [], words: WORDS, loss: 0.1 } }),
});

function run(args, base, home, vp, envOver = {}) {
  return new Promise((ok) => {
    const env = { ...process.env, HOME: home, ELEVENLABS_API_BASE: base, GEMINI_API_BASE: base, ELEVENLABS_API_KEY: "test", GEMINI_API_KEY: "test-gemini", VIET_PRO_DIR: vp, ...envOver };
    for (const [k, v] of Object.entries(env)) if (v === undefined) delete env[k];
    const child = spawn(process.execPath, [ELEVEN, ...args], { env });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (status) => ok({ status, out }));
  });
}
// A vi project that passes the viet-pro gate (same setup as the audio-meta gate test).
function project({ record = true, front = "voice_provider: gemini" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ov-gemini-"));
  writeFileSync(join(dir, "BRIEF.md"), `---\nlanguage: vi\n${front}\n---\n\n${record ? RECORD() : ""}\n`);
  mkdirSync(join(dir, "script"));
  writeFileSync(join(dir, "script", "01.txt"), "Xin chào\n");
  const table = "| Thời điểm | Voice-over | Visual |\n|---|---|---|\n| 0-3s | Xin chào | logo |\n";
  writeFileSync(join(dir, "script-table.md"), table);
  writeFileSync(join(dir, "script-table.v1.md"), table);
  return dir;
}
async function setup(opts, extraRoutes = {}) {
  const api = await fakeApi({ ...routes(), ...extraRoutes });
  const vp = fakeVp(), dir = project(opts), home = mkdtempSync(join(tmpdir(), "ov-gemini-home-"));
  const out = join(dir, "assets", "voice", "01.mp3");
  const go = (extra = [], envOver) => run(["tts", "--text-file", join(dir, "script", "01.txt"), "--out", out, ...extra], api.base, home, vp, envOver);
  const done = async () => { await api.close(); for (const d of [vp, dir, home]) rmSync(d, { recursive: true, force: true }); };
  return { api, dir, out, go, done };
}

test("pcmToWav writes a 44-byte header for 24 kHz mono 16-bit", () => {
  const pcm = sinePcm(0.1), wav = pcmToWav(pcm);
  assert.equal(wav.length, 44 + pcm.length);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), pcm.length);
});

test("tts with voice_provider gemini: Gemini voice, ElevenLabs words, gemini stamp", { skip: !hasFfmpeg && "ffmpeg missing" }, async () => {
  const s = await setup();
  try {
    const r = await s.go();
    assert.equal(r.status, 0, r.out);
    assert.ok(existsSync(s.out));
    const words = JSON.parse(readFileSync(`${s.out}.words.json`, "utf8"));
    assert.equal(words.length, 2);
    const gem = s.api.calls.find((c) => c.url.startsWith("/v1beta/"));
    assert.ok(gem.headers["x-goog-api-key"], "x-goog-api-key header present");
    const body = JSON.parse(gem.body.toString());
    assert.deepEqual(body.generationConfig.responseModalities, ["AUDIO"]);
    assert.equal(body.contents[0].parts[0].text, "Xin chào");
    assert.ok(s.api.calls.some((c) => c.url === "/v1/forced-alignment"));
    const stamp = JSON.parse(readFileSync(`${s.out}.gate.json`, "utf8"));
    assert.equal(stamp.provider, "gemini");
    assert.equal(stamp.model, MODEL);
    assert.equal(stamp.voice, "Kore");
    assert.equal(r.out.includes("test-gemini"), false, "the key is never printed");
  } finally { await s.done(); }
});

test("gemini: the viet-pro gate blocks before any request", async () => {
  const s = await setup({ record: false });
  try {
    const r = await s.go();
    assert.equal(r.status, 4, r.out);
    assert.equal(s.api.calls.length, 0);
  } finally { await s.done(); }
});

function probe(file) {
  return Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).stdout.trim());
}
const elevenTts = () => {
  const chars = [..."Xin chào"];
  return () => ({ status: 200, body: { audio_base64: readFileSync(SINE_MP3).toString("base64"), alignment: { characters: chars, character_start_times_seconds: chars.map((_, i) => i * 0.054), character_end_times_seconds: chars.map((_, i) => i * 0.054 + 0.054) } } });
};
let SINE_MP3;
if (hasFfmpeg) {
  SINE_MP3 = join(mkdtempSync(join(tmpdir(), "ov-sine-")), "sine.mp3");
  spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.5", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", SINE_MP3]);
  after(() => rmSync(join(SINE_MP3, ".."), { recursive: true, force: true }));
}

test("gemini --tempo 1.08: one encode with atempo, words aligned on the faster take, tempo stamped", { skip: !hasFfmpeg && "ffmpeg missing" }, async () => {
  const s = await setup();
  try {
    const r = await s.go(["--tempo", "1.08"]);
    assert.equal(r.status, 0, r.out);
    assert.ok(Math.abs(probe(s.out) - 0.5 / 1.08) < 0.06, String(probe(s.out)));
    const words = JSON.parse(readFileSync(`${s.out}.words.json`, "utf8"));
    assert.equal(words[1].end, 0.432, "alignment ran on the tempo-applied audio, times are not divided again");
    assert.equal(JSON.parse(readFileSync(`${s.out}.gate.json`, "utf8")).tempo, 1.08);
    assert.equal(existsSync(`${s.out}.part.mp3`), false);
  } finally { await s.done(); }
});

test("elevenlabs --tempo 1.08 divides every word time and is stamped", { skip: !hasFfmpeg && "ffmpeg missing" }, async () => {
  const s = await setup({ front: "voice_provider: elevenlabs" }, { "POST /v1/text-to-speech/testvoice/with-timestamps": elevenTts() });
  try {
    const r = await s.go(["--voice", "testvoice", "--tempo", "1.08"]);
    assert.equal(r.status, 0, r.out);
    const words = JSON.parse(readFileSync(`${s.out}.words.json`, "utf8"));
    assert.ok(Math.abs(words[1].end - 0.432 / 1.08) <= 0.002, String(words[1].end));
    assert.equal(JSON.parse(readFileSync(`${s.out}.gate.json`, "utf8")).tempo, 1.08);
  } finally { await s.done(); }
});

test("--tempo outside 0.8–1.25 and an unknown provider are usage errors", async () => {
  const s = await setup();
  try {
    assert.equal((await s.go(["--tempo", "1.5"])).status, 2);
    assert.equal((await s.go(["--provider", "openai"])).status, 2);
    assert.equal(s.api.calls.length, 0);
  } finally { await s.done(); }
});

test("stampMatches compares provider, tempo and model only when asked; old stamps are elevenlabs at tempo 1", () => {
  const d = mkdtempSync(join(tmpdir(), "ov-stamp-")), mp3 = join(d, "01.mp3");
  try {
    writeFileSync(mp3, "x");
    writeStamp(mp3, { text: "Xin chào" });
    assert.equal(stampMatches(mp3, "Xin chào", { provider: "elevenlabs", tempo: 1 }), true);
    assert.equal(stampMatches(mp3, "Xin chào", { provider: "gemini", tempo: 1 }), false);
    assert.equal(stampMatches(mp3, "Xin chào", { tempo: 1.1 }), false);
    writeStamp(mp3, { text: "Xin chào", provider: "gemini", model: MODEL, tempo: 1.1 });
    assert.equal(stampMatches(mp3, "Xin chào"), true);
    assert.equal(stampMatches(mp3, "Xin chào", { provider: "elevenlabs", tempo: 1.1 }), false);
    assert.equal(stampMatches(mp3, "Xin chào", { provider: "gemini", tempo: 1.1, model: MODEL }), true);
    assert.equal(stampMatches(mp3, "Xin chào", { provider: "gemini", tempo: 1.1, model: "other" }), false);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("BRIEF placeholders (<…>) count as unset: an ElevenLabs voice with the old stamp shape", { skip: !hasFfmpeg && "ffmpeg missing" }, async () => {
  const s = await setup({ front: "voice_provider: <elevenlabs | gemini>\ngemini_tts_model: <tên model>" }, { "POST /v1/text-to-speech/testvoice/with-timestamps": elevenTts() });
  try {
    const r = await s.go(["--voice", "testvoice"]);
    assert.equal(r.status, 0, r.out);
    assert.equal(s.api.calls.some((c) => c.url.startsWith("/v1beta/")), false);
    const stamp = JSON.parse(readFileSync(`${s.out}.gate.json`, "utf8"));
    assert.deepEqual(Object.keys(stamp).sort(), ["override", "script", "sha256"]);
  } finally { await s.done(); }
});

test("gemini checks the ElevenLabs key and the voice name before any request", async () => {
  const s = await setup();
  try {
    const noKey = await s.go([], { ELEVENLABS_API_KEY: undefined });
    assert.equal(noKey.status, 2, noKey.out);
    assert.match(noKey.out, /ELEVENLABS_API_KEY/);
    const elevenId = await s.go(["--voice", "eGSd0uV8dNQnZuEEX9lu"]);
    assert.equal(elevenId.status, 2, elevenId.out);
    assert.equal(s.api.calls.length, 0);
  } finally { await s.done(); }
});

test("stampMatches compares the gemini voice when both sides have one", () => {
  const d = mkdtempSync(join(tmpdir(), "ov-stamp-")), mp3 = join(d, "01.mp3");
  try {
    writeFileSync(mp3, "x");
    writeStamp(mp3, { text: "Xin chào", provider: "gemini", model: MODEL, voice: "Kore" });
    assert.equal(stampMatches(mp3, "Xin chào", { provider: "gemini", tempo: 1, model: MODEL, voice: "Kore" }), true);
    assert.equal(stampMatches(mp3, "Xin chào", { provider: "gemini", tempo: 1, model: MODEL, voice: "Puck" }), false);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
