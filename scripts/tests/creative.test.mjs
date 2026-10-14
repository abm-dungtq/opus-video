// Creative direction pipeline (SKILL.md step 1b → 4b → 6b → 8): directions data, pitch, preflight
// creative gate, recipe pack, motion verdict, word budget. Upstream HyperFrames must be installed
// (same assumption as pattern-names.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync, utimesSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadDirections, checkData, pickDirections, compatWarnings, resolveSelection, classifySeams, wordBudget, renderDoc, DOC } from "../directions.mjs";
import { check as preflight } from "../check-preflight.mjs";
import { motionVerdict, parseMotion } from "../qc-mp4.mjs";
import { planTokens, buildRecipes } from "../recipe-pack.mjs";
import { upstream } from "../directions.mjs";
import { setFrontmatter, setSection, main as pitchMain, init as pitchInit, renderResult, styleframeMd } from "../make-pitch.mjs";
import { writeDemoMd, winArgs } from "../make-demo.mjs";
import { check as vietPro } from "../check-viet-pro.mjs";
import { fakeVp, RECORD } from "./fixtures/fake-vp.mjs";

const data = loadDirections();
const fx = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const tmp = (p = "cr-") => mkdtempSync(join(tmpdir(), p));
const copyFixture = (name) => { const d = tmp(); cpSync(fx(name), d, { recursive: true }); return d; };
const past = (f, s = 100) => { const t = Date.now() / 1000 - s; utimesSync(f, t, t); };
const ffmpeg = (args) => spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "ignore" }).status === 0;

test("directions.json: every token exists in the installed HyperFrames; doc is generated from it", () => {
  const r = checkData(data);
  assert.deepEqual(r.errors, []);
  assert.equal(data.directions.length, 8);
  assert.equal(readFileSync(DOC, "utf8"), renderDoc(data) + "\n", "references/creative-directions.md is stale: run node scripts/directions.mjs doc --write");
});

test("checkData catches a made-up token and a style named as a preset", () => {
  const bad = structuredClone(data);
  bad.directions[0].rules.push("warm-editorial-glow");
  bad.keywords.style[0].token = { kind: "preset", name: "Data Drift" };
  const r = checkData(bad);
  assert.ok(r.errors.some((e) => e.includes('rule "warm-editorial-glow"')));
  assert.ok(r.errors.some((e) => e.includes('preset "Data Drift"')));
});

test("pick: 3 directions, one per tier, deterministic, topic keywords match whole words only", () => {
  const a = pickDirections({ category: "product", aspect: "9:16", energy: "don-dap", topic: "Gemini 4 Argon mô hình AI" }, data);
  assert.deepEqual(a.map((p) => p.tier), ["fit", "continuous", "bold"]);
  assert.equal(new Set(a.map((p) => p.id)).size, 3);
  assert.equal(a[0].id, "A2");
  assert.deepEqual(pickDirections({ category: "product", aspect: "9:16", energy: "don-dap", topic: "Gemini 4 Argon mô hình AI" }, data).map((p) => p.id), a.map((p) => p.id));
  const fin = pickDirections({ category: "explainer", aspect: "16:9", topic: "tài chính quý 3" }, data);
  assert.ok(fin.every((p) => !p.why.some((w) => w.includes('"ai"'))), "\"ai\" must not match inside \"tài\"");
});

test("compat: clashes warn with the reason; resolveSelection puts swaps first", () => {
  const a7 = data.directions.find((d) => d.id === "A7");
  const w = compatWarnings(a7, { effect: "dap-theo-beat" }, "don-dap", data);
  assert.ok(w.some((x) => x.includes("Từ khoá đập theo nhịp")));
  assert.ok(w.some((x) => x.includes("nhịp")));
  assert.deepEqual(compatWarnings(data.directions.find((d) => d.id === "A2"), { transition: "lao-xuyen-tam" }, "don-dap", data), []);
  const sel = resolveSelection(data.directions.find((d) => d.id === "A1"), { transition: "lao-xuyen-tam", style: "dem-cong-nghe" }, data);
  assert.equal(sel.seams[0], "zoom-through");
  assert.deepEqual(sel.style, { kind: "style", name: "Data Drift" });
  assert.deepEqual(wordBudget("em", 30, data), { words: 44, music_only_s: 3 });
});

