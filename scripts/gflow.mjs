#!/usr/bin/env node
// gflow.mjs — Google Flow (Nano Banana images, Veo / Omni Flash clips) for opus-video, through
// gflow-studio, the abm-dungtq edition of gflow-cli (`uv tool install "git+https://github.com/abm-dungtq/gflow-studio.git@main"`; it adds video --upscale). Node >= 22, no deps.
//
//   node gflow.mjs doctor [--profile p]
//   node gflow.mjs image --prompt-file f.txt --out assets/gen/x.png [--ref a.png ...] [--aspect 9:16]
//                        [--model nano2] [--count 1-4] [--profile p] [--project dir] [--flow-project name]
//   node gflow.mjs video --start a.png [--end b.png] --prompt-file f.txt --out assets/gen/x.mp4 --spend
//                        [--model veo-lite] [--duration 4|6|8|10] [--aspect 9:16] [--resolution 360p|720p]
//                        [--upscale] [--profile p] [--project dir] [--flow-project name]
//
// image: no --ref runs `gflow image t2i`, any --ref runs `gflow image i2i` (local paths, uploaded by
// gflow). Flow images cost no credits. video: `gflow video i2v`; Veo spends Flow credits, so the
// command refuses without --spend (exit 2). --count > 1 writes <out>-1.png … into the out directory.
// --upscale replaces the 720p clip at --out with Flow's free 1080p export (no extra credits; needs gflow
// installed from gflow-studio, whose `video i2v` has `--upscale`). If the export fails gflow keeps the 720p clip and exits 0;
// the warning is printed and written to the ledger.
//
// Rules: nothing here retries. One call is one gflow run; a failed or timed-out run is reported with
// gflow's own exit code and never sent again, because a run Flow accepted may already have billed.
// Every run is written to <project>/assets/gen/gflow-ledger.jsonl before it starts (status "sent")
// and again when it ends (status "ok" or "failed", exit code, files), with the prompt hash and the
// ref hashes, never the prompt text or image data. Exit codes from gflow pass through: 23 selector drift
// (Flow changed its page), 22 plan limit, 3–7 transport classes, see gflow's docs/USAGE.md.
//
// Every run goes into ONE named Flow project, reused across runs: --flow-project <name>, default the
// local project folder's name. The id is kept in <project>/assets/gen/gflow-projects.json; a new name
// is looked up in gflow's local catalog (`gflow project list`) and created once (`gflow project
// create --name`) if missing. A project deleted on the web is reported, not recreated. Without this
// gflow makes a fresh
// scratch project per run and the Flow account fills with junk projects.
//
// On macOS gflow's headed Chrome is kept hidden during a run (an-chrome-gflow.js, needs Accessibility
// permission for the terminal); GFLOW_SHOW=1 shows it. With GFLOW_CLI_WINDOW_MODE=background gflow
// already runs a background-only Chrome that cannot take focus, so the hider is skipped: its loop
// re-activates the front app four times a second, which closes menus and the Vietnamese IME. Runs on a busy profile wait up to 600 s.
//
// GFLOW_BIN overrides the gflow executable (tests use a fake).
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BIN = process.env.GFLOW_BIN || "gflow";
const IMAGE_MODELS = ["nano2", "nano2.1", "nano-pro", "nano2-lite", "imagen4"];
const VIDEO_MODELS = ["omni-flash", "veo-lite", "veo-fast", "veo-quality", "veo-lite-lp"];
const IMAGE_ASPECTS = ["9:16", "16:9", "1:1", "4:3", "3:4"];
const VIDEO_ASPECTS = ["9:16", "16:9"];

const fail = (msg, code = 2) => { console.error(`gflow.mjs: ${msg}`); process.exit(code); };
const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);

export function parseArgs(argv) {
  const o = { ref: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { (o._ ??= []).push(a); continue; }
    const k = a.slice(2);
    if (k === "spend" || k === "json" || k === "upscale") { o[k] = true; continue; }
    const v = argv[++i];
    if (v === undefined) fail(`thiếu giá trị cho --${k}`);
    if (k === "ref") o.ref.push(v); else o[k] = v;
  }
  return o;
}

