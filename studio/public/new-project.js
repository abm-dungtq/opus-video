// new-project.js — the "Dự án mới" dialog. A native <dialog> (showModal) with the fields of
// POST /api/projects/new; field limits match the server (studio/create.mjs). An error stays in
// the dialog; on success the dialog closes and onCreated(name, mode) opens the new project.
import { h } from "/dom.js";

const MODES = [
  { id: "tu-dau", label: "Làm từ đầu", hint: "Ví dụ: viết kịch bản 3 cảnh rồi dựng bản nháp" },
  { id: "video-co-san", label: "Dựng từ video có sẵn + B-roll", hint: "Ví dụ: dựng từ clip phỏng vấn đã thêm ở mục Footage, chèn B-roll minh hoạ" },
  { id: "theo-nhac", label: "Theo bài nhạc", hint: "Ví dụ: cắt hình theo nhịp bài nhạc trong assets/bgm" },
  { id: "mau-nhanh", label: "Mẫu nhanh", hint: "Ví dụ: tìm một video mẫu hợp chủ đề rồi làm theo" },
];
const ASPECTS = [["16:9", "16:9 ngang"], ["9:16", "9:16 dọc"], ["both", "Cả hai"]];

export function mountNewProject(ctx, btn, { onCreated }) {
  const err = h("p", { class: "form-error", role: "alert", hidden: true });
  const field = (label, control, note) => h("label", { class: "field" }, h("span", {}, label), control, note ? h("small", { class: "muted" }, note) : null);
  const name = h("input", { type: "text", name: "name", required: true, pattern: "[a-z0-9][a-z0-9\\-]{1,48}", autocomplete: "off", spellcheck: "false", placeholder: "vi-du-video-moi" });
  const topic = h("textarea", { name: "topic", required: true, maxlength: "500", rows: "2", placeholder: "Video nói về điều gì?" });
  const duration = h("input", { type: "number", name: "duration", required: true, min: "5", max: "600", step: "1", value: "30" });
  const audience = h("input", { type: "text", name: "audience", maxlength: "500", placeholder: "Ví dụ: chủ shop online mới bắt đầu" });
  const first = h("textarea", { name: "first_request", maxlength: "4000", rows: "3" });
  const radios = (group, items, checked) => h("div", { class: "choices", role: "radiogroup" }, ...items.map(([value, label]) =>
    h("label", { class: "choice" }, h("input", { type: "radio", name: group, value, checked: value === checked }), h("span", {}, label))));
  const modes = h("fieldset", { class: "field" }, h("legend", {}, "Chế độ"), radios("mode", MODES.map((m) => [m.id, m.label]), "tu-dau"));
  const aspects = h("fieldset", { class: "field" }, h("legend", {}, "Tỷ lệ"), radios("aspect", ASPECTS, "16:9"));
  const submit = h("button", { type: "submit", class: "btn primary" }, "Tạo dự án");
  const cancel = h("button", { type: "button", class: "btn", onclick: () => dialog.close() }, "Huỷ");
  const form = h("form", { class: "dialog-form" },
    h("h2", {}, "Dự án mới"),
    field("Tên thư mục", name, "chữ thường, số, gạch nối (2–49 ký tự)"),
    modes, aspects,
    field("Chủ đề", topic),
    h("div", { class: "field-row" }, field("Thời lượng (giây)", duration), field("Khán giả (tuỳ chọn)", audience)),
    field("Việc đầu tiên giao cho AI (tuỳ chọn)", first),
    err,
    h("div", { class: "row dialog-actions" }, cancel, submit));
  const dialog = h("dialog", { class: "dialog", "aria-label": "Dự án mới" }, form);
  document.body.append(dialog);

  const mode = () => form.elements.mode.value || "tu-dau";
  const syncHint = () => { first.placeholder = MODES.find((m) => m.id === mode())?.hint ?? ""; };
  form.addEventListener("change", (e) => { if (e.target.name === "mode") syncHint(); });
  const showError = (msg) => { err.textContent = msg; err.hidden = false; };
  const busy = (on) => { submit.disabled = on; cancel.disabled = on; submit.textContent = on ? "Đang tạo…" : "Tạo dự án"; };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    if (!form.reportValidity()) return;
    const body = {
      name: name.value.trim(), mode: mode(), aspect: form.elements.aspect.value || "16:9",
      topic: topic.value.trim(), duration: Number(duration.value),
      ...(audience.value.trim() ? { audience: audience.value.trim() } : {}),
      ...(first.value.trim() ? { first_request: first.value.trim() } : {}),
    };
    busy(true);
    try {
      const r = await ctx.send("/api/projects/new", body);
      if (r.status !== 200) {
        const tail = String(r.stderr ?? "").trim().split("\n").slice(-3).join("\n");
        return showError(`${r.error ?? `Lỗi ${r.status}`}${tail ? `\n${tail}` : ""}`);
      }
      dialog.close();
      await onCreated(r.name, body.mode, r);
    } catch (x) {
      showError(`Không gửi được: ${x.message}`);
    } finally { busy(false); }
  });
  // Esc closes the dialog, but not while the project is being created.
  dialog.addEventListener("cancel", (e) => { if (submit.disabled) e.preventDefault(); });

  btn.addEventListener("click", () => {
    form.reset();
    // h() sets value/checked as properties, which reset() does not restore: set the defaults again.
    duration.value = "30";
    form.querySelector('input[name=mode][value="tu-dau"]').checked = true;
    form.querySelector('input[name=aspect][value="16:9"]').checked = true;
    err.hidden = true;
    syncHint();
    dialog.showModal();
    name.focus();
  });
  return { dialog };
}
