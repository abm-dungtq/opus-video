// studio/server.mjs — Motion Studio HTTP server (node:http, Node built-ins only). Started by
// scripts/studio.mjs; createServer({ root, token }) is exported for tests (listen on port 0).
// Every edit goes through scripts/gateway.mjs as actor "human". Security:
// - bind 127.0.0.1 only (the caller listens); any Host other than 127.0.0.1:<port> or
//   localhost:<port> is 403 (DNS rebinding);
// - a POST with an Origin that is not this origin is 403; a POST without the X-Studio-Token of
//   this run is 403. GET / injects the token into the page, so the token keeps out web pages and
//   other users, not processes of the same user (those can read the page or studio.json anyway:
//   same-user processes are inside the trust boundary);
// - project names match ^[A-Za-z0-9._-]+$ (else 400); /p/<name>/<path> serves only files whose
//   realpath is inside the project, never .env, .git, .opus/lock or other dotfiles outside .opus/;
// - the server never reads ~/.config/opus-video/.env.
// Writes wait at most LOCK_WAIT_MS for the project lock and answer 503 "đang bận" when busy, so
// one contended write never stalls SSE or the player.
import { createServer as httpServer } from "node:http";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync, watch, createReadStream } from "node:fs";
import { execFile, execFileSync } from "node:child_process";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "../scripts/manifest.mjs";
import { patch, undo, readHistory, EXIT } from "../scripts/gateway.mjs";
import { list as listRequests } from "../scripts/requests.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC = join(HERE, "public");
const SCRIPTS = fileURLToPath(new URL("../scripts/", import.meta.url));
const DIRECTIONS = fileURLToPath(new URL("../data/directions.json", import.meta.url));
export const NAME = /^[A-Za-z0-9._-]+$/;
const LOCK_WAIT_MS = 300;
const BODY_MAX = 1 << 20;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".md": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
};
const STATUS = { [EXIT.conflict]: 409, [EXIT.viewOnly]: 423, [EXIT.invalid]: 422, [EXIT.nothingToUndo]: 422, [EXIT.busy]: 503, [EXIT.usage]: 400 };

// The HyperFrames runtime (studio/PLAYER.md): $OPUS_HF_RUNTIME, the project's own install, then
// the global npm root and the usual global prefixes.
let npmRoot;
export function findRuntime(projectDir) {
  const nm = "node_" + "modules";
  const rel = join("hyperframes", "dist", "hyperframe.runtime.iife.js");
  if (npmRoot === undefined) {
    try { npmRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).trim(); } catch { npmRoot = null; }
  }
  const cands = [process.env.OPUS_HF_RUNTIME, projectDir && join(projectDir, nm, rel), npmRoot && join(npmRoot, rel),
    ...["/opt/homebrew/lib", "/usr/local/lib", "/usr/lib"].map((d) => join(d, nm, rel))];
  return cands.find((c) => c && existsSync(c)) ?? null;
}

const run = (script, args) => new Promise((res) => {
  execFile(process.execPath, [join(SCRIPTS, script), ...args], { encoding: "utf8", timeout: 60000, maxBuffer: 32 << 20 }, (err, stdout, stderr) => res({ code: err ? (err.code ?? 1) : 0, stdout, stderr }));
});

