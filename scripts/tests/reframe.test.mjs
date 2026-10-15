// reframe.mjs: 9:16 / 1:1 edition of a ratio-aware 16:9 project, assets hard-linked, layout WARNs
// for 1920x1080 pixel values outside html[data-ratio] blocks, never overwriting a foreign directory.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { editionBrief, editionHtml, layoutWarnings, main, MARKER } from "../reframe.mjs";

const capture = () => {
  const buf = { out: "", err: "" };
  return { buf, io: { out: (s) => { buf.out += s; }, err: (s) => { buf.err += s; } } };
};

const INDEX = `<!DOCTYPE html>
<html lang="vi" data-resolution="landscape" data-ratio="16x9">
  <head>
    <meta name="viewport" content="width=1920, height=1080">
    <style>
      :root { --W: 1920px; --H: 1080px; }
      .wide { left: 1400px; width: 960px; }
      html[data-ratio="9x16"] .wide { left: 1200px; top: 1500px; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="10" data-width="1920" data-height="1080">
      <div class="abs" style="left: 120px; top: 380px">Tiêu đề</div>
    </div>
  </body>
</html>
`;

// A master project in a fresh temp parent; returns { parent, project }.
function master() {
  const parent = mkdtempSync(join(tmpdir(), "reframe-"));
  const project = join(parent, "demo");
  mkdirSync(join(project, "assets", "voice"), { recursive: true });
  mkdirSync(join(project, "compositions"), { recursive: true });
  mkdirSync(join(project, "renders"), { recursive: true });
  writeFileSync(join(project, "index.html"), INDEX);
  writeFileSync(join(project, "BRIEF.md"), "---\naspect: both\nbrief_version: 2\n---\n# Brief\n");
  writeFileSync(join(project, "PLAN.md"), "# PLAN\n");
  writeFileSync(join(project, "hyperframes.json"), "{}\n");
  writeFileSync(join(project, "package.json"), "{}\n");
  writeFileSync(join(project, "assets", "voice", "01.words.json"), "[]\n");
  writeFileSync(join(project, "compositions", "card.html"), '<div style="top: 200px">x</div>\n');
  writeFileSync(join(project, "renders", "old.txt"), "render\n");
  return { parent, project };
}

test("editionHtml: root size, data-ratio, data-resolution, viewport and --W/--H for each ratio", () => {
  const v = editionHtml(INDEX, "9x16");
  assert.match(v, /data-width="1080" data-height="1920"/);
  assert.match(v, /<html lang="vi" data-resolution="portrait" data-ratio="9x16">/);
  assert.match(v, /content="width=1080, height=1920"/);
  assert.match(v, /--W: 1080px; --H: 1920px;/);
  const s = editionHtml(INDEX, "1x1");
  assert.match(s, /data-width="1080" data-height="1080"/);
  assert.match(s, /data-resolution="square" data-ratio="1x1"/);
  const bare = editionHtml('<html><head></head><body><div data-composition-id="m" data-width="1920" data-height="1080"></div></body></html>', "9x16");
  assert.match(bare, /<html data-resolution="portrait" data-ratio="9x16">/);
  assert.match(bare, /--W: 1080px; --H: 1920px;/, "a master without --W/--H gets them");
  assert.throws(() => editionHtml("<html><body><div></div></body></html>", "9x16"), /composition gốc/);
});

test("editionBrief: aspect set, added when missing, a BRIEF without frontmatter unchanged", () => {
  assert.equal(editionBrief("---\naspect: both\nx: 1\n---\nbody aspect: both\n", "9x16"), "---\naspect: 9:16\nx: 1\n---\nbody aspect: both\n");
  assert.equal(editionBrief("---\nx: 1\n---\n", "1x1"), "---\naspect: 1:1\nx: 1\n---\n");
  assert.equal(editionBrief("# no frontmatter\n", "9x16"), "# no frontmatter\n");
});

test("layoutWarnings: px ≥ 1080 in CSS or style attributes outside html[data-ratio] blocks", () => {
  assert.deepEqual(layoutWarnings(INDEX), [{ line: 7, prop: "left", px: 1400 }]);
  assert.deepEqual(layoutWarnings('<p style="width: 1080px; max-width: 2000px; margin-left: 1500px">'), [{ line: 1, prop: "width", px: 1080 }]);
  assert.deepEqual(layoutWarnings("<p>left: 1400px in text</p>"), [], "text outside CSS is not layout");
});

