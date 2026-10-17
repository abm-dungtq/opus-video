// studio/gates.mjs — the user's answer to a director card (studio_ask). The human gates are
// written here, by Studio, never by the director:
// - gate "direction" (choice): make-pitch.mjs choose --pick <option id> --accept-warnings writes
//   direction:, style_profile, brand and RECIPES.md into the project after its compat check;
// - gate "animatic" (approve): the first `approval:` line of DEMO.md becomes
//   `approval: user@studio <ISO> <what>`; a reject writes nothing.
// Then the request is answered (done + a queued follow-up with follows: id). answerCard returns
// { status, body }; status 200 body { next: <new request id>, request: <the follow-up> }.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { load, list, answer, SCRIPTS } from "../scripts/studio-api.mjs";
import { runFile } from "./create.mjs";

export const BY = "user@studio";
const PITCH_TIMEOUT_MS = 60000;
const APPROVAL = /^\s*[-*]?\s*approval:.*$/im;

// Runs make-pitch choose for pick. Returns { code, stdout, stderr }.
export function writeDirection(dir, pick, { run = runFile } = {}) {
  return run(process.execPath, [join(SCRIPTS, "make-pitch.mjs"), "choose", "--project", dir, "--pick", String(pick), "--accept-warnings"], { cwd: dir, timeout: PITCH_TIMEOUT_MS });
}

// Replaces the first approval: line of DEMO.md (or appends one). Returns the line, or null when
// DEMO.md does not exist.
export function writeApproval(dir, what, now = new Date()) {
  const f = join(dir, "DEMO.md");
  if (!existsSync(f)) return null;
  const line = `approval: ${BY} ${now.toISOString()} ${String(what).replace(/[\r\n]+/g, " ").trim()}`.trimEnd();
  const old = readFileSync(f, "utf8");
  const text = APPROVAL.test(old) ? old.replace(APPROVAL, () => line) : `${old.replace(/\s*$/, "")}\n\n${line}\n`;
  const tmp = `${f}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, f);
  return line;
}

// The shown answer for a valid value, or { error } (400).
export function checkValue(ask, value) {
  if (ask.kind === "choice") {
    const o = ask.options.find((x) => typeof value === "string" && x.id === value);
    return o ? { text: `${o.label} (${o.id})`, pick: o.id } : { error: "Lựa chọn không có trong thẻ" };
  }
  if (ask.kind === "approve") {
    if (value === "approve") return { text: "Duyệt", approve: true };
    if (value && typeof value === "object" && typeof value.reject === "string" && value.reject.length <= 2000) {
      const note = value.reject.replace(/\s+/g, " ").trim();
      return { text: note ? `Không duyệt: ${note}` : "Không duyệt", approve: false };
    }
    return { error: 'value phải là "approve" hoặc { reject: "<ghi chú>" }' };
  }
  if (typeof value === "string" && value.trim().length >= 1 && value.length <= 2000) return { text: value.trim() };
  return { error: "Câu trả lời cần 1–2000 ký tự" };
}

export async function answerCard(dir, { id, value }, { run = runFile } = {}) {
  const req = list(dir).find((r) => r.id === id);
  if (!req) return { status: 404, body: { error: `không có yêu cầu ${id}` } };
  if (req.status !== "waiting_user" || !req.ask) return { status: 409, body: { error: `yêu cầu ${id} đang ${req.status}, không chờ trả lời` } };
  const ask = req.ask;
  const v = checkValue(ask, value);
  if (v.error) return { status: 400, body: { error: v.error } };

  if (ask.gate === "direction" && ask.kind === "choice") {
    if (!/^[1-9]\d*$/.test(v.pick)) return { status: 422, body: { error: `option ${v.pick} không phải số pick của make-pitch` } };
    const r = await writeDirection(dir, v.pick, { run });
    if (r.code !== 0) return { status: 422, body: { error: `make-pitch choose lỗi (exit ${r.code})`, stderr: String(r.stderr || r.stdout).trimEnd().split("\n").slice(-20).join("\n") } };
  }
  if (ask.gate === "animatic" && ask.kind === "approve" && v.approve) {
    if (!writeApproval(dir, `duyệt animatic ${ask.artifacts?.[0] ?? ""}`)) return { status: 409, body: { error: "Chưa có DEMO.md, cần chạy make-demo trước" } };
  }

  let out;
  try { out = answer(dir, id, { value: v.text, base: load(dir).version, by: BY }); } catch (e) {
    return { status: /waiting_user/.test(e.message) ? 409 : 400, body: { error: e.message } };
  }
  return { status: 200, body: { next: out.next.id, request: out.next } };
}
