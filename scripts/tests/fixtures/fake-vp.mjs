// Shared test fixture: a minimal fake viet-pro install and a complete viet_pro record.
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Minimal fake viet-pro install: the real reference layout (names only) + a tiny lint with the
// same output contract as lint-vietnamese-content.mjs (ERROR/WARN lines, exit 1 on ERROR).
export function fakeVp() {
  const vp = mkdtempSync(join(tmpdir(), "vp-"));
  writeFileSync(join(vp, "SKILL.md"), "# viet-pro\n");
  for (const [d, files] of Object.entries({
    review: ["lead.md", "anti-ai.md", "humanizer-patterns.md", "natural.md", "punctuation.md"],
    editorial: ["lead.md", "hook-close.md", "rhythm.md", "story-core.md"],
    publishing: ["video-script.md", "facebook.md", "repurpose-matrix.md"],
  })) { mkdirSync(join(vp, "references", d), { recursive: true }); for (const f of files) writeFileSync(join(vp, "references", d, f), "x\n"); }
  mkdirSync(join(vp, "scripts"));
  // compare-preserved-content stand-in: always PASS (tests that need MISMATCH pass compareScript).
  writeFileSync(join(vp, "scripts", "compare-preserved-content.mjs"), 'console.log("PASS");\n');
  writeFileSync(join(vp, "scripts", "lint-vietnamese-content.mjs"), `
import { readFileSync } from "node:fs";
let err = false;
for (const f of process.argv.slice(2)) {
  let n = 0;
  readFileSync(f, "utf8").split("\\n").forEach((l, i) => {
    if (/\\S\\s+[.,!?;](?=\\s|$)/.test(l)) { console.log("ERROR " + f + ":" + (i + 1) + " [space-before-punct] x"); err = true; n++; }
    if (/,\\s+và\\s/.test(l)) { console.log("WARN " + f + ":" + (i + 1) + " [oxford-comma] x"); n++; }
  });
  if (!n) console.log("OK    " + f + " — 0 vi phạm");
}
process.exit(err ? 1 : 0);
`);
  return vp;
}

export const ALL_READ = "SKILL.md, review/lead.md, review/anti-ai.md, review/humanizer-patterns.md, review/natural.md, review/punctuation.md, editorial/lead.md, editorial/hook-close.md, editorial/rhythm.md, editorial/story-core.md, publishing/video-script.md";
export const RECORD = (extra = "", read = ALL_READ) => `## viet_pro\n- mode: Chuẩn\n- files_read: ${read}\n- humanizer: #4 dẫn dài "Trong thời đại" → mở bằng hành vi; không còn pattern 1–5\n- lint: 0 ERROR\n${extra}`;

