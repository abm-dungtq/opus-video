import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fakeApi } from "./fixtures/fake-api.mjs";

const ELEVEN = fileURLToPath(new URL("../eleven.mjs", import.meta.url));
const section = (name) => ({ section_name: name, positive_local_styles: ["drums"], negative_local_styles: [], duration_ms: 5000, lines: [] });
const PLAN = { positive_global_styles: ["instrumental"], negative_global_styles: ["vocals"], sections: [section("Intro"), section("Drop")] };

// The fake server runs in this process, so the CLI must run asynchronously (spawnSync would block it).
function run(args, base, cwd) {
  return new Promise((ok) => {
    const child = spawn(process.execPath, [ELEVEN, ...args], {
      cwd,
      env: { ...process.env, HOME: cwd, ELEVENLABS_API_BASE: base, ELEVENLABS_API_KEY: "test" },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (status) => ok({ status, out }));
  });
}
function project(plan = PLAN) {
  const dir = mkdtempSync(join(tmpdir(), "ov-music-"));
  writeFileSync(join(dir, "plan.json"), JSON.stringify(plan));
  return dir;
}

test("music --plan sends the composition plan, not a prompt", async () => {
  const api = await fakeApi({ "POST /v1/music": () => ({ status: 200, body: Buffer.from("ID3fake") }) });
  const dir = project();
  try {
    const r = await run(["music", "--plan", join(dir, "plan.json"), "--out", join(dir, "m.mp3"), "--no-normalize"], api.base, dir);
    assert.equal(r.status, 0, r.out);
    assert.ok(existsSync(join(dir, "m.mp3")));
    const body = JSON.parse(api.calls[0].body.toString());
    assert.equal(body.composition_plan.sections.length, 2);
    assert.equal("prompt" in body, false);
    assert.equal("music_length_ms" in body, false);
  } finally {
    await api.close();
  }
});

test("music --outro writes assets/bgm/outro.mp3 by default", async () => {
  const api = await fakeApi({ "POST /v1/music": () => ({ status: 200, body: Buffer.from("ID3fake") }) });
  const dir = project();
  try {
    const r = await run(["music", "--plan", "plan.json", "--outro", "--no-normalize"], api.base, dir);
    assert.equal(r.status, 0, r.out);
    assert.ok(existsSync(join(dir, "assets/bgm/outro.mp3")));
  } finally {
    await api.close();
  }
});

test("music --plan on a plan without music access prints MUSIC_UNAVAILABLE, exit 3", async () => {
  const api = await fakeApi({ "POST /v1/music": () => ({ status: 402, body: "payment required" }) });
  const dir = project();
  try {
    const r = await run(["music", "--plan", "plan.json", "--out", "m.mp3", "--no-normalize"], api.base, dir);
    assert.equal(r.status, 3, r.out);
    assert.match(r.out, /MUSIC_UNAVAILABLE/);
  } finally {
    await api.close();
  }
});

test("music --plan without sections exits 2 before any request", async () => {
  const api = await fakeApi({});
  const dir = project({ positive_global_styles: [], negative_global_styles: [] });
  try {
    const r = await run(["music", "--plan", "plan.json", "--out", "m.mp3"], api.base, dir);
    assert.equal(r.status, 2, r.out);
    assert.match(r.out, /sections/);
    assert.equal(api.calls.length, 0);
  } finally {
    await api.close();
  }
});

test("music with both --plan and --prompt exits 2", async () => {
  const api = await fakeApi({});
  const dir = project();
  try {
    const r = await run(["music", "--plan", "plan.json", "--prompt", "x", "--out", "m.mp3"], api.base, dir);
    assert.equal(r.status, 2, r.out);
    assert.equal(api.calls.length, 0);
  } finally {
    await api.close();
  }
});
