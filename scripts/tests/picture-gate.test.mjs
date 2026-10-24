// The final gate compares the approved animatic by what it shows: pictureHash (no TIMING, no sound,
// plus scenes/) must match DEMO.md visual_hash:, while a changed sound (audio_hash:) only warns
// until audio_review: names the current sound. Projects without visual_hash: keep the file dates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { audioHash, pictureHash, pictureFiles, visualHash, main as renderFinal } from "../render-final.mjs";
import { recordAudioReview, writeDemoMd, main as makeDemo } from "../make-demo.mjs";
import { check, checkCreative, LEGACY_MTIME_WARN } from "../check-preflight.mjs";

const TIMING = (n) => `/* TIMING:BEGIN */\n      window.TIMING = {"fps":30,"duration":8,"scenes":{"s1":{"start":0,"end":${n}}}};\n      /* TIMING:END */`;
const html = (n = 8) => `<!DOCTYPE html>
<html lang="vi">
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="8" data-width="1920" data-height="1080">
      <img src="assets/img/a.png">
      <audio id="vo-01" src="assets/voice/01.mp3" data-start="1" data-duration="2" data-track-index="10" data-volume="1"></audio>
      <audio id="vo-02" src="assets/mix/voice-02.mp3" data-start="4" data-duration="2" data-track-index="11" data-volume="1"></audio>
    </div>
    <script>
      ${TIMING(n)}
    </script>
    <script type="module">import { buildFilm } from "./scenes/s01.mjs"; buildFilm({ timing: window.TIMING });</script>
  </body>
</html>
`;

const project = () => {
  const dir = mkdtempSync(join(tmpdir(), "picture-gate-"));
  for (const d of ["assets/img", "assets/voice", "assets/mix", "scenes", "demo"]) mkdirSync(join(dir, d), { recursive: true });
  writeFileSync(join(dir, "index.html"), html());
  writeFileSync(join(dir, "scenes", "s01.mjs"), "export const buildFilm = () => [];\n");
  writeFileSync(join(dir, "assets", "img", "a.png"), "png-a");
  writeFileSync(join(dir, "assets", "voice", "01.mp3"), "voice-1");
  writeFileSync(join(dir, "assets", "mix", "voice-02.mp3"), "voice-2");
  writeFileSync(join(dir, "assets", "mix", "voice-02.mp3.words.json"), "[]");
  writeFileSync(join(dir, "PLAN.md"), "# PLAN\n");
  writeFileSync(join(dir, "BRIEF.md"), "---\ncreative_override: nhanh theo case c-01\n---\n# Brief\n");
  return dir;
};
const withProject = (fn) => { const dir = project(); try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };
const at = (f, s) => utimesSync(f, s, s);
const T0 = Date.now() / 1000 - 3600;

// An approved animatic: PLAN.md, then the animatic, then every other file older than it, and
// DEMO.md holding the hashes make-demo would write.
const approve = (dir, extra = "") => {
  writeFileSync(join(dir, "demo", "animatic.mp4"), "mp4");
  writeDemoMd(dir, [], "main", "", "demo/animatic.mp4", [], { visual_hash: pictureHash(dir), audio_hash: audioHash(dir) });
  writeFileSync(join(dir, "DEMO.md"), readFileSync(join(dir, "DEMO.md"), "utf8").replace("approval: pending", `${extra}approval: user@studio 2026-10-24 duyệt animatic`));
  at(join(dir, "PLAN.md"), T0);
  for (const f of ["index.html", "scenes/s01.mjs", "assets/voice/01.mp3", "assets/mix/voice-02.mp3"]) at(join(dir, f), T0 + 10);
  at(join(dir, "demo", "animatic.mp4"), T0 + 20);
};
const edit = (dir, f, text) => { writeFileSync(join(dir, f), text); at(join(dir, f), T0 + 30); };
const gate = (dir, opts = {}) => {
  const errors = [], warnings = [];
  checkCreative({ dir, plan: { sections: {} }, brief: readFileSync(join(dir, "BRIEF.md"), "utf8"), stage: "final", errors, warnings,
    motion: () => ({ frames: 90, still: 0, ratio: 0, peak: 9 }), probe: () => ({ width: 960, height: 540 }), ...opts });
  return { errors, warnings: warnings.filter((w) => !w.startsWith("creative direction checks skipped")) };
};
const HEAR_AGAIN = /tiếng đã đổi sau animatic: nghe lại, chạy mix-balance\.mjs và qc âm thanh, rồi bấm Nghe rồi, được/;

