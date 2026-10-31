#!/usr/bin/env node
// eleven.mjs — ElevenLabs helper for the opus-video skill (Node >= 22, no deps).
//
//   node eleven.mjs doctor
//   node eleven.mjs voice-info [--voice id]
//   node eleven.mjs models
//   node eleven.mjs tts   --text-file <project>/script/NN.txt --out f.mp3 [--project dir] [--voice id] [--model id] [--speed 1.0] [--lang vi] [--skip-viet-pro-gate]
//                         [--provider elevenlabs|gemini] [--tempo 0.8–1.25]
//   node eleven.mjs sfx   --text "english description" --seconds 1.5 --out f.mp3 [--influence 0.3] [--no-normalize]
//   node eleven.mjs music --prompt str --seconds 15 --out f.mp3 [--no-normalize]
//   node eleven.mjs music --plan plan.json [--out f.mp3 | --outro] [--no-normalize]
//     --plan: ElevenLabs composition plan (global styles + sections with duration_ms), sent with
//     model music_v1 (the only model that takes sections[]), respect_sections_durations and
//     mp3_44100_128. The bar placement is still not a contract: arrange the result with arrange-music.mjs.
//     --outro: default --out assets/bgm/outro.mp3 (a second, calm bed under the ending).
//   node eleven.mjs align --audio f.mp3 --text-file <project>/script/NN.txt [--project dir] [--out f.words.json] [--force] [--lang vi] [--skip-viet-pro-gate]
//     forced alignment for a voice that is not TTS (a real recording, a clip): writes <audio>.words.json
//     in the TTS shape [{text,start,end}]. The text goes through the viet-pro gate like tts.
//   node eleven.mjs probe-models --text-file path [--models a,b,c]   (writes to $TMPDIR/ov-probe)
//   node eleven.mjs audio-meta --script SCRIPT.md [--hyperframes .] [--project dir] [--bgm assets/bgm/x.mp3 --bgm-volume 0.2] [--reuse] [--skip-viet-pro-gate]
//                         [--provider elevenlabs|gemini] [--tempo 0.8–1.25]
//
// --provider (tts, audio-meta): default BRIEF.md `voice_provider:`, else elevenlabs. gemini speaks with
// Gemini TTS (gemini-tts.mjs; GEMINI_API_KEY; --model, else BRIEF `gemini_tts_model`, else
// gemini-3.8-flash-tts; --voice, else BRIEF `gemini_voice`, a Gemini voice name, default Kore; --speed
// is ignored with a WARN), converts to mp3 44.1 kHz 128k, then gets the words by ElevenLabs forced
// alignment: it still needs ELEVENLABS_API_KEY (checked before the Gemini call) and spends ElevenLabs
// credit. The viet-pro gate runs first, as for ElevenLabs.
// --tempo x: any provider; ffmpeg atempo (in the same encode for gemini), every word time divided by x.
// The stamp records provider (when not elevenlabs), model and voice (gemini) and tempo (when not 1),
// and --reuse re-voices a line whose stamp was made another way.
//
// viet-pro gate (tts, align, audio-meta): when BRIEF.md `language:` is Vietnamese (or missing), voice is
// generated only if check-viet-pro.mjs passes for the project AND the voiced text is the gated
// text — tts takes only --text-file <project>/script/NN.txt (no --text), and every SCRIPT.md
// frame must equal script/NN.txt (whitespace-insensitive). Project: --project, else the parent
// of the script/ dir (tts) or --hyperframes (audio-meta). Override: --skip-viet-pro-gate with
// BRIEF.md frontmatter `viet_pro_override: <reason, ≥10 chars, no #>`; printed every run and
// rejected by `check-viet-pro --stage delivery`. Each generated voice gets <mp3>.gate.json (text
// hash + override); --reuse and the delivery gate accept only a matching non-override stamp.
// A non-Vietnamese BRIEF needs a matching --lang (the default vi is refused there). doctor/voice-info/models/sfx/music/probe-models
// are not gated.
//
// sfx and music: the file written is then trimmed of head/tail silence and brought to -12.5 LUFS
// (TP -1.5 dBTP) by normalize-bed.mjs, which prints one NORMALIZE line. --no-normalize keeps the
// API bytes as they are. A failed normalize keeps the file as written, prints
// "WARN normalize: <reason>" and still exits 0, so a paid generation is never lost.
// sfx also trims a quiet lead-in before the hit: the head cut is at (file peak − 20 dB), where
// sfx-sync.mjs hears the sound, so no data-media-start is needed to land it on its event. The
// "sfx → <out> (<n> bytes)" / "music → …" line gives the size of the file on disk, plus the API
// bytes when normalize re-encoded it.
//
// audio-meta feeds HyperFrames workflows (faceless-explainer, product-launch-video, …) with
// eleven_v4 Vietnamese narration instead of their own TTS step. It writes BOTH
// audio_meta.json (frame-keyed) and audio_engine_meta.json (id-keyed sidecar): the
// workflow's `fetch-sfx` merges from the sidecar and rewrites audio_meta.json, so a
// missing sidecar would drop every voice.
//
// Credentials: $ELEVENLABS_API_KEY, else ~/.config/opus-video/.env (KEY=VALUE lines).
// Voice (tts, audio-meta): --voice/--model, then BRIEF.md `voice_id`/`tts_model`, then
// OPUS_VIDEO_VOICE_ID/OPUS_VIDEO_TTS_MODEL, then the defaults; the chosen source is printed.
// The key is never printed. Exit codes: 0 ok, 1 error, 2 usage, 3 music unavailable on plan,
// 4 viet-pro gate blocked, 5 refused to the Studio director of a series episode (director-guard.mjs:
// it runs only sfx and music; voices go through Studio's series tools behind a consent card).
// align also exits 2 when its output exists without --force and 3 when forced alignment is not on the
// plan; tts and audio-meta with gemini exit 3 the same way (ALIGN_UNAVAILABLE).

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, dirname, resolve, basename, extname } from "node:path";
import { spawnSync } from "node:child_process";
import { maybeHelp } from "./cli-help.mjs";
import { parseScript, writeStamp, stampMatches } from "./script-md.mjs";
import { voiceGate, GATE_EXIT } from "./voice-gate.mjs";
import { loadKey, ping } from "./jev-client.mjs";
import { defaultVp, frontmatter } from "./check-viet-pro.mjs";
import { DEFAULT_VOICE, DEFAULT_TTS_MODEL, pickVoice, briefValue } from "./voice-defaults.mjs";
import { BED_DEFAULTS, SFX_ONSET_DB, writeGenerated } from "./normalize-bed.mjs";
import { elevenRefusal, REFUSED_EXIT } from "./director-guard.mjs";
import { synthGemini, DEFAULT_GEMINI_MODEL, DEFAULT_GEMINI_VOICE } from "./gemini-tts.mjs";
maybeHelp(process.argv.slice(2), import.meta.url);

