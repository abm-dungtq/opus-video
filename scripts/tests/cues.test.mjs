// cues.mjs: an SFX anchored to a word sounds on the word, is clamped at 0, is flagged after timing
// changes and placed again; a hand move drops the anchor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { main, checkCues } from "../cues.mjs";
import { main as beatFit } from "../beat-fit.mjs";
import { patch, EXIT } from "../gateway.mjs";
import { load, save } from "../manifest.mjs";
import { beatProject, wordsOf } from "./fixtures/beat-project.mjs";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const skip = !hasFfmpeg && "ffmpeg missing";
const capture = () => {
  const buf = { out: "", err: "" };
  return { buf, io: { out: (s) => { buf.out += s; }, err: (s) => { buf.err += s; } } };
};
// The project with a 0.3 s SFX whose first 50 ms are silent.
function project() {
  const dir = beatProject({ prefix: "cues-" });
  mkdirSync(join(dir, "assets/sfx"), { recursive: true });
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "aevalsrc='if(lt(t,0.05),0,0.5*sin(2*PI*800*t))':s=48000:d=0.3", join(dir, "assets/sfx/pop.wav")]);
  assert.equal(r.status, 0, String(r.stderr));
  return dir;
}
const withProject = async (fn) => { const dir = project(); try { return await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };
const startOf = (m, e) => m.shots.find((s) => s.id === e.shot).start + e.offset;
const add = async (dir, args) => {
  const c = capture();
  const code = await main(["add", "--project", dir, "--sound", "assets/sfx/pop.wav", ...args, "--apply"], c.io);
  return { code, ...c.buf };
};

test("add --word: the event keeps the anchor (word, shot, lead) and start + lead is the word's onset", { skip }, () => withProject(async (dir) => {
  const r = await add(dir, ["--shot", "s2", "--word", "mã nguồn"]);
  assert.equal(r.code, 0, r.err);
  const m = load(dir), e = m.events.find((x) => x.anchor);
  assert.equal(e.anchor.word, "mã nguồn");
  assert.equal(e.anchor.shot, "s2");
  assert.equal(e.studio, true);
  assert.ok(Math.abs(e.anchor.lead - 0.05) < 0.01, `lead ${e.anchor.lead}`);
  const onset = wordsOf(m, "vo-02").find((w) => w.text === "mã").start;
  assert.ok(Math.abs(startOf(m, e) + e.anchor.lead - onset) <= 0.001, `${startOf(m, e)} + ${e.anchor.lead} vs ${onset}`);
  const c = capture();
  assert.equal(await main(["check", "--project", dir], c.io), 0);
  assert.match(c.buf.out, /^CUES OK$/m);
  assert.doesNotMatch(c.buf.out, /WARN|FAIL/);
}));

test("a word 10 ms into the first shot with a 50 ms lead: the event is clamped at 0 with a WARN", { skip }, () => withProject(async (dir) => {
  const m = load(dir);
  m.lines[0].start = 0;
  save(dir, m);
  writeFileSync(join(dir, "assets/voice/01.mp3.words.json"), JSON.stringify([{ text: "Xin", start: 0.01, end: 0.4 }, { text: "chào", start: 0.4, end: 1 }]));
  const r = await add(dir, ["--shot", "s1", "--word", "xin"]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /WARN .*lead lớn hơn thời điểm anchor, đặt ở 0s/);
  assert.equal(startOf(load(dir), load(dir).events.find((x) => x.anchor)), 0);
}));

test("after beat-fit moves the shots, check warns; place --apply fixes it and check is clean", { skip }, () => withProject(async (dir) => {
  // Beat 10 (5.1 s) sits in s2; the event is stored as an offset in s2, so it rides with the shot
  // while its beat stays put.
  assert.equal((await add(dir, ["--beat", "10"])).code, 0);
  assert.deepEqual(checkCues(dir, load(dir)), { fails: [], warns: [] });
  const bf = capture();
  assert.equal(await beatFit(["--project", dir, "--tight", "--apply"], bf.io), 0, bf.buf.err);
  const before = checkCues(dir, load(dir));
  assert.equal(before.fails.length, 0);
  assert.match(before.warns.join("\n"), /^sfx-\d+ lệch -?\d+ms so với anchor; chạy cues\.mjs place --apply$/m);
  const p = capture();
  assert.equal(await main(["place", "--project", dir, "--apply"], p.io), 0, p.buf.err);
  assert.match(p.buf.out, /APPLIED v\d+/);
  assert.deepEqual(checkCues(dir, load(dir)), { fails: [], warns: [] });
  const e = load(dir).events[0];
  assert.equal(e.anchor.beat, 10, "place keeps the anchor");
  assert.ok(Math.abs(startOf(load(dir), e) + e.anchor.lead - 5.1) <= 0.001);
}));

test("an anchor past the end of a shortened video is a FAIL; place re-seats the others and exits 1", { skip }, () => withProject(async (dir) => {
  assert.equal((await add(dir, ["--beat", "10"])).code, 0);
  assert.equal((await add(dir, ["--beat", "16"])).code, 0);
  const bf = capture();
  assert.equal(await beatFit(["--project", dir, "--tight", "--apply"], bf.io), 0, bf.buf.err);
  assert.ok(load(dir).duration < 8.1, String(load(dir).duration));
  const late = load(dir).events.find((e) => e.anchor.beat === 16).id;
  const before = checkCues(dir, load(dir));
  assert.match(before.fails.join("\n"), new RegExp(`^${late}: mốc 8\\.1s nằm ngoài video`, "m"));
  const p = capture();
  assert.equal(await main(["place", "--project", dir, "--apply"], p.io), 1);
  assert.match(p.buf.err, new RegExp(`^FAIL ${late}: `, "m"));
  assert.match(p.buf.out, /APPLIED v\d+/);
  const after = checkCues(dir, load(dir));
  assert.equal(after.fails.length, 1);
  assert.deepEqual(after.warns, []);
}));

test("a hand move_event drops the anchor and check no longer names the event; a lost word is a FAIL", { skip }, () => withProject(async (dir) => {
  assert.equal((await add(dir, ["--shot", "s2", "--word", "mã"])).code, 0);
  let m = load(dir);
  const id = m.events[0].id;
  assert.equal(patch(dir, { actor: "human", base: m.version, ops: [{ op: "move_event", id, start: 1 }] }).code, EXIT.ok);
  m = load(dir);
  assert.equal("anchor" in m.events[0], false);
  assert.deepEqual(checkCues(dir, m), { fails: [], warns: [] });
  assert.equal((await add(dir, ["--shot", "s3", "--word", "hết"])).code, 0);
  writeFileSync(join(dir, "assets/voice/03.mp3.words.json"), JSON.stringify([{ text: "Xong", start: 0.2, end: 0.6 }]));
  const c = capture();
  assert.equal(await main(["check", "--project", dir], c.io), 1);
  assert.match(c.buf.out, /^FAIL .*không thấy "hết" lần 1 trong s3$/m);
}));

test("bad usage exits 2", { skip }, () => withProject(async (dir) => {
  for (const argv of [["nope"], ["add", "--project", dir], ["add", "--project", dir, "--sound", "assets/sfx/pop.wav", "--beat", "1", "--abs", "2"],
    ["add", "--project", dir, "--sound", "assets/sfx/none.wav", "--abs", "1"], ["add", "--project", dir, "--sound", "assets/sfx/pop.wav", "--word", "x"],
    ["add", "--project", dir, "--sound", "assets/sfx/pop.wav", "--shot", "s2", "--word", "--apply"]]) {
    const c = capture();
    assert.equal(await main(argv, c.io), 2, argv.join(" "));
  }
}));
