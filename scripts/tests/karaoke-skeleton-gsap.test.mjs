// The skeleton's karaoke block on a real GSAP timeline: a chunk is off after its end whether the
// renderer seeks frame by frame or jumps. GSAP comes from a cache dir outside the repo (npm, offline
// first); the test is skipped when it cannot be installed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const SKELETON = fileURLToPath(new URL("../../templates/composition/index-skeleton.html", import.meta.url));
const GSAP_VERSION = "3.14.2"; // the version the skeleton loads
const FPS = 30;

function loadGsap() {
  const dir = join(tmpdir(), `opus-video-gsap-${GSAP_VERSION}`);
  const pkg = join(dir, "node_modules", "gsap", "package.json");
  if (!existsSync(pkg)) {
    mkdirSync(dir, { recursive: true });
    try {
      execFileSync("npm", ["install", `gsap@${GSAP_VERSION}`, "--prefer-offline", "--no-save", "--no-audit", "--no-fund", "--silent", "--prefix", dir],
        { stdio: "ignore", timeout: 60_000 });
    } catch { return null; }
  }
  return createRequire(pkg)("gsap").gsap;
}

// Runs the karaoke block of the skeleton against a timeline; elements are plain objects, so
// autoAlpha is tweened as a plain property with the same timeline semantics.
function karaokeBlock() {
  const html = readFileSync(SKELETON, "utf8");
  const m = html.match(/\/\/ -+ Vietnamese karaoke captions[\s\S]*?(?=\/\/ -+ signature)/);
  assert.ok(m, "karaoke block not found in the skeleton");
  return m[0];
}

function build(gsap, captions) {
  const tl = gsap.timeline({ paused: true });
  const caps = [];
  const node = () => ({ className: "", textContent: "", autoAlpha: 1, y: 0, append() {} }); // plain-property targets need the keys
  const capLayer = { append: (el) => caps.push(el) };
  vm.runInNewContext(karaokeBlock(), {
    T: { fps: FPS, captions }, tl, FR: 1 / FPS, $: () => capLayer,
    document: { createElement: node },
  });
  return { tl, caps };
}

const gsap = loadGsap();
// Short chunks (two voice tracks overlapping), a chunk long enough to fade out, and one shorter than a frame.
const CAPTIONS = [
  { start: 1.0, end: 1.08, words: [["một", 1.0]] },
  { start: 1.5, end: 1.6, words: [["hai", 1.5], ["ba", 1.55]] },
  { start: 2.0, end: 2.2, words: [["bốn", 2.0]] },
  { start: 3.0, end: 4.0, words: [["năm", 3.0], ["sáu", 3.5]] },
  { start: 5.0, end: 5.02, words: [["bảy", 5.0]] },
];

test("a chunk shorter than a frame adds no caption", { skip: !gsap && "gsap unavailable" }, () => {
  const { caps } = build(gsap, CAPTIONS);
  assert.equal(caps.length, 4);
});

test("frame-by-frame seeks: every chunk is off after its end", { skip: !gsap && "gsap unavailable" }, () => {
  const { tl, caps } = build(gsap, CAPTIONS);
  for (let f = 0; f <= 6 * FPS; f++) {
    const t = f / FPS;
    tl.seek(t);
    caps.forEach((cap, i) => {
      if (t > CAPTIONS[i].end + 1e-6) assert.equal(cap.autoAlpha, 0, `chunk ${i} at ${t.toFixed(3)} s`);
    });
  }
  // the chunks are seen: alpha is up inside a long one
  tl.seek(3.5);
  assert.equal(caps[3].autoAlpha, 1);
});

test("jump seeks: every chunk is off after its end", { skip: !gsap && "gsap unavailable" }, () => {
  for (const [i, c] of CAPTIONS.slice(0, 4).entries()) {
    for (const t of [c.end + 1 / FPS, c.end + 0.5, 6]) {
      const { tl, caps } = build(gsap, CAPTIONS); // a fresh timeline: the seek jumps from 0
      tl.seek(t);
      assert.equal(caps[i].autoAlpha, 0, `chunk ${i} at ${t} s`);
    }
  }
});