// The gflow argv for an image run. Pure, so tests can check it without a browser.
export function imageArgs(o, prompt) {
  const model = o.model ?? "nano2", aspect = o.aspect ?? "9:16", count = Number(o.count ?? 1);
  if (!IMAGE_MODELS.includes(model)) throw new Error(`--model phải là một trong ${IMAGE_MODELS.join(", ")}`);
  if (!IMAGE_ASPECTS.includes(aspect)) throw new Error(`--aspect phải là một trong ${IMAGE_ASPECTS.join(", ")}`);
  if (!Number.isInteger(count) || count < 1 || count > 4) throw new Error("--count phải từ 1 đến 4");
  const args = ["image", o.ref.length ? "i2i" : "t2i", prompt, "--model", model, "--aspect", aspect, "-n", String(count), "--json"];
  for (const r of o.ref) args.push("--ref", r);
  if (count === 1) args.push("-o", o.out); else args.push("--out", dirname(o.out));
  if (o.profile) args.push("--profile", o.profile);
  return args;
}

export function videoArgs(o, prompt) {
  const model = o.model ?? "veo-lite", aspect = o.aspect ?? "9:16";
  if (!VIDEO_MODELS.includes(model)) throw new Error(`--model phải là một trong ${VIDEO_MODELS.join(", ")}`);
  if (!VIDEO_ASPECTS.includes(aspect)) throw new Error(`--aspect phải là một trong ${VIDEO_ASPECTS.join(", ")}`);
  if (o.duration !== undefined) {
    const d = Number(o.duration), ok = model === "omni-flash" ? [4, 6, 8, 10] : [4, 6, 8];
    if (!ok.includes(d)) throw new Error(`--duration với ${model} phải là ${ok.join("/")}`);
  }
  if (o.resolution !== undefined && !["360p", "720p"].includes(o.resolution)) throw new Error("--resolution phải là 360p hoặc 720p");
  const args = ["video", "i2v", "--initial-frame", o.start, prompt, "--model", model, "--aspect", aspect, "--count", "1", "-o", o.out, "--json"];
  if (o.end) args.push("--end-frame", o.end);
  if (o.duration !== undefined) args.push("--duration", String(o.duration));
  if (o.resolution) args.push("--resolution", o.resolution);
  if (o.upscale) args.push("--upscale");
  if (o.profile) args.push("--profile", o.profile);
  return args;
}

function ledger(project, row) {
  const file = join(project, "assets/gen/gflow-ledger.jsonl");
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...row }) + "\n");
}

function readPrompt(o) {
  if (!o["prompt-file"]) fail("cần --prompt-file (prompt lưu trong dự án để làm lại được)");
  const p = readFileSync(o["prompt-file"], "utf8").trim();
  if (!p) fail("prompt rỗng");
  return p;
}

function checkFiles(paths) {
  for (const p of paths) if (!existsSync(p) || !statSync(p).isFile()) fail(`không thấy file: ${p}`);
}

// --count > 1: gflow writes <dir>/<media_name>_<n>.<ext>; rename the new ones to <out>-<n><ext>.
function collect(o, before, kind) {
  if (kind === "video") return existsSync(o.out) ? [o.out] : [];
  if (Number(o.count ?? 1) === 1) {
    // gflow may write the real extension itself (key.png asked, key.jpg written).
    const stem = o.out.slice(0, o.out.length - extname(o.out).length);
    const hit = [o.out, ...[".jpg", ".jpeg", ".png", ".webp"].map((e) => stem + e)].find((p) => existsSync(p) && !before.has(basename(p)));
    return hit ? [realExt(hit)] : existsSync(o.out) ? [realExt(o.out)] : [];
  }
  const dir = dirname(o.out), ext = extname(o.out) || ".png", stem = basename(o.out, ext);
  const fresh = readdirSync(dir).filter((f) => !before.has(f) && /\.(png|jpe?g|webp)$/i.test(f)).sort();
  return fresh.map((f, i) => { const to = join(dir, `${stem}-${i + 1}${ext}`); renameSync(join(dir, f), to); return realExt(to); });
}

// Flow often returns JPEG whatever the name asked for; rename so the extension tells the truth
// (a .png that is a JPEG has no alpha, and tools that trust the name misread it).
export function realExt(path) {
  const head = readFileSync(path).subarray(0, 12);
  const ext = head[0] === 0xff && head[1] === 0xd8 ? ".jpg"
    : head[0] === 0x89 && head[1] === 0x50 ? ".png"
    : head.subarray(8, 12).toString() === "WEBP" ? ".webp" : null;
  if (!ext || extname(path).toLowerCase() === ext || (ext === ".jpg" && /\.jpe?g$/i.test(path))) return path;
  const to = path.slice(0, path.length - extname(path).length) + ext;
  renameSync(path, to);
  return to;
}