// Base URL is overridable for tests only (a local fake server); real runs use the public API.
const API = process.env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io";
const ENV_FILE = join(homedir(), ".config", "opus-video", ".env");
const DEFAULTS = {
  voice: DEFAULT_VOICE,
  ttsModel: DEFAULT_TTS_MODEL,
  musicModel: "music_v2_5",
  sfxModel: "eleven_text_to_sound_v2",
};
const LIMIT_TTS = 10000;
const LIMIT_DIALOGUE = 2000;

function loadEnvFile() {
  if (!existsSync(ENV_FILE)) return {};
  const out = {};
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
const fileEnv = loadEnvFile();
const env = (k) => process.env[k] || fileEnv[k] || "";
// tts/audio-meta: --voice/--model > BRIEF.md voice_id/tts_model > machine env > defaults; prints the source.
function projectVoice(project) {
  const b = join(project, "BRIEF.md");
  const brief = existsSync(b) ? frontmatter(readFileSync(b, "utf8")) : {};
  const r = pickVoice({ args, brief, env: { OPUS_VIDEO_VOICE_ID: env("OPUS_VIDEO_VOICE_ID"), OPUS_VIDEO_TTS_MODEL: env("OPUS_VIDEO_TTS_MODEL") } });
  console.error(`voice: ${r.voice} (${r.from.voice}) · model: ${r.model} (${r.from.model})`);
  return r;
}

const [cmd, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i++) {
  if (!rest[i].startsWith("--")) continue;
  const k = rest[i].slice(2);
  const v = rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[++i] : "true";
  args[k] = v;
}

function die(msg, code = 1) {
  console.error(`error: ${msg}`);
  process.exit(code);
}
// viet-pro gate (voice-gate.mjs): prints its messages, exits 4 when blocked.
function gate(opts) {
  const g = voiceGate(opts);
  for (const m of g.messages) console.error(m);
  if (!g.ok) die("viet-pro gate blocked voice generation", GATE_EXIT);
  return g;
}
function need(k) {
  if (!args[k]) die(`missing --${k}`, 2);
  return args[k];
}

function key() {
  const k = env("ELEVENLABS_API_KEY");
  if (!k) die(`ELEVENLABS_API_KEY not set (env or ${ENV_FILE})`);
  return k;
}

class HttpError extends Error {
  constructor(status, body) {
    super(`HTTP ${status}: ${body.slice(0, 300)}`);
    this.status = status;
  }
}

// form: a FormData sent as multipart (fetch sets the boundary, so no Content-Type here).
async function call(path, { method = "GET", body, form, binary = false } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { "xi-api-key": key(), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  if (!res.ok) throw new HttpError(res.status, await res.text());
  return binary ? Buffer.from(await res.arrayBuffer()) : res.json();
}

function writeOut(path, buf) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
}
// sfx/music output: written, then normalized to the bed level unless --no-normalize.
// An SFX also loses a quiet lead-in before its hit (onsetDb: the moment sfx-sync hears it), so it
// sounds at data-start without a data-media-start. Returns the size of the file as written, which
// the log reports (normalize re-encodes, so it differs from the API bytes).
function writeBed(path, buf, { onsetDb } = {}) {
  writeGenerated(path, buf, { normalize: !args["no-normalize"], lufs: BED_DEFAULTS.lufs, onsetDb, log: (s) => console.error(s), warn: (s) => console.error(s) });
  return statSync(path).size;
}
const bytesNote = (size, buf) => `${size} bytes${size !== buf.length ? `; API ${buf.length} bytes` : ""}`;

// Model for --plan: the sections[] composition plan is accepted by music_v1 only.
const PLAN_MUSIC_MODEL = "music_v1";

// Composition plan for `music --plan`: read and checked before any request; exit 2 names the bad field.
function readPlan(file) {
  let plan;
  try {
    plan = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    die(`--plan ${file}: ${err.message}`, 2);
  }
  const strings = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
  for (const k of ["positive_global_styles", "negative_global_styles"]) {
    if (!strings(plan?.[k])) die(`--plan: ${k} phải là mảng chuỗi`, 2);
  }
  if (!Array.isArray(plan.sections) || !plan.sections.length) die("--plan: sections phải là mảng không rỗng", 2);
  plan.sections.forEach((sec, i) => {
    const at = `--plan: sections[${i}]`;
    if (typeof sec?.section_name !== "string" || !sec.section_name) die(`${at}.section_name phải là chuỗi`, 2);
    if (!Number.isInteger(sec.duration_ms) || sec.duration_ms < 3000 || sec.duration_ms > 120000) die(`${at}.duration_ms phải là số nguyên 3000–120000`, 2);
    for (const k of ["positive_local_styles", "negative_local_styles"]) if (!strings(sec[k])) die(`${at}.${k} phải là mảng chuỗi`, 2);
    if (!Array.isArray(sec.lines)) die(`${at}.lines phải là mảng`, 2);
  });
  return plan;
}

// Group character-level alignment into words split on whitespace.
function toWords(al) {
  if (!al?.characters) return [];
  const words = [];
  let cur = null;
  al.characters.forEach((ch, i) => {
    const s = al.character_start_times_seconds[i];
    const e = al.character_end_times_seconds[i];
    if (/\s/.test(ch)) {
      if (cur) words.push(cur);
      cur = null;
    } else if (!cur) cur = { text: ch, start: s, end: e };
    else {
      cur.text += ch;
      cur.end = e;
    }
  });
  if (cur) words.push(cur);
  return words.map((w) => ({ text: w.text, start: +w.start.toFixed(3), end: +w.end.toFixed(3) }));
}

function readText() {
  if (args.text) return args.text;
  if (args["text-file"]) return readFileSync(args["text-file"], "utf8").trim();
  die("missing --text or --text-file", 2);
}

async function tts({ text, out, voice, model, speed, lang }) {
  let data, route;
  try {
    if (text.length > LIMIT_TTS) die(`text is ${text.length} chars; split by scene (max ${LIMIT_TTS})`);
    data = await call(`/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      body: { text, model_id: model, language_code: lang, voice_settings: { speed } },
    });
    route = "tts";
  } catch (err) {
    if (!(err instanceof HttpError) || ![400, 422].includes(err.status)) throw err;
    console.error(`route tts rejected (${err.message.slice(0, 160)}); trying dialogue`);
    if (text.length > LIMIT_DIALOGUE)
      die(`text is ${text.length} chars; dialogue route max is ${LIMIT_DIALOGUE}, split by scene`);
    data = await call(`/v1/text-to-dialogue/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      body: { model_id: model, language_code: lang, inputs: [{ text, voice_id: voice }] },
    });
    route = "dialogue";
  }
  writeOut(out, Buffer.from(data.audio_base64, "base64"));
  const words = toWords(data.alignment || data.normalized_alignment);
  writeFileSync(`${out}.words.json`, JSON.stringify(words, null, 2));
  console.error(`route: ${route} · model ${model} · ${words.length} words → ${out}`);
  return { route, words: words.length };
}

