// studio/create.mjs — "Dự án mới" in Motion Studio. createProject(root, input, { run }) validates
// the form, runs the workspace's <root>/scripts/new-project.sh (no shell, cwd root, env OV = the
// plugin), writes mode/topic/audience into the BRIEF.md frontmatter (never direction: — that one is
// the user's pick in the direction card), builds project.json with manifest-import.mjs and queues
// the optional first request. Returns { status, body, dir? }; status 200 body { name, editable,
// request }. The caller starts the director (pump) when body.request is set.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { load, enqueue, OV, SCRIPTS } from "../scripts/studio-api.mjs";

export const NEW_NAME = /^[a-z0-9][a-z0-9-]{1,48}$/;
export const ASPECTS = ["16:9", "9:16", "both"];
export const MODES = ["tu-dau", "video-co-san", "theo-nhac", "mau-nhanh"];
const SCRIPT_TIMEOUT_MS = 120000;
const IMPORT_TIMEOUT_MS = 60000;

// run(cmd, args, opts) → Promise<{ code, stdout, stderr }>; never rejects.
export const runFile = (cmd, args, opts = {}) => new Promise((res) => {
  execFile(cmd, args, { encoding: "utf8", maxBuffer: 16 << 20, shell: false, ...opts }, (err, stdout, stderr) => {
    res({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout: stdout ?? "", stderr: (stderr ?? "") || (err && typeof err.code !== "number" ? err.message : "") });
  });
});

const tail = (s, n = 20) => String(s ?? "").trimEnd().split("\n").slice(-n).join("\n");
const oneLine = (s) => String(s ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();

// Sets `key: value` lines in a markdown frontmatter (replaces existing keys, appends new ones).
// A file without frontmatter gets one.
export function setFrontmatter(text, pairs) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
  let fm = m ? m[1] : "";
  for (const [k, v] of Object.entries(pairs)) {
    const line = `${k}: ${v}`;
    const re = new RegExp(`^${k}:.*$`, "m");
    fm = re.test(fm) ? fm.replace(re, () => line) : (fm ? `${fm}\n${line}` : line);
  }
  return m ? `---\n${fm}\n---${m[2]}${text.slice(m[0].length)}` : `---\n${fm}\n---\n\n${text}`;
}

export function validateInput(input) {
  const i = input && typeof input === "object" ? input : {};
  if (typeof i.name !== "string" || !NEW_NAME.test(i.name)) return "Tên dự án chỉ gồm chữ thường, số và dấu gạch ngang (2–49 ký tự), bắt đầu bằng chữ hoặc số";
  if (!ASPECTS.includes(i.aspect)) return `aspect phải là ${ASPECTS.join(" | ")}`;
  if (!MODES.includes(i.mode)) return `mode phải là ${MODES.join(" | ")}`;
  const topic = oneLine(i.topic);
  if (typeof i.topic !== "string" || topic.length < 1 || topic.length > 500) return "Chủ đề cần 1–500 ký tự";
  if (!Number.isInteger(i.duration) || i.duration < 5 || i.duration > 600) return "Thời lượng là số giây nguyên từ 5 đến 600";
  if (i.audience != null && (typeof i.audience !== "string" || oneLine(i.audience).length > 500)) return "Đối tượng tối đa 500 ký tự";
  if (i.first_request != null && (typeof i.first_request !== "string" || i.first_request.length > 4000)) return "Yêu cầu đầu tiên tối đa 4000 ký tự";
  return null;
}

export async function createProject(root, input, { run = runFile } = {}) {
  const bad = validateInput(input);
  if (bad) return { status: 400, body: { error: bad } };
  const { name, aspect, mode, duration } = input;
  for (const n of [name, `${name}-9x16`]) {
    if (existsSync(join(root, n))) return { status: 409, body: { error: `Đã có thư mục ${n} trong workspace` } };
  }
  const script = join(root, "scripts", "new-project.sh");
  if (!existsSync(script)) return { status: 501, body: { error: "Workspace thiếu scripts/new-project.sh" } };

  const made = await run("bash", [script, name, "--aspect", aspect, "--duration", String(duration)], { cwd: root, env: { ...process.env, OV }, timeout: SCRIPT_TIMEOUT_MS });
  if (made.code !== 0) return { status: 500, body: { error: `new-project.sh lỗi (exit ${made.code})`, stderr: tail(made.stderr || made.stdout) } };

  const folder = aspect === "9:16" ? `${name}-9x16` : name;
  const dir = join(root, folder);
  if (!existsSync(dir)) return { status: 500, body: { error: `new-project.sh không tạo thư mục ${folder}` } };

  const brief = join(dir, "BRIEF.md");
  const pairs = { mode, topic: oneLine(input.topic) };
  if (oneLine(input.audience)) pairs.audience = oneLine(input.audience);
  const old = existsSync(brief) ? readFileSync(brief, "utf8") : `# Brief: ${folder}\n`;
  const tmp = `${brief}.${process.pid}.tmp`;
  writeFileSync(tmp, setFrontmatter(old, pairs));
  renameSync(tmp, brief);

  const imp = await run(process.execPath, [join(SCRIPTS, "manifest-import.mjs"), "--project", dir, "--write"], { cwd: dir, timeout: IMPORT_TIMEOUT_MS });
  if (imp.code !== 0) return { status: 500, body: { error: `manifest-import.mjs lỗi (exit ${imp.code})`, stderr: tail(imp.stderr || imp.stdout) } };

  let m;
  try { m = load(dir); } catch (e) { return { status: 500, body: { error: `project.json không đọc được: ${e.message}` } }; }
  let request = null;
  if (String(input.first_request ?? "").trim()) request = enqueue(dir, { scope: "project", base: m.version, text: input.first_request.trim() });
  return { status: 200, dir, body: { name: folder, editable: Boolean(m.capabilities?.editable), request } };
}