// gflow mixes one-line structlog events into stdout and pretty-prints its own --json result over
// several lines; return the first JSON object for which pick() is set.
export function pickJson(text, pick) {
  const start = text.search(/^\{\s*$/m);
  const block = start < 0 ? "" : text.slice(start, text.lastIndexOf("}") + 1);
  for (const line of [text, block, ...text.split("\n")]) {
    try { const v = pick(JSON.parse(line)); if (v) return v; } catch {}
  }
  return null;
}

// Name → Flow project id. Order: the id saved in <project>/assets/gen/gflow-projects.json (travels
// with the project folder, so a second machine or a title edited on the web keeps the same project),
// then the newest entry with that exact title in gflow's local catalog, else create it once.
function flowProject(project, name, profile) {
  const file = join(project, "assets/gen/gflow-projects.json"), key = `${profile ?? "default"}:${name}`;
  const saved = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  if (saved[key]) return saved[key];
  const id = lookupOrCreate(name, profile);
  mkdirSync(dirname(file), { recursive: true });
  // re-read and merge right before writing, then rename, so parallel runs do not drop each other's keys
  const now = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ ...now, [key]: id }, null, 1) + "\n");
  renameSync(tmp, file);
  return id;
}

function lookupOrCreate(name, profile) {
  const prof = profile ? ["--profile", profile] : [];
  const l = spawnSync(BIN, ["project", "list", "--json", "--limit", "1000", ...prof], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const projects = pickJson(l.stdout ?? "", (j) => j.projects) ?? [];
  const hit = projects.filter((p) => p.title === name).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  if (hit) return hit.project_id;
  console.error(`gflow.mjs: chưa có dự án Flow "${name}", tạo một lần…`);
  const c = spawnSync(BIN, ["project", "create", "--name", name, "--json", ...prof], { encoding: "utf8" });
  const id = pickJson(c.stdout ?? "", (j) => j.project_id ?? j.project?.project_id ?? j.id);
  if (c.status !== 0 || !id) fail(`không tạo được dự án Flow "${name}" (mã ${c.status}): ${(c.stderr || c.stdout || "").trim().split("\n").slice(-2).join(" ")}`, c.status || 1);
  return id;
}

// gflow needs a headed Chrome; on macOS keep it hidden and give focus back (an-chrome-gflow.js).
// GFLOW_SHOW=1 leaves it visible, e.g. to watch a run.
// gflow's own precedence for GFLOW_CLI_WINDOW_MODE: the environment, then ./.env, then <home>/.env.
export function gflowWindowMode(env = process.env, cwd = process.cwd()) {
  if (env.GFLOW_CLI_WINDOW_MODE) return env.GFLOW_CLI_WINDOW_MODE.trim().toLowerCase();
  const home = env.GFLOW_CLI_HOME || join(homedir(), "Library", "Application Support", "gflow-cli");
  for (const f of [join(cwd, ".env"), join(home, ".env")]) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, "utf8").match(/^\s*GFLOW_CLI_WINDOW_MODE\s*=\s*["']?([\w-]+)/m);
    if (m) return m[1].toLowerCase();
  }
  return "offscreen";
}

export function needsChromeHider(platform = process.platform, env = process.env, cwd = process.cwd()) {
  if (platform !== "darwin" || env.GFLOW_SHOW === "1" || env.GFLOW_BIN) return false;
  return gflowWindowMode(env, cwd) !== "background";
}

function hideChrome() {
  if (!needsChromeHider()) return null;
  const script = join(dirname(fileURLToPath(import.meta.url)), "an-chrome-gflow.js");
  return spawn("osascript", ["-l", "JavaScript", script, String(process.pid)], { stdio: "ignore" });
}

function generate(kind, o) {
  if (!o.out) fail("cần --out");
  const prompt = readPrompt(o);
  if (kind === "video") {
    if (!o.start) fail("cần --start (ảnh khung đầu)");
    if (!o.spend) fail("tạo video tốn credit Flow: thêm --spend khi người dùng đã đồng ý");
    checkFiles([o.start, ...(o.end ? [o.end] : [])]);
  } else checkFiles(o.ref);
  let args;
  try { args = kind === "video" ? videoArgs(o, prompt) : imageArgs(o, prompt); } catch (e) { fail(e.message); }
  const project = resolve(o.project ?? ".");
  const flowName = o["flow-project"] ?? basename(project);
  const flowId = flowProject(project, flowName, o.profile);
  args.push("--project", flowId);
  mkdirSync(dirname(resolve(o.out)), { recursive: true });
  const before = new Set(readdirSync(dirname(resolve(o.out))));
  const frames = kind === "video" ? [o.start, o.end].filter(Boolean) : o.ref;
  const id = `${Date.now().toString(36)}-${sha(Buffer.from(prompt + o.out))}`;
  const base = { id, kind, model: args[args.indexOf("--model") + 1], flow_project: flowId, out: o.out, prompt_sha: sha(Buffer.from(prompt)), refs: frames.map((p) => ({ path: p, sha: sha(readFileSync(p)) })) };
  ledger(project, { ...base, status: "sent" });
  console.error(`gflow.mjs: chạy ${BIN} ${args[0]} ${args[1]} (${base.model}), lần đầu có thể mất 30–90 giây…`);
  const hider = hideChrome();
  // a second run on the same profile waits its turn instead of failing with exit 11
  const env = { GFLOW_CLI_LEASE_WAIT_SECONDS: "600", ...process.env };
  const r = spawnSync(BIN, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env });
  hider?.kill();
  if (r.error) { ledger(project, { id, status: "failed", exit: null, error: r.error.message }); fail(`không chạy được ${BIN}: ${r.error.message}. Cài: uv tool install \"git+https://github.com/abm-dungtq/gflow-studio.git@main\"`, 1); }
  const files = r.status === 0 ? collect(o, before, kind) : [];
  if (r.status === 0 && !files.length) {
    ledger(project, { id, status: "failed", exit: 0, error: "gflow báo xong nhưng không có file" });
    fail("gflow báo xong nhưng không thấy file đầu ra; không gửi lại, xem thư mục output của gflow", 1);
  }
  if (r.status !== 0) {
    const tail = (r.stderr || r.stdout || "").trim().split("\n").slice(-6).join("\n");
    ledger(project, { id, status: "failed", exit: r.status, error: tail.slice(0, 500) });
    console.error(tail);
    // a project deleted on the web is reported, never silently recreated (that would split its history)
    if (/project.*(not.?found|404|deleted|permission|does not exist)/i.test(tail)) console.error(`gflow.mjs: có thể dự án Flow "${flowName}" (${flowId}) đã bị xoá trên web. Dùng --flow-project <tên-khác>, hoặc xoá khoá "${o.profile ?? "default"}:${flowName}" trong assets/gen/gflow-projects.json để tạo mới.`);
    fail(`gflow thoát mã ${r.status}; không tự gửi lại${r.status === 23 ? " (Flow đổi giao diện: cập nhật bằng `gflow update`)" : ""}`, r.status ?? 1);
  }
  const upscale = o.upscale ? pickJson(r.stdout, (j) => (j.upscaled || j.upscale_warning ? { upscaled: j.upscaled, upscale_warning: j.upscale_warning } : null)) : null;
  if (upscale?.upscale_warning) console.error(`gflow.mjs: ${upscale.upscale_warning}`);
  ledger(project, { id, status: "ok", exit: 0, ...upscale, files: files.map((f) => ({ path: f, sha: sha(readFileSync(f)), bytes: statSync(f).size })) });
  for (const f of files) console.log(f);
}

