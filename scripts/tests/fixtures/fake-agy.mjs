#!/usr/bin/env node
// Stand-in for the `agy` CLI used by judge.test.mjs. Behaviour comes from $FAKE_AGY_MODE:
//   pass       check → PASS, two phrases that exist in opus-video-smoke HTML, real duration
//   nofp       check → PASS but on-screen text matches nothing in the HTML
//   fail       check → FAIL with one hard issue at 2s
//   auth       prints a not-signed-in error, exit 1
//   pair-first pair → always picks "first"
// Durations come from ffprobe on the files in cwd, so the fingerprint check sees real values.
// It also asserts the minimal agy invocation judge.mjs must use.
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const mode = process.env.FAKE_AGY_MODE || "pass";
const flag = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);

if (mode === "auth") {
  console.error("Error: you are not logged in. Run `agy` and sign in with Google.");
  process.exit(1);
}

const missing = ["-p", "--new-project", "--add-dir", "--model", "--json-schema", "--output-format", "--print-timeout"]
  .filter((k) => !argv.includes(k));
if (missing.length || flag("--output-format") !== "json" || flag("--add-dir") !== "." || !existsSync(flag("--json-schema") || "")) {
  console.error(`fake-agy: bad invocation (missing ${missing.join(",")})`);
  process.exit(64);
}

const dur = (f) => {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" });
  return Math.round(Number(r.stdout.trim()));
};

let out;
if (existsSync("clip.mp4")) {
  const d = dur("clip.mp4");
  const real = ["Ánh nắng trông trắng", "Ánh xanh bị tán xạ mạnh hơn ánh đỏ khoảng 5–6 lần"];
  out = {
    pass: { duration_s: d, onscreen_text: real, verdict: "PASS", issues: [] },
    nofp: { duration_s: d, onscreen_text: ["Lorem ipsum dolor", "Nothing like this"], verdict: "PASS", issues: [] },
    fail: {
      duration_s: d, onscreen_text: real, verdict: "FAIL",
      issues: [{ code: "OVERLAP", t_s: 2, severity: "hard", note: "title overlaps subtitle" }],
    },
  }[mode];
} else if (existsSync("first.mp4") && existsSync("second.mp4") && mode === "pair-first") {
  out = {
    duration_first_s: dur("first.mp4"), duration_second_s: dur("second.mp4"), winner: "first",
    dimensions: [{ name: "clarity", better: "first", evidence: "first @1s: title is larger" }],
    top_fix_for_loser: "enlarge the title",
  };
}
if (!out) {
  console.error(`fake-agy: no response for mode ${mode} in this cwd`);
  process.exit(65);
}

console.log(JSON.stringify({
  status: "SUCCESS",
  structured_output: out,
  response: "```json\n" + JSON.stringify(out) + "\n```",
  conversation_id: "fake-0001",
  duration_seconds: 0.1,
  num_turns: 2,
  json_schema: JSON.parse(readFileSync(flag("--json-schema"), "utf8")),
  usage: {},
}));
