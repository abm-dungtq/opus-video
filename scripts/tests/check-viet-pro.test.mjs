import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { check, parseRecord, captionSections, requiredReading } from "../check-viet-pro.mjs";

const script = fileURLToPath(new URL("../check-viet-pro.mjs", import.meta.url));

// Minimal fake viet-pro install: the real reference layout (names only) + a tiny lint with the
// same output contract as lint-vietnamese-content.mjs (ERROR/WARN lines, exit 1 on ERROR).
function fakeVp() {
  const vp = mkdtempSync(join(tmpdir(), "vp-"));
  writeFileSync(join(vp, "SKILL.md"), "# viet-pro\n");
  for (const [d, files] of Object.entries({
    review: ["lead.md", "anti-ai.md", "humanizer-patterns.md", "natural.md", "punctuation.md"],
    editorial: ["lead.md", "hook-close.md", "rhythm.md", "story-core.md"],
    publishing: ["video-script.md", "facebook.md", "repurpose-matrix.md"],
  })) { mkdirSync(join(vp, "references", d), { recursive: true }); for (const f of files) writeFileSync(join(vp, "references", d, f), "x\n"); }
  mkdirSync(join(vp, "scripts"));
  writeFileSync(join(vp, "scripts", "lint-vietnamese-content.mjs"), `
import { readFileSync } from "node:fs";
let err = false;
for (const f of process.argv.slice(2)) {
  let n = 0;
  readFileSync(f, "utf8").split("\\n").forEach((l, i) => {
    if (/\\S\\s+[.,!?;](?=\\s|$)/.test(l)) { console.log("ERROR " + f + ":" + (i + 1) + " [space-before-punct] x"); err = true; n++; }
    if (/,\\s+và\\s/.test(l)) { console.log("WARN " + f + ":" + (i + 1) + " [oxford-comma] x"); n++; }
  });
  if (!n) console.log("OK    " + f + " — 0 vi phạm");
}
process.exit(err ? 1 : 0);
`);
  return vp;
}

const ALL_READ = "SKILL.md, review/lead.md, review/anti-ai.md, review/humanizer-patterns.md, review/natural.md, review/punctuation.md, editorial/lead.md, editorial/hook-close.md, editorial/rhythm.md, editorial/story-core.md, publishing/video-script.md";
const RECORD = (extra = "", read = ALL_READ) => `## viet_pro\n- mode: Chuẩn\n- files_read: ${read}\n- humanizer: #4 dẫn dài "Trong thời đại" → mở bằng hành vi; không còn pattern 1–5\n- lint: 0 ERROR\n${extra}`;

function project({ lang = "vi", record = RECORD(), voice = ["Sếp hỏi số liệu tuần này.", "Hỏi bằng lời thường, có ngay bảng."], captions, duration = 60 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "proj-"));
  writeFileSync(join(dir, "BRIEF.md"), `---\ntitle: t\nlanguage: ${lang}\nduration: ${duration}\n---\n\n# Brief\n\n${record}\n`);
  writeFileSync(join(dir, "script-table.md"), "| Thời điểm | Voice-over | Visual |\n|---|---|---|\n| 0-3s | Sếp hỏi số liệu tuần này. | TV |\n");
  mkdirSync(join(dir, "script"));
  voice.forEach((v, i) => writeFileSync(join(dir, "script", `0${i + 1}.txt`), v + "\n"));
  if (captions !== undefined) writeFileSync(join(dir, "CAPTIONS.md"), captions);
  return dir;
}
const GOOD_CAPTIONS = "# Captions\n\n## Facebook cá nhân\n\nSáng nay mình thử hỏi Claude một câu về doanh thu.\n\nNó trả về cả bảng.\n\n## TikTok\n\nHỏi bằng lời thường, có ngay dashboard.\n";
const run = (args, env = {}) => spawnSync("node", [script, ...args], { encoding: "utf8", env: { ...process.env, ...env } });

test("parseRecord: heading, list fields, indented continuation, stops at next heading", () => {
  const r = parseRecord("x\n## viet_pro\n- mode: Chuẩn\n- humanizer: #4 sửa\n    #13 bỏ\n- lint: 0 ERROR\n## Other\n- mode: nope\n", "BRIEF.md");
  assert.equal(r.file, "BRIEF.md");
  assert.equal(r.fields.mode, "Chuẩn");
  assert.equal(r.fields.humanizer, "#4 sửa\n#13 bỏ");
  assert.equal(r.fields.lint, "0 ERROR");
  assert.equal(parseRecord("no record here"), null);
});

