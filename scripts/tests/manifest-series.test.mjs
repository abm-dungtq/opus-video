// manifest.mjs: the series declaration (studio-series.json) and the series of a project.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SERIES_FILE, SERIES_SCHEMA, seriesDirOf, validateSeries } from "../manifest.mjs";
import * as api from "../studio-api.mjs";

const sample = () => ({
  schema: SERIES_SCHEMA,
  name: "Thử",
  characters: "characters",
  voices: { cast: "voices/cast.json" },
  read: ["refs", "characters"],
  writable: { refs: "refs", rig_src: "characters/{char}" },
  episode: { tool: "new-episode", name: "a-{NN}" },
  delivery_dir: "kenh/tap-{N}",
  drive: { account: "ai@example.com", folder: "thu" },
  image_styles: { pose: "flat green background" },
  tools: {
    validate: { file: "tools/validate.mjs", flags: { "--char": "id", "--all": "bool" }, writes: [], timeout_s: 120 },
    "hd-poses": { file: "characters/{char}/src/hd-poses.mjs", positional: "id*", flags: { "--preview": "path:write" }, writes: ["characters/{char}", "{project}/assets/gen"], timeout_s: 300 },
    "new-episode": { file: "tools/new-episode.mjs", flags: { "--root": "root", "--episode": "int", "--title": "text", "--slot": "slot*" }, writes: ["{root}"] },
  },
});

const fails = (mut, re) => {
  const s = sample();
  mut(s);
  const e = validateSeries(s);
  assert.ok(e.some((x) => re.test(x)), `expected ${re} in ${JSON.stringify(e)}`);
};

test("a valid declaration has no errors, and studio-api re-exports the series names", () => {
  assert.deepEqual(validateSeries(sample()), []);
  assert.equal(api.SERIES_FILE, SERIES_FILE);
  assert.equal(api.validateSeries, validateSeries);
  assert.equal(api.seriesDirOf, seriesDirOf);
  assert.equal(api.STUDIO_API, 4);
});

test("a missing name, a bad schema or no tools is an error", () => {
  fails((s) => { delete s.name; }, /thiếu name/);
  fails((s) => { s.schema = "x"; }, /schema phải là/);
  fails((s) => { s.tools = {}; }, /thiếu tools/);
  assert.deepEqual(validateSeries(null), ["studio-series.json phải là một object"]);
});

test("paths with '..', absolute paths and unknown placeholders are refused", () => {
  fails((s) => { s.tools.validate.file = "../tools/validate.mjs"; }, /tools\.validate\.file: .*'\.\.'/);
  fails((s) => { s.tools.validate.file = "tools/../../x.mjs"; }, /'\.\.'/);
  fails((s) => { s.tools.validate.file = "/usr/bin/x.mjs"; }, /tools\.validate\.file: phải là đường tương đối/);
  fails((s) => { s.read.push("/etc"); }, /read\[2\]: phải là đường tương đối/);
  fails((s) => { s.writable.refs = "C:\\x"; }, /writable\.refs/);
  fails((s) => { s.tools.validate.file = "tools/validate.sh"; }, /phải là file \.mjs/);
  fails((s) => { s.tools.validate.writes = ["{home}/x"]; }, /không biết chỗ thay \{home\}/);
  fails((s) => { s.tools.validate.writes = ["x/{project}"]; }, /\{project\} chỉ đứng ở đầu đường/);
  fails((s) => { s.read = ["refs/.git"]; }, /dấu chấm/);
});

test("badly formed flags and unknown flag types are refused", () => {
  fails((s) => { s.tools.validate.flags["-e"] = "text"; }, /cờ "-e" sai dạng/);
  fails((s) => { s.tools.validate.flags["--Eval"] = "text"; }, /cờ "--Eval" sai dạng/);
  fails((s) => { s.tools.validate.flags["--code"] = "shell"; }, /kiểu lạ "shell"/);
  fails((s) => { s.tools.validate.flags["--many"] = "int**"; }, /kiểu lạ/);
  fails((s) => { s.tools["hd-poses"].positional = "any"; }, /positional: kiểu lạ/);
  fails((s) => { s.tools["Bad Name"] = { file: "tools/x.mjs" }; }, /tên công cụ phải khớp/);
});

test("timeout_s must be an integer from 1 to 3600", () => {
  fails((s) => { s.tools.validate.timeout_s = 0; }, /timeout_s phải là số nguyên 1–3600/);
  fails((s) => { s.tools.validate.timeout_s = 3601; }, /timeout_s/);
  fails((s) => { s.tools.validate.timeout_s = 1.5; }, /timeout_s/);
  const ok = sample();
  ok.tools.validate.timeout_s = 3600;
  assert.deepEqual(validateSeries(ok), []);
});

test("episode, drive and image_styles are checked", () => {
  fails((s) => { s.episode.tool = "nope"; }, /episode\.tool: không có công cụ "nope"/);
  fails((s) => { s.episode.name = "a-01"; }, /episode\.name/);
  fails((s) => { s.drive = { account: "x", folder: "f" }; }, /drive phải là/);
  fails((s) => { s.image_styles.pose = ""; }, /image_styles\.pose: cần prompt/);
});

let tmp;
before(() => { tmp = mkdtempSync(join(tmpdir(), "ov-series-")); });
after(() => rmSync(tmp, { recursive: true, force: true }));

const project = (name, brief) => {
  const d = join(tmp, name);
  mkdirSync(d, { recursive: true });
  if (brief != null) writeFileSync(join(d, "BRIEF.md"), brief);
  return d;
};

test("seriesDirOf reads `series:` of the frontmatter, absolute or relative to the project", () => {
  const series = join(tmp, "series", "thu");
  mkdirSync(series, { recursive: true });
  writeFileSync(join(series, SERIES_FILE), JSON.stringify(sample()));
  const abs = project("ep-abs", `---\ntitle: x\nseries: "${series}"   # kho series\n---\n\n# Brief\n`);
  assert.equal(seriesDirOf(abs), series);
  const rel = project("ep-rel", "---\nseries: ../series/thu\n---\n");
  assert.equal(seriesDirOf(rel), series);
});

test("seriesDirOf falls back to the series_bible line, and is null without a series", () => {
  const series = join(tmp, "series", "thu");
  const bible = project("ep-bible", `---\ntitle: x\n---\n\n## series_bible\n- Thư mục series: ${series}\n- Giọng: khác\n\n## khác\n`);
  assert.equal(seriesDirOf(bible), series);
  assert.equal(seriesDirOf(project("ep-none", "---\ntitle: x\n---\n\n# Brief\n")), null);
  assert.equal(seriesDirOf(project("ep-nobrief")), null);
  // A folder without studio-series.json is not a series.
  const empty = join(tmp, "series", "trong");
  mkdirSync(empty, { recursive: true });
  assert.equal(seriesDirOf(project("ep-empty", `---\nseries: ${empty}\n---\n`)), null);
});
