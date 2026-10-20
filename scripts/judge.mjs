#!/usr/bin/env node
// judge.mjs — let Gemini (via the `agy` CLI) watch a rendered MP4 and return structured QA.
//
//   node judge.mjs check --video <mp4> --hyperframes <dir> --out <file.json> [--model id] [--timeout 300]
//   node judge.mjs pair  --a <mp4> --b <mp4> --out <file.json> [--model id] [--timeout 540]
//   node judge.mjs score --video <mp4> --hyperframes <dir> --out <file.json> [--runs 3] [--style <id>] [--model id] [--timeout 300]
//
// check: hard-defect review with an anti-fabrication fingerprint (on-screen text must match the
//        project HTML, reported duration must match ffprobe). Frames of hard issues are extracted
//        from the original video into <out-basename>_frames/.
// pair:  A/B comparison run twice with the order swapped; consensus ∈ {A, B, tie, invalid}.
// score: observe-only jury, 7 dimensions 1–10, median of N sequential runs (each in a fresh temp dir),
//        spread and timecoded fixes; never FAIL, exit 0 when ≥ min(2, N) runs are valid.
//
// Every agy call runs in a fresh temp dir holding only 540p copies + schema.json, with --new-project.
// agy binary: $AGY_BIN, else `which agy`, else ~/.local/bin/agy.
// Exit codes: 0 ok (check PASS / pair consensus / score valid), 1 check FAIL, 2 invalid or usage, 3 agy auth, 4 agy missing.

import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, copyFileSync, readdirSync, statSync, realpathSync } from "node:fs";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { loadProfiles, lookup } from "./styles.mjs";
import { homedir, tmpdir } from "node:os";
import { join, dirname, resolve, extname } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(HERE, "judge-schemas");
const DEFAULT_MODEL = "gemini-3.8-flash-high";
const DURATION_TOLERANCE_S = 3;
const MIN_TEXT_MATCHES = 2;
const MIN_PHRASE_LEN = 4;
const AUTH_RE = /(not logged in|sign in|log in|login|not eligible|unauthori[sz]ed|authenticat)/i;

export const EXIT = { PASS: 0, FAIL: 1, INVALID: 2, AUTH: 3, MISSING: 4 };

const CHECK_PROMPT = `Watch @clip.mp4 from the first frame to the last, including audio. It is a short faceless brand video.
1. duration_s: the total length in seconds.
2. onscreen_text: copy up to 12 distinct text phrases that appear on screen, verbatim, keeping Vietnamese diacritics and letter case.
3. issues: report every defect using exactly one code, with t_s = the second where it is most visible:
   UNREADABLE_TEXT (text on screen too briefly or too small to read), OVERLAP (text or elements colliding),
   DEAD_AIR (2+ seconds of near-static, empty frame), DIACRITIC_OR_CASE (broken Vietnamese diacritics, or an acronym/brand with altered case),
   FAKE_UI (invented interface or product passed off as real), FLICKER (flashing, stutter, ugly pop-in),
   AV_DESYNC (text or visuals far from the narration), OTHER.
   severity "hard" = a viewer would notice and it hurts the message; otherwise "soft". Note: one short sentence.
   Judge text at rest: words sliding in through a mask and deliberate crossfades/zoom transitions are not defects.
   Small Vietnamese text can be hard to read at this resolution; only report DIACRITIC_OR_CASE when you are sure.
4. verdict: FAIL if there is at least one hard issue, else PASS.
Judge only from watching the video. Do not open other files and do not run any other tool.`;

const PAIR_PROMPT = `Watch @first.mp4 and @second.mp4 completely, including audio. They are two edits of the same short brand video.
Report duration_first_s and duration_second_s in seconds.
Compare them on five dimensions: clarity (message and text easy to read and follow), motion (purposeful, smooth animation),
layout (composition, spacing, nothing covered or cramped), pacing (rhythm fits the narration, no dead air), polish (finish, consistency, no glitches).
For each dimension set better = first | second | tie and give evidence naming the file and the second, e.g. "second @4s: caption covers the logo".
winner: the video a viewer would prefer overall, or tie if they are genuinely equal. top_fix_for_loser: the single change that would most improve the weaker one.
Judge only from watching the videos. Do not open other files and do not run any other tool.`;

export const SCORE_DIMENSIONS = ["style_fidelity", "concept_wow", "motion_craft", "design_typography", "finish_texture", "sound_sync", "technical"];
const IMPACT_ORDER = { high: 0, medium: 1, low: 2 };

