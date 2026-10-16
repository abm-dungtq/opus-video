#!/usr/bin/env node
// studio.mjs — run Motion Studio, the local web app over the command gateway (studio/server.mjs).
//   node studio.mjs start [--background] [--root <dir>]   serve http://127.0.0.1:4317
//   node studio.mjs status                                 running <url> … | stopped
//   node studio.mjs stop                                   SIGTERM, then the pidfile is removed
//   node studio.mjs --help | -h
// Root: --root, else $OPUS_STUDIO_ROOT, else /Volumes/2/Edit-Video. Projects are its direct
// children holding project.json (or index.html + BRIEF.md, offered as "Nhập dự án").
// One server on this machine: pid, root, port and the token of the run are kept in
// ~/.config/opus-video/studio.json (chmod 600; $OPUS_STUDIO_STATE overrides the path). start
// with a live server for the same root prints its URL; for another root it refuses (exit 3) and
// names the running root. Port 4317 held by another process: "cổng 4317 đang bị <pid> giữ",
// exit 3; the port never changes. Binds 127.0.0.1 only. Background log: studio.log beside the
// state file.
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync, chmodSync, renameSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { maybeHelp } from "./cli-help.mjs";

export const PORT = 4317;
export const HOST = "127.0.0.1";
const STATE = process.env.OPUS_STUDIO_STATE || join(homedir(), ".config", "opus-video", "studio.json");
const LOG = join(dirname(STATE), "studio.log");
const url = () => `http://${HOST}:${PORT}/`;

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };
export function readState() { try { return JSON.parse(readFileSync(STATE, "utf8")); } catch { return null; } }
function writeState(s) {
  mkdirSync(dirname(STATE), { recursive: true });
  const tmp = `${STATE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(s, null, 2) + "\n", { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, STATE);
}
// lsof missing (Windows): undefined; nobody listening: null.
const portOwner = () => { try { return execFileSync("lsof", ["-ti", `tcp:${PORT}`, "-sTCP:LISTEN"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split("\n")[0] || null; } catch (e) { return e.code === "ENOENT" ? undefined : null; } };
const answers = async (s) => { try { const r = await fetch(new URL("/api/projects", s.url), { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; } };
// The state file survives a crash or kill -9, and after a reboot its pid may belong to another
// process: it is live only while that pid holds the port (or, without lsof, the URL answers).
async function live() {
  const s = readState();
  if (!s || !alive(s.pid)) return null;
  const owner = portOwner();
  return (owner === undefined ? await answers(s) : owner === String(s.pid)) ? s : null;
}
const rootOf = (o) => realpathSync(resolve(o.root || process.env.OPUS_STUDIO_ROOT || "/Volumes/2/Edit-Video"));

async function serve(root) {
  const { createServer } = await import("../studio/server.mjs");
  const token = randomBytes(32).toString("hex");
  const server = createServer({ root, token });
  await new Promise((res) => {
    server.once("error", (e) => {
      if (e.code === "EADDRINUSE") { console.error(`studio: cổng ${PORT} đang bị ${portOwner() ?? "tiến trình khác"} giữ`); process.exit(3); }
      console.error(`studio: ${e.message}`); process.exit(1);
    });
    server.listen(PORT, HOST, res);
  });
  writeState({ pid: process.pid, port: PORT, root, url: url(), token, started: new Date().toISOString() });
  const bye = () => { const s = readState(); if (s?.pid === process.pid) rmSync(STATE, { force: true }); server.close(); process.exit(0); };
  process.on("SIGTERM", bye);
  process.on("SIGINT", bye);
  console.log(`Motion Studio: ${url()} (root ${root})`);
}

async function start(o) {
  const root = rootOf(o);
  const s = await live();
  if (s) {
    if (s.root === root) { console.log(`đang chạy: ${s.url} (pid ${s.pid})`); return 0; }
    console.error(`studio: đang chạy cho ${s.root} (pid ${s.pid}); dừng nó trước (node studio.mjs stop)`);
    return 3;
  }
  if (readState()) rmSync(STATE, { force: true });
  const owner = portOwner();
  if (owner) { console.error(`studio: cổng ${PORT} đang bị ${owner} giữ`); return 3; }
  if (!o.background) { await serve(root); return null; }
  mkdirSync(dirname(STATE), { recursive: true });
  const fd = openSync(LOG, "a");
  const p = spawn(process.execPath, [fileURLToPath(import.meta.url), "start", "--root", root], { detached: true, stdio: ["ignore", fd, fd], env: process.env });
  p.unref();
  closeSync(fd);
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const st = readState();
    if (st?.pid === p.pid) { console.log(`Motion Studio: ${st.url} (pid ${st.pid}, root ${root}; log ${LOG})`); return 0; }
    if (p.exitCode !== null) break;
  }
  console.error(`studio: không khởi động được, xem ${LOG}`);
  return 1;
}

async function status() {
  const s = await live();
  if (!s) { if (readState()) rmSync(STATE, { force: true }); console.log("stopped"); return 0; }
  console.log(`running ${s.url} (pid ${s.pid}, root ${s.root}, từ ${s.started})`);
  return 0;
}

async function stop() {
  const s = await live();
  if (!s) { rmSync(STATE, { force: true }); console.log("stopped"); return 0; }
  process.kill(s.pid, "SIGTERM");
  for (let i = 0; i < 50 && alive(s.pid); i++) await new Promise((r) => setTimeout(r, 100));
  if (alive(s.pid)) { console.error(`studio: pid ${s.pid} chưa dừng sau 5 s`); return 1; }
  rmSync(STATE, { force: true });
  console.log("stopped");
  return 0;
}

export async function main(argv = process.argv.slice(2)) {
  maybeHelp(argv, import.meta.url);
  const [cmd, ...rest] = argv;
  const o = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--background") o.background = true;
    else if (rest[i] === "--root") o.root = rest[++i];
    else { console.error(`studio: unknown argument ${rest[i]}`); return 2; }
  }
  if (o.root !== undefined && (!o.root || !existsSync(o.root))) { console.error(`studio: không có thư mục ${o.root}`); return 2; }
  if (cmd === "start") return start(o);
  if (cmd === "status") return status();
  if (cmd === "stop") return stop();
  console.error("usage: node studio.mjs start [--background] [--root <dir>] | status | stop");
  return 2;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  main().then((code) => { if (code !== null) process.exit(code); });
}
