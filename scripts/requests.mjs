// requests.mjs — the Studio → director request queue, shared by Motion Studio and the MCP server.
// One file per request: <project>/.opus/requests/<id>.json =
//   { id, at, scope: "project"|"shot"|"line", target, t, base, text,
//     status: "queued"|"running"|"done"|"failed"|"waiting_user", runner: "cli"|"mcp", session,
//     receipt, error, follows, ask?, decision? }
// id = r-<yyyymmddhhmmss>-<4 hex>. Every write is a temp file plus renameSync. next() claims a
// request by renaming <id>.json to <id>.claim first, so two runners never take the same one;
// finish() takes the same claim. A claim left by a crashed runner for over 30 s is put back.
// `at` is strictly increasing within a project, so list() order is enqueue order.
// A running request may ask the user a question (ask(): status waiting_user). answer() closes it
// as done and queues a follow-up request (follows: <old id>) in the same session.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export const SCOPES = ["project", "shot", "line"];
export const RUNNERS = ["cli", "mcp"];
export const STATUSES = ["queued", "running", "done", "failed", "waiting_user"];
export const ASK_KINDS = ["choice", "approve", "text"];
export const ASK_GATES = ["direction", "animatic", null];
export const ID = /^r-\d{14}-[0-9a-f]{4}$/;

export const requestsDir = (dir) => join(dir, ".opus", "requests");
const file = (dir, id, ext = "json") => join(requestsDir(dir), `${id}.${ext}`);

function writeAtomic(f, v) {
  const tmp = `${f}.${process.pid}.${randomBytes(3).toString("hex")}.tmp`;
  writeFileSync(tmp, JSON.stringify(v, null, 2) + "\n");
  renameSync(tmp, f);
}

const readJson = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };

export function newId(now = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, "0");
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `r-${stamp}-${randomBytes(2).toString("hex")}`;
}

export function enqueue(dir, { scope, target = null, t = null, base, text, session = null, follows = null }) {
  if (!SCOPES.includes(scope)) throw new Error(`scope phải là ${SCOPES.join(" | ")}`);
  if (!String(text ?? "").trim()) throw new Error("yêu cầu cần có nội dung (text)");
  if (!Number.isInteger(Number(base))) throw new Error("base phải là số phiên bản");
  mkdirSync(requestsDir(dir), { recursive: true });
  const last = Math.max(0, ...list(dir).map((x) => Date.parse(x.at) || 0));
  const now = new Date(Math.max(Date.now(), last + 1));
  let id;
  do id = newId(now); while (existsSync(file(dir, id)) || existsSync(file(dir, id, "claim")));
  const r = { id, at: now.toISOString(), scope, target, t, base: Number(base), text: String(text), status: "queued", runner: null, session, receipt: null, error: null, follows };
  writeAtomic(file(dir, id), r);
  return r;
}