// ElevenLabs forced alignment of audio against text → { words, tokens, loss }. Words split like the
// TTS words (toWords over characters) when that gives one word per token of the text, as karaoke
// splits line.text; else the API's words[], trimmed. 401/402/403 print ALIGN_UNAVAILABLE, exit 3.
async function forcedAlign(audio, text) {
    const form = new FormData();
    const mime = { ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac", ".flac": "audio/flac", ".ogg": "audio/ogg" }[extname(audio).toLowerCase()];
    form.append("file", new Blob([readFileSync(audio)], mime ? { type: mime } : {}), basename(audio));
    form.append("text", text);
    let data;
    try {
      data = await call("/v1/forced-alignment", { method: "POST", form });
    } catch (err) {
      if ([401, 402, 403].includes(err.status)) {
        console.log("ALIGN_UNAVAILABLE");
        console.error(err.message);
        process.exit(3);
      }
      throw err;
    }
    const tokens = text.split(/\s+/).filter(Boolean).length;
    const chars = (data.characters ?? []).filter((c) => Number.isFinite(c?.start) && Number.isFinite(c?.end));
    const fromChars = toWords({ characters: chars.map((c) => c.text), character_start_times_seconds: chars.map((c) => c.start), character_end_times_seconds: chars.map((c) => c.end) });
    const fromWords = (Array.isArray(data.words) ? data.words : [])
      .map((w) => ({ text: String(w?.text ?? "").trim(), start: Number(w?.start), end: Number(w?.end) }))
      .filter((w) => w.text && Number.isFinite(w.start) && Number.isFinite(w.end))
      .map((w) => ({ text: w.text, start: +w.start.toFixed(3), end: +w.end.toFixed(3) }));
    const words = fromChars.length === tokens ? fromChars : fromWords.length === tokens ? fromWords : fromWords.length ? fromWords : fromChars;
    return { words, tokens, loss: data.loss };
}

// Voice settings for tts and audio-meta: --provider/--model/--voice/--tempo, then BRIEF.md (a
// "<placeholder>" or empty BRIEF value counts as unset, as in voice-defaults.mjs).
function voiceSpec(project) {
  const b = join(project, "BRIEF.md");
  const brief = existsSync(b) ? frontmatter(readFileSync(b, "utf8")) : {};
  const provider = args.provider || briefValue(brief.voice_provider) || "elevenlabs";
  if (!["elevenlabs", "gemini"].includes(provider)) die(`--provider (hoặc BRIEF voice_provider) phải là elevenlabs hoặc gemini, đang là "${provider}"`, 2);
  const tempo = args.tempo === undefined ? 1 : Number(args.tempo);
  if (!(tempo >= 0.8 && tempo <= 1.25)) die("--tempo phải trong khoảng 0.8–1.25", 2);
  if (provider === "elevenlabs") return { provider, tempo, ...projectVoice(project) };
  const key = env("GEMINI_API_KEY");
  if (!key) die(`voice_provider gemini cần GEMINI_API_KEY (env hoặc ${ENV_FILE})`, 2);
  // The words come from ElevenLabs forced alignment: check its key before Gemini spends a call.
  if (!env("ELEVENLABS_API_KEY")) die(`voice_provider gemini vẫn cần ELEVENLABS_API_KEY cho mốc từ (env hoặc ${ENV_FILE})`, 2);
  const model = args.model || briefValue(brief.gemini_tts_model) || DEFAULT_GEMINI_MODEL;
  const voice = args.voice || briefValue(brief.gemini_voice) || DEFAULT_GEMINI_VOICE;
  if (/^[A-Za-z0-9]{20}$/.test(voice)) die(`--voice "${voice}" trông như id giọng ElevenLabs; với gemini dùng tên giọng Gemini (vd ${DEFAULT_GEMINI_VOICE}) hoặc BRIEF gemini_voice`, 2);
  if (args.speed !== undefined) console.error("WARN --speed chỉ dùng cho ElevenLabs; với gemini dùng --tempo");
  console.error(`voice: gemini ${voice} · model: ${model} · words: ElevenLabs forced alignment`);
  return { provider, tempo, model, voice, key };
}
const stampHow = (spec) => ({ ...(spec.provider === "gemini" ? { provider: "gemini", model: spec.model, voice: spec.voice } : {}), tempo: spec.tempo });
const stampWant = (spec) => ({ provider: spec.provider, tempo: spec.tempo, ...(spec.provider === "gemini" ? { model: spec.model, voice: spec.voice } : {}) });

// Throws (the caller cleans its temp files; the top-level catch exits 1).
function ffmpeg(argv) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", "-v", "error", "-y", ...argv], { encoding: "utf8" });
  if (r.error || r.status !== 0) throw new Error(`ffmpeg: ${r.error?.message ?? String(r.stderr).trim()}`);
}

