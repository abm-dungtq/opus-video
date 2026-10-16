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
