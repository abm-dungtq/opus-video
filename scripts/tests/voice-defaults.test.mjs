import { test } from "node:test";
import assert from "node:assert/strict";
import { pickVoice, DEFAULT_VOICE, DEFAULT_TTS_MODEL } from "../voice-defaults.mjs";

test("pickVoice: --voice/--model, then BRIEF.md, then the machine env, then the defaults", () => {
  const env = { OPUS_VIDEO_VOICE_ID: "envVoice", OPUS_VIDEO_TTS_MODEL: "envModel" };
  const brief = { voice_id: "briefVoice", tts_model: "briefModel" };
  assert.deepEqual(pickVoice({ args: { voice: "argVoice", model: "argModel" }, brief, env }), { voice: "argVoice", model: "argModel", from: { voice: "--voice", model: "--model" } });
  assert.deepEqual(pickVoice({ brief, env }), { voice: "briefVoice", model: "briefModel", from: { voice: "BRIEF.md", model: "BRIEF.md" } });
  assert.deepEqual(pickVoice({ brief: {}, env }), { voice: "envVoice", model: "envModel", from: { voice: "OPUS_VIDEO_VOICE_ID", model: "OPUS_VIDEO_TTS_MODEL" } });
  assert.deepEqual(pickVoice({}), { voice: DEFAULT_VOICE, model: DEFAULT_TTS_MODEL, from: { voice: "default", model: "default" } });
});

test("pickVoice: an empty or placeholder BRIEF value does not win", () => {
  const env = { OPUS_VIDEO_VOICE_ID: "envVoice" };
  assert.equal(pickVoice({ brief: { voice_id: "" }, env }).voice, "envVoice");
  assert.equal(pickVoice({ brief: { voice_id: "<voice_id>" }, env }).voice, "envVoice");
  assert.equal(pickVoice({ brief: { voice_id: "  briefVoice  # note" }, env }).voice, "briefVoice");
});
