// studio/agent.mjs — "Agent trên máy": is `claude` installed and logged in, which runner Studio
// uses, the project's last director job, and whether ffprobe/ffmpeg run. Tool checks are cached
// 30 s per PATH. `claude auth status` prints JSON that also holds the account email and
// organisation: only Boolean(loggedIn) leaves this module, nothing of it is logged.
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { listJobs } from "./jobs.mjs";
import { KIND as DIRECTOR, runnerSetting } from "./director.mjs";

const CACHE_MS = 30000;
let cache = null; // { at, path, tools }

const exec = (cmd, args, timeout) => new Promise((res) => {
  execFile(cmd, args, { encoding: "utf8", timeout, maxBuffer: 1 << 20, shell: false }, (err, stdout) => res({ err, stdout: stdout ?? "" }));
});
// ffprobe/ffmpeg live in /opt/homebrew/bin, which a Studio started from launchd may not have on PATH.
const bin = (name) => (existsSync(`/opt/homebrew/bin/${name}`) ? `/opt/homebrew/bin/${name}` : name);

async function claudeStatus() {
  const v = await exec("claude", ["--version"], 5000);
  if (v.err) return v.err.code === "ENOENT" ? { found: false, version: null, logged_in: null } : { found: true, version: null, logged_in: null };
  const version = v.stdout.split("\n")[0].trim() || null;
  const a = await exec("claude", ["auth", "status"], 8000);
  let logged_in = null;
  if (!a.err) { try { logged_in = Boolean(JSON.parse(a.stdout).loggedIn); } catch { /* not JSON: unknown */ } }
  return { found: true, version, logged_in };
}

async function tools() {
  const path = process.env.PATH ?? "";
  if (cache && cache.path === path && Date.now() - cache.at < CACHE_MS) return cache.tools;
  const [claude, fp, fm] = await Promise.all([claudeStatus(), exec(bin("ffprobe"), ["-version"], 5000), exec(bin("ffmpeg"), ["-version"], 5000)]);
  const t = { claude, ffprobe: !fp.err, ffmpeg: !fm.err };
  cache = { at: Date.now(), path, tools: t };
  return t;
}

// { claude: { found, version, logged_in }, runner, last_job: { status, code, started } | null, ffprobe, ffmpeg }
export async function agentStatus({ name = null } = {}) {
  const t = await tools();
  const jobs = name ? listJobs(name).filter((j) => j.kind === DIRECTOR).sort((a, b) => String(a.started).localeCompare(String(b.started))) : [];
  const j = jobs.at(-1);
  return { claude: t.claude, runner: runnerSetting(), last_job: j ? { status: j.status, code: j.code, started: j.started } : null, ffprobe: t.ffprobe, ffmpeg: t.ffmpeg };
}
