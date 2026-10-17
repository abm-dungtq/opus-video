// SFX events in project.json: validation, the <audio> data-start the gateway derives from
// shot.start + offset, ripple with their shot, remove, undo, the "chữ:" rows that follow move_line,
// import from PLAN.md "## Sự kiện", and sfx-sync staying PASS after a resize with no hand edit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyOps, patch, undo, deriveHtml, EXIT } from "../gateway.mjs";
import { load, r3, save, validate } from "../manifest.mjs";
import { importProject } from "../manifest-import.mjs";
import { checkSync } from "../sfx-sync.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/manifest", import.meta.url));
// hit.mp3 opens with 50 ms of silence, so the tag starts 50 ms before the picture event.
const SFX_TAGS = '      <audio id="sfx-hit" src="assets/sfx/hit.mp3" data-start="6.15" data-volume="0.8"></audio>\n      <audio id="sfx-whoosh" src="assets/sfx/whoosh.mp3" data-start="1" data-volume="0.8"></audio>\n';
const EVENTS_MD = "\n## Sự kiện\n| Thời điểm | Sự kiện | Âm thanh |\n|---|---|---|\n| 1.0s | tiêu đề trượt vào | assets/sfx/whoosh.mp3 |\n| 3.0 | chữ: \"bạn đưa\" | — |\n| 6.2s (đo) | thẻ bật lên | assets/sfx/hit.mp3 |\n";
const EVENTS = [
  { id: "sfx-whoosh", shot: "s1", offset: 1, sound: "assets/sfx/whoosh.mp3", label: "tiêu đề trượt vào" },
  { id: "sfx-hit", shot: "s3", offset: 0.35, sound: "assets/sfx/hit.mp3", label: "thẻ bật lên" },
];
// ffmpeg stub: every file peaks at −3 dB; hit.mp3 has 50 ms of leading silence, whoosh none.
const run = (cmd, args) => {
  const f = args[args.indexOf("-i") + 1];
  if (args.includes("volumedetect")) return { status: 0, stderr: "max_volume: -3.0 dB" };
  return { status: 0, stderr: f.endsWith("hit.mp3") ? "silence_start: 0\nsilence_end: 0.05 | silence_duration: 0.05" : "" };
};

