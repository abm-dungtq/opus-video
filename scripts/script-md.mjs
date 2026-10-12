// script-md.mjs — shared parser for the HyperFrames SCRIPT.md format, used by eleven.mjs
// (audio-meta) and check-viet-pro.mjs (lint of the voiced lines).

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