test("classifySeams: banned slide swaps, soft seams, continuous seams, unknown text", () => {
  const c = (s) => classifySeams(s, data).map((x) => x.class);
  assert.deepEqual(c("crossfade"), ["banned"]);
  assert.deepEqual(c("fade"), ["banned"]);
  assert.deepEqual(c("`zoom-through` vào bước cuối"), ["continuous"]);
  assert.deepEqual(c("blur-crossfade"), ["soft"]);
  assert.deepEqual(c("zoom-through, card-morph-anchor"), ["continuous", "continuous"]);
  assert.deepEqual(c("lướt nhẹ"), ["unknown"]);
  assert.ok(c("zoom-through rồi fade").includes("banned"));
  assert.ok(!c("zoom-throughx").includes("continuous"));
  assert.ok(c("push-slide-fade").includes("banned"));
  assert.ok(!c("zoom-through, số xuất hiện").includes("banned"));
  assert.ok(c("zoom-through, nhãn hiện dần").includes("banned"));
  assert.deepEqual(classifySeams("zoom-through", data), [{ token: "zoom-through", class: "continuous" }]);
});

test("preflight plan: the real slideshow project is blocked; the creative plan passes", () => {
  const bad = preflight({ project: fx("slideshow") });
  assert.equal(bad.pass, false);
  for (const s of ["Ý đồ sáng tạo", "Blueprint/Rule", "Nối sang beat sau", "without voice"]) assert.ok(bad.errors.some((e) => e.includes(s)), s);
  const good = preflight({ project: fx("creative-good") });
  assert.equal(good.pass, true, JSON.stringify(good.errors));
  assert.equal(good.creative.direction, "A2");
  assert.ok(good.creative.tokens.length >= 2);
  assert.equal(good.creative.musicOnly, 4);
});

