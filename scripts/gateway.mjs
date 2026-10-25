#!/usr/bin/env node
// gateway.mjs — the one writer of project.json. Every change (Studio drag, the director over MCP,
// timing.mjs, an undo) is a list of ops applied here as one new version, with a Vietnamese receipt,
// a full snapshot in .opus/versions/v<N>.json and a line in .opus/history.jsonl. After each change
// of an editable project it re-derives what the renderer reads: the TIMING block and the voice
// <audio>/<video> data-start/data-duration of index.html, each music bed's data-start,
// data-duration, data-volume, data-media-start and fades, the SFX <audio> data-start (shot.start +
// offset) and data-volume of each manifest event (and the <audio data-studio-sfx> tags of events
// added here), the root data-duration, the Thời điểm cells of PLAN.md "## Cảnh" and
// "## Sự kiện", and timing.json. Never hand-edit those seconds.
//   node gateway.mjs patch  --project <dir> --actor <human|director|timing> --base <n> (--ops '<json>' | --ops-file <f>)
//   node gateway.mjs undo   --project <dir> --base <n>
//   node gateway.mjs redo   --project <dir> --base <n>
//   node gateway.mjs log    --project <dir> [--json]
//   node gateway.mjs show   --project <dir> [--version <n>]
//   node gateway.mjs derive --project <dir> [--dry]
//   node gateway.mjs --help | -h
// Ops (JSON array):
//   { "op": "resize_shot", "id": "s2", "duration": 5.5 }   end moves; later shots, their lines and events ripple
//   { "op": "move_line", "id": "vo-02", "start": 3.1 }       the line joins the shot holding its new start;
//                                                            events stay, its "chữ:" rows in PLAN.md follow it
//   { "op": "set_shot", "id": "s2", "field": "name|transition_in|motion_note|assets", "value": … }
//   { "op": "set_line_text", "id": "vo-02", "text": "…" }    gate becomes "stale" (viet-pro again)
//   { "op": "set_line_speaker", "id": "vo-02", "speaker": "ba-noi" }   gate becomes "stale" (voice again);
//                                                            key NN of scenes/roles.json follows, when the file exists
//   { "op": "set_line_audio", "id": "vo-02", "file": "assets/mix/voice-02.mp3", "duration": 2.4 }
//                                                            a new voice take: the file must exist in the project; the
//                                                            gate is read again from its stamp (line-gate.mjs); start
//                                                            stays, a take running past its shot is a CẢNH BÁO only
//   { "op": "set_music", "id": "bgm", "field": "gain|start|end", "value": 0.3 }
//   { "op": "update_music", "id": "bgm", "start"?: 1, "end"?: 9 | null, "media_start"?: 0.5,
//     "gain"?: 0.6, "fade_in"?: 1, "fade_out"?: 2 }          several fields of a bed at once; end null = to the end
//   { "op": "move_event", "id": "sfx-1", "start": 3.5, "keep_anchor"?: true, "anchor"?: {…} }
//                                                            the event joins the shot holding its new start; a hand
//                                                            move drops its anchor, keep_anchor keeps it (and takes
//                                                            "anchor" when given: cues.mjs re-placing it)
//   { "op": "add_event", "start": 6, "sound": "assets/sfx/a.mp3", "label"?: "…", "volume"?: 0.8, "id"?: "sfx-1",
//     "anchor"?: { "word": "…", "nth"?: 1, "shot": "s2" } | { "beat": 40 } | { "abs": 6 } }
//                                                            a studio event: derive inserts its <audio data-studio-sfx>;
//                                                            an id already on another <audio> is INVALID; the anchor
//                                                            (manifest.mjs rules) is what cues.mjs places it by
//   { "op": "pin_beat", "target": "shot" | "line", "id": "s3", "beat": 40 | null }
//                                                            a shot's cut_beat or a line's at_beat (null removes it;
//                                                            never on the first shot); moves nothing, beat-fit.mjs does
//   { "op": "remove_event", "id": "sfx-1" }                  studio events only; derive removes its data-studio-sfx tag
//   { "op": "add_shot", "after": "s2" | null, "name": "…", "duration": 3 }   later shots ripple; the new shot joins
//                                                            the scene of the shot before it (of the next one at the head)
//   { "op": "remove_shot", "id": "s4" }                      refused while a line belongs to it; its events are dropped,
//                                                            it leaves its scene (a scene left empty goes too)
//   { "op": "set_scenes", "scenes": [{ "id": "c1", "label": "…", "shots": ["s1", "s2"] }] }   the scene groups
//                                                            (manifest.mjs rules); [] removes them
// capabilities.picture_from_code (the picture is built by code from TIMING, buildFilm): resize_shot,
// add_shot and remove_shot are INVALID there, since its shot windows follow the voice; move_line works.
// --base is the version the caller last saw; another version is a CONFLICT and nothing is written.
// Writers are serialized by .opus/lock (a lock older than 30 s is stale and removed); a writer
// that cannot get it within 5 s exits 8 BUSY and may retry. The derived files are written before
// project.json, so a new version number means its HTML, PLAN.md and timing.json are in place.
// undo reverts the newest change not yet undone by restoring the snapshot before it, as a new
// version (actor "undo"), so history only grows. It never reaches past the latest import. The
// "## Sự kiện" rows a change dropped are kept in its history line and put back by its undo.
// redo re-applies the change the newest undo reverted, as a new version (actor "redo"); it works
// only while the last changes are undos and redos: any other change clears what can be redone.
// A project whose index.html has no TIMING:BEGIN/END (capabilities.editable false, every project
// imported from before the skeleton) is view only: patch, undo, redo and derive exit 4.
// Exit: 0 ok · 1 cannot read or write · 2 bad usage · 3 CONFLICT · 4 view-only project ·
// 5 INVALID (unknown op or id, or the result breaks project.json rules) · 7 nothing to undo ·
// 8 BUSY (another writer holds the lock) · 9 nothing to redo.
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";
import { load, save, validate, validateScenes, r3, SPEAKER, WORKFLOW_MODES } from "./manifest.mjs";
import { gateOf, lineNumber, writeRoles } from "./line-gate.mjs";
import { buildTiming, injectTiming, manifestScenes } from "./timing.mjs";
import { EVENTS_SECTION, SECTIONS, fold, parseTable, sceneId } from "./check-preflight.mjs";
import { eventTime } from "./sfx-sync.mjs";

