import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { enqueue } from "../requests.mjs";

const server = fileURLToPath(new URL("../../mcp/server.mjs", import.meta.url));
const FIXTURE = fileURLToPath(new URL("./fixtures/manifest", import.meta.url));

// Sends every message as one line, returns the replies by id once the server exits on EOF.
// env adds to the parent's environment, without the runner names so only env picks the runner.
function session(messages, env = {}) {
  const base = { ...process.env };
  for (const k of ["MOTION_STUDIO_RUNNER", "OPUS_STUDIO_RUNNER"]) delete base[k];
  const r = spawnSync("node", [server], { input: messages.map((m) => JSON.stringify(m)).join("\n") + "\n", encoding: "utf8", timeout: 20000, env: { ...base, ...env } });
  assert.equal(r.status, 0, r.stderr);
  const replies = r.stdout.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return Object.fromEntries(replies.map((x) => [x.id, x]));
}
const call = (id, name, args) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } };
const initialized = { jsonrpc: "2.0", method: "notifications/initialized" };

test("initialize, tools/list, project_patch as director, stale base → CONFLICT", () => {
  const dir = mkdtempSync(join(tmpdir(), "mcp-"));
  try {
    cpSync(FIXTURE, dir, { recursive: true });
    const v = JSON.parse(readFileSync(join(dir, "project.json"), "utf8")).version;
    const r = session([
      init, initialized,
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      call(3, "project_patch", { project: dir, base: v, ops: [{ op: "resize_shot", id: "s2", duration: 3.5 }], receipt_note: "yêu cầu thử" }),
      call(4, "project_patch", { project: dir, base: v, ops: [{ op: "resize_shot", id: "s2", duration: 4 }] }),
      call(5, "project_get", { project: dir }),
    ]);
    assert.equal(Object.keys(r).length, 5, "the notification gets no reply");
    assert.equal(r[1].result.protocolVersion, "2025-06-18");
    assert.deepEqual(r[1].result.capabilities, { tools: {} });
    assert.equal(r[1].result.serverInfo.name, "opus-video");
    assert.deepEqual(r[2].result.tools.map((t) => t.name).sort(), ["project_get", "project_log", "project_patch", "project_undo", "studio_ask", "studio_request_done", "studio_request_next"]);
    assert.ok(!r[3].result.isError, r[3].result.content[0].text);
    assert.equal(JSON.parse(r[3].result.content[0].text).version, v + 1);
    const last = readFileSync(join(dir, ".opus", "history.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).at(-1);
    assert.equal(last.actor, "director");
    assert.equal(last.note, "yêu cầu thử");
    assert.equal(r[4].result.isError, true);
    assert.match(r[4].result.content[0].text, /CONFLICT/);
    assert.equal(JSON.parse(r[5].result.content[0].text).version, v + 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("bad JSON → -32700, unknown method → -32601, relative or empty project → isError", () => {
  const dir = mkdtempSync(join(tmpdir(), "mcp-"));
  try {
    const out = spawnSync("node", [server], { input: "{not json\n" + JSON.stringify({ jsonrpc: "2.0", id: 7, method: "nope" }) + "\n", encoding: "utf8" });
    assert.equal(out.status, 0);
    const [a, b] = out.stdout.trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(a.error.code, -32700);
    assert.equal(b.error.code, -32601);
    const r = session([init, call(2, "project_get", { project: "relative/dir" }), call(3, "project_get", { project: dir }), call(4, "nope_tool", {}), { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "project_get", arguments: null } }]);
    assert.equal(r[4].error.code, -32602);
    assert.equal(r[5].result.isError, true);
    assert.equal(r[2].result.isError, true);
    assert.match(r[2].result.content[0].text, /tuyệt đối/);
    assert.equal(r[3].result.isError, true);
    assert.match(r[3].result.content[0].text, /project\.json/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("studio_request_next claims the queued request for mcp; studio_request_done closes it", () => {
  const dir = mkdtempSync(join(tmpdir(), "mcp-"));
  try {
    cpSync(FIXTURE, dir, { recursive: true });
    const q = enqueue(dir, { scope: "shot", target: "s2", t: 3, base: 1, text: "cho chip bay vào chậm hơn" });
    const r = session([
      init,
      call(2, "studio_request_next", { project: dir }),
      call(3, "studio_request_done", { project: dir, id: q.id, ok: true, receipt: "đã sửa compositions/s2.html" }),
      call(4, "studio_request_next", { project: dir }),
      call(5, "studio_request_done", { project: dir, id: q.id, ok: true, receipt: "lần hai" }),
    ]);
    const got = JSON.parse(r[2].result.content[0].text);
    assert.equal(got.id, q.id);
    assert.equal(got.runner, "mcp");
    assert.equal(JSON.parse(r[3].result.content[0].text).status, "done");
    assert.equal(r[4].result.content[0].text, "null");
    assert.equal(r[5].result.isError, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the runner is cli from MOTION_STUDIO_RUNNER, else from OPUS_STUDIO_RUNNER; the new name wins", () => {
  const cases = [
    [{ MOTION_STUDIO_RUNNER: "cli" }, "cli"],
    [{ OPUS_STUDIO_RUNNER: "cli" }, "cli"],
    [{ MOTION_STUDIO_RUNNER: "mcp", OPUS_STUDIO_RUNNER: "cli" }, "mcp"],
    [{ MOTION_STUDIO_RUNNER: "", OPUS_STUDIO_RUNNER: "cli" }, "cli"],
    [{}, "mcp"],
  ];
  for (const [env, runner] of cases) {
    const dir = mkdtempSync(join(tmpdir(), "mcp-"));
    try {
      cpSync(FIXTURE, dir, { recursive: true });
      enqueue(dir, { scope: "project", base: 1, text: "kiểm runner" });
      const r = session([init, call(2, "studio_request_next", { project: dir })], env);
      assert.equal(JSON.parse(r[2].result.content[0].text).runner, runner, JSON.stringify(env));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test("studio_ask moves a running request to waiting_user; a queued one or a bad choice is an error", () => {
  const dir = mkdtempSync(join(tmpdir(), "mcp-"));
  try {
    cpSync(FIXTURE, dir, { recursive: true });
    const q = enqueue(dir, { scope: "project", base: 1, text: "chọn hướng" });
    const ask = { project: dir, id: q.id, kind: "choice", question: "Chọn hướng nào?", options: [{ id: "1", label: "A1" }, { id: "2", label: "A2" }], artifacts: ["demo/pitch-1.png"], gate: "direction" };
    const r = session([
      init,
      call(2, "studio_ask", ask),
      call(3, "studio_request_next", { project: dir }),
      call(4, "studio_ask", { ...ask, options: [{ id: "1", label: "A1" }] }),
      call(5, "studio_ask", ask),
    ]);
    assert.equal(r[2].result.isError, true);
    assert.match(r[2].result.content[0].text, /queued/);
    assert.equal(r[4].result.isError, true);
    assert.match(r[4].result.content[0].text, /2 option/);
    assert.ok(!r[5].result.isError, r[5].result.content[0].text);
    assert.match(r[5].result.content[0].text, /Kết thúc lượt này ngay/);
    const saved = JSON.parse(readFileSync(join(dir, ".opus", "requests", `${q.id}.json`), "utf8"));
    assert.equal(saved.status, "waiting_user");
    assert.equal(saved.ask.gate, "direction");
    assert.deepEqual(saved.ask.artifacts, ["demo/pitch-1.png"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
