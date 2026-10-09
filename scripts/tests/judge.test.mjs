import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  consensusOf, mapWinner, parseEnvelope, countTextMatches, htmlToText, normalizeText, buildCorpus,
} from "../judge.mjs";

const script = fileURLToPath(new URL("../judge.mjs", import.meta.url));
const fakeAgy = fileURLToPath(new URL("./fixtures/fake-agy.mjs", import.meta.url));
const PROJECT = process.env.OPUS_VIDEO_SMOKE_DIR ?? "/Volumes/2/Edit-Video/opus-video-smoke";
const VIDEO = join(PROJECT, "renders/smoke-16x9.mp4");
const haveFixture = existsSync(VIDEO);

const tmp = mkdtempSync(join(tmpdir(), "judge-test-"));
test.after(() => rmSync(tmp, { recursive: true, force: true }));

function run(mode, args, agyBin = fakeAgy) {
  const r = spawnSync("node", [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, AGY_BIN: agyBin, FAKE_AGY_MODE: mode },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}
const checkArgs = (out) => ["check", "--video", VIDEO, "--hyperframes", PROJECT, "--out", out];
const readOut = (p) => JSON.parse(readFileSync(p, "utf8"));

// ---------- pure helpers ----------

test("consensusOf: A/A → A, B/B → B, A/B → tie, any invalid → invalid", () => {
  assert.equal(consensusOf("A", "A"), "A");
  assert.equal(consensusOf("B", "B"), "B");
  assert.equal(consensusOf("A", "B"), "tie");
  assert.equal(consensusOf("A", "tie"), "tie");
  assert.equal(consensusOf("invalid", "A"), "invalid");
  assert.equal(consensusOf("B", "invalid"), "invalid");
});

test("mapWinner follows the swapped order", () => {
  assert.equal(mapWinner("first", "AB"), "A");
  assert.equal(mapWinner("first", "BA"), "B");
  assert.equal(mapWinner("second", "BA"), "A");
  assert.equal(mapWinner("tie", "BA"), "tie");
  assert.equal(mapWinner("bogus", "AB"), "invalid");
});

test("parseEnvelope reads structured_output only on SUCCESS", () => {
  const ok = parseEnvelope(JSON.stringify({ status: "SUCCESS", structured_output: { verdict: "PASS" } }));
  assert.deepEqual(ok, { kind: "ok", data: { verdict: "PASS" } });
  assert.equal(parseEnvelope(JSON.stringify({ status: "SUCCESS", response: "{}" })).kind, "invalid");
  assert.equal(parseEnvelope(JSON.stringify({ status: "ERROR", structured_output: {} })).kind, "invalid");
  assert.equal(parseEnvelope("not json").kind, "invalid");
  assert.equal(parseEnvelope("").kind, "invalid");
  assert.equal(parseEnvelope("", "Error: Not logged in").kind, "auth");
  assert.equal(parseEnvelope(JSON.stringify({ status: "ERROR", error: "account not eligible" })).kind, "auth");
});

test("fingerprint matching counts phrases one by one and ignores short ones", () => {
  const corpus = normalizeText(htmlToText('<p>Đơn vị <b>tiên phong</b></p><span>29</span><i>+</i><span>khóa học</span><script>var x="Lorem ipsum"</script>'));
  const r = countTextMatches(["ĐƠN VỊ TIÊN PHONG", "29 khóa học", "khóa học", "Lorem ipsum", "29"], corpus);
  assert.deepEqual(r, { matched: 2, total: 4 });
  assert.equal(countTextMatches(undefined, corpus).total, 0);
});

test("buildCorpus gathers index.html and compositions", { skip: !haveFixture }, () => {
  const c = buildCorpus(PROJECT);
  assert.ok(c.includes("ánh nắng trông trắng"));
  assert.ok(c.includes("tán xạ rayleigh ∝ 1/λ⁴")); // only in compositions/main-9x16.html
  assert.ok(!c.includes("<"));
});

// ---------- CLI with fake agy ----------

test("check + pass: exit 0, valid", { skip: !haveFixture }, () => {
  const out = join(tmp, "pass.json");
  const r = run("pass", checkArgs(out));
  assert.equal(r.code, 0, r.stderr);
  const j = readOut(out);
  assert.equal(j.mode, "check");
  assert.equal(j.status, "valid");
  assert.equal(j.result.verdict, "PASS");
  assert.ok(j.fingerprint.matched >= 2 && j.fingerprint.duration_diff_s <= 3);
  assert.deepEqual(j.frames, []);
});

test("check + nofp: exit 2, invalid after one retry", { skip: !haveFixture }, () => {
  const out = join(tmp, "nofp.json");
  const r = run("nofp", checkArgs(out));
  assert.equal(r.code, 2, r.stderr);
  assert.equal(readOut(out).status, "invalid");
  assert.equal((r.stderr.match(/invalid —/g) || []).length, 2);
});

test("check + fail: exit 1 and a frame for the hard issue", { skip: !haveFixture }, () => {
  const out = join(tmp, "fail.json");
  const r = run("fail", checkArgs(out));
  assert.equal(r.code, 1, r.stderr);
  const j = readOut(out);
  assert.equal(j.status, "valid");
  assert.deepEqual(j.frames, [join(tmp, "fail_frames", "t-2.png")]);
  assert.ok(existsSync(j.frames[0]));
});

test("check + auth: exit 3 with AGY_AUTH", { skip: !haveFixture }, () => {
  const r = run("auth", checkArgs(join(tmp, "auth.json")));
  assert.equal(r.code, 3);
  assert.match(r.stderr, /AGY_AUTH/);
});

test("missing agy: exit 4 with AGY_MISSING", () => {
  const r = run("pass", checkArgs(join(tmp, "x.json")), join(tmp, "no-such-agy"));
  assert.equal(r.code, 4);
  assert.match(r.stderr, /AGY_MISSING/);
});

test("pair + pair-first: swapped order yields tie", { skip: !haveFixture }, () => {
  const out = join(tmp, "pair.json");
  const r = run("pair-first", ["pair", "--a", VIDEO, "--b", VIDEO, "--out", out]);
  assert.equal(r.code, 0, r.stderr);
  const j = readOut(out);
  assert.equal(j.mode, "pair");
  assert.equal(j.consensus, "tie");
  assert.deepEqual(j.runs.map((x) => [x.order, x.winner_mapped]), [["AB", "A"], ["BA", "B"]]);
});

test("pair + auth: exit 3", { skip: !haveFixture }, () => {
  const r = run("auth", ["pair", "--a", VIDEO, "--b", VIDEO, "--out", join(tmp, "pa.json")]);
  assert.equal(r.code, 3);
});

test("parseEnvelope: model text mentioning login is not an auth error", () => {
  const env = JSON.stringify({ status: "FAILED", response: "FAKE_UI: a fake login screen" });
  assert.equal(parseEnvelope(env, "").kind, "invalid");
  assert.equal(parseEnvelope("", "Error: not logged in").kind, "auth");
  assert.equal(parseEnvelope(JSON.stringify({ status: "ERROR", error: { message: "please sign in" } }), "").kind, "auth");
});
