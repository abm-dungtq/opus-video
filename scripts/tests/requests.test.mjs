import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { enqueue, next, finish, list, requestsDir, ID } from "../requests.mjs";

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
