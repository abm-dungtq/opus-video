import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fakeApi } from "./fixtures/fake-api.mjs";
import { fakeVp, RECORD } from "./fixtures/fake-vp.mjs";

const ELEVEN = fileURLToPath(new URL("../eleven.mjs", import.meta.url));
const WORDS = [
  { text: "Xin", start: 0.1, end: 0.32, loss: 0.1 },
  { text: "chào", start: 0.35, end: 0.61, loss: 0.2 },
  { text: "bạn", start: 0.64, end: 0.9004, loss: 0.1 },
];
const OK = () => ({ status: 200, headers: { "content-type": "application/json" }, body: { characters: [], words: WORDS, loss: 0.13 } });

// The fake server runs in this process, so the CLI must run asynchronously.
function run(args, base, home, vp) {
  return new Promise((ok) => {
    const child = spawn(process.execPath, [ELEVEN, ...args], {
      env: { ...process.env, HOME: home, ELEVENLABS_API_BASE: base, ELEVENLABS_API_KEY: "test", VIET_PRO_DIR: vp },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (status) => ok({ status, out }));
  });
}
// A vi project that passes the viet-pro gate (same setup as the audio-meta gate test) plus a short audio file.
function project({ record = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ov-align-"));
  writeFileSync(join(dir, "BRIEF.md"), `---\nlanguage: vi\n---\n\n${record ? RECORD() : ""}\n`);
  mkdirSync(join(dir, "script"));
  writeFileSync(join(dir, "script", "01.txt"), "Xin chào bạn\n");
  const table = "| Thời điểm | Voice-over | Visual |\n|---|---|---|\n| 0-3s | Xin chào bạn | logo |\n";
  writeFileSync(join(dir, "script-table.md"), table);
  writeFileSync(join(dir, "script-table.v1.md"), table);
  writeFileSync(join(dir, "a.wav"), "RIFFfake");
  return dir;
}
async function setup(routes, opts) {
  const api = await fakeApi(routes);
  const vp = fakeVp(), dir = project(opts), home = mkdtempSync(join(tmpdir(), "ov-align-home-"));
  const args = ["align", "--audio", join(dir, "a.wav"), "--text-file", join(dir, "script", "01.txt")];
  const done = async () => { await api.close(); for (const d of [vp, dir, home]) rmSync(d, { recursive: true, force: true }); };
  return { api, dir, args, go: (extra = []) => run([...args, ...extra], api.base, home, vp), done };
}

test("align sends multipart and writes <audio>.words.json in the TTS shape", async () => {
  const s = await setup({ "POST /v1/forced-alignment": OK });
  try {
    const r = await s.go();
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /ALIGN .*a\.wav\.words\.json words=3 loss=0\.13/);
    const words = JSON.parse(readFileSync(join(s.dir, "a.wav.words.json"), "utf8"));
    assert.equal(words.length, 3);
    for (const w of words) assert.deepEqual(Object.keys(w), ["text", "start", "end"]);
    assert.equal(words[2].end, 0.9);
    assert.match(s.api.calls[0].headers["content-type"], /^multipart\/form-data/);
    const body = s.api.calls[0].body.toString();
    assert.match(body, /name="text"\r\n\r\nXin chào bạn\r\n/);
    assert.match(body, /name="file"; filename="a\.wav"\r\nContent-Type: audio\/wav/);
    const stamp = JSON.parse(readFileSync(join(s.dir, "a.wav.gate.json"), "utf8"));
    assert.equal(stamp.script, "script/01.txt");
    assert.equal(stamp.override, null);
  } finally { await s.done(); }
});

test("align falls back to characters when the response has no words", async () => {
  const chars = [..."Xin bạn"].map((c, i) => ({ text: c, start: i * 0.1, end: i * 0.1 + 0.1 }));
  const s = await setup({ "POST /v1/forced-alignment": () => ({ status: 200, body: { characters: chars, words: [], loss: 2 } }) });
  try {
    const r = await s.go();
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /WARN align loss cao/);
    assert.match(r.out, /WARN align words=2 khác chữ nguồn 3/);
    const words = JSON.parse(readFileSync(join(s.dir, "a.wav.words.json"), "utf8"));
    assert.deepEqual(words.map((w) => w.text), ["Xin", "bạn"]);
    assert.equal(words[1].start, 0.4);
  } finally { await s.done(); }
});

test("align on a plan without forced alignment prints ALIGN_UNAVAILABLE and exits 3", async () => {
  const s = await setup({ "POST /v1/forced-alignment": () => ({ status: 402, body: "payment required" }) });
  try {
    const r = await s.go();
    assert.equal(r.status, 3, r.out);
    assert.match(r.out, /ALIGN_UNAVAILABLE/);
    assert.equal(existsSync(join(s.dir, "a.wav.words.json")), false);
  } finally { await s.done(); }
});

test("align prefers words split from characters when they match the text, trimmed words otherwise", async () => {
  const chars = [..."Xin chào bạn"].map((c, i) => ({ text: c, start: i * 0.1, end: i * 0.1 + 0.1 }));
  const spaced = [{ text: "Xin", start: 0, end: 0.3 }, { text: " ", start: 0.3, end: 0.4 }, { text: " chào", start: 0.4, end: 0.8 }, { text: "bạn", start: 0.8, end: 1.1 }];
  const s = await setup({ "POST /v1/forced-alignment": () => ({ status: 200, body: { characters: chars, words: spaced, loss: 0.2 } }) });
  try {
    assert.equal((await s.go()).status, 0);
    const a = JSON.parse(readFileSync(join(s.dir, "a.wav.words.json"), "utf8"));
    assert.deepEqual(a.map((w) => w.text), ["Xin", "chào", "bạn"]);
    assert.equal(a[1].start, 0.4);
    assert.equal(a[1].end, 0.8);
  } finally { await s.done(); }
  const t = await setup({ "POST /v1/forced-alignment": () => ({ status: 200, body: { characters: [], words: spaced, loss: 0.2 } }) });
  try {
    const r = await t.go();
    assert.equal(r.status, 0, r.out);
    assert.doesNotMatch(r.out, /WARN align words/);
    assert.deepEqual(JSON.parse(readFileSync(join(t.dir, "a.wav.words.json"), "utf8")).map((w) => w.text), ["Xin", "chào", "bạn"]);
  } finally { await t.done(); }
});

test("align does not overwrite without --force", async () => {
  const s = await setup({ "POST /v1/forced-alignment": OK });
  try {
    assert.equal((await s.go()).status, 0);
    const again = await s.go();
    assert.equal(again.status, 2, again.out);
    assert.equal(s.api.calls.length, 1);
    assert.equal((await s.go(["--force"])).status, 0);
  } finally { await s.done(); }
});

test("align exits 4 before any request when the viet-pro gate blocks", async () => {
  const s = await setup({ "POST /v1/forced-alignment": OK }, { record: false });
  try {
    const r = await s.go();
    assert.equal(r.status, 4, r.out);
    assert.match(r.out, /BLOCKED/);
    assert.equal(s.api.calls.length, 0);
  } finally { await s.done(); }
});
