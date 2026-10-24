// gateway.mjs: the one writer of project.json (ops, versions, lock, undo) and derive, which
// rewrites the TIMING block, voice data-start, root data-duration, PLAN.md times and timing.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { applyOps, patch, undo, redo, redoTarget, derive, readHistory, deriveHtml, derivePlan, remapEvents, EXIT } from "../gateway.mjs";
import { load, save } from "../manifest.mjs";
import { main as timingMain } from "../timing.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/manifest", import.meta.url));
const GATEWAY = fileURLToPath(new URL("../gateway.mjs", import.meta.url));
const project = () => {
  const dir = mkdtempSync(join(tmpdir(), "gateway-"));
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
};
const snapshot = (dir) => Object.fromEntries(["project.json", "index.html", "PLAN.md"].map((f) => [f, readFileSync(join(dir, f), "utf8")]));
const timingOf = (html) => JSON.parse(html.match(/window\.TIMING = (\{.*\});/)[1]);
const withProject = (fn) => { const dir = project(); try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };

test("resize_shot ripples later shots and their lines, and the duration follows", () => {
  const m = load(FIXTURE);
  const { next, receipt } = applyOps(m, [{ op: "resize_shot", id: "s1", duration: 3.5 }]);
  assert.deepEqual(next.shots.map((s) => [s.start, s.end]), [[0, 3.5], [3.5, 6.8], [6.8, 9]]);
  assert.equal(next.lines[0].start, 3.5);
  assert.equal(next.duration, 9);
  assert.match(receipt.join("; "), /s1: 2\.5s → 3\.5s; dời s2–s3 \+1s/);
  assert.equal(m.shots[0].end, 2.5, "applyOps is pure");
});

test("move_line moves the line into the shot holding its new start", () => {
  const { next } = applyOps(load(FIXTURE), [{ op: "move_line", id: "vo-01", start: 6 }]);
  assert.equal(next.lines[0].start, 6);
  assert.equal(next.lines[0].shot, "s3");
});

test("add_shot and remove_shot ripple; remove_shot refuses a shot with lines", () => {
  const m = load(FIXTURE);
  const added = applyOps(m, [{ op: "add_shot", after: "s1", name: "Mới", duration: 1 }]).next;
  assert.deepEqual(added.shots.map((s) => s.id), ["s1", "s4", "s2", "s3"]);
  assert.equal(added.lines[0].start, 3.5);
  assert.equal(added.duration, 9);
  const removed = applyOps(m, [{ op: "remove_shot", id: "s3" }]).next;
  assert.equal(removed.duration, 5.8);
  assert.throws(() => applyOps(m, [{ op: "remove_shot", id: "s2" }]), /còn câu thoại vo-01/);
});

test("set_line_text marks the line stale; unknown op and id are refused", () => {
  const { next } = applyOps(load(FIXTURE), [{ op: "set_line_text", id: "vo-01", text: "Lời mới." }]);
  assert.equal(next.lines[0].gate, "stale");
  assert.throws(() => applyOps(load(FIXTURE), [{ op: "explode" }]), /op không hợp lệ/);
  assert.throws(() => applyOps(load(FIXTURE), [{ op: "resize_shot", id: "s9", duration: 1 }]), /không có shot s9/);
});

test("patch writes a new version, a snapshot of both versions and a history line", () => withProject((dir) => {
  const r = patch(dir, { actor: "human", base: 1, ops: [{ op: "resize_shot", id: "s1", duration: 3.5 }] });
  assert.equal(r.code, EXIT.ok, r.error);
  assert.equal(r.version, 2);
  assert.equal(load(dir).version, 2);
  assert.deepEqual(readdirSync(join(dir, ".opus", "versions")).sort(), ["v1.json", "v2.json"]);
  const h = readHistory(dir);
  assert.equal(h.length, 1);
  assert.equal(h[0].actor, "human");
  assert.equal(h[0].base, 1);
  assert.ok(!existsSync(join(dir, ".opus", "lock")), "lock released");
}));

test("a stale base is a CONFLICT and leaves every file byte-identical", () => withProject((dir) => {
  const before = snapshot(dir);
  const r = patch(dir, { actor: "human", base: 7, ops: [{ op: "resize_shot", id: "s1", duration: 3 }] });
  assert.equal(r.code, EXIT.conflict);
  assert.match(r.error, /CONFLICT/);
  assert.deepEqual(snapshot(dir), before);
}));

test("an op that breaks the rules is INVALID and leaves every file byte-identical", () => withProject((dir) => {
  const before = snapshot(dir);
  const r = patch(dir, { actor: "human", base: 1, ops: [{ op: "set_music", id: "bgm", field: "gain", value: 2 }] });
  assert.equal(r.code, EXIT.invalid);
  const r2 = patch(dir, { actor: "human", base: 1, ops: [{ op: "move_line", id: "vo-01", start: -3 }] });
  assert.equal(r2.code, EXIT.invalid);
  assert.deepEqual(snapshot(dir), before);
}));

