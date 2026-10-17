import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { createServer } from "../../studio/server.mjs";
import { createProject, setFrontmatter } from "../../studio/create.mjs";

const TOKEN = "c".repeat(64);
// Stands in for the workspace's new-project.sh: the folder with an index.html that has the
// timing block (as composition.mjs init writes it) and a BRIEF.md with frontmatter.
const FAKE = `#!/usr/bin/env bash
set -euo pipefail
name="$1"; aspect="16:9"; dur=30
shift
while [[ $# -gt 0 ]]; do case "$1" in --aspect) aspect="$2"; shift 2;; --duration) dur="$2"; shift 2;; *) shift;; esac; done
[[ "$name" == fail-* ]] && { echo "boom: cannot scaffold" >&2; exit 3; }
dir="$name"; [[ "$aspect" == "9:16" ]] && dir="$name-9x16"
mkdir -p "$dir"
cat > "$dir/index.html" <<EOF
<!doctype html><html><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="$dur" data-width="1920" data-height="1080">
<script>
/* TIMING:BEGIN */
const T = {};
/* TIMING:END */
</script>
</div></body></html>
EOF
printf -- '---\\naspect: %s\\nduration_s: %s\\nmode: old\\n---\\n\\n# Brief: %s\\n' "$aspect" "$dur" "$name" > "$dir/BRIEF.md"
`;
let root, bare, server, port, prevState;

before(async () => {
  prevState = process.env.OPUS_STUDIO_STATE;
  root = mkdtempSync(join(tmpdir(), "studio-create-"));
  bare = mkdtempSync(join(tmpdir(), "studio-bare-"));
  // runner mcp: a queued first request waits for a session instead of starting claude.
  writeFileSync(join(root, "studio.json"), JSON.stringify({ director: { runner: "mcp" } }));
  process.env.OPUS_STUDIO_STATE = join(root, "studio.json");
  mkdirSync(join(root, "scripts"));
  writeFileSync(join(root, "scripts", "new-project.sh"), FAKE, { mode: 0o755 });
  mkdirSync(join(root, "taken"));
  mkdirSync(join(root, "half-9x16"));
  server = createServer({ root, token: TOKEN, runtime: null });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
after(() => {
  server.closeAllConnections?.(); server.close();
  rmSync(root, { recursive: true, force: true }); rmSync(bare, { recursive: true, force: true });
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
const form = (o = {}) => ({ name: "clip-moi", aspect: "16:9", mode: "tu-dau", topic: "Giới thiệu\nsản phẩm", duration: 20, ...o });

test("a bad name, aspect, mode, topic or duration is 400", async () => {
  for (const bad of [{ name: "Clip" }, { name: "a" }, { name: "-x" }, { name: "a/b" }, { aspect: "4:3" }, { mode: "x" }, { topic: "" }, { topic: "x".repeat(501) }, { duration: 4 }, { duration: 601 }, { duration: 10.5 }]) {
    const r = await http("POST", "/api/projects/new", form(bad));
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
});

test("a name already in the workspace (or its -9x16 twin) is 409", async () => {
  assert.equal((await http("POST", "/api/projects/new", form({ name: "taken" }))).status, 409);
  assert.equal((await http("POST", "/api/projects/new", form({ name: "half" }))).status, 409);
});

test("creates an editable project with mode/topic in BRIEF and lists it", async () => {
  const r = await http("POST", "/api/projects/new", form({ audience: "chủ shop", first_request: "Dựng cảnh mở đầu" }));
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.name, "clip-moi");
  assert.equal(r.json.editable, true);
  const dir = join(root, "clip-moi");
  assert.ok(existsSync(join(dir, "project.json")));
  const brief = readFileSync(join(dir, "BRIEF.md"), "utf8");
  assert.match(brief, /^mode: tu-dau$/m);
  assert.doesNotMatch(brief, /^mode: old$/m);
  assert.match(brief, /^topic: Giới thiệu sản phẩm$/m);
  assert.match(brief, /^audience: chủ shop$/m);
  assert.match(brief, /^aspect: 16:9$/m);
  assert.doesNotMatch(brief, /^direction:/m);
  assert.equal(r.json.request.status, "queued");
  assert.equal(r.json.request.text, "Dựng cảnh mở đầu");
  const list = (await http("GET", "/api/projects")).json;
  const p = list.find((x) => x.name === "clip-moi");
  assert.equal(p.has_manifest, true);
  assert.equal(p.editable, true);
});

test("9:16 makes <name>-9x16; a failing script is 500 with its stderr tail", async () => {
  const r = await http("POST", "/api/projects/new", form({ name: "doc", aspect: "9:16" }));
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.name, "doc-9x16");
  assert.equal(r.json.request, null);
  const f = await http("POST", "/api/projects/new", form({ name: "fail-x" }));
  assert.equal(f.status, 500);
  assert.match(f.json.stderr, /boom: cannot scaffold/);
});

test("a workspace without scripts/new-project.sh is 501", async () => {
  const r = await createProject(bare, form());
  assert.equal(r.status, 501);
  assert.equal(r.body.error, "Workspace thiếu scripts/new-project.sh");
});

test("setFrontmatter replaces keys, appends new ones and adds a block when missing", () => {
  assert.equal(setFrontmatter("---\na: 1\nb: 2\n---\nbody\n", { b: "x", c: "y" }), "---\na: 1\nb: x\nc: y\n---\nbody\n");
  assert.equal(setFrontmatter("# t\n", { mode: "tu-dau" }), "---\nmode: tu-dau\n---\n\n# t\n");
});
