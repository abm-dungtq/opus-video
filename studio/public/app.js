// app.js — Motion Studio shell: project choice, manifest state, the SSE feed and the edit calls
// shared by the player, timeline, inspector and panels. Edits go to /api/patch with the shown
// version as base; a 409 reloads the manifest and says so.
import { h, toast } from "/dom.js";
import { mountPlayer } from "/player.js";
import { mountTimeline } from "/timeline.js";
import { mountInspector } from "/inspector.js";
import { mountPanels } from "/panels.js";

const $ = (id) => document.getElementById(id);
const TOKEN = document.querySelector('meta[name="studio-token"]').content;
const listeners = {};
let events = null;

const ctx = {
  state: { projects: [], name: null, entry: null, m: null, sel: null, log: [] },
  on(ev, fn) { (listeners[ev] ??= []).push(fn); },
  emit(ev, ...a) { for (const fn of listeners[ev] ?? []) fn(...a); },
  get editable() { return Boolean(ctx.state.m?.capabilities?.editable); },
  async api(path) {
    const r = await fetch(path);
    const j = await r.json().catch(() => null);
    if (!r.ok) throw Object.assign(new Error(j?.error ?? r.statusText), { status: r.status });
    return j;
  },
  async send(path, body) {
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "x-studio-token": TOKEN }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, ...j };
  },
  async patch(ops) {
    const { name, m } = ctx.state;
    if (!m || !ctx.editable) { toast("Dự án chỉ xem, sửa qua đạo diễn", true); return false; }
    const r = await ctx.send("/api/patch", { name, base: m.version, ops });
    await reload();
    if (r.status === 200) return true;
    if (r.status === 409) toast("Đã có thay đổi mới, đã tải lại");
    else toast(r.error ?? `Lỗi ${r.status}`, true);
    return false;
  },
  async undo() {
    const { name, m } = ctx.state;
    if (!m || !ctx.editable) return;
    const r = await ctx.send("/api/undo", { name, base: m.version });
    await reload();
    if (r.status === 200) toast(`Đã hoàn tác (v${r.version})`);
    else if (r.status === 409) toast("Đã có thay đổi mới, đã tải lại");
    else if (r.status === 422) toast("Không còn gì để hoàn tác");
    else toast(r.error ?? `Lỗi ${r.status}`, true);
  },
  select(id) { ctx.state.sel = id; ctx.emit("select", id); },
  seek(t) { player.seek(t); },
  toast,
};

const player = mountPlayer(ctx, $("player"), { playBtn: $("play-btn"), timeEl: $("time") });
mountTimeline(ctx, $("timeline"), { zoomIn: $("zoom-in"), zoomOut: $("zoom-out") });
mountInspector(ctx, $("inspector"));
mountPanels(ctx, document.querySelector(".tabs"), $("panel"));

function setManifest(m) {
  ctx.state.m = m;
  if (m && !m.shots.some((s) => s.id === ctx.state.sel)) ctx.state.sel = m.shots[0]?.id ?? null;
  const banner = $("banner");
  if (m && !m.capabilities?.editable) { banner.replaceChildren("Dự án nhập từ bản cũ: chỉ xem, sửa qua đạo diễn"); banner.hidden = false; }
  else if (m) banner.hidden = true;
  $("project-title").textContent = m?.title ?? "";
  $("undo-btn").disabled = !ctx.editable;
  ctx.emit("manifest", m);
  renderVersions();
}

async function reload() {
  const { name } = ctx.state;
  if (!name || !ctx.state.entry?.has_manifest) return;
  try {
    const [m, log] = await Promise.all([ctx.api(`/api/project?name=${encodeURIComponent(name)}`), ctx.api(`/api/log?name=${encodeURIComponent(name)}`)]);
    if (name !== ctx.state.name) return;
    ctx.state.log = log;
    setManifest(m);
  } catch (e) { toast(`Không tải được dự án: ${e.message}`, true); }
}

function renderVersions() {
  const { m, log } = ctx.state;
  const sel = $("version-select");
  if (!m) { sel.replaceChildren(); sel.disabled = true; return; }
  const vs = log.length ? [...log].reverse() : [{ v: m.version }];
  sel.replaceChildren(...vs.map((e) => h("option", { value: String(e.v), selected: e.v === m.version }, `v${e.v} · ${e.v === m.version ? "hiện tại" : (e.actor ?? "")}`)));
  sel.disabled = false;
}
$("version-select").addEventListener("change", (e) => {
  toast("Danh sách chỉ để xem; quay lại bản trước bằng Hoàn tác");
  e.target.value = String(ctx.state.m?.version ?? "");
});

function subscribe(name) {
  events?.close();
  events = new EventSource(`/api/events?name=${encodeURIComponent(name)}`);
  events.addEventListener("manifest", (e) => {
    const m = JSON.parse(e.data);
    if (name === ctx.state.name && m.version !== ctx.state.m?.version) reload();
  });
  events.addEventListener("request", (e) => ctx.emit("requests", JSON.parse(e.data)));
}

async function importProject(name) {
  const r = await ctx.send("/api/import", { name });
  if (r.status !== 200) return toast(r.error ?? `Lỗi ${r.status}`, true);
  toast("Đã nhập dự án");
  await loadProjects();
  open(name);
}

async function open(name) {
  events?.close(); events = null;
  const entry = ctx.state.projects.find((p) => p.name === name) ?? null;
  Object.assign(ctx.state, { name: entry ? name : null, entry, m: null, sel: null, log: [] });
  const url = new URL(location.href);
  if (entry) url.searchParams.set("name", name); else url.searchParams.delete("name");
  history.replaceState(null, "", url);
  $("project-select").value = entry ? name : "";
  const banner = $("banner");
  banner.hidden = true;
  setManifest(null);
  if (entry && !entry.has_manifest) {
    banner.replaceChildren("Dự án chưa có project.json. ", h("button", { class: "btn", onclick: () => importProject(name) }, "Nhập dự án"));
    banner.hidden = false;
    player.clear("Nhập dự án để xem");
  }
  ctx.emit("project", entry);
  if (entry?.has_manifest) { await reload(); subscribe(name); }
}

async function loadProjects() {
  ctx.state.projects = await ctx.api("/api/projects");
  $("project-select").replaceChildren(h("option", { value: "" }, "— chọn dự án —"),
    ...ctx.state.projects.map((p) => h("option", { value: p.name }, `${p.name}${p.has_manifest ? (p.editable ? "" : " (chỉ xem)") : " (chưa nhập)"}`)));
}

$("project-select").addEventListener("change", (e) => open(e.target.value));
$("undo-btn").addEventListener("click", () => ctx.undo());
$("export-btn").addEventListener("click", () => toast("Xuất video: chưa nối đạo diễn"));
document.addEventListener("keydown", (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "z") return;
  if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
  e.preventDefault();
  ctx.undo();
});

await loadProjects().catch((e) => toast(`Không tải được danh sách dự án: ${e.message}`, true));
open(new URL(location.href).searchParams.get("name") ?? "");
