import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { speechSpans, speechWindows, rmsDb, measureBalance } from "../balance-measure.mjs";

test("speechWindows: words closer than 0.3 s merge, sorted", () => {
  assert.deepEqual(speechWindows([[3, 3.5], [1, 1.4], [1.6, 2], [2.35, 2.6]]), [[1, 2], [2.35, 2.6], [3, 3.5]]);
  assert.deepEqual(speechWindows([]), []);
});

test("speechSpans: words on the root timeline (media start, rate, clip end); no words.json → whole clip", () => {
  const dir = mkdtempSync(join(tmpdir(), "balance-measure-"));
  try {
    const a = join(dir, "a.mp3"), b = join(dir, "b.mp3"), c = join(dir, "c.mp3");
    writeFileSync(`${a}.words.json`, JSON.stringify([{ text: "x", start: 0.5, end: 1 }, { text: "y", start: 2, end: 2.6 }, { text: "z", start: 3.5, end: 4 }]));
    writeFileSync(`${b}.words.json`, "not json");
    const tracks = [
      { id: "vo-01", src: a, start: 10, duration: 1.6, mediaStart: 0.5, rate: 1 },
      { id: "vo-02", src: b, start: 20, duration: 2, mediaStart: 0, rate: 1 },
      { id: null, src: c, start: 25, duration: null, mediaStart: 0, rate: 1 },
    ];
    const r = speechSpans(tracks, 30);
    // a: x at 10–10.5, y at 11.5–11.6 (cut by the clip end), z trimmed away
    assert.deepEqual(r.windows.map(([s, e]) => [+s.toFixed(3), +e.toFixed(3)]), [[10, 10.5], [11.5, 11.6], [20, 22], [25, 30]]);
    assert.deepEqual(r.noWords, ["vo-02", c]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("measureBalance: RMS of voice and music inside the speech windows, music outside them", () => {
  const rate = 100;
  const voice = new Float32Array(400), music = new Float32Array(400);
  for (let i = 100; i < 200; i++) voice[i] = i % 2 ? 0.5 : -0.5;
  for (let i = 0; i < 400; i++) music[i] = (i % 2 ? 1 : -1) * (i >= 100 && i < 200 ? 0.25 : 0.1);
  const m = measureBalance({ voice, music, windows: [[1, 2]], rate });
  assert.ok(Math.abs(m.under - 20 * Math.log10(2)) < 1e-6);
  assert.ok(Math.abs(m.musicQuiet - 20 * Math.log10(0.1)) < 1e-6);
  assert.equal(rmsDb(new Float32Array(10)), -Infinity);
  assert.equal(measureBalance({ voice, music, windows: [[0, 4]], rate }).musicQuiet, null, "no quiet part");
});
