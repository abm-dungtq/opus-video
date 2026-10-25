import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reviewWarnings } from "../check-preflight.mjs";

function project(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ov-review-"));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}
const DIRECTION = { "build/DIRECTION.md": "# Hướng dựng: thử\n" };

test("no build/DIRECTION.md: nothing is checked", () => {
  const dir = project({ "build/REVIEW-1.md": "Review 1: revise\n" });
  try { assert.deepEqual(reviewWarnings(dir), []); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a direction without any review warns", () => {
  const dir = project(DIRECTION);
  try {
    assert.deepEqual(reviewWarnings(dir), ["đạo diễn chưa kết luận ship (build/REVIEW-<n>.md)"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the highest review (by number, not by name) still says revise: warns with its file", () => {
  const dir = project({ ...DIRECTION, "build/REVIEW-2.md": "Review 2: ship\n", "build/REVIEW-10.md": "\nReview 10: revise\nGiữ: nhịp\n" });
  try {
    assert.deepEqual(reviewWarnings(dir), ["đạo diễn chưa kết luận ship (build/REVIEW-10.md)"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the last review says ship: no warning", () => {
  const dir = project({ ...DIRECTION, "build/REVIEW-1.md": "Review 1: revise\n", "build/REVIEW-2.md": "Review 2: ship\nGiữ: tất cả\n" });
  try { assert.deepEqual(reviewWarnings(dir), []); } finally { rmSync(dir, { recursive: true, force: true }); }
});
