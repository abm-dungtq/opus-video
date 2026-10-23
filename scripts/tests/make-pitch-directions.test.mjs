// make-pitch init --directions: the pitch is built from directions the user chose. The styleframe
// folders are created beforehand so init skips `hyperframes init`, and `up` points at an empty
// folder: RECIPES.md is then thin, which these tests do not read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDirections, pickDirections } from "../directions.mjs";
import { init } from "../make-pitch.mjs";
import { COMMANDS } from "../studio-api.mjs";

const data = loadDirections();
const byId = (id) => data.directions.find((d) => d.id === id);

function project(ids) {
  const d = mkdtempSync(join(tmpdir(), "pitch-dir-"));
  const up = { anim: join(d, "up"), creative: join(d, "up"), faceless: join(d, "up") };
  ids.forEach((id, i) => {
    const dir = join(d, "pitch", `${i + 1}-${byId(id).slug}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), "<html></html>\n");
  });
  return { d, up };
}
const pickJson = (d) => JSON.parse(readFileSync(join(d, "pitch", "PICK.json"), "utf8"));
const base = (d) => ({ project: d, topic: "Lãi kép", aspect: "16:9", category: "explainer", energy: "vua" });

test("--directions keeps the given order and each direction's tier", () => {
  const { d, up } = project(["A8", "A6"]);
  try {
    const r = init({ ...base(d), directions: "A8, A6" }, data, up);
    assert.equal(r.code, 0, r.msg);
    const p = pickJson(d).picks;
    assert.equal(p.length, 2);
    assert.deepEqual(p.map((x) => [x.n, x.id, x.tier]), [[1, "A8", byId("A8").tier], [2, "A6", byId("A6").tier]]);
    assert.ok(Array.isArray(p[0].why) && p[0].why.includes("hợp nhóm explainer"));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("--directions rejects unknown, repeated or too many ids", () => {
  const { d, up } = project([]);
  try {
    for (const bad of ["A9", "A6,A6", "A1,A2,A3,A4", "", " , "]) {
      const r = init({ ...base(d), directions: bad }, data, up);
      assert.equal(r.code, 2, `${JSON.stringify(bad)}: ${r.msg}`);
      assert.match(r.msg, /--directions/);
    }
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("--directions rejects a direction that does not fit the aspect", () => {
  const { d, up } = project([]);
  try {
    const narrow = structuredClone(data);
    narrow.directions.find((x) => x.id === "A3").aspects = ["9:16"];
    const r = init({ ...base(d), directions: "A3" }, narrow, up);
    assert.equal(r.code, 2);
    assert.match(r.msg, /A3 does not fit aspect 16:9/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("--directions rejects a direction banned by the brand", () => {
  const { d, up } = project(["A8"]);
  try {
    writeFileSync(join(d, "brand.json"), JSON.stringify({ palette: { bg: "#000000", fg: "#ffffff", accent: "#ff0000" }, banned_directions: ["A8"] }));
    const r = init({ ...base(d), directions: "A8" }, data, up);
    assert.equal(r.code, 2);
    assert.match(r.msg, /A8 is banned by the brand/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("without --directions the pick is unchanged", () => {
  const o = { topic: "Lãi kép", aspect: "16:9", category: "explainer", energy: "vua" };
  const expected = pickDirections({ ...o, exclude: [] }, data).map((p) => ({ n: p.n, id: p.id }));
  const { d, up } = project(expected.map((p) => p.id));
  try {
    const r = init({ ...base(d) }, data, up);
    assert.equal(r.code, 0, r.msg);
    assert.deepEqual(pickJson(d).picks.map((p) => ({ n: p.n, id: p.id })), expected);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("empty --category and --energy are accepted", () => {
  const { d, up } = project(["A2"]);
  try {
    const r = init({ ...base(d), category: "", energy: "", directions: "A2" }, data, up);
    assert.notEqual(r.code, 2, r.msg);
    assert.equal(r.code, 0, r.msg);
    const info = pickJson(d);
    assert.equal(info.energy, "vua");
    assert.equal(info.category, "");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("pitchInit is declared with every placeholder Studio fills", () => {
  for (const ph of ["{project}", "{topic}", "{aspect}", "{category}", "{energy}", "{directions}"]) assert.ok(COMMANDS.pitchInit.args.includes(ph), ph);
  assert.equal(COMMANDS.pitchInit.args[0], "init");
  assert.equal(COMMANDS.pitchInit.args[COMMANDS.pitchInit.args.indexOf("--directions") + 1], "{directions}");
  assert.equal(COMMANDS.pitchInit.file, COMMANDS.pitch);
});