export const EXIT = { ok: 0, io: 1, usage: 2, conflict: 3, viewOnly: 4, invalid: 5, nothingToUndo: 7, busy: 8, nothingToRedo: 9 };
export const ACTORS = ["human", "director", "timing", "import", "undo", "redo"];
export { WORKFLOW_MODES };
// OPS names every op applyOps accepts; Studio checks it before sending one.
export const OPS = Object.freeze(["resize_shot", "move_line", "set_shot", "set_line_text", "set_line_speaker", "set_line_audio",
  "set_music", "update_music", "move_event", "add_event", "remove_event", "add_shot", "remove_shot", "set_scenes", "pin_beat", "set_workflow_mode"]);
const VIEW_ONLY = "dự án chỉ xem: index.html không có TIMING:BEGIN/END";
const PICTURE_FROM_CODE = "hình dựng bằng mã (buildFilm): mốc shot đi theo lời; sửa lời hoặc scenes/*.mjs, không kéo mép";
const SHOT_EDITS = new Set(["resize_shot", "add_shot", "remove_shot"]);
const LOCK_STALE_MS = 30_000;
const LOCK_WAIT_MS = 5_000;
const SHOT_FIELDS = ["name", "transition_in", "motion_note", "assets"];
const MUSIC_FIELDS = ["gain", "start", "end"];
const MUSIC_UPDATE_FIELDS = ["start", "end", "media_start", "gain", "fade_in", "fade_out"];
const EVENT_VOLUME = 0.8;
const EPS = 1e-3;

class OpError extends Error {}
const fmt = (n) => `${r3(n).toFixed(1)}s`;
const opusDir = (dir) => join(resolve(dir), ".opus");
const snapPath = (dir, v) => join(opusDir(dir), "versions", `v${v}.json`);
const historyPath = (dir) => join(opusDir(dir), "history.jsonl");

