#!/usr/bin/env node
// check-viet-pro.mjs — gate: a Vietnamese video script (and, at delivery, its captions) went
// through the FULL viet-pro workflow before voice/render (SKILL.md step 2) and hand-off (step 9).
//   node check-viet-pro.mjs [--project .] [--stage script|delivery] [--vp <viet-pro dir>] [--json]
//   node check-viet-pro.mjs --help | -h
// viet-pro dir: --vp, else $VIET_PRO_DIR, else the first viet-pro found by skill-paths.mjs (sibling
//   of this skill, then Claude Code / Codex / Antigravity skill dirs) (must hold SKILL.md and
//   scripts/lint-vietnamese-content.mjs). The required reading list is built from that install.
// Stage "script" (before eleven.mjs tts/audio-meta and before any render):
//   - BRIEF.md `language:` other than vi → SKIP (exit 0). Missing field → treated as vi.
//   - A `viet_pro` record in BRIEF.md or script-table.md: a heading "## viet_pro" (or a line
//     "viet_pro:") followed by "key: value" lines up to the next heading. Required, non-empty:
//     mode, files_read, humanizer, lint. files_read must name SKILL.md, every file in
//     references/review/ and references/editorial/, and publishing/video-script.md.
//   - viet-pro lint on script-table.md and on every script/*.txt (one voice line per file),
//     each file separately: any ERROR fails the gate.
//   - WARN only (never fails): voice words > duration × 3 (BRIEF `duration_s:` or `duration:`, ~2.5–3 words/s);
//     engagement-bait phrases; first-hand claims ("mình đã thử…") to confirm with the user.
//   - BRIEF `word_budget: N` (written by make-pitch.mjs choose from the direction's energy; picture
//     leads, words follow): voice words in script/*.txt above N fail the gate (when absent but
//     `direction:` is set, derived from the direction's energy and duration).
// BRIEF frontmatter `voice_source: clip` (the voice is the user's own clip, no TTS script):
//   - no script-table.md / script-table.v1.md / compare; no voice word-count, bait or first-hand
//     WARNs (the words are the user's, not ours);
//   - record needs mode, files_read, lint (no humanizer); files_read = SKILL.md + review/*
//     (+ publishing/facebook.md, repurpose-matrix.md at delivery), no editorial/video-script.md;
//   - script/captions.txt (burned-in captions) and script/on-screen.txt (every other on-screen
//     string) must exist; they are linted like voice lines. Delivery (CAPTIONS.md) is unchanged.
// Stage "delivery" = stage script plus:
//   - CAPTIONS.md with a "## Facebook…" section and a "## TikTok…" section, each linted on its
//     own (ERROR fails); no heading/bullet/markdown inside the Facebook section (personal profile).
//   - record field `captions`, and files_read also names publishing/facebook.md and
//     publishing/repurpose-matrix.md.
//   - script-table.v1.md (the draft before Humanizer) must exist next to script-table.md, and
//     viet-pro compare-preserved-content.mjs v1 → final must not report MISMATCH.
//   - SCRIPT.md, when present: its voiced frame lines are linted too (label SCRIPT.md#voice).
//   - delivery: BRIEF.md frontmatter viet_pro_override (a voice-gate override) fails the gate, and
//     every assets/voice/NN.mp3 needs a non-override gate stamp (NN.mp3.gate.json, written by
//     eleven.mjs) whose text hash equals the current script/NN.txt.
//   - language: vi, vie, vi-VN, "tiếng Việt"/"tieng viet" (any normalization) or missing → gated.
//   - a viet-pro lint that crashes counts as an ERROR; a missing compare script is an error.
// The lint is re-run here; the record is the agent's account (what was read, patterns fixed).
// --jev-audit (optional, needs TYPESAFE_API_KEY): asks Jev, one request per script/NN.txt, how
//   likely each line shows Humanizer patterns 1–5, engagement bait, invented first-hand
//   experience or an unsourced number. Prints WARN lines only; never changes the exit code.
// Exit: 0 pass (or skip) · 1 gate failed · 2 bad usage / viet-pro not found.

