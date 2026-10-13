import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../video-lint.mjs", import.meta.url));
const badFixture = fileURLToPath(new URL("./fixtures/video-lint-bad", import.meta.url));
const abm = process.env.OPUS_VIDEO_ABM_DIR ?? "/Volumes/2/Edit-Video/abm-intro";
const run = (...args) => spawnSync("node", [script, ...args], { encoding: "utf8" });

test("flags lowercase transforms and tiny fonts in the bad fixture", () => {
  const r = run("--hyperframes", badFixture, "--skip-runtime", "--json");
  assert.equal(r.status, 1, r.stderr);
  const findings = JSON.parse(r.stdout);
  const lower = findings.filter((f) => f.code === "LOWERCASE_TRANSFORM");
  assert.ok(lower.length >= 2);
  assert.ok(lower.some((f) => f.file === "index.html"));
  assert.ok(lower.some((f) => f.file === ".hyperframes/caption-skin.html"));
  assert.ok(findings.some((f) => f.code === "FONT_TOO_SMALL" && f.severity === "ERROR"));
  assert.ok(!findings.some((f) => f.code === "SAFE_ZONE_9X16"), "--skip-runtime must not run hyperframes");
});

test("ABM intro passes static lint", { skip: !existsSync(abm) }, () => {
  const r = run("--hyperframes", abm, "--skip-runtime");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(!/^ERROR /m.test(r.stdout));
});

const hedgeFixture = fileURLToPath(new URL("./fixtures/video-lint-hedge", import.meta.url));

test("HEDGE_LABEL: ERROR for voice_source: clip; only rendered text (no title/alt/Error/comments/unloaded js)", () => {
  const r = run("--hyperframes", hedgeFixture, "--skip-runtime", "--json");
  assert.equal(r.status, 1, r.stderr);
  const hedge = JSON.parse(r.stdout).filter((f) => f.code === "HEDGE_LABEL");
  assert.deepEqual(hedge.map((f) => `${f.file}:${f.line}`).sort(), ["assets/fx.js:2", "assets/fx.js:2", "assets/fx.js:6", "index.html:12", "index.html:8", "index.html:8"]);
  assert.ok(hedge.every((f) => f.severity === "ERROR"));
});

test("HEDGE_LABEL: only WARN (exit 0) without voice_source: clip", async () => {
  const { mkdtempSync, cpSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "hedge-"));
  try {
    cpSync(hedgeFixture, dir, { recursive: true });
    writeFileSync(join(dir, "BRIEF.md"), "---\nlanguage: vi\n---\n");
    const r = run("--hyperframes", dir, "--skip-runtime", "--json");
    assert.equal(r.status, 0, r.stdout);
    assert.ok(JSON.parse(r.stdout).filter((f) => f.code === "HEDGE_LABEL").every((f) => f.severity === "WARN"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