const SCORE_PROMPT = `You are a senior motion-design jury member for Vietnamese social video (TikTok, Reels, YouTube). You did NOT make @clip.mp4.
Watch it from the first frame to the last, including audio. Judge harshly and precisely; kindness is useless, specificity is everything.
1. duration_s: the total length in seconds. onscreen_text: up to 12 distinct on-screen phrases, verbatim, keeping Vietnamese diacritics and case.
2. scores: 1-10 on each dimension. Anchors: 5 = competent student work, 6 = decent template, 7 = solid professional, 8 = high-end agency,
   9 = award shortlist, 10 = best in the world. Most first renders deserve 5-7. Do not inflate.
   style_fidelity (the intended style is instantly recognisable; its signature moves are present and correct),
   concept_wow (a clear idea, a hook in the first 0.5 s, one unmistakable hero moment, a satisfying end frame),
   motion_craft (easing, spacing, overlap, anticipation and follow-through, arcs, transitions; no dead or jittery motion),
   design_typography (composition, hierarchy, grid, Vietnamese type setting, palette, negative space),
   finish_texture (lighting, texture, grain, glow; no banding, aliasing or artifacts),
   sound_sync (music fits, sound design, visual hits on audio onsets, voice clear over music),
   technical (no glitches, clipping, popping, fallback fonts or broken diacritics).
3. fixes: 5-10 fixes ordered by impact. Each: t_s (second), dimension, observed (what is wrong), change (concrete how-to with numbers:
   easing curve, frame counts, px, colours, seconds), impact, wow. At least one fix must have wow = true.
4. critical: anything that reads as generic or AI-template, unnatural Vietnamese, fallback fonts, or a spec failure. strengths: what to keep.
   ai_template: true if the whole video reads as a generic AI template.
Judge only from watching the video. Do not open other files and do not run any other tool.`;

// Adds the style's signature moves so style_fidelity is judged against them; moves may be strings or objects.
export function scorePrompt(moves = []) {
  const lines = moves.map((m) => (typeof m === "string" ? m : `${m.name} — ${m.technique}${m.check ? ` (check: ${m.check})` : ""}`));
  return lines.length ? `${SCORE_PROMPT}\nThe intended style's signature moves (judge style_fidelity against these):\n- ${lines.join("\n- ")}` : SCORE_PROMPT;
}

// ---------- pure helpers (exported for tests) ----------

export function normalizeText(s) {
  return String(s).normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function htmlToText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === "#") {
        const cp = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    });
}

// Phrases are matched one by one: a phrase assembled on screen from several HTML elements may not be
// a substring of the corpus — it simply does not count, it is not an error.
export function countTextMatches(phrases, corpus) {
  const usable = (Array.isArray(phrases) ? phrases : []).map(normalizeText).filter((p) => p.length >= MIN_PHRASE_LEN);
  return { matched: usable.filter((p) => corpus.includes(p)).length, total: usable.length };
}

// agy --output-format json envelope → { kind: "ok", data } | { kind: "auth" } | { kind: "invalid", reason }.
export function parseEnvelope(stdout, stderr = "") {
  let env = null;
  try {
    env = JSON.parse(String(stdout).trim());
  } catch {
    env = null;
  }
  if (env && typeof env === "object" && env.status === "SUCCESS" && !env.error) {
    const so = env.structured_output;
    if (so && typeof so === "object" && !Array.isArray(so)) return { kind: "ok", data: so };
    return { kind: "invalid", reason: "missing structured_output" };
  }
  // Only agy's own error channels can signal auth; model text may legitimately mention "login".
  const errText = `${stderr}\n${env && env.error ? JSON.stringify(env.error) : ""}\n${env ? "" : stdout}`;
  if (AUTH_RE.test(errText)) return { kind: "auth" };
  if (!String(stdout).trim()) return { kind: "invalid", reason: "empty output" };
  if (!env) return { kind: "invalid", reason: "stdout is not JSON" };
  return { kind: "invalid", reason: `agy status ${JSON.stringify(env.status ?? null)}` };
}

export function checkShapeError(r) {
  if (typeof r.duration_s !== "number") return "duration_s is not a number";
  if (!Array.isArray(r.onscreen_text)) return "onscreen_text is not an array";
  if (!["PASS", "FAIL"].includes(r.verdict)) return "verdict not PASS/FAIL";
  if (!Array.isArray(r.issues)) return "issues is not an array";
  if (r.issues.some((i) => !i || typeof i.t_s !== "number" || !["hard", "soft"].includes(i.severity)))
    return "malformed issue";
  return null;
}

