// Creative direction pipeline (SKILL.md step 1b → 4b → 6b → 8): directions data, pitch, preflight
// creative gate, recipe pack, motion verdict, word budget. Upstream HyperFrames must be installed
// (same assumption as pattern-names.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadDirections, checkData, pickDirections, compatWarnings, resolveSelection, classifySeams, wordBudget, renderDoc, DOC } from "../directions.mjs";
import { check as preflight } from "../check-preflight.mjs";
import { motionVerdict, parseMotion } from "../qc-mp4.mjs";
import { planTokens, buildRecipes } from "../recipe-pack.mjs";
import { upstream } from "../directions.mjs";
import { setFrontmatter, setSection, main as pitchMain } from "../make-pitch.mjs";
import { writeDemoMd } from "../make-demo.mjs";
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
  } finally { rmSync(vp, { recursive: true, force: true }); rmSync(d, { recursive: true, force: true }); }
});