// One voice line → out (mp3) + out.words.json, by the chosen provider, then --tempo. Gemini writes
// to a temp mp3 (tempo in the same encode) and replaces out only after alignment succeeds, so out
// never pairs with the words of an older take.
async function speak({ text, out, spec, speed, lang }) {
  if (spec.provider === "gemini") {
    const wav = await synthGemini({ text, voice: spec.voice, model: spec.model, key: spec.key });
    const tmp = join(tmpdir(), `ov-gemini-${process.pid}-${Date.now()}.wav`);
    const part = `${out}.part.mp3`;
    mkdirSync(dirname(out), { recursive: true });
    try {
      writeFileSync(tmp, wav);
      ffmpeg(["-i", tmp, ...(spec.tempo !== 1 ? ["-filter:a", `atempo=${spec.tempo}`] : []), "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", part]);
      const { words, tokens } = await forcedAlign(part, text);
      if (!words.length) throw new Error("forced alignment không trả từ nào");
      if (words.length !== tokens) console.error(`WARN align words=${words.length} khác chữ nguồn ${tokens}`);
      renameSync(part, out);
      writeFileSync(`${out}.words.json`, JSON.stringify(words, null, 2));
      console.error(`route: gemini · model ${spec.model} · ${words.length} words${spec.tempo !== 1 ? ` · tempo ${spec.tempo}` : ""} → ${out}`);
    } finally {
      rmSync(tmp, { force: true });
      rmSync(part, { force: true });
    }
    return;
  }
  await tts({ text, out, voice: spec.voice, model: spec.model, speed, lang });
  if (spec.tempo !== 1) {
    const tmp = `${out}.tempo.mp3`;
    try {
      ffmpeg(["-i", out, "-filter:a", `atempo=${spec.tempo}`, "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", tmp]);
      renameSync(tmp, out);
    } finally {
      rmSync(tmp, { force: true });
    }
    const words = JSON.parse(readFileSync(`${out}.words.json`, "utf8"));
    const r3 = (x) => +(x / spec.tempo).toFixed(3);
    writeFileSync(`${out}.words.json`, JSON.stringify(words.map((w) => ({ ...w, start: r3(w.start), end: r3(w.end) })), null, 2));
    console.error(`tempo ${spec.tempo} → ${out}`);
  }
}

