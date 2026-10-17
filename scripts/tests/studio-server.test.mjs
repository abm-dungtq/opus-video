import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer, projectFile } from "../../studio/server.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/manifest", import.meta.url));
const TOKEN = "t".repeat(64);
let root, server, port;

before(async () => {
  root = mkdtempSync(join(tmpdir(), "studio-"));
  cpSync(FIXTURE, join(root, "demo"), { recursive: true });
  cpSync(FIXTURE, join(root, "old"), { recursive: true });
  const m = JSON.parse(readFileSync(join(root, "old", "project.json"), "utf8"));
  m.capabilities.editable = false;
  writeFileSync(join(root, "old", "project.json"), JSON.stringify(m, null, 2));
  mkdirSync(join(root, "fresh"));
  writeFileSync(join(root, "fresh", "index.html"), "<html></html>");
  writeFileSync(join(root, "fresh", "BRIEF.md"), "# x\n");
  writeFileSync(join(root, "demo", ".env"), "SECRET=1\n");
  server = createServer({ root, token: TOKEN, runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
after(() => { server.closeAllConnections?.(); server.close(); rmSync(root, { recursive: true, force: true }); });

function http(method, path, { body, headers = {} } = {}) {
  return new Promise((res, rej) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = request({ host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, ...(data ? { "content-type": "application/json" } : {}), ...headers } }, (r) => {
      let s = ""; r.on("data", (c) => (s += c)); r.on("end", () => { let json = null; try { json = JSON.parse(s); } catch { /* text */ } res({ status: r.statusCode, json, text: s }); });
    });
    req.on("error", rej);
    if (data) req.write(data);
    req.end();
  });
}
const post = (path, body, headers = {}) => http("POST", path, { body, headers: { "x-studio-token": TOKEN, ...headers } });

test("projects are listed with manifest and editable flags", async () => {
  const r = await http("GET", "/api/projects");
  assert.equal(r.status, 200);
  const by = Object.fromEntries(r.json.map((p) => [p.name, p]));
  assert.equal(by.demo.has_manifest, true);
  assert.equal(by.demo.editable, true);
  assert.equal(by.old.editable, false);
  assert.equal(by.fresh.has_manifest, false);
});

test("patch as human: 200 and version +1; stale base 409; non-editable 423; history actor human", async () => {
  const v = (await http("GET", "/api/project?name=demo")).json.version;
  const ok = await post("/api/patch", { name: "demo", base: v, ops: [{ op: "resize_shot", id: "s1", duration: 3 }] });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.json.version, v + 1);
  assert.equal((await http("GET", "/api/project?name=demo")).json.version, v + 1);
  const stale = await post("/api/patch", { name: "demo", base: v, ops: [{ op: "resize_shot", id: "s1", duration: 3.5 }] });
  assert.equal(stale.status, 409);
  assert.match(stale.json.error, /CONFLICT/);
  const ro = await post("/api/patch", { name: "old", base: 1, ops: [{ op: "resize_shot", id: "s1", duration: 3 }] });
  assert.equal(ro.status, 423);
  const log = (await http("GET", "/api/log?name=demo")).json;
  assert.equal(log.at(-1).actor, "human");
  const bad = await post("/api/patch", { name: "demo", base: v + 1, ops: [{ op: "nope" }] });
  assert.equal(bad.status, 422);
});

test("security: traversal, dotfiles, Host, Origin, token and name are refused", async () => {
  assert.equal((await http("GET", "/p/demo/../../etc/passwd")).status, 403);
  assert.equal((await http("GET", "/p/demo/%2e%2e/%2e%2e/etc/passwd")).status, 403);
  assert.equal((await http("GET", "/p/demo/.env")).status, 403);
  assert.equal((await http("GET", "/p/demo/.opus/lock")).status, 403);
  assert.equal((await http("GET", "/api/projects", { headers: { host: "evil.test" } })).status, 403);
  assert.equal((await post("/api/patch", { name: "demo", base: 1, ops: [] }, { origin: "http://evil.test" })).status, 403);
  assert.equal((await http("POST", "/api/patch", { body: { name: "demo", base: 1, ops: [] } })).status, 403);
  assert.equal((await http("GET", "/api/project?name=../x")).status, 400);
  assert.equal((await http("GET", "/api/project?name=a%2Fb")).status, 400);
  assert.equal((await http("GET", "/p/demo/PLAN.md")).status, 200);
  assert.equal(projectFile(join(root, "demo"), ".opus/history.jsonl").status ?? 200, 200);
});

test("GET / injects the run token; the project index gets the runtime tag", async () => {
  const page = await http("GET", "/");
  assert.equal(page.status, 200);
  assert.ok(page.text.includes(TOKEN));
  const idx = await http("GET", "/p/demo/index.html");
  assert.match(idx.text, /<script src="\/hf\/runtime\.js\?name=demo"><\/script><\/body>/);
});

test("media is served with byte ranges", async () => {
  writeFileSync(join(root, "demo", "assets", "voice", "01.mp3"), Buffer.alloc(1000, 7));
  const r = await new Promise((res) => request({ host: "127.0.0.1", port, path: "/p/demo/assets/voice/01.mp3", headers: { host: `127.0.0.1:${port}`, range: "bytes=10-19" } }, (x) => { let n = 0; x.on("data", (c) => (n += c.length)); x.on("end", () => res({ status: x.statusCode, n, cr: x.headers["content-range"] })); }).end());
  assert.deepEqual(r, { status: 206, n: 10, cr: "bytes 10-19/1000" });
});

test("SSE sends manifest after a patch", async () => {
  const v = (await http("GET", "/api/project?name=demo")).json.version;
  const got = await new Promise((res, rej) => {
    const req = request({ host: "127.0.0.1", port, path: "/api/events?name=demo", headers: { host: `127.0.0.1:${port}` } }, (r) => {
      let buf = "";
      r.on("data", async (c) => {
        buf += c;
        if (buf.startsWith(": ok") && !req.patched) { req.patched = true; await new Promise((x) => setTimeout(x, 150)); await post("/api/patch", { name: "demo", base: v, ops: [{ op: "set_shot", id: "s2", field: "name", value: "SSE" }] }); }
        const m = buf.match(/event: manifest\ndata: (.*)\n\n/);
        if (m) { req.destroy(); res(JSON.parse(m[1])); }
      });
    });
    req.on("error", (e) => { if (e.code !== "ECONNRESET") rej(e); });
    req.end();
    setTimeout(() => rej(new Error("no manifest event in 5 s")), 5000);
  });
  assert.equal(got.version, v + 1);
  assert.equal(got.shots[1].name, "SSE");
});

test("undo, busy lock, import mapping, files and a missing runtime", async () => {
  const v = (await http("GET", "/api/project?name=demo")).json.version;
  const ok = await post("/api/patch", { name: "demo", base: v, ops: [{ op: "set_shot", id: "s3", field: "name", value: "U" }] });
  assert.equal(ok.status, 200);
  const u = await post("/api/undo", { name: "demo", base: v + 1 });
  assert.equal(u.status, 200, u.text);
  assert.equal((await http("GET", "/api/project?name=demo")).json.shots[2].name, "Kết quả");
  assert.equal((await post("/api/undo", { name: "demo", base: v })).status, 409);
  // Another process holds the project lock: a write gives up after 300 ms with 503.
  writeFileSync(join(root, "demo", ".opus", "lock"), "other");
  const t0 = Date.now();
  const busy = await post("/api/patch", { name: "demo", base: v + 2, ops: [{ op: "set_shot", id: "s3", field: "name", value: "B" }] });
  assert.equal(busy.status, 503);
  assert.ok(Date.now() - t0 < 2000);
  rmSync(join(root, "demo", ".opus", "lock"));
  assert.equal((await post("/api/import", { name: "demo" })).status, 409);
  const files = (await http("GET", "/api/files?name=demo&dir=assets")).json;
  assert.ok(files.some((f) => f.path === "assets/voice/01.mp3.words.json"));
  assert.equal((await http("GET", "/api/files?name=demo&dir=..")).status, 400);
  assert.equal((await http("GET", "/hf/runtime.js?name=demo")).status, 404);
});

test("export: a project without demo approval stops at the gate (exit 5) and is not compressed", async () => {
  const r = await post("/api/export", { name: "old" });
  assert.equal(r.status, 200, r.text);
  let job;
  for (let i = 0; i < 200; i++) {
    job = (await http("GET", "/api/jobs?name=old")).json.find((j) => j.id === r.json.job.id);
    if (job.ended) break;
    await new Promise((x) => setTimeout(x, 100));
  }
  assert.equal(job.code, 5);
  assert.match(job.meta.message, /^Thiếu cổng: .*DEMO\.md/);
  await new Promise((x) => setTimeout(x, 200));
  assert.equal((await http("GET", "/api/jobs?name=old")).json.length, 1);
  assert.equal((await http("GET", "/api/files?name=old&dir=renders")).json.some((f) => /-final\.mp4$/.test(f.path)), false);
  assert.equal((await post("/api/export", { name: "old", ratio: "9x16" })).status, 400);
});

test("GET /api/agent reports claude, runner, last job and ffmpeg; no claude on PATH is found: false", async () => {
  const keys = ["claude", "runner", "last_job", "ffprobe", "ffmpeg"];
  const prevPath = process.env.PATH;
  const empty = mkdtempSync(join(tmpdir(), "studio-empty-path-"));
  process.env.PATH = empty;
  try {
    const r = await http("GET", "/api/agent?name=demo");
    assert.equal(r.status, 200, r.text);
    for (const k of keys) assert.ok(k in r.json, k);
    assert.equal(r.json.claude.found, false);
    assert.equal(r.json.claude.logged_in, null);
    assert.ok(["cli", "mcp"].includes(r.json.runner));
    assert.equal(r.json.last_job, null);
    assert.equal(typeof r.json.ffprobe, "boolean");
    assert.equal((await http("GET", "/api/agent?name=..")).status, 400);
  } finally {
    process.env.PATH = prevPath;
    rmSync(empty, { recursive: true, force: true });
  }
  const r = await http("GET", "/api/agent");
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.json).sort(), [...keys].sort());
  assert.deepEqual(Object.keys(r.json.claude).sort(), ["found", "logged_in", "version"]);
});
