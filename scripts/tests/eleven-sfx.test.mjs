// eleven.mjs sfx against a local fake API: the file on disk starts at its hit (no quiet lead-in for
// sfx-sync to read as a late sound) and the log gives the size of that file, not of the API bytes.
// The drum is made with ffmpeg; no ElevenLabs credit is spent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fakeApi } from "./fixtures/fake-api.mjs";
import { measureLead } from "../sfx-sync.mjs";

const ELEVEN = fileURLToPath(new URL("../eleven.mjs", import.meta.url));
const skip = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0 ? false : "ffmpeg/ffprobe not installed";

function run(args, base, cwd) {
  return new Promise((ok) => {
    const child = spawn(process.execPath, [ELEVEN, ...args], { cwd, env: { ...process.env, HOME: cwd, ELEVENLABS_API_BASE: base, ELEVENLABS_API_KEY: "test" } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (status) => ok({ status, out }));
  });
}

// 0.67 s of a -30 dBFS rumble, then a -2.5 dBFS hit: the shape of the risograph trial's riso-drum.mp3.
function drum(dir) {
  const file = join(dir, "api-drum.mp3");
  const r = spawnSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", "-f", "lavfi", "-i", "aevalsrc=0.03*sin(2*PI*90*t):s=44100:d=0.67", "-f", "lavfi", "-i", "aevalsrc=0.75*sin(2*PI*180*t)*exp(-6*t):s=44100:d=0.8", "-filter_complex", "[0][1]concat=n=2:v=0:a=1", "-c:a", "libmp3lame", "-b:a", "96k", file], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return readFileSync(file);
}

test("sfx: the written drum sounds at once and the log reports the file on disk", { skip }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "ov-sfx-"));
  const bytes = drum(dir);
  const api = await fakeApi({ "POST /v1/sound-generation": () => ({ status: 200, body: bytes }) });
  try {
    const out = join(dir, "assets", "sfx", "riso-drum.mp3");
    const r = await run(["sfx", "--text", "riso drum hit", "--seconds", "1.5", "--out", out], api.base, dir);
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /^NORMALIZE .*riso-drum\.mp3 .*trimmed_head=0\.[56]\d*/m);
    const size = statSync(out).size;
    assert.notEqual(size, bytes.length, "normalize re-encoded the file");
    assert.match(r.out, new RegExp(`sfx → .*riso-drum\\.mp3 \\(${size} bytes; API ${bytes.length} bytes\\)`));
    const { lead } = measureLead(out);
    assert.ok(lead < 0.1, `sfx-sync lead ${lead} s (the trial file had 0.668 s)`);
  } finally {
    await api.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("sfx --no-normalize: the API bytes as they are, and the log says the same size once", { skip }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "ov-sfx-"));
  const bytes = drum(dir);
  const api = await fakeApi({ "POST /v1/sound-generation": () => ({ status: 200, body: bytes }) });
  try {
    const out = join(dir, "raw.mp3");
    const r = await run(["sfx", "--text", "riso drum hit", "--seconds", "1.5", "--out", out, "--no-normalize"], api.base, dir);
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, new RegExp(`sfx → .*raw\\.mp3 \\(${bytes.length} bytes\\)`));
    assert.deepEqual(readFileSync(out), bytes);
  } finally {
    await api.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
