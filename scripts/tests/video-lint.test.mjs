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
