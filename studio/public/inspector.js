// inspector.js — the selected shot: Tên, Số giây, Chuyển cảnh vào and motion_note, applied
// together with "Áp dụng" as one patch (set_shot + resize_shot); assets as thumbnails.
import { fmtS, h, round1, thumb } from "/dom.js";

export function mountInspector(ctx, el) {
  let seams = [];
  ctx.api("/api/directions").then((d) => { seams = d.seams ?? []; render(); }).catch(() => {});

  function render() {
    const m = ctx.state.m;
    const i = m ? m.shots.findIndex((s) => s.id === ctx.state.sel) : -1;
    if (!m || i < 0) { el.replaceChildren(h("div", { class: "muted" }, m ? "Chọn một shot trên timeline" : "")); return; }
    const s = m.shots[i];
    const ro = !ctx.editable;
    const dur = round1(s.end - s.start);
    const name = h("input", { type: "text", value: s.name, disabled: ro });
    const secs = h("input", { type: "number", step: "0.1", min: "0.5", value: String(dur), disabled: ro });
    const cur = s.transition_in ?? "";
    const opts = ["", ...new Set([...seams, cur].filter(Boolean))];
    const trans = h("select", { disabled: ro }, opts.map((o) => h("option", { value: o, selected: o === cur }, o || "(không)")));
    const note = h("textarea", { value: s.motion_note ?? "", disabled: ro, placeholder: "Muốn shot này chuyển động thế nào…" });

    async function apply() {
      const ops = [];
      const n = name.value.trim();
      if (n && n !== s.name) ops.push({ op: "set_shot", id: s.id, field: "name", value: n });
      if (trans.value !== cur) ops.push({ op: "set_shot", id: s.id, field: "transition_in", value: trans.value });
      if (note.value !== (s.motion_note ?? "")) ops.push({ op: "set_shot", id: s.id, field: "motion_note", value: note.value });
      const d = round1(Number(secs.value));
      if (!(d >= 0.5)) return ctx.toast("Số giây tối thiểu là 0,5", true);
      if (Math.abs(d - (s.end - s.start)) >= 0.05) ops.push({ op: "resize_shot", id: s.id, duration: d });
      if (!ops.length) return ctx.toast("Không có gì thay đổi");
      if (await ctx.patch(ops)) ctx.toast("Đã áp dụng");
    }

    const assets = s.assets ?? [];
    el.replaceChildren(
      h("h3", {}, `SHOT ${i + 1} · ${fmtS(s.start)}–${fmtS(s.end)}`),
      h("label", {}, "Tên", name),
      h("label", {}, "Số giây", secs),
      h("label", {}, "Chuyển cảnh vào", trans),
      h("button", { class: "btn primary", disabled: ro, onclick: apply }, "Áp dụng"),
      h("h3", {}, "Chuyển động"),
      h("div", { class: "muted" }, "Nội dung chuyển động trong shot này là code — nhờ đạo diễn"),
      note,
      h("button", { class: "btn", onclick: () => ctx.toast("Chưa nối đạo diễn") }, "Nhờ đạo diễn"),
      h("h3", {}, `Chất liệu (${assets.length})`),
      assets.length ? h("div", { class: "thumbs" }, assets.map((a) => thumb(ctx.state.name, a))) : h("div", { class: "muted" }, "Chưa có chất liệu"),
    );
  }

  ctx.on("manifest", render);
  ctx.on("select", render);
  return { render };
}
