// timeline.js — tracks Shot, Lồng tiếng, Nhạc on a px/second scale. Dragging a shot's right
// edge sends resize_shot (0.1 s steps, at least 0.5 s); dragging a voice block sends move_line.
// Both go through ctx.patch with the shown version as base.
import { h, px, round1 } from "/dom.js";

const LABEL = 90;
const MIN_SHOT = 0.5;

export function mountTimeline(ctx, el, { zoomIn, zoomOut }) {
  let pps = 60, head = null, last = 0;
  zoomIn.addEventListener("click", () => { pps = Math.min(400, pps * 1.25); render(); });
  zoomOut.addEventListener("click", () => { pps = Math.max(8, pps / 1.25); render(); });

  // Pointer drag on target: onMove(dx) while moving, onUp(dx) on release.
  function drag(target, onMove, onUp) {
    target.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !ctx.editable) return;
      e.preventDefault();
      e.stopPropagation();
      target.setPointerCapture?.(e.pointerId);
      const x0 = e.clientX;
      let dx = 0;
      const move = (ev) => { dx = ev.clientX - x0; onMove(dx); };
      const up = () => {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
        target.removeEventListener("pointercancel", up);
        onUp(dx);
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", up);
      target.addEventListener("pointercancel", up);
    });
  }

  function shotBlock(s, i) {
    const dur = s.end - s.start;
    const label = `${i + 1} - ${s.name}`;
    const b = h("div", { class: `blk shot${s.id === ctx.state.sel ? " sel" : ""}`, title: label, "data-id": s.id, style: { left: px(s.start * pps), width: px(dur * pps) }, onclick: () => ctx.select(s.id) }, label);
    const handle = h("div", { class: "handle", title: "Kéo để đổi độ dài" });
    b.append(handle);
    const next = (dx) => round1(Math.max(MIN_SHOT, dur + dx / pps));
    drag(handle, (dx) => { b.classList.add("dragging"); b.style.width = px(next(dx) * pps); }, (dx) => {
      const d = next(dx);
      if (Math.abs(d - dur) < 0.05) return render();
      ctx.select(s.id);
      ctx.patch([{ op: "resize_shot", id: s.id, duration: d }]);
    });
    return b;
  }

  function voiceBlock(l) {
    const b = h("div", { class: `blk voice${l.gate === "stale" ? " stale" : ""}`, title: l.text, "data-id": l.id, style: { left: px(l.start * pps), width: px(Math.max(0.2, l.duration) * pps) } },
      h("span", { class: "mic" }), l.text.slice(0, 24));
    const next = (dx) => round1(Math.max(0, l.start + dx / pps));
    b.addEventListener("click", () => { if (!ctx.editable) ctx.select(l.shot); });
    drag(b, (dx) => { b.classList.add("dragging"); b.style.left = px(next(dx) * pps); }, (dx) => {
      if (Math.abs(dx) < 3) { render(); return ctx.select(l.shot); }
      ctx.patch([{ op: "move_line", id: l.id, start: next(dx) }]);
    });
    return b;
  }

  function render() {
    const m = ctx.state.m;
    if (!m) { head = null; el.replaceChildren(h("div", { class: "muted", style: { padding: "12px" } }, "Chưa có timeline")); return; }
    const total = Math.max(m.duration || 0, ...m.shots.map((s) => s.end), ...m.lines.map((l) => l.start + l.duration));
    const lane = total * pps + 60;
    const ruler = h("div", { class: "tl-ruler", title: "Bấm để tua", style: { width: px(lane) } });
    ruler.addEventListener("click", (e) => { const r = ruler.getBoundingClientRect(); ctx.seek(Math.max(0, Math.min(total, (e.clientX - r.left) / pps))); });
    const step = [0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => s * pps >= 50) ?? 60;
    for (let t = 0; t <= total + 1e-6; t += step) ruler.append(h("div", { class: "tl-tick", style: { left: px(t * pps) } }, `${+t.toFixed(1)}s`));
    const track = (label, blocks) => h("div", { class: "tl-track", style: { width: px(LABEL + lane) } }, h("div", { class: "tl-label" }, label), h("div", { class: "tl-lane" }, blocks));
    const music = m.music.map((mu) => {
      const end = mu.end ?? total;
      return h("div", { class: "blk music", title: mu.file, style: { left: px(mu.start * pps), width: px(Math.max(0.2, end - mu.start) * pps) } }, `${mu.file.split("/").pop()} · ${Math.round(mu.gain * 100)}%`);
    });
    head = h("div", { class: "playhead", style: { left: px(LABEL + last * pps) } });
    const inner = h("div", { class: `tl-inner${ctx.editable ? "" : " readonly"}`, style: { width: px(LABEL + lane) } },
      ruler,
      track("Shot", m.shots.map(shotBlock)),
      track("Lồng tiếng", m.lines.map(voiceBlock)),
      track("Nhạc", music),
      head);
    const sx = el.scrollLeft;
    el.replaceChildren(inner);
    el.scrollLeft = sx;
  }

  ctx.on("time", (t) => { last = t; if (head) head.style.left = px(LABEL + t * pps); });
  ctx.on("manifest", render);
  ctx.on("select", render);
  return { render };
}
