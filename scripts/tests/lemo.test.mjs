// lemo.mjs: lemo-opuscar canvas layer added to and removed from a skeleton project, offline,
// against a fake cache laid out like the one `lemo.mjs fetch` makes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CATALOG, MARK, main, repoDir, sparsePaths, threeDir } from "../lemo.mjs";
import { main as compositionMain } from "../composition.mjs";

const cat = JSON.parse(readFileSync(CATALOG, "utf8"));
const put = (file, text) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); };

// Fake cache: every catalog path, a paper.py that writes paper.jpg with the stdlib, and three.
function fakeCache() {
  const home = mkdtempSync(join(tmpdir(), "lemo-cache-"));
  const repo = repoDir(home, cat);
  for (const p of sparsePaths(cat)) put(join(repo, p), `// ${p}\n`);
  for (const s of Object.values(cat.styles)) if (s.paper) put(join(repo, s.paper), "open('paper.jpg', 'wb').write(b'jpg')\n");
  const three = threeDir(home, cat);
  put(join(three, "package.json"), "{}");
  put(join(three, "LICENSE"), "MIT three");
  put(join(three, "build", "three.module.js"), "export {};\n");
  for (const a of cat.styles["glass-product"].three_addons) put(join(three, "examples", "jsm", a, "x.js"), "export {};\n");
  return home;
}

function project() {
  const dir = mkdtempSync(join(tmpdir(), "lemo-proj-"));
  assert.equal(compositionMain(["init", "--project", dir, "--aspect", "16:9"], { out() {}, err() {} }), 0);
  return dir;
}

const lemo = (args, home) => {
  const buf = { out: "", err: "" };
  const code = main(args, { out: (s) => { buf.out += s; }, err: (s) => { buf.err += s; }, env: { LEMO_OPUSCAR_HOME: home }, python: "python3" });
  return { code, ...buf };
};

const home = fakeCache();
test.after(() => rmSync(home, { recursive: true, force: true }));

test("catalog: pinned sha, three version, every style names kind, files, guide and status", () => {
  assert.match(cat.sha, /^[0-9a-f]{40}$/);
  assert.match(cat.three, /^\d+\.\d+\.\d+$/);
  for (const [slug, s] of Object.entries(cat.styles)) {
    assert.ok(["2d", "3d"].includes(s.kind), slug);
    assert.ok(s.files.length && s.guide, slug);
    assert.ok(["verified", "untested"].includes(s.status), slug);
  }
});

test("add watercolor: engine, paper, credits, layer and bridge; remove restores the skeleton", () => {
  const dir = project();
  try {
    const before = readFileSync(join(dir, "index.html"), "utf8");
    const r = lemo(["add", "--project", dir, "--style", "watercolor"], home);
    assert.equal(r.code, 0, r.err);
    const lemoDir = join(dir, "assets", "lemo");
    for (const f of ["engine.js", "plants.js", "paper.jpg", "scene.js", "LICENSE-lemo-opuscar", "CREDITS"]) assert.ok(existsSync(join(lemoDir, f)), f);
    assert.ok(readFileSync(join(lemoDir, "CREDITS"), "utf8").includes(cat.sha));
    const html = readFileSync(join(dir, "index.html"), "utf8");
    assert.match(html, /<!-- lemo-style: watercolor -->/);
    assert.match(html, /<canvas id="wc" width="1920" height="1080"><\/canvas>/);
    assert.ok(html.indexOf('src="assets/lemo/engine.js"') < html.indexOf('src="assets/lemo/scene.js"'));
    assert.ok(html.indexOf('src="assets/lemo/scene.js"') < html.indexOf("/* TIMING:BEGIN */"), "2D scripts run before the timeline script");
    assert.match(html, /window\.__lemoWin = win;/);
    assert.match(html, /onUpdate: seekLemo/);
    assert.doesNotMatch(html, /importmap/);

    writeFileSync(join(lemoDir, "scene.js"), "// my scene\n");
    const rm = lemo(["remove", "--project", dir], home);
    assert.equal(rm.code, 0, rm.err);
    assert.equal(readFileSync(join(dir, "index.html"), "utf8"), before);
    assert.equal(readFileSync(join(lemoDir, "scene.js"), "utf8"), "// my scene\n", "remove keeps the user's scene");
    for (const f of ["engine.js", "plants.js", "paper.jpg", "CREDITS"]) assert.ok(!existsSync(join(lemoDir, f)), f);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("add glass-product: three under assets/three, importmap then module, scene3d started", () => {
  const dir = project();
  try {
    const r = lemo(["add", "--project", dir, "--style", "glass-product"], home);
    assert.equal(r.code, 0, r.err);
    for (const f of ["assets/three/lib/three.module.js", "assets/three/LICENSE-three", "assets/three/addons/postprocessing/x.js", "assets/lemo/post.js", "assets/lemo/studio.js", "assets/lemo/scene3d.js"]) {
      assert.ok(existsSync(join(dir, f)), f);
    }
    const html = readFileSync(join(dir, "index.html"), "utf8");
    const map = html.indexOf('type="importmap"'), mod = html.indexOf('type="module" src="assets/lemo/scene3d.js"');
    assert.ok(map > 0 && mod > map, "importmap precedes the module");
    assert.doesNotMatch(html, /id="wc"/);
    assert.equal(lemo(["remove", "--project", dir], home).code, 0);
    assert.ok(!existsSync(join(dir, "assets", "three")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("add twice needs --force; --force keeps the user's scene", () => {
  const dir = project();
  try {
    assert.equal(lemo(["add", "--project", dir, "--style", "watercolor"], home).code, 0);
    writeFileSync(join(dir, "assets", "lemo", "scene.js"), "// mine\n");
    assert.equal(lemo(["add", "--project", dir, "--style", "watercolor"], home).code, 5);
    const r = lemo(["add", "--project", dir, "--style", "watercolor", "--force"], home);
    assert.equal(r.code, 0, r.err);
    assert.equal(readFileSync(join(dir, "assets", "lemo", "scene.js"), "utf8"), "// mine\n");
    const html = readFileSync(join(dir, "index.html"), "utf8");
    assert.equal(html.split("lemo-style:").length, 2, "one layer after --force");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("exit codes: unknown style 2, markers missing 3, empty cache 4, bad usage 2", () => {
  const dir = project();
  const empty = mkdtempSync(join(tmpdir(), "lemo-empty-"));
  try {
    assert.equal(lemo(["add", "--project", dir, "--style", "nope"], home).code, 2);
    assert.equal(lemo(["add", "--project", dir], home).code, 2);
    assert.equal(lemo(["list", "--force"], home).code, 2);
    assert.equal(lemo(["add", "--project", dir, "--style", "watercolor"], empty).code, 4);
    const file = join(dir, "index.html");
    writeFileSync(file, readFileSync(file, "utf8").replace(MARK.bridge[0], ""));
    const r = lemo(["add", "--project", dir, "--style", "watercolor"], home);
    assert.equal(r.code, 3);
    assert.match(r.err, /LEMO:BEGIN/);
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(empty, { recursive: true, force: true }); }
});

test("list --json: every catalog style with kind and status", () => {
  const r = lemo(["list", "--json"], home);
  assert.equal(r.code, 0);
  const rows = JSON.parse(r.out);
  assert.deepEqual(rows.map((x) => x.slug), Object.keys(cat.styles));
  assert.ok(rows.every((x) => x.kind && x.status));
});