export function pairShapeError(r) {
  if (typeof r.duration_first_s !== "number" || typeof r.duration_second_s !== "number") return "durations not numbers";
  if (!["first", "second", "tie"].includes(r.winner)) return "winner not first/second/tie";
  if (!Array.isArray(r.dimensions)) return "dimensions is not an array";
  return null;
}

export function scoreShapeError(r) {
  if (typeof r.duration_s !== "number") return "duration_s is not a number";
  if (!Array.isArray(r.onscreen_text)) return "onscreen_text is not an array";
  const s = r.scores;
  if (!s || typeof s !== "object") return "scores missing";
  for (const d of SCORE_DIMENSIONS) if (!Number.isInteger(s[d]) || s[d] < 1 || s[d] > 10) return `scores.${d} not an integer 1-10`;
  if (!Array.isArray(r.fixes) || !r.fixes.length) return "fixes empty";
  if (r.fixes.some((f) => !f || typeof f.t_s !== "number" || !SCORE_DIMENSIONS.includes(f.dimension))) return "malformed fix";
  return null;
}

// Median of numbers; the mean of the two middle values when the count is even.
export function median(xs) {
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// Valid score results → per-dimension median and spread (max − min), overall = mean of medians (2 decimals),
// unstable = dimensions whose spread is above 1.
export function aggregateScores(results) {
  const med = {}, spread = {};
  for (const d of SCORE_DIMENSIONS) {
    const v = results.map((r) => r.scores[d]);
    med[d] = median(v);
    spread[d] = Math.max(...v) - Math.min(...v);
  }
  const overall = Math.round((SCORE_DIMENSIONS.reduce((a, d) => a + med[d], 0) / SCORE_DIMENSIONS.length) * 100) / 100;
  const unstable = SCORE_DIMENSIONS.filter((d) => spread[d] > 1);
  const aiVotes = results.filter((r) => r.ai_template === true).length;
  const fixes = results
    .flatMap((r, run) => r.fixes.map((f) => ({ ...f, run: run + 1 })))
    .sort((a, b) => (IMPACT_ORDER[a.impact] ?? 3) - (IMPACT_ORDER[b.impact] ?? 3) || a.t_s - b.t_s);
  const critical = [...new Set(results.flatMap((r) => r.critical || []))];
  return { median: med, spread, overall, unstable, ai_template: aiVotes * 2 > results.length, critical, fixes };
}

// order "AB": first = A; order "BA": first = B.
export function mapWinner(winner, order) {
  if (winner === "tie") return "tie";
  if (winner !== "first" && winner !== "second") return "invalid";
  const [first, second] = order === "AB" ? ["A", "B"] : ["B", "A"];
  return winner === "first" ? first : second;
}

export function consensusOf(r1, r2) {
  if (r1 === "invalid" || r2 === "invalid") return "invalid";
  if (r1 === "A" && r2 === "A") return "A";
  if (r1 === "B" && r2 === "B") return "B";
  return "tie";
}

// ---------- process helpers ----------

class UsageError extends Error {}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    args[k] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
  }
  return args;
}

function need(args, k) {
  if (!args[k]) throw new UsageError(`missing --${k}`);
  return args[k];
}

function needFile(args, k) {
  const p = resolve(need(args, k));
  if (!existsSync(p)) throw new UsageError(`--${k} not found: ${p}`);
  return p;
}

function positiveNumber(v, fallback, name) {
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!(n > 0)) throw new UsageError(`--${name} must be a positive number`);
  return n;
}

export function resolveAgy(env = process.env) {
  if (env.AGY_BIN) return existsSync(env.AGY_BIN) ? env.AGY_BIN : null;
  const w = spawnSync("which", ["agy"], { encoding: "utf8" });
  const found = w.status === 0 ? w.stdout.trim() : "";
  if (found && existsSync(found)) return found;
  const local = join(homedir(), ".local", "bin", "agy");
  return existsSync(local) ? local : null;
}

function probeDuration(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], {
    encoding: "utf8",
  });
  const d = Number((r.stdout || "").trim());
  if (r.status !== 0 || !(d > 0)) throw new Error(`ffprobe could not read duration of ${file}`);
  return Math.round(d * 1000) / 1000;
}

