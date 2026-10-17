// gateway.mjs: the one writer of project.json (ops, versions, lock, undo) and derive, which
// rewrites the TIMING block, voice data-start, root data-duration, PLAN.md times and timing.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { applyOps, patch, undo, derive, readHistory, deriveHtml, derivePlan, remapEvents, EXIT } from "../gateway.mjs";
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