test("undo restores the state before the newest change as a new version", () => withProject((dir) => {
  const v1 = load(dir);
  assert.equal(patch(dir, { actor: "human", base: 1, ops: [{ op: "resize_shot", id: "s1", duration: 3.5 }] }).code, 0);
  const html1 = readFileSync(join(FIXTURE, "index.html"), "utf8");
  const u = undo(dir, { base: 2 });
  assert.equal(u.code, EXIT.ok, u.error);
  const v3 = load(dir);
  assert.equal(v3.version, 3);
  assert.deepEqual(v3.shots, v1.shots);
  assert.deepEqual(v3.lines, v1.lines);
  assert.equal(readHistory(dir).at(-1).actor, "undo");
  assert.equal(readHistory(dir).at(-1).undoes, 2);
  assert.match(readFileSync(join(dir, "index.html"), "utf8"), /id="vo-01" src="assets\/voice\/01\.mp3" data-start="2\.5"/);
  assert.notEqual(readFileSync(join(dir, "index.html"), "utf8"), html1, "TIMING block was filled");
  assert.equal(undo(dir, { base: 3 }).code, EXIT.nothingToUndo);
}));

test("a view-only project refuses patch, undo and derive", () => withProject((dir) => {
  const m = load(dir);
  m.capabilities = { timing_markers: false, editable: false };
  save(dir, m);
  assert.equal(patch(dir, { actor: "human", base: 1, ops: [{ op: "resize_shot", id: "s1", duration: 3 }] }).code, EXIT.viewOnly);
  assert.equal(derive(dir).code, EXIT.viewOnly);
}));

