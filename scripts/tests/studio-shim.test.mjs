import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SHIM = fileURLToPath(new URL("../studio.mjs", import.meta.url));
const run = (env, args = ["status"]) => spawnSync(process.execPath, [SHIM, ...args], { encoding: "utf8", env: { ...process.env, ...env } });

test("studio.mjs without Motion Studio prints the clone command and exits 2", () => {
  const empty = mkdtempSync(join(tmpdir(), "shim-empty-"));
  try {
    const r = run({ MOTION_STUDIO_HOME: empty, HOME: empty });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /motion-studio/);
  } finally { rmSync(empty, { recursive: true, force: true }); }
});

test("studio.mjs runs bin/motion-studio.mjs with the same arguments and exit code", () => {
  const home = mkdtempSync(join(tmpdir(), "shim-studio-"));
  try {
    mkdirSync(join(home, "bin"));
    writeFileSync(join(home, "bin", "motion-studio.mjs"), "console.log(process.argv.slice(2).join(' ')); process.exit(7);\n");
    const r = run({ MOTION_STUDIO_HOME: home }, ["start", "--background"]);
    assert.equal(r.status, 7);
    assert.equal(r.stdout.trim(), "start --background");
  } finally { rmSync(home, { recursive: true, force: true }); }
});
