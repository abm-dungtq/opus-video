import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { imageArgs, videoArgs } from "../gflow.mjs";

const GFLOW = fileURLToPath(new URL("../gflow.mjs", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "ov-gflow-"));
after(() => rmSync(dir, { recursive: true, force: true }));

// A fake gflow: records its argv, writes the -o file (or two files into --out), exits FAKE_EXIT.
const fake = join(dir, "fake-gflow.mjs");
writeFileSync(fake, `#!/usr/bin/env node
import { appendFileSync, writeFileSync } from "node:fs";
const a = process.argv.slice(2);
appendFileSync(process.env.FAKE_LOG, JSON.stringify(a) + "\\n");
if (a[0] === "project") {
  // like gflow: a one-line log event, then the pretty-printed --json result
  console.log(JSON.stringify({ event: "catalog" }));
  const known = JSON.parse(process.env.FAKE_PROJECTS ?? "[]");
  console.log(JSON.stringify(a[1] === "list" ? { status: "ok", projects: known } : { status: "ok", project_id: "new-id", title: a[a.indexOf("--name") + 1] }, null, 2));
  process.exit(0);
}
const code = Number(process.env.FAKE_EXIT ?? 0);
if (code === 0 && a.includes("-o")) writeFileSync(a[a.indexOf("-o") + 1], "img");
if (code === 0 && a.includes("--out")) { const d = a[a.indexOf("--out") + 1]; writeFileSync(d + "/m_1.png", "a"); writeFileSync(d + "/m_2.png", "b"); }
if (code !== 0) console.error("selector drift");
if (code === 0 && a.includes("--upscale")) console.log(JSON.stringify(process.env.FAKE_UPSCALE_WARN ? { status: "ok", upscale_warning: process.env.FAKE_UPSCALE_WARN } : { status: "ok", upscaled: "1080p" }, null, 2));
process.exit(code);
`);
chmodSync(fake, 0o755);
writeFileSync(join(dir, "p.txt"), "a tabby cat mom, flat 2D\n");
writeFileSync(join(dir, "ref.png"), "ref");

function run(args, env = {}) {
  const log = join(dir, `log-${Math.random().toString(36).slice(2)}.jsonl`);
  const r = spawnSync(process.execPath, [GFLOW, ...args, "--project", dir], { encoding: "utf8", env: { ...process.env, GFLOW_BIN: fake, FAKE_LOG: log, ...env } });
  const all = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
  return { ...r, all, calls: all.filter((a) => a[0] !== "project") };
}
const ledgerRows = () => readFileSync(join(dir, "assets/gen/gflow-ledger.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

test("imageArgs picks t2i without refs and i2i with refs", () => {
  const base = { ref: [], out: "a/x.png" };
  assert.deepEqual(imageArgs(base, "p").slice(0, 3), ["image", "t2i", "p"]);
  const withRef = imageArgs({ ...base, ref: ["r.png"] }, "p");
  assert.equal(withRef[1], "i2i");
  assert.deepEqual(withRef.slice(withRef.indexOf("--ref"), withRef.indexOf("--ref") + 2), ["--ref", "r.png"]);
  assert.throws(() => imageArgs({ ...base, aspect: "2:1" }, "p"), /--aspect/);
  assert.throws(() => imageArgs({ ...base, count: "5" }, "p"), /--count/);
});

test("videoArgs allows 10 s only on omni-flash", () => {
  const o = { ref: [], start: "s.png", out: "v.mp4" };
  assert.throws(() => videoArgs({ ...o, duration: "10" }, "p"), /duration/);
  assert.ok(videoArgs({ ...o, model: "omni-flash", duration: "10" }, "p").includes("10"));
  assert.ok(videoArgs({ ...o, end: "e.png" }, "p").includes("--end-frame"));
});

test("--upscale reaches gflow and its outcome lands in the ledger", () => {
  assert.ok(!videoArgs({ ref: [], start: "s.png", out: "v.mp4" }, "p").includes("--upscale"));
  const out = join(dir, "assets/gen/clip.mp4");
  const args = ["video", "--start", join(dir, "ref.png"), "--prompt-file", join(dir, "p.txt"), "--out", out, "--spend", "--upscale"];
  const ok = run(args);
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(ok.calls[0].includes("--upscale"));
  assert.equal(ledgerRows().at(-1).upscaled, "1080p");
  const warned = run(args, { FAKE_UPSCALE_WARN: "upscale to 1080p failed; the 720p clip was kept" });
  assert.equal(warned.status, 0, warned.stderr);
  assert.match(warned.stderr, /720p clip was kept/);
  assert.match(ledgerRows().at(-1).upscale_warning, /720p clip was kept/);
});

test("image run writes the file and two ledger rows", () => {
  const out = join(dir, "assets/gen/mom.png");
  const r = run(["image", "--prompt-file", join(dir, "p.txt"), "--out", out, "--ref", join(dir, "ref.png")]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), out);
  assert.equal(r.calls.length, 1);
  const rows = ledgerRows().slice(-2);
  assert.deepEqual(rows.map((x) => x.status), ["sent", "ok"]);
  assert.ok(!JSON.stringify(rows).includes("tabby"), "prompt text stays out of the ledger");
});

test("count > 1 renames gflow's files to <out>-n", () => {
  const out = join(dir, "assets/gen/sheet.png");
  const r = run(["image", "--prompt-file", join(dir, "p.txt"), "--out", out, "--count", "2"]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(dir, "assets/gen/sheet-1.png")) && existsSync(join(dir, "assets/gen/sheet-2.png")));
});

