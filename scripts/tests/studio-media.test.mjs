import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer } from "../../studio/server.mjs";
import { browse, register, readMedia } from "../../studio/media.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/manifest", import.meta.url));
const TOKEN = "m".repeat(64);
// home stands in for the user's home (a browse root); root is the workspace inside it.
let home, root, dir, outside, server, port;
const noProbe = async () => null;

before(async () => {
  home = realpathSync(mkdtempSync(join(tmpdir(), "studio-home-")));
  root = join(home, "ws");
  dir = join(root, "demo");
  outside = join(home, "Downloads");
  mkdirSync(root);
  cpSync(FIXTURE, dir, { recursive: true });
  mkdirSync(join(root, "footage", "raw"), { recursive: true });
  mkdirSync(join(outside, "sub"), { recursive: true });
  mkdirSync(join(outside, ".hidden"));
  writeFileSync(join(outside, "clip.MP4"), "A");
  writeFileSync(join(outside, "notes.txt"), "x");
  writeFileSync(join(outside, "sub", "clip.MP4"), "B");
  writeFileSync(join(root, "footage", "raw", "in-place.mov"), "C");
  writeFileSync(join(root, "footage", "raw", "clip.MP4"), "already here");
  symlinkSync("/etc", join(home, "etc-link"));
  server = createServer({ root, token: TOKEN, runtime: null, mediaRoots: [home] });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
after(() => { server.closeAllConnections?.(); server.close(); rmSync(home, { recursive: true, force: true }); });

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

test("browse lists folders and media only; outside the roots is 403", async () => {
  const r = await http("GET", `/api/media/browse?path=${encodeURIComponent(outside)}`);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.entries.map((e) => [e.name, e.type]), [["sub", "dir"], ["clip.MP4", "file"]]);
  assert.equal(r.json.entries[1].size, 1);
  assert.equal(r.json.parent, home);
  assert.equal((await http("GET", `/api/media/browse?path=${encodeURIComponent(home)}`)).json.parent, null);
  assert.equal((await http("GET", "/api/media/browse?path=/etc/passwd")).status, 403);
  assert.equal((await http("GET", `/api/media/browse?path=${encodeURIComponent(join(home, "etc-link"))}`)).status, 403);
  // The default roots (home, /Volumes) refuse /etc as well.
  assert.throws(() => browse("/etc"), { status: 403 });
});

test("register refuses /etc/passwd, a symlink to /etc and a .txt", async () => {
  assert.equal((await http("POST", "/api/media/register", { name: "demo", src: "/etc/passwd" })).status, 403);
  assert.equal((await http("POST", "/api/media/register", { name: "demo", src: join(home, "etc-link", "hosts") })).status, 403);
  assert.equal((await http("POST", "/api/media/register", { name: "demo", src: join(outside, "notes.txt") })).status, 400);
  assert.equal((await http("POST", "/api/media/register", { name: "demo", src: join(outside, "nope.mp4") })).status, 404);
  await assert.rejects(register(root, dir, "/etc/passwd", { probeFn: noProbe }), { status: 403 });
});

test("a file outside the workspace is copied to footage/raw with -2 when the name is taken", async () => {
  const r = await http("POST", "/api/media/register", { name: "demo", src: join(outside, "clip.MP4") });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.copied, true);
  assert.equal(r.json.media.path, join(root, "footage", "raw", "clip-2.MP4"));
  assert.equal(r.json.media.rel, "footage/raw/clip-2.MP4");
  assert.equal(r.json.media.kind, "video");
  assert.equal(readFileSync(join(root, "footage", "raw", "clip.MP4"), "utf8"), "already here");
  assert.equal(readFileSync(r.json.media.path, "utf8"), "A");
  // Not a real video: ffprobe fails, the file is registered anyway.
  assert.equal(r.json.media.probe, null);
  const second = await register(root, dir, join(outside, "sub", "clip.MP4"), { roots: [home], probeFn: noProbe });
  assert.equal(second.media.path, join(root, "footage", "raw", "clip-3.MP4"));
  assert.equal(second.media.id, "m2");
});

test("a file inside footage/ is used in place; registering again does not duplicate", async () => {
  const src = join(root, "footage", "raw", "in-place.mov");
  const a = await register(root, dir, src, { roots: [home], probeFn: async () => ({ duration: 2.5, width: 1920, height: 1080, codec: "h264" }) });
  assert.equal(a.copied, false);
  assert.equal(a.media.path, src);
  assert.equal(a.media.duration, 2.5);
  assert.equal(a.media.width, 1920);
  assert.ok(!existsSync(join(root, "footage", "raw", "in-place-2.mov")));
  const n = readMedia(dir).length;
  const again = await http("POST", "/api/media/register", { name: "demo", src });
  assert.equal(again.status, 200);
  assert.equal(again.json.existing, true);
  assert.equal(again.json.media.id, a.media.id);
  const copiedAgain = await http("POST", "/api/media/register", { name: "demo", src: join(outside, "clip.MP4") });
  assert.equal(copiedAgain.json.existing, true);
  assert.ok(!existsSync(join(root, "footage", "raw", "clip-4.MP4")));
  const list = (await http("GET", "/api/media?name=demo")).json;
  assert.equal(list.length, n);
  assert.deepEqual(list.map((m) => m.id), ["m1", "m2", "m3"]);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, ".opus", "media.json"), "utf8")), list);
});

test("register needs the token", async () => {
  const r = await new Promise((res) => {
    const data = JSON.stringify({ name: "demo", src: join(outside, "clip.MP4") });
    const req = request({ host: "127.0.0.1", port, method: "POST", path: "/api/media/register", headers: { host: `127.0.0.1:${port}`, "content-type": "application/json" } }, (x) => { x.resume(); x.on("end", () => res(x.statusCode)); });
    req.end(data);
  });
  assert.equal(r, 403);
});
