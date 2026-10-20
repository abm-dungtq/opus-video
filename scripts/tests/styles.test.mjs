// Style profiles: data integrity, lookup, per-scene resolution, the link to creative directions,
// make-pitch and the preflight style gate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STYLES_DIR, STYLE_DIMENSIONS, StyleError, buildIndex, defaultStyle, findStyles, loadProfiles, lookup, main,
  norm, paletteCss, parseLayers, planSceneList, renderMarkdown, resolveProject, resolveSpec, suggestStyles, validateProfiles,
} from "../styles.mjs";
import { checkData, compatWarnings, loadDirections, main as directionsMain } from "../directions.mjs";
import { main as pitchMain, lemoProfile, styleMd, styleframeMd } from "../make-pitch.mjs";
import { check as preflight, checkStyle } from "../check-preflight.mjs";

const profiles = loadProfiles();
const data = loadDirections();
const dir = (id) => data.directions.find((d) => d.id === id);
const tmp = (p = "st-") => mkdtempSync(join(tmpdir(), p));
const fx = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const capture = () => { const out = []; return { out, log: (s) => out.push(String(s)), text: () => out.join("\n") }; };
const SCENES = [{ id: "s1", type: "cover" }, { id: "s2", type: "ui-demo" }, { id: "s3", type: "diagram" }, { id: "s4", type: "outro" }];

test("63 profiles with Vietnamese name and description; validate passes; index.json is generated", () => {
  assert.equal(Object.keys(profiles).length, 63);
  for (const p of Object.values(profiles)) {
    assert.ok(p.ten_vi && p.ten_vi.split(/\s+/).length <= 5, `${p.id} ten_vi`);
    assert.ok(p.mo_ta_vi && p.mo_ta_vi.split(/\s+/).length <= 25, `${p.id} mo_ta_vi`);
    assert.doesNotMatch(`${p.ten_vi} ${p.mo_ta_vi}`, /minh họa/i);
  }
  assert.deepEqual(validateProfiles(profiles), []);
  const text = readFileSync(join(STYLES_DIR, "index.json"), "utf8");
  assert.equal(text, buildIndex(profiles));
  const rows = JSON.parse(text);
  assert.equal(rows.length, 63);
  assert.deepEqual(Object.keys(rows[0]), ["id", "ten_vi", "name", "family", "aliases", "energy", "best_for", "summary", "mo_ta_vi", "depth", "engine"]);
  assert.deepEqual(rows.map((r) => r.id), [...rows.map((r) => r.id)].sort());
  assert.equal(text.trim().split("\n").length, 65, "one line per style plus the brackets");
  assert.deepEqual(rows.filter((r) => r.depth === "reference").map((r) => r.id), ["cinematic-product-launch", "comic-multiverse", "glass-keynote"]);
});

