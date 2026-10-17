// agent.js — the "Agent trên máy" chip in the topbar and its popover, from GET /api/agent.
// Dot: green when claude is found and not known to be logged out, amber when login is unknown,
// red when claude is missing or logged out. Reloads when a project opens, when the popover
// opens, and every 60 s.
import { h } from "/dom.js";

const EVERY_MS = 60000;
const JOB = { running: "đang chạy", done: "xong", failed: "lỗi", cancelled: "đã huỷ", cancelling: "đang huỷ" };
const semver = (v) => /\d+\.\d+\.\d+/.exec(String(v ?? ""))?.[0] ?? null;
const when = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }); };

function level(a) {
  if (!a) return "unknown";
  if (!a.claude.found || a.claude.logged_in === false) return "bad";
  return a.claude.logged_in === null ? "unknown" : "ok";
}

export function mountAgent(ctx, chip) {
  let data = null, error = null, seq = 0;
  const dot = h("span", { class: "dot unknown", "aria-hidden": "true" });
  const label = h("span", {}, "Claude Code");
  chip.replaceChildren(dot, label);
  chip.setAttribute("aria-haspopup", "dialog");
  chip.setAttribute("aria-expanded", "false");
  const pop = h("div", { class: "agent-pop", id: "agent-pop", role: "dialog", "aria-label": "Agent trên máy", hidden: true });
  chip.setAttribute("aria-controls", "agent-pop");
  document.body.append(pop);

  function paint() {
    const lv = error ? "bad" : level(data);
    dot.className = `dot ${lv}`;
    const v = semver(data?.claude.version);
    label.textContent = data && !data.claude.found ? "Claude Code: không thấy" : `Claude Code${v ? ` ${v}` : ""}`;
    chip.title = error ? `Không đọc được trạng thái agent: ${error}` : { ok: "Claude Code sẵn sàng", unknown: "Chưa rõ đã đăng nhập Claude Code chưa", bad: "Claude Code chưa sẵn sàng" }[lv];
    if (!pop.hidden) fill();
  }

  function fill() {
    const row = (k, v) => h("div", { class: "kv" }, h("span", { class: "muted" }, k), h("span", {}, v));
    if (error) return pop.replaceChildren(h("h3", {}, "Agent trên máy"), h("p", { class: "form-error" }, `Không đọc được trạng thái: ${error}`));
    if (!data) return pop.replaceChildren(h("h3", {}, "Agent trên máy"), h("p", { class: "muted" }, "Đang kiểm tra…"));
    const c = data.claude, j = data.last_job;
    pop.replaceChildren(...[
      h("h3", {}, "Agent trên máy"),
      row("Claude Code", c.found ? (c.version ?? "có, chưa rõ phiên bản") : "không tìm thấy"),
      row("Đăng nhập", c.logged_in === true ? "có" : c.logged_in === false ? "chưa" : "chưa rõ"),
      row("Runner", data.runner === "mcp" ? "mcp: chờ phiên Claude Code đang mở" : "cli: chạy claude -p trên máy"),
      row("Job gần nhất", j ? `${JOB[j.status] ?? j.status}${j.code != null ? ` (exit ${j.code})` : ""} · ${when(j.started)}` : ctx.state.name ? "chưa có" : "mở một dự án để xem"),
      row("ffprobe", data.ffprobe ? "có" : "không tìm thấy"),
      row("ffmpeg", data.ffmpeg ? "có" : "không tìm thấy"),
      !c.found ? h("p", { class: "note" }, "Cài Claude Code rồi mở lại Studio để đạo diễn AI chạy trên máy.") : null,
      c.found && c.logged_in !== true ? h("p", { class: "note" }, "Mở Terminal và chạy ", h("code", {}, "claude"), " để đăng nhập.") : null,
    ].filter(Boolean));
  }

  async function load() {
    const my = ++seq;
    const { name } = ctx.state;
    try {
      const a = await ctx.api(`/api/agent${name ? `?name=${encodeURIComponent(name)}` : ""}`);
      if (my !== seq) return;
      data = a; error = null;
    } catch (e) {
      if (my !== seq) return;
      error = e.message;
    }
    paint();
  }

  function place() {
    const r = chip.getBoundingClientRect();
    pop.style.top = `${Math.round(r.bottom + 6)}px`;
    pop.style.right = `${Math.max(8, Math.round(window.innerWidth - r.right))}px`;
  }
  function close(focus = false) {
    if (pop.hidden) return;
    pop.hidden = true;
    chip.setAttribute("aria-expanded", "false");
    if (focus) chip.focus();
  }
  function openPop() {
    place();
    fill();
    pop.hidden = false;
    chip.setAttribute("aria-expanded", "true");
    load();
  }

  chip.addEventListener("click", () => (pop.hidden ? openPop() : close()));
  document.addEventListener("click", (e) => { if (!pop.hidden && !pop.contains(e.target) && !chip.contains(e.target)) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !pop.hidden) close(true); });
  window.addEventListener("resize", () => { if (!pop.hidden) place(); });
  ctx.on("project", load);
  setInterval(load, EVERY_MS);
  paint();
  load();
  return { load };
}