// Pure: manifest + ops → { next, receipt: [text] }. Throws OpError on an unknown op, id or field.
// html (optional): the index.html text, so add_event's default id skips <audio> ids already there.
// root (optional): the project folder; set_line_audio needs it to find the file and its stamp.
export function applyOps(m, ops, { html = null, root = null } = {}) {
  if (!Array.isArray(ops) || !ops.length) throw new OpError("ops phải là mảng không rỗng");
  const next = structuredClone(m);
  const receipt = [];
  const shotAt = (id) => {
    const i = next.shots.findIndex((s) => s.id === id);
    if (i < 0) throw new OpError(`không có shot ${id}`);
    return i;
  };
  const lineOf = (id) => next.lines.find((l) => l.id === id) ?? (() => { throw new OpError(`không có câu thoại ${id}`); })();
  const eventOf = (id) => (next.events ?? []).find((e) => e.id === id) ?? (() => { throw new OpError(`không có sự kiện ${id}`); })();
  // The shot holding second t (half-open windows; the very end of the video belongs to the last shot).
  const holderAt = (t) => next.shots.find((s, i) => t >= s.start && (t < s.end || (i === next.shots.length - 1 && t <= s.end + EPS)))
    ?? (() => { throw new OpError(`${r3(t)}s nằm ngoài video (${r3(next.duration)}s)`); })();
  const timeOf = (what, v) => {
    const t = Number(v);
    if (v == null || v === "" || !Number.isFinite(t) || t < 0) throw new OpError(`${what}: start phải ≥ 0`);
    return t;
  };
  // Shift every shot from index i on, and the lines that belong to them, by delta seconds. Events
  // are stored as an offset inside their shot, so they move with it.
  const ripple = (i, delta) => {
    if (Math.abs(delta) < EPS) return;
    const moved = new Set(next.shots.slice(i).map((s) => s.id));
    for (const s of next.shots.slice(i)) { s.start = r3(s.start + delta); s.end = r3(s.end + delta); }
    for (const l of next.lines) if (moved.has(l.shot)) l.start = r3(l.start + delta);
    const ids = [...moved];
    if (ids.length) receipt.push(`dời ${ids.length > 1 ? `${ids[0]}–${ids.at(-1)}` : ids[0]} ${delta > 0 ? "+" : ""}${r3(delta)}s`);
  };
  const retime = (oldDuration) => {
    next.duration = r3(next.shots.at(-1).end);
    // A music bed that ran to the old end keeps running to the new end.
    for (const b of next.music) if (b.end != null && Math.abs(b.end - oldDuration) < EPS && Math.abs(next.duration - oldDuration) >= EPS) {
      b.end = next.duration;
      receipt.push(`${b.id}: kết thúc theo video ${fmt(next.duration)}`);
    }
  };

  for (const op of ops) {
    const before = next.duration;
    if (SHOT_EDITS.has(op?.op) && next.capabilities?.picture_from_code === true) throw new OpError(PICTURE_FROM_CODE);
    switch (op?.op) {
      case "resize_shot": {
        const i = shotAt(op.id);
        const d = Number(op.duration);
        if (!(d > 0)) throw new OpError(`${op.id}: duration phải là số dương`);
        const s = next.shots[i];
        const newEnd = r3(s.start + d);
        const delta = newEnd - s.end;
        receipt.push(`${s.id}: ${fmt(s.end - s.start)} → ${fmt(d)}`);
        s.end = newEnd;
        for (const l of next.lines) if (l.shot === s.id && l.start >= newEnd - EPS) receipt.push(`CẢNH BÁO ${l.id}: bắt đầu ${fmt(l.start)}, sau khi ${s.id} kết thúc ${fmt(newEnd)}`);
        for (const e of next.events ?? []) if (e.shot === s.id && s.start + e.offset >= newEnd - EPS) receipt.push(`CẢNH BÁO sự kiện ${e.id}: ${fmt(s.start + e.offset)}, sau khi ${s.id} kết thúc ${fmt(newEnd)}`);
        ripple(i + 1, delta);
        retime(before);
        break;
      }
      case "move_line": {
        const l = lineOf(op.id);
        const t = Number(op.start);
        if (!Number.isFinite(t) || t < 0) throw new OpError(`${op.id}: start phải ≥ 0`);
        const holder = next.shots.find((s, i) => t >= s.start && (t < s.end || i === next.shots.length - 1));
        if (!holder) throw new OpError(`${op.id}: ${fmt(t)} nằm ngoài video`);
        receipt.push(`${l.id}: ${fmt(l.start)} → ${fmt(t)}${holder.id !== l.shot ? ` (sang ${holder.id})` : ""}`);
        l.start = r3(t);
        l.shot = holder.id;
        break;
      }
      case "set_shot": {
        if (!SHOT_FIELDS.includes(op.field)) throw new OpError(`set_shot: field phải là ${SHOT_FIELDS.join(" | ")}`);
        const s = next.shots[shotAt(op.id)];
        s[op.field] = op.value;
        receipt.push(`${s.id}: đổi ${op.field}`);
        break;
      }
      case "set_line_text": {
        const l = lineOf(op.id);
        if (typeof op.text !== "string") throw new OpError(`${op.id}: text phải là chuỗi`);
        l.text = op.text;
        l.gate = "stale";
        receipt.push(`${l.id}: sửa lời, cần duyệt viet-pro và lồng tiếng lại`);
        break;
      }
      case "set_line_speaker": {
        const l = lineOf(op.id);
        if (typeof op.speaker !== "string" || !SPEAKER.test(op.speaker)) throw new OpError(`${op.id}: speaker phải là id vai (chữ thường, số, gạch nối)`);
        receipt.push(`${l.id}: đổi người nói ${l.speaker ?? "chưa có"} → ${op.speaker}, cần lồng tiếng lại`);
        l.speaker = op.speaker;
        l.gate = "stale";
        break;
      }
      case "set_line_audio": {
        const l = lineOf(op.id);
        if (!root) throw new OpError("set_line_audio: cần thư mục dự án");
        const file = typeof op.file === "string" ? op.file : "";
        if (!file || file.startsWith("/") || /^[A-Za-z]:[\\/]/.test(file) || file.split(/[\\/]/).includes("..")) throw new OpError(`${op.id}: file phải là đường dẫn tương đối trong dự án`);
        if (!fileInside(root, file)) throw new OpError(`${op.id}: không có file ${file} trong dự án`);
        const d = Number(op.duration);
        if (!Number.isFinite(d) || d <= 0) throw new OpError(`${op.id}: duration phải là số dương`);
        l.file = file;
        l.duration = r3(d);
        l.gate = gateOf(root, l);
        receipt.push(`${l.id}: giọng mới ${file} ${fmt(d)}, cổng ${l.gate}`);
        const s = next.shots.find((x) => x.id === l.shot);
        if (s && l.start + l.duration > s.end + EPS) receipt.push(`CẢNH BÁO ${l.id}: kết thúc ${fmt(l.start + l.duration)}, sau khi ${s.id} kết thúc ${fmt(s.end)}`);
        break;
      }
      case "set_music": {
        if (!MUSIC_FIELDS.includes(op.field)) throw new OpError(`set_music: field phải là ${MUSIC_FIELDS.join(" | ")}`);
        const b = next.music.find((x) => x.id === op.id);
        if (!b) throw new OpError(`không có nhạc ${op.id}`);
        b[op.field] = typeof op.value === "number" ? r3(op.value) : op.value;
        receipt.push(`${b.id}: ${op.field} = ${b[op.field]}`);
        break;
      }
      case "update_music": {
        const b = next.music.find((x) => x.id === op.id);
        if (!b) throw new OpError(`không có nhạc ${op.id}`);
        const keys = Object.keys(op).filter((k) => k !== "op" && k !== "id");
        if (!keys.length) throw new OpError("update_music: cần ít nhất một trường");
        if (keys.some((k) => !MUSIC_UPDATE_FIELDS.includes(k))) throw new OpError(`update_music: trường phải là ${MUSIC_UPDATE_FIELDS.join(" | ")}`);
        for (const k of keys) b[k] = typeof op[k] === "number" ? r3(op[k]) : op[k];
        receipt.push(`${b.id}: ${keys.map((k) => `${k} = ${b[k]}`).join(", ")}`);
        break;
      }
      case "move_event": {
        const e = eventOf(op.id);
        const t = timeOf(op.id, op.start);
        const holder = holderAt(t);
        const from = next.shots.find((s) => s.id === e.shot);
        const dropAnchor = e.anchor != null && op.keep_anchor !== true;
        receipt.push(`${e.id}: ${fmt((from?.start ?? 0) + e.offset)} → ${fmt(t)}${holder.id !== e.shot ? ` (sang ${holder.id})` : ""}${dropAnchor ? " (bỏ anchor)" : ""}`);
        if (dropAnchor) delete e.anchor;
        else if (op.keep_anchor === true && op.anchor != null) e.anchor = op.anchor;
        e.shot = holder.id;
        e.offset = r3(t - holder.start);
        break;
      }
      case "add_event": {
        const t = timeOf("add_event", op.start);
        if (typeof op.sound !== "string" || !op.sound) throw new OpError("add_event: cần sound (đường dẫn tương đối trong dự án)");
        if (op.id != null && (typeof op.id !== "string" || !op.id)) throw new OpError("add_event: id phải là chuỗi");
        if (op.label != null && typeof op.label !== "string") throw new OpError("add_event: label phải là chuỗi");
        const holder = holderAt(t);
        const used = new Set([...(next.events ?? []), ...next.lines].map((x) => x.id));
        if (html != null) for (const x of liveMatches(html, /<audio\b[^>]*\sid\s*=\s*["']([^"']*)["']/gi)) used.add(x[1]);
        let id = op.id;
        if (id == null) { let n = 1; while (used.has(`sfx-${n}`)) n++; id = `sfx-${n}`; }
        const label = op.label ?? op.sound.split(/[\\/]/).pop().replace(/\.[^.]*$/, "");
        next.events ??= [];
        next.events.push({ id, shot: holder.id, offset: r3(t - holder.start), sound: op.sound, label, volume: op.volume ?? EVENT_VOLUME, studio: true, ...(op.anchor != null ? { anchor: op.anchor } : {}) });
        receipt.push(`thêm ${id} lúc ${fmt(t)}`);
        break;
      }
      case "remove_event": {
        const e = eventOf(op.id);
        if (e.studio !== true) throw new OpError(`chỉ xoá được SFX thêm từ Studio; ${e.id} do đạo diễn đặt, hãy nhờ đạo diễn`);
        next.events = next.events.filter((x) => x !== e);
        receipt.push(`xoá ${e.id}`);
        break;
      }
      case "add_shot": {
        const d = Number(op.duration);
        if (!(d > 0)) throw new OpError("add_shot: duration phải là số dương");
        const i = op.after == null ? 0 : shotAt(op.after) + 1;
        const start = i === 0 ? 0 : next.shots[i - 1].end;
        const id = `s${Math.max(0, ...next.shots.map((s) => Number(s.id.match(/\d+/)?.[0] ?? 0))) + 1}`;
        ripple(i, d);
        next.shots.splice(i, 0, { id, name: String(op.name ?? ""), start: r3(start), end: r3(start + d), transition_in: "", motion_note: "", assets: [] });
        receipt.push(`thêm ${id} ${fmt(d)}${op.after ? ` sau ${op.after}` : " ở đầu"}`);
        // The new shot joins the scene of the shot before it, or of the next one at the head.
        const near = i === 0 ? next.shots[1]?.id : next.shots[i - 1].id;
        const scene = (next.scenes ?? []).find((c) => c.shots.includes(near));
        if (scene) { scene.shots.splice(scene.shots.indexOf(near) + (i === 0 ? 0 : 1), 0, id); receipt.push(`${id} vào cảnh ${scene.id}`); }
        retime(before);
        break;
      }
      case "remove_shot": {
        const i = shotAt(op.id);
        const s = next.shots[i];
        const held = next.lines.filter((l) => l.shot === s.id).map((l) => l.id);
        if (held.length) throw new OpError(`${s.id} còn câu thoại ${held.join(", ")}: dời hoặc xoá câu trước`);
        if (next.shots.length === 1) throw new OpError("không xoá được shot cuối cùng");
        next.shots.splice(i, 1);
        receipt.push(`xoá ${s.id}`);
        if (next.scenes) {
          for (const c of next.scenes) c.shots = c.shots.filter((id) => id !== s.id);
          for (const c of next.scenes.filter((c) => !c.shots.length)) receipt.push(`bỏ cảnh ${c.id} vì không còn shot`);
          next.scenes = next.scenes.filter((c) => c.shots.length);
          if (!next.scenes.length) delete next.scenes;
        }
        if (next.events) {
          for (const e of next.events.filter((e) => e.shot === s.id)) receipt.push(`CẢNH BÁO bỏ sự kiện ${e.id}: ${s.id} đã xoá, thẻ <audio id="${e.id}"> vẫn ở HTML với data-start cũ, xoá thẻ hoặc gắn lại`);
          next.events = next.events.filter((e) => e.shot !== s.id);
        }
        ripple(i, -(s.end - s.start));
        retime(before);
        break;
      }
      case "set_scenes": {
        const scenes = op.scenes;
        const errs = validateScenes(scenes, next.shots);
        if (errs.length) throw new OpError(`set_scenes: ${errs.join("; ")}`);
        if (scenes.length) next.scenes = scenes.map((c) => ({ id: c.id, label: c.label, shots: [...c.shots] }));
        else delete next.scenes;
        receipt.push(`đổi nhóm cảnh: ${scenes.length} cảnh`);
        break;
      }
      case "pin_beat": {
        if (op.beat !== null && !(Number.isInteger(op.beat) && op.beat >= 0)) throw new OpError("pin_beat: beat phải là số nguyên ≥ 0 hoặc null");
        let x, key;
        if (op.target === "shot") {
          const i = shotAt(op.id);
          if (i === 0 && op.beat !== null) throw new OpError(`pin_beat: ${op.id} là shot đầu, luôn bắt đầu ở 0s`);
          x = next.shots[i]; key = "cut_beat";
        } else if (op.target === "line") { x = lineOf(op.id); key = "at_beat"; }
        else throw new OpError('pin_beat: target phải là "shot" hoặc "line"');
        if (op.beat === null) delete x[key];
        else x[key] = op.beat;
        receipt.push(op.beat === null ? `${op.id}: bỏ ghim beat` : `${op.id}: ghim beat ${op.beat}`);
        break;
      }
      case "set_workflow_mode": {
        if (!WORKFLOW_MODES.includes(op.mode)) throw new OpError(`workflow_mode phải là một trong ${WORKFLOW_MODES.join(", ")}`);
        receipt.push(`chế độ vận hành: ${next.workflow_mode ?? "chưa đặt"} → ${op.mode}`);
        next.workflow_mode = op.mode;
        break;
      }
      default:
        throw new OpError(`op không hợp lệ: ${JSON.stringify(op?.op)}`);
    }
  }
  return { next, receipt };
}