test("pictureHash ignores TIMING and sound files, follows scenes/; visualHash and audioHash keep their meaning", () => withProject((dir) => {
  const p0 = pictureHash(dir), v0 = visualHash(dir), a0 = audioHash(dir);
  writeFileSync(join(dir, "index.html"), html(5));
  assert.equal(pictureHash(dir), p0, "a rewritten TIMING block is not a picture change");
  assert.notEqual(visualHash(dir), v0, "visualHash (render-final --audio-only) still covers TIMING");
  writeFileSync(join(dir, "assets", "voice", "01.mp3"), "voice-1 again");
  writeFileSync(join(dir, "assets", "mix", "voice-02.mp3"), "voice-2 again");
  writeFileSync(join(dir, "assets", "mix", "voice-02.mp3.words.json"), "[1]");
  writeFileSync(join(dir, "scenes", ".DS_Store"), "junk");
  assert.equal(pictureHash(dir), p0, "a new take, its words and a dotfile in scenes/ are not a picture change");
  assert.notEqual(audioHash(dir), a0);
  writeFileSync(join(dir, "scenes", "s01.mjs"), "export const buildFilm = () => [1];\n");
  assert.notEqual(pictureHash(dir), p0, "scenes/*.mjs is the picture");
  const files = pictureFiles(dir);
  assert.ok(files.includes("scenes/s01.mjs") && files.includes("assets/img/a.png"), files.join(", "));
  assert.ok(!files.some((f) => f.endsWith(".mp3") || f.endsWith(".words.json") || f.includes(".DS_Store")), files.join(", "));
}));

test("writeDemoMd run again keeps visual_hash, audio_hash and audio_review once each; null removes the hashes", () => withProject((dir) => {
  writeDemoMd(dir, ["demo/frame-00.png"], "main", "", "demo/animatic.mp4", [], { visual_hash: "v1", audio_hash: "a1" });
  recordAudioReview(dir, "user@studio", { hash: () => "a2", now: new Date("2026-10-24T09:00:00Z") });
  writeDemoMd(dir, ["demo/frame-00.png"], "main");
  writeDemoMd(dir, ["demo/9x16/frame-00.png"], "9:16", "", "demo/9x16/animatic.mp4");
  const text = readFileSync(join(dir, "DEMO.md"), "utf8");
  for (const [key, n] of [["visual_hash: v1", 1], ["audio_hash: a1", 1], ["audio_review: user@studio 2026-10-24T09:00:00.000Z a2", 1], ["approval: pending", 1]])
    assert.equal(text.split(key).length - 1, n, `${key} in\n${text}`);
  writeDemoMd(dir, [], "main", "", "demo/animatic.mp4", [], null);
  const after = readFileSync(join(dir, "DEMO.md"), "utf8");
  assert.doesNotMatch(after, /visual_hash|audio_hash:/);
  assert.match(after, /audio_review: user@studio/);
}));

test("--record-audio-review writes the current audioHash, replaces its own line and leaves approval: alone", () => withProject((dir) => {
  approve(dir);
  const before = readFileSync(join(dir, "DEMO.md"), "utf8");
  const quiet = console.log;
  console.log = () => {};
  try {
    assert.equal(makeDemo(["--project", dir, "--record-audio-review", "user@studio"]), 0);
    assert.equal(makeDemo(["--project", dir, "--record-audio-review", "user@studio"]), 0);
  } finally { console.log = quiet; }
  const text = readFileSync(join(dir, "DEMO.md"), "utf8");
  const lines = text.split("\n").filter((l) => l.startsWith("audio_review:"));
  assert.equal(lines.length, 1, text);
  assert.match(lines[0], new RegExp(`^audio_review: user@studio \\d{4}-\\d\\d-\\d\\dT\\S+Z ${audioHash(dir)}$`));
  assert.equal(text.replace(/^audio_review:.*\n/m, ""), before, "nothing else in DEMO.md changes");
  const err = console.error;
  console.error = () => {};
  try {
    assert.equal(makeDemo(["--project", dir, "--record-audio-review", "bad name"]), 2);
    assert.equal(makeDemo(["--project", dir, "--record-audio-review", "user@studio", "--animatic"]), 2);
    rmSync(join(dir, "DEMO.md"));
    assert.equal(makeDemo(["--project", dir, "--record-audio-review", "user@studio"]), 2);
  } finally { console.error = err; }
}));

