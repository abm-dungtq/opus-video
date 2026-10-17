import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer } from "../../studio/server.mjs";
import { list } from "../requests.mjs";
import { MCP_TOOLS, ALLOWED_TOOLS } from "../../studio/director.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/manifest", import.meta.url));
const REQUESTS = fileURLToPath(new URL("../requests.mjs", import.meta.url));
const TOKEN = "d".repeat(64);
let root, bin, calls, server, port, saved;

// A stand-in for `claude -p`: records its argv, then behaves by a tag in the request text.
const FAKE = `#!/usr/bin/env node
const fs = require("fs");
const a = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_CALLS, JSON.stringify(a) + "\\n");
const prompt = a[a.indexOf("-p") + 1];
const resume = a.includes("--resume") ? a[a.indexOf("--resume") + 1] : null;
if (resume === "bad") { console.error("No conversation found with session ID: bad"); process.exit(1); }
const out = (o) => console.log(JSON.stringify(o));
out({ type: "system", subtype: "init", session_id: resume ?? "sess-1", tools: ${JSON.stringify(MCP_TOOLS)} });
const id = process.env.OPUS_STUDIO_REQUEST;
setTimeout(async () => {
  if (prompt.includes("[crash]")) { console.error("boom"); process.exit(2); }
  out({ type: "assistant", message: { content: [{ type: "tool_use", name: "mcp__plugin_opus-video_opus-video__project_get" }] } });
  if (!prompt.includes("[silent]")) {
    const { finish } = await import(${JSON.stringify(REQUESTS)});
    finish(process.cwd(), id, { ok: true, receipt: "Đã đổi s2", runner: process.env.OPUS_STUDIO_RUNNER });
  }
  out({ type: "result", subtype: "success", is_error: false, result: "Biên nhận cuối" });
}, prompt.includes("[slow]") ? 400 : 10);
`;