function doctor(o) {
  const v = spawnSync(BIN, ["--version"], { encoding: "utf8" });
  if (v.error || v.status !== 0) fail('chưa cài gflow (gflow-studio): uv tool install "git+https://github.com/abm-dungtq/gflow-studio.git@main" && uvx --from "git+https://github.com/abm-dungtq/gflow-studio.git@main" playwright install chromium', 1);
  console.log(`OK   ${v.stdout.trim()}`);
  const a = spawnSync(BIN, ["auth", "status", ...(o.profile ? ["--profile", o.profile] : [])], { encoding: "utf8" });
  // gflow mixes structlog JSON lines into its output; keep only the human-readable ones.
  const text = `${a.stdout}${a.stderr}`.split("\n").filter((l) => l.trim() && !l.trim().startsWith("{")).join("\n");
  if (a.status !== 0 || /no profiles|not logged|expired/i.test(text)) {
    console.log(`FAIL đăng nhập Flow: ${text.split("\n").slice(-2).join(" ")}`);
    console.log("     Chạy: gflow auth login --browser chrome" + (o.profile ? ` --profile ${o.profile}` : ""));
    process.exit(1);
  }
  console.log(`OK   đăng nhập Flow: ${text.split("\n").slice(-1)[0]}`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  const o = parseArgs(rest);
  if (cmd === "doctor") doctor(o);
  else if (cmd === "image" || cmd === "video") generate(cmd, o);
  else fail("lệnh: doctor | image | video (xem đầu file)");
}