test("final gate by hash: a new voice take only warns, audio_review silences it, a scenes/ edit fails", () => withProject((dir) => {
  approve(dir);
  assert.deepEqual(gate(dir), { errors: [], warnings: [] });
  // Re-voicing a line: the take changes and timing.mjs rewrites TIMING, so index.html is newer.
  edit(dir, "assets/mix/voice-02.mp3", "a longer take");
  edit(dir, "index.html", html(6));
  let r = gate(dir);
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], HEAR_AGAIN);
  recordAudioReview(dir, "user@studio");
  assert.deepEqual(gate(dir), { errors: [], warnings: [] });
  edit(dir, "scenes/s01.mjs", "export const buildFilm = () => ['moved'];\n");
  r = gate(dir);
  assert.equal(r.errors.length, 1, JSON.stringify(r));
  assert.match(r.errors[0], /^hình đã đổi sau animatic được duyệt \(.*scenes\/s01\.mjs.*\); chạy lại make-demo\.mjs --animatic$/);
}));

test("files under assets/gen/ (drawing batches, raw and keyed drawings, rig previews) are not the picture", () => withProject((dir) => {
  approve(dir);
  const p0 = pictureHash(dir), v0 = visualHash(dir);
  for (const [f, text] of [["assets/gen/batches/thumbnail.json", "[{\"id\":\"thumb\"}]"], ["assets/gen/raw/thumb-1.png", "png-raw"],
    ["assets/gen/keyed/ba-noi/pose-1.png", "png-keyed"], ["assets/gen/rig-preview/ba-noi.png", "png-preview"]]) {
    mkdirSync(join(dir, f, ".."), { recursive: true });
    edit(dir, f, text);
  }
  assert.equal(pictureHash(dir), p0, "a drawing batch written after the animatic leaves the approved picture as it was");
  assert.equal(visualHash(dir), v0, "render-final --audio-only reads the same picture");
  assert.ok(!pictureFiles(dir).some((x) => x.startsWith("assets/gen/")), pictureFiles(dir).join(", "));
  assert.deepEqual(gate(dir), { errors: [], warnings: [] });
  // A composition that loads a file from assets/gen/ shows it, so that file is the picture again.
  edit(dir, "index.html", html().replace('<img src="assets/img/a.png">', '<img src="assets/img/a.png"><img src="assets/gen/raw/thumb-1.png">'));
  assert.notEqual(pictureHash(dir), p0);
  assert.ok(pictureFiles(dir).includes("assets/gen/raw/thumb-1.png"));
}));

test("without visual_hash: or with --legacy-mtime the file dates decide, and --legacy-mtime says so", () => withProject((dir) => {
  approve(dir);
  edit(dir, "index.html", html(6));
  assert.deepEqual(gate(dir).errors, [], "with the hash a TIMING rewrite passes");
  const legacy = gate(dir, { legacyMtime: true });
  assert.match(legacy.errors.join("\n"), /index\.html newer than the animatic demo\/animatic\.mp4/);
  assert.doesNotMatch(legacy.warnings.join("\n"), HEAR_AGAIN, "the dates path never compares sound");
  writeFileSync(join(dir, "DEMO.md"), readFileSync(join(dir, "DEMO.md"), "utf8").replace(/^visual_hash:.*\n/m, ""));
  assert.match(gate(dir).errors.join("\n"), /index\.html newer than the animatic/);
  const r = check({ project: dir, stage: "final", legacyMtime: true, sync: () => ({ errors: [], warnings: [], none: true }), words: () => ({ errors: [], warnings: [] }), balance: () => ({ level: "PASS", line: "PASS ok" }) });
  assert.ok(r.warnings.includes(LEGACY_MTIME_WARN), JSON.stringify(r.warnings));
  assert.ok(!check({ project: dir, stage: "final", sync: () => ({ errors: [], warnings: [], none: true }), words: () => ({ errors: [], warnings: [] }), balance: () => ({ level: "PASS", line: "PASS ok" }) }).warnings.includes(LEGACY_MTIME_WARN));
}));

test("PLAN.md newer than the animatic still fails with a matching hash", () => withProject((dir) => {
  approve(dir);
  at(join(dir, "PLAN.md"), T0 + 40);
  assert.match(gate(dir).errors.join("\n"), /animatic demo\/animatic\.mp4 is older than PLAN\.md/);
}));

test("render-final hands --legacy-mtime to the preflight", () => {
  const seen = [];
  const checkImpl = (o) => { seen.push(o); return { pass: false, errors: ["x"], warnings: [], stage: "final" }; };
  const quiet = { err: () => {}, log: () => {} };
  renderFinal(["--project", "/p", "--legacy-mtime", "--", "--output", "renders/x.mp4"], { checkImpl, ...quiet });
  renderFinal(["--project", "/p", "--", "--output", "renders/x.mp4"], { checkImpl, ...quiet });
  assert.deepEqual(seen, [{ project: "/p", stage: "final", legacyMtime: true }, { project: "/p", stage: "final" }]);
});