// Blocks until .opus/lock is ours; returns a release function, or null after waitMs. A server
// (Motion Studio) passes a short waitMs so one contended write does not stall its event loop.
export function takeLock(dir, waitMs = LOCK_WAIT_MS) {
  mkdirSync(opusDir(dir), { recursive: true });
  const f = join(opusDir(dir), "lock");
  const until = Date.now() + waitMs;
  const nap = new Int32Array(new SharedArrayBuffer(4));
  for (;;) {
    try {
      const token = `${process.pid}:${Date.now()}:${Math.random()}`;
      writeFileSync(f, token, { flag: "wx" });
      // Remove only our own lock: a waiter may have swept it as stale and taken a new one.
      return () => { try { if (readFileSync(f, "utf8") === token) rmSync(f, { force: true }); } catch { /* already gone */ } };
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      try { if (Date.now() - statSync(f).mtimeMs > LOCK_STALE_MS) { rmSync(f, { force: true }); continue; } } catch { continue; }
      if (Date.now() > until) return null;
      Atomics.wait(nap, 0, 0, 25);
    }
  }
}

const writeJson = (f, v) => {
  const tmp = `${f}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(v, null, 2) + "\n");
  renameSync(tmp, f);
};

// Writes a manifest as version m.version: project.json, its snapshot and a history line.
// Used by commit() and by manifest-import.mjs for version 1.
export function record(dir, m, entry) {
  mkdirSync(join(opusDir(dir), "versions"), { recursive: true });
  writeJson(snapPath(dir, m.version), m);
  save(dir, m);
  appendFileSync(historyPath(dir), JSON.stringify({ v: m.version, at: m.updated, ...entry }) + "\n");
}

export function readHistory(dir) {
  const f = historyPath(dir);
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

// Shared tail of patch() and undo(): lock, base check, validate, write, derive.
function commit(dir, { base, actor, build, lockWaitMs }) {
  const release = takeLock(dir, lockWaitMs);
  if (!release) return { code: EXIT.busy, error: "BUSY: project.json đang được ghi bởi tiến trình khác, thử lại sau" };
  try {
    const m = load(dir);
    if (!m) return { code: EXIT.usage, error: `không có project.json trong ${dir}` };
    if (!m.capabilities?.editable) return { code: EXIT.viewOnly, error: VIEW_ONLY };
    if (Number(base) !== m.version) return { code: EXIT.conflict, error: `CONFLICT: base ${base}, hiện tại v${m.version}` };
    let r;
    try { r = build(m); } catch (e) {
      if (e instanceof OpError) return { code: EXIT.invalid, error: `INVALID: ${e.message}` };
      if (e.code === "NOTHING") return { code: EXIT.nothingToUndo, error: e.message };
      if (e.code === "NOTHING_REDO") return { code: EXIT.nothingToRedo, error: e.message };
      throw e;
    }
    const errors = validate(r.next);
    if (errors.length) return { code: EXIT.invalid, error: `INVALID: ${errors.join("; ")}`, errors };
    // A project.json created or edited outside the gateway: keep its current state undoable.
    if (!existsSync(snapPath(dir, m.version))) { mkdirSync(join(opusDir(dir), "versions"), { recursive: true }); writeJson(snapPath(dir, m.version), m); }
    r.next.version = m.version + 1;
    r.next.updated = new Date().toISOString();
    // Derive first, so a composition that cannot take the change leaves every file as it was,
    // then write it, and project.json last: a reader that sees v+1 also sees its derived files.
    const d = derive(dir, { manifest: r.next, prev: m, dry: true, restoreRows: r.restoreRows });
    if (d.code) return d;
    const w = derive(dir, { manifest: r.next, prev: m, restoreRows: r.restoreRows });
    if (w.code) return w;
    // Dropped "## Sự kiện" rows are kept in the history line, so an undo can put them back.
    record(dir, r.next, { actor, base: m.version, ops: r.ops, receipt: [...r.receipt, ...w.events], ...(w.dropped.length ? { dropped_rows: w.dropped } : {}), ...(r.extra ?? {}) });
    // A speaker change reaches scenes/roles.json too (still under the lock), so an import from the
    // files keeps it. project.json is already the truth, so a failed write is a warning.
    const warnings = [...w.warnings];
    try { writeRoles(resolve(dir), speakerChanges(m, r.next)); }
    catch (e) { warnings.push(`không ghi được scenes/roles.json: ${e.message}`); }
    return { code: EXIT.ok, version: r.next.version, receipt: r.receipt, lines: w.lines, warnings };
  } finally { release(); }
}

// note: optional free text kept in the history line (the director's reason, a Studio request id).
export function patch(dir, { actor, base, ops, note, lockWaitMs }) {
  if (!ACTORS.includes(actor) || actor === "undo" || actor === "redo" || actor === "import") return { code: EXIT.usage, error: `actor phải là human | director | timing` };
  return commit(dir, { base, actor, lockWaitMs, build: (m) => ({ ...applyOps(m, ops, { html: readHtml(dir, m), root: resolve(dir) }), ops, ...(note ? { extra: { note: String(note) } } : {}) }) });
}

// Line number → new speaker, for each line whose speaker the change set or changed.
function speakerChanges(prev, next) {
  const before = new Map(prev.lines.map((l) => [l.id, l.speaker]));
  const out = {};
  for (const l of next.lines) {
    const nn = lineNumber(l.file);
    if (nn && l.speaker && l.speaker !== before.get(l.id)) out[nn] = l.speaker;
  }
  return out;
}

// true when rel names a regular file whose real path stays inside the project folder.
function fileInside(root, rel) {
  try {
    const base = realpathSync(root);
    const f = realpathSync(join(root, rel));
    return (f === base || f.startsWith(base + sep)) && statSync(f).isFile();
  } catch { return false; }
}

// The composition text for applyOps, or null when it cannot be read (derive reports that later).
function readHtml(dir, m) {
  try { return readFileSync(join(resolve(dir), m.html), "utf8"); } catch { return null; }
}

export function undo(dir, { base, lockWaitMs }) {
  return commit(dir, {
    base, actor: "undo", lockWaitMs,
    build: (m) => {
      const all = readHistory(dir);
      // An import replaces the whole manifest: undo stays on this side of the latest one.
      const hist = all.slice(all.findLastIndex((h) => h.actor === "import") + 1);
      const undone = new Set(hist.filter((h) => h.actor === "undo").map((h) => h.undoes));
      const target = [...hist].reverse().find((h) => h.actor !== "undo" && h.v > 1 && !undone.has(h.v));
      if (!target) throw Object.assign(new Error("không còn thay đổi nào để hoàn tác"), { code: "NOTHING" });
      const prev = JSON.parse(readFileSync(snapPath(dir, target.v - 1), "utf8"));
      const next = { ...prev, version: m.version, updated: m.updated };
      return { next, ops: [], receipt: [`hoàn tác v${target.v}: ${(target.receipt ?? []).join("; ")}`], extra: { undoes: target.v }, restoreRows: target.dropped_rows ?? [] };
    },
  });
}

// Pure: history lines → the undo entry a redo would re-apply, or null. Only lines after the latest
// import count. The undos and redos since the last other change form a stack: an undo pushes, a
// redo pops; any other change empties it.
export function redoTarget(history) {
  const hist = history.slice(history.findLastIndex((h) => h.actor === "import") + 1);
  let stack = [];
  for (const h of hist) {
    if (h.actor === "undo") stack.push(h);
    else if (h.actor === "redo") stack.pop();
    else stack = [];
  }
  return stack.at(-1) ?? null;
}

// Re-applies the change the newest undo reverted, as a new version. The undos and redos since the
// last other change form a stack: an undo pushes, a redo pops; any other change empties it.
export function redo(dir, { base, lockWaitMs }) {
  return commit(dir, {
    base, actor: "redo", lockWaitMs,
    build: (m) => {
      const target = redoTarget(readHistory(dir));
      if (!target) throw Object.assign(new Error("không còn gì để làm lại"), { code: "NOTHING_REDO" });
      const prev = JSON.parse(readFileSync(snapPath(dir, target.undoes), "utf8"));
      const next = { ...prev, version: m.version, updated: m.updated };
      return { next, ops: [], receipt: [`làm lại v${target.undoes}`], extra: { redoes: target.v } };
    },
  });
}

// Sets (or adds) one attribute in an HTML start tag.
const setAttr = (tag, name, value) => {
  const re = new RegExp(`(\\s${name}\\s*=\\s*)(["'])[^"']*\\2`, "i");
  if (re.test(tag)) return tag.replace(re, `$1$2${value}$2`);
  return tag.replace(/\s*(\/?>)$/, ` ${name}="${value}"$1`);
};
// Removes one attribute from an HTML start tag (no-op when absent).
const removeAttr = (tag, name) => tag.replace(new RegExp(`\\s${name}\\s*=\\s*(["'])[^"']*\\1`, "i"), "");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Rewrites the first match of re outside an HTML comment (the skeleton documents its tags in
// comments, and the renderer ignores those). Returns { text, hit }.
function replaceLive(html, re, fn) {
  const comments = [...html.matchAll(/<!--[\s\S]*?-->/g)].map((c) => [c.index, c.index + c[0].length]);
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  for (const x of html.matchAll(g)) {
    if (comments.some(([a, b]) => x.index >= a && x.index < b)) continue;
    return { text: html.slice(0, x.index) + fn(x[0]) + html.slice(x.index + x[0].length), hit: true };
  }
  return { text: html, hit: false };
}

// Live (outside a comment) matches of a global regex.
function liveMatches(html, re) {
  const comments = [...html.matchAll(/<!--[\s\S]*?-->/g)].map((c) => [c.index, c.index + c[0].length]);
  return [...html.matchAll(re)].filter((x) => !comments.some(([a, b]) => x.index >= a && x.index < b));
}

// Root-timeline data-start of a manifest event.
const eventStart = (e, shotOf) => r3(shotOf.get(e.shot).start + e.offset);

// HTML text + manifest → { html, missing, missingEvents, conflicts }: the root data-duration, each voice
// line's data-start / data-duration (and its src when the line's file changed since prev), each music bed's data-start / data-duration / data-volume
// (gain) / data-media-start / data-fade-in / data-fade-out (the last three only when > 0, removed
// otherwise) and each event's <audio> data-start (shot.start + offset) and data-volume set.
// Otherwise only attribute values change, with one exception: the <audio data-studio-sfx> tags
// the gateway owns. A studio event (studio: true, with a sound) with no live tag gets one,
// inserted after the last live <audio> (after the root's opening tag when there is none); a
// data-studio-sfx tag whose id is no longer an event is removed. A tag without data-studio-sfx is
// never inserted or removed, and never edited for a studio event: conflicts lists the studio event
// ids that hit such a tag. missing / missingEvents list the ids with no live tag.
export function deriveHtml(html, m, prev = null) {
  const fileBefore = new Map((prev?.lines ?? []).map((l) => [l.id, l.file]));
  let out = replaceLive(html, /<[a-z][^>]*\sdata-composition-id\s*=[^>]*>/i, (tag) => setAttr(tag, "data-duration", m.duration)).text;
  const missing = [];
  for (const l of m.lines) {
    const r = replaceLive(out, new RegExp(`<(?:audio|video)\\b[^>]*\\sid\\s*=\\s*["']${esc(l.id)}["'][^>]*>`, "i"), (tag) => {
      let t = setAttr(tag, "data-start", r3(l.start));
      if (l.duration != null) t = setAttr(t, "data-duration", r3(l.duration));
      // set_line_audio pointed the line at another take: the tag plays it. A src that differs
      // from an unchanged file is the author's and stays.
      if (l.file && fileBefore.has(l.id) && fileBefore.get(l.id) !== l.file) t = setAttr(t, "src", l.file);
      return t;
    });
    out = r.text;
    if (!r.hit) missing.push(l.id);
  }
  // Each music bed's data-start / data-duration (end − start; a bed with no end runs to the root
  // duration). Its id joins missing when no live tag carries it.
  for (const b of m.music ?? []) {
    const r = replaceLive(out, new RegExp(`<(?:audio|video)\\b[^>]*\\sid\\s*=\\s*["']${esc(b.id)}["'][^>]*>`, "i"), (tag) => {
      let t = setAttr(setAttr(tag, "data-start", r3(b.start)), "data-duration", r3((b.end ?? m.duration) - b.start));
      t = setAttr(t, "data-volume", r3(b.gain));
      for (const [k, a] of [["media_start", "data-media-start"], ["fade_in", "data-fade-in"], ["fade_out", "data-fade-out"]]) t = b[k] > 0 ? setAttr(t, a, r3(b[k])) : removeAttr(t, a);
      return t;
    });
    out = r.text;
    if (!r.hit) missing.push(b.id);
  }
  const missingEvents = [];
  const conflicts = [];
  const shotOf = new Map((m.shots ?? []).map((s) => [s.id, s]));
  for (const e of m.events ?? []) {
    const r = replaceLive(out, new RegExp(`<audio\\b[^>]*\\sid\\s*=\\s*["']${esc(e.id)}["'][^>]*>`, "i"), (tag) => {
      // A studio event never takes over a tag the director or the author wrote.
      if (e.studio === true && !/\sdata-studio-sfx\b/i.test(tag)) { conflicts.push(e.id); return tag; }
      const t = setAttr(tag, "data-start", eventStart(e, shotOf));
      return e.volume != null ? setAttr(t, "data-volume", e.volume) : t;
    });
    out = r.text;
    if (r.hit) continue;
    const last = e.studio === true && e.sound
      ? liveMatches(out, /<audio\b[^>]*>\s*<\/audio>/gi).at(-1) ?? liveMatches(out, /<[a-z][^>]*\sdata-composition-id\s*=[^>]*>/gi)[0]
      : null;
    if (!last) { missingEvents.push(e.id); continue; }
    // A lane of its own: one past the highest data-track-index in use, and at least 30.
    const lanes = liveMatches(out, /<[a-z][^>]*\sdata-track-index\s*=\s*["'](\d+)["'][^>]*>/gi).map((x) => Number(x[1]));
    const idx = Math.max(29, ...lanes) + 1;
    const at = last.index + last[0].length;
    out = `${out.slice(0, at)}\n      <audio id="${e.id}" src="${e.sound}" data-start="${eventStart(e, shotOf)}" data-track-index="${idx}" data-volume="${e.volume ?? EVENT_VOLUME}" data-audio-group="sfx" data-studio-sfx></audio>${out.slice(at)}`;
  }
  // The gateway's own SFX tags whose event is gone; the line break and indent before each go too.
  const evIds = new Set((m.events ?? []).map((e) => e.id));
  const stale = liveMatches(out, /(\n[ \t]*)?<audio\b[^>]*\sdata-studio-sfx\b[^>]*>\s*<\/audio>/gi)
    .filter((x) => !evIds.has(x[0].match(/\sid\s*=\s*["']([^"']*)["']/i)?.[1]));
  for (const x of stale.reverse()) out = out.slice(0, x.index) + out.slice(x.index + x[0].length);
  return { html: out, missing, missingEvents, conflicts };
}

// PLAN.md text + manifest → PLAN.md with the "## Cảnh" rows in shot order and each Thời điểm cell
// set to the shot window. Rows of shots no longer in the manifest are dropped; a new shot gets a
// row of "…" cells, which check-preflight reports until someone writes it.
export function derivePlan(text, m) {
  const lines = text.split("\n");
  let h = lines.findIndex((l) => /^##\s+/.test(l) && fold(l.replace(/^##\s+/, "")) === SECTIONS.scenes);
  if (h < 0) return text;
  let a = h + 1;
  while (a < lines.length && !/^\s*\|/.test(lines[a]) && !/^##\s+/.test(lines[a])) a++;
  if (a >= lines.length || !/^\s*\|/.test(lines[a])) return text;
  let b = a;
  while (b < lines.length && /^\s*\|/.test(lines[b])) b++;
  const block = lines.slice(a, b);
  const table = parseTable(block.join("\n"));
  const ni = table.headers.findIndex((x) => x === "#");
  const ti = table.headers.findIndex((x) => /thoi diem/.test(x));
  if (ti < 0) return text;
  const head = /^\s*\|[\s|:-]+\|\s*$/.test(lines[a + 1] ?? "") ? 2 : 1;
  // Existing rows keep every byte but the Thời điểm cell; the raw row and parsed row line up.
  const raw = block.slice(head);
  const bySid = new Map(table.rows.map((r, i) => [sceneId(ni >= 0 ? r[ni] : "", i), raw[i]]));
  const when = (s) => `${r3(s.start).toFixed(1)}–${r3(s.end).toFixed(1)}s`;
  const rows = m.shots.map((s) => {
    const old = bySid.get(s.id);
    if (old != null) {
      const cells = old.split("|");
      const c = cells[ti + 1];
      cells[ti + 1] = /\S/.test(c) ? c.replace(/\S(.*\S)?/, when(s)) : ` ${when(s)} `;
      return cells.join("|");
    }
    const r = table.headers.map(() => "…");
    if (ni >= 0) r[ni] = s.id.replace(/^s/, "");
    r[ti] = when(s);
    return `| ${r.join(" | ")} |`;
  });
  return [...lines.slice(0, a + head), ...rows, ...lines.slice(b)].join("\n");
}

// PLAN.md text + the manifest before and after a change → { text, receipt }: each "## Sự kiện"
// row keeps its offset inside the shot that held it (half-open windows, the last shot takes the
// end), so word and SFX rows follow a resized, added or removed shot. A "chữ:" row inside a voice
// line's window (start … start + duration) keeps its offset inside that line instead, so it also
// follows move_line. Rows of a removed shot are dropped; a row left past its shot's new end
// stays, with a warning, and dropped lists the rows dropped with their index in the table, so
// undo can put them back: restore takes that list and re-inserts the rows as they were.
export function remapEvents(text, prev, m, restore = []) {
  const receipt = [];
  const lines = text.split("\n");
  const same = { text, receipt, dropped: [] };
  const h = lines.findIndex((l) => /^##\s+/.test(l) && fold(l.replace(/^##\s+/, "")) === EVENTS_SECTION);
  if (h < 0 || !prev?.shots?.length) return same;
  let a = h + 1;
  while (a < lines.length && !/^\s*\|/.test(lines[a]) && !/^##\s+/.test(lines[a])) a++;
  if (a >= lines.length || !/^\s*\|/.test(lines[a])) return same;
  let b = a;
  while (b < lines.length && /^\s*\|/.test(lines[b])) b++;
  const headers = parseTable(lines.slice(a, b).join("\n")).headers;
  const ti = headers.findIndex((x) => /thoi diem/.test(x));
  const li = headers.findIndex((x) => /su kien/.test(x));
  if (ti < 0) return same;
  const lineAt = (t) => prev.lines?.find((l) => l.duration != null && t >= l.start - EPS && t <= l.start + l.duration + EPS);
  const head = /^\s*\|[\s|:-]+\|\s*$/.test(lines[a + 1] ?? "") ? 2 : 1;
  const holder = (t) => prev.shots.find((s, i) => t >= s.start && (t < s.end || i === prev.shots.length - 1)) ?? prev.shots.at(-1);
  // Only the number changes, kept with at least its decimals and its separator ("3.0" stays "3.0").
  const retime = (cell, t2) => cell.replace(/\d+(?:([.,])(\d+))?/, (tok, sep, dec) => {
    const s = dec && !String(t2).includes(".") ? t2.toFixed(dec.length) : String(t2);
    return sep === "," ? s.replace(".", ",") : s;
  });
  const rows = [];
  const dropped = [];
  lines.slice(a + head, b).forEach((row, index) => {
    const cells = row.split("|");
    const { t } = eventTime(cells[ti + 1]?.trim());
    const word = Number.isFinite(t) && li >= 0 && /^chu\s*:/.test(fold(cells[li + 1] ?? "").trim());
    const said = word ? lineAt(t) : null;
    const saidNow = said && m.lines?.find((l) => l.id === said.id);
    if (saidNow) {
      const t2 = r3(t + saidNow.start - said.start);
      if (t2 !== t) cells[ti + 1] = retime(cells[ti + 1], t2);
      rows.push(cells.join("|"));
      return;
    }
    const old = Number.isFinite(t) ? holder(t) : null;
    const now = old && m.shots.find((s) => s.id === old.id);
    if (!old) { rows.push(row); return; }
    if (!now) { receipt.push(`bỏ hàng sự kiện ${t}s: ${old.id} đã xoá`); dropped.push({ index, row }); return; }
    const t2 = r3(now.start + (t - old.start));
    if (t2 !== t) cells[ti + 1] = retime(cells[ti + 1], t2);
    if (t2 > now.end) receipt.push(`CẢNH BÁO sự kiện ${t2}s nằm ngoài ${now.id} (hết ở ${r3(now.end)}s)`);
    rows.push(cells.join("|"));
  });
  for (const d of [...restore].sort((x, y) => x.index - y.index)) rows.splice(Math.min(d.index, rows.length), 0, d.row);
  return { text: [...lines.slice(0, a + head), ...rows, ...lines.slice(b)].join("\n"), receipt, dropped };
}

// Re-derives the renderer's inputs from project.json (or opts.manifest). dry: compute only.
// prev: the manifest before the change, so "## Sự kiện" rows follow their shots. restoreRows: rows
// to put back (an undo of a change that dropped them). Returns { code, lines, warnings, events,
// dropped, error }; dropped lists the "## Sự kiện" rows this change removed.
export function derive(dir, { manifest = null, prev = null, dry = false, restoreRows = [] } = {}) {
  const root = resolve(dir);
  const m = manifest ?? load(root);
  if (!m) return { code: EXIT.usage, error: `không có project.json trong ${root}` };
  if (!m.capabilities?.editable) return { code: EXIT.viewOnly, error: VIEW_ONLY };
  const htmlPath = join(root, m.html);
  const planPath = join(root, "PLAN.md");
  let html, plan = null, r, next, missing = [], missingEvents = [], events = [], dropped = [];
  try {
    const dh = deriveHtml(readFileSync(htmlPath, "utf8"), m, prev);
    html = dh.html;
    missing = dh.missing;
    missingEvents = dh.missingEvents;
    if (dh.conflicts.length) return { code: EXIT.invalid, error: dh.conflicts.map((id) => `sự kiện ${id}: trùng id với thẻ <audio> có sẵn trong index.html, chọn id khác`).join("; ") };
    if (existsSync(planPath)) {
      const ev = remapEvents(readFileSync(planPath, "utf8"), prev, m, restoreRows);
      plan = derivePlan(ev.text, m);
      events = ev.receipt;
      dropped = ev.dropped;
    }
    const bed = m.music.find((b) => existsSync(join(root, `${b.file}.beats.json`)));
    r = buildTiming({ dir: root, html: m.html, music: bed?.file ?? null, scenes: manifestScenes(m), htmlText: html });
    next = injectTiming(html, r.timing);
  } catch (e) { return { code: EXIT.io, error: e.message }; }
  if (!dry) {
    try {
      writeAtomic(htmlPath, next);
      if (plan != null) writeAtomic(planPath, plan);
      writeAtomic(join(root, "timing.json"), JSON.stringify(r.timing, null, 2) + "\n");
    } catch (e) { return { code: EXIT.io, error: `không ghi được: ${e.message}` }; }
  }
  const warnings = [
    ...missing.map((id) => `${id}: không có thẻ <audio>/<video id="${id}"> trong ${m.html}, thời điểm không được ghi`),
    ...missingEvents.map((id) => `sự kiện ${id}: không có thẻ <audio id="${id}"> trong ${m.html}, thời điểm không được ghi`),
    ...r.warnings,
  ];
  return { code: EXIT.ok, lines: r.lines, warnings, events, dropped };
}

function writeAtomic(f, text) {
  if (existsSync(f) && readFileSync(f, "utf8") === text) return;
  const tmp = `${f}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, f);
}

export function main(argv = process.argv.slice(2), { out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}) {
  if (wantsHelp(argv)) { out(helpText(import.meta.url)); return 0; }
  const usage = "usage: node gateway.mjs patch|undo|redo|log|show|derive --project <dir> … (--help)";
  const [cmd, ...rest] = argv;
  const o = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (["--project", "--actor", "--base", "--ops", "--ops-file", "--version"].includes(a)) {
      const v = rest[++i];
      if (v == null) { err(`gateway: ${a} needs a value\n${usage}\n`); return EXIT.usage; }
      o[a.slice(2)] = v;
    } else if (a === "--json" || a === "--dry") o[a.slice(2)] = true;
    else { err(`gateway: unknown argument ${a}\n${usage}\n`); return EXIT.usage; }
  }
  if (!o.project) { err(`gateway: --project is required\n${usage}\n`); return EXIT.usage; }
  const dir = resolve(o.project);
  if (!existsSync(join(dir, "project.json"))) { err(`gateway: không có project.json trong ${dir}\n`); return EXIT.usage; }
  const report = (r) => {
    if (r.code) { err(`gateway: ${r.error}\n`); return r.code; }
    for (const l of r.lines ?? []) out(`${l}\n`);
    for (const w of r.warnings ?? []) out(`WARN ${w}\n`);
    if (r.version) out(`v${r.version}: ${r.receipt.join("; ")}\n`);
    return 0;
  };
  try {
    switch (cmd) {
      case "patch": {
        if (!o.actor || o.base == null || (!o.ops && !o["ops-file"])) { err(`gateway: patch needs --actor, --base and --ops or --ops-file\n${usage}\n`); return EXIT.usage; }
        let ops;
        try { ops = JSON.parse(o.ops ?? readFileSync(resolve(o["ops-file"]), "utf8")); } catch (e) { err(`gateway: ops không đọc được: ${e.message}\n`); return EXIT.usage; }
        return report(patch(dir, { actor: o.actor, base: Number(o.base), ops }));
      }
      case "undo":
        if (o.base == null) { err(`gateway: undo needs --base\n${usage}\n`); return EXIT.usage; }
        return report(undo(dir, { base: Number(o.base) }));
      case "redo":
        if (o.base == null) { err(`gateway: redo needs --base\n${usage}\n`); return EXIT.usage; }
        return report(redo(dir, { base: Number(o.base) }));
      case "log": {
        const h = readHistory(dir);
        if (o.json) out(JSON.stringify(h, null, 2) + "\n");
        else for (const e of h) out(`v${e.v} ${e.at} ${e.actor}: ${(e.receipt ?? []).join("; ")}\n`);
        return 0;
      }
      case "show": {
        const m = o.version ? JSON.parse(readFileSync(snapPath(dir, Number(o.version)), "utf8")) : load(dir);
        out(JSON.stringify(m, null, 2) + "\n");
        return 0;
      }
      case "derive":
        return report(derive(dir, { dry: Boolean(o.dry) }));
      default:
        err(`gateway: unknown command ${cmd ?? "(none)"}\n${usage}\n`);
        return EXIT.usage;
    }
  } catch (e) { err(`gateway: ${e.message}\n`); return EXIT.io; }
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main());