test("9x16 edition: hard-linked assets, root 1080x1920, BRIEF aspect, one layout WARN, no renders", () => {
  const { parent, project } = master();
  try {
    const c = capture();
    assert.equal(main([project, "--ratio", "9x16"], c.io), 0, c.buf.err);
    const out = join(parent, "demo-9x16");
    const warns = c.buf.out.split("\n").filter((l) => l.startsWith("WARN  layout"));
    assert.deepEqual(warns, ["WARN  layout index.html:7 left: 1400px nằm ngoài khối html[data-ratio=…]; khung 9x16 chỉ rộng 1080px"]);
    assert.match(c.buf.out, /^OK {4}reframe 9x16 1080x1920 → .*demo-9x16 \(assets: 1 hard-link, 0 chép\)$/m);
    const html = readFileSync(join(out, "index.html"), "utf8");
    assert.match(html, /data-width="1080" data-height="1920"/);
    assert.match(html, /data-ratio="9x16"/);
    const a = join("assets", "voice", "01.words.json");
    assert.equal(statSync(join(out, a)).ino, statSync(join(project, a)).ino, "asset is a hard link to the master file");
    assert.match(readFileSync(join(out, "BRIEF.md"), "utf8"), /^aspect: 9:16$/m);
    for (const f of ["PLAN.md", "hyperframes.json", "package.json", join("compositions", "card.html"), MARKER]) assert.ok(existsSync(join(out, f)), f);
    assert.equal(existsSync(join(out, "renders")), false);
    assert.equal(readFileSync(join(project, "BRIEF.md"), "utf8").includes("aspect: both"), true, "the master is untouched");
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test("1x1 edition with --out", () => {
  const { parent, project } = master();
  try {
    const out = join(parent, "vuong");
    const c = capture();
    assert.equal(main([project, "--ratio", "1x1", "--out", out], c.io), 0, c.buf.err);
    assert.match(readFileSync(join(out, "index.html"), "utf8"), /data-width="1080" data-height="1080"/);
    assert.match(readFileSync(join(out, "BRIEF.md"), "utf8"), /^aspect: 1:1$/m);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test("existing edition: exit 1 without --force; --force replaces its own edition, never a foreign directory", () => {
  const { parent, project } = master();
  try {
    const out = join(parent, "demo-9x16");
    assert.equal(main([project, "--ratio", "9x16"], capture().io), 0);
    writeFileSync(join(out, "stale.txt"), "x");
    let c = capture();
    assert.equal(main([project, "--ratio", "9x16"], c.io), 1);
    assert.match(c.buf.err, /đã có; thêm --force/);
    assert.equal(main([project, "--ratio", "9x16", "--force"], capture().io), 0);
    assert.equal(existsSync(join(out, "stale.txt")), false, "--force rewrites the edition from scratch");

    const foreign = join(parent, "real-project");
    mkdirSync(foreign);
    writeFileSync(join(foreign, "index.html"), "keep");
    c = capture();
    assert.equal(main([project, "--ratio", "9x16", "--out", foreign, "--force"], c.io), 1);
    assert.match(c.buf.err, /không do reframe\.mjs tạo/);
    assert.equal(readFileSync(join(foreign, "index.html"), "utf8"), "keep");

    c = capture();
    assert.equal(main([project, "--ratio", "9x16", "--out", join(project, "sub")], c.io), 1);
    assert.match(c.buf.err, /không được nằm trong dự án gốc/);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test("a disk without hard links: assets copied, one WARN", () => {
  const { parent, project } = master();
  try {
    const c = capture();
    const link = () => { const e = new Error("cross-device link"); e.code = "EXDEV"; throw e; };
    assert.equal(main([project, "--ratio", "9x16"], { ...c.io, link }), 0, c.buf.err);
    assert.match(c.buf.out, /^WARN {2}assets 1 tệp được chép thay vì hard-link/m);
    const a = join("assets", "voice", "01.words.json");
    assert.notEqual(statSync(join(parent, "demo-9x16", a)).ino, statSync(join(project, a)).ino);
    assert.equal(readFileSync(join(parent, "demo-9x16", a), "utf8"), "[]\n");
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test("frame-worker project, missing root composition and bad usage", () => {
  const { parent, project } = master();
  try {
    mkdirSync(join(project, "compositions", "frames"));
    let c = capture();
    assert.equal(main([project, "--ratio", "9x16"], c.io), 1);
    assert.match(c.buf.err, /workflow frame-worker: làm bản 9:16 theo references\/engine-selection\.md/);
    assert.equal(existsSync(join(parent, "demo-9x16")), false);
    rmSync(join(project, "compositions", "frames"), { recursive: true });

    writeFileSync(join(project, "index.html"), "<html><body></body></html>");
    c = capture();
    assert.equal(main([project, "--ratio", "9x16"], c.io), 1);
    assert.match(c.buf.err, /composition gốc/);

    for (const argv of [[], [project], [project, "--ratio", "4x5"], [project, "--ratio"], [project, "--ratio", "9x16", "--bogus"], [join(parent, "nope"), "--ratio", "9x16"]]) {
      c = capture();
      assert.equal(main(argv, c.io), 2, argv.join(" "));
    }
    rmSync(join(project, "index.html"));
    assert.equal(main([project, "--ratio", "9x16"], capture().io), 2);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});