test("video refuses without --spend and never calls gflow", () => {
  const r = run(["video", "--start", join(dir, "ref.png"), "--prompt-file", join(dir, "p.txt"), "--out", join(dir, "v.mp4")]);
  assert.equal(r.status, 2);
  assert.equal(r.calls.length, 0);
});

test("a failed run passes gflow's exit code through and is not retried", () => {
  const r = run(["video", "--start", join(dir, "ref.png"), "--prompt-file", join(dir, "p.txt"), "--out", join(dir, "v2.mp4"), "--spend"], { FAKE_EXIT: "23" });
  assert.equal(r.status, 23);
  assert.equal(r.calls.length, 1);
  assert.equal(ledgerRows().at(-1).status, "failed");
});

test("runs reuse the named Flow project instead of a scratch one", () => {
  const known = JSON.stringify([
    { project_id: "old", title: "kenh", created_at: "2026-01-01" },
    { project_id: "newer", title: "kenh", created_at: "2026-02-01" },
    { project_id: "other", title: "scratch", created_at: "2026-03-01" },
  ]);
  const r = run(["image", "--prompt-file", join(dir, "p.txt"), "--out", join(dir, "assets/gen/a.png"), "--flow-project", "kenh"], { FAKE_PROJECTS: known });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.all.some((a) => a[1] === "create"), "no project is created when the name exists");
  const g = r.calls[0];
  assert.equal(g[g.indexOf("--project") + 1], "newer");
  assert.equal(ledgerRows().at(-1).status, "ok");
});

test("a missing Flow project is created once, named after the local folder by default", () => {
  rmSync(join(dir, "assets/gen/gflow-projects.json"), { force: true });
  const r = run(["image", "--prompt-file", join(dir, "p.txt"), "--out", join(dir, "assets/gen/b.png")]);
  assert.equal(r.status, 0, r.stderr);
  const c = r.all.find((a) => a[1] === "create");
  assert.equal(c[c.indexOf("--name") + 1], basename(dir));
  const g = r.calls[0];
  assert.equal(g[g.indexOf("--project") + 1], "new-id");
  // the id is saved with the project folder, so the next run neither lists nor creates
  const again = run(["image", "--prompt-file", join(dir, "p.txt"), "--out", join(dir, "assets/gen/b2.png")]);
  assert.equal(again.status, 0, again.stderr);
  assert.ok(!again.all.some((a) => a[0] === "project"));
  assert.equal(again.calls[0][again.calls[0].indexOf("--project") + 1], "new-id");
});

test("invalid arguments fail before any Flow project is touched", () => {
  const r = run(["image", "--prompt-file", join(dir, "p.txt"), "--out", join(dir, "c.png"), "--aspect", "2:1"]);
  assert.equal(r.status, 2);
  assert.equal(r.all.length, 0);
});
