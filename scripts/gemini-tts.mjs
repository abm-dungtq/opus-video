// gemini-tts.mjs — Gemini text-to-speech for eleven.mjs --provider gemini (Node >= 22, no deps).
// synthGemini({ text, voice, model, key, base }) → Buffer of a WAV file (24 kHz mono 16-bit).
//   POST {base}/v1beta/models/{model}:generateContent, header x-goog-api-key, body
//   { contents:[{parts:[{text}]}], generationConfig:{ responseModalities:["AUDIO"],
//     speechConfig:{ voiceConfig:{ prebuiltVoiceConfig:{ voiceName } } } } };
//   the answer holds candidates[0].content.parts[0].inlineData.data, base64 PCM s16le 24 kHz mono.
// Gemini returns no word timing: eleven.mjs gets the words by ElevenLabs forced alignment.
// GEMINI_API_BASE overrides the host for tests only. The key is sent in the header, never printed.
// Not checked live yet: the default model is gemini-3.8-flash-tts (gemini-2.5-flash-preview-tts is
// retired on 2026-11-17), --model or BRIEF.md gemini_tts_model changes it.

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash-tts";
export const DEFAULT_GEMINI_VOICE = "Kore";
export const GEMINI_RATE = 24000;

export class HttpError extends Error {
  constructor(status, body) {
    super(`HTTP ${status}: ${String(body).slice(0, 300)}`);
    this.status = status;
  }
}

// 44-byte RIFF header in front of PCM s16le.
export function pcmToWav(pcm, { rate = GEMINI_RATE, channels = 1, bits = 16 } = {}) {
  const h = Buffer.alloc(44);
  const block = channels * (bits / 8);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * block, 28);
  h.writeUInt16LE(block, 32);
  h.writeUInt16LE(bits, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export async function synthGemini({ text, voice = DEFAULT_GEMINI_VOICE, model = DEFAULT_GEMINI_MODEL, key, base = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com" }) {
  const res = await fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    }),
  });
  if (!res.ok) throw new HttpError(res.status, await res.text());
  const data = await res.json();
  const b64 = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
  if (!b64) throw new Error(`Gemini không trả audio (model ${model})`);
  return pcmToWav(Buffer.from(b64, "base64"));
}
