import { test } from "node:test";
import assert from "node:assert/strict";
import { startJob, cancel, events, getJob, jobLog, stopAll } from "../../studio/jobs.mjs";

const node = process.execPath;
const exited = (id) => new Promise((res) => {
  const j = getJob(id);
  if (j?.ended) return res(j);
  const on = (e) => { if (e.type === "exit" && e.job.id === id) { events.off("job", on); res(e.job); } };
  events.on("job", on);
});
const gone = (pid) => { try { process.kill(pid, 0); return false; } catch { return true; } };

test("log lines, exit code and the onLine filter", async () => {
  const j = startJob({ name: "p", kind: "log", cmd: node, args: ["-e", "console.log('a\\nskip\\nb'); console.error('c'); process.exit(3)"], onLine: (l) => (l === "skip" ? null : l) });
  const end = await exited(j.id);
  assert.equal(end.code, 3);
  assert.equal(end.status, "exited");
  assert.deepEqual(jobLog(j.id).sort(), ["a", "b", "c"]);
});

test("one running job per project and kind; cancel ends the child", async () => {
  const j = startJob({ name: "p", kind: "export", cmd: node, args: ["-e", "setInterval(() => {}, 1000)"] });
  assert.throws(() => startJob({ name: "p", kind: "export", cmd: node, args: ["-e", "0"] }), (e) => e.code === "BUSY");
  const other = startJob({ name: "q", kind: "export", cmd: node, args: ["-e", "0"] });
  await exited(other.id);
  cancel(j.id);
  const end = await exited(j.id);
  assert.equal(end.status, "cancelled");
  assert.throws(() => process.kill(j.pid, 0));
  const again = startJob({ name: "p", kind: "export", cmd: node, args: ["-e", "0"] });
  assert.equal((await exited(again.id)).code, 0);
});

test("cancel kills a child that ignores SIGTERM, and grandchildren go with the group", async () => {
  const script = "process.on('SIGTERM', () => {}); const c = require('child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); console.log(c.pid); setInterval(() => {}, 1000)";
  const j = startJob({ name: "p", kind: "stubborn", cmd: node, args: ["-e", script] });
  await new Promise((r) => { const on = (e) => { if (e.type === "log" && e.job.id === j.id) { events.off("job", on); r(); } }; events.on("job", on); });
  const grand = Number(jobLog(j.id)[0]);
  cancel(j.id);
  const end = await exited(j.id);
  assert.equal(end.signal, "SIGKILL");
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(gone(j.pid));
  assert.ok(gone(grand), "grandchild survived");
});

test("stopAll ends every running job", async () => {
  const a = startJob({ name: "x", kind: "a", cmd: node, args: ["-e", "setInterval(() => {}, 1000)"] });
  const b = startJob({ name: "y", kind: "a", cmd: node, args: ["-e", "setInterval(() => {}, 1000)"] });
  await stopAll();
  assert.ok(getJob(a.id).ended && getJob(b.id).ended);
  assert.ok(gone(a.pid) && gone(b.pid));
});

test("a missing command exits as an error, not a crash", async () => {
  const j = startJob({ name: "p", kind: "missing", cmd: "/nonexistent/claude-xyz", args: [] });
  const end = await exited(j.id);
  assert.equal(end.code, 127);
  assert.match(jobLog(j.id).join("\n"), /ENOENT/);
});
