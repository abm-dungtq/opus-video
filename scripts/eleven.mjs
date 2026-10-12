#!/usr/bin/env node
// eleven.mjs — ElevenLabs helper for the opus-video skill (Node >= 22, no deps).
//
//   node eleven.mjs doctor
//   node eleven.mjs voice-info [--voice id]
//   node eleven.mjs models
//   node eleven.mjs tts   (--text str | --text-file path) --out f.mp3 [--voice id] [--model id] [--speed 1.0] [--lang vi]
//   node eleven.mjs sfx   --text "english description" --seconds 1.5 --out f.mp3 [--influence 0.3]
//   node eleven.mjs music --prompt str --seconds 15 --out f.mp3
//   node eleven.mjs probe-models --text-file path [--models a,b,c] [--outdir /tmp]
//   node eleven.mjs audio-meta --script SCRIPT.md [--hyperframes .] [--bgm assets/bgm/x.mp3 --bgm-volume 0.2] [--reuse]
//
// audio-meta feeds HyperFrames workflows (faceless-explainer, product-launch-video, …) with
// eleven_v4 Vietnamese narration instead of their own TTS step. It writes BOTH
// audio_meta.json (frame-keyed) and audio_engine_meta.json (id-keyed sidecar): the
// workflow's `fetch-sfx` merges from the sidecar and rewrites audio_meta.json, so a
// missing sidecar would drop every voice.
//
// Credentials: $ELEVENLABS_API_KEY, else ~/.config/opus-video/.env (KEY=VALUE lines).
// The key is never printed. Exit codes: 0 ok, 1 error, 2 usage, 3 music unavailable on plan.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { maybeHelp } from "./cli-help.mjs";
maybeHelp(process.argv.slice(2), import.meta.url);

const API = "https://api.elevenlabs.io";
const ENV_FILE = join(homedir(), ".config", "opus-video", ".env");
const DEFAULTS = {
  voice: "eGSd0uV8dNQnZuEEX9lu",
  ttsModel: "eleven_v4",
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

async function call(path, { method = "GET", body, binary = false } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { "xi-api-key": key(), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new HttpError(res.status, await res.text());
  return binary ? Buffer.from(await res.arrayBuffer()) : res.json();
}

function writeOut(path, buf) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
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

// SCRIPT.md (hyperframes script-format) → [{ frame, text }]. A `## … (Frame N)` heading opens a
// line, `**key:**` rows are metadata, indented lines are the spoken text. Same rules as
// faceless-explainer's parser; lines sharing a frame are joined.
function parseScript(md) {
  const byFrame = new Map();
  let frame = null;
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^#{2,3}\s+.*?\(frame\s+(\d+)\)/i);
    if (h) {
      frame = Number(h[1]);
      continue;
    }
    if (frame == null || /^\s*\*\*/.test(line)) continue;
    const m = line.match(/^(?: {4,}|\t)(.+)$/);
    if (m) byFrame.set(frame, [byFrame.get(frame), m[1].trim()].filter(Boolean).join(" "));
  }
  return [...byFrame].map(([f, text]) => ({ frame: f, text })).sort((a, b) => a.frame - b.frame);
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
    await tts({
      text: readText(),
      out: need("out"),
      voice: args.voice || env("OPUS_VIDEO_VOICE_ID") || DEFAULTS.voice,
      model: args.model || env("OPUS_VIDEO_TTS_MODEL") || DEFAULTS.ttsModel,
      speed: Number(args.speed || 1.0),
      lang: args.lang || "vi",
    });
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
    writeOut(need("out"), buf);
    console.error(`sfx → ${args.out} (${buf.length} bytes)`);
  },

  async music() {
    const body = {
      prompt: need("prompt"),
      music_length_ms: Math.round(Number(need("seconds")) * 1000),
      model_id: DEFAULTS.musicModel,
      force_instrumental: true,
    };
    for (let attempt = 0; ; attempt++) {
      try {
        const buf = await call("/v1/music", { method: "POST", binary: true, body });
        writeOut(need("out"), buf);
        console.error(`music → ${args.out} (${buf.length} bytes)`);
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
    const voice = args.voice || env("OPUS_VIDEO_VOICE_ID") || DEFAULTS.voice;
    const model = args.model || env("OPUS_VIDEO_TTS_MODEL") || DEFAULTS.ttsModel;

    const voices = [];
    for (const { frame, text } of lines) {
      const id = String(frame).padStart(2, "0");
      const rel = `assets/voice/${id}.mp3`;
      const abs = join(hf, rel);
      const reuse = args.reuse && existsSync(abs) && existsSync(`${abs}.words.json`);
      if (reuse) console.error(`frame ${id}: reuse ${rel}`);
      else await tts({ text, out: abs, voice, model, speed: Number(args.speed || 1.0), lang: args.lang || "vi" });
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
      tts_provider: "elevenlabs",
      voice_id: voice,
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
    const outdir = args.outdir || "/tmp";
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

if (!commands[cmd]) {
  console.error(`usage: eleven.mjs <${Object.keys(commands).join("|")}> [--flags]`);
  process.exit(2);
}
commands[cmd]().catch((err) => die(err.message));
