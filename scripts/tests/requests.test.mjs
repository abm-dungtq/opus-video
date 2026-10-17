import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { enqueue, next, finish, list, requestsDir, ID, ask, answer, expireWaiting, STATUSES } from "../requests.mjs";

const mod = fileURLToPath(new URL("../requests.mjs", import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), "rq-"));

test("enqueue → next → finish: oldest first, status and runner recorded, ids well formed", () => {
  const d = tmp();
  try {
    const a = enqueue(d, { scope: "shot", target: "s2", t: 3.2, base: 4, text: "chậm lại" });
    const b = enqueue(d, { scope: "project", base: 4, text: "đổi màu nền" });
    assert.match(a.id, ID);
    assert.equal(list(d).length, 2);
    const r = next(d, "mcp");
    assert.equal(r.id, a.id);
    assert.equal(r.status, "running");
    assert.equal(r.runner, "mcp");
    assert.throws(() => finish(d, b.id, { ok: true, receipt: "x" }), /queued/);
    assert.throws(() => finish(d, a.id, { ok: true }), /receipt/);
    assert.equal(finish(d, a.id, { ok: true, receipt: "đã sửa compositions/s2.html" }).status, "done");
    assert.equal(next(d, "cli").id, b.id);
    assert.throws(() => finish(d, b.id, { ok: true, receipt: "x", runner: "mcp" }), /runner cli/);
    assert.equal(finish(d, b.id, { ok: false, error: "không đủ dữ liệu" }).status, "failed");
    assert.equal(next(d, "mcp"), null);
    assert.deepEqual(readdirSync(requestsDir(d)).filter((f) => !f.endsWith(".json")), [], "no temp or claim files left");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("enqueue refuses a bad scope, empty text or a missing base", () => {
  const d = tmp();
  try {
    assert.throws(() => enqueue(d, { scope: "beat", base: 1, text: "x" }), /scope/);
    assert.throws(() => enqueue(d, { scope: "shot", base: 1, text: "  " }), /text/);
    assert.throws(() => enqueue(d, { scope: "shot", text: "x" }), /base/);
    assert.throws(() => next(d, "web"), /runner/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("parallel next calls from separate processes never return the same id", async () => {
  const d = tmp();
  try {
    for (let i = 0; i < 20; i++) enqueue(d, { scope: "project", base: 1, text: `yêu cầu ${i}` });
    const worker = () => new Promise((res, rej) => {
      const code = `import { next } from ${JSON.stringify(mod)}; const got = []; let r; while ((r = next(${JSON.stringify(d)}, "mcp"))) got.push(r.id); console.log(JSON.stringify(got));`;
      const p = spawn("node", ["--input-type=module", "-e", code], { stdio: ["ignore", "pipe", "inherit"] });
      let out = "";
      p.stdout.on("data", (c) => (out += c));
      p.on("close", (c) => (c === 0 ? res(JSON.parse(out)) : rej(new Error(`worker exit ${c}`))));
    });
    const results = await Promise.all([worker(), worker(), worker(), worker()]);
    const all = results.flat();
    assert.equal(all.length, 20, JSON.stringify(results));
    assert.equal(new Set(all).size, 20);
    assert.ok(list(d).every((r) => r.status === "running"));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("requests enqueued in a tight loop keep enqueue order and strictly increasing at", () => {
  const d = tmp();
  try {
    const ids = Array.from({ length: 10 }, (_, i) => enqueue(d, { scope: "project", base: 1, text: `y${i}` }).id);
    const rows = list(d);
    assert.deepEqual(rows.map((r) => r.id), ids);
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i].at > rows[i - 1].at, rows.map((r) => r.at).join(" "));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

const CHOICE = { kind: "choice", question: "Chọn hướng nào?", options: [{ id: "1", label: "A1" }, { id: "2", label: "A2" }], artifacts: ["demo/pitch-1.png"], gate: "direction" };

test("ask moves a running request to waiting_user; queued, one-option choice and `..` artifacts are refused", () => {
  const d = tmp();
  try {
    assert.equal(STATUSES.at(-1), "waiting_user");
    const q = enqueue(d, { scope: "project", base: 1, text: "chọn hướng" });
    assert.throws(() => ask(d, q.id, CHOICE), /queued/);
    next(d, "cli", { session: "sess-9" });
    assert.throws(() => ask(d, q.id, { ...CHOICE, options: [{ id: "1", label: "A1" }] }), /2 option/);
    assert.throws(() => ask(d, q.id, { ...CHOICE, artifacts: ["../x.png"] }), /artifacts/);
    assert.throws(() => ask(d, q.id, { ...CHOICE, artifacts: ["/etc/passwd"] }), /artifacts/);
    assert.throws(() => ask(d, q.id, { ...CHOICE, gate: "final" }), /gate/);
    assert.throws(() => ask(d, q.id, { ...CHOICE, kind: "pick" }), /kind/);
    assert.throws(() => ask(d, q.id, { ...CHOICE, question: " " }), /question/);
    assert.throws(() => ask(d, q.id, { ...CHOICE, runner: "mcp" }), /runner cli/);
    const w = ask(d, q.id, { ...CHOICE, runner: "cli" });
    assert.equal(w.status, "waiting_user");
    assert.equal(w.ask.gate, "direction");
    assert.deepEqual(w.ask.options.map((o) => o.id), ["1", "2"]);
    assert.ok(Date.parse(w.ask.at));
    assert.equal(list(d)[0].status, "waiting_user");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("answer closes the question and queues a follow-up in the same session; only from waiting_user", () => {
  const d = tmp();
  try {
    const q = enqueue(d, { scope: "shot", target: "s2", t: 1.5, base: 3, text: "duyệt animatic" });
    next(d, "cli", { session: "sess-9" });
    assert.throws(() => answer(d, q.id, { value: "ok", base: 3 }), /running/);
    ask(d, q.id, { kind: "approve", question: "Duyệt animatic?", artifacts: ["demo/animatic.mp4"], gate: "animatic" });
    assert.throws(() => answer(d, q.id, { value: "  ", base: 3 }), /value/);
    assert.throws(() => answer(d, q.id, { value: "ok" }), /base/);
    const { answered, next: n } = answer(d, q.id, { value: "ok", base: 4 });
    assert.equal(answered.status, "done");
    assert.equal(answered.decision.value, "ok");
    assert.equal(answered.decision.by, "user@studio");
    assert.equal(answered.receipt, "Người dùng đã trả lời: ok");
    assert.equal(n.status, "queued");
    assert.equal(n.follows, q.id);
    assert.equal(n.session, "sess-9");
    assert.equal(n.scope, "shot");
    assert.equal(n.target, "s2");
    assert.equal(n.base, 4);
    assert.equal(n.text, 'Người dùng trả lời câu hỏi "Duyệt animatic?": ok');
    assert.throws(() => answer(d, q.id, { value: "ok", base: 4 }), /done/);
    assert.deepEqual(list(d).map((r) => r.id), [q.id, n.id]);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("expireWaiting fails old questions and keeps the ask", () => {
  const d = tmp();
  try {
    const q = enqueue(d, { scope: "project", base: 1, text: "chọn hướng" });
    next(d, "cli");
    ask(d, q.id, CHOICE);
    assert.deepEqual(expireWaiting(d), [], "a fresh question is kept");
    assert.deepEqual(expireWaiting(d, { maxMs: 0 }), [q.id]);
    const r = list(d)[0];
    assert.equal(r.status, "failed");
    assert.match(r.error, /Hết hạn chờ trả lời/);
    assert.equal(r.ask.question, CHOICE.question);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