before(async () => {
  root = mkdtempSync(join(tmpdir(), "director-"));
  cpSync(FIXTURE, join(root, "demo"), { recursive: true });
  bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "claude"), FAKE);
  chmodSync(join(bin, "claude"), 0o755);
  calls = join(root, "calls.jsonl");
  saved = { PATH: process.env.PATH, OPUS_STUDIO_STATE: process.env.OPUS_STUDIO_STATE, FAKE_CALLS: process.env.FAKE_CALLS };
  process.env.PATH = `${bin}:${process.env.PATH}`;
  process.env.OPUS_STUDIO_STATE = join(root, "studio.json");
  process.env.FAKE_CALLS = calls;
  server = createServer({ root, token: TOKEN, runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
after(() => {
  server.closeAllConnections?.(); server.close();
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  rmSync(root, { recursive: true, force: true });
});

function post(path, body, token = TOKEN) {
  return new Promise((res, rej) => {
    const data = JSON.stringify(body);
    const req = request({ host: "127.0.0.1", port, method: "POST", path, headers: { host: `127.0.0.1:${port}`, "content-type": "application/json", ...(token ? { "x-studio-token": token } : {}) } }, (r) => {
      let s = ""; r.on("data", (c) => (s += c)); r.on("end", () => res({ status: r.statusCode, json: JSON.parse(s || "null") }));
    });
    req.on("error", rej); req.end(data);
  });
}
const dir = () => join(root, "demo");
async function ended(id) {
  for (let i = 0; i < 100; i++) {
    const r = list(dir()).find((x) => x.id === id);
    if (r && (r.status === "done" || r.status === "failed")) return r;
    await new Promise((x) => setTimeout(x, 50));
  }
  throw new Error(`request ${id} did not end`);
}
const argv = () => readFileSync(calls, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const session = () => JSON.parse(readFileSync(join(dir(), ".opus", "director.json"), "utf8")).session_id;

test("request reaches done, the session is stored, the next run resumes it", async () => {
  const a = await post("/api/director", { name: "demo", scope: "shot", target: "s2", t: 3, text: "Shot 2 chậm lại" });
  assert.equal(a.status, 200);
  assert.equal(a.json.runner, "cli");
  const ra = await ended(a.json.request.id);
  assert.equal(ra.status, "done");
  assert.equal(ra.runner, "cli");
  assert.equal(ra.receipt, "Đã đổi s2");
  assert.equal(session(), "sess-1");
  const first = argv().at(-1);
  assert.ok(!first.includes("--resume"));
  for (const t of MCP_TOOLS) assert.ok(first.includes(t), t);
  assert.ok(!first.includes("Bash(node:*)"));
  assert.deepEqual(first.slice(first.indexOf("--disallowedTools") + 1, first.indexOf("--disallowedTools") + 3), ["WebFetch", "WebSearch"]);
  assert.equal(first[first.indexOf("--permission-mode") + 1], "acceptEdits");
  assert.match(first[first.indexOf("-p") + 1], /"id": "r-\d{14}-[0-9a-f]{4}"[\s\S]*studio_request_done/);

  const b = await post("/api/director", { name: "demo", scope: "project", text: "Chữ to hơn" });
  assert.equal((await ended(b.json.request.id)).status, "done");
  const second = argv().at(-1);
  assert.equal(second[second.indexOf("--resume") + 1], "sess-1");
});

test("a failed resume is retried once without it", async () => {
  writeFileSync(join(dir(), ".opus", "director.json"), JSON.stringify({ session_id: "bad" }));
  const n = argv().length;
  const r = await post("/api/director", { name: "demo", scope: "project", text: "Thử lại" });
  assert.equal((await ended(r.json.request.id)).status, "done");
  const runs = argv().slice(n);
  assert.equal(runs.length, 2);
  assert.ok(runs[0].includes("--resume") && !runs[1].includes("--resume"));
  assert.equal(session(), "sess-1");
});

test("exit without closing: final answer becomes the receipt; a crash marks it failed", async () => {
  const s = await post("/api/director", { name: "demo", scope: "project", text: "[silent] làm gì đó" });
  const rs = await ended(s.json.request.id);
  assert.equal(rs.status, "done");
  assert.equal(rs.receipt, "Biên nhận cuối");
  const c = await post("/api/director", { name: "demo", scope: "project", text: "[crash] hỏng" });
  const rc = await ended(c.json.request.id);
  assert.equal(rc.status, "failed");
  assert.match(rc.error, /exit 2[\s\S]*boom/);
});

test("a second request waits for the first, then runs", async () => {
  const a = await post("/api/director", { name: "demo", scope: "project", text: "[slow] một" });
  const b = await post("/api/director", { name: "demo", scope: "project", text: "hai" });
  assert.equal(b.json.request.status, "queued");
  assert.match(b.json.message, /chờ/);
  assert.equal((await ended(a.json.request.id)).status, "done");
  assert.equal((await ended(b.json.request.id)).status, "done");
});

test("runner mcp leaves the request queued; Studio can cancel it; POST needs the token", async () => {
  writeFileSync(process.env.OPUS_STUDIO_STATE, JSON.stringify({ director: { runner: "mcp" } }));
  try {
    const r = await post("/api/director", { name: "demo", scope: "line", target: "vo-01", text: "Duyệt lại câu 1" });
    assert.equal(r.json.request.status, "queued");
    assert.match(r.json.message, /studio_request_next/);
    const c = await post("/api/director/cancel", { name: "demo", id: r.json.request.id });
    assert.equal(c.json.request.status, "failed");
    assert.equal((await post("/api/director", { name: "demo", scope: "project", text: "x" }, null)).status, 403);
    assert.equal((await post("/api/director", { name: "demo", scope: "nope", text: "x" })).status, 400);
  } finally { rmSync(process.env.OPUS_STUDIO_STATE, { force: true }); }
  assert.ok(ALLOWED_TOOLS.some((t) => t.startsWith("Bash(node /") && t.endsWith("/scripts/*)")));
});
