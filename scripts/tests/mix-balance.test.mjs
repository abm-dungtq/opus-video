import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { balanceVerdict, checkBalance, main } from "../mix-balance.mjs";

const CLI = fileURLToPath(new URL("../mix-balance.mjs", import.meta.url));
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

test("balanceVerdict: PASS 4–7 dB, WARN 2–4 and 7–10 dB, FAIL outside; soft turns FAIL into WARN", () => {
  for (const [u, l] of [[4, "PASS"], [5.1, "PASS"], [7, "PASS"], [3.9, "WARN"], [2, "WARN"], [7.1, "WARN"], [10, "WARN"], [1.9, "FAIL"], [10.1, "FAIL"], [-3, "FAIL"]]) assert.equal(balanceVerdict(u), l, `${u} dB`);
  assert.equal(balanceVerdict(12, true), "WARN");
  assert.equal(balanceVerdict(5, true), "PASS");
});

// A project with a 2 s voice (880 Hz) at 1 s and a 4 s bed (220 Hz) `gapDb` under it.
function project(gapDb, { brief = "---\ndirection: A1\n---\n", words = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "mix-balance-"));
  const ff = (args) => assert.equal(spawnSync("ffmpeg", ["-v", "error", "-y", ...args]).status, 0);
  ff(["-f", "lavfi", "-i", "sine=f=880:d=2", join(dir, "vo.wav")]);
  ff(["-f", "lavfi", "-i", "sine=f=220:d=4", join(dir, "bed.wav")]);
  if (words) writeFileSync(join(dir, "vo.wav.words.json"), JSON.stringify([{ text: "một", start: 0, end: 0.9 }, { text: "hai", start: 1.05, end: 2 }]));
  writeFileSync(join(dir, "BRIEF.md"), brief);
  writeFileSync(join(dir, "index.html"), `<div id="root" data-composition-id="main" data-start="0" data-duration="4">
<audio id="vo-01" src="vo.wav" data-start="1" data-duration="2" data-audio-group="voiceover"></audio>
<audio id="bgm" src="bed.wav" data-start="0" data-duration="4" data-volume="${(10 ** (-gapDb / 20)).toFixed(4)}" data-audio-group="music"></audio>
</div>`);
  return dir;
}

test("checkBalance: music 5 dB under the voice → PASS, 12 dB → FAIL (WARN for an older project)", { skip: !hasFfmpeg && "ffmpeg missing" }, () => {
  for (const [gap, level, brief] of [[5, "PASS"], [12, "FAIL"], [12, "WARN", "---\naspect: 16:9\n---\n"]]) {
    const dir = project(gap, brief ? { brief } : {});
    try {
      const r = checkBalance({ dir });
      assert.equal(r.level, level, r.line);
      assert.ok(Math.abs(r.under_db - gap) < 0.3, `under ${r.under_db}`);
      assert.deepEqual(r.windows, [[1, 3]], "words 0.15 s apart merge");
      assert.match(r.line, new RegExp(`^${level} BALANCE nhạc dưới giọng ${gap}\\.\\d dB \\(lúc có lời\\), nhạc lúc không lời −\\d+\\.\\d dBFS`));
      if (brief) assert.match(r.line, /dự án cũ/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test("checkBalance: no words.json falls back to the voice clip; no music bed → PASS", { skip: !hasFfmpeg && "ffmpeg missing" }, () => {
  const dir = project(5, { words: false });
  try {
    const r = checkBalance({ dir });
    assert.equal(r.level, "PASS", r.line);
    assert.deepEqual(r.windows, [[1, 3]]);
    assert.match(r.line, /không có words\.json cho vo-01/);
    writeFileSync(join(dir, "index.html"), `<audio id="vo-01" src="vo.wav" data-start="0" data-duration="2"></audio>`);
    assert.equal(checkBalance({ dir }).line, "PASS BALANCE không có nhạc nền");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("checkBalance: a carve bed is aimed at its target; --json reports natural, target and reduction", { skip: !hasFfmpeg && "ffmpeg missing" }, () => {
  const dir = project(0);
  try {
    const html = join(dir, "index.html");
    writeFileSync(html, readFileSync(html, "utf8").replace('data-audio-group="music"', `data-audio-group="music" data-fx-carve='{"enabled":true,"sources":["voiceover"],"strength":0.8}'`));
    const r = checkBalance({ dir });
    assert.equal(r.level, "PASS", r.line);
    assert.ok(Math.abs(r.under_db - 6) <= 0.5, `under ${r.under_db}`);
    assert.equal(r.duck.length, 1);
    const d = r.duck[0];
    assert.equal(d.id, "bgm");
    assert.ok(Math.abs(d.natural_db) < 0.3 && d.target_db === 6 && Math.abs(d.reduction_db - 6) < 0.3, JSON.stringify(d));
    const j = JSON.parse(spawnSync("node", [CLI, "--project", dir, "--json"], { encoding: "utf8" }).stdout);
    assert.deepEqual(Object.keys(j.duck[0]), ["id", "natural_db", "target_db", "reduction_db", "got_db", "passes"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI: one BALANCE line, exit 1 on FAIL, --json, --write-qa; bad usage and missing html exit 2", { skip: !hasFfmpeg && "ffmpeg missing" }, () => {
  const dir = project(12);
  try {
    const r = spawnSync("node", [CLI, "--project", dir], { encoding: "utf8" });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stdout, /^FAIL BALANCE nhạc dưới giọng 12\.\d dB[^\n]*\n$/);
    const j = spawnSync("node", [CLI, "--project", dir, "--json"], { encoding: "utf8" });
    assert.equal(JSON.parse(j.stdout).level, "FAIL");
    const lines = [];
    assert.equal(main(["--project", dir, "--write-qa"], { now: () => new Date("2026-10-14T00:00:00Z"), out: (s) => lines.push(s), err: () => {} }), 1);
    assert.match(readFileSync(join(dir, "QA.md"), "utf8"), /^## BALANCE \(2026-10-14T00:00:00\.000Z\)\n\nFAIL BALANCE /);
    assert.equal(spawnSync("node", [CLI], { encoding: "utf8" }).status, 2);
    assert.equal(spawnSync("node", [CLI, "--project", dir, "--bogus"], { encoding: "utf8" }).status, 2);
    assert.equal(spawnSync("node", [CLI, "--project", dir, "--html", "nope.html"], { encoding: "utf8" }).status, 2);
    writeFileSync(join(dir, "index.html"), `<audio id="bgm" src="bed.wav" data-audio-group="music" data-fx-carve="voiceover"></audio><audio id="vo-01" src="vo.wav"></audio>`);
    const bad = spawnSync("node", [CLI, "--project", dir], { encoding: "utf8" });
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /#bgm/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
