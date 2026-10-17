#!/usr/bin/env node
// mcp/server.mjs — opus-video MCP server (stdio, Node built-ins only). Its tools wrap the command
// gateway (scripts/gateway.mjs: the one writer of project.json) and the Studio request queue
// (scripts/requests.mjs), so a Claude Code session can read a project, patch it as
// actor "director" and pick up Studio requests.
// Transport: newline-delimited JSON-RPC 2.0 on stdin/stdout; logs go to stderr only. Exits 0 when
// stdin ends. Every tool takes `project`: an absolute path to a directory holding project.json.
//   node mcp/server.mjs
import { createInterface } from "node:readline";
import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "../scripts/manifest.mjs";
import { patch, undo, readHistory } from "../scripts/gateway.mjs";
import { next, finish } from "../scripts/requests.mjs";

// A director started by Studio (`claude -p`, studio/director.mjs) runs this server with
// OPUS_STUDIO_RUNNER=cli: it closes the request Studio claimed for it as runner "cli". Any other
// session pulls the queue as runner "mcp".
const RUNNER = process.env.OPUS_STUDIO_RUNNER === "cli" ? "cli" : "mcp";

// stdout carries JSON-RPC only: anything a library logs goes to stderr.
console.log = (...a) => console.error(...a);

export const SERVER = { name: "opus-video", version: "2.0.0" };
const PROJECT = { type: "string", description: "Đường dẫn tuyệt đối tới thư mục dự án có project.json" };
const BASE = { type: "integer", description: "Phiên bản project.json bạn vừa đọc (project_get → version)" };

export const TOOLS = [
  {
    name: "project_get",
    description: "Đọc manifest project.json của dự án (shot, câu thoại, nhạc, phiên bản). Luôn gọi trước khi sửa.",
    inputSchema: { type: "object", properties: { project: PROJECT }, required: ["project"], additionalProperties: false },
  },
  {
    name: "project_log",
    description: "Lịch sử thay đổi của dự án: N dòng mới nhất của .opus/history.jsonl (phiên bản, người sửa, biên nhận).",
    inputSchema: { type: "object", properties: { project: PROJECT, limit: { type: "integer", minimum: 1, description: "Số dòng (mặc định 20)" } }, required: ["project"], additionalProperties: false },
  },
  {
    name: "project_patch",
    description: "Sửa timeline qua cổng lệnh với actor director: một danh sách op (resize_shot, move_line, set_shot, set_line_text, set_music, add_shot, remove_shot) thành một phiên bản mới, kèm biên nhận tiếng Việt. Sai base trả CONFLICT, op sai trả INVALID.",
    inputSchema: {
      type: "object",
      properties: {
        project: PROJECT,
        base: BASE,
        ops: { type: "array", minItems: 1, items: { type: "object", properties: { op: { type: "string" } }, required: ["op"] }, description: "Op theo dạng của gateway.mjs --help" },
        receipt_note: { type: "string", description: "Ghi chú lưu cùng dòng lịch sử (lý do, id yêu cầu Studio)" },
      },
      required: ["project", "base", "ops"],
      additionalProperties: false,
    },
  },
  {
    name: "project_undo",
    description: "Hoàn tác thay đổi mới nhất chưa hoàn tác, thành một phiên bản mới (không vượt qua lần nhập gần nhất).",
    inputSchema: { type: "object", properties: { project: PROJECT, base: BASE }, required: ["project", "base"], additionalProperties: false },
  },
  {
    name: "studio_request_next",
    description: "Nhận yêu cầu Studio cũ nhất đang chờ (queued), đánh dấu running với runner mcp. Trả về null khi hàng đợi trống.",
    inputSchema: { type: "object", properties: { project: PROJECT }, required: ["project"], additionalProperties: false },
  },
  {
    name: "studio_request_done",
    description: "Kết thúc một yêu cầu Studio đang running: ok true kèm receipt tiếng Việt liệt kê mọi file và op đã đổi, hoặc ok false kèm error.",
    inputSchema: {
      type: "object",
      properties: { project: PROJECT, id: { type: "string" }, ok: { type: "boolean" }, receipt: { type: "string" }, error: { type: "string" } },
      required: ["project", "id", "ok"],
      additionalProperties: false,
    },
  },
];

const text = (v) => ({ content: [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] });
const fail = (msg) => ({ ...text(msg), isError: true });

function projectDir(p) {
  if (typeof p !== "string" || !isAbsolute(p)) return { error: `project phải là đường dẫn tuyệt đối, nhận được ${JSON.stringify(p)}` };
  if (!existsSync(p) || !statSync(p).isDirectory() || !existsSync(join(p, "project.json"))) return { error: `không có project.json trong ${p}` };
  // One spelling per project: the gateway lock, versions and request queue are keyed by this path.
  return { dir: realpathSync(p) };
}

const gatewayResult = (r) => (r.code ? fail(r.error) : text({ version: r.version, receipt: r.receipt, lines: r.lines ?? [], warnings: r.warnings ?? [] }));

export function callTool(name, args) {
  args ??= {};
  const { dir, error } = projectDir(args.project);
  if (error) return fail(error);
  try {
    switch (name) {
      case "project_get": return text(load(dir));
      case "project_log": return text(readHistory(dir).slice(-(Number(args.limit) > 0 ? Number(args.limit) : 20)));
      case "project_patch":
        if (!Array.isArray(args.ops) || !args.ops.length) return fail("ops phải là mảng op, không rỗng");
        if (!Number.isInteger(args.base)) return fail("base phải là số phiên bản");
        return gatewayResult(patch(dir, { actor: "director", base: args.base, ops: args.ops, note: args.receipt_note }));
      case "project_undo":
        if (!Number.isInteger(args.base)) return fail("base phải là số phiên bản");
        return gatewayResult(undo(dir, { base: args.base }));
      case "studio_request_next": {
        const r = next(dir, RUNNER);
        return text(r ?? "null");
      }
      case "studio_request_done":
        return text(finish(dir, args.id, { ok: Boolean(args.ok), receipt: args.receipt, error: args.error, runner: RUNNER }));
    }
  } catch (e) { return fail(e.message); }
}

// One JSON-RPC message → the reply object, or null for a notification.
export function handle(msg) {
  const reply = (result) => ({ jsonrpc: "2.0", id: msg.id, result });
  const error = (code, message) => ({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } });
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return error(-32600, "Invalid Request");
  const isNote = msg.id === undefined;
  switch (msg.method) {
    case "initialize":
      return reply({ protocolVersion: msg.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: SERVER });
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call":
      if (!TOOLS.some((t) => t.name === msg.params?.name)) return error(-32602, `Unknown tool: ${msg.params?.name}`);
      return reply(callTool(msg.params.name, msg.params.arguments));
    default:
      return isNote ? null : error(-32601, `Method not found: ${msg.method}`);
  }
}

export function serve(input = process.stdin, write = (s) => process.stdout.write(s)) {
  const rl = createInterface({ input, crlfDelay: Infinity });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n"); return; }
    let out;
    try { out = handle(msg); } catch (e) { out = { jsonrpc: "2.0", id: msg?.id ?? null, error: { code: -32603, message: e.message } }; }
    if (out) write(JSON.stringify(out) + "\n");
  });
  return new Promise((res) => rl.on("close", res));
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  serve().then(() => process.exit(0));
}
