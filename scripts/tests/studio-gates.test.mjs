import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { enqueue, next, ask, list, load, cancelRequest } from "../studio-api.mjs";
import { createServer } from "../../studio/server.mjs";
import { answerCard, writeApproval } from "../../studio/gates.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/manifest", import.meta.url));
const TOKEN = "g".repeat(64);
const DEMO = "# DEMO\n\nanimatic: demo/animatic.mp4\napproval: pending\n\n## Frames\n\n- demo/f1.png\n";
let root, dir, server, port, prevState;
const calls = [];
// Stands in for `node make-pitch.mjs choose …`: records argv and writes direction: like the real one.
const fakeRun = async (cmd, args, opts) => {
  calls.push({ cmd, args, opts });
  const pick = args[args.indexOf("--pick") + 1];
  if (pick === "3") return { code: 3, stdout: "", stderr: "compat: warning" };
  const f = join(args[args.indexOf("--project") + 1], "BRIEF.md");
  writeFileSync(f, readFileSync(f, "utf8").replace(/^---\n/, `---\ndirection: pick-${pick}\n`));
  return { code: 0, stdout: "ok", stderr: "" };
};

// A running request that asked q. Follow-ups left queued by earlier answers are cancelled first,
// so next() claims the new one.
function waiting(q) {
  for (const x of list(dir).filter((x) => x.status === "queued")) cancelRequest(dir, x.id);
  const r = enqueue(dir, { scope: "project", base: load(dir).version, text: "làm video" });
  const claimed = next(dir, "cli");
  assert.equal(claimed.id, r.id);
  return ask(dir, r.id, q);
}
const directionCard = () => waiting({ kind: "choice", gate: "direction", question: "Chọn hướng?", options: [{ id: "1", label: "Tối giản" }, { id: "2", label: "Rực rỡ" }, { id: "3", label: "Cổ điển" }], artifacts: ["pitch/sheet.jpg"] });
const animaticCard = () => waiting({ kind: "approve", gate: "animatic", question: "Duyệt animatic?", artifacts: ["demo/animatic.mp4", "demo/contact-sheet.jpg"] });

before(async () => {
  prevState = process.env.OPUS_STUDIO_STATE;
  root = realpathSync(mkdtempSync(join(tmpdir(), "studio-gates-")));
  dir = join(root, "demo");
  cpSync(FIXTURE, dir, { recursive: true });
  writeFileSync(join(dir, "BRIEF.md"), "---\naspect: 16:9\n---\n\n# Brief\n");
  // runner mcp: the follow-up request stays queued instead of starting claude.
  writeFileSync(join(root, "studio.json"), JSON.stringify({ director: { runner: "mcp" } }));
  process.env.OPUS_STUDIO_STATE = join(root, "studio.json");
  server = createServer({ root, token: TOKEN, runtime: null, run: fakeRun });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
after(() => {
  server.closeAllConnections?.(); server.close(); rmSync(root, { recursive: true, force: true });
  if (prevState === undefined) delete process.env.OPUS_STUDIO_STATE; else process.env.OPUS_STUDIO_STATE = prevState;
});

function http(method, path, body) {
  return new Promise((res, rej) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = request({ host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, "x-studio-token": TOKEN, ...(data ? { "content-type": "application/json" } : {}) } }, (r) => {
      let s = ""; r.on("data", (c) => (s += c)); r.on("end", () => { let json = null; try { json = JSON.parse(s); } catch { /* text */ } res({ status: r.statusCode, json, text: s }); });
    });
    req.on("error", rej);
    if (data) req.write(data);
    req.end();
  });
}

test("picking a direction runs make-pitch choose with that --pick, then queues a follow-up", async () => {
  const card = directionCard();
  const r = await http("POST", "/api/director/answer", { name: "demo", id: card.id, value: "2" });
  assert.equal(r.status, 200, r.text);
  const call = calls.at(-1);
  assert.equal(call.cmd, process.execPath);
  assert.match(call.args[0], /scripts\/make-pitch\.mjs$/);
  assert.deepEqual(call.args.slice(1), ["choose", "--project", dir, "--pick", "2", "--accept-warnings"]);
  assert.match(readFileSync(join(dir, "BRIEF.md"), "utf8"), /^direction: pick-2$/m);
  const all = list(dir);
  const old = all.find((x) => x.id === card.id);
  assert.equal(old.status, "done");
  assert.equal(old.decision.value, "Rực rỡ (2)");
  assert.equal(old.decision.by, "user@studio");
  const nxt = all.find((x) => x.id === r.json.next);
  assert.equal(nxt.status, "queued");
  assert.equal(nxt.follows, card.id);
});

