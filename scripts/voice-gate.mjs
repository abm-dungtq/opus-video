// voice-gate.mjs — the viet-pro gate as eleven.mjs applies it before Vietnamese voice
// generation (tts, audio-meta). It runs check-viet-pro's check() and also requires that the
// text being voiced is the gated text: tts reads only <project>/script/NN.txt, and every
// SCRIPT.md frame matches its script/NN.txt (whitespace-insensitive).
// The gate language comes from BRIEF.md `language:` (inside check()), never from --lang.
// Override: --skip-viet-pro-gate plus BRIEF.md frontmatter `viet_pro_override: <reason>`
// (≥ 10 chars, no `#`). It is printed on every run and rejected by check-viet-pro at delivery.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { check, frontmatter } from "./check-viet-pro.mjs";
import { norm } from "./script-md.mjs";

export const GATE_EXIT = 4;

export function briefOverride(project) {
  const p = join(project, "BRIEF.md");
  return existsSync(p) ? (frontmatter(readFileSync(p, "utf8")).viet_pro_override || "").trim() : "";
}

const real = (p) => { try { return realpathSync(p); } catch { return null; } };

export function voiceGate({ project = ".", textFiles = [], frames = null, inline = false, skip = false, checkImpl = check } = {}) {
  const r = checkImpl({ project, stage: "script" });
  if (r.usage) return { ok: false, skipped: false, override: "", messages: [r.usage] };
  if (r.skipped) return { ok: true, skipped: true, override: "", messages: [] };

  if (skip) {
    const reason = briefOverride(project);
    if (reason.length >= 10) return { ok: true, skipped: false, override: reason, messages: [`OVERRIDE viet-pro gate: ${reason}`] };
    return { ok: false, skipped: false, override: "", messages: ["--skip-viet-pro-gate needs BRIEF.md frontmatter viet_pro_override: <reason, ≥10 chars, no #>"] };
  }

  const fail = (messages) => ({ ok: false, skipped: false, override: "", messages });
  if (inline) return fail(["--text is not allowed for Vietnamese voice; use --text-file <project>/script/NN.txt"]);

  const scriptDir = real(join(project, "script"));
  for (const f of textFiles) {
    const dir = real(dirname(f));
    if (!scriptDir || dir !== scriptDir || !/^\d{2}\.txt$/.test(basename(f))) return fail([`text file must be <project>/script/NN.txt: ${f}`]);
  }

  if (frames) {
    const bad = [];
    for (const { frame, text } of frames) {
      const id = String(frame).padStart(2, "0");
      const p = join(project, "script", `${id}.txt`);
      if (!existsSync(p)) bad.push(`script/${id}.txt missing for Frame ${frame}`);
      else if (norm(readFileSync(p, "utf8")) !== norm(text)) bad.push(`Frame ${frame} text differs from script/${id}.txt`);
    }
    if (bad.length) return fail(bad);
  }

  if (!r.pass) return fail([...r.errors.map((e) => `FAIL ${e}`), `BLOCKED viet-pro gate: run node ~/.claude/skills/opus-video/scripts/check-viet-pro.mjs --project ${project}`]);
  return { ok: true, skipped: false, override: "", messages: [] };
}
