// script-md.mjs — shared parser for the HyperFrames SCRIPT.md format, used by eleven.mjs
// (audio-meta) and check-viet-pro.mjs (lint of the voiced lines), plus voice gate stamps.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

// SCRIPT.md (hyperframes script-format) → [{ frame, text }]. A `## … (Frame N)` heading opens a
// line, `**key:**` rows are metadata, indented lines are the spoken text. Same rules as
// faceless-explainer's parser; lines sharing a frame are joined.
export function parseScript(md) {
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

// Whitespace-insensitive comparison key for a voice line.
export const norm = (t) => t.replace(/\s+/g, " ").trim();

// Gate stamps: eleven.mjs writes `<mp3>.gate.json` next to every voice file it generates, so
// `--reuse` and `check-viet-pro --stage delivery` can prove the audio came from the current
// gated text (sha256 of the normalized text) and not from an override run.
export const textHash = (t) => createHash("sha256").update(norm(t)).digest("hex");
export const stampPath = (mp3) => `${mp3}.gate.json`;

export function writeStamp(mp3, { text, script = null, override = "" }) {
  writeFileSync(stampPath(mp3), JSON.stringify({ sha256: textHash(text), script, override: override || null }, null, 2) + "\n");
}

export function readStamp(mp3) {
  try { return JSON.parse(readFileSync(stampPath(mp3), "utf8")); } catch { return null; }
}

// true when mp3 has a non-override stamp whose hash equals the given text.
export function stampMatches(mp3, text) {
  const s = readStamp(mp3);
  return !!s && !s.override && s.sha256 === textHash(text);
}
