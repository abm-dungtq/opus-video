// studio-api.mjs — the one surface Motion Studio imports from the opus-video plugin, so Studio can
// live in its own repo. It re-exports the manifest, the command gateway and the request queue, and
// owns the director's tool permissions (they name plugin paths). STUDIO_API is bumped whenever an
// export Studio relies on changes shape; Studio checks it together with PLUGIN_VERSION.
// API 3 adds redo (EXIT.nothingToRedo 9) and the gateway ops move_event, add_event, remove_event
// and update_music; redoTarget(history) tells whether a redo is possible without a write.
// API 4 adds SKILLS and COMMANDS, so Studio names no plugin skill, script file or argv of its own;
// every API 3 export stays as it was.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export { load, validate, SCHEMA, FILE } from "./manifest.mjs";
export { patch, undo, redo, redoTarget, readHistory, derive, EXIT, ACTORS } from "./gateway.mjs";
export { enqueue, list, next, finish, cancelRequest, ask, answer, expireWaiting, STATUSES, ASK_KINDS, ASK_GATES, ID } from "./requests.mjs";

export const OV = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
export const PLUGIN_VERSION = JSON.parse(readFileSync(join(OV, ".claude-plugin", "plugin.json"), "utf8")).version;
export const STUDIO_API = 4;
export const SCRIPTS = join(OV, "scripts");
export const DIRECTIONS_FILE = join(OV, "data/directions.json");

// The skills the director uses, in the order Studio lists them in its prompt.
export const SKILLS = Object.freeze(["ov-studio", "ov-build", "ov-script", "ov-audio", "ov-deliver"]);
// Scripts Studio runs as `node <path> …`: each value is an absolute path to a .mjs file. `choose`
// is the direction gate (it writes direction: into BRIEF.md): Studio replaces {project} and {pick}
// in args and runs `node <file> ...args`. suggest prints three directions (one per tier) and their
// styles as JSON. pitchInit builds the pitch from directions the user already chose ({directions}:
// comma-separated ids, first is pick 1); Studio fills {topic}, {aspect}, {category}, {energy} from
// BRIEF.md, empty when missing.
const script = (f) => join(SCRIPTS, f);
export const COMMANDS = Object.freeze({
  render: script("render-final.mjs"),
  mix: script("audio-mix.mjs"),
  pitch: script("make-pitch.mjs"),
  import: script("manifest-import.mjs"),
  demo: script("make-demo.mjs"),
  recipe: script("recipe-pack.mjs"),
  preflight: script("check-preflight.mjs"),
  cases: script("find-cases.mjs"),
  styles: script("styles.mjs"),
  suggest: Object.freeze({ file: script("suggest.mjs"), args: Object.freeze(["--project", "{project}", "--json"]) }),
  choose: Object.freeze({ file: script("make-pitch.mjs"), args: Object.freeze(["choose", "--project", "{project}", "--pick", "{pick}", "--accept-warnings"]) }),
  pitchInit: Object.freeze({ file: script("make-pitch.mjs"), args: Object.freeze(["init", "--project", "{project}", "--topic", "{topic}",
    "--aspect", "{aspect}", "--category", "{category}", "--energy", "{energy}", "--directions", "{directions}"]) }),
});

// The director (`claude -p` started by Studio) reaches the plugin's MCP server under this prefix.
export const PREFIX = "mcp__plugin_opus-video_opus-video__";
export const MCP_TOOLS = ["project_get", "project_log", "project_patch", "project_undo", "studio_request_next", "studio_request_done", "studio_ask"].map((t) => PREFIX + t);
// No Bash(node:*): under acceptEdits it would allow `node -e` with any code. The scripts rule is a
// wildcard: the `:*` prefix form needs a word boundary after the prefix, so ".../scripts/:*" never
// matches ".../scripts/timing.mjs" (checked against claude -p 2.1).
// No Edit or Write rule: acceptEdits already lets the director write inside its cwd (the project),
// and a plain Edit/Write allow rule reached files anywhere else on disk (checked against
// claude -p 2.1.304 with haiku: without the rules an edit in the cwd works, one in /tmp is denied).
export const ALLOWED_TOOLS = ["Read", "Glob", "Grep", `Bash(node ${OV}/scripts/*)`, "Bash(npx hyperframes:*)", ...MCP_TOOLS];
// The plugin is still denied by path (`//` marks an absolute path) in case it ever sits under a
// project, and a `..` after scripts/ is denied: the `/*` glob alone ran
// `node $OV/scripts/../../…/x.mjs` (checked against claude -p 2.1 with haiku).
// The approval gates are the user's: Studio writes DEMO.md and BRIEF.md. Claude Code reads only
// Edit(path) rules for file writes (they cover Write too) and a bare name matches at any depth;
// the Bash rules close make-pitch choose (it writes direction:), replace-in-file, cp and mv
// (checked against claude -p 2.1.294 with haiku: Edit, Write, replace-in-file and cp all denied).
export const DENIED_TOOLS = ["WebFetch", "WebSearch", `Edit(/${OV}/**)`, `Write(/${OV}/**)`, `Bash(node ${OV}/scripts/*../*)`,
  "Edit(DEMO.md)", "Edit(BRIEF.md)", `Bash(node ${OV}/scripts/make-pitch.mjs choose*)`,
  "Bash(*replace-in-file.mjs*)", "Bash(cp *)", "Bash(mv *)", "Bash(*DEMO.md*)", "Bash(*BRIEF.md*)"];