import { existsSync, readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { parseScript, readStamp, textHash } from "./script-md.mjs";
import { loadKey } from "./jev-client.mjs";
import { audit } from "./jev-audit.mjs";
import { findSkill } from "./skill-paths.mjs";
import { wordBudget } from "./directions.mjs";

export const REQUIRED_FIELDS = ["mode", "files_read", "humanizer", "lint"];
export const BAIT = /đừng (?:vội )?lướt|xem (?:hết|đến cuối|tới cuối)|99\s?% (?:mọi )?người|bạn sẽ không (?:thể )?tin|sự thật (?:gây sốc|ít ai biết)|không ai nói (?:cho )?bạn|bí mật (?:mà )?(?:ít ai|không ai)|like,? share|follow (?:ngay )?để không bỏ lỡ|comment\s+["“]?[^\s"”]+["”]?\s+để nhận|thả tim nếu|tag (?:ngay )?(?:một )?người bạn/giu;
export const FIRST_HAND = /(?:mình|tôi|em) (?:đã )?(?:thử|dùng|xài|test)(?: thử)? [^.!?\n]{0,40}(?:\d+\s*(?:ngày|tuần|tháng|năm)|rồi)|sau \d+\s*(?:ngày|tuần|tháng) (?:dùng|sử dụng|xài)/giu;
const PLACEHOLDER = /^(?:…|\.{3}|todo|tbd|-|n\/a|none yet|chưa)?$/i;

export function defaultVp(env = process.env) {
  return env.VIET_PRO_DIR || findSkill("viet-pro") || join(homedir(), ".claude", "skills", "viet-pro");
}

// Files the agent must have read: SKILL.md + all review/ + all editorial/ (+ publishing refs).
export function requiredReading(vp, stage = "script", { clip = false } = {}) {
  const list = (d) => (existsSync(join(vp, "references", d)) ? readdirSync(join(vp, "references", d)).filter((f) => f.endsWith(".md")).sort().map((f) => `${d}/${f}`) : []);
  const delivery = stage === "delivery" ? ["publishing/facebook.md", "publishing/repurpose-matrix.md"] : [];
  // A clip-voiced project has no authored script: editorial/ and video-script.md do not apply.
  if (clip) return ["SKILL.md", ...list("review"), ...delivery];
  return ["SKILL.md", ...list("review"), ...list("editorial"), "publishing/video-script.md", ...delivery];
}

export const CLIP_FIELDS = ["mode", "files_read", "lint"];
export const CLIP_TEXT = ["captions.txt", "on-screen.txt"];

export function isClipVoice(brief) {
  return /^clip$/i.test((frontmatter(brief).voice_source || "").trim());
}

// Blank out fenced code blocks (keeping line count) so a template record inside ``` is not read.
export function stripFences(text) {
  let inFence = false;
  return text.split(/\r?\n/).map((l) => {
    if (/^\s*(`{3,}|~{3,})/.test(l)) { inFence = !inFence; return ""; }
    return inFence ? "" : l;
  }).join("\n");
}

// Parse the viet_pro record. Returns { file, fields } or null.
export function parseRecord(text, file = "") {
  const lines = stripFences(text).split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{1,4}\s*`?viet_pro`?\s*$/i.test(l.trim()) || /^viet_pro:\s*$/i.test(l.trim()));
  if (start < 0) return null;
  const fields = {};
  let key = null;
  for (const raw of lines.slice(start + 1)) {
    if (/^#{1,4}\s/.test(raw) || /^---\s*$/.test(raw)) break;
    const m = raw.match(/^\s*(?:[-*]\s+)?`?([a-z_]+)`?\s*:\s*(.*)$/i);
    if (m && /^[a-z_]+$/.test(m[1]) && (raw.match(/^\s*/)[0].length <= 2)) { key = m[1].toLowerCase(); fields[key] = m[2].trim(); }
    else if (key && raw.trim()) fields[key] += (fields[key] ? "\n" : "") + raw.trim();
  }
  return { file, fields };
}

// BRIEF `language:` → is it Vietnamese? Missing → yes. Tolerant of ISO codes (vi, vie, vi-VN),
// NFD input and missing diacritics ("tieng viet").
export function isVietnamese(lang) {
  if (!lang) return true;
  const l = lang.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLowerCase().trim();
  return /^vie?\b|^vi[-_]|viet/.test(l);
}

export function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out = {};
  if (m) for (const l of m[1].split(/\r?\n/)) { const k = l.match(/^([A-Za-z_]+):\s*(.*?)\s*(?:#.*)?$/); if (k) out[k[1]] = k[2].replace(/^["']|["']$/g, ""); }
  return out;
}

// Split CAPTIONS.md into { facebook, tiktok } section bodies (null when missing).
export function captionSections(text) {
  const out = { facebook: null, tiktok: null };
  const parts = text.split(/^##\s+/m).slice(1);
  for (const p of parts) {
    const [title, ...body] = p.split(/\r?\n/);
    const k = /facebook/i.test(title) ? "facebook" : /tiktok/i.test(title) ? "tiktok" : null;
    if (k && out[k] === null) out[k] = body.join("\n").trim();
  }
  return out;
}

export function lintFiles(vp, files) {
  const lint = join(vp, "scripts", "lint-vietnamese-content.mjs");
  const res = {};
  for (const f of files) {
    const r = spawnSync(process.execPath, [lint, f.path], { encoding: "utf8" });
    const lines = (r.stdout || "").split("\n").filter(Boolean);
    const errors = lines.filter((l) => l.startsWith("ERROR")).map((l) => l.replace(f.path, f.label));
    // A crash (non-zero exit with no ERROR line) must not read as a clean lint.
    if (r.status !== 0 && !errors.length) errors.push(`ERROR ${f.label} lint crashed (status ${r.status}): ${(r.stderr || "").trim().split("\n")[0] || "no output"}`);
    res[f.label] = {
      errors,
      warns: lines.filter((l) => l.startsWith("WARN")).map((l) => l.replace(f.path, f.label)),
      status: r.status,
    };
  }
  return res;
}

const words = (t) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

export function check({ project = ".", stage = "script", vp = defaultVp(), compareScript = join(vp, "scripts", "compare-preserved-content.mjs") } = {}) {
  const dir = resolve(project);
  const errors = [], warnings = [];
  const out = { project: dir, stage, pass: false, skipped: false, errors, warnings, lint: {}, record: null };
  const brief = existsSync(join(dir, "BRIEF.md")) ? readFileSync(join(dir, "BRIEF.md"), "utf8") : "";
  const lang = frontmatter(brief).language || "";
  if (!isVietnamese(lang)) return { ...out, pass: true, skipped: true, reason: `language: ${lang}` };
  if (!existsSync(join(vp, "SKILL.md")) || !existsSync(join(vp, "scripts", "lint-vietnamese-content.mjs"))) {
    return { ...out, usage: `viet-pro not found at ${vp} (use --vp or $VIET_PRO_DIR)` };
  }

  const clip = isClipVoice(brief);
  out.voiceSource = clip ? "clip" : "tts";

  // 1. record
  const table = !clip && existsSync(join(dir, "script-table.md")) ? readFileSync(join(dir, "script-table.md"), "utf8") : null;
  const rec = parseRecord(brief, "BRIEF.md") || (table && parseRecord(table, "script-table.md"));
  out.record = rec;
  if (!rec) errors.push("no viet_pro record in BRIEF.md or script-table.md (heading `## viet_pro` + mode/files_read/humanizer/lint)");
  else {
    const need = [...(clip ? CLIP_FIELDS : REQUIRED_FIELDS), ...(stage === "delivery" ? ["captions"] : [])];
    for (const k of need) if (!rec.fields[k] || PLACEHOLDER.test(rec.fields[k].trim())) errors.push(`viet_pro.${k} is missing or empty (${rec.file})`);
    const read = rec.fields.files_read || "";
    const missing = requiredReading(vp, stage, { clip }).filter((f) => !read.includes(f));
    if (rec.fields.files_read && missing.length) errors.push(`viet_pro.files_read does not list: ${missing.join(", ")}`);
  }

  // 1b. the pre-Humanizer draft exists and the Humanizer pass preserved its facts
  if (table) {
    const v1 = join(dir, "script-table.v1.md");
    if (!existsSync(v1)) errors.push("script-table.v1.md not found (viet-pro draft before Humanizer)");
    else if (!existsSync(compareScript)) errors.push(`compare-preserved-content.mjs not found at ${compareScript} (update viet-pro)`);
    else {
      const c = spawnSync(process.execPath, [compareScript, v1, join(dir, "script-table.md")], { encoding: "utf8" });
      out.compare = { status: c.status, lines: `${c.stderr || ""}${c.stdout || ""}`.split("\n").filter((l) => /^(MISMATCH|REVIEW)/.test(l)).slice(0, 3) };
      if (c.status === 1) errors.push("compare-preserved-content MISMATCH script-table.v1.md → script-table.md");
      else if (c.status !== 0) errors.push(`compare-preserved-content did not run cleanly (status ${c.status})`);
    }
  }

  // 2. lint script-table.md and each voice line
  const scriptDir = join(dir, "script");
  const voice = existsSync(scriptDir) ? readdirSync(scriptDir).filter((f) => f.endsWith(".txt")).sort().map((f) => ({ path: join(scriptDir, f), label: `script/${f}` })) : [];
  if (clip) {
    for (const f of CLIP_TEXT) if (!voice.some((v) => v.label === `script/${f}`)) errors.push(`script/${f} not found (voice_source: clip lints captions and on-screen text instead of a script table)`);
  } else if (!table) errors.push("script-table.md not found");
  const targets = [...(table ? [{ path: join(dir, "script-table.md"), label: "script-table.md" }] : []), ...voice];
  Object.assign(out.lint, lintFiles(vp, targets));
  // SCRIPT.md (HyperFrames workflows): the lines audio-meta will voice
  if (existsSync(join(dir, "SCRIPT.md"))) {
    const frames = parseScript(readFileSync(join(dir, "SCRIPT.md"), "utf8"));
    if (frames.length) {
      const tmp = mkdtempSync(join(tmpdir(), "vp-voice-"));
      try {
        const path = join(tmp, "voice.md");
        writeFileSync(path, frames.map((f) => f.text).join("\n\n") + "\n");
        Object.assign(out.lint, lintFiles(vp, [{ path, label: "SCRIPT.md#voice" }]));
      } finally { rmSync(tmp, { recursive: true, force: true }); }
    }
  }

  // 3. soft checks on the spoken text (ours only: a clip's words belong to the user)
  const voiceText = clip ? "" : voice.map((v) => readFileSync(v.path, "utf8")).join("\n");
  const fm = frontmatter(brief);
  const duration = Number(fm.duration_s || fm.duration);
  const budget = Number(fm.word_budget) || (fm.direction && !fm.creative_override && !clip ? wordBudget(fm.energy || "vua", duration || 15).words : 0);
  if (voiceText && budget > 0 && words(voiceText) > budget) errors.push(`VOICE_OVER_BUDGET: voice has ${words(voiceText)} words, BRIEF word_budget is ${budget} (hình dẫn, lời theo: cắt lời hoặc chuyển ý sang hình/beat không lời)`);
  if (voiceText && duration > 0 && words(voiceText) > duration * 3) warnings.push(`voice has ${words(voiceText)} words for ${duration}s (> ~3 words/s; viet-pro video-script.md: ~2.5–3)`);
  const spoken = clip ? "" : voiceText || table || "";
  for (const m of new Set([...spoken.matchAll(BAIT)].map((x) => x[0]))) warnings.push(`engagement-bait phrase in the script: "${m}"`);
  for (const m of new Set([...spoken.matchAll(FIRST_HAND)].map((x) => x[0]))) warnings.push(`first-hand claim "${m}": keep only if the user gave this experience (viet-pro: không bịa trải nghiệm)`);

  // 4. delivery: captions
  if (stage === "delivery") {
    if (frontmatter(brief).viet_pro_override) errors.push("viet_pro_override is set in BRIEF.md: not allowed at delivery; remove it and re-voice through the gate");
    const voiceDir = join(dir, "assets", "voice");
    for (const f of existsSync(voiceDir) ? readdirSync(voiceDir).filter((x) => x.endsWith(".mp3")).sort() : []) {
      const st = readStamp(join(voiceDir, f));
      const src = join(dir, "script", f.replace(/\.mp3$/, ".txt"));
      if (!st) errors.push(`assets/voice/${f} has no gate stamp (voiced outside the viet-pro gate); re-voice with eleven.mjs`);
      else if (st.override) errors.push(`assets/voice/${f} was voiced under viet_pro_override; re-voice through the gate`);
      else if (!existsSync(src) || st.sha256 !== textHash(readFileSync(src, "utf8"))) errors.push(`assets/voice/${f} does not match the current script/${basename(src)}; re-voice it`);
    }
    const capPath = join(dir, "CAPTIONS.md");
    if (!existsSync(capPath)) errors.push("CAPTIONS.md not found (## Facebook cá nhân + ## TikTok)");
    else {
      const sec = captionSections(readFileSync(capPath, "utf8"));
      const tmp = mkdtempSync(join(tmpdir(), "vp-cap-"));
      try {
        const files = [];
        for (const k of ["facebook", "tiktok"]) {
          if (!sec[k]) { errors.push(`CAPTIONS.md has no non-empty "## ${k === "facebook" ? "Facebook" : "TikTok"}" section`); continue; }
          writeFileSync(join(tmp, `${k}.md`), sec[k] + "\n");
          files.push({ path: join(tmp, `${k}.md`), label: `CAPTIONS.md#${k}` });
        }
        Object.assign(out.lint, lintFiles(vp, files));
      } finally { rmSync(tmp, { recursive: true, force: true }); }
      if (sec.facebook && /^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|={3,}|-{3,})|\*\*/m.test(sec.facebook)) errors.push("CAPTIONS.md#facebook has headings/bullets/markdown (personal profile = plain prose, viet-pro publishing/facebook.md)");
      if (sec.tiktok) for (const m of new Set([...sec.tiktok.matchAll(BAIT)].map((x) => x[0]))) warnings.push(`engagement-bait phrase in the TikTok caption: "${m}"`);
    }
  }

  for (const [label, r] of Object.entries(out.lint)) if (r.errors.length) errors.push(`viet-pro lint ERROR in ${label} (${r.errors.length})`);
  out.pass = errors.length === 0;
  return out;
}

function parseArgs(argv) {
  const o = { project: ".", stage: "script" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.json = true;
    else if (a === "--jev-audit") o.jevAudit = true;
    else if (["--project", "--stage", "--vp"].includes(a)) o[a.slice(2)] = argv[++i];
    else return { bad: `unknown argument ${a}` };
  }
  if (!["script", "delivery"].includes(o.stage)) return { bad: `--stage must be script or delivery` };
  return o;
}

export function main(argv = process.argv.slice(2)) {
  if (wantsHelp(argv)) { process.stdout.write(helpText(import.meta.url)); return 0; }
  const o = parseArgs(argv);
  if (o.bad) { console.error(`check-viet-pro: ${o.bad}\nusage: node check-viet-pro.mjs [--project .] [--stage script|delivery] [--vp dir] [--json] [--jev-audit]  (--help for details)`); return 2; }
  const r = check({ project: o.project, stage: o.stage, vp: o.vp || defaultVp() });
  if (r.usage) { console.error(`check-viet-pro: ${r.usage}`); return 2; }
  if (o.json) console.log(JSON.stringify(r, null, 2));
  else if (r.skipped) console.log(`SKIP  viet-pro gate (${r.reason})`);
  else {
    for (const [label, l] of Object.entries(r.lint)) {
      console.log(`${l.errors.length ? "FAIL" : "ok  "}  lint ${label}: ${l.errors.length} ERROR, ${l.warns.length} WARN`);
      for (const e of l.errors) console.log(`        ${e}`);
      for (const w of l.warns) console.log(`        ${w}`);
    }
    for (const w of r.warnings) console.log(`WARN  ${w}`);
    for (const e of r.errors) console.log(`FAIL  ${e}`);
    console.log(r.pass ? `PASS  viet-pro gate (${r.stage})${r.record ? ` · record in ${r.record.file}` : ""}` : `BLOCKED  viet-pro gate (${r.stage}): fix the FAIL lines before ${r.stage === "script" ? "voice (eleven.mjs) or render" : "delivery"}`);
  }
  const code = r.pass ? 0 : 1;
  if (!o.jevAudit || r.skipped) return code;
  // Advisory only: any audit failure is a WARN and the exit code stays the gate's.
  const log = o.json ? (m) => console.error(m) : (m) => console.log(m);
  return jevAudit(r.project, { log }).catch((e) => log(`WARN  jev audit skipped: ${e?.code || e?.name || "error"}`)).then(() => code);
}

// --jev-audit: WARN lines only; the exit code stays what check() decided.
async function jevAudit(dir, { log = console.log, fetchImpl } = {}) {
  const apiKey = loadKey();
  const scriptDir = join(dir, "script");
  const files = existsSync(scriptDir) ? readdirSync(scriptDir).filter((f) => f.endsWith(".txt")).sort() : [];
  const lines = files.map((f) => readFileSync(join(scriptDir, f), "utf8").replace(/\s+/g, " ").trim());
  const res = await audit(lines, { apiKey, fetchImpl });
  for (const w of res.warnings) log(`WARN  jev ${w.pattern} p=${w.p.toFixed(2)} script/${files[w.line]}`);
  if (res.error) log(`WARN  jev audit skipped: ${res.error}`);
  else log(`jev audit: ${lines.length} lines, ${res.warnings.length} WARN (advisory; precision per pattern in data/jev-audit-eval.jsonl)`);
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) Promise.resolve(main()).then((c) => process.exit(c));
