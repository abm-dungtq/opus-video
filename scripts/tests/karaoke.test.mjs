// Karaoke in TIMING: chunks of at most 9 words on the words' onsets, text from the checked source,
// nothing added when <html> has no data-karaoke.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTiming, karaoke } from "../timing.mjs";
import { textHash } from "../script-md.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/timing", import.meta.url));
const WORDS = JSON.parse(readFileSync(join(FIXTURE, "assets/voice/01.mp3.words.json"), "utf8"));
const LINE_START = 2.5;

function project({ karaoke = true, script = null, stamped = script } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "karaoke-"));
  cpSync(FIXTURE, dir, { recursive: true });
  if (karaoke) {
    const html = join(dir, "index.html");
    writeFileSync(html, readFileSync(html, "utf8").replace('<html lang="vi"', '<html lang="vi" data-karaoke'));
  }
  if (script != null) {
    mkdirSync(join(dir, "script"), { recursive: true });
    writeFileSync(join(dir, "script/01.txt"), script);
    writeFileSync(join(dir, "assets/voice/01.mp3.gate.json"), JSON.stringify({ sha256: textHash(stamped), script: "script/01.txt", override: null }));
  }
  return dir;
}
const withProject = (opts, fn) => { const dir = project(opts); try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };

test("data-karaoke: chunks of at most 9 words, each word within a frame of its words.json onset", () => withProject({ script: "Bạn đưa cả mã nguồn, ảnh chụp." }, (dir) => {
  const { timing, warnings } = buildTiming({ dir });
  assert.ok(timing.captions.length >= 1);
  const all = timing.captions.flatMap((c) => c.words);
  assert.equal(all.length, WORDS.length);
  for (const c of timing.captions) assert.ok(c.words.length <= 9);
  all.forEach(([, start], i) => assert.ok(Math.abs(start - (WORDS[i].start + LINE_START)) <= 1 / timing.fps, `${i}: ${start}`));
  assert.deepEqual(warnings.filter((w) => w.startsWith("karaoke")), []);
}));

test("the text shown is the source text, not the words.json text", () => withProject({ script: "BẠN đưa cả mã nguồn, ảnh chụp." }, (dir) => {
  const { timing } = buildTiming({ dir });
  assert.equal(timing.captions[0].words[0][0], "BẠN");
}));

test("a source with another word count keeps the words.json text and warns", () => withProject({ script: "Bạn đưa mã nguồn." }, (dir) => {
  const { timing, warnings } = buildTiming({ dir });
  assert.equal(timing.captions[0].words[0][0], "Bạn");
  assert.ok(warnings.includes("karaoke vo-01: số từ chữ nguồn 4 khác words.json 7"), warnings.join("\n"));
}));

test("no source text: words.json text and a warning", () => withProject({}, (dir) => {
  const { timing, warnings } = buildTiming({ dir });
  assert.ok(timing.captions.length >= 1);
  assert.ok(warnings.includes("karaoke vo-01: không tìm thấy chữ nguồn, dùng chữ của words.json"));
}));

test("a script changed after the voice was made: words.json text and a warning", () => withProject({ script: "Bạn đưa cả mã nguồn, ảnh chụp.", stamped: "Câu cũ." }, (dir) => {
  const { timing, warnings } = buildTiming({ dir });
  assert.equal(timing.captions[0].words[0][0], "Bạn");
  assert.ok(warnings.includes("karaoke vo-01: script/01.txt đã đổi sau khi tạo giọng, dùng chữ của words.json"), warnings.join("\n"));
}));

test("a manifest passed in wins over project.json on disk", () => withProject({}, (dir) => {
  const manifest = { lines: [{ id: "vo-01", text: "MỘT HAI BA BỐN NĂM SÁU BẢY", gate: "pass" }] };
  writeFileSync(join(dir, "project.json"), JSON.stringify({ lines: [{ id: "vo-01", text: "a b c d e f g", gate: "pass" }] }));
  const { timing } = buildTiming({ dir, manifest });
  assert.equal(timing.captions[0].words[0][0], "MỘT");
}));

