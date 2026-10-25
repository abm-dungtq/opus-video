// A project for beat-fit and cues tests: 3 shots of 3 s, one voice line each with hand-written
// words, a music bed with a hand-written beat grid (beat0 0.1, beatLen 0.5). Built on the manifest
// fixture, so index.html has TIMING markers.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { save, load } from "../../manifest.mjs";

const FIXTURE = fileURLToPath(new URL("./manifest", import.meta.url));
export const GRID = { bpm: 120, beat0: 0.1, beatLen: 0.5 };
// Words relative to the line start: line → [[text, start, end]].
export const WORDS = {
  "01": [["Xin", 0.2, 0.5], ["chào", 0.5, 1.3]],
  "02": [["Đây", 0.1, 0.4], ["là", 0.4, 0.6], ["mã", 0.9, 1.2], ["nguồn", 1.2, 1.6], ["mới", 1.7, 2.0]],
  "03": [["Hết", 0.2, 0.6]],
};

export function beatProject({ prefix = "beat-fit-" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cpSync(FIXTURE, dir, { recursive: true });
  const html = join(dir, "index.html");
  const tags = ['<audio id="vo-02" src="assets/voice/02.mp3" data-start="3.2" data-duration="2.2" data-volume="1"></audio>',
    '<audio id="vo-03" src="assets/voice/03.mp3" data-start="6.1" data-duration="1" data-volume="1"></audio>',
    '<audio id="bgm" src="assets/bgm/bgm.wav" data-start="0" data-volume="0.3"></audio>'];
  writeFileSync(html, readFileSync(html, "utf8").replace(/(<audio id="vo-01"[^\n]*\n)/, `$1      ${tags.join("\n      ")}\n`));
  mkdirSync(join(dir, "assets/bgm"), { recursive: true });
  const beats = Array.from({ length: 40 }, (_, n) => GRID.beat0 + n * GRID.beatLen);
  writeFileSync(join(dir, "assets/bgm/bgm.wav.beats.json"), JSON.stringify({ ...GRID, beats, maxDriftMs: 0, kick: [], drops: [] }));
  for (const [n, ws] of Object.entries(WORDS)) writeFileSync(join(dir, `assets/voice/${n}.mp3.words.json`), JSON.stringify(ws.map(([text, start, end]) => ({ text, start, end }))));
  const m = load(dir);
  m.shots = [
    { id: "s1", name: "Mở", start: 0, end: 3, transition_in: "", motion_note: "", assets: [] },
    { id: "s2", name: "Giữa", start: 3, end: 6, transition_in: "", motion_note: "", assets: [] },
    { id: "s3", name: "Kết", start: 6, end: 9, transition_in: "", motion_note: "", assets: [] },
  ];
  m.duration = 9;
  m.lines = [
    { id: "vo-01", shot: "s1", text: "Xin chào", file: "assets/voice/01.mp3", start: 0.3, duration: 1.4, gate: "pass" },
    { id: "vo-02", shot: "s2", text: "Đây là mã nguồn mới", file: "assets/voice/02.mp3", start: 3.2, duration: 2.2, gate: "pass" },
    { id: "vo-03", shot: "s3", text: "Hết", file: "assets/voice/03.mp3", start: 6.1, duration: 1, gate: "pass" },
  ];
  m.music = [{ id: "bgm", file: "assets/bgm/bgm.wav", start: 0, end: null, gain: 0.3 }];
  save(dir, m);
  return dir;
}

// Absolute word times of a line in a manifest.
export const wordsOf = (m, id) => {
  const l = m.lines.find((x) => x.id === id);
  return WORDS[l.file.match(/(\d+)\.mp3$/)[1]].map(([text, s, e]) => ({ text, start: l.start + s, end: l.start + e }));
};
