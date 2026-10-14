import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { findBrand, validateBrand, brandAbs, main } from "../brand.mjs";

const EXAMPLE = fileURLToPath(new URL("../../references/brand.example.json", import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), "brand-"));
const ok = { name: "X", palette: { bg: "#000000", fg: "#ffffff", accent: "#ff0000" } };
const quiet = () => {};

test("findBrand: <project>/brand.json, then ../shared-assets/brand.json, else null", () => {
  const root = tmp();
  try {
    const p1 = join(root, "p1");
    mkdirSync(p1);
    assert.equal(findBrand(p1), null);
    assert.equal(main(["check", "--project", p1], quiet, quiet), 0);
    mkdirSync(join(root, "shared-assets"));
    writeFileSync(join(root, "shared-assets", "brand.json"), JSON.stringify(ok));
    assert.equal(findBrand(p1).path, join(root, "shared-assets", "brand.json"));
    writeFileSync(join(p1, "brand.json"), JSON.stringify({ ...ok, name: "local" }));
    const f = findBrand(p1);
    assert.equal(f.path, join(p1, "brand.json"));
    assert.equal(f.brand.name, "local");
    assert.equal(main(["check", "--project", p1], quiet, quiet), 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("validateBrand: bad colour and unknown banned direction are ERRORs", () => {
  assert.ok(validateBrand({ ...ok, palette: { ...ok.palette, bg: "red" } }, "/tmp").errors.some((e) => e.includes("palette.bg")));
  assert.ok(validateBrand({ ...ok, banned_directions: ["A9"] }, "/tmp").errors.some((e) => e.includes("A9")));
  assert.deepEqual(validateBrand({ ...ok, banned_directions: ["A1"] }, "/tmp").errors, []);
});

test("validateBrand: the shipped example has no ERROR (missing files only WARN)", () => {
  const r = validateBrand(JSON.parse(readFileSync(EXAMPLE, "utf8")), "/nonexistent-brand-dir");
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => w.startsWith("logo:")));
});

test("brand check: broken JSON exits 2; ERROR exits 1; brandAbs resolves from the brand dir", () => {
  const d = tmp();
  try {
    writeFileSync(join(d, "brand.json"), "{ nope");
    assert.equal(main(["check", "--project", d], quiet, quiet), 2);
    writeFileSync(join(d, "brand.json"), JSON.stringify({ ...ok, palette: { bg: "red" } }));
    assert.equal(main(["check", "--project", d], quiet, quiet), 1);
    const f = { dir: d, brand: { logo: "logos/a.svg", fonts: { heading: "" } } };
    assert.equal(brandAbs(f, "logo"), join(d, "logos", "a.svg"));
    assert.equal(brandAbs(f, "fonts.heading"), "");
    assert.equal(brandAbs(f, "watermark"), "");
  } finally { rmSync(d, { recursive: true, force: true }); }
});
