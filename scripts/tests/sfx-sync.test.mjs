// sfx-sync.mjs: picture-event table in PLAN.md, measured sound onset vs the event time,
// ITU-R BT.1359-1 windows, onset cache, legacy projects only WARN.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEvents, leadFromSilence, onsetOf, syncVerdict, checkSync, main } from "../sfx-sync.mjs";

const hasFfmpeg = !spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).error;
const tmp = () => mkdtempSync(join(tmpdir(), "sfx-sync-"));
const capture = () => {
  const buf = { out: "", err: "" };
  return { buf, io: { out: (s) => { buf.out += s; }, err: (s) => { buf.err += s; } } };
};

const EVENTS = `## Sự kiện
| Thời điểm | Sự kiện | Âm thanh |
|---|---|---|
| 2.0s | Nút gửi lún xuống | assets/sfx/send.mp3 |
| 6,5s | Kết quả bung ra | assets/sfx/pop.mp3 |
| 13.5 | Logo đứng yên | — |
`;

test("parseEvents: reads the table, drops rows without sound, accepts the no-SFX line", () => {
  const r = parseEvents(`# PLAN\n\n## Âm thanh\nnhạc\n\n${EVENTS}\n## QA\nx\n`);
  assert.equal(r.missing, false);
  assert.equal(r.none, false);
  assert.deepEqual(r.events, [
    { t: 2, label: "Nút gửi lún xuống", sound: "assets/sfx/send.mp3" },
    { t: 6.5, label: "Kết quả bung ra", sound: "assets/sfx/pop.mp3" },
  ]);
  const none = parseEvents("## Sự kiện\nKhông có SFX gắn sự kiện.\n");
  assert.deepEqual({ missing: none.missing, none: none.none, events: none.events }, { missing: false, none: true, events: [] });
  const missing = parseEvents("## Cảnh\n| a |\n");
  assert.equal(missing.missing, true);
  assert.deepEqual(missing.events, []);
});

test("leadFromSilence: leading silence only", () => {
  assert.equal(leadFromSilence("[silencedetect @ 0x1] silence_start: 0\n[silencedetect @ 0x1] silence_end: 0.12 | silence_duration: 0.12\n"), 0.12);
  assert.equal(leadFromSilence("[silencedetect @ 0x1] silence_start: 0.3\n[silencedetect @ 0x1] silence_end: 0.5 | silence_duration: 0.2\n"), 0);
  assert.equal(leadFromSilence("no silence here"), 0);
});

test("onsetOf: data-media-start trims part of the leading silence", () => {
  assert.ok(Math.abs(onsetOf({ start: 1.88, mediaStart: 0.05, rate: 1 }, 0.12) - 1.95) < 1e-9);
  assert.equal(onsetOf({ start: 3, mediaStart: 0.2, rate: 1 }, 0.12), 3);
  assert.ok(Math.abs(onsetOf({ start: 1, mediaStart: 0, rate: 2 }, 0.2) - 1.1) < 1e-9);
});

test("syncVerdict: ITU-R BT.1359-1 boundaries (positive = sound late)", () => {
  const cases = { [-45]: "PASS", 125: "PASS", [-46]: "WARN", 126: "WARN", [-90]: "WARN", 185: "WARN", [-91]: "FAIL", 186: "FAIL", 0: "PASS" };
  for (const [d, level] of Object.entries(cases)) assert.equal(syncVerdict(Number(d)), level, `delta ${d}`);
});

