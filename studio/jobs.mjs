// studio/jobs.mjs — child-process jobs of Motion Studio (director runs and exports).
// startJob spawns without a shell in its own process group, keeps the last 500 log lines and
// emits "job" events { type: "start" | "log" | "exit", job, line? } on `events`. One running job
// per (project, kind): a second start throws (code "BUSY"), also while the first is still cancelling. cancel(id) sends SIGTERM to the group,
// then SIGKILL after 5 s. stopAll() ends every running job when the server stops, so no child
// (render, headless Chrome, claude) outlives it.
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { randomBytes } from "node:crypto";

export const events = new EventEmitter();
const KEEP = 500;
const KILL_AFTER_MS = 5000;
const all = new Map(); // id → job (internal, with child)

const view = ({ child, timer, onLine, onExit, ...j }) => ({ ...j, log: undefined, tail: j.log.slice(-20) });
export const summary = (j) => view(j);

function signal(j, sig) {
  try { process.kill(-j.pid, sig); } catch { try { j.child.kill(sig); } catch { /* gone */ } }
}

// onLine(line, stream) → the text to keep (null drops it); onExit(job) runs before the exit event.
export function startJob({ name, kind, cmd, args = [], cwd, env = process.env, onLine = null, onExit = null, meta = {} }) {
  for (const j of all.values()) {
    if (j.name === name && j.kind === kind && (j.status === "running" || j.status === "cancelling")) throw Object.assign(new Error(`${name} đang có việc ${kind} chạy (${j.id})`), { code: "BUSY", job: view(j) });
  }
  const id = `j-${Date.now().toString(36)}-${randomBytes(2).toString("hex")}`;
  const j = { id, name, kind, cmd, args, cwd, meta, status: "running", code: null, signal: null, started: new Date().toISOString(), ended: null, log: [], onLine, onExit };
  const push = (line, stream) => {
    const text = j.onLine ? j.onLine(line, stream) : line;
    if (text == null) return;
    j.log.push(text);
    if (j.log.length > KEEP) j.log.splice(0, j.log.length - KEEP);
    events.emit("job", { type: "log", job: view(j), line: text });
  };
  let child;
  try { child = spawn(cmd, args, { cwd, env, shell: false, detached: true, stdio: ["ignore", "pipe", "pipe"] }); } catch (e) {
    throw Object.assign(new Error(`không chạy được ${cmd}: ${e.message}`), { code: "SPAWN" });
  }
  j.child = child;
  j.pid = child.pid;
  all.set(id, j);
  for (const [stream, src] of [["stdout", child.stdout], ["stderr", child.stderr]]) {
    let buf = "";
    src.setEncoding("utf8");
    src.on("data", (c) => { buf += c; const lines = buf.split("\n"); buf = lines.pop(); for (const l of lines) if (l.trim()) push(l.replace(/\r$/, ""), stream); });
    src.on("end", () => { if (buf.trim()) push(buf, stream); buf = ""; });
  }
  let done = false;
  const finish = (code, sig, err) => {
    if (done) return;
    done = true;
    clearTimeout(j.timer);
    if (err) push(`lỗi: ${err.message}`, "stderr");
    j.code = code ?? (err ? 127 : null);
    j.signal = sig ?? null;
    j.status = j.status === "cancelling" ? "cancelled" : "exited";
    j.ended = new Date().toISOString();
    try { j.onExit?.(view(j)); } catch (e) { push(`lỗi sau khi xong: ${e.message}`, "stderr"); }
    events.emit("job", { type: "exit", job: view(j) });
  };
  child.on("error", (e) => finish(null, null, e));
  child.on("close", (code, sig) => finish(code, sig));
  events.emit("job", { type: "start", job: view(j) });
  return view(j);
}

export function cancel(id) {
  const j = all.get(id);
  if (!j) return null;
  if (j.status !== "running") return view(j);
  j.status = "cancelling";
  signal(j, "SIGTERM");
  j.timer = setTimeout(() => signal(j, "SIGKILL"), KILL_AFTER_MS);
  j.timer.unref?.();
  return view(j);
}

export const getJob = (id) => (all.has(id) ? view(all.get(id)) : null);
export const jobLog = (id) => all.get(id)?.log.slice() ?? null;
export const listJobs = (name) => [...all.values()].filter((j) => !name || j.name === name).map(view);
export const running = (name, kind) => [...all.values()].find((j) => j.name === name && j.kind === kind && (j.status === "running" || j.status === "cancelling")) ?? null;

// Ends every running job: SIGTERM, then SIGKILL for what is left after 5 s. Resolves when all exited.
export async function stopAll() {
  const live = [...all.values()].filter((j) => j.status === "running" || j.status === "cancelling");
  for (const j of live) { j.status = "cancelling"; signal(j, "SIGTERM"); }
  const t0 = Date.now();
  while (live.some((j) => !j.ended) && Date.now() - t0 < KILL_AFTER_MS) await new Promise((r) => setTimeout(r, 50));
  for (const j of live) if (!j.ended) signal(j, "SIGKILL");
  while (live.some((j) => !j.ended) && Date.now() - t0 < KILL_AFTER_MS + 2000) await new Promise((r) => setTimeout(r, 50));
}
