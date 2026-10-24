// director-guard.mjs — what the director Motion Studio runs (`claude -p`) may not do through the
// plugin's scripts, checked by the scripts themselves. Claude Code matches Bash rules as text, so a
// quoted subcommand (`eleven.mjs "tts"`), a `./` in the path or a split flag slips past a deny rule
// (checked against claude -p 2.1.304 with haiku); the rules in studio-api.mjs stay as a first line.
// Studio marks its director with MOTION_STUDIO_RUNNER=cli (older Studio: OPUS_STUDIO_RUNNER=cli);
// the director cannot drop the variable, since a command starting with `VAR=` or `env` matches no
// allow rule. Commands Studio runs itself do not carry it.
import { resolve } from "node:path";
import { seriesDirOf } from "./manifest.mjs";

export const underDirector = (env = process.env) => (env.MOTION_STUDIO_RUNNER || env.OPUS_STUDIO_RUNNER) === "cli";

// eleven.mjs commands the director of a series episode may run: effects and music. Its voices go
// through Studio's series tools behind a consent card; every other command, present or future, is
// refused.
export const ELEVEN_DIRECTOR_COMMANDS = Object.freeze(["sfx", "music"]);
export const ELEVEN_REFUSED = Object.freeze(["doctor", "voice-info", "models", "tts", "probe-models", "audio-meta"]);
export const REFUSED_EXIT = 5;

// The series folder of the first of dirs that belongs to one, or null.
export function seriesOfAny(dirs) {
  for (const d of dirs) {
    if (!d) continue;
    let s = null;
    try { s = seriesDirOf(resolve(d)); } catch { /* not a project */ }
    if (s) return s;
  }
  return null;
}

// Why eleven.mjs <cmd> is refused to the director, or null. dirs: the cwd and every project the
// command names (--project, --hyperframes, the project of --text-file or --script).
export function elevenRefusal(cmd, dirs, env = process.env) {
  if (!underDirector(env) || ELEVEN_DIRECTOR_COMMANDS.includes(cmd)) return null;
  const series = seriesOfAny(dirs);
  if (!series) return null;
  return `eleven.mjs ${cmd} is not run by the Studio director of a series episode: voices go through series_tts or voice_design (a consent card); only ${ELEVEN_DIRECTOR_COMMANDS.join(" and ")} are allowed`;
}

// make-demo --record-audio-review is the user's "Nghe rồi, được", recorded when they press it in Studio.
export function audioReviewRefusal(env = process.env) {
  return underDirector(env) ? "--record-audio-review is the user's confirmation (Studio's \"Nghe rồi, được\" button); the Studio director does not record it" : null;
}