test("requiredReading lists SKILL.md + every review/editorial file (+ publishing refs at delivery)", () => {
  const vp = fakeVp();
  try {
    const s = requiredReading(vp, "script");
    assert.ok(s.includes("SKILL.md") && s.includes("review/humanizer-patterns.md") && s.includes("editorial/story-core.md") && s.includes("publishing/video-script.md"));
    assert.ok(!s.includes("publishing/facebook.md"));
    const d = requiredReading(vp, "delivery");
    assert.ok(d.includes("publishing/facebook.md") && d.includes("publishing/repurpose-matrix.md"));
  } finally { rmSync(vp, { recursive: true, force: true }); }
});

test("script stage: PASS with a full record and clean lint; lints script-table.md and each script/NN.txt", () => {
  const vp = fakeVp(), dir = project();
  try {
    const r = check({ project: dir, vp });
    assert.equal(r.pass, true, JSON.stringify(r.errors));
    assert.deepEqual(Object.keys(r.lint), ["script-table.md", "script/01.txt", "script/02.txt"]);
    const cli = run(["--project", dir, "--vp", vp]);
    assert.equal(cli.status, 0);
    assert.match(cli.stdout, /PASS {2}viet-pro gate \(script\) · record in BRIEF\.md/);
  } finally { rmSync(vp, { recursive: true, force: true }); rmSync(dir, { recursive: true, force: true }); }
});

test("script stage: BLOCKED without a record, with empty fields, or with an incomplete files_read", () => {
  const vp = fakeVp();
  const dirs = [project({ record: "" }), project({ record: RECORD().replace(/- humanizer: .*\n/, "- humanizer: …\n") }), project({ record: RECORD("", ALL_READ.replace("review/humanizer-patterns.md, ", "")) })];
  try {
    const [a, b, c] = dirs.map((d) => check({ project: d, vp }));
    assert.equal(a.pass, false); assert.match(a.errors.join(), /no viet_pro record/);
    assert.equal(b.pass, false); assert.match(b.errors.join(), /viet_pro\.humanizer is missing or empty/);
    assert.equal(c.pass, false); assert.match(c.errors.join(), /files_read does not list: review\/humanizer-patterns\.md/);
    const cli = run(["--project", dirs[0], "--vp", vp]);
    assert.equal(cli.status, 1);
    assert.match(cli.stdout, /BLOCKED {2}viet-pro gate \(script\): fix the FAIL lines before voice/);
  } finally { rmSync(vp, { recursive: true, force: true }); for (const d of dirs) rmSync(d, { recursive: true, force: true }); }
});

test("script stage: a lint ERROR in one voice line blocks; WARNs alone do not", () => {
  const vp = fakeVp();
  const bad = project({ voice: ["Câu sạch.", "Câu này sai dấu , vì có cách trước."] });
  const warnOnly = project({ voice: ["Nhanh hơn, gọn hơn, và rõ hơn."] });
  try {
    const r = check({ project: bad, vp });
    assert.equal(r.pass, false);
    assert.match(r.errors.join(), /viet-pro lint ERROR in script\/02\.txt/);
    assert.equal(r.lint["script/01.txt"].errors.length, 0);
    const w = check({ project: warnOnly, vp });
    assert.equal(w.pass, true);
    assert.equal(w.lint["script/01.txt"].warns.length, 1);
  } finally { rmSync(vp, { recursive: true, force: true }); rmSync(bad, { recursive: true, force: true }); rmSync(warnOnly, { recursive: true, force: true }); }
});

