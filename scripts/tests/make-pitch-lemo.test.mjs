// make-pitch with a lemo-opuscar style chosen by lemo-pick.mjs: a grammar-only style (lemo_ref)
// reaches the styleframes instead of a guessed style profile, --directions A1 says one direction,
// and a styleframe that loads assets/fonts gets its fonts. The lemo library is a temp folder
// (LEMO_OPUSCAR_HOME) holding one style, so no fetch runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDirections } from "../directions.mjs";
import { init, main as pitchMain, pitchMd, renderResult, copyFonts, fontRefs, briefLemoRef } from "../make-pitch.mjs";
import { checkStyle } from "../check-preflight.mjs";
import { SKELETON, sizeSkeleton } from "../composition.mjs";
import { CATALOG } from "../lemo.mjs";

const data = loadDirections();
const byId = (id) => data.directions.find((d) => d.id === id);
const SHA = JSON.parse(readFileSync(CATALOG, "utf8")).sha;
const quiet = () => {};

// Project with pre-made styleframe folders (init then skips `hyperframes init`) and a lemo library.
function project(ids, brief = "") {
  const d = mkdtempSync(join(tmpdir(), "pitch-lemo-"));
  const up = { anim: join(d, "up"), creative: join(d, "up"), faceless: join(d, "up") };
  ids.forEach((id, i) => {
    const dir = join(d, "pitch", `${i + 1}-${byId(id).slug}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), "<html></html>\n");
  });
  if (brief) writeFileSync(join(d, "BRIEF.md"), brief);
  const lib = join(d, "lemo", SHA, "styles", "risograph");
  mkdirSync(lib, { recursive: true });
  writeFileSync(join(lib, "style.json"), JSON.stringify({ slug: "risograph", en: "Risograph Print", uses: ["Indie brands", "Zines"] }));
  writeFileSync(join(lib, "STYLE.md"), "# Risograph\n\n## 1. Essence\nMisregistered plates.\n");
  const env = { ...process.env, LEMO_OPUSCAR_HOME: join(d, "lemo"), HOME: join(d, "home") };
  return { d, up, env };
}
const base = (d, env) => ({ project: d, topic: "Bánh mì in risograph", aspect: "16:9", category: "motion", energy: "vua", env });
const pickJson = (d) => JSON.parse(readFileSync(join(d, "pitch", "PICK.json"), "utf8"));
const RISO = "---\naspect: 16:9\nbrief_version: 2\nlemo_ref: risograph\nlemo_search: jev\n---\n\n# Brief\n";

test("lemo_ref: every styleframe is built from the style's STYLE.md, not a guessed style profile", () => {
  const { d, up, env } = project(["A1", "A6"], RISO);
  try {
    const r = init({ ...base(d, env), directions: "A1,A6" }, data, up);
    assert.equal(r.code, 0, r.msg);
    assert.match(r.msg, /lemo_ref risograph/);
    const info = pickJson(d);
    assert.equal(info.lemo_ref, "risograph");
    for (const p of info.picks) {
      assert.equal(p.style_profile, undefined, `${p.id} got ${p.style_profile}`);
      const md = readFileSync(join(d, p.dir, "STYLEFRAME.md"), "utf8");
      assert.match(md, /ngữ pháp lemo-opuscar `risograph` \(Risograph Print\)/);
      assert.ok(md.includes(join(d, "lemo", SHA, "styles", "risograph", "STYLE.md")), md);
      assert.match(md, /Hợp với: Indie brands; Zines/);
      assert.doesNotMatch(md, /^## Style: /m);
    }
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("lemo_ref without the library: init still works and says to run lemo.mjs fetch", () => {
  const { d, up, env } = project(["A1"], RISO);
  try {
    rmSync(join(d, "lemo"), { recursive: true });
    const r = init({ ...base(d, env), directions: "A1" }, data, up);
    assert.equal(r.code, 0, r.msg);
    assert.match(r.msg, /WARN lemo_ref risograph: chưa có .*STYLE\.md; chạy node .*lemo\.mjs fetch/);
    assert.match(readFileSync(join(d, "pitch", "1-one-shape-morph", "STYLEFRAME.md"), "utf8"), /chưa có: chạy `node .*lemo\.mjs fetch`/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("lemo_style wins over a stray lemo_ref: the canvas profile stays on the bold pick", () => {
  const { d, env } = project([], "---\nlemo_style: watercolor\nlemo_ref: risograph\n---\n");
  try {
    assert.equal(briefLemoRef(d, env), null);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("choose with lemo_ref writes no style profile (drops a stale one) and points creative_direction at STYLE.md", () => {
  const { d, env } = project([], RISO.replace("lemo_search: jev\n", "lemo_search: jev\nstyle_profile: expressive-material\n"));
  const saved = process.env.LEMO_OPUSCAR_HOME;
  try {
    process.env.LEMO_OPUSCAR_HOME = env.LEMO_OPUSCAR_HOME;
    mkdirSync(join(d, "pitch"));
    writeFileSync(join(d, "pitch", "PICK.json"), JSON.stringify({ topic: "t", aspect: "16:9", energy: "vua", duration_s: 15, lemo_ref: "risograph", picks: [{ n: 1, id: "A1", tier: "continuous", dir: "pitch/1-one-shape-morph" }] }));
    const out = [];
    assert.equal(pitchMain(["choose", "--project", d, "--pick", "1", "--accept-warnings"], (s) => out.push(s), (s) => out.push(s)), 0, out.join("\n"));
    assert.match(out.join("\n"), /giao diện lemo_ref risograph/);
    const brief = readFileSync(join(d, "BRIEF.md"), "utf8");
    assert.doesNotMatch(brief, /^style_profile:/m);
    assert.match(brief, /^lemo_ref: risograph$/m);
    assert.match(brief, /- Giao diện: ngữ pháp lemo-opuscar `risograph` \(Risograph Print\), đọc `.*STYLE\.md`/);
    const warnings = [], errors = [];
    checkStyle({ dir: d, brief, errors, warnings });
    assert.deepEqual([errors, warnings], [[], []]);
    // --style-profile still lets the user add a profile for palette and type.
    assert.equal(pitchMain(["choose", "--project", d, "--pick", "1", "--style-profile", "bauhaus-geometry", "--accept-warnings"], quiet, quiet), 0);
    assert.match(readFileSync(join(d, "BRIEF.md"), "utf8"), /^style_profile: bauhaus-geometry$/m);
  } finally {
    if (saved === undefined) delete process.env.LEMO_OPUSCAR_HOME; else process.env.LEMO_OPUSCAR_HOME = saved;
    rmSync(d, { recursive: true, force: true });
  }
});

test("check-preflight still warns about a missing style_profile without lemo_ref", () => {
  const warnings = [], errors = [];
  checkStyle({ dir: ".", brief: "---\nbrief_version: 2\n---\n", errors, warnings });
  assert.equal(warnings.length, 1);
});

test("--directions A1 says one direction, in init and in PITCH.md", () => {
  const { d, up, env } = project(["A1"]);
  try {
    const r = init({ ...base(d, env), directions: "A1" }, data, up);
    assert.equal(r.code, 0, r.msg);
    assert.match(r.msg, /^make-pitch: 1 hướng → 1\. A1/);
    assert.doesNotMatch(r.msg, /3 hướng/);
    const info = pickJson(d);
    const line = { ...info.picks[0], mp4: "pitch/1.mp4", png: "pitch/1.png", motion: { level: "PASS", detail: "ok" } };
    const md = pitchMd(info, [line], true, data);
    assert.match(md, /^## 1 hướng$/m);
    assert.match(md, /\(1 khung\) và 1 clip 3 giây/);
    assert.doesNotMatch(md, /3 hướng|3 khung|3 clip/);
    assert.match(md, /Chỉ cần gõ số: `1`/);
    assert.match(renderResult([line], true).msg, /và 1 clip\)/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("three directions keep the old wording", () => {
  const lines = [1, 2, 3].map((n) => ({ n, id: ["A1", "A6", "A8"][n - 1], tier: "fit", mp4: `pitch/${n}.mp4`, png: `pitch/${n}.png`, motion: { level: "PASS", detail: "ok" } }));
  const md = pitchMd({ topic: "t", aspect: "16:9", duration_s: 15, picks: lines }, lines, true, data);
  assert.match(md, /^## 3 hướng$/m);
  assert.match(md, /\(3 khung xếp theo thứ tự 1 · 2 · 3\) và 3 clip/);
  assert.match(md, /Chỉ cần gõ số: `2`/);
});

test("fonts: the skeleton styleframe of a lemo layer gets the fonts it loads", () => {
  const { d, up, env } = project(["A1"], "---\nlemo_style: watercolor\n---\n");
  try {
    const dir = join(d, "pitch", "1-one-shape-morph");
    const skeleton = sizeSkeleton(readFileSync(SKELETON, "utf8"), "16:9");
    writeFileSync(join(dir, "index.html"), skeleton);
    const want = fontRefs(skeleton);
    assert.ok(want.includes("BeVietnamPro-Regular.ttf") && want.includes("BeVietnamPro-SemiBold.ttf"), want.join());
    // No font anywhere (empty HOME): init warns, render refuses before ffmpeg.
    const r0 = init({ ...base(d, env), directions: "A1" }, data, up);
    assert.equal(r0.code, 0, r0.msg);
    assert.match(r0.msg, /WARN font chưa có: BeVietnamPro-Regular\.ttf, BeVietnamPro-SemiBold\.ttf/);
    const c = [], home = process.env.HOME;
    process.env.HOME = env.HOME;
    try { assert.equal(pitchMain(["render", "--project", d], (s) => c.push(s), (s) => c.push(s)), 2); } finally { process.env.HOME = home; }
    assert.match(c.join("\n"), /loads assets\/fonts\/BeVietnamPro-Regular\.ttf, assets\/fonts\/BeVietnamPro-SemiBold\.ttf but the file is not in/);
    // The project's own assets/fonts is a source.
    mkdirSync(join(d, "assets", "fonts"), { recursive: true });
    for (const f of want) writeFileSync(join(d, "assets", "fonts", f), `font ${f}`);
    const r1 = init({ ...base(d, env), directions: "A1" }, data, up);
    assert.equal(r1.code, 0, r1.msg);
    assert.doesNotMatch(r1.msg, /WARN font/);
    for (const f of want) assert.equal(readFileSync(join(dir, "assets", "fonts", f), "utf8"), `font ${f}`);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("fonts: copyFonts copies only what index.html loads and reports what it cannot find", () => {
  const d = mkdtempSync(join(tmpdir(), "pitch-font-"));
  try {
    const src = join(d, "src"), dir = join(d, "frame");
    mkdirSync(src); mkdirSync(dir);
    writeFileSync(join(src, "A.ttf"), "a");
    writeFileSync(join(src, "Unused.ttf"), "u");
    writeFileSync(join(dir, "index.html"), `<style>@font-face{src:url("assets/fonts/A.ttf")} @font-face{src:url('./assets/fonts/B.woff2')}</style>`);
    assert.deepEqual(copyFonts(dir, [src]), ["B.woff2"]);
    assert.ok(existsSync(join(dir, "assets", "fonts", "A.ttf")));
    assert.ok(!existsSync(join(dir, "assets", "fonts", "Unused.ttf")));
  } finally { rmSync(d, { recursive: true, force: true }); }
});
