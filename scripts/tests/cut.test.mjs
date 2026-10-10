import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  percentile, envelopeDb, analyseEnvelope, parseEdl, snapRanges, buildFilter,
} from "../cut.mjs";

const script = fileURLToPath(new URL("../cut.mjs", import.meta.url));
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const tmp = mkdtempSync(join(tmpdir(), "cut-test-"));
test.after(() => rmSync(tmp, { recursive: true, force: true }));

const runIn = (cwd, ...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", cwd });
const run = (...args) => runIn(tmp, ...args);
const near = (a, b, tol) => Math.abs(a - b) <= tol;

function makeFixture(name, rate, muteAf, pixFmt = "yuv420p") {
  const args = ["-v", "error", "-y",
    "-f", "lavfi", "-i", `testsrc2=size=320x180:rate=${rate}:duration=6`,
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=6"];
  if (muteAf) args.push("-af", "volume=enable='between(t,1.5,2.5)+between(t,4,4.6)':volume=0");
  args.push("-c:v", "libx264", "-pix_fmt", pixFmt, "-c:a", "aac", "-shortest", join(tmp, name));
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
}

if (hasFfmpeg) {
  makeFixture("a.mp4", 25, true);
  makeFixture("b30.mp4", 30, false);
  makeFixture("ten.mp4", 25, false, "yuv420p10le");
}

function writeEdl(name, edl) {
  const p = join(tmp, name);
  writeFileSync(p, JSON.stringify(edl));
  return p;
}

// ---------- pure helpers ----------

test("percentile picks floor(p/100*n) of the sorted values", () => {
  assert.equal(percentile([5, 1, 3, 2, 4], 10), 1);
  assert.equal(percentile([5, 1, 3, 2, 4], 99), 5);
});

test("envelopeDb floors digital silence at -100 dB", () => {
  const db = envelopeDb(new Float32Array(1600), 16000);
  assert.equal(db.length, 10);
  assert.ok(db.every((v) => v === -100));
});

test("analyseEnvelope finds one interior gap and rejects flat audio", () => {
  const db = [...Array(100).fill(-20), ...Array(40).fill(-100), ...Array(100).fill(-20)];
  const r = analyseEnvelope(db, 10);
  assert.equal(r.gaps.length, 1);
  assert.equal(r.gaps[0].start, 1);
  assert.equal(r.gaps[0].end, 1.4);
  assert.throws(() => analyseEnvelope(Array(200).fill(-20), 10), /NO_SPEECH_CONTRAST/);
});

test("parseEdl rejects empty ranges, unknown sources and inverted ranges", () => {
  const sources = { a: "a.mp4" };
  assert.throws(() => parseEdl({ sources, ranges: [] }, tmp), /INVALID_EDL/);
  assert.throws(() => parseEdl({ sources, ranges: [{ source: "x", start: 0, end: 1 }] }, tmp), /INVALID_EDL/);
  assert.throws(() => parseEdl({ sources, ranges: [{ source: "a", start: 2, end: 2 }] }, tmp), /INVALID_EDL/);
});

test("snapRanges rounds to the frame grid", () => {
  const [r] = snapRanges([{ source: "a", start: 0.013, end: 1.507 }], 25);
  assert.equal(r.start, 0);
  assert.equal(r.end, 1.52);
});

test("buildFilter concatenates every range with fades at the joins", () => {
  const f = buildFilter(
    [{ source: "a", start: 0, end: 1.5 }, { source: "a", start: 2.5, end: 4 }],
    { a: 0 }, 0.012,
  );
  assert.ok(f.includes("concat=n=2:v=1:a=1[v][a]"));
  assert.equal(f.split("afade=t=in").length - 1, 2);
});

// ---------- CLI ----------

test("probe finds the two muted stretches", { skip: !hasFfmpeg }, () => {
  const r = run("probe", "--in", "a.mp4");
  assert.equal(r.status, 0, r.stderr);
  const p = JSON.parse(r.stdout);
  const inner = p.gaps.filter((g) => !g.edge);
  assert.equal(inner.length, 2, JSON.stringify(p.gaps));
  assert.ok(near(inner[0].start, 1.5, 0.05) && near(inner[0].end, 2.5, 0.05), JSON.stringify(inner[0]));
  assert.ok(near(inner[1].start, 4.0, 0.05) && near(inner[1].end, 4.6, 0.05), JSON.stringify(inner[1]));
});

test("apply-edl cuts out the silences and keeps the expected duration", { skip: !hasFfmpeg }, () => {
  const edl = writeEdl("cut.json", {
    sources: { a: "a.mp4" },
    ranges: [
      { source: "a", start: 0, end: 1.5 },
      { source: "a", start: 2.5, end: 4 },
      { source: "a", start: 4.6, end: 6 },
    ],
  });
  const r = run("apply-edl", "--edl", edl, "--out", "cut.mp4");
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.ok(near(out.actual_duration, 4.4, 0.041), String(out.actual_duration));
  const p = run("probe", "--in", "cut.mp4");
  assert.equal(p.status, 2, p.stdout + p.stderr);
  assert.match(p.stderr, /NO_SPEECH_CONTRAST/);
});

test("apply-edl refuses sources with different frame rates", { skip: !hasFfmpeg }, () => {
  const edl = writeEdl("mixed.json", {
    sources: { a: "a.mp4", b: "b30.mp4" },
    ranges: [{ source: "a", start: 0, end: 1 }, { source: "b", start: 0, end: 1 }],
  });
  const r = run("apply-edl", "--edl", edl, "--out", "mixed.mp4");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /INCOMPATIBLE_SOURCES/);
});

test("apply-edl rejects a range beyond the source", { skip: !hasFfmpeg }, () => {
  const edl = writeEdl("beyond.json", {
    sources: { a: "a.mp4" },
    ranges: [{ source: "a", start: 0, end: 99 }],
  });
  const r = run("apply-edl", "--edl", edl, "--out", "beyond.mp4");
  assert.equal(r.status, 1, r.stdout + r.stderr);
});

test("apply-edl refuses to overwrite a source and leaves it intact", { skip: !hasFfmpeg }, () => {
  const before = statSync(join(tmp, "a.mp4")).size;
  const edl = writeEdl("self.json", { sources: { a: "a.mp4" }, ranges: [{ source: "a", start: 0, end: 1 }] });
  const r = run("apply-edl", "--edl", edl, "--out", "a.mp4");
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /OUTPUT_IS_SOURCE/);
  assert.equal(statSync(join(tmp, "a.mp4")).size, before);
});

test("apply-edl resolves source paths relative to the EDL file", { skip: !hasFfmpeg }, () => {
  const edl = writeEdl("rel.json", { sources: { a: "a.mp4" }, ranges: [{ source: "a", start: 0, end: 1 }] });
  const r = runIn(tmpdir(), "apply-edl", "--edl", edl, "--out", join(tmp, "rel.mp4"));
  assert.equal(r.status, 0, r.stderr);
});

test("apply-edl refuses 10-bit sources", { skip: !hasFfmpeg }, () => {
  const edl = writeEdl("ten.json", { sources: { t: "ten.mp4" }, ranges: [{ source: "t", start: 0, end: 1 }] });
  const r = run("apply-edl", "--edl", edl, "--out", "ten-cut.mp4");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /UNSUPPORTED_HDR_OR_10BIT/);
});
