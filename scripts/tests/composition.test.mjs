// composition.mjs: index.html from the skeleton, sized from --aspect or BRIEF.md, never overwritten.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aspectKey, sizeSkeleton, SKELETON, main } from "../composition.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "composition-"));
const capture = () => {
  const buf = { out: "", err: "" };
  return { buf, io: { out: (s) => { buf.out += s; }, err: (s) => { buf.err += s; } } };
};
const rootSize = (html) => {
  const tag = html.match(/<div id="root"[^>]*>/)[0];
  return [Number(tag.match(/data-width="(\d+)"/)[1]), Number(tag.match(/data-height="(\d+)"/)[1])];
};

test("aspectKey: 16:9, 9:16, both → 16:9, empty → 16:9, unknown → null", () => {
  assert.equal(aspectKey("16:9"), "16:9");
  assert.equal(aspectKey("9x16"), "9:16");
  assert.equal(aspectKey("both"), "16:9");
  assert.equal(aspectKey(undefined), "16:9");
  assert.equal(aspectKey("1:1"), null);
});

test("skeleton: TIMING markers once each, default TIMING, timeline registered", () => {
  const html = readFileSync(SKELETON, "utf8");
  assert.equal(html.split("\n").filter((l) => l.includes("TIMING:BEGIN")).length, 1);
  assert.equal(html.split("\n").filter((l) => l.includes("TIMING:END")).length, 1);
  assert.match(html, /window\.TIMING = \{fps:30, duration:10, scenes:\{\}, beat0:0, beatLen:0, kick:\[\], drops:\[\]\};/);
  assert.match(html, /window\.__timelines\["main"\] = tl;/);
  assert.match(html, /<html[^>]*data-ratio="16x9"/);
});

test("skeleton: no audio tag inside comments, so lint finds no missing audio src", () => {
  const html = readFileSync(SKELETON, "utf8");
  for (const c of html.match(/<!--[\s\S]*?-->/g)) assert.doesNotMatch(c, /<audio/);
});

test("skeleton: empty LEMO markers once each, layer markers inside #bg", () => {
  const html = readFileSync(SKELETON, "utf8");
  for (const m of ["/* LEMO:BEGIN */", "/* LEMO:END */", "<!-- LEMO-LAYER:BEGIN -->", "<!-- LEMO-LAYER:END -->"]) {
    assert.equal(html.split(m).length - 1, 1, m);
  }
  assert.match(html, /\/\* LEMO:BEGIN \*\/\s*\/\* LEMO:END \*\//);
  assert.match(html, /<div id="bg" class="layer">\s*<!-- LEMO-LAYER:BEGIN -->\s*<!-- LEMO-LAYER:END -->\s*<\/div>/);
  assert.ok(html.indexOf("/* LEMO:BEGIN */") > html.indexOf("const winStart"), "bridge block needs WINDOWS and winStart");
  assert.ok(html.indexOf("/* LEMO:END */") < html.indexOf('tl.set({}, {}, T.duration)'), "bridge block sits inside the timeline script");
});

test("sizeSkeleton: 9:16 sets root, ratio, resolution, viewport and CSS frame", () => {
  const html = sizeSkeleton(readFileSync(SKELETON, "utf8"), "9:16");
  assert.deepEqual(rootSize(html), [1080, 1920]);
  assert.match(html, /<html[^>]*data-ratio="9x16"/);
  assert.match(html, /<html[^>]*data-resolution="portrait"/);
  assert.match(html, /content="width=1080, height=1920"/);
  assert.match(html, /--W: 1080px; --H: 1920px/);
});

test("init --aspect 9:16 writes a 1080x1920 index.html", () => {
  const dir = tmp();
  try {
    const { buf, io } = capture();
    assert.equal(main(["init", "--project", dir, "--aspect", "9:16"], io), 0, buf.err);
    assert.deepEqual(rootSize(readFileSync(join(dir, "index.html"), "utf8")), [1080, 1920]);
    assert.match(buf.out, /1080x1920/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("init reads aspect from BRIEF.md; both starts at 16:9", () => {
  const dir = tmp();
  try {
    writeFileSync(join(dir, "BRIEF.md"), "---\naspect: 9:16\n---\n# Brief\n");
    assert.equal(main(["init", "--project", dir], capture().io), 0);
    assert.deepEqual(rootSize(readFileSync(join(dir, "index.html"), "utf8")), [1080, 1920]);
    rmSync(join(dir, "index.html"));
    writeFileSync(join(dir, "BRIEF.md"), "---\naspect: both\n---\n");
    assert.equal(main(["init", "--project", dir], capture().io), 0);
    assert.deepEqual(rootSize(readFileSync(join(dir, "index.html"), "utf8")), [1920, 1080]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("init refuses to overwrite index.html (exit 1, file untouched)", () => {
  const dir = tmp();
  try {
    writeFileSync(join(dir, "index.html"), "mine");
    const { buf, io } = capture();
    assert.equal(main(["init", "--project", dir, "--aspect", "16:9"], io), 1);
    assert.match(buf.err, /index\.html đã có; không ghi đè/);
    assert.equal(readFileSync(join(dir, "index.html"), "utf8"), "mine");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("bad usage exits 2 without writing", () => {
  const dir = tmp();
  try {
    assert.equal(main([], capture().io), 2);
    assert.equal(main(["make", "--project", dir], capture().io), 2);
    assert.equal(main(["init"], capture().io), 2);
    assert.equal(main(["init", "--project", dir, "--aspect", "1:1"], capture().io), 2);
    assert.equal(main(["init", "--project", join(dir, "nope")], capture().io), 2);
    assert.equal(existsSync(join(dir, "index.html")), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
