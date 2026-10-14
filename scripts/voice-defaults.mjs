// voice-defaults.mjs — ElevenLabs defaults shared by eleven.mjs and the BRIEF templates, kept in a
// side-effect-free module so make-pitch can tell "template default" from a voice the user chose.
export const DEFAULT_VOICE = "eGSd0uV8dNQnZuEEX9lu";
export const DEFAULT_TTS_MODEL = "eleven_v4";

// BRIEF value without an inline "# comment"; empty or a "<placeholder>" counts as unset.
const briefValue = (v) => {
  const s = String(v ?? "").replace(/\s+#.*$/, "").trim();
  return s && !s.startsWith("<") ? s : "";
};

// Voice and TTS model for a project: --voice/--model, then BRIEF.md voice_id/tts_model (the project's
// choice, e.g. written by make-pitch from the brand kit), then OPUS_VIDEO_VOICE_ID/OPUS_VIDEO_TTS_MODEL
// on this machine, then the defaults. A BRIEF value equal to the default is the template's, not a
// choice (same rule as make-pitch), so it does not hide the machine env. `from` names the winner.
export function pickVoice({ args = {}, brief = {}, env = {} } = {}) {
  const one = (arg, flag, key, envKey, dflt) =>
    arg ? [arg, flag] : briefValue(brief[key]) && briefValue(brief[key]) !== dflt ? [briefValue(brief[key]), "BRIEF.md"] : env[envKey] ? [env[envKey], envKey] : [dflt, "default"];
  const [voice, vf] = one(args.voice, "--voice", "voice_id", "OPUS_VIDEO_VOICE_ID", DEFAULT_VOICE);
  const [model, mf] = one(args.model, "--model", "tts_model", "OPUS_VIDEO_TTS_MODEL", DEFAULT_TTS_MODEL);
  return { voice, model, from: { voice: vf, model: mf } };
}