test("without data-karaoke TIMING has no captions key", () => withProject({ karaoke: false, script: "Bạn đưa cả mã nguồn, ảnh chụp." }, (dir) => {
  const { timing } = buildTiming({ dir });
  assert.equal("captions" in timing, false);
  assert.equal("env" in timing, false);
}));

test("gateway patch: captions show the text of the version being written, not the one on disk", async () => {
  const { beatProject } = await import("./fixtures/beat-project.mjs");
  const { load } = await import("../manifest.mjs");
  const { patch, EXIT } = await import("../gateway.mjs");
  const dir = beatProject({ prefix: "karaoke-gw-" });
  try {
    const html = join(dir, "index.html");
    writeFileSync(html, readFileSync(html, "utf8").replace(/<html\b/, "<html data-karaoke"));
    const m = load(dir);
    const r = patch(dir, { actor: "human", base: m.version, ops: [{ op: "set_line_text", id: "vo-01", text: "XIN CHÀO" }] });
    assert.equal(r.code, EXIT.ok, r.error);
    const timing = JSON.parse(readFileSync(join(dir, "timing.json"), "utf8"));
    assert.equal(timing.captions[0].words[0][0], "XIN");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("caption timing: on 0.12 s before the first word, the line's last chunk held 0.5 s, no overlap", () => withProject({ script: "Bạn đưa cả mã nguồn, ảnh chụp." }, (dir) => {
  const { timing } = buildTiming({ dir });
  const caps = timing.captions;
  caps.forEach((c, k) => {
    assert.ok(Math.abs(c.start - Math.max(0, c.words[0][1] - 0.12)) <= 0.001, `start ${k}`);
    const next = caps[k + 1];
    if (next) assert.ok(c.end <= next.start + 1e-9 && c.end <= next.words[0][1] - 0.16 + 0.001, `end ${k}`);
  });
  const last = caps[caps.length - 1];
  assert.ok(Math.abs(last.end - (last.words[last.words.length - 1][2] + 0.5)) <= 0.001, String(last.end));
}));

test("two lines of 12 and 3 words: lead, 0.16 s gap before every next chunk, 0.5 s hold at the end", () => {
  const dir = mkdtempSync(join(tmpdir(), "karaoke-x-"));
  try {
    const mk = (id, n, t0) => Array.from({ length: n }, (_, i) => ({ id, text: `từ${i}`, start: t0 + i * 0.3, end: t0 + i * 0.3 + 0.25 }));
    const a = mk("a", 12, 1), b = mk("b", 3, 1 + 11 * 0.3 + 0.25 + 0.3);
    const { captions } = karaoke(dir, { tracks: [{ id: "a" }, { id: "b" }], words: [...a, ...b] }, null);
    assert.equal(captions.length, 3);
    const [c1, c2, c3] = captions;
    assert.equal(c1.start, 0.88);
    assert.equal(c1.end, +(c2.words[0][1] - 0.16).toFixed(3), "inside the line: off 0.16 s before the next chunk");
    assert.equal(c2.end, +(c3.words[0][1] - 0.16).toFixed(3), "the hold is cut 0.16 s before the next line");
    assert.equal(c3.end, +(b[2].end + 0.5).toFixed(3), "the last chunk is held 0.5 s");
    for (let k = 0; k + 1 < captions.length; k++) assert.ok(captions[k].end <= captions[k + 1].start);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a 2 s pause inside one track: the chunk before it goes off 0.5 s after its last word", () => {
  const dir = mkdtempSync(join(tmpdir(), "karaoke-p-"));
  try {
    const w = (text, start) => ({ id: "a", text, start, end: start + 0.25 });
    const words = [w("Một.", 1), w("Hai", 1.25 + 2), w("ba.", 3.55)];
    const { captions } = karaoke(dir, { tracks: [{ id: "a" }], words }, null);
    assert.ok(captions.length >= 2, JSON.stringify(captions));
    assert.equal(captions[0].end, 1.75);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
