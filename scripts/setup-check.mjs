#!/usr/bin/env node
// setup-check.mjs — is this machine ready to run opus-video end to end? Run it before step 1
// on every new machine/agent (SKILL.md step 0). Works on macOS, Linux and Windows.
//   node setup-check.mjs [--json]
//   node setup-check.mjs --help | -h
// Required (MISSING → exit 1, with the fix command for this OS):
//   Node.js ≥ 22, git, ffmpeg + ffprobe, the hyperframes CLI ≥ 0.8.144 (via npx),
//   skills found on any agent host (see skill-paths.mjs): viet-pro (+ its self-tests),
//   hyperframes core (hyperframes, hyperframes-*, media-use) and every HyperFrames workflow that
//   opus-video routes to, ELEVENLABS_API_KEY + OPUS_VIDEO_VOICE_ID (presence only), and
//   data/directions.json: every creative-direction token names a real blueprint/rule/preset/
//   style/seam in the installed HyperFrames (directions.mjs check; skipped while
//   hyperframes-animation is missing).
// Optional (WARN, never fails): agy (judge.mjs video QA), TYPESAFE_API_KEY (Jev), a Remotion
//   skill (only for engine: remotion), and `opus-video plugin: installed|missing`: whether this
//   checkout is the Claude Code plugin layout (.claude-plugin/plugin.json + skills/). Codex and
//   Antigravity load the skills the installer exposes, so missing never fails.
// Keys are read from the environment, else the opus-video env file in ~/.config; values are
// never printed.
// Exit: 0 ready · 1 something required is missing.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { findSkill, skillRoots } from "./skill-paths.mjs";
import { checkData, loadDirections } from "./directions.mjs";

export const MIN_NODE = 22;
export const MIN_HYPERFRAMES = "0.8.144";
export const CORE_SKILLS = ["hyperframes", "hyperframes-core", "hyperframes-animation", "hyperframes-keyframes", "hyperframes-creative", "hyperframes-audio", "hyperframes-cli", "hyperframes-registry", "hyperframes-studio", "media-use"];
export const WORKFLOW_SKILLS = ["general-video", "faceless-explainer", "product-launch-video", "pr-to-video", "motion-graphics", "music-to-video", "slideshow", "embedded-captions", "talking-head-recut", "remotion-to-hyperframes"];
const ENV_FILE = join(homedir(), ".config", "opus-video", ".env");
const PLUGIN_ROOT = fileURLToPath(new URL("..", import.meta.url));
const WIN = process.platform === "win32";

const FIX = {
  node: { darwin: "brew install node@22   (or https://nodejs.org)", linux: "nvm install 22   (or your distro's nodejs ≥ 22)", win32: "winget install OpenJS.NodeJS.LTS" },
  git: { darwin: "xcode-select --install   (or brew install git)", linux: "sudo apt install git   (or dnf/pacman)", win32: "winget install Git.Git" },
  ffmpeg: { darwin: "brew install ffmpeg", linux: "sudo apt install ffmpeg   (or dnf/pacman)", win32: "winget install Gyan.FFmpeg   (then reopen the terminal)" },
  hyperframes: "npx hyperframes skills   (installs the CLI on demand and every HyperFrames skill for all supported agents)",
  vietpro: { default: "curl -fsSL https://raw.githubusercontent.com/abm-dungtq/viet-pro-codex/v5.3.0/install.sh | bash", win32: "see README.md § Windows (git clone viet-pro-codex, copy skills/viet-pro)" },
  keys: "create the opus-video env file (README.md § Keys) with ELEVENLABS_API_KEY=… and OPUS_VIDEO_VOICE_ID=…",
};
const fix = (k) => (typeof FIX[k] === "string" ? FIX[k] : FIX[k][process.platform] || FIX[k].default || FIX[k].linux);

export function semverGte(a, b) {
  const pa = String(a).match(/\d+/g)?.map(Number) || [], pb = String(b).match(/\d+/g).map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== pb[i]) return (pa[i] || 0) > pb[i];
  return true;
}

// Names of KEY=VALUE entries with a non-empty value (values are never returned).
export function envKeys(file = ENV_FILE, env = process.env) {
  const keys = new Set(Object.keys(env).filter((k) => env[k]));
  if (existsSync(file)) for (const l of readFileSync(file, "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*["']?(.+?)["']?\s*$/); if (m) keys.add(m[1]); }
  return keys;
}

const version = (cmd, args = ["--version"]) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", shell: WIN && cmd === "npx", timeout: 180000 });
  return r.status === 0 ? `${r.stdout || ""}${r.stderr || ""}`.trim().split("\n")[0] : null;
};

// The Claude Code plugin layout of this checkout: manifest and router skill present.
export function pluginStatus(root = PLUGIN_ROOT) {
  const manifest = join(root, ".claude-plugin", "plugin.json");
  if (!existsSync(manifest) || !existsSync(join(root, "skills", "opus-video", "SKILL.md"))) return { installed: false, detail: "missing" };
  let version = "?";
  try { version = JSON.parse(readFileSync(manifest, "utf8")).version ?? "?"; } catch { /* unreadable manifest: still the layout */ }
  return { installed: true, detail: `installed (v${version}, ${root})` };
}

