// set_workflow_mode writes project.json workflow_mode through the gateway; OPS names every op
// applyOps accepts, so Studio can check an op before sending it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyOps, patch, OPS, WORKFLOW_MODES, EXIT } from "../gateway.mjs";
import { load, validate } from "../manifest.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/manifest", import.meta.url));
const withProject = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), "gateway-mode-"));
  cpSync(FIXTURE, dir, { recursive: true });
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};

test("set_workflow_mode writes the mode and a receipt", () => {
  const m = load(FIXTURE);
  const { next, receipt } = applyOps(m, [{ op: "set_workflow_mode", mode: "nhanh" }]);
  assert.equal(next.workflow_mode, "nhanh");
  assert.match(receipt.join("; "), /chế độ vận hành: chưa đặt → nhanh/);
  assert.equal(m.workflow_mode, undefined, "applyOps is pure");
  const again = applyOps(next, [{ op: "set_workflow_mode", mode: "timeline" }]);
  assert.match(again.receipt.join("; "), /nhanh → timeline/);
});

test("an unknown mode is refused", () => {
  const m = load(FIXTURE);
  for (const mode of ["khac", "", undefined, 1]) {
    assert.throws(() => applyOps(m, [{ op: "set_workflow_mode", mode }]), (e) => e.constructor.name === "OpError" && /workflow_mode phải là một trong/.test(e.message), String(mode));
  }
});

test("patch by the human actor bumps the version", () => withProject((dir) => {
  const base = load(dir).version;
  const r = patch(dir, { actor: "human", base, ops: [{ op: "set_workflow_mode", mode: "dao-dien" }] });
  assert.equal(r.code, EXIT.ok, r.error);
  assert.equal(r.version, base + 1);
  const m = load(dir);
  assert.equal(m.version, base + 1);
  assert.equal(m.workflow_mode, "dao-dien");
  const bad = patch(dir, { actor: "human", base: base + 1, ops: [{ op: "set_workflow_mode", mode: "khac" }] });
  assert.equal(bad.code, EXIT.invalid);
  assert.equal(load(dir).version, base + 1);
}));

test("a manifest without workflow_mode still validates, a wrong one does not", () => {
  const m = load(FIXTURE);
  assert.equal(m.workflow_mode, undefined);
  assert.deepEqual(validate(m), []);
  for (const mode of WORKFLOW_MODES) assert.deepEqual(validate({ ...m, workflow_mode: mode }), [], mode);
  assert.deepEqual(validate({ ...m, workflow_mode: "tu-dau" }), [`workflow_mode phải là một trong ${WORKFLOW_MODES.join(", ")}`]);
});

test("OPS lists every op applyOps accepts", () => {
  const m = load(FIXTURE);
  assert.ok(Object.isFrozen(OPS));
  assert.equal(new Set(OPS).size, OPS.length);
  assert.equal(OPS.at(-1), "set_workflow_mode");
  for (const name of OPS.filter((n) => n !== "set_workflow_mode")) {
    let message = "";
    try { applyOps(m, [{ op: name }]); } catch (e) { message = e.message; }
    assert.doesNotMatch(message, /op không hợp lệ/, name);
  }
  assert.throws(() => applyOps(m, [{ op: "not_an_op" }]), /op không hợp lệ/);
});

test("OPS is exported to Studio", async () => {
  const api = await import("../studio-api.mjs");
  assert.ok(api.OPS.includes("set_workflow_mode"));
  assert.equal(api.OPS, OPS);
  assert.equal(api.STUDIO_API, 4);
});