test("preflight plan: banned or soft seams, fake tokens, missing direction, short override", () => {
  const d = copyFixture("creative-good");
  try {
    const plan = readFileSync(join(d, "PLAN.md"), "utf8");
    writeFileSync(join(d, "PLAN.md"), plan.replace("zoom-through vào bước cuối", "blur-crossfade").replace("cta-morph-press", "fancy-cta-x"));
    const r = preflight({ project: d });
    assert.ok(r.errors.some((e) => e.includes("soft seam") && e.includes("A2")));
    assert.ok(r.errors.some((e) => e.includes('"fancy-cta-x" is not a blueprint or rule')));
    writeFileSync(join(d, "BRIEF.md"), "---\naspect: 9:16\nbrief_version: 2\n---\n");
    assert.ok(preflight({ project: d }).errors.some((e) => e.includes("has no `direction:`")));
    writeFileSync(join(d, "BRIEF.md"), "---\naspect: 9:16\n---\n");
    const legacy = preflight({ project: d });
    assert.ok(legacy.warnings.some((w) => w.includes("creative gate skipped")));
    assert.ok(!legacy.errors.some((e) => e.includes("direction")));
    writeFileSync(join(d, "BRIEF.md"), "---\naspect: 9:16\ncreative_override: ngắn\n---\n");
    assert.ok(preflight({ project: d }).errors.some((e) => e.includes("at least 10 characters")));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("preflight final: needs a moving animatic and build/RECIPES.md newer than PLAN.md", { skip: !ffmpeg(["-version"]) && "ffmpeg missing" }, () => {
  const d = copyFixture("creative-good");
  try {
    past(join(d, "PLAN.md"), 300);
    mkdirSync(join(d, "demo"), { recursive: true });
    for (let i = 0; i < 5; i++) writeFileSync(join(d, "demo", `frame-0${i}-at-${i}s.png`), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]));
    writeFileSync(join(d, "DEMO.md"), "approval: người dùng, 2026-10-14, \"ok\"\n");
    let r = preflight({ project: d, stage: "final" });
    assert.ok(r.errors.some((e) => e.includes("no `animatic:`")));
    assert.ok(r.errors.some((e) => e.includes("build/RECIPES.md not found")));
    assert.ok(ffmpeg(["-f", "lavfi", "-i", "color=c=0x101020:s=360x640:d=3:r=30", "-pix_fmt", "yuv420p", join(d, "demo", "animatic.mp4")]));
    writeFileSync(join(d, "DEMO.md"), "animatic: demo/animatic.mp4\napproval: người dùng, 2026-10-14, \"ok\"\n");
    mkdirSync(join(d, "build"));
    writeFileSync(join(d, "build", "RECIPES.md"), "# RECIPES\n");
    r = preflight({ project: d, stage: "final" });
    assert.ok(r.errors.some((e) => e.includes("animatic demo/animatic.mp4") && e.includes("slideshow")), JSON.stringify(r.errors));
    assert.ok(ffmpeg(["-f", "lavfi", "-i", "testsrc2=s=360x640:d=3:r=30", "-pix_fmt", "yuv420p", join(d, "demo", "animatic.mp4")]));
    r = preflight({ project: d, stage: "final" });
    assert.equal(r.pass, true, JSON.stringify(r.errors));
    past(join(d, "demo", "animatic.mp4"), 50);
    mkdirSync(join(d, "compositions"), { recursive: true });
    writeFileSync(join(d, "compositions", "beat-2.html"), "<div></div>");
    r = preflight({ project: d, stage: "final" });
    assert.ok(r.errors.some((e) => e.includes("compositions/beat-2.html") && e.includes("newer than the animatic")), JSON.stringify(r.errors));
    past(join(d, "compositions", "beat-2.html"), 60);
    writeFileSync(join(d, "index.html"), "<html></html>");
    r = preflight({ project: d, stage: "final" });
    assert.ok(r.errors.some((e) => e.includes("index.html") && e.includes("newer than the animatic")), JSON.stringify(r.errors));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("motionVerdict: calibration samples (slideshow FAIL, creative PASS, legacy only WARNs)", () => {
  const brief = { direction: "A2", energy: "don-dap" };
  assert.equal(motionVerdict({ frames: 449, still: 316, ratio: 0.70, peak: 1.12 }, brief).level, "FAIL");
  assert.equal(motionVerdict({ frames: 299, still: 75, ratio: 0.25, peak: 7.03 }, brief).level, "PASS");
  assert.equal(motionVerdict({ frames: 89, still: 54, ratio: 0.61, peak: 2.82 }, brief).level, "WARN");
  assert.equal(motionVerdict({ frames: 449, still: 316, ratio: 0.70, peak: 1.12 }, {}).level, "WARN");
  assert.equal(motionVerdict({ frames: 449, still: 316, ratio: 0.70, peak: 1.12 }, { ...brief, energy: "em" }).level, "WARN");
  const m = parseMotion("x lavfi.signalstats.YDIF=0\n lavfi.signalstats.YDIF=0.1\n lavfi.signalstats.YDIF=3\n lavfi.signalstats.YDIF=0.2\n");
  assert.deepEqual({ frames: m.frames, still: m.still }, { frames: 3, still: 2 });
});

test("recipe-pack: tokens from PLAN.md; recipes inline the upstream files with build rules first", () => {
  const up = upstream();
  const t = planTokens(readFileSync(join(fx("creative-good"), "PLAN.md"), "utf8"), data, up);
  assert.ok(t.blueprints.includes("prompt-type-submit-generate") && t.blueprints.includes("agent-progress-theater"));
  assert.ok(t.rules.includes("discrete-text-sequence"));
  assert.ok(t.seams.includes("zoom-through") && t.seams.includes("card-morph-anchor"));
  const md = buildRecipes({ ...t, direction: data.directions[1], style: data.directions[1].style }, data, up);
  assert.ok(md.indexOf("## Luật dựng") < md.indexOf("## blueprint `prompt-type-submit-generate`"));
  assert.match(md, /## seam `zoom-through` \(cut-catalog\)/);
  assert.match(md, /source: faceless-explainer\/references\/cut-catalog\.md/);
});

test("make-pitch choose: writes BRIEF frontmatter + creative_direction; clashes exit 3 until accepted", () => {
  const d = tmp();
  try {
    mkdirSync(join(d, "pitch"));
    writeFileSync(join(d, "pitch", "PICK.json"), JSON.stringify({ topic: "t", aspect: "9:16", energy: "don-dap", duration_s: 15, picks: [{ n: 1, id: "A2", tier: "fit", dir: "pitch/1-x" }, { n: 2, id: "A7", tier: "fit", dir: "pitch/2-y" }] }));
    writeFileSync(join(d, "BRIEF.md"), "---\ntitle: giữ nguyên\naspect: 9:16\n---\n\n# Brief\n");
    const quiet = () => {};
    assert.equal(pitchMain(["choose", "--project", d, "--pick", "2", "--effect", "dap-theo-beat"], quiet, quiet), 3);
    assert.equal(pitchMain(["choose", "--project", d, "--pick", "2", "--effect", "dap-theo-beat", "--accept-warnings"], quiet, quiet), 0);
    const b = readFileSync(join(d, "BRIEF.md"), "utf8");
    assert.match(b, /^title: giữ nguyên$/m);
    assert.match(b, /^direction: A7$/m);
    assert.match(b, /^direction_swaps: effect=dap-theo-beat$/m);
    assert.match(b, /^word_budget: 30$/m);
    assert.match(b, /^creative_selection: user$/m);
    assert.match(b, /## creative_direction[\s\S]*Cảnh báo phối đã được người dùng chấp nhận/);
    assert.equal(pitchMain(["choose", "--project", d, "--auto"], quiet, quiet), 0);
    assert.match(readFileSync(join(d, "BRIEF.md"), "utf8"), /^creative_selection: auto$/m);
    assert.equal((readFileSync(join(d, "BRIEF.md"), "utf8").match(/## creative_direction/g) || []).length, 1);
    assert.equal(pitchMain(["choose", "--project", d, "--pick", "1", "--style", "khong-co"], quiet, quiet), 2);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

// Runs fn with PATH pointing at an empty dir, so npx/ffmpeg cannot be spawned by accident.
function noTools(fn) {
  const old = process.env.PATH, empty = tmp("cr-nopath-");
  process.env.PATH = empty;
  try { return fn(); } finally { process.env.PATH = old; rmSync(empty, { recursive: true, force: true }); }
}

test("make-pitch render: refuses a styleframe that is still the blank hyperframes scaffold", () => {
  const d = tmp();
  try {
    const blank = "<!doctype html><title>Title</title>\n";
    mkdirSync(join(d, "pitch", "1-x"), { recursive: true });
    writeFileSync(join(d, "pitch", "1-x", "index.html"), blank);
    writeFileSync(join(d, "pitch", "PICK.json"), JSON.stringify({ topic: "t", aspect: "9:16", energy: "vua", duration_s: 15, picks: [{ n: 1, id: "A2", tier: "fit", dir: "pitch/1-x", scaffold: createHash("sha256").update(blank).digest("hex") }] }));
    const errs = [];
    const code = noTools(() => pitchMain(["render", "--project", d], () => {}, (m) => errs.push(m)));
    assert.equal(code, 2, errs.join("\n"));
    assert.match(errs.join("\n"), /pitch\/1-x\/index\.html.*(scaffold|chưa viết)/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("make-pitch render: missing ffmpeg/ffprobe exits 1 before rendering anything", () => {
  const d = tmp();
  try {
    mkdirSync(join(d, "pitch", "1-x"), { recursive: true });
    writeFileSync(join(d, "pitch", "1-x", "index.html"), "<!doctype html><div class=styleframe></div>\n");
    writeFileSync(join(d, "pitch", "PICK.json"), JSON.stringify({ topic: "t", aspect: "9:16", energy: "vua", duration_s: 15, picks: [{ n: 1, id: "A2", tier: "fit", dir: "pitch/1-x" }] }));
    const errs = [];
    const code = noTools(() => pitchMain(["render", "--project", d], () => {}, (m) => errs.push(m)));
    assert.equal(code, 1, errs.join("\n"));
    assert.match(errs.join("\n"), /ffmpeg/);
    assert.ok(!existsSync(join(d, "pitch", "1.mp4")));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("make-pitch init: reports missing HyperFrames skills before scaffolding anything", () => {
  const d = tmp();
  try {
    const errs = [];
    const code = noTools(() => pitchInit({ project: d, topic: "t", aspect: "9:16" }, loadDirections(), { anim: "", creative: "", faceless: "" }));
    assert.equal(code.code, 1);
    assert.match(code.msg, /HyperFrames skills/);
    assert.equal(existsSync(join(d, "pitch")), false);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("winArgs quotes npx arguments with spaces only on Windows", () => {
  assert.deepEqual(winArgs(["-o", "C:\\a b\\1.mp4", "draft"], true), ["-o", '"C:\\a b\\1.mp4"', "draft"]);
  assert.deepEqual(winArgs(["-o", "/a b/1.mp4"], false), ["-o", "/a b/1.mp4"]);
});

test("make-pitch choose: word budget follows the BRIEF duration; old creative_override is cleared", () => {
  const d = tmp();
  try {
    mkdirSync(join(d, "pitch"));
    writeFileSync(join(d, "pitch", "PICK.json"), JSON.stringify({ topic: "t", aspect: "9:16", energy: "vua", duration_s: 15, picks: [{ n: 1, id: "A2", tier: "fit", dir: "pitch/1-x" }] }));
    writeFileSync(join(d, "BRIEF.md"), "---\naspect: 16:9\nduration_s: 30\ncreative_override: dự án cũ chỉ có footage\n---\n\n# Brief\n");
    const out = [];
    assert.equal(pitchMain(["choose", "--project", d, "--pick", "1"], (m) => out.push(m), (m) => out.push(m)), 0);
    const b = readFileSync(join(d, "BRIEF.md"), "utf8");
    assert.match(b, /^word_budget: 52$/m);
    assert.doesNotMatch(b, /^creative_override:/m);
    assert.match(out.join("\n"), /WARN aspect BRIEF 16:9 ≠ pitch 9:16/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("setFrontmatter: null deletes a key; duplicated keys collapse to one", () => {
  assert.equal(setFrontmatter("---\na: 1\nb: 2\n---\n", { a: null }), "---\nb: 2\n---\n");
  assert.equal(setFrontmatter("---\na: 1\nb: 2\na: 3\n---\n", { a: 9 }), "---\na: 9\nb: 2\n---\n");
});

test("make-pitch render: exit 4 when a styleframe fails MOTION, 0 otherwise", () => {
  const pass = { level: "PASS" }, fail = { level: "FAIL" };
  assert.equal(renderResult([{ n: 1, motion: pass }, { n: 2, motion: pass }], true).code, 0);
  const r = renderResult([{ n: 1, motion: pass }, { n: 2, motion: fail }], true);
  assert.equal(r.code, 4);
  assert.match(r.msg, /FAIL {2}styleframe 2/);
  assert.doesNotMatch(r.msg, /gửi PITCH\.md/);
});

test("make-pitch choose with a brand kit: palette, brand path, voice_id only when empty", () => {
  const d = tmp(), quiet = () => {};
  const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
  const pick = JSON.stringify({ topic: "t", aspect: "9:16", energy: "vua", duration_s: 15, picks: [{ n: 1, id: "A2", tier: "fit", dir: "pitch/1-x" }] });
  try {
    mkdirSync(join(d, "pitch"));
    writeFileSync(join(d, "pitch", "PICK.json"), pick);
    writeFileSync(join(d, "BRIEF.md"), "---\naspect: 9:16\n---\n\n# Brief\n");
    const before = sha(join(d, "BRIEF.md"));
    assert.equal(pitchMain(["choose", "--project", d, "--pick", "1", "--palette", "thuong-hieu"], quiet, quiet), 2);
    assert.equal(sha(join(d, "BRIEF.md")), before);
    writeFileSync(join(d, "brand.json"), JSON.stringify({ name: "Hãng X", voice_id: "abc123", palette: { bg: "#000000", fg: "#ffffff", accent: "#ff0000" } }));
    assert.equal(pitchMain(["choose", "--project", d, "--pick", "1"], quiet, quiet), 0);
    let b = readFileSync(join(d, "BRIEF.md"), "utf8");
    assert.match(b, /^palette: thuong-hieu$/m);
    assert.match(b, new RegExp(`^brand: .*brand\\.json$`, "m"));
    assert.match(b, /^voice_id: abc123$/m);
    assert.match(b, /- Thương hiệu: Hãng X \(/);
    writeFileSync(join(d, "BRIEF.md"), "---\naspect: 9:16\nvoice_id: keep1\n---\n\n# Brief\n");
    assert.equal(pitchMain(["choose", "--project", d, "--pick", "1"], quiet, quiet), 0);
    b = readFileSync(join(d, "BRIEF.md"), "utf8");
    assert.match(b, /^voice_id: keep1$/m);
    assert.doesNotMatch(b, /^voice_id: abc123$/m);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("make-pitch choose: a deleted PICK.json brand falls back with a WARN; template defaults count as empty", () => {
  const root = tmp(), quiet = () => {};
  const d = join(root, "p1");
  const brandOk = { name: "Hãng Y", voice_id: "abc123", tts_model: "eleven_v5", palette: { bg: "#000000", fg: "#ffffff", accent: "#ff0000" } };
  const pick = (brand) => JSON.stringify({ topic: "t", aspect: "9:16", energy: "vua", duration_s: 15, brand, picks: [{ n: 1, id: "A2", tier: "fit", dir: "pitch/1-x" }] });
  try {
    mkdirSync(join(d, "pitch"), { recursive: true });
    writeFileSync(join(d, "pitch", "PICK.json"), pick(join(d, "brand.json")));
    writeFileSync(join(d, "BRIEF.md"), "---\naspect: 9:16\n---\n\n# Brief\n");
    assert.equal(pitchMain(["choose", "--project", d, "--pick", "1", "--palette", "thuong-hieu"], quiet, quiet), 2);
    assert.equal(pitchMain(["choose", "--project", d, "--pick", "1", "--brand", join(d, "nope.json")], quiet, quiet), 2);
    mkdirSync(join(root, "shared-assets"));
    writeFileSync(join(root, "shared-assets", "brand.json"), JSON.stringify(brandOk));
    writeFileSync(join(d, "BRIEF.md"), "---\naspect: 9:16\nduration_s: <số giây>\nvoice_id: eGSd0uV8dNQnZuEEX9lu\npalette: <toi | sang | thuong-hieu>\n---\n\n# Brief\n");
    const out = [];
    assert.equal(pitchMain(["choose", "--project", d, "--pick", "1"], (m) => out.push(m), (m) => out.push(m)), 0);
    assert.match(out.join("\n"), /WARN brand trong PICK\.json không còn/);
    const b = readFileSync(join(d, "BRIEF.md"), "utf8");
    assert.match(b, /^palette: thuong-hieu$/m);
    assert.match(b, /^voice_id: abc123$/m);
    assert.match(b, /^duration_s: 15$/m);
    assert.match(b, /^tts_model: eleven_v5$/m);
    mkdirSync(join(root, "elsewhere"));
    writeFileSync(join(root, "elsewhere", "brand.json"), "{ nope");
    writeFileSync(join(d, "pitch", "PICK.json"), pick(join(root, "elsewhere", "brand.json")));
    assert.equal(pitchMain(["choose", "--project", d, "--pick", "1"], quiet, quiet), 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("styleframeMd adds a brand section only with a brand; pickDirections honours exclude", () => {
  const p = pickDirections({ aspect: "9:16", topic: "t" }, data)[0];
  const args = { n: 1, pick: p, topic: "t", aspect: "9:16", energy: "vua", data };
  const md = styleframeMd({ ...args, brand: { brand: { palette: { bg: "#000000", fg: "#ffffff", accent: "#ff0000" } }, dir: "/tmp" } });
  assert.match(md, /## Thương hiệu/);
  assert.match(md, /#ff0000/);
  assert.ok(md.indexOf("## Thương hiệu") < md.indexOf("## Bắt buộc"));
  assert.doesNotMatch(styleframeMd(args), /## Thương hiệu/);
  const ex = pickDirections({ aspect: "9:16", topic: "ai agent", exclude: ["A1"] }, data);
  assert.equal(ex.length, 3);
  assert.ok(!ex.some((x) => x.id === "A1"));
});

test("styleframeMd points at a shipped example of the same direction when one exists", () => {
  const base = pickDirections({ aspect: "9:16", topic: "t" }, data)[0];
  const md = (id) => styleframeMd({ n: 1, pick: { ...base, id, direction: data.directions.find((x) => x.id === id) }, topic: "t", aspect: "9:16", energy: "vua", data });
  for (const id of ["A2", "A3", "A4"]) {
    const m = md(id).match(/^- Ví dụ cùng hướng: `(.+)`/m);
    assert.ok(m, id);
    assert.ok(m[1].endsWith(`styleframe-examples/${id}.html`) && existsSync(m[1]), m[1]);
  }
  assert.doesNotMatch(md("A1"), /Ví dụ cùng hướng/);
});

test("setFrontmatter / setSection helpers", () => {
  assert.equal(setFrontmatter("", { a: 1 }), "---\na: 1\n---\n");
  assert.equal(setFrontmatter("---\na: 1\nb: 2\n---\nbody\n", { a: 3, c: "" }), "---\na: 3\nb: 2\n---\n\nbody\n");
  assert.equal(setSection("# T\n\n## x\n\nold\n\n## y\n\nkeep\n", "x", "new"), "# T\n\n## x\n\nnew\n\n## y\n\nkeep\n");
});

test("writeDemoMd keeps animatic lines per aspect and resets approval", () => {
  const d = tmp();
  try {
    writeDemoMd(d, ["demo/frame-00-at-1s.png"], "main", "", "demo/animatic.mp4");
    writeDemoMd(d, ["demo/9x16/frame-00-at-1s.png"], "9:16", "", "demo/9x16/animatic.mp4");
    const t = readFileSync(join(d, "DEMO.md"), "utf8");
    assert.match(t, /^animatic: demo\/animatic\.mp4$/m);
    assert.match(t, /^animatic_9x16: demo\/9x16\/animatic\.mp4$/m);
    assert.match(t, /^approval: pending$/m);
    writeDemoMd(d, ["demo/frame-00-at-1s.png"], "main");
    assert.doesNotMatch(readFileSync(join(d, "DEMO.md"), "utf8"), /^animatic: /m);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("check-viet-pro: BRIEF word_budget blocks a script that talks over the picture", () => {
  const vp = fakeVp(), d = tmp();
  try {
    const table = "| Thời điểm | Voice-over | Visual |\n|---|---|---|\n| 0-3s | Sếp hỏi số liệu tuần này. | TV |\n";
    writeFileSync(join(d, "BRIEF.md"), `---\nlanguage: vi\nduration: 15\nword_budget: 5\n---\n\n${RECORD()}\n`);
    writeFileSync(join(d, "script-table.md"), table);
    writeFileSync(join(d, "script-table.v1.md"), table);
    mkdirSync(join(d, "script"));
    writeFileSync(join(d, "script", "01.txt"), "Sếp hỏi số liệu tuần này.\n");
    let r = vietPro({ project: d, vp });
    assert.ok(r.errors.some((e) => e.includes("word_budget is 5")), JSON.stringify(r.errors));
    writeFileSync(join(d, "BRIEF.md"), `---\nlanguage: vi\nduration: 15\nword_budget: 26\n---\n\n${RECORD()}\n`);
    r = vietPro({ project: d, vp });
    assert.equal(r.pass, true, JSON.stringify(r.errors));
    // No word_budget but a direction: the budget comes from the direction's energy and duration (vua, 15 s → 26).
    const long = Array.from({ length: 8 }, () => "Sếp hỏi số liệu tuần.").join(" ");
    const longTable = `| Thời điểm | Voice-over | Visual |\n|---|---|---|\n| 0-15s | ${long} | TV |\n`;
    writeFileSync(join(d, "BRIEF.md"), `---\nlanguage: vi\nduration_s: 15\ndirection: A1\nenergy: vua\n---\n\n${RECORD()}\n`);
    writeFileSync(join(d, "script-table.md"), longTable);
    writeFileSync(join(d, "script-table.v1.md"), longTable);
    writeFileSync(join(d, "script", "01.txt"), `${long}\n`);
    r = vietPro({ project: d, vp });
    assert.ok(r.errors.some((e) => e.includes("VOICE_OVER_BUDGET") && e.includes("26")), JSON.stringify(r.errors));
  } finally { rmSync(vp, { recursive: true, force: true }); rmSync(d, { recursive: true, force: true }); }
});