test("derive: a manifest-only change moves TIMING, the voice data-start, root duration and PLAN.md", () => withProject((dir) => {
  const htmlBefore = readFileSync(join(dir, "index.html"), "utf8");
  assert.equal(patch(dir, { actor: "human", base: 1, ops: [{ op: "resize_shot", id: "s1", duration: 3.5 }] }).code, 0);
  const html = readFileSync(join(dir, "index.html"), "utf8");
  const t = timingOf(html);
  assert.equal(t.scenes.s2.start, 3.5);
  assert.equal(t.scenes.s2.lines[0].words[0][1], 3.6, "first word of vo-01 = data-start 3.5 + 0.1");
  assert.equal(t.duration, 9);
  assert.match(html, /<audio id="vo-01" src="assets\/voice\/01\.mp3" data-start="3\.5" data-duration="3"/);
  assert.match(html, /data-composition-id="main" data-start="0" data-duration="9"/);
  const strip = (s) => s.replace(/\/\* TIMING:BEGIN \*\/[\s\S]*?\/\* TIMING:END \*\//, "").replace(/<audio[^>]*>/g, "").replace(/<div id="root"[^>]*>/, "");
  assert.equal(strip(html), strip(htmlBefore), "nothing else in the HTML changed");
  const plan = readFileSync(join(dir, "PLAN.md"), "utf8");
  assert.match(plan, /\| 1 \| 0\.0–3\.5s \| — \| Tiêu đề \|/);
  assert.match(plan, /\| 2 \| 3\.5–6\.8s \|/);
  assert.match(plan, /\| 3 \| 6\.8–9\.0s \|/);
  assert.equal(JSON.parse(readFileSync(join(dir, "timing.json"), "utf8")).scenes.s3.end, 9);
}));

test("derivePlan keeps rows of known shots, drops removed ones and adds placeholder rows", () => {
  const m = load(FIXTURE);
  const plan = readFileSync(join(FIXTURE, "PLAN.md"), "utf8");
  const next = applyOps(m, [{ op: "add_shot", after: "s3", name: "x", duration: 1 }, { op: "remove_shot", id: "s1" }]).next;
  const out = derivePlan(plan, next);
  assert.doesNotMatch(out, /Tiêu đề/);
  assert.match(out, /\| 4 \| 5\.5–6\.5s \| … \| … \|/);
  assert.match(out, /## Mục tiêu/);
});

test("deriveHtml adds a missing data-duration and leaves unknown tracks alone", () => {
  const html = '<div data-composition-id="main" data-start="0"><audio id="vo-01" src="a.mp3"></audio><audio id="bgm" src="b.mp3" data-start="0"></audio></div>';
  const { html: out, missing } = deriveHtml(html, { duration: 4, lines: [{ id: "vo-01", start: 1, duration: 2 }, { id: "vo-09", start: 3 }] });
  assert.deepEqual(missing, ["vo-09"]);
  assert.match(out, /data-composition-id="main" data-start="0" data-duration="4"/);
  assert.match(out, /<audio id="vo-01" src="a\.mp3" data-start="1" data-duration="2">/);
  assert.match(out, /<audio id="bgm" src="b\.mp3" data-start="0">/);
});

test("deriveHtml sets each music bed's data-start and data-duration from m.music", () => {
  const html = '<div data-composition-id="main" data-duration="10"><audio id="bgm" src="assets/bgm/bgm.mp3" data-start="0" data-duration="10" data-volume="0.3"></audio><audio id="bed2" src="b.mp3"></audio></div>';
  const { html: out, missing } = deriveHtml(html, { duration: 10.55, shots: [], lines: [], music: [{ id: "bgm", start: 0, end: 10.55, gain: 0.3 }, { id: "bed2", start: 2, end: null, gain: 1 }, { id: "gone", start: 0, end: 4, gain: 1 }] });
  assert.match(out, /<audio id="bgm" src="assets\/bgm\/bgm\.mp3" data-start="0" data-duration="10\.55" data-volume="0\.3">/);
  assert.match(out, /<audio id="bed2" src="b\.mp3" data-start="2" data-duration="8\.55" data-volume="1">/, "a bed with no end runs to the root duration");
  assert.deepEqual(missing, ["gone"]);
});

test("timing.mjs on a manifest project goes through derive", () => withProject((dir) => {
  const buf = { out: "", err: "" };
  assert.equal(timingMain(["--project", dir], { out: (s) => { buf.out += s; }, err: (s) => { buf.err += s; } }), 0, buf.err);
  assert.match(buf.out, /TIMING s2 2\.500–5\.800 words=7/);
  assert.match(buf.out, /gateway\.mjs derive/);
  assert.equal(timingOf(readFileSync(join(dir, "index.html"), "utf8")).scenes.s2.start, 2.5);
}));

test("CLI: exit codes for patch, conflict and bad usage", async () => {
  const dir = project();
  try {
  const run = (args) => new Promise((ok) => {
    const p = spawn(process.execPath, [GATEWAY, ...args]);
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; });
    p.on("close", (code) => ok({ code, out, err }));
  });
  await (async () => {
    const ops = JSON.stringify([{ op: "resize_shot", id: "s2", duration: 4 }]);
    const a = await run(["patch", "--project", dir, "--actor", "human", "--base", "1", "--ops", ops]);
    assert.equal(a.code, 0, a.err);
    assert.match(a.out, /v2: s2: 3\.3s → 4\.0s/);
    assert.equal((await run(["patch", "--project", dir, "--actor", "human", "--base", "1", "--ops", ops])).code, 3);
    assert.equal((await run(["patch", "--project", dir])).code, 2);
    const log = await run(["log", "--project", dir, "--json"]);
    assert.equal(JSON.parse(log.out).length, 1);
  })();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("two concurrent writers never corrupt project.json", async () => {
  const dir = project();
  try {
    const ops = (d) => JSON.stringify([{ op: "resize_shot", id: "s3", duration: d }]);
    const run = (d) => new Promise((ok) => spawn(process.execPath, [GATEWAY, "patch", "--project", dir, "--actor", "human", "--base", "1", "--ops", ops(d)]).on("close", ok));
    const codes = (await Promise.all([run(3), run(4)])).sort();
    assert.deepEqual(codes, [0, 3], "one wins, the other sees a CONFLICT");
    const m = load(dir);
    assert.equal(m.version, 2);
    assert.equal(readHistory(dir).length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a stale lock older than 30 s is removed", () => withProject((dir) => {
  mkdirSync(join(dir, ".opus"), { recursive: true });
  const lock = join(dir, ".opus", "lock");
  writeFileSync(lock, "1");
  const old = (Date.now() - 60_000) / 1000;
  utimesSync(lock, old, old);
  const r = patch(dir, { actor: "human", base: 1, ops: [{ op: "resize_shot", id: "s1", duration: 3 }] });
  assert.equal(r.code, EXIT.ok, r.error);
  assert.ok(!existsSync(lock));
}));

test("deriveHtml skips tags inside comments, as in the skeleton's sound example", () => {
  const html = '<!-- root: <div data-composition-id="x" data-duration="…"> -->\n<div data-composition-id="main" data-duration="8">\n<!-- sound: <audio id="vo-01" src="assets/voice/01.mp3" data-start="…"> -->\n<audio id="vo-01" src="assets/voice/01.mp3" data-start="2.5" data-duration="3"></audio></div>';
  const { html: out, missing } = deriveHtml(html, { duration: 9, lines: [{ id: "vo-01", start: 3.5, duration: 3 }] });
  assert.deepEqual(missing, []);
  assert.match(out, /<!-- root: <div data-composition-id="x" data-duration="…"> -->/);
  assert.match(out, /<!-- sound: <audio id="vo-01" src="assets\/voice\/01\.mp3" data-start="…"> -->/);
  assert.match(out, /<div data-composition-id="main" data-duration="9">/);
  assert.match(out, /<audio id="vo-01" src="assets\/voice\/01\.mp3" data-start="3\.5" data-duration="3">/);
});

test("a line with no live tag is a derive WARN, not a silent no-op", () => withProject((dir) => {
  const f = join(dir, "index.html");
  writeFileSync(f, readFileSync(f, "utf8").replace(/<audio([^>]*)\sid="vo-01"/, "<!-- <audio$1 id=\"vo-01\" --><audio$1 id=\"vo-x\""));
  const r = derive(dir, { dry: true });
  assert.equal(r.code, EXIT.ok, r.error);
  assert.ok(r.warnings.some((w) => /vo-01: không có thẻ/.test(w)), r.warnings.join("\n"));
}));

test("derivePlan keeps every byte of a row but its Thời điểm cell", () => {
  const plan = readFileSync(join(FIXTURE, "PLAN.md"), "utf8");
  const next = applyOps(load(FIXTURE), [{ op: "resize_shot", id: "s1", duration: 3.5 }]).next;
  const before = plan.split("\n"), after = derivePlan(plan, next).split("\n");
  assert.equal(after.length, before.length);
  const changed = before.map((l, i) => [l, after[i]]).filter(([x, y]) => x !== y);
  assert.equal(changed.length, 3, "one Thời điểm cell per shot");
  for (const [x, y] of changed) assert.equal(x.replace(/\d+(\.\d+)?\s*[–-]\s*\d+(\.\d+)?s/, "T"), y.replace(/\d+(\.\d+)?–\d+(\.\d+)?s/, "T"));
});

test("shrinking a shot past its own line puts a warning in the receipt", () => {
  const { receipt } = applyOps(load(FIXTURE), [{ op: "resize_shot", id: "s2", duration: 0.5 }, { op: "resize_shot", id: "s1", duration: 1 }]);
  assert.ok(!receipt.some((r) => /CẢNH BÁO/.test(r)), "s1 holds no line");
  const r2 = applyOps(load(FIXTURE), [{ op: "move_line", id: "vo-01", start: 4 }, { op: "resize_shot", id: "s2", duration: 1 }]).receipt;
  assert.ok(r2.some((r) => /CẢNH BÁO vo-01/.test(r)), r2.join("; "));
});

test("undo never reaches past the latest import", () => withProject((dir) => {
  assert.equal(patch(dir, { actor: "human", base: 1, ops: [{ op: "resize_shot", id: "s1", duration: 3 }] }).code, EXIT.ok);
  const m = load(dir);
  m.version = 3;
  save(dir, m);
  writeFileSync(join(dir, ".opus", "versions", "v3.json"), JSON.stringify(m));
  writeFileSync(join(dir, ".opus", "history.jsonl"), readFileSync(join(dir, ".opus", "history.jsonl"), "utf8") + JSON.stringify({ v: 3, actor: "import", ops: [] }) + "\n");
  assert.equal(undo(dir, { base: 3 }).code, EXIT.nothingToUndo);
}));

test("a held lock is BUSY (exit 8), not a CONFLICT", () => withProject((dir) => {
  mkdirSync(join(dir, ".opus"), { recursive: true });
  writeFileSync(join(dir, ".opus", "lock"), "other");
  const r = patch(dir, { actor: "human", base: 1, ops: [{ op: "resize_shot", id: "s1", duration: 3 }] });
  assert.equal(r.code, EXIT.busy);
  assert.equal(readFileSync(join(dir, ".opus", "lock"), "utf8"), "other", "another writer's lock is left alone");
}));

const EVENTS = "\n## Sự kiện\n| Thời điểm | Sự kiện | Âm thanh |\n|---|---|---|\n| 1.0s | tiêu đề | — |\n| 3.0 | chữ: \"bạn đưa\" | — |\n| 6.2s (đo) | thẻ bật lên | assets/sfx/hit.mp3 |\n| ? | ghi chú | — |\n";

test("remapEvents keeps each Sự kiện row at its offset inside its shot", () => {
  const m = load(FIXTURE);
  const { next } = applyOps(m, [{ op: "resize_shot", id: "s1", duration: 3 }]);
  const r = remapEvents(EVENTS, m, next);
  assert.match(r.text, /\| 1\.0s \| tiêu đề/);
  assert.match(r.text, /\| 3\.5 \| chữ: "bạn đưa"/);
  assert.match(r.text, /\| 6\.7s \(đo\) \| thẻ bật lên \| assets\/sfx\/hit\.mp3 \|/);
  assert.match(r.text, /\| \? \| ghi chú/);
  assert.deepEqual(r.receipt, []);
  const s3 = applyOps(m, [{ op: "resize_shot", id: "s3", duration: 0.3 }]).next;
  assert.match(remapEvents(EVENTS, m, s3).receipt[0], /CẢNH BÁO sự kiện 6\.2s nằm ngoài s3/);
  const gone = { ...m, shots: m.shots.filter((s) => s.id !== "s3") };
  const g = remapEvents(EVENTS, m, gone);
  assert.doesNotMatch(g.text, /thẻ bật lên/);
  assert.match(g.receipt[0], /bỏ hàng sự kiện 6\.2s: s3 đã xoá/);
});

test("patch moves Sự kiện rows with their shot and undo puts the table back", () => withProject((dir) => {
  writeFileSync(join(dir, "PLAN.md"), readFileSync(join(dir, "PLAN.md"), "utf8") + EVENTS);
  const events = () => readFileSync(join(dir, "PLAN.md"), "utf8").split("## Sự kiện")[1];
  const before = events();
  assert.equal(patch(dir, { actor: "human", base: 1, ops: [{ op: "resize_shot", id: "s2", duration: 3.8 }] }).code, 0);
  const plan = readFileSync(join(dir, "PLAN.md"), "utf8");
  assert.match(plan, /\| 1\.0s \|/);
  assert.match(plan, /\| 3\.0 \|/);
  assert.match(plan, /\| 6\.7s \(đo\) \|/);
  assert.equal(undo(dir, { base: 2 }).code, 0);
  assert.equal(events(), before);
}));

// The fixture has no music: a "bgm" bed in project.json and its <audio> tag after vo-01.
const withBgm = (dir) => {
  const m = load(dir);
  m.music = [{ id: "bgm", file: "assets/bgm/bgm.mp3", start: 0, end: 8, gain: 1 }];
  save(dir, m);
  const f = join(dir, "index.html");
  writeFileSync(f, readFileSync(f, "utf8").replace(/(<audio id="vo-01"[^>]*><\/audio>)/, '$1\n      <audio id="bgm" src="assets/bgm/bgm.mp3" data-start="0" data-duration="8" data-volume="1"></audio>'));
};
const html = (dir) => readFileSync(join(dir, "index.html"), "utf8");

test("update_music sets several fields of a bed in one op; fades longer than the bed are INVALID", () => withProject((dir) => {
  withBgm(dir);
  const r = patch(dir, { actor: "human", base: 1, ops: [{ op: "update_music", id: "bgm", start: 1, end: 9, media_start: 0.5, gain: 0.6, fade_in: 1, fade_out: 2 }] });
  assert.equal(r.code, EXIT.ok, r.error);
  assert.deepEqual(r.receipt, ["bgm: start = 1, end = 9, media_start = 0.5, gain = 0.6, fade_in = 1, fade_out = 2"]);
  assert.deepEqual(load(dir).music[0], { id: "bgm", file: "assets/bgm/bgm.mp3", start: 1, end: 9, gain: 0.6, media_start: 0.5, fade_in: 1, fade_out: 2 });
  assert.match(html(dir), /<audio id="bgm" src="assets\/bgm\/bgm\.mp3" data-start="1" data-duration="8" data-volume="0\.6" data-media-start="0\.5" data-fade-in="1" data-fade-out="2">/);
  const bad = patch(dir, { actor: "human", base: 2, ops: [{ op: "update_music", id: "bgm", start: 0, end: 8, fade_in: 5, fade_out: 5 }] });
  assert.equal(bad.code, EXIT.invalid);
  assert.match(bad.error, /fade_in \+ fade_out dài hơn khối nhạc/);
  const m = load(FIXTURE);
  m.music = [{ id: "bgm", file: "a.mp3", start: 0, end: 8, gain: 1 }];
  assert.throws(() => applyOps(m, [{ op: "update_music", id: "bgm" }]), /update_music: cần ít nhất một trường/);
  assert.throws(() => applyOps(m, [{ op: "update_music", id: "x", gain: 1 }]), /không có nhạc x/);
  assert.throws(() => applyOps(m, [{ op: "update_music", id: "bgm", volume: 1 }]), /update_music: trường phải là start \| end \| media_start \| gain \| fade_in \| fade_out/);
  assert.equal(applyOps(m, [{ op: "update_music", id: "bgm", end: null }]).next.music[0].end, null, "end null runs to the end of the video");
}));

test("deriveHtml writes the music bed's volume, media start and fades, and removes the ones at 0", () => {
  const src = '<div data-composition-id="main" data-duration="10"><audio id="bgm" src="a.mp3" data-start="0" data-duration="10" data-volume="1" data-fade-out="3"></audio></div>';
  const m = { duration: 10, shots: [], lines: [], music: [{ id: "bgm", file: "a.mp3", start: 1, end: 9, gain: 0.5, media_start: 2, fade_in: 1, fade_out: 0 }] };
  const tag = deriveHtml(src, m).html.match(/<audio id="bgm"[^>]*>/)[0];
  for (const a of ['data-start="1"', 'data-duration="8"', 'data-volume="0.5"', 'data-media-start="2"', 'data-fade-in="1"']) assert.ok(tag.includes(a), `${a} in ${tag}`);
  assert.doesNotMatch(tag, /data-fade-out/);
  const plain = deriveHtml(tag + "</audio>", { ...m, music: [{ ...m.music[0], media_start: 0, fade_in: undefined }] }).html;
  assert.doesNotMatch(plain, /data-media-start|data-fade-in/);
});

test("move_event, add_event and remove_event edit SFX events by absolute time", () => {
  const m = { ...load(FIXTURE), events: [{ id: "sfx-a", shot: "s1", offset: 1, sound: "assets/sfx/a.mp3", label: "a" }] };
  const moved = applyOps(m, [{ op: "move_event", id: "sfx-a", start: 3.5 }]);
  assert.deepEqual([moved.next.events[0].shot, moved.next.events[0].offset], ["s2", 1]);
  assert.deepEqual(moved.receipt, ["sfx-a: 1.0s → 3.5s (sang s2)"]);
  const added = applyOps(moved.next, [{ op: "add_event", start: 6, sound: "assets/sfx/a.mp3" }]);
  assert.deepEqual(added.next.events[1], { id: "sfx-1", shot: "s3", offset: 0.2, sound: "assets/sfx/a.mp3", label: "a", volume: 0.8, studio: true });
  assert.deepEqual(added.receipt, ["thêm sfx-1 lúc 6.0s"]);
  assert.equal(applyOps(added.next, [{ op: "add_event", start: 8, sound: "x/b.wav" }]).next.events[2].id, "sfx-2", "the end of the video belongs to the last shot");
  const removed = applyOps(added.next, [{ op: "remove_event", id: "sfx-1" }]);
  assert.deepEqual(removed.next.events.map((e) => e.id), ["sfx-a"]);
  assert.deepEqual(removed.receipt, ["xoá sfx-1"]);
  assert.throws(() => applyOps(m, [{ op: "move_event", id: "sfx-a", start: 99 }]), /^Error: 99s nằm ngoài video \(8s\)$/);
  assert.throws(() => applyOps(m, [{ op: "add_event", start: 8.5, sound: "a.mp3" }]), /8\.5s nằm ngoài video \(8s\)/);
  assert.throws(() => applyOps(m, [{ op: "move_event", id: "sfx-z", start: 1 }]), /không có sự kiện sfx-z/);
  assert.throws(() => applyOps(load(FIXTURE), [{ op: "add_event", start: 1 }]), /add_event: cần sound/);
  assert.equal(applyOps(load(FIXTURE), [{ op: "add_event", start: 1, sound: "assets/sfx/a.mp3" }]).next.events.length, 1, "events is created when absent");
});

test("deriveHtml inserts a studio event's tag once, removes it when the event goes, and never touches other tags", () => {
  const src = '<div data-composition-id="main" data-duration="8">\n      <audio id="vo-01" src="v.mp3" data-start="2.5" data-duration="3" data-track-index="10"></audio>\n      <audio id="bgm" src="b.mp3" data-start="0" data-duration="8" data-track-index="20"></audio>\n      <!-- <audio id="x" src="x.mp3"></audio> -->\n      <audio id="sfx-old" src="o.mp3" data-start="1"></audio>\n</div>';
  const base = { ...load(FIXTURE), music: [] };
  const ev = { id: "sfx-1", shot: "s3", offset: 0.2, sound: "assets/sfx/a.mp3", label: "a", volume: 0.8, studio: true };
  const a = deriveHtml(src, { ...base, events: [ev] });
  assert.equal(a.html.match(/id="sfx-1"/g).length, 1);
  assert.deepEqual(a.missingEvents, []);
  assert.ok(a.html.indexOf('id="sfx-1"') > a.html.indexOf('id="bgm"'), "after the bgm tag");
  assert.ok(a.html.indexOf('id="sfx-1"') > a.html.indexOf('id="sfx-old"'), "after the last live <audio>");
  assert.match(a.html, /<audio id="sfx-1" src="assets\/sfx\/a\.mp3" data-start="6" data-track-index="30" data-volume="0\.8" data-audio-group="sfx" data-studio-sfx><\/audio>/);
  const b = deriveHtml(a.html, { ...base, events: [ev] });
  assert.equal(b.html.match(/id="sfx-1"/g).length, 1, "derive again does not insert twice");
  assert.equal(b.html, a.html);
  const c = deriveHtml(b.html, { ...base, events: [] });
  assert.doesNotMatch(c.html, /sfx-1/);
  assert.equal(c.html, src, "the line break and indent before the tag go with it");
  assert.match(c.html, /<audio id="sfx-old" src="o\.mp3" data-start="1"><\/audio>/, "a tag without data-studio-sfx stays");
  const quiet = deriveHtml(src, { ...base, events: [{ id: "sfx-old", shot: "s1", offset: 1.5, label: "o", volume: 0.4 }] }).html;
  assert.match(quiet, /<audio id="sfx-old" src="o\.mp3" data-start="1\.5" data-volume="0\.4">/);
  const bare = deriveHtml('<!-- <audio id="c"></audio> -->\n<div data-composition-id="main" data-duration="8">\n  <div class="scene"></div>\n</div>', { ...base, events: [ev] });
  assert.deepEqual(bare.missingEvents, [], "no live <audio>: the tag still goes in");
  assert.match(bare.html, /<div data-composition-id="main" data-duration="8">\n      <audio id="sfx-1" src="assets\/sfx\/a\.mp3" data-start="6" data-track-index="30" [^>]*data-studio-sfx><\/audio>\n  <div class="scene">/, "right after the root's opening tag");
  const high = deriveHtml(src.replace('data-track-index="20"', 'data-track-index="41"'), { ...base, events: [ev] }).html;
  assert.match(high, /id="sfx-1"[^>]*data-track-index="42"/, "one past the highest lane above 29");
});

const runCli = (args) => new Promise((ok) => {
  const p = spawn(process.execPath, [GATEWAY, ...args]);
  let out = "", err = "";
  p.stdout.on("data", (d) => { out += d; });
  p.stderr.on("data", (d) => { err += d; });
  p.on("close", (code) => ok({ code, out, err }));
});

test("CLI: add_event and remove_event write and remove the studio tag; undo reverses each", async () => {
  const dir = project();
  try {
    const cli = (cmd, base, ops) => runCli([cmd, "--project", dir, "--base", String(base), ...(ops ? ["--actor", "human", "--ops", JSON.stringify(ops)] : [])]);
    let r = await cli("patch", 1, [{ op: "add_event", id: "sfx-1", start: 6, sound: "assets/sfx/a.mp3" }]);
    assert.equal(r.code, 0, r.err);
    assert.match(html(dir), /<audio id="sfx-1"[^>]*data-studio-sfx><\/audio>/);
    r = await cli("undo", 2);
    assert.equal(r.code, 0, r.err);
    assert.doesNotMatch(html(dir), /id="sfx-1"/);
    r = await cli("redo", 3);
    assert.equal(r.code, 0, r.err);
    assert.match(html(dir), /id="sfx-1"/);
    r = await cli("patch", 4, [{ op: "remove_event", id: "sfx-1" }]);
    assert.equal(r.code, 0, r.err);
    assert.doesNotMatch(html(dir), /id="sfx-1"/);
    r = await cli("undo", 5);
    assert.equal(r.code, 0, r.err);
    assert.equal(html(dir).match(/id="sfx-1"/g).length, 1, "the tag is back");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("redo re-applies what undo reverted, only while the last changes are undos and redos", async () => withProject((dir) => {
  const v1 = load(dir).shots;
  const A = [{ op: "resize_shot", id: "s1", duration: 3.5 }];
  assert.equal(patch(dir, { actor: "human", base: 1, ops: A }).code, EXIT.ok);
  const v2 = load(dir).shots;
  const html2 = html(dir);
  const step = (fn, base, shots) => {
    const r = fn(dir, { base });
    assert.equal(r.code, EXIT.ok, r.error);
    assert.equal(load(dir).version, base + 1);
    assert.deepEqual(load(dir).shots, shots);
  };
  step(undo, 2, v1);
  step(redo, 3, v2);
  assert.equal(html(dir), html2, "index.html is back to v2");
  assert.equal(readHistory(dir).at(-1).actor, "redo");
  assert.equal(readHistory(dir).at(-1).redoes, 3);
  step(undo, 4, v1);
  step(redo, 5, v2);
  const nothing = redo(dir, { base: 6 });
  assert.equal(nothing.code, EXIT.nothingToRedo);
  assert.match(nothing.error, /không còn gì để làm lại/);
  assert.equal(patch(dir, { actor: "redo", base: 6, ops: A }).code, EXIT.usage, "patch refuses actor redo");
}));

test("a new change after an undo clears redo; redo with no undo is exit 9", async () => {
  const dir = project();
  try {
    const A = JSON.stringify([{ op: "resize_shot", id: "s1", duration: 3.5 }]);
    const B = JSON.stringify([{ op: "resize_shot", id: "s3", duration: 3 }]);
    const none = await runCli(["redo", "--project", dir, "--base", "1"]);
    assert.equal(none.code, 9);
    assert.match(none.err, /không còn gì để làm lại/);
    assert.equal((await runCli(["patch", "--project", dir, "--actor", "human", "--base", "1", "--ops", A])).code, 0);
    assert.equal((await runCli(["undo", "--project", dir, "--base", "2"])).code, 0);
    assert.equal((await runCli(["patch", "--project", dir, "--actor", "human", "--base", "3", "--ops", B])).code, 0);
    const shots = load(dir).shots;
    const r = await runCli(["redo", "--project", dir, "--base", "4"]);
    assert.equal(r.code, 9);
    assert.equal(load(dir).version, 4);
    assert.deepEqual(load(dir).shots, shots);
    assert.equal((await runCli(["redo", "--project", dir])).code, 2, "redo needs --base");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("remove_event refuses an event the director placed", () => {
  const m = { ...load(FIXTURE), events: [{ id: "sfx-a", shot: "s1", offset: 1, sound: "a.mp3", label: "a" }, { id: "sfx-b", shot: "s1", offset: 1, sound: "a.mp3", label: "b", studio: false }] };
  for (const id of ["sfx-a", "sfx-b"]) {
    assert.throws(() => applyOps(m, [{ op: "remove_event", id }]), new RegExp(`^Error: chỉ xoá được SFX thêm từ Studio; ${id} do đạo diễn đặt, hãy nhờ đạo diễn$`));
  }
  withProject((dir) => {
    save(dir, { ...load(dir), events: m.events });
    const before = snapshot(dir);
    const r = patch(dir, { actor: "human", base: 1, ops: [{ op: "remove_event", id: "sfx-a" }] });
    assert.equal(r.code, EXIT.invalid);
    assert.deepEqual(snapshot(dir), before);
  });
});

test("a studio event whose id is a hand-written <audio> is INVALID and nothing is written", () => withProject((dir) => {
  const f = join(dir, "index.html");
  writeFileSync(f, readFileSync(f, "utf8").replace(/(<audio id="vo-01"[^>]*><\/audio>)/, '$1\n      <audio id="sfx-1" src="old.mp3" data-start="1"></audio>'));
  const before = snapshot(dir);
  const r = patch(dir, { actor: "human", base: 1, ops: [{ op: "add_event", id: "sfx-1", start: 6, sound: "assets/sfx/a.mp3" }] });
  assert.equal(r.code, EXIT.invalid);
  assert.equal(r.error, "sự kiện sfx-1: trùng id với thẻ <audio> có sẵn trong index.html, chọn id khác");
  assert.deepEqual(snapshot(dir), before);
  assert.match(html(dir), /<audio id="sfx-1" src="old\.mp3" data-start="1"><\/audio>/);
  const d = deriveHtml(before["index.html"], { ...load(dir), events: [{ id: "sfx-1", shot: "s3", offset: 0.2, sound: "a.mp3", label: "a", studio: true }] });
  assert.deepEqual(d.conflicts, ["sfx-1"]);
  assert.equal(d.html, before["index.html"], "the hand-written tag is not touched");
  // Without an id, add_event picks the next sfx-<n> that is free in index.html too.
  const ok = patch(dir, { actor: "human", base: 1, ops: [{ op: "add_event", start: 6, sound: "assets/sfx/a.mp3" }] });
  assert.equal(ok.code, EXIT.ok, ok.error);
  assert.deepEqual(load(dir).events.map((e) => e.id), ["sfx-2"]);
  assert.match(html(dir), /<audio id="sfx-2"[^>]*data-studio-sfx><\/audio>/);
  assert.equal(applyOps(load(FIXTURE), [{ op: "add_event", start: 6, sound: "a.mp3" }], { html: '<audio id="sfx-1"></audio><!-- <audio id="sfx-2"></audio> -->' }).next.events[0].id, "sfx-2");
}));

test("redoTarget stays non-null while undos are left to redo", () => withProject((dir) => {
  let v = 1;
  for (const d of [3.5, 2]) assert.equal(patch(dir, { actor: "human", base: v++, ops: [{ op: "resize_shot", id: "s1", duration: d }] }).code, EXIT.ok);
  assert.equal(redoTarget(readHistory(dir)), null, "no undo, nothing to redo");
  assert.equal(undo(dir, { base: v++ }).code, EXIT.ok);
  assert.equal(undo(dir, { base: v++ }).code, EXIT.ok);
  assert.equal(redo(dir, { base: v++ }).code, EXIT.ok);
  const t = redoTarget(readHistory(dir));
  assert.ok(t, "one undo is still on the stack");
  assert.equal(t.actor, "undo");
  assert.equal(t.undoes, 3, "the first undo, of v3");
  assert.equal(redo(dir, { base: v++ }).code, EXIT.ok);
  assert.equal(redoTarget(readHistory(dir)), null);
  assert.equal(redoTarget([{ v: 1, actor: "undo", undoes: 2 }, { v: 2, actor: "import" }]), null, "an import ends the stack");
}));

test("set_line_speaker marks the line stale and writes its number in scenes/roles.json", () => withProject((dir) => {
  mkdirSync(join(dir, "scenes"));
  writeFileSync(join(dir, "scenes/roles.json"), JSON.stringify({ "01": "song", "02": "me" }));
  const r = patch(dir, { actor: "human", base: 1, ops: [{ op: "set_line_speaker", id: "vo-01", speaker: "ba-noi" }] });
  assert.equal(r.code, EXIT.ok, r.error);
  const l = load(dir).lines[0];
  assert.deepEqual([l.speaker, l.gate], ["ba-noi", "stale"]);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "scenes/roles.json"), "utf8")), { "01": "ba-noi", "02": "me" });
  assert.match(readHistory(dir).at(-1).receipt.join("; "), /vo-01: đổi người nói chưa có → ba-noi, cần lồng tiếng lại/);
  assert.equal(patch(dir, { actor: "human", base: 2, ops: [{ op: "set_line_speaker", id: "vo-01", speaker: "Bà" }] }).code, EXIT.invalid);
  // Without scenes/roles.json only project.json changes.
  rmSync(join(dir, "scenes"), { recursive: true });
  assert.equal(patch(dir, { actor: "human", base: 2, ops: [{ op: "set_line_speaker", id: "vo-01", speaker: "song" }] }).code, EXIT.ok);
  assert.ok(!existsSync(join(dir, "scenes")));
}));

test("set_line_audio: a stamped take passes, the HTML plays the new file, a missing file is refused", async () => {
  const { writeStamp } = await import("../script-md.mjs");
  return withProject((dir) => {
    const text = load(dir).lines[0].text;
    mkdirSync(join(dir, "assets/mix"), { recursive: true });
    writeFileSync(join(dir, "assets/mix/voice-01.mp3"), "");
    writeStamp(join(dir, "assets/voice/01.mp3"), { text, script: "script/01.txt" });
    const r = patch(dir, { actor: "human", base: 1, ops: [{ op: "set_line_audio", id: "vo-01", file: "assets/mix/voice-01.mp3", duration: 4 }] });
    assert.equal(r.code, EXIT.ok, r.error);
    const l = load(dir).lines[0];
    assert.deepEqual([l.file, l.duration, l.gate, l.start], ["assets/mix/voice-01.mp3", 4, "pass", 2.5]);
    // 2.5 + 4 runs past s2 (5.8): kept, with a warning.
    assert.match(r.receipt.join("; "), /CẢNH BÁO vo-01: kết thúc 6\.5s, sau khi s2 kết thúc 5\.8s/);
    assert.match(readFileSync(join(dir, "index.html"), "utf8"), /id="vo-01" src="assets\/mix\/voice-01\.mp3" data-start="2\.5" data-duration="4"/);
    // Another text than the stamp's: stale.
    writeStamp(join(dir, "assets/voice/01.mp3"), { text: "Lời khác." });
    assert.equal(patch(dir, { actor: "human", base: 2, ops: [{ op: "set_line_audio", id: "vo-01", file: "assets/mix/voice-01.mp3", duration: 3 }] }).code, EXIT.ok);
    assert.equal(load(dir).lines[0].gate, "stale");
    for (const bad of [{ file: "assets/mix/none.mp3", duration: 2 }, { file: "../x.mp3", duration: 2 }, { file: "assets/mix/voice-01.mp3", duration: 0 }]) {
      const b = patch(dir, { actor: "human", base: 3, ops: [{ op: "set_line_audio", id: "vo-01", ...bad }] });
      assert.equal(b.code, EXIT.invalid, JSON.stringify(bad));
    }
    assert.equal(load(dir).version, 3);
  });
});

test("set_line_speaker and set_line_audio are refused on a view-only project", () => withProject((dir) => {
  const m = load(dir);
  m.capabilities = { timing_markers: false, editable: false };
  save(dir, m);
  for (const op of [{ op: "set_line_speaker", id: "vo-01", speaker: "song" }, { op: "set_line_audio", id: "vo-01", file: "index.html", duration: 1 }]) assert.equal(patch(dir, { actor: "human", base: 1, ops: [op] }).code, EXIT.viewOnly);
}));
