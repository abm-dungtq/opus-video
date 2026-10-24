#!/usr/bin/env node
// eleven.mjs — ElevenLabs helper for the opus-video skill (Node >= 22, no deps).
//
//   node eleven.mjs doctor
//   node eleven.mjs voice-info [--voice id]
//   node eleven.mjs models
//   node eleven.mjs tts   --text-file <project>/script/NN.txt --out f.mp3 [--project dir] [--voice id] [--model id] [--speed 1.0] [--lang vi] [--skip-viet-pro-gate]
//   node eleven.mjs sfx   --text "english description" --seconds 1.5 --out f.mp3 [--influence 0.3] [--no-normalize]
//   node eleven.mjs music --prompt str --seconds 15 --out f.mp3 [--no-normalize]
//   node eleven.mjs probe-models --text-file path [--models a,b,c]   (writes to $TMPDIR/ov-probe)
//   node eleven.mjs audio-meta --script SCRIPT.md [--hyperframes .] [--project dir] [--bgm assets/bgm/x.mp3 --bgm-volume 0.2] [--reuse] [--skip-viet-pro-gate]
//
// viet-pro gate (tts, audio-meta): when BRIEF.md `language:` is Vietnamese (or missing), voice is
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

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, dirname, resolve, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { maybeHelp } from "./cli-help.mjs";
import { parseScript, writeStamp, stampMatches } from "./script-md.mjs";
import { voiceGate, GATE_EXIT } from "./voice-gate.mjs";
import { loadKey, ping } from "./jev-client.mjs";
import { defaultVp, frontmatter } from "./check-viet-pro.mjs";
import { DEFAULT_VOICE, DEFAULT_TTS_MODEL, pickVoice } from "./voice-defaults.mjs";
import { BED_DEFAULTS, writeGenerated } from "./normalize-bed.mjs";
import { elevenRefusal, REFUSED_EXIT } from "./director-guard.mjs";
maybeHelp(process.argv.slice(2), import.meta.url);

const API = "https://api.elevenlabs.io";
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
// sfx/music output: written, then normalized to the bed level unless --no-normalize.
function writeBed(path, buf) {
  writeGenerated(path, buf, { normalize: !args["no-normalize"], lufs: BED_DEFAULTS.lufs, log: (s) => console.error(s), warn: (s) => console.error(s) });
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
    await tts({
      text,
      out,
      ...(({ voice, model }) => ({ voice, model }))(projectVoice(project)),
      speed: Number(args.speed || 1.0),
      lang,
    });
    if (!g.skipped) writeStamp(out, { text, script: textFile && `script/${basename(textFile)}`, override: g.override });
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
    writeBed(need("out"), buf);
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
        writeBed(need("out"), buf);
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
    const lang = args.lang || "vi";
    const g = gate({ project: resolve(args.project || hf), frames: lines, skip: !!args["skip-viet-pro-gate"], voiceLang: lang });
    const { voice, model } = projectVoice(resolve(args.project || hf));

    const voices = [];
    for (const { frame, text } of lines) {
      const id = String(frame).padStart(2, "0");
      const rel = `assets/voice/${id}.mp3`;
      const abs = join(hf, rel);
      // Reuse only audio stamped by the gate for this exact text (never an override run).
      const reuse = args.reuse && existsSync(abs) && existsSync(`${abs}.words.json`) && (g.skipped || stampMatches(abs, text));
      if (reuse) console.error(`frame ${id}: reuse ${rel}`);
      else {
        if (args.reuse && existsSync(abs)) console.error(`frame ${id}: not reused (no matching gate stamp), re-voicing`);
        await tts({ text, out: abs, voice, model, speed: Number(args.speed || 1.0), lang });
        if (!g.skipped) writeStamp(abs, { text, script: `script/${id}.txt`, override: g.override });
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
