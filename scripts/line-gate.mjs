// line-gate.mjs — what the project files say about one voice line: its number, its speaker in
// scenes/roles.json and its voice gate. Shared by manifest-import.mjs and the gateway ops
// set_line_speaker / set_line_audio, so a line imported and a line re-voiced get the same gate.
// A voice file and its gate stamp do not always sit together: a series episode plays
// assets/mix/voice-NN.mp3 while eleven.mjs stamps assets/voice/NN.mp3, so every lookup goes by
// the number NN at the end of the file name.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { readStamp, stampMatches } from "./script-md.mjs";

// A speaker id: the role id of the series cast (lowercase, digits, dashes).
export { SPEAKER } from "./manifest.mjs";
export const ROLES_FILE = join("scenes", "roles.json");

// "assets/mix/voice-01.mp3" → "01", "assets/voice/07.mp3" → "07"; null when the name ends in no number.
export function lineNumber(file) {
  const f = String(file ?? "");
  return basename(f, extname(f)).match(/(\d+)$/)?.[1] ?? null;
}

// The stamp files that may vouch for a line's audio, in lookup order.
function stampCandidates(root, file) {
  const nn = lineNumber(file);
  return [join(root, file), ...(nn ? [join(root, "assets", "voice", `${nn}.mp3`)] : [])];
}

// "pass" when the first stamp found is not an override and hashes the line's text, "stale" when a
// stamp is found but does not, "unknown" when the line has no stamp at all.
export function gateOf(root, { file, text }) {
  if (!file) return "unknown";
  for (const mp3 of stampCandidates(root, file)) {
    if (!readStamp(mp3)) continue;
    return stampMatches(mp3, String(text ?? "")) ? "pass" : "stale";
  }
  return "unknown";
}

// scenes/roles.json ({ "01": "ptv", … }) or null when the project has none or it is unreadable.
export function readRoles(root) {
  const f = join(root, ROLES_FILE);
  if (!existsSync(f)) return null;
  try {
    const r = JSON.parse(readFileSync(f, "utf8"));
    return r && typeof r === "object" && !Array.isArray(r) ? r : null;
  } catch { return null; }
}

// Sets the speaker of each changed line number in scenes/roles.json, written atomically. A project
// without the file is left alone. Returns the line numbers written.
export function writeRoles(root, changes) {
  const roles = readRoles(root);
  if (!roles) return [];
  const done = [];
  for (const [nn, speaker] of Object.entries(changes)) if (roles[nn] !== speaker) { roles[nn] = speaker; done.push(nn); }
  if (!done.length) return [];
  const f = join(root, ROLES_FILE);
  const tmp = `${f}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(roles, null, 2) + "\n");
  renameSync(tmp, f);
  return done;
}
