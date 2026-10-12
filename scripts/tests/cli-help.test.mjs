import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { helpText, wantsHelp } from "../cli-help.mjs";

const dir = fileURLToPath(new URL("..", import.meta.url));
const CLIS = ["build-case-index", "case-features", "check-viet-pro", "corpus-stats", "cut", "eleven", "find-cases", "judge", "rerank-cases", "video-lint"];

test("wantsHelp / helpText read the leading comment block", () => {
  assert.equal(wantsHelp(["--json", "-h"]), true);
  assert.equal(wantsHelp(["--keyword", "help"]), false);
  const t = helpText(new URL("../rerank-cases.mjs", import.meta.url));
  assert.match(t, /^rerank-cases\.mjs — /);
  assert.match(t, /--help \| -h/);
  assert.ok(!t.includes("import "));
});

for (const name of CLIS) {
  test(`${name}.mjs --help and -h: usage on stdout, exit 0, no side effects`, () => {
    const cwd = mkdtempSync(join(tmpdir(), "help-"));
    try {
      // fake HOME with no .env and no keys: help must not need credentials, network or files
      const env = { ...process.env, HOME: cwd, TYPESAFE_API_KEY: "", ELEVENLABS_API_KEY: "" };
      for (const flag of ["--help", "-h"]) {
        const r = spawnSync("node", [join(dir, `${name}.mjs`), flag], { encoding: "utf8", env, cwd, timeout: 15000 });
        assert.equal(r.status, 0, `${name} ${flag}: ${r.stderr}`);
        assert.ok(r.stdout.startsWith(`${name}.mjs`), `${name} ${flag} stdout: ${r.stdout.slice(0, 80)}`);
        assert.equal(r.stderr, "");
      }
      assert.deepEqual(readdirSync(cwd), []);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
}