function projectsOf(root) {
  const out = [];
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith(".") || !NAME.test(e.name)) continue;
    const dir = join(root, e.name);
    if (existsSync(join(dir, "project.json"))) {
      let m = null;
      try { m = load(dir); } catch { /* broken manifest: listed, not editable */ }
      out.push({ name: e.name, title: m?.title ?? e.name, has_manifest: true, editable: Boolean(m?.capabilities?.editable), version: m?.version ?? null });
    } else if (existsSync(join(dir, "index.html")) && existsSync(join(dir, "BRIEF.md"))) {
      out.push({ name: e.name, title: e.name, has_manifest: false, editable: false, version: null });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// /p/<name>/<rel>: a file inside the project, or a reason it is refused.
export function projectFile(projectDir, rel) {
  const parts = rel.split("/").filter((p) => p !== "");
  if (!parts.length) parts.push("index.html");
  if (parts.some((p) => p === ".." || p === ".")) return { status: 403 };
  const dot = parts.findIndex((p) => p.startsWith("."));
  if (dot >= 0 && !(dot === 0 && parts[0] === ".opus" && parts.slice(1).every((p) => !p.startsWith(".")) && parts.length > 1 && parts[1] !== "lock")) return { status: 403 };
  if (parts.some((p) => p === ".env" || p === ".git")) return { status: 403 };
  const f = join(projectDir, ...parts);
  if (!existsSync(f)) return { status: 404 };
  let real;
  try { real = realpathSync(f); } catch { return { status: 404 }; }
  const base = realpathSync(projectDir);
  if (real !== base && !real.startsWith(base + sep)) return { status: 403 };
  if (statSync(real).isDirectory()) return { status: 404 };
  return { file: real, parts };
}

export function createServer({ root, token, runtime = undefined }) {
  root = realpathSync(resolve(root));
  const runtimeFor = (dir) => (runtime === undefined ? findRuntime(dir) : runtime);
  const watchers = new Map(); // name → { clients:Set, close() }
  let port = 0;

  const send = (res, status, body, headers = {}) => {
    const isStr = typeof body === "string" || Buffer.isBuffer(body);
    res.writeHead(status, { "content-type": isStr ? "text/plain; charset=utf-8" : "application/json; charset=utf-8", "x-content-type-options": "nosniff", "cache-control": "no-store", ...headers });
    res.end(isStr ? body : JSON.stringify(body));
  };
  const projectDir = (name) => {
    if (typeof name !== "string" || !NAME.test(name) || name === "." || name === "..") return { status: 400, error: "tên dự án không hợp lệ" };
    const dir = join(root, name);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return { status: 404, error: `không có dự án ${name}` };
    return { dir };
  };
  const withManifest = (name) => {
    const p = projectDir(name);
    if (p.error) return p;
    if (!existsSync(join(p.dir, "project.json"))) return { status: 404, error: `${name} chưa có project.json — bấm Nhập dự án` };
    return p;
  };
  const body = (req) => new Promise((res, rej) => {
    let n = 0; const chunks = [];
    req.on("data", (c) => { n += c.length; if (n > BODY_MAX) { rej(Object.assign(new Error("body quá lớn"), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { res(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch { rej(Object.assign(new Error("JSON không hợp lệ"), { status: 400 })); } });
    req.on("error", rej);
  });
  const gatewayReply = (res, r) => (r.code ? send(res, STATUS[r.code] ?? 500, { error: r.error }) : send(res, 200, { version: r.version, receipt: r.receipt, lines: r.lines ?? [], warnings: r.warnings ?? [] }));

  function serveFile(req, res, file, { inject = null } = {}) {
    const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
    if (inject) {
      const html = readFileSync(file, "utf8");
      const out = html.includes("</body>") ? html.replace(/<\/body>(?![\s\S]*<\/body>)/, `${inject}</body>`) : html + inject;
      return send(res, 200, out, { "content-type": type });
    }
    const size = statSync(file).size;
    const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
    const head = { "content-type": type, "accept-ranges": "bytes", "x-content-type-options": "nosniff", "cache-control": "no-store" };
    if (range && (range[1] || range[2])) {
      let a = range[1] ? Number(range[1]) : size - Number(range[2]);
      let b = range[1] && range[2] ? Number(range[2]) : size - 1;
      a = Math.max(0, a); b = Math.min(size - 1, b);
      if (a > b) { res.writeHead(416, { "content-range": `bytes */${size}` }); return res.end(); }
      res.writeHead(206, { ...head, "content-range": `bytes ${a}-${b}/${size}`, "content-length": b - a + 1 });
      return createReadStream(file, { start: a, end: b }).pipe(res);
    }
    res.writeHead(200, { ...head, "content-length": size });
    createReadStream(file).pipe(res);
  }

  // SSE: one directory watcher pair per project, filtered by file name, debounced 100 ms.
  function subscribe(name, dir, res) {
    let w = watchers.get(name);
    if (!w) {
      const clients = new Set();
      const timers = {};
      const emit = (event, data) => { for (const c of clients) c.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
      const later = (event, fn) => { clearTimeout(timers[event]); timers[event] = setTimeout(() => { try { emit(event, fn()); } catch { /* mid-write; next event follows */ } }, 100); };
      const fsw = [];
      try { fsw.push(watch(dir, (_, f) => { if (f === "project.json") later("manifest", () => load(dir)); })); } catch { /* unwatchable */ }
      const opus = join(dir, ".opus");
      const watchOpus = () => {
        try { fsw.push(watch(opus, { recursive: true }, (_, f) => { const p = String(f ?? "").split(sep).join("/"); if (p.startsWith("requests/") && p.endsWith(".json")) later("request", () => listRequests(dir)); })); return true; } catch { return false; }
      };
      if (!(existsSync(opus) && watchOpus())) {
        // .opus appears with the first gateway write or request: start watching it then.
        const t = setInterval(() => { if (existsSync(opus) && watchOpus()) clearInterval(t); }, 1000);
        fsw.push({ close: () => clearInterval(t) });
      }
      const ping = setInterval(() => { for (const c of clients) c.write(": ping\n\n"); }, 25000);
      w = { clients, close: () => { clearInterval(ping); for (const t of Object.values(timers)) clearTimeout(t); fsw.forEach((x) => x.close()); } };
      watchers.set(name, w);
    }
    res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive", "x-content-type-options": "nosniff" });
    res.write(": ok\n\n");
    w.clients.add(res);
    res.on("close", () => { w.clients.delete(res); if (!w.clients.size) { w.close(); watchers.delete(name); } });
  }

  async function route(req, res) {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const p = url.pathname;
    const q = (k) => url.searchParams.get(k);
    if (req.method === "GET") {
      if (p === "/" || p === "/index.html") {
        const html = readFileSync(join(PUBLIC, "index.html"), "utf8").replace("__STUDIO_TOKEN__", token);
        return send(res, 200, html, { "content-type": TYPES[".html"] });
      }
      if (/^\/[a-z-]+\.(js|css)$/.test(p) && existsSync(join(PUBLIC, p.slice(1)))) return serveFile(req, res, join(PUBLIC, p.slice(1)));
      if (p === "/hf/runtime.js") {
        const name = q("name");
        const pd = name ? projectDir(name) : {};
        const rt = runtimeFor(pd.dir ?? null);
        return rt ? serveFile(req, res, rt) : send(res, 404, "không tìm thấy HyperFrames runtime (cài hyperframes)");
      }
      const m = p.match(/^\/p\/([^/]+)\/(.*)$/);
      if (m) {
        let name, rel;
        try { name = decodeURIComponent(m[1]); rel = decodeURIComponent(m[2]); } catch { return send(res, 400, "đường dẫn không hợp lệ"); }
        const pd = projectDir(name);
        if (pd.error) return send(res, pd.status, pd.error);
        const f = projectFile(pd.dir, rel);
        if (!f.file) return send(res, f.status, f.status === 403 ? "không được phép" : "không có file");
        const isRootIndex = f.parts.length === 1 && f.parts[0] === "index.html";
        return serveFile(req, res, f.file, isRootIndex ? { inject: `<script src="/hf/runtime.js?name=${encodeURIComponent(name)}"></script>` } : {});
      }
      if (p === "/api/projects") return send(res, 200, projectsOf(root));
      if (p === "/api/project") { const pd = withManifest(q("name")); return pd.error ? send(res, pd.status, { error: pd.error }) : send(res, 200, load(pd.dir)); }
      if (p === "/api/log") { const pd = withManifest(q("name")); return pd.error ? send(res, pd.status, { error: pd.error }) : send(res, 200, readHistory(pd.dir)); }
      if (p === "/api/requests") { const pd = withManifest(q("name")); return pd.error ? send(res, pd.status, { error: pd.error }) : send(res, 200, listRequests(pd.dir)); }
      if (p === "/api/files") {
        const pd = projectDir(q("name"));
        if (pd.error) return send(res, pd.status, { error: pd.error });
        const sub = q("dir");
        if (!["assets", "renders"].includes(sub)) return send(res, 400, { error: "dir phải là assets hoặc renders" });
        const base = join(pd.dir, sub);
        const files = [];
        const walk = (d, rel) => {
          if (files.length >= 500 || !existsSync(d)) return;
          for (const e of readdirSync(d, { withFileTypes: true })) {
            if (e.name.startsWith(".")) continue;
            const r = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) walk(join(d, e.name), r);
            else files.push({ path: `${sub}/${r}`, size: statSync(join(d, e.name)).size });
          }
        };
        walk(base, "");
        return send(res, 200, files);
      }
      if (p === "/api/directions") {
        const d = JSON.parse(readFileSync(DIRECTIONS, "utf8"));
        return send(res, 200, { seams: Object.keys(d.seams ?? {}), directions: d.directions.map((x) => ({ id: x.id, ten_vi: x.ten_vi, mo_ta_vi: x.mo_ta_vi, seams: x.seams })) });
      }
      if (p === "/api/cases") {
        const args = ["--json", "--limit", "12", "--max-chars", "600"];
        for (const k of String(q("q") ?? "").split(/\s+/).filter(Boolean).slice(0, 6)) args.push("--keyword", k);
        const cat = q("category");
        if (cat) { if (!/^[a-z-]+$/.test(cat)) return send(res, 400, { error: "category không hợp lệ" }); args.push("--category", cat); }
        const r = await run("find-cases.mjs", args);
        return r.code ? send(res, 200, []) : send(res, 200, JSON.parse(r.stdout || "[]"));
      }
      if (p === "/api/styles") {
        const r = await run("styles.mjs", ["find", String(q("q") ?? "").slice(0, 200) || "minimal", "--json"]);
        try { return send(res, 200, JSON.parse(r.stdout || "[]")); } catch { return send(res, 200, []); }
      }
      if (p === "/api/events") {
        const pd = withManifest(q("name"));
        if (pd.error) return send(res, pd.status, { error: pd.error });
        return subscribe(q("name"), pd.dir, res);
      }
      return send(res, 404, { error: "không có" });
    }
    if (req.method === "POST") {
      if (req.headers["x-studio-token"] !== token) return send(res, 403, { error: "thiếu X-Studio-Token" });
      const b = await body(req);
      if (p === "/api/import") {
        const pd = projectDir(b.name);
        if (pd.error) return send(res, pd.status, { error: pd.error });
        const r = await run("manifest-import.mjs", ["--project", pd.dir, "--write"]);
        if (r.code === 6) return send(res, 409, { error: "dự án đã có project.json" });
        if (r.code === 8) return send(res, 503, { error: "đang bận, thử lại sau" });
        return r.code ? send(res, 422, { error: (r.stderr || r.stdout).trim() }) : send(res, 200, { ok: true, output: r.stdout.trim() });
      }
      if (p === "/api/patch") {
        const pd = withManifest(b.name);
        if (pd.error) return send(res, pd.status, { error: pd.error });
        if (!Number.isInteger(b.base) || !Array.isArray(b.ops) || !b.ops.length) return send(res, 400, { error: "cần base (số) và ops (mảng)" });
        return gatewayReply(res, patch(pd.dir, { actor: "human", base: b.base, ops: b.ops, lockWaitMs: LOCK_WAIT_MS }));
      }
      if (p === "/api/undo") {
        const pd = withManifest(b.name);
        if (pd.error) return send(res, pd.status, { error: pd.error });
        if (!Number.isInteger(b.base)) return send(res, 400, { error: "cần base (số)" });
        return gatewayReply(res, undo(pd.dir, { base: b.base, lockWaitMs: LOCK_WAIT_MS }));
      }
      return send(res, 404, { error: "không có" });
    }
    return send(res, 405, { error: "method không hỗ trợ" });
  }

  const server = httpServer(async (req, res) => {
    port = server.address()?.port ?? port;
    const host = String(req.headers.host ?? "");
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return send(res, 403, "Host không hợp lệ");
    if (req.method === "POST" && req.headers.origin && req.headers.origin !== `http://${host}`) return send(res, 403, { error: "Origin không hợp lệ" });
    // URL parsing folds "/a/../b"; refuse any dot segment in the raw path before it does.
    let raw = String(req.url).split("?")[0];
    try { raw = decodeURIComponent(raw); } catch { return send(res, 400, "đường dẫn không hợp lệ"); }
    if (/(^|\/)\.\.?(\/|$)/.test(raw) || raw.includes("\\")) return send(res, 403, "không được phép");
    try { await route(req, res); } catch (e) {
      if (!res.headersSent) send(res, e.status ?? 500, { error: e.message });
      else res.end();
    }
  });
  server.on("close", () => { for (const w of watchers.values()) w.close(); watchers.clear(); });
  return server;
}
