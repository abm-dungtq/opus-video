// beat-fit.mjs: cuts land on beats after the voice, pinned cuts on their beat, --apply is one
// undoable change, a picture built from code is left alone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { main } from "../beat-fit.mjs";
import { undo, patch, EXIT } from "../gateway.mjs";
import { load, save } from "../manifest.mjs";
import { GRID, beatProject, wordsOf } from "./fixtures/beat-project.mjs";

const capture = () => {
  const buf = { out: "", err: "" };
  return { buf, io: { out: (s) => { buf.out += s; }, err: (s) => { buf.err += s; } } };
};
const onBeat = (t) => Math.abs(((t - GRID.beat0) / GRID.beatLen) - Math.round((t - GRID.beat0) / GRID.beatLen)) < 0.002;
const withProject = async (fn) => { const dir = beatProject(); try { return await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };

test("--tight: every cut is on a beat, 0.12 s to 0.12 s + one beat after the voice of the shot before", () => withProject(async (dir) => {
  const c = capture();
  assert.equal(await main(["--project", dir, "--tight", "--apply"], c.io), 0, c.buf.err);
  assert.match(c.buf.out, /^shot \| cũ start \| mới start \| beat \| lý do$/m);
  const m = load(dir);
  for (let k = 1; k < m.shots.length; k++) {
    const start = m.shots[k].start, prev = m.lines.filter((l) => l.shot === m.shots[k - 1].id);
    const voiceEnd = Math.max(...prev.flatMap((l) => wordsOf(m, l.id).map((w) => w.end)));
    assert.ok(onBeat(start), `${m.shots[k].id} at ${start} is not on a beat`);
    const gap = start - voiceEnd;
    assert.ok(gap >= 0.12 - 1e-6 && gap <= 0.12 + GRID.beatLen + 1e-6, `${m.shots[k].id}: gap ${gap}`);
  }
}));

test("a shot pinned to beat 8 starts at beat0 + 8·beatLen; cutting into the voice is a WARN", () => withProject(async (dir) => {
  const m = load(dir);
  const r = patch(dir, { actor: "human", base: m.version, ops: [{ op: "pin_beat", target: "shot", id: "s3", beat: 8 }] });
  assert.equal(r.code, EXIT.ok, r.error);
  const c = capture();
  assert.equal(await main(["--project", dir, "--tight", "--apply"], c.io), 0, c.buf.err);
  assert.ok(Math.abs(load(dir).shots[2].start - (0.1 + 8 * 0.5)) <= 0.001, String(load(dir).shots[2].start));
  assert.match(c.buf.out, /WARN cắt s3 ở beat ghim 8 sẽ cắt lời vo-02/);
}));

test("a line with at_beat moves so its first word lands on the beat", () => withProject(async (dir) => {
  const m = load(dir);
  m.lines[1].at_beat = 7;
  save(dir, m);
  const c = capture();
  assert.equal(await main(["--project", dir, "--apply"], c.io), 0, c.buf.err);
  const after = load(dir);
  assert.ok(Math.abs(wordsOf(after, "vo-02")[0].start - (0.1 + 7 * 0.5)) <= 0.001);
}));

test("--tight with a line pinned by at_beat: the next cut follows the moved voice, a second run has nothing to do", () => withProject(async (dir) => {
  const m = load(dir);
  m.lines[1].at_beat = 7;
  save(dir, m);
  const c = capture();
  assert.equal(await main(["--project", dir, "--tight", "--apply"], c.io), 0, c.buf.err);
  assert.doesNotMatch(c.buf.out, /chồng lên cắt/);
  const after = load(dir);
  assert.ok(Math.abs(wordsOf(after, "vo-02")[0].start - (0.1 + 7 * 0.5)) <= 0.001);
  for (let k = 1; k < after.shots.length; k++) {
    const prev = after.lines.filter((l) => l.shot === after.shots[k - 1].id);
    const voiceEnd = Math.max(...prev.flatMap((l) => wordsOf(after, l.id).map((w) => w.end)));
    assert.ok(after.shots[k].start >= voiceEnd + 0.12 - 1e-6, `${after.shots[k].id} at ${after.shots[k].start} cuts into the voice ending ${voiceEnd}`);
  }
  const again = capture();
  assert.equal(await main(["--project", dir, "--tight"], again.io), 0, again.buf.err);
  assert.match(again.buf.out, /beat-fit: đã khớp beat/);
}));

test("--apply adds one version and undo puts every start back; a second run has nothing to do", () => withProject(async (dir) => {
  const before = load(dir);
  const c = capture();
  assert.equal(await main(["--project", dir, "--tight", "--apply"], c.io), 0, c.buf.err);
  assert.match(c.buf.out, new RegExp(`^APPLIED v${before.version + 1}$`, "m"));
  assert.match(c.buf.out, /^hoàn tác: gateway\.mjs undo --project .* --base \d+$/m);
  const again = capture();
  assert.equal(await main(["--project", dir, "--tight"], again.io), 0);
  assert.match(again.buf.out, /beat-fit: đã khớp beat/);
  assert.equal(undo(dir, { base: before.version + 1 }).code, EXIT.ok);
  assert.deepEqual(load(dir).shots.map((s) => s.start), before.shots.map((s) => s.start));
}));

test("picture built from code: WARN, exit 0, no new version; no project.json or no grid exits 2", () => withProject(async (dir) => {
  const m = load(dir);
  m.capabilities.picture_from_code = true;
  save(dir, m);
  const c = capture();
  assert.equal(await main(["--project", dir, "--tight", "--apply"], c.io), 0);
  assert.match(c.buf.out, /WARN beat-fit bỏ qua/);
  assert.equal(load(dir).version, m.version);
  rmSync(`${dir}/assets/bgm/bgm.wav.beats.json`);
  m.capabilities.picture_from_code = false;
  save(dir, m);
  const g = capture();
  assert.equal(await main(["--project", dir], g.io), 2);
  assert.match(g.buf.err, /beat-grid\.mjs/);
  const n = capture();
  assert.equal(await main(["--project", `${dir}/assets`], n.io), 2);
  assert.match(n.buf.err, /beat-fit cần project\.json/);
}));