test("validate reports broken profiles and a stale index", () => {
  const d = tmp();
  try {
    cpSync(STYLES_DIR, d, { recursive: true });
    const p = JSON.parse(readFileSync(join(d, "saas-bento.json"), "utf8"));
    p.energy = 7;
    p.dimensions.palette.colors.bg = "white";
    p.pairs_well_with.push("no-such-style");
    p.aliases.push("glass");
    delete p.dimensions.sound;
    delete p.mo_ta_vi;
    writeFileSync(join(d, "saas-bento.json"), JSON.stringify(p, null, 2));
    const errors = validateProfiles(loadProfiles(d), { dir: d });
    for (const re of [/energy must be/, /colors\.bg must be #rrggbb/, /unknown style "no-such-style"/, /"glass" collides with glass-keynote/, /missing dimensions sound/, /missing key mo_ta_vi/, /index\.json is stale/]) {
      assert.ok(errors.some((e) => re.test(e)), `${re}: ${errors.join(" | ")}`);
    }
    const c = capture();
    assert.equal(main(["validate"], c.log, c.log, { dir: d }), 1);
    assert.match(c.text(), /BLOCKED/);
    assert.equal(main(["index", "--write"], c.log, c.log, { dir: d }), 0);
    assert.ok(!validateProfiles(loadProfiles(d), { dir: d }).some((e) => /stale/.test(e)));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("find: exact alias first, folded names, Vietnamese words; lookup errors name the nearest", () => {
  assert.equal(findStyles("Apple", profiles)[0].id, "cinematic-product-launch");
  assert.equal(findStyles("Apple", profiles)[0].score, 1);
  assert.equal(findStyles("Glass_Keynote style", profiles)[0].id, "glass-keynote");
  assert.equal(findStyles("kiểu comic", profiles)[0].id, "comic-multiverse");
  assert.equal(findStyles("bản vẽ kỹ thuật", profiles)[0].id, "blueprint-engineering");
  assert.ok(findStyles("Apple", profiles).length <= 5);
  assert.equal(norm("Nike Style"), "nike");
  assert.equal(lookup("SPIDER-VERSE", profiles), "comic-multiverse");
  assert.throws(() => lookup("glas keynot", profiles), (e) => e instanceof StyleError && e.code === 2 && /nearest: glass-keynote/.test(e.message));
  const c = capture();
  assert.equal(main(["find", "Apple"], c.log, c.log), 0);
  assert.match(c.out[0], /^cinematic-product-launch — Phim ra mắt sản phẩm — 1\.000$/);
  assert.equal(main(["find", "zzqx"], c.log, c.log), 1);
  assert.equal(main(["find"], c.log, c.log), 2);
});

test("show and css print the profile; unknown names exit 2", () => {
  const c = capture();
  assert.equal(main(["show", "glass"], c.log, c.log), 0);
  assert.match(c.text(), /^glass-keynote — Keynote kính mờ/);
  assert.match(c.text(), /Chi tiết: .*references\/styles\/detail\/glass-keynote\.md/);
  const j = capture();
  assert.equal(main(["show", "glass-keynote", "--json"], j.log, j.log), 0);
  assert.equal(JSON.parse(j.text()).id, "glass-keynote");
  const css = paletteCss(profiles["glass-keynote"]);
  assert.match(css, /^\/\* glass-keynote · dark/);
  assert.match(css, /:root \{\n {2}--bg: #070817;\n {2}--ink: #f5f3ff;/);
  assert.match(paletteCss(profiles["blueprint-engineering"]), /--grid-major: rgba\(/);
  assert.equal(main(["css", "no-such"], c.log, c.log), 2);
  assert.equal(main(["nope"], c.log, c.log), 2);
});

test("resolve: base everywhere, layers by id prefix or type, later layer wins, palette accents vs full", () => {
  const r = resolveSpec({ base: "glass", scenes: [...SCENES, { id: "s5-final", type: null }], layers: [
    { style: "precision-dark-product", dimensions: ["ui_choreography", "palette"], scenes: { types: ["ui-demo"] } },
    { style: "blueprint", dimensions: ["diagrams", "palette"], palette_mode: "full", scenes: { types: ["diagram"] } },
    { style: "athletic-impact", dimensions: ["typography"], scenes: { ids: ["s5", "s2"] } },
    { style: "saas-bento", dimensions: ["typography"], scenes: { ids: ["s2"] } },
  ] }, profiles);
  assert.equal(r.base, "glass-keynote");
  const row = (id) => r.scenes.find((s) => s.id === id).dimensions;
  assert.ok(STYLE_DIMENSIONS.every((d) => row("s1")[d] === "glass-keynote"));
  assert.equal(row("s2").ui_choreography, "precision-dark-product");
  assert.equal(row("s2").palette, "glass-keynote + precision-dark-product accents");
  assert.equal(row("s3").palette, "blueprint-engineering");
  assert.equal(row("s2").typography, "saas-bento", "the later layer wins");
  assert.equal(row("s5-final").typography, "athletic-impact", "ids match the s<#> prefix");
  assert.deepEqual(r.constraints[0], { style: "glass-keynote", scenes: "all", rules: profiles["glass-keynote"].constraints });
  assert.deepEqual(r.constraints.find((c) => c.style === "blueprint-engineering").scenes, ["s3"]);
  assert.equal(r.detail, "references/styles/detail/glass-keynote.md");
  const md = renderMarkdown(r, profiles);
  assert.match(md, /^- Style nền: Keynote kính mờ \(`glass-keynote`\)/);
  assert.match(md, /\| s2 \| ui-demo \| base \+ precision-dark-product \(màu nhấn\) \|/);
  assert.doesNotMatch(md, /^##/m, "the block is pasted under ## Ý đồ sáng tạo");
  const whole = resolveSpec({ base: "terminal-ops", layers: [] }, profiles);
  assert.deepEqual(whole.scenes.map((s) => s.id), ["(cả video)"]);
  assert.match(renderMarkdown(whole, profiles), /Mọi chiều lấy từ style nền/);
});

test("resolve warnings: three transition languages, a layer with no scene, a borrowed value the base avoids", () => {
  const r = resolveSpec({ base: "glass-keynote", scenes: SCENES, layers: [
    { style: "comic-multiverse", dimensions: ["texture", "transitions"], scenes: { ids: ["s2"] } },
    { style: "saas-bento", dimensions: ["transitions"], scenes: { ids: ["s3"] } },
    { style: "manga-ink", dimensions: ["camera"], scenes: { types: ["quote"] } },
  ] }, profiles);
  assert.ok(r.warnings.some((w) => /^3 ngôn ngữ chuyển cảnh/.test(w)), r.warnings.join(" | "));
  assert.ok(r.warnings.some((w) => /lớp 3 \(manga-ink\) không chọn cảnh nào/.test(w)));
  assert.ok(r.warnings.some((w) => /lớp 1 \(comic-multiverse\) mượn texture có "halftone", trái ràng buộc của base glass-keynote: "Halftone or comic textures"/.test(w)), r.warnings.join(" | "));
  assert.ok(!r.warnings.some((w) => /saas-bento\) mượn/.test(w)));
});

test("resolve errors: unknown style, dimension, key, scene type, palette mode; more than 4 layers", () => {
  const bad = (layers, base = "glass-keynote") => assert.throws(() => resolveSpec({ base, scenes: SCENES, layers }, profiles), StyleError);
  bad([], "no-such-style");
  bad([{ style: "nope", dimensions: ["camera"] }]);
  bad([{ style: "saas-bento", dimensions: ["colour"] }]);
  bad([{ style: "saas-bento", dimensions: ["camera"], extra: 1 }]);
  bad([{ style: "saas-bento", dimensions: ["camera"], scenes: { types: ["intro"] } }]);
  bad([{ style: "saas-bento", dimensions: ["camera"], scenes: { names: ["s1"] } }]);
  bad([{ style: "saas-bento", dimensions: ["palette"], palette_mode: "half" }]);
  bad(Array.from({ length: 5 }, () => ({ style: "saas-bento", dimensions: ["camera"] })));
});

test("BRIEF style_layers and PLAN scene types feed resolve --project; --markdown and errors", () => {
  assert.deepEqual(parseLayers("---\na: 1\n---\n# B\n"), []);
  assert.deepEqual(parseLayers("## style_layers\n\n~~~json\n[]\n~~~\n"), []);
  assert.throws(() => parseLayers("## style_layers\n\n```json\n{ \"layers\": [] }\n```\n"), /JSON array/);
  assert.throws(() => parseLayers("## style_layers\n\n```json\n[ oops ]\n```\n"), /not valid JSON/);
  assert.throws(() => parseLayers("## style_layers\n\nchỉ có chữ\n"), /code fence/);
  const plan = "## Cảnh\n| # | Thời điểm | Loại | Hình |\n|---|---|---|---|\n| 1 | 0–2s | cover | a |\n| 2 | 2–4s | `ui-demo` | b |\n| 3 | 4–6s | — | c |\n";
  assert.deepEqual(planSceneList(plan), [{ id: "s1", type: "cover" }, { id: "s2", type: "ui-demo" }, { id: "s3", type: null }]);
  assert.throws(() => planSceneList(plan.replace("cover", "intro")), /loại cảnh "intro"/);
  assert.deepEqual(planSceneList("## Cảnh\n| Thời điểm | Hình |\n|---|---|\n| 0–2s | a |\n"), [{ id: "s1", type: null }]);
  assert.deepEqual(planSceneList("## Cảnh\n| # | Thời điểm |\n|---|---|\n| s1 | 0–2s |\n| S2 | 2–4s |\n| 3 | 4–6s |\n").map((s) => s.id), ["s1", "s2", "s3"], "a # cell already written s1 is not ss1");

  const d = tmp();
  try {
    writeFileSync(join(d, "BRIEF.md"), '---\nstyle_profile: glass\n---\n\n## style_layers\n\n```json\n[{ "style": "precision-dark-product", "dimensions": ["ui_choreography"], "scenes": { "types": ["ui-demo"] } }]\n```\n');
    writeFileSync(join(d, "PLAN.md"), plan);
    const r = resolveProject(d, profiles);
    assert.equal(r.base, "glass-keynote");
    assert.deepEqual(r.layers[0].scenes, ["s2"]);
    const c = capture();
    assert.equal(main(["resolve", "--project", d, "--markdown"], c.log, c.log), 0);
    assert.match(c.text(), /\| Cảnh \| Loại \| ui_choreography \|\n\|---\|---\|---\|\n\| s1 \| cover \| base \|\n\| s2 \| ui-demo \| precision-dark-product \|/);
    const j = capture();
    assert.equal(main(["resolve", "--project", d, "--json"], j.log, j.log), 0);
    assert.equal(JSON.parse(j.text()).scenes.length, 3);
    writeFileSync(join(d, "BRIEF.md"), "---\nstyle_profile: <id>\n---\n");
    assert.equal(main(["resolve", "--project", d], c.log, c.log), 1);
    assert.equal(main(["resolve", "--project", join(d, "missing")], c.log, c.log), 2);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("every direction suggests 3-5 real styles covering each of its energies; suggest filters by energy", () => {
  for (const d of data.directions) {
    assert.ok(d.styles_goi_y.length >= 3 && d.styles_goi_y.length <= 5, d.id);
    for (const e of d.energy) assert.ok(suggestStyles(d, e, profiles).length >= 1, `${d.id} has no style for ${e}`);
  }
  assert.deepEqual(suggestStyles(dir("A7"), "em", profiles), ["editorial-intelligence", "calm-workspace"]);
  assert.throws(() => suggestStyles(dir("A7"), "nhanh", profiles), StyleError);
  assert.equal(defaultStyle(dir("A1"), "don-dap", profiles), "neo-brutalist-web");
  assert.equal(defaultStyle(dir("A1"), "vua", profiles, new Set(["expressive-material"])), "precision-dark-product");
  assert.equal(defaultStyle({ styles_goi_y: [] }, "vua", profiles), null);
  const c = capture();
  assert.equal(main(["suggest", "--direction", "a6", "--energy", "em"], c.log, c.log), 0);
  assert.match(c.out[0], /^data-editorial — Báo chí dữ liệu — năng lượng 2\/5/);
  assert.equal(main(["suggest", "--direction", "A9"], c.log, c.log), 2);
});

test("directions: check needs real styles_goi_y; show lists them; compat warns on energy and two palette sources", () => {
  const bad = structuredClone(data);
  bad.directions[0].styles_goi_y = ["glass-keynote", "no-such-style", "saas-bento"];
  bad.directions[1].styles_goi_y = ["glass-keynote"];
  const errors = checkData(bad).errors;
  assert.ok(errors.some((e) => e.includes('A1.styles_goi_y: style "no-such-style" not found')), errors.join(" | "));
  assert.ok(errors.some((e) => e.includes("A2: styles_goi_y needs 3-5")));
  const a7 = dir("A7");
  assert.deepEqual(compatWarnings(a7, {}, "em", data, profiles["calm-workspace"]), []);
  assert.deepEqual(compatWarnings(a7, {}, "em", data, profiles["glass-keynote"]), [], "one step off is fine");
  assert.ok(compatWarnings(a7, {}, "em", data, profiles["comic-multiverse"]).some((w) => /năng lượng 5\/5, lệch 3 bậc so với nhịp Êm/.test(w)));
  assert.ok(compatWarnings(a7, {}, "", data, profiles["athletic-impact"]).some((w) => /lệch 2 bậc so với hướng A7/.test(w)));
  assert.ok(compatWarnings(dir("A2"), { style: "dem-cong-nghe" }, "", data, profiles["terminal-ops"]).some((w) => /hai nguồn bảng màu/.test(w)));
  const c = capture();
  assert.equal(directionsMain(["show", "A8"], c.log, c.log), 0);
  assert.match(c.text(), /Style gợi ý: blueprint-engineering Bản vẽ kỹ thuật \(2\/5\)/);
  assert.equal(directionsMain(["compat", "--direction", "A7", "--energy", "em", "--style-profile", "comic"], c.log, c.log), 3);
  assert.equal(directionsMain(["compat", "--direction", "A7", "--style-profile", "no-such"], c.log, c.log), 2);
  assert.equal(directionsMain(["compat", "--direction", "A2", "--style-profile", "terminal"], c.log, c.log), 0);
});

test("make-pitch: STYLEFRAME.md style section, brand colours win; choose writes style_profile", () => {
  const p = { n: 1, id: "A2", tier: "fit", why: [], direction: dir("A2") };
  const args = { n: 1, pick: p, topic: "t", aspect: "9:16", energy: "vua", data };
  const md = styleframeMd({ ...args, style: profiles["glass-keynote"] });
  assert.match(md, /^## Style: Keynote kính mờ \(glass-keynote\)$/m);
  assert.match(md, /```css\n\/\* glass-keynote[\s\S]*--bg: #070817;[\s\S]*```/);
  assert.match(md, /- Chi tiết: `.*references\/styles\/detail\/glass-keynote\.md`/);
  assert.equal((md.match(/^- Nước đi đặc trưng: (.*)$/m)[1].split("; ")).length, 3);
  assert.ok(md.indexOf("## Style:") < md.indexOf("## Bắt buộc"));
  assert.doesNotMatch(md, /Màu thương hiệu thắng/);
  const branded = styleframeMd({ ...args, style: profiles["glass-keynote"], brand: { brand: { palette: { bg: "#000000", fg: "#ffffff", accent: "#ff0000" } }, dir: "/tmp" } });
  assert.match(branded, /Màu thương hiệu thắng/);
  assert.doesNotMatch(styleframeMd(args), /## Style:/);

  const d = tmp();
  try {
    mkdirSync(join(d, "pitch"));
    writeFileSync(join(d, "pitch", "PICK.json"), JSON.stringify({ topic: "t", aspect: "9:16", energy: "vua", duration_s: 15, picks: [{ n: 1, id: "A2", tier: "fit", dir: "pitch/1-x", style_profile: "terminal-ops" }, { n: 2, id: "A7", tier: "fit", dir: "pitch/2-y" }] }));
    writeFileSync(join(d, "BRIEF.md"), "---\naspect: 9:16\n---\n\n# Brief\n");
    const quiet = () => {};
    assert.equal(pitchMain(["choose", "--project", d, "--pick", "1"], quiet, quiet), 0);
    let b = readFileSync(join(d, "BRIEF.md"), "utf8");
    assert.match(b, /^style_profile: terminal-ops$/m);
    assert.match(b, /- Style profile: Phiên terminal \(`terminal-ops`\)/);
    assert.equal(pitchMain(["choose", "--project", d, "--pick", "2"], quiet, quiet), 0);
    assert.match(readFileSync(join(d, "BRIEF.md"), "utf8"), /^style_profile: quirky-editorial$/m, "no style in PICK.json: the first suggestion that fits the energy");
    assert.equal(pitchMain(["choose", "--project", d, "--pick", "2", "--style-profile", "comic", "--energy", "em"], quiet, quiet), 3);
    assert.equal(pitchMain(["choose", "--project", d, "--pick", "2", "--style-profile", "comic", "--energy", "em", "--accept-warnings"], quiet, quiet), 0);
    b = readFileSync(join(d, "BRIEF.md"), "utf8");
    assert.match(b, /^style_profile: comic-multiverse$/m);
    assert.equal((b.match(/^style_profile:/gm) || []).length, 1);
    assert.equal(pitchMain(["choose", "--project", d, "--pick", "1", "--style-profile", "no-such"], quiet, quiet), 2);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("preflight plan: creative-good with style_profile glass-keynote still passes; bad styles FAIL, legacy only WARNs", () => {
  const d = tmp();
  try {
    cpSync(fx("creative-good"), d, { recursive: true });
    const brief = readFileSync(join(d, "BRIEF.md"), "utf8");
    const none = preflight({ project: d });
    assert.equal(none.pass, true, none.errors.join("\n"));
    assert.ok(none.warnings.some((w) => /has no style_profile/.test(w)));
    writeFileSync(join(d, "BRIEF.md"), brief.replace("energy: don-dap", "energy: don-dap\nstyle_profile: glass-keynote"));
    const good = preflight({ project: d });
    assert.equal(good.pass, true, good.errors.join("\n"));
    assert.deepEqual(good.style, { base: "glass-keynote", layers: 0 });
    assert.ok(!good.warnings.some((w) => /style_profile/.test(w)));

    writeFileSync(join(d, "BRIEF.md"), brief.replace("energy: don-dap", "energy: don-dap\nstyle_profile: glas-keynot"));
    const unknown = preflight({ project: d });
    assert.equal(unknown.pass, false);
    assert.ok(unknown.errors.some((e) => /style_profile "glas-keynot": unknown style/.test(e)));

    writeFileSync(join(d, "BRIEF.md"), `${brief.replace("energy: don-dap", "energy: don-dap\nstyle_profile: glass-keynote")}\n## style_layers\n\n\`\`\`json\n[{ "style": "saas-bento", "dimensions": ["sound"], "scenes": { "types": ["chart"] } }]\n\`\`\`\n`);
    const warned = preflight({ project: d });
    assert.equal(warned.pass, true, warned.errors.join("\n"));
    assert.ok(warned.warnings.some((w) => /style_profile glass-keynote: lớp 1 \(saas-bento\) không chọn cảnh nào/.test(w)));

    const legacy = { errors: [], warnings: [] };
    checkStyle({ dir: d, brief: "---\nstyle_profile: nope\n---\n", ...legacy, resolveFn: () => { throw new StyleError("unknown style \"nope\""); } });
    assert.deepEqual(legacy.errors, []);
    assert.equal(legacy.warnings.length, 1);
    const quiet = { errors: [], warnings: [] };
    assert.equal(checkStyle({ dir: d, brief: "---\ntitle: cũ\n---\n", ...quiet }), null);
    assert.deepEqual(quiet, { errors: [], warnings: [] }, "a legacy brief without style_profile stays silent");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("lemo-canvas profiles: engine and catalog style checked; find, show and index know them", () => {
  const lemo = Object.values(profiles).filter((p) => p.engine === "lemo-canvas").map((p) => p.id).sort();
  assert.deepEqual(lemo, ["lemo-glass-product", "lemo-watercolor"]);
  assert.equal(findStyles("thuỷ màu", profiles)[0].id, "lemo-watercolor");
  assert.equal(lookup("glass product", profiles), "lemo-glass-product");
  const rows = JSON.parse(readFileSync(join(STYLES_DIR, "index.json"), "utf8"));
  assert.equal(rows.find((r) => r.id === "lemo-watercolor").engine, "lemo-canvas");
  assert.equal(rows.find((r) => r.id === "saas-bento").engine, "hyperframes");
  const c = capture();
  assert.equal(main(["show", "lemo-watercolor"], c.log, c.log), 0);
  assert.match(c.text(), /engine: lemo-canvas \(2d\) · node .*lemo\.mjs add --project \. --style watercolor/);

  const d = tmp();
  try {
    cpSync(STYLES_DIR, d, { recursive: true });
    const edit = (id, fn) => { const f = join(d, `${id}.json`); const p = JSON.parse(readFileSync(f, "utf8")); fn(p); writeFileSync(f, JSON.stringify(p)); };
    edit("lemo-watercolor", (p) => { p.lemo.style = "oil-paint"; });
    edit("lemo-glass-product", (p) => { p.lemo.kind = "2d"; });
    edit("saas-bento", (p) => { p.engine = "webgl"; });
    edit("glass-keynote", (p) => { p.lemo = { style: "watercolor", kind: "2d" }; });
    const ps = loadProfiles(d);
    writeFileSync(join(d, "index.json"), buildIndex(ps));
    const errors = validateProfiles(ps, { dir: d });
    for (const re of [/lemo-watercolor: lemo\.style "oil-paint" is not in/, /lemo-glass-product: lemo\.kind "2d" differs/, /saas-bento: engine must be one of/, /glass-keynote: lemo is only for engine/]) {
      assert.ok(errors.some((e) => re.test(e)), `${re}: ${errors.join(" | ")}`);
    }
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("resolve --project: a lemo-canvas base without its layer in index.html warns with the add command", () => {
  const d = tmp();
  try {
    writeFileSync(join(d, "BRIEF.md"), "---\nstyle_profile: lemo-watercolor\n---\n# Brief\n");
    writeFileSync(join(d, "index.html"), "<div id=\"bg\"><!-- LEMO-LAYER:BEGIN --><!-- LEMO-LAYER:END --></div>");
    assert.ok(resolveProject(d, profiles).warnings.some((w) => /lemo\.mjs add --project .* --style watercolor/.test(w)));
    writeFileSync(join(d, "index.html"), "<div id=\"bg\"><!-- LEMO-LAYER:BEGIN --><!-- lemo-style: watercolor --><!-- LEMO-LAYER:END --></div>");
    assert.ok(!resolveProject(d, profiles).warnings.some((w) => /lemo/.test(w)));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("make-pitch --lemo: catalog slug, profile id or alias resolve to the profile; others refuse; STYLEFRAME says how to add it", () => {
  assert.equal(lemoProfile("watercolor", profiles), "lemo-watercolor");
  assert.equal(lemoProfile("lemo-glass-product", profiles), "lemo-glass-product");
  assert.equal(lemoProfile("thuy mau", profiles), "lemo-watercolor");
  assert.throws(() => lemoProfile("saas-bento", profiles), /not a lemo-canvas style/);
  const md = styleMd(profiles["lemo-glass-product"], dir("A1"));
  assert.match(md, /lemo\.mjs add --project \. --style glass-product/);
  assert.match(md, /scene3d\.js/);
  assert.doesNotMatch(styleMd(profiles["saas-bento"], dir("A1")), /lemo/);
  const c = capture();
  assert.equal(pitchMain(["init", "--project", ".", "--topic", "t", "--aspect", "16:9", "--lemo", "saas-bento"], c.log, c.log), 2);
  assert.match(c.text(), /--lemo: saas-bento is not a lemo-canvas style/);
});