// Short side → 540 px so 16:9 and 9:16 both stay legible.
function transcode540(src, dst) {
  const r = spawnSync(
    "ffmpeg",
    ["-v", "error", "-y", "-i", src, "-map", "0:v:0", "-map", "0:a?",
     "-vf", "scale='if(gt(iw,ih),-2,540)':'if(gt(iw,ih),540,-2)'",
     "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p",
     "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", dst],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`ffmpeg 540p transcode failed for ${src}: ${(r.stderr || "").slice(0, 300)}`);
}

function extractFrame(src, t, dst) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-ss", String(Math.max(0, t)), "-i", src, "-frames:v", "1", dst], {
    encoding: "utf8",
  });
  return r.status === 0 && existsSync(dst);
}

function agyArgs({ prompt, model, timeout }) {
  return ["-p", prompt, "--new-project", "--add-dir", ".", "--model", model,
    "--json-schema", "schema.json", "--output-format", "json", "--print-timeout", `${timeout}s`];
}

function makeWorkDir(schemaName) {
  const dir = mkdtempSync(join(tmpdir(), "ov-judge-"));
  copyFileSync(join(SCHEMA_DIR, `${schemaName}.json`), join(dir, "schema.json"));
  return dir;
}

function failureText(r) {
  if (r.error) return `${r.error.code || r.error.message}`;
  return r.signal ? `killed by ${r.signal}` : "";
}

function runAgySync(bin, cwd, opts) {
  const r = spawnSync(bin, agyArgs(opts), {
    cwd, encoding: "utf8", timeout: (opts.timeout + 60) * 1000, maxBuffer: 64 * 1024 * 1024,
  });
  const parsed = parseEnvelope(r.stdout || "", r.stderr || "");
  if (parsed.kind === "invalid" && failureText(r)) parsed.reason += ` (${failureText(r)})`;
  return parsed;
}

function runAgyAsync(bin, cwd, opts) {
  return new Promise((done) => {
    let stdout = "";
    let stderr = "";
    let killedBy = "";
    const child = spawn(bin, agyArgs(opts), { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      killedBy = "timeout";
      child.kill("SIGKILL");
    }, (opts.timeout + 60) * 1000);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      clearTimeout(timer);
      done({ kind: "invalid", reason: `spawn failed: ${err.code || err.message}` });
    });
    child.on("close", () => {
      clearTimeout(timer);
      const parsed = parseEnvelope(stdout, stderr);
      if (parsed.kind === "invalid" && killedBy) parsed.reason += ` (${killedBy})`;
      done(parsed);
    });
  });
}

function writeJson(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n");
}

function htmlFiles(root) {
  const files = [];
  const index = join(root, "index.html");
  if (existsSync(index)) files.push(index);
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".html")) files.push(p);
    }
  };
  walk(join(root, "compositions"));
  return files;
}

export function buildCorpus(hyperframesDir) {
  const files = htmlFiles(hyperframesDir);
  if (!files.length) throw new UsageError(`no index.html or compositions/**/*.html in ${hyperframesDir}`);
  return files.map((f) => normalizeText(htmlToText(readFileSync(f, "utf8")))).join(" \n ");
}

// ---------- commands ----------

