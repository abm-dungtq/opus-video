import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ENERGY_RANGE, loadProfiles } from "../styles.mjs";
import { COMMANDS } from "../studio-api.mjs";

const SCRIPT = fileURLToPath(new URL("../suggest.mjs", import.meta.url));
const profiles = loadProfiles();
const run = (args) => spawnSync("node", [SCRIPT, ...args], { encoding: "utf8", timeout: 15000 });
const withBrief = (fm, fn) => {
  const d = mkdtempSync(join(tmpdir(), "suggest-"));
  try {
    writeFileSync(join(d, "BRIEF.md"), `---\n${fm}\n---\n\n# Brief\n`);
    return fn(d);
  } finally { rmSync(d, { recursive: true, force: true }); }
};

test("prints three directions, one per tier, for a brief", () => withBrief("category: explainer\naspect: 16:9\nenergy: vua\ntopic: Cách lãi kép làm tiền tăng", (d) => {
  const r = run(["--project", d, "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.v, 1);
  assert.equal(out.energy, "vua");
  assert.deepEqual(out.directions.map((x) => x.tier), ["fit", "continuous", "bold"]);
  for (const x of out.directions) {
    assert.ok(Array.isArray(x.why), x.id);
    assert.ok(x.name && x.tier_vi && Number.isFinite(x.score), x.id);
    assert.ok(Array.isArray(out.styles[x.id]), x.id);
  }
  assert.deepEqual(Object.keys(out.styles).sort(), out.directions.map((x) => x.id).sort());
  assert.deepEqual(readdirSync(d), ["BRIEF.md"]);
}));

test("styles follow the energy", () => withBrief("category: explainer\naspect: 9:16\nenergy: em", (d) => {
  const out = JSON.parse(run(["--project", d, "--json"]).stdout);
  const [lo, hi] = ENERGY_RANGE.em;
  const all = Object.values(out.styles).flat();
  for (const id of all) assert.ok(profiles[id].energy >= lo && profiles[id].energy <= hi, `${id} energy ${profiles[id].energy}`);
}));

test("a brief without a valid energy reports null and keeps every suggested style", () => withBrief("aspect: 16:9\nenergy: <em|vua|don-dap>", (d) => {
  const out = JSON.parse(run(["--project", d, "--json"]).stdout);
  assert.equal(out.energy, null);
  assert.equal(out.directions.length, 3);
}));

test("a direction banned by the brand is left out", () => withBrief("category: explainer\naspect: 16:9\nenergy: vua", (d) => {
  const first = JSON.parse(run(["--project", d, "--json"]).stdout).directions[0].id;
  writeFileSync(join(d, "brand.json"), JSON.stringify({ banned_directions: [first] }));
  const out = JSON.parse(run(["--project", d, "--json"]).stdout);
  assert.ok(!out.directions.some((x) => x.id === first));
}));

test("exits 2 without BRIEF.md", () => {
  const d = mkdtempSync(join(tmpdir(), "suggest-"));
  try {
    const r = run(["--project", d, "--json"]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /BRIEF\.md not found/);
    assert.equal(r.stdout, "");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("exits 2 on a bad argument or a missing --project", () => {
  assert.equal(run(["--json"]).status, 2);
  assert.equal(run(["--project"]).status, 2);
  assert.equal(run(["--project", ".", "--what"]).status, 2);
});

test("same brief, same answer", () => withBrief("category: product\naspect: 9:16\nenergy: don-dap\ntopic: Ra mắt tai nghe mới", (d) => {
  const a = run(["--project", d, "--json"]);
  const b = run(["--project", d, "--json"]);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(a.stdout, b.stdout);
  assert.equal(a.stdout.trim().split("\n").length, 1);
}));

test("without --json it prints a Vietnamese table", () => withBrief("aspect: 16:9\nenergy: vua", (d) => {
  const r = run(["--project", d]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /điểm/);
  assert.match(r.stdout, /Nhịp theo BRIEF: vua/);
}));

test("the command is declared for Studio", () => {
  assert.ok(COMMANDS.suggest.args.includes("{project}"));
  assert.ok(COMMANDS.suggest.args.includes("--json"));
  assert.ok(existsSync(COMMANDS.suggest.file));
  assert.equal(COMMANDS.suggest.file, SCRIPT);
});