test("CLI: missing ## Sự kiện fails a creative project, warns a legacy one; the no-SFX line passes", () => {
  const d = tmp();
  try {
    writeFileSync(join(d, "BRIEF.md"), "---\ndirection: A2\n---\n");
    writeFileSync(join(d, "PLAN.md"), "# PLAN\n\n## Cảnh\nx\n");
    let c = capture();
    assert.equal(main(["--project", d], c.io), 1);
    assert.match(c.buf.out, /^FAIL {2}SYNC {3}PLAN\.md không có ## Sự kiện/m);
    writeFileSync(join(d, "BRIEF.md"), "---\naspect: 9:16\n---\n");
    c = capture();
    assert.equal(main(["--project", d], c.io), 0);
    assert.match(c.buf.out, /^WARN {2}SYNC {3}PLAN\.md không có ## Sự kiện \(dự án cũ\)/m);
    writeFileSync(join(d, "BRIEF.md"), "---\ndirection: A2\n---\n");
    writeFileSync(join(d, "PLAN.md"), "# PLAN\n\n## Sự kiện\nkhông có SFX gắn sự kiện\n");
    c = capture();
    assert.equal(main(["--project", d], c.io), 0, c.buf.out + c.buf.err);
    const r = checkSync({ dir: d, run: () => { throw new Error("ffmpeg must not run"); } });
    assert.equal(r.none, true);
    assert.deepEqual(r.lines, []);
    assert.deepEqual(r.errors, []);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("CLI: bad usage and missing PLAN.md exit 2", () => {
  const d = tmp();
  try {
    let c = capture();
    assert.equal(main(["--nope"], c.io), 2);
    c = capture();
    assert.equal(main(["--project", d], c.io), 2);
    assert.match(c.buf.err, /PLAN\.md/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("sfx-sync with ffmpeg: 120 ms leading silence is measured, cached, and a 270 ms late sound fails", { skip: !hasFfmpeg && "ffmpeg missing" }, () => {
  const d = tmp();
  try {
    mkdirSync(join(d, "assets", "sfx"), { recursive: true });
    const a = join(d, "assets", "sfx", "a.wav");
    const gen = spawnSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=1000:d=0.2", "-af", "adelay=120:all=1", a], { encoding: "utf8" });
    assert.equal(gen.status, 0, gen.stderr);
    copyFileSync(a, join(d, "assets", "sfx", "b.wav"));
    writeFileSync(join(d, "BRIEF.md"), "---\naspect: 9:16\ndirection: A2\n---\n");
    const plan = "# PLAN\n\n## Sự kiện\n| Thời điểm | Sự kiện | Âm thanh |\n|---|---|---|\n| 2.0 | nhấn | assets/sfx/a.wav |\n| 4.0 | hiện | assets/sfx/b.wav |\n";
    writeFileSync(join(d, "PLAN.md"), plan);
    const html = (aStart) => `<html><body>\n<audio id="a" src="assets/sfx/a.wav" data-start="${aStart}"></audio>\n<audio id="b" src="assets/sfx/b.wav" data-start="3.88"></audio>\n</body></html>\n`;
    writeFileSync(join(d, "index.html"), html("1.88"));

    let c = capture();
    assert.equal(main(["--project", d, "--json"], c.io), 0, c.buf.out + c.buf.err);
    const rows = JSON.parse(c.buf.out);
    assert.equal(rows.length, 2);
    for (const r of rows) {
      assert.equal(r.level, "PASS", JSON.stringify(r));
      assert.ok(Math.abs(r.delta_ms) <= 5, `delta ${r.delta_ms}`);
      assert.ok(Math.abs(r.lead_s - 0.12) <= 0.005, `lead ${r.lead_s}`);
    }
    assert.deepEqual(Object.keys(rows[0]).sort(), ["delta_ms", "label", "lead_s", "level", "sound", "t"]);
    const cacheFile = join(d, "assets", "sfx-onsets.json");
    assert.ok(existsSync(cacheFile));
    const cache = JSON.parse(readFileSync(cacheFile, "utf8"));
    assert.equal(Object.keys(cache).length, 1, "a.wav and b.wav share one hash");
    assert.ok(readFileSync(cacheFile, "utf8").includes('\n  "'), "cache is indented by 2 spaces");

    writeFileSync(join(d, "index.html"), html("2.15"));
    c = capture();
    assert.equal(main(["--project", d, "--fix"], c.io), 1, c.buf.out + c.buf.err);
    console.log(c.buf.out.trimEnd());
    assert.match(c.buf.out, /^FAIL {2}SYNC {3}2s nhấn ← assets\/sfx\/a\.wav lệch \+2[67]\d ms \(đầu file im 1[12]\d ms\)$/m);
    assert.match(c.buf.out, /^PASS {2}SYNC {3}4s hiện ← assets\/sfx\/b\.wav/m);
    assert.ok(c.buf.out.includes('đề xuất: data-start="1.880"'), c.buf.out);
    assert.equal((c.buf.out.match(/đề xuất/g) || []).length, 1, "only the failing line gets a suggestion");
    assert.ok(readFileSync(join(d, "index.html"), "utf8").includes('data-start="2.15"'), "--fix never edits the HTML");

    let calls = 0;
    const counted = (...args) => { calls++; return spawnSync(...args); };
    const again = checkSync({ dir: d, run: counted });
    assert.equal(calls, 0, "the cache answers without ffmpeg");
    assert.equal(again.lines.find((l) => l.sound === "assets/sfx/a.wav").level, "FAIL");
    assert.equal(again.errors.length, 1);

    c = capture();
    assert.equal(main(["--project", d, "--write-qa"], c.io), 1);
    assert.match(readFileSync(join(d, "QA.md"), "utf8"), /^## SYNC \(\d{4}-\d{2}-\d{2}T[^)]+\)\n[\s\S]*FAIL {2}SYNC/m);

    writeFileSync(join(d, "BRIEF.md"), "---\naspect: 9:16\n---\n");
    c = capture();
    assert.equal(main(["--project", d], c.io), 0, c.buf.out);
    assert.match(c.buf.out, /^WARN {2}SYNC {3}2s nhấn/m);
    assert.doesNotMatch(c.buf.out, /^FAIL/m);

    writeFileSync(join(d, "BRIEF.md"), "---\naspect: 9:16\ndirection: A2\n---\n");
    writeFileSync(join(d, "index.html"), html("1.88"));
    writeFileSync(join(d, "PLAN.md"), `${plan}| 5.0 | lạ | assets/sfx/c.wav |\n`);
    c = capture();
    assert.equal(main(["--project", d], c.io), 1);
    assert.match(c.buf.out, /^FAIL {2}SYNC {3}5s lạ ← assets\/sfx\/c\.wav.*không có trong/m);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