test("an option not on the card is 400; a failing make-pitch is 422 and nothing is answered", async () => {
  const card = directionCard();
  const n = calls.length;
  assert.equal((await http("POST", "/api/director/answer", { name: "demo", id: card.id, value: "9" })).status, 400);
  assert.equal(calls.length, n);
  const bad = await http("POST", "/api/director/answer", { name: "demo", id: card.id, value: "3" });
  assert.equal(bad.status, 422);
  assert.match(bad.json.stderr, /compat: warning/);
  assert.equal(list(dir).find((x) => x.id === card.id).status, "waiting_user");
  assert.equal((await http("POST", "/api/director/answer", { name: "demo", id: card.id, value: "1" })).status, 200);
});

test("approve writes approval: user@studio into DEMO.md; reject leaves it unchanged", async () => {
  const card = animaticCard();
  assert.equal((await http("POST", "/api/director/answer", { name: "demo", id: card.id, value: "approve" })).status, 409, "no DEMO.md yet");
  writeFileSync(join(dir, "DEMO.md"), DEMO);
  const ok = await http("POST", "/api/director/answer", { name: "demo", id: card.id, value: "approve" });
  assert.equal(ok.status, 200, ok.text);
  const demo = readFileSync(join(dir, "DEMO.md"), "utf8");
  assert.match(demo, /^approval: user@studio \d{4}-\d\d-\d\dT[\d:.]+Z duyệt animatic demo\/animatic\.mp4$/m);
  assert.doesNotMatch(demo, /approval: pending/);
  assert.match(demo, /^animatic: demo\/animatic\.mp4$/m);

  writeFileSync(join(dir, "DEMO.md"), DEMO);
  const card2 = animaticCard();
  const rej = await http("POST", "/api/director/answer", { name: "demo", id: card2.id, value: { reject: "nhịp chậm quá" } });
  assert.equal(rej.status, 200, rej.text);
  assert.equal(readFileSync(join(dir, "DEMO.md"), "utf8"), DEMO);
  assert.equal(list(dir).find((x) => x.id === card2.id).decision.value, "Không duyệt: nhịp chậm quá");
  const card3 = animaticCard();
  assert.equal((await http("POST", "/api/director/answer", { name: "demo", id: card3.id, value: "yes" })).status, 400);
});

test("a request that is not waiting_user is 409; a text card takes 1–2000 characters", async () => {
  const q = enqueue(dir, { scope: "project", base: load(dir).version, text: "chờ" });
  assert.equal((await http("POST", "/api/director/answer", { name: "demo", id: q.id, value: "x" })).status, 409);
  const card = waiting({ kind: "text", question: "Lời chào?" });
  assert.equal((await answerCard(dir, { id: card.id, value: "" }, { run: fakeRun })).status, 400);
  assert.equal((await answerCard(dir, { id: card.id, value: "x".repeat(2001) }, { run: fakeRun })).status, 400);
  const r = await answerCard(dir, { id: card.id, value: "Xin chào" }, { run: fakeRun });
  assert.equal(r.status, 200);
  assert.equal((await answerCard(dir, { id: card.id, value: "lại" }, { run: fakeRun })).status, 409);
});

test("GET /api/requests turns a waiting_user older than 24 h into failed", async () => {
  const card = directionCard();
  const f = join(dir, ".opus", "requests", `${card.id}.json`);
  const j = JSON.parse(readFileSync(f, "utf8"));
  j.ask.at = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
  writeFileSync(f, JSON.stringify(j));
  const r = await http("GET", "/api/requests?name=demo");
  assert.equal(r.json.find((x) => x.id === card.id).status, "failed");
});

test("writeApproval replaces only the first approval line and returns null without DEMO.md", () => {
  const d = mkdtempSync(join(tmpdir(), "studio-demo-"));
  assert.equal(writeApproval(d, "x"), null);
  writeFileSync(join(d, "DEMO.md"), "approval: pending\napproval: pending\n");
  writeApproval(d, "duyệt", new Date("2026-10-17T00:00:00Z"));
  assert.equal(readFileSync(join(d, "DEMO.md"), "utf8"), "approval: user@studio 2026-10-17T00:00:00.000Z duyệt\napproval: pending\n");
  rmSync(d, { recursive: true, force: true });
});
