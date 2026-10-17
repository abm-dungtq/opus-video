// studio-api.mjs — the one surface Motion Studio imports from the opus-video plugin, so Studio can
// live in its own repo. It re-exports the manifest, the command gateway and the request queue, and
// owns the director's tool permissions (they name plugin paths). STUDIO_API is bumped whenever an
// export Studio relies on changes shape; Studio checks it together with PLUGIN_VERSION.
// API 3 adds redo (EXIT.nothingToRedo 9) and the gateway ops move_event, add_event, remove_event
// and update_music.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export { load, validate, SCHEMA, FILE } from "./manifest.mjs";
export { patch, undo, redo, readHistory, derive, EXIT, ACTORS } from "./gateway.mjs";
export { enqueue, list, next, finish, cancelRequest, ask, answer, expireWaiting, STATUSES, ASK_KINDS, ASK_GATES, ID } from "./requests.mjs";

export const OV = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
export const PLUGIN_VERSION = JSON.parse(readFileSync(join(OV, ".claude-plugin", "plugin.json"), "utf8")).version;
export const STUDIO_API = 3;
export const SCRIPTS = join(OV, "scripts");
export const DIRECTIONS_FILE = join(OV, "data/directions.json");

// The director (`claude -p` started by Studio) reaches the plugin's MCP server under this prefix.
export const PREFIX = "mcp__plugin_opus-video_opus-video__";
export const MCP_TOOLS = ["project_get", "project_log", "project_patch", "project_undo", "studio_request_next", "studio_request_done", "studio_ask"].map((t) => PREFIX + t);
// No Bash(node:*): under acceptEdits it would allow `node -e` with any code. The scripts rule is a
// wildcard: the `:*` prefix form needs a word boundary after the prefix, so ".../scripts/:*" never
// matches ".../scripts/timing.mjs" (checked against claude -p 2.1).
export const ALLOWED_TOOLS = ["Read", "Edit", "Write", "Glob", "Grep", `Bash(node ${OV}/scripts/*)`, "Bash(npx hyperframes:*)", ...MCP_TOOLS];
// The plain Edit/Write rules also reach files outside the project, so the plugin is denied by
// path (`//` marks an absolute path), and a `..` after scripts/ is denied: the `/*` glob alone ran
// `node $OV/scripts/../../…/x.mjs` (checked against claude -p 2.1 with haiku).
// The approval gates are the user's: Studio writes DEMO.md and BRIEF.md. Claude Code reads only
// Edit(path) rules for file writes (they cover Write too) and a bare name matches at any depth;
// the Bash rules close make-pitch choose (it writes direction:), replace-in-file, cp and mv
// (checked against claude -p 2.1.294 with haiku: Edit, Write, replace-in-file and cp all denied).
export const DENIED_TOOLS = ["WebFetch", "WebSearch", `Edit(/${OV}/**)`, `Write(/${OV}/**)`, `Bash(node ${OV}/scripts/*../*)`,
  "Edit(DEMO.md)", "Edit(BRIEF.md)", `Bash(node ${OV}/scripts/make-pitch.mjs choose*)`,
  "Bash(*replace-in-file.mjs*)", "Bash(cp *)", "Bash(mv *)", "Bash(*DEMO.md*)", "Bash(*BRIEF.md*)"];