async function cmdCheck(args, agy) {
  const video = needFile(args, "video");
  const hf = resolve(need(args, "hyperframes"));
  const out = resolve(need(args, "out"));
  const model = args.model || DEFAULT_MODEL;
  const timeout = positiveNumber(args.timeout, 300, "timeout");
  const corpus = buildCorpus(hf);
  const realDuration = probeDuration(video);

  const work = makeWorkDir("check");
  let attempt;
  try {
    transcode540(video, join(work, "clip.mp4"));
    for (let i = 0; i < 2; i++) {
      attempt = { status: "invalid", result: null, fingerprint: null, reason: "" };
      const r = runAgySync(agy, work, { prompt: CHECK_PROMPT, model, timeout });
      if (r.kind === "auth") return authExit();
      if (r.kind === "invalid") {
        attempt.reason = r.reason;
      } else {
        attempt.result = r.data;
        const shape = checkShapeError(r.data);
        if (shape) attempt.reason = shape;
        else {
          const m = countTextMatches(r.data.onscreen_text, corpus);
          const diff = Math.round(Math.abs(r.data.duration_s - realDuration) * 1000) / 1000;
          attempt.fingerprint = { matched: m.matched, total: m.total, duration_diff_s: diff };
          if (m.matched < MIN_TEXT_MATCHES) attempt.reason = `only ${m.matched} on-screen phrases match the HTML`;
          else if (diff > DURATION_TOLERANCE_S) attempt.reason = `duration off by ${diff}s`;
          else attempt.status = "valid";
        }
      }
      if (attempt.status === "valid") break;
      console.error(`judge check: attempt ${i + 1} invalid — ${attempt.reason}`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  const frames = [];
  let failed = false;
  if (attempt.status === "valid") {
    const hard = attempt.result.issues.filter((i) => i.severity === "hard");
    failed = attempt.result.verdict === "FAIL" || hard.length > 0;
    if (hard.length) {
      const frameDir = out.slice(0, out.length - extname(out).length) + "_frames";
      mkdirSync(frameDir, { recursive: true });
      for (const t of [...new Set(hard.map((i) => i.t_s))]) {
        const png = join(frameDir, `t-${t}.png`);
        if (extractFrame(video, Math.min(t, realDuration - 0.05), png)) frames.push(png);
        else console.error(`judge check: could not extract frame at ${t}s`);
      }
    }
  }

  const report = {
    mode: "check", status: attempt.status, model, video,
    fingerprint: attempt.fingerprint, result: attempt.result, frames,
    ...(attempt.status === "invalid" ? { reason: attempt.reason } : {}),
  };
  writeJson(out, report);
  const code = attempt.status === "invalid" ? EXIT.INVALID : failed ? EXIT.FAIL : EXIT.PASS;
  console.log(`judge check: ${attempt.status}${attempt.status === "valid" ? ` ${failed ? "FAIL" : "PASS"}` : ""} → ${out}`);
  return code;
}

async function runPairOrder(agy, order, files, durations, opts) {
  const [firstKey, secondKey] = order === "AB" ? ["a", "b"] : ["b", "a"];
  const work = makeWorkDir("pair");
  try {
    copyFileSync(files[firstKey], join(work, "first.mp4"));
    copyFileSync(files[secondKey], join(work, "second.mp4"));
    let run;
    for (let i = 0; i < 2; i++) {
      run = { order, status: "invalid", winner_mapped: "invalid", raw: null, reason: "" };
      const r = await runAgyAsync(agy, work, { ...opts, prompt: PAIR_PROMPT });
      if (r.kind === "auth") return { order, auth: true };
      if (r.kind === "invalid") run.reason = r.reason;
      else {
        run.raw = r.data;
        const shape = pairShapeError(r.data);
        const d1 = Math.abs(r.data.duration_first_s - durations[firstKey]);
        const d2 = Math.abs(r.data.duration_second_s - durations[secondKey]);
        if (shape) run.reason = shape;
        else if (d1 > DURATION_TOLERANCE_S || d2 > DURATION_TOLERANCE_S)
          run.reason = `duration off by ${d1.toFixed(2)}s / ${d2.toFixed(2)}s`;
        else {
          run.status = "valid";
          run.winner_mapped = mapWinner(r.data.winner, order);
          delete run.reason;
          break;
        }
      }
      console.error(`judge pair ${order}: attempt ${i + 1} invalid — ${run.reason}`);
    }
    return run;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function cmdPair(args, agy) {
  const a = needFile(args, "a");
  const b = needFile(args, "b");
  const out = resolve(need(args, "out"));
  const model = args.model || DEFAULT_MODEL;
  const timeout = positiveNumber(args.timeout, 540, "timeout");
  const durations = { a: probeDuration(a), b: probeDuration(b) };

  const stage = mkdtempSync(join(tmpdir(), "ov-judge-"));
  let runs;
  try {
    const files = { a: join(stage, "a.mp4"), b: join(stage, "b.mp4") };
    transcode540(a, files.a);
    transcode540(b, files.b);
    runs = await Promise.all(["AB", "BA"].map((o) => runPairOrder(agy, o, files, durations, { model, timeout })));
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
  if (runs.some((r) => r.auth)) return authExit();

  const consensus = consensusOf(runs[0].winner_mapped, runs[1].winner_mapped);
  writeJson(out, { mode: "pair", consensus, model, a, b, runs });
  console.log(`judge pair: consensus ${consensus} → ${out}`);
  return consensus === "invalid" ? EXIT.INVALID : EXIT.PASS;
}

// One independent jury run in a fresh temp dir; `clip` is the 540p copy made once by cmdScore.
async function scoreOnce(agy, clip, prompt, opts, corpus, realDuration) {
  const work = makeWorkDir("score");
  try {
    copyFileSync(clip, join(work, "clip.mp4"));
    let run;
    for (let i = 0; i < 2; i++) {
      run = { status: "invalid", fingerprint: null, result: null, reason: "" };
      const r = await runAgyAsync(agy, work, { ...opts, prompt });
      if (r.kind === "auth") return { auth: true };
      if (r.kind === "invalid") run.reason = r.reason;
      else {
        run.result = r.data;
        const shape = scoreShapeError(r.data);
        if (shape) run.reason = shape;
        else {
          const m = countTextMatches(r.data.onscreen_text, corpus);
          const diff = Math.round(Math.abs(r.data.duration_s - realDuration) * 1000) / 1000;
          run.fingerprint = { matched: m.matched, total: m.total, duration_diff_s: diff };
          if (m.matched < MIN_TEXT_MATCHES) run.reason = `only ${m.matched} on-screen phrases match the HTML`;
          else if (diff > DURATION_TOLERANCE_S) run.reason = `duration off by ${diff}s`;
          else { run.status = "valid"; delete run.reason; break; }
        }
      }
      console.error(`judge score: attempt ${i + 1} invalid — ${run.reason}`);
    }
    return run;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function cmdScore(args, agy) {
  const video = needFile(args, "video");
  const hf = resolve(need(args, "hyperframes"));
  const out = resolve(need(args, "out"));
  const model = args.model || DEFAULT_MODEL;
  const timeout = positiveNumber(args.timeout, 300, "timeout");
  const runsN = positiveNumber(args.runs, 3, "runs");
  if (!Number.isInteger(runsN) || runsN > 5) throw new UsageError("--runs must be an integer 1-5");
  let moves = [];
  let id = null;
  if (args.style) {
    const profiles = loadProfiles();
    try { id = lookup(args.style, profiles); } catch (e) { throw new UsageError(`--style: ${e.message}`); }
    moves = profiles[id].signature_moves || [];
  }
  const corpus = buildCorpus(hf);
  const realDuration = probeDuration(video);
  const prompt = scorePrompt(moves);
  // Runs are sequential: parallel uploads on one account risk per-minute quota errors, and an auth failure stops at run 1.
  const stage = mkdtempSync(join(tmpdir(), "ov-judge-"));
  const runs = [];
  try {
    const clip = join(stage, "clip.mp4");
    transcode540(video, clip);
    for (let i = 0; i < runsN; i++) {
      const r = await scoreOnce(agy, clip, prompt, { model, timeout }, corpus, realDuration);
      if (r.auth) return authExit();
      runs.push(r);
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
  const valid = runs.filter((r) => r.status === "valid").map((r) => r.result);
  const need2 = Math.min(2, runsN);
  const status = valid.length >= need2 ? "valid" : "invalid";
  const report = {
    mode: "score", status, model, video, style: id, runs_requested: runsN, runs_valid: valid.length,
    ...(status === "valid" ? aggregateScores(valid) : { reason: `only ${valid.length} of ${runsN} runs valid` }),
    runs,
  };
  writeJson(out, report);
  if (status === "valid") {
    console.log(`judge score: overall ${report.overall} (median of ${valid.length}) → ${out}`);
    for (const d of SCORE_DIMENSIONS) console.log(`  ${d}: ${report.median[d]} (spread ${report.spread[d]})`);
    if (report.unstable.length) console.log(`  unstable (spread > 1): ${report.unstable.join(", ")}`);
  } else console.log(`judge score: invalid — ${report.reason} → ${out}`);
  return status === "valid" ? EXIT.PASS : EXIT.INVALID;
}

function authExit() {
  console.error("AGY_AUTH: agy is not signed in or not eligible — run `agy` interactively to sign in, or fall back to still-frame QA");
  return EXIT.AUTH;
}

export async function main(argv = process.argv.slice(2)) {
  if (wantsHelp(argv)) { process.stdout.write(helpText(import.meta.url)); return 0; }
  const [cmd, ...rest] = argv;
  const commands = { check: cmdCheck, pair: cmdPair, score: cmdScore };
  if (!commands[cmd]) {
    console.error("usage: judge.mjs <check|pair|score> [--flags]  (see header of judge.mjs)");
    return EXIT.INVALID;
  }
  const args = parseArgs(rest);
  const agy = resolveAgy();
  if (!agy) {
    console.error("AGY_MISSING: agy CLI not found ($AGY_BIN, PATH, ~/.local/bin/agy)");
    return EXIT.MISSING;
  }
  try {
    return await commands[cmd](args, agy);
  } catch (err) {
    console.error(`error: ${err.message}`);
    return EXIT.INVALID;
  }
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) { // realpath: invoked via ~/.claude/skills symlink
  main().then((code) => process.exit(code));
}