test("soft TikTok checks are WARN only: bait phrases, first-hand claims, too many words", () => {
  const vp = fakeVp();
  const dir = project({ duration: 3, voice: ["Đừng lướt qua nhé, xem đến cuối.", "Mình đã dùng nó 3 tháng rồi và thấy ổn."] });
  try {
    const r = check({ project: dir, vp });
    assert.equal(r.pass, true);
    const w = r.warnings.join("\n");
    assert.match(w, /engagement-bait phrase in the script: "Đừng lướt/);
    assert.match(w, /engagement-bait phrase in the script: "xem đến cuối"/);
    assert.match(w, /first-hand claim "Mình đã dùng nó 3 tháng/);
    assert.match(w, /voice has \d+ words for 3s/);
  } finally { rmSync(vp, { recursive: true, force: true }); rmSync(dir, { recursive: true, force: true }); }
});

test("non-Vietnamese brief is skipped", () => {
  const vp = fakeVp(), dir = project({ lang: "en", record: "" });
  try {
    const r = check({ project: dir, vp });
    assert.equal(r.skipped, true); assert.equal(r.pass, true);
    const cli = run(["--project", dir, "--vp", vp]);
    assert.equal(cli.status, 0); assert.match(cli.stdout, /^SKIP/);
  } finally { rmSync(vp, { recursive: true, force: true }); rmSync(dir, { recursive: true, force: true }); }
});

test("captionSections splits Facebook and TikTok bodies", () => {
  const s = captionSections(GOOD_CAPTIONS);
  assert.match(s.facebook, /^Sáng nay/); assert.match(s.tiktok, /^Hỏi bằng/);
  assert.deepEqual(captionSections("## YouTube\n\nx"), { facebook: null, tiktok: null });
});

test("delivery stage: needs CAPTIONS.md (FB + TikTok, each linted on its own), captions field, publishing refs", () => {
  const vp = fakeVp();
  const full = RECORD("- captions: FB + TikTok, 0 ERROR\n", ALL_READ + ", publishing/facebook.md, publishing/repurpose-matrix.md");
  const ok = project({ record: full, captions: GOOD_CAPTIONS });
  const noFile = project({ record: full });
  const noField = project({ captions: GOOD_CAPTIONS, record: RECORD("", ALL_READ + ", publishing/facebook.md, publishing/repurpose-matrix.md") });
  const fbBullets = project({ record: full, captions: "## Facebook cá nhân\n\n- ý một\n- ý hai\n\n## TikTok\n\nOk.\n" });
  const tiktokErr = project({ record: full, captions: "## Facebook cá nhân\n\nỔn.\n\n## TikTok\n\nSai dấu , ở đây.\n" });
  try {
    const r = check({ project: ok, vp, stage: "delivery" });
    assert.equal(r.pass, true, JSON.stringify(r.errors));
    assert.ok(r.lint["CAPTIONS.md#facebook"] && r.lint["CAPTIONS.md#tiktok"]);
    assert.equal(check({ project: ok, vp, stage: "script" }).pass, true);
    assert.match(check({ project: noFile, vp, stage: "delivery" }).errors.join(), /CAPTIONS\.md not found/);
    const nf = check({ project: noField, vp, stage: "delivery" });
    assert.match(nf.errors.join(), /viet_pro\.captions is missing/);
    assert.match(check({ project: fbBullets, vp, stage: "delivery" }).errors.join(), /CAPTIONS\.md#facebook has headings\/bullets\/markdown/);
    const te = check({ project: tiktokErr, vp, stage: "delivery" });
    assert.match(te.errors.join(), /lint ERROR in CAPTIONS\.md#tiktok/);
    assert.equal(te.lint["CAPTIONS.md#facebook"].errors.length, 0);
    const missingRefs = project({ record: RECORD("- captions: ok\n"), captions: GOOD_CAPTIONS });
    assert.match(check({ project: missingRefs, vp, stage: "delivery" }).errors.join(), /files_read does not list: publishing\/facebook\.md, publishing\/repurpose-matrix\.md/);
    rmSync(missingRefs, { recursive: true, force: true });
  } finally { for (const d of [vp, ok, noFile, noField, fbBullets, tiktokErr]) rmSync(d, { recursive: true, force: true }); }
});

test("usage errors exit 2: bad flag, bad stage, viet-pro not found", () => {
  assert.equal(run(["--nope"]).status, 2);
  assert.equal(run(["--stage", "render"]).status, 2);
  const r = run(["--project", ".", "--vp", "/nonexistent/viet-pro"]);
  assert.equal(r.status, 2); assert.match(r.stderr, /viet-pro not found/);
});

const REAL_VP = join(homedir(), ".claude", "skills", "viet-pro");
test("real viet-pro install: clean project passes, space-before-punct blocks", { skip: !existsSync(join(REAL_VP, "scripts", "lint-vietnamese-content.mjs")) && "viet-pro not installed" }, () => {
  const read = requiredReading(REAL_VP, "script").join(", ");
  const good = project({ record: RECORD("", read) });
  const bad = project({ record: RECORD("", read), voice: ["Câu này sai dấu , vì có cách trước."] });
  try {
    const g = check({ project: good, vp: REAL_VP });
    assert.equal(g.pass, true, JSON.stringify(g.errors));
    assert.ok(readdirSync(join(REAL_VP, "references", "review")).length >= 5);
    const b = check({ project: bad, vp: REAL_VP });
    assert.equal(b.pass, false);
    assert.match(b.lint["script/01.txt"].errors.join(), /space-before-punct/);
  } finally { rmSync(good, { recursive: true, force: true }); rmSync(bad, { recursive: true, force: true }); }
});