// A copy of the manifest fixture with two SFX tags, their "## Sự kiện" rows and sound files;
// withEvents adds the events to project.json.
function withProject(fn, { withEvents = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "events-"));
  try {
    cpSync(FIXTURE, dir, { recursive: true });
    const html = join(dir, "index.html");
    writeFileSync(html, readFileSync(html, "utf8").replace(/(\s*<\/div>\s*<script>)/, `\n${SFX_TAGS.trimEnd()}$1`));
    writeFileSync(join(dir, "PLAN.md"), readFileSync(join(dir, "PLAN.md"), "utf8") + EVENTS_MD);
    mkdirSync(join(dir, "assets", "sfx"), { recursive: true });
    writeFileSync(join(dir, "assets", "sfx", "hit.mp3"), "hit");
    writeFileSync(join(dir, "assets", "sfx", "whoosh.mp3"), "whoosh");
    if (withEvents) save(dir, { ...load(dir), events: structuredClone(EVENTS) });
    return fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const startOf = (dir, id) => Number(readFileSync(join(dir, "index.html"), "utf8").match(new RegExp(`<audio id="${id}"[^>]*data-start="([^"]+)"`))[1]);
const planRow = (dir, label) => readFileSync(join(dir, "PLAN.md"), "utf8").split("\n").find((l) => l.includes(label));

test("events are optional; each event needs an id, a known shot, a numeric offset and a label", () => {
  const m = load(FIXTURE);
  assert.deepEqual(validate(m), [], "a project without events stays valid");
  assert.deepEqual(validate({ ...m, events: EVENTS }), []);
  assert.deepEqual(validate({ ...m, events: [] }), []);
  assert.match(validate({ ...m, events: {} }).join(), /events phải là mảng/);
  const errs = validate({ ...m, events: [
    { id: "sfx-a", shot: "s9", offset: 0, label: "x" },
    { id: "sfx-a", shot: "s1", offset: "1", label: "x" },
    { id: "vo-01", shot: "s1", offset: -1, label: 2, sound: "/abs.mp3" },
    { shot: "s1", offset: 0, label: "" },
  ] }).join("\n");
  assert.match(errs, /sfx-a: shot "s9" không tồn tại/);
  assert.match(errs, /sfx-a: id sự kiện bị trùng/);
  assert.match(errs, /offset phải là số giây/);
  assert.match(errs, /vo-01: id sự kiện trùng id câu thoại/);
  assert.match(errs, /vo-01: thời điểm -1s trước 0s/);
  assert.match(errs, /vo-01: sound phải là đường dẫn tương đối/);
  assert.match(errs, /vo-01: label phải là chuỗi/);
  assert.match(errs, /sự kiện cần id/);
});

test("deriveHtml writes each event's <audio> data-start as shot.start + offset", () => {
  const m = { ...load(FIXTURE), events: EVENTS };
  const html = `<div data-composition-id="main" data-duration="8"><audio id="sfx-hit" src="assets/sfx/hit.mp3" data-start="0"></audio><!-- <audio id="sfx-whoosh" src="x.mp3" data-start="9"> --></div>`;
  const r = deriveHtml(html, m);
  assert.match(r.html, /<audio id="sfx-hit" src="assets\/sfx\/hit\.mp3" data-start="6\.15">/);
  assert.match(r.html, /<!-- <audio id="sfx-whoosh" src="x\.mp3" data-start="9"> -->/, "a tag in a comment is left alone");
  assert.deepEqual(r.missingEvents, ["sfx-whoosh"]);
});

test("resize and add_shot carry events with their shot; remove_shot drops the shot's events with a warning", () => {
  const m = { ...load(FIXTURE), events: structuredClone(EVENTS) };
  const resized = applyOps(m, [{ op: "resize_shot", id: "s2", duration: 3.8 }]).next;
  assert.deepEqual(resized.events, m.events, "offsets are kept; the shot start moves");
  assert.equal(resized.shots[2].start, 6.3);
  const short = applyOps(m, [{ op: "resize_shot", id: "s3", duration: 0.3 }]).receipt.join("\n");
  assert.match(short, /CẢNH BÁO sự kiện sfx-hit: 6\.2s, sau khi s3 kết thúc 6\.1s/);
  const added = applyOps(m, [{ op: "add_shot", after: null, duration: 1 }]).next;
  assert.equal(r3(added.shots.find((s) => s.id === "s3").start + added.events[1].offset), 7.15);
  const removed = applyOps(m, [{ op: "remove_shot", id: "s3" }]);
  assert.deepEqual(removed.next.events.map((e) => e.id), ["sfx-whoosh"]);
  assert.match(removed.receipt.join("\n"), /CẢNH BÁO bỏ sự kiện sfx-hit: s3 đã xoá/);
});

test("a resize in Studio moves the SFX data-start and sfx-sync stays PASS with no hand edit; undo puts it back", () => withProject((dir) => {
  const before = checkSync({ dir, run });
  assert.deepEqual(before.lines.map((l) => l.level), ["PASS", "PASS"], before.errors.join("\n"));
  const r = patch(dir, { actor: "human", base: 1, ops: [{ op: "resize_shot", id: "s2", duration: 3.8 }] });
  assert.equal(r.code, EXIT.ok, r.error);
  assert.equal(startOf(dir, "sfx-hit"), 6.65);
  assert.equal(startOf(dir, "sfx-whoosh"), 1, "an event before the resized shot stays");
  assert.match(planRow(dir, "thẻ bật lên"), /\| 6\.7s \(đo\) \|/);
  const after = checkSync({ dir, run });
  assert.deepEqual(after.lines.map((l) => [l.level, l.delta_ms]), [["PASS", 0], ["PASS", 0]]);
  assert.equal(undo(dir, { base: 2 }).code, EXIT.ok);
  assert.equal(startOf(dir, "sfx-hit"), 6.15);
  assert.match(planRow(dir, "thẻ bật lên"), /\| 6\.2s \(đo\) \|/);
  assert.deepEqual(load(dir).events, EVENTS);
}));

test("remove_shot through the gateway drops its events from project.json, and undo restores them", () => withProject((dir) => {
  assert.equal(patch(dir, { actor: "human", base: 1, ops: [{ op: "remove_shot", id: "s3" }] }).code, EXIT.ok);
  assert.deepEqual(load(dir).events.map((e) => e.id), ["sfx-whoosh"]);
  assert.equal(planRow(dir, "thẻ bật lên"), undefined);
  assert.equal(undo(dir, { base: 2 }).code, EXIT.ok);
  assert.deepEqual(load(dir).events, EVENTS);
  assert.match(planRow(dir, "thẻ bật lên"), /\| 6\.2s \(đo\) \|/);
}));

test("move_line leaves events alone and moves the moved line's chữ: row; undo moves it back", () => withProject((dir) => {
  const r = patch(dir, { actor: "human", base: 1, ops: [{ op: "move_line", id: "vo-01", start: 3 }] });
  assert.equal(r.code, EXIT.ok, r.error);
  assert.deepEqual(load(dir).events, EVENTS);
  assert.equal(startOf(dir, "sfx-hit"), 6.15);
  assert.match(planRow(dir, "bạn đưa"), /^\| 3\.5 \|/);
  assert.match(planRow(dir, "thẻ bật lên"), /\| 6\.2s \(đo\) \|/, "SFX rows stay with their shot");
  assert.equal(undo(dir, { base: 2 }).code, EXIT.ok);
  assert.match(planRow(dir, "bạn đưa"), /^\| 3\.0 \|/);
}));

test("import reads events from the Sự kiện rows that name a sound, matching <audio> tags by src", () => withProject((dir) => {
  const html = join(dir, "index.html");
  // A second hit.mp3 tag far from the event, and a row whose sound has no tag.
  writeFileSync(html, readFileSync(html, "utf8").replace("<audio id=\"sfx-whoosh\"", "<audio id=\"sfx-hit-2\" src=\"assets/sfx/hit.mp3\" data-start=\"0.2\"></audio>\n      <audio id=\"sfx-whoosh\""));
  writeFileSync(join(dir, "PLAN.md"), readFileSync(join(dir, "PLAN.md"), "utf8") + "| 7.5 | biến mất | assets/sfx/pop.mp3 |\n");
  const { manifest: m, warnings } = importProject(dir);
  assert.deepEqual(m.events, EVENTS);
  assert.deepEqual(validate(m), []);
  assert.match(warnings.join("\n"), /sự kiện 7\.5s "biến mất": không có thẻ <audio src="assets\/sfx\/pop\.mp3">/);
}, { withEvents: false }));

test("import leaves events out when PLAN.md names no sound, and warns about a tag with no id", () => withProject((dir) => {
  const html = join(dir, "index.html");
  writeFileSync(html, readFileSync(html, "utf8").replace(/<audio id="sfx-[a-z]+" /g, "<audio "));
  const { manifest: m, warnings } = importProject(dir);
  assert.equal(m.events, undefined);
  assert.match(warnings.join("\n"), /cần id riêng/);
}, { withEvents: false }));
