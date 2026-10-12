// Round-trip: eleven.mjs audio-meta → faceless-explainer fetch-sfx must keep every voice.
// Uses --reuse on fixture voice files, so no ElevenLabs credit is spent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const eleven = fileURLToPath(new URL("../eleven.mjs", import.meta.url));
const fixture = fileURLToPath(new URL("./fixtures/audio-meta", import.meta.url));
const facelessAudio = join(homedir(), ".claude/skills/faceless-explainer/scripts/audio.mjs");

function run(args, cwd) {
  const r = spawnSync("node", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) assert.fail(`node ${args.join(" ")} exited ${r.status}\n${r.stdout}\n${r.stderr}`);
  return r;
}

test("audio-meta survives fetch-sfx", () => {
  const dir = mkdtempSync(join(tmpdir(), "ov-audio-meta-"));
  cpSync(fixture, dir, { recursive: true });

  run([eleven, "audio-meta", "--script", "SCRIPT.md", "--hyperframes", dir, "--reuse", "--lang", "en", "--bgm", "assets/bgm/bed.mp3", "--bgm-volume", "0.2"], dir);
  const before = JSON.parse(readFileSync(join(dir, "audio_meta.json"), "utf8"));
  const sidecar = JSON.parse(readFileSync(join(dir, "audio_engine_meta.json"), "utf8"));
  assert.equal(before.voices.length, 2);
  assert.equal(before.voices[0].frame, 1);
  assert.equal(before.voices[0].path, "assets/voice/01.mp3");
  assert.equal(before.voices[0].words[0].id, "w0");
  assert.ok(before.voices[0].duration_s > 1);
  assert.equal(sidecar.voices[0].id, "01");
  assert.equal(sidecar.tts_provider, "elevenlabs");
  assert.equal(before.bgm.source, "host");

  assert.ok(existsSync(facelessAudio), `faceless-explainer audio.mjs not found at ${facelessAudio}`);
  run([facelessAudio, "fetch-sfx", "--storyboard", join(dir, "STORYBOARD.md"), "--hyperframes", dir], dir);
  const after = JSON.parse(readFileSync(join(dir, "audio_meta.json"), "utf8"));
  assert.deepEqual(after.voices, before.voices);
  assert.deepEqual(after.bgm, { path: "assets/bgm/bed.mp3", volume: 0.2, source: "host" });
  assert.ok(after.sfx.length >= 1, "fetch-sfx should resolve the whoosh cues from the bundled library");
});
