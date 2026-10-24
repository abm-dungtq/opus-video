// manifest.mjs: project.json validator, load and atomic save.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCHEMA, validate, load, save } from "../manifest.mjs";

export const sample = () => ({
  schema: SCHEMA, title: "t", fps: 30, width: 1920, height: 1080, duration: 8, html: "index.html",
  capabilities: { timing_markers: true, editable: true },
  shots: [
    { id: "s1", name: "A", start: 0, end: 2.5, transition_in: "", motion_note: "", assets: [] },
    { id: "s2", name: "B", start: 2.5, end: 5.8, transition_in: "", motion_note: "", assets: ["assets/img/a.png"] },
    { id: "s3", name: "C", start: 5.8, end: 8, transition_in: "", motion_note: "", assets: [] },
  ],
  lines: [{ id: "vo-01", shot: "s2", text: "Bạn đưa cả mã nguồn.", file: "assets/voice/01.mp3", start: 2.5, duration: 3, gate: "pass" }],
  music: [{ id: "bgm", file: "assets/bgm/bgm.mp3", start: 0, end: 8, gain: 0.3 }],
  assets: [{ path: "assets/img/a.png", kind: "image" }],
  version: 1, updated: "2026-10-16T00:00:00Z",
});

const fails = (mut, re) => {
  const m = sample();
  mut(m);
  const e = validate(m);
  assert.ok(e.some((x) => re.test(x)), `expected ${re} in ${JSON.stringify(e)}`);
};

test("a valid manifest has no errors", () => assert.deepEqual(validate(sample()), []));
test("wrong schema", () => fails((m) => { m.schema = "x"; }, /schema/));
test("overlapping shots", () => fails((m) => { m.shots[1].start = 2; }, /không nối tiếp/));
test("gap between shots", () => fails((m) => { m.shots[1].start = 3; }, /không nối tiếp/));
test("bad shot id", () => fails((m) => { m.shots[0].id = "scene1"; }, /dạng s<#>/));
test("duplicate shot id", () => fails((m) => { m.shots[1].id = "s1"; }, /bị trùng/));
test("end not after start", () => fails((m) => { m.shots[2].end = 5.8; }, /0 ≤ start < end/));
test("duration differs from the last shot end", () => fails((m) => { m.duration = 9; }, /duration/));
test("line points at an unknown shot", () => fails((m) => { m.lines[0].shot = "s9"; }, /không tồn tại/));
test("line with negative start", () => fails((m) => { m.lines[0].start = -1; }, /start phải ≥ 0/));
test("unknown gate value", () => fails((m) => { m.lines[0].gate = "ok"; }, /gate/));
test("music gain above 1", () => fails((m) => { m.music[0].gain = 1.5; }, /gain/));
test("absolute asset path", () => fails((m) => { m.assets[0].path = "/etc/passwd"; }, /tương đối/));
test("parent-directory path", () => fails((m) => { m.shots[1].assets = ["../x.png"]; }, /tương đối/));
test("version must be a positive integer", () => fails((m) => { m.version = 0; }, /version/));
test("speaker is optional; when present it is a role id", () => {
  const m = sample();
  m.lines[0].speaker = "ba-noi";
  assert.deepEqual(validate(m), []);
  fails((x) => { x.lines[0].speaker = "Bà Nội"; }, /speaker/);
  fails((x) => { x.lines[0].speaker = 7; }, /speaker/);
});

test("save then load round-trips and leaves no temp file", () => {
  const dir = mkdtempSync(join(tmpdir(), "manifest-"));
  try {
    assert.equal(load(dir), null);
    save(dir, sample());
    assert.deepEqual(load(dir), sample());
    assert.deepEqual(readdirSync(dir), ["project.json"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
