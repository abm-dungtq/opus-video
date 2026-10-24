import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCues, cuesOf, main, srtTime, wrap } from "../captions-from-words.mjs";

// A project with two voiced lines (words sidecars) and, when bare, a third line without words.
function project({ bare = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "cfw-"));
  mkdirSync(join(dir, "assets", "mix"), { recursive: true });
  const say = (text, step = 0.4) => text.split(" ").map((t, i) => ({ text: t, start: r(i * step), end: r(i * step + step - 0.05) }));
  const r = (n) => Math.round(n * 1000) / 1000;
  const l1 = "Tin khẩn. Hai mươi mốt giờ bảy phút tối nay, một tài khoản Facebook mới vừa được tạo ra trong căn nhà này.";
  const l2 = "Tôi mở máy, đ[bíp] mẹ, bốn mươi bảy thông báo.";
  writeFileSync(join(dir, "assets", "mix", "voice-01.mp3.words.json"), JSON.stringify(say(l1)));
  writeFileSync(join(dir, "assets", "mix", "voice-02.mp3.words.json"), JSON.stringify(say(l2, 0.35)));
  const lines = [
    { id: "vo-02", shot: "s1", text: l2, file: "assets/mix/voice-02.mp3", start: 12, duration: 4, gate: "pass" },
    { id: "vo-01", shot: "s1", text: l1, file: "assets/mix/voice-01.mp3", start: 0.5, duration: 10, gate: "pass" },
  ];
  if (bare) lines.push({ id: "vo-03", shot: "s1", text: "Câu này chưa có words, chia đều theo độ dài.", file: "assets/mix/voice-03.mp3", start: 20, duration: 3, gate: "unknown" });
  writeFileSync(join(dir, "project.json"), JSON.stringify({ schema: "opus-video/project@1", lines, shots: [], music: [], assets: [], version: 1 }));
  return dir;
}

const parse = (srt) => srt.trim().split(/\n\n/).map((b) => {
  const [n, time, ...text] = b.split("\n");
  const [a, z] = time.split(" --> ").map((t) => { const [h, m, s] = t.replace(",", ".").split(":").map(Number); return h * 3600 + m * 60 + s; });
  return { n: Number(n), start: a, end: z, text };
});

test("two lines with words: blocks numbered, time rising, 1–6 s, no line over 42 characters, no beep mark", () => {
  const dir = project();
  try {
    const out = join(dir, "delivery", "a.srt");
    const lines = [];
    assert.equal(main(["--project", dir, "--out", out], { out: (s) => lines.push(s), err: (s) => lines.push(s) }), 0, lines.join(""));
    assert.match(lines.join(""), /^CAPTIONS .* cues=\d+ lines=2\n$/);
    const cues = parse(readFileSync(out, "utf8"));
    assert.ok(cues.length >= 4, `${cues.length} cues`);
    cues.forEach((c, i) => {
      assert.equal(c.n, i + 1);
      assert.ok(c.end > c.start);
      assert.ok(c.end - c.start <= 6 + 1e-9, `cue ${c.n} lasts ${c.end - c.start}`);
      assert.ok(c.text.length >= 1 && c.text.length <= 2, `cue ${c.n} has ${c.text.length} lines`);
      for (const t of c.text) assert.ok(t.length <= 42, `cue ${c.n}: "${t}"`);
      if (i) assert.ok(c.start >= cues[i - 1].end - 1e-9, `cue ${c.n} overlaps the one before`);
    });
    assert.equal(cues[0].start, 0.5, "first word of the first line by start, not by file order");
    assert.equal(cues[0].text.join(" "), "Tin khẩn.", "a sentence end closes the cue");
    const all = cues.map((c) => c.text.join(" ")).join(" ");
    assert.ok(!all.includes("[bíp]") && all.includes("đ mẹ"), all);
    assert.ok(cues.some((c) => c.start >= 12), "the second line has its own cues");
    assert.ok(!cues.some((c) => c.start < 12 && c.end > 12), "no cue crosses two lines");
    assert.equal(main(["--project", dir, "--out", out], { out: () => {}, err: () => {} }), 2, "never overwrites");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a line without words is spread over its duration with a WARN and still has cues", () => {
  const dir = project({ bare: true });
  try {
    const { cues, warnings } = buildCues(dir, JSON.parse(readFileSync(join(dir, "project.json"), "utf8")));
    assert.deepEqual(warnings, ["vo-03: không có words.json, chia đều lời theo độ dài câu"]);
    const late = cues.filter((c) => c.start >= 20);
    assert.ok(late.length >= 1);
    assert.ok(late.at(-1).end <= 23 + 1e-9);
    assert.match(late.map((c) => c.lines.join(" ")).join(" "), /^Câu này chưa có words, chia đều theo độ dài\.$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("wrap, the 6 s ceiling, the 1 s floor and SRT time", () => {
  assert.deepEqual(wrap(["một", "hai", "ba"], 7), ["một hai", "ba"]);
  assert.deepEqual(wrap(["mộtcụmrấtdài"], 5), ["mộtcụmrấtdài"]);
  const slow = Array.from({ length: 10 }, (_, i) => ({ text: "chữ", start: i, end: i + 0.9 }));
  for (const c of cuesOf(slow)) assert.ok(c.end - c.start <= 6, JSON.stringify(c));
  assert.equal(srtTime(3723.0456), "01:02:03,046");
  const dir = mkdtempSync(join(tmpdir(), "cfw-"));
  try {
    const m = { lines: [{ id: "vo-01", text: "Ừ.", file: "x.mp3", start: 2, duration: 0.3 }, { id: "vo-02", text: "Rồi sao nữa.", file: "y.mp3", start: 2.6, duration: 1 }] };
    const { cues } = buildCues(dir, m);
    assert.equal(cues[0].end, 2.6, "the 1 s floor stops at the next cue");
    assert.equal(cues[1].end, 3.6);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("bad usage is exit 2", () => {
  const quiet = { out: () => {}, err: () => {} };
  assert.equal(main(["--project", "/x"], quiet), 2);
  assert.equal(main(["--project", "/x", "--out", "/tmp/x.srt", "--max-chars", "0"], quiet), 2);
  assert.equal(main(["--nope"], quiet), 2);
});