function probeDuration(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], {
    encoding: "utf8",
  });
  const d = Number(r.stdout.trim());
  if (r.status !== 0 || !(d > 0)) die(`ffprobe could not read duration of ${file}`);
  return Math.round(d * 1000) / 1000;
}

const commands = {
  async doctor() {
    const s = await call("/v1/user/subscription");
    console.log(`tier: ${s.tier}`);
    console.log(`characters: ${s.character_count}/${s.character_limit}`);
    console.log(`env file: ${existsSync(ENV_FILE) ? "present" : "absent"}`);
    console.log(`tts model: ${env("OPUS_VIDEO_TTS_MODEL") || DEFAULTS.ttsModel}`);
    console.log(`voice: ${env("OPUS_VIDEO_VOICE_ID") || DEFAULTS.voice}`);
    // Optional services: reported, never fatal. Key presence only, never its value.
    const jevKey = loadKey();
    console.log(`jev key: ${jevKey ? "present" : "absent"}`);
    console.log(`jev: ${await ping({ apiKey: jevKey })}`);
    console.log(`viet-pro: ${existsSync(join(defaultVp(), "scripts", "lint-vietnamese-content.mjs")) ? "installed" : "missing"}`);
  },

  async "voice-info"() {
    const id = args.voice || env("OPUS_VIDEO_VOICE_ID") || DEFAULTS.voice;
    try {
      const v = await call(`/v1/voices/${id}`);
      console.log(`name: ${v.name}`);
      console.log(`id: ${v.voice_id}`);
      console.log(`labels: ${JSON.stringify(v.labels || {})}`);
    } catch (err) {
      if (err.status === 404)
        die(`voice ${id} not found — open https://elevenlabs.io/voices/${id} and click "Add to My Voices"`);
      throw err;
    }
  },

  async models() {
    const list = await call("/v1/models");
    for (const m of list) {
      const vi = (m.languages || []).some((l) => l.language_id === "vi") ? "vi" : "-";
      console.log(`${m.model_id} | tts:${m.can_do_text_to_speech ? "yes" : "no"} | ${vi}`);
    }
  },

  async tts() {
    const textFile = args["text-file"] ? resolve(args["text-file"]) : null;
    const lang = args.lang || "vi";
    // <project>/script/NN.txt → <project>; any other location → --project or the cwd.
    const project = resolve(args.project || (textFile && basename(dirname(textFile)) === "script" ? dirname(dirname(textFile)) : "."));
    const g = gate({
      project,
      textFiles: textFile ? [textFile] : [],
      inline: !!args.text,
      skip: !!args["skip-viet-pro-gate"],
      voiceLang: lang,
    });
    const text = g.texts?.[0] ?? readText();
    const out = need("out");
    const spec = voiceSpec(project);
    await speak({ text, out, spec, speed: Number(args.speed || 1.0), lang });
    if (!g.skipped) writeStamp(out, { text, script: textFile && `script/${basename(textFile)}`, override: g.override, ...stampHow(spec) });
  },

  async align() {
    const audio = resolve(need("audio"));
    const textFile = resolve(need("text-file"));
    if (!existsSync(audio)) die(`không thấy ${audio}`, 2);
    const lang = args.lang || "vi";
    const project = resolve(args.project || (basename(dirname(textFile)) === "script" ? dirname(dirname(textFile)) : "."));
    const g = gate({ project, textFiles: [textFile], inline: false, skip: !!args["skip-viet-pro-gate"], voiceLang: lang });
    const text = g.texts?.[0] ?? readFileSync(textFile, "utf8").trim();
    const out = resolve(args.out || `${audio}.words.json`);
    if (existsSync(out) && !args.force) die(`${out} đã có; thêm --force để ghi đè`, 2);
    const { words, tokens, loss } = await forcedAlign(audio, text);
    if (!words.length) die("forced alignment không trả từ nào");
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(words, null, 2));
    if (!g.skipped) writeStamp(audio, { text, script: `script/${basename(textFile)}`, override: g.override });
    if (words.length !== tokens) console.log(`WARN align words=${words.length} khác chữ nguồn ${tokens}`);
    console.log(`ALIGN ${out} words=${words.length} loss=${loss ?? "?"}`);
    if (Number(loss) > 1) console.log("WARN align loss cao, kiểm lại chữ và audio");
  },

  async sfx() {
    const buf = await call("/v1/sound-generation", {
      method: "POST",
      binary: true,
      body: {
        text: need("text"),
        duration_seconds: Number(need("seconds")),
        prompt_influence: Number(args.influence || 0.3),
        model_id: DEFAULTS.sfxModel,
      },
    });
    const size = writeBed(need("out"), buf, { onsetDb: SFX_ONSET_DB });
    console.error(`sfx → ${args.out} (${bytesNote(size, buf)})`);
  },

  async music() {
    if (args.plan && args.prompt) die("chọn --plan hoặc --prompt", 2);
    // A plan with sections[] is the music_v1 format: ElevenLabs rejects it with music_v2/v2_5,
    // which take a chunks[] plan instead. music_v1 keeps each section's duration_ms.
    const body = args.plan
      ? { composition_plan: readPlan(args.plan), model_id: PLAN_MUSIC_MODEL, respect_sections_durations: true }
      : {
          prompt: need("prompt"),
          music_length_ms: Math.round(Number(need("seconds")) * 1000),
          model_id: DEFAULTS.musicModel,
          force_instrumental: true,
        };
    const out = args.out ?? (args.outro ? "assets/bgm/outro.mp3" : need("out"));
    for (let attempt = 0; ; attempt++) {
      try {
        const buf = await call(args.plan ? "/v1/music?output_format=mp3_44100_128" : "/v1/music", { method: "POST", binary: true, body });
        const size = writeBed(out, buf);
        console.error(`music → ${out} (${bytesNote(size, buf)})`);
        return;
      } catch (err) {
        if ([401, 402, 403].includes(err.status)) {
          console.log("MUSIC_UNAVAILABLE");
          console.error(err.message);
          process.exit(3);
        }
        if (err.status === 429 && attempt < 2) {
          await new Promise((r) => setTimeout(r, 10000));
          continue;
        }
        throw err;
      }
    }
  },

  async "audio-meta"() {
    const hf = resolve(args.hyperframes || ".");
    const lines = parseScript(readFileSync(resolve(need("script")), "utf8"));
    if (!lines.length) die("no `## … (Frame N)` lines with indented text found in the script");
    const lang = args.lang || "vi";
    const g = gate({ project: resolve(args.project || hf), frames: lines, skip: !!args["skip-viet-pro-gate"], voiceLang: lang });
    const spec = voiceSpec(resolve(args.project || hf));

    const voices = [];
    for (const { frame, text } of lines) {
      const id = String(frame).padStart(2, "0");
      const rel = `assets/voice/${id}.mp3`;
      const abs = join(hf, rel);
      // Reuse only audio stamped by the gate for this exact text (never an override run).
      const reuse = args.reuse && existsSync(abs) && existsSync(`${abs}.words.json`) && (g.skipped || stampMatches(abs, text, stampWant(spec)));
      if (reuse) console.error(`frame ${id}: reuse ${rel}`);
      else {
        if (args.reuse && existsSync(abs)) console.error(`frame ${id}: not reused (no matching gate stamp), re-voicing`);
        await speak({ text, out: abs, spec, speed: Number(args.speed || 1.0), lang });
        if (!g.skipped) writeStamp(abs, { text, script: `script/${id}.txt`, override: g.override, ...stampHow(spec) });
      }
      const words = JSON.parse(readFileSync(`${abs}.words.json`, "utf8")).map((w, i) => ({
        id: `w${i}`,
        text: w.text,
        start: w.start,
        end: w.end,
      }));
      voices.push({ id, frame, path: rel, duration_s: probeDuration(abs), words });
    }

    let bgm = null;
    if (args.bgm) {
      if (!existsSync(join(hf, args.bgm))) die(`bgm file not found: ${args.bgm}`);
      bgm = { path: args.bgm, volume: Number(args["bgm-volume"] || 0.2), source: "host" };
    }

    const engineMeta = {
      tts_provider: spec.provider,
      voice_id: spec.voice,
      bgm: null,
      bgm_pending: false,
      voices: voices.map(({ id, path, duration_s, words }) => ({ id, path, duration_s, words })),
      sfx: [],
    };
    const audioMeta = {
      bgm,
      bgm_pending: false,
      voices: voices.map(({ frame, path, duration_s, words }) => ({ frame, path, duration_s, words })),
      sfx: [],
    };
    writeFileSync(join(hf, "audio_engine_meta.json"), JSON.stringify(engineMeta, null, 2));
    writeFileSync(join(hf, "audio_meta.json"), JSON.stringify(audioMeta, null, 2));
    const total = voices.reduce((s, v) => s + v.duration_s, 0).toFixed(2);
    console.error(`audio-meta: ${voices.length} voices, total ${total} s → audio_meta.json + audio_engine_meta.json`);
  },

  async "probe-models"() {
    const text = readText();
    const models = (args.models || "eleven_v4,eleven_v3,eleven_flash_v2_5").split(",");
    if (args.outdir) die("--outdir was removed: probe-models always writes to $TMPDIR/ov-probe", 2);
    // Model probes always land in a temp dir so they never serve as ungated production voice.
    const outdir = join(tmpdir(), "ov-probe");
    mkdirSync(outdir, { recursive: true });
    const voice = args.voice || env("OPUS_VIDEO_VOICE_ID") || DEFAULTS.voice;
    for (const model of models) {
      const out = join(outdir, `ov-probe-${model}.mp3`);
      try {
        const r = await tts({ text, out, voice, model, speed: 1.0, lang: "vi" });
        console.log(`${model} | ok | route ${r.route} | ${r.words} words | ${out}`);
      } catch (err) {
        console.log(`${model} | fail | ${err.message.slice(0, 160)}`);
      }
    }
  },
};

// The cwd and every project the command names (a text or script file: its folder and the one above,
// for <project>/script/NN.txt and <project>/SCRIPT.md): one of them in a series is enough to refuse.
const named = [process.cwd(), args.project, args.hyperframes,
  ...[args["text-file"], args.script].filter(Boolean).flatMap((p) => [dirname(resolve(p)), dirname(dirname(resolve(p)))])];
const refused = elevenRefusal(cmd, named);
if (refused) die(refused, REFUSED_EXIT);

if (!commands[cmd]) {
  console.error(`usage: eleven.mjs <${Object.keys(commands).join("|")}> [--flags]`);
  process.exit(2);
}
commands[cmd]().catch((err) => die(err.message));