export function runChecks({ findSkillImpl = findSkill, versionImpl = version, keys = envKeys(), directionsImpl = () => checkData(loadDirections()), pluginRoot = PLUGIN_ROOT } = {}) {
  const items = [];
  const add = (level, name, detail, fixCmd) => items.push({ level, name, detail, fix: level === "ok" ? undefined : fixCmd });

  const major = Number(process.versions.node.split(".")[0]);
  add(major >= MIN_NODE ? "ok" : "missing", "node", `v${process.versions.node} (need ≥ ${MIN_NODE})`, fix("node"));
  for (const [name, args] of [["git", ["--version"]], ["ffmpeg", ["-version"]], ["ffprobe", ["-version"]]]) {
    const v = versionImpl(name, args);
    add(v ? "ok" : "missing", name, v || "not found on PATH", fix(name === "git" ? "git" : "ffmpeg"));
  }
  const hf = versionImpl("npx", ["--yes", "hyperframes", "--version"]);
  const hfv = hf?.match(/\d+\.\d+\.\d+/)?.[0];
  add(hfv && semverGte(hfv, MIN_HYPERFRAMES) ? "ok" : "missing", "hyperframes CLI", hfv ? `${hfv} (need ≥ ${MIN_HYPERFRAMES})` : "npx hyperframes did not run", fix("hyperframes"));

  const vp = findSkillImpl("viet-pro");
  if (!vp) add("missing", "skill viet-pro", "not found in any agent skills dir", fix("vietpro"));
  else {
    const t1 = versionImpl("node", [join(vp, "scripts", "lint-vietnamese-content.mjs"), "--self-test"]);
    const t2 = versionImpl("node", [join(vp, "scripts", "compare-preserved-content.mjs"), "--self-test"]);
    add(t1 && t2 ? "ok" : "missing", "skill viet-pro", t1 && t2 ? `${vp} (self-tests pass)` : `${vp} (self-test failed: reinstall)`, fix("vietpro"));
  }
  for (const s of [...CORE_SKILLS, ...WORKFLOW_SKILLS]) {
    const d = findSkillImpl(s);
    add(d ? "ok" : "missing", `skill ${s}`, d || "not installed", fix("hyperframes"));
  }
  for (const k of ["ELEVENLABS_API_KEY", "OPUS_VIDEO_VOICE_ID"]) add(keys.has(k) ? "ok" : "missing", k, keys.has(k) ? "present" : "absent", FIX.keys);
  if (findSkillImpl("hyperframes-animation")) {
    const d = directionsImpl();
    add(d.pass ? "ok" : "missing", "creative directions", d.pass ? `data/directions.json: ${d.tokens} token có thật` : `${d.errors.length} token không có trong HyperFrames: ${d.errors[0]}`, "HyperFrames đổi tên: sửa data/directions.json theo `node scripts/directions.mjs check`, rồi `directions.mjs doc --write`");
  }

  add(versionImpl("agy", ["--version"]) ? "ok" : "warn", "agy (optional)", "Gemini video judge for judge.mjs; without it QA uses still frames", "install Antigravity CLI and sign in: https://antigravity.google");
  add(keys.has("TYPESAFE_API_KEY") ? "ok" : "warn", "TYPESAFE_API_KEY (optional)", keys.has("TYPESAFE_API_KEY") ? "present" : "absent — Jev ranking/audit off", "add TYPESAFE_API_KEY=… to the env file");
  const plugin = pluginStatus(pluginRoot);
  add(plugin.installed ? "ok" : "warn", "opus-video plugin", plugin.detail, "Claude Code: clone the repo to ~/.claude/skills/opus-video (it loads in place as opus-video@skills-dir); Codex/Antigravity: run install.sh");
  const remotion = findSkillImpl("ak-remotion") || findSkillImpl("remotion") || findSkillImpl("remotion-best-practices");
  add(remotion ? "ok" : "warn", "Remotion skill (optional)", remotion || "only needed when BRIEF engine: remotion", "npx skills add remotion-dev/skills");
  return items;
}

export function main(argv = process.argv.slice(2)) {
  if (wantsHelp(argv)) { process.stdout.write(helpText(import.meta.url)); return 0; }
  if (argv.some((a) => a !== "--json")) { console.error("usage: node setup-check.mjs [--json]"); return 2; }
  const items = runChecks();
  const ready = !items.some((i) => i.level === "missing");
  if (argv.includes("--json")) console.log(JSON.stringify({ ready, platform: process.platform, roots: skillRoots(), items }, null, 2));
  else {
    for (const i of items) {
      console.log(`${i.level === "ok" ? "ok     " : i.level === "warn" ? "WARN   " : "MISSING"} ${i.name}: ${i.detail}`);
      if (i.fix) console.log(`        fix: ${i.fix}`);
    }
    console.log(ready ? "READY  opus-video setup is complete" : "NOT READY  install the MISSING items above, then run setup-check again");
  }
  return ready ? 0 : 1;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