// Every request, oldest first (claims in flight are skipped).
export function list(dir) {
  const d = requestsDir(dir);
  if (!existsSync(d)) return [];
  for (const f of readdirSync(d).filter((x) => x.endsWith(".claim"))) {
    try { if (Date.now() - statSync(join(d, f)).mtimeMs > STALE_CLAIM_MS) renameSync(join(d, f), join(d, f.replace(/\.claim$/, ".json"))); } catch { /* taken back meanwhile */ }
  }
  return readdirSync(d).filter((f) => f.endsWith(".json")).map((f) => readJson(join(d, f))).filter(Boolean)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

const STALE_CLAIM_MS = 30000;
const nap = new Int32Array(new SharedArrayBuffer(4));

// Holds <id>.claim while fn(request) runs; fn returns the new request, or null to leave it as is.
// Returns { r } (the result), or { busy: true } when another process holds the claim.
function withClaim(dir, id, fn, { tries = 1 } = {}) {
  const claim = file(dir, id, "claim");
  for (let i = 0; ; i++) {
    try { renameSync(file(dir, id), claim); break; } catch (e) {
      if (e.code !== "ENOENT") throw e;
      if (i + 1 >= tries) return { busy: true };
      Atomics.wait(nap, 0, 0, 20);
    }
  }
  try {
    const r = readJson(claim);
    const out = r ? fn(r) : null;
    if (out) writeAtomic(claim, out);
    return { r: out };
  } finally { renameSync(claim, file(dir, id)); }
}

// Claims the oldest queued request for runner: status running. Returns it, or null when none.
export function next(dir, runner, { session = null } = {}) {
  if (!RUNNERS.includes(runner)) throw new Error(`runner phải là ${RUNNERS.join(" | ")}`);
  for (const q of list(dir).filter((r) => r.status === "queued")) {
    const { r } = withClaim(dir, q.id, (x) => (x.status === "queued" ? { ...x, status: "running", runner, session: session ?? x.session, started: new Date().toISOString() } : null));
    if (r) return r;
  }
  return null;
}

// Marks a running request done (ok) or failed. With runner, only that runner's claim may close it.
// Returns the updated request.
export function finish(dir, id, { ok, receipt = null, error = null, runner = null }) {
  if (!ID.test(String(id))) throw new Error(`id không hợp lệ: ${id}`);
  if (ok && !String(receipt ?? "").trim()) throw new Error("ok cần có receipt (biên nhận tiếng Việt)");
  if (!ok && !String(error ?? "").trim()) throw new Error("failed cần có error");
  if (!existsSync(file(dir, id)) && !existsSync(file(dir, id, "claim"))) throw new Error(`không có yêu cầu ${id}`);
  let bad = null;
  const res = withClaim(dir, id, (r) => {
    if (r.status !== "running") { bad = `trạng thái ${r.status}, không phải running`; return null; }
    if (runner && r.runner !== runner) { bad = `do runner ${r.runner} giữ, không phải ${runner}`; return null; }
    return { ...r, status: ok ? "done" : "failed", receipt: ok ? receipt : r.receipt, error: ok ? null : error, finished: new Date().toISOString() };
  }, { tries: 50 });
  if (res.busy) throw new Error(`yêu cầu ${id} đang bị tiến trình khác giữ, thử lại sau`);
  if (bad) throw new Error(`yêu cầu ${id} ${bad}`);
  if (!res.r) throw new Error(`không đọc được yêu cầu ${id}`);
  return res.r;
}

// Cancels a queued or running request from Studio (a stuck runner included): status failed.
// Returns the updated request, or null when it had already ended.
export function cancelRequest(dir, id, reason = "Đã huỷ trong Studio") {
  if (!ID.test(String(id))) throw new Error(`id không hợp lệ: ${id}`);
  const res = withClaim(dir, id, (r) => (r.status === "queued" || r.status === "running" ? { ...r, status: "failed", error: reason, finished: new Date().toISOString() } : null), { tries: 50 });
  if (res.busy) throw new Error(`yêu cầu ${id} đang bị tiến trình khác giữ, thử lại sau`);
  return res.r ?? null;
}

// withClaim for ask/answer: throws on a bad id, a missing request or a claim held elsewhere.
function claimOrThrow(dir, id, fn) {
  if (!ID.test(String(id))) throw new Error(`id không hợp lệ: ${id}`);
  if (!existsSync(file(dir, id)) && !existsSync(file(dir, id, "claim"))) throw new Error(`không có yêu cầu ${id}`);
  const res = withClaim(dir, id, fn, { tries: 50 });
  if (res.busy) throw new Error(`yêu cầu ${id} đang bị tiến trình khác giữ, thử lại sau`);
  return res.r;
}

const safeArtifact = (a) => typeof a === "string" && a.trim() !== "" && !a.startsWith("/") && !a.split(/[\\/]/).includes("..");

// A running request asks the user: status waiting_user plus a structured question. With runner,
// only that runner's claim may ask. Artifacts are paths relative to the project. Returns the request.
export function ask(dir, id, { kind, question, options = [], artifacts = [], gate = null, runner = null } = {}) {
  if (!ASK_KINDS.includes(kind)) throw new Error(`kind phải là ${ASK_KINDS.join(" | ")}`);
  if (!String(question ?? "").trim()) throw new Error("câu hỏi (question) không được rỗng");
  if (!ASK_GATES.includes(gate)) throw new Error(`gate phải là ${ASK_GATES.filter(Boolean).join(" | ")} hoặc bỏ trống`);
  if (!Array.isArray(options) || !options.every((o) => o && String(o.id ?? "").trim() && String(o.label ?? "").trim())) throw new Error("mỗi option cần { id, label } khác rỗng");
  if (kind === "choice" && options.length < 2) throw new Error("câu hỏi choice cần ít nhất 2 option");
  if (!Array.isArray(artifacts) || !artifacts.every(safeArtifact)) throw new Error("artifacts phải là đường dẫn tương đối trong dự án, không có .. và không bắt đầu bằng /");
  let bad = null;
  const r = claimOrThrow(dir, id, (x) => {
    if (x.status !== "running") { bad = `trạng thái ${x.status}, không phải running`; return null; }
    if (runner && x.runner !== runner) { bad = `do runner ${x.runner} giữ, không phải ${runner}`; return null; }
    const q = { kind, question: String(question), options: options.map((o) => ({ id: String(o.id), label: String(o.label) })), artifacts, gate, at: new Date().toISOString() };
    return { ...x, status: "waiting_user", ask: q };
  });
  if (bad) throw new Error(`yêu cầu ${id} ${bad}`);
  if (!r) throw new Error(`không đọc được yêu cầu ${id}`);
  return r;
}

// The user answers a waiting_user request: it becomes done with the decision, and a follow-up
// request in the same scope and session (follows: id) is queued at the caller's base.
// Returns { answered, next }.
export function answer(dir, id, { value, by = "user@studio", base } = {}) {
  if (!String(value ?? "").trim()) throw new Error("câu trả lời (value) không được rỗng");
  if (base === null || base === undefined || !Number.isInteger(Number(base))) throw new Error("base phải là số phiên bản");
  let bad = null;
  const answered = claimOrThrow(dir, id, (x) => {
    if (x.status !== "waiting_user") { bad = `trạng thái ${x.status}, không phải waiting_user`; return null; }
    const at = new Date().toISOString();
    return { ...x, status: "done", decision: { value: String(value), by: String(by), at }, receipt: `Người dùng đã trả lời: ${value}`, finished: at };
  });
  if (bad) throw new Error(`yêu cầu ${id} ${bad}`);
  if (!answered) throw new Error(`không đọc được yêu cầu ${id}`);
  const next = enqueue(dir, {
    scope: answered.scope, target: answered.target, t: answered.t, base, session: answered.session, follows: answered.id,
    text: `Người dùng trả lời câu hỏi "${answered.ask?.question ?? ""}": ${value}`,
  });
  return { answered, next };
}

// Questions left unanswered for maxMs or longer become failed; the ask is kept so Studio can
// reopen it. Returns the ids changed.
export function expireWaiting(dir, { maxMs = 24 * 3600 * 1000 } = {}) {
  const changed = [];
  for (const w of list(dir).filter((r) => r.status === "waiting_user")) {
    if (Date.now() - (Date.parse(w.ask?.at) || 0) < maxMs) continue;
    const res = withClaim(dir, w.id, (x) => (x.status === "waiting_user" ? { ...x, status: "failed", error: "Hết hạn chờ trả lời; mở lại câu hỏi trong Studio", finished: new Date().toISOString() } : null), { tries: 50 });
    if (res.r) changed.push(w.id);
  }
  return changed;
}
