// panels.js — the seven left tabs. Timeline edits go through ctx.patch; requests to the director
// (Nhờ đạo diễn sửa, Dùng mẫu này, a changed line) through ctx.direct. The Đạo diễn AI tab lists
// the requests with their receipt or error, the jobs (director, export) with a live log, and the
// exported files.
import { h, thumb } from "/dom.js";

const STATUS = { queued: "đang chờ", running: "đang làm", done: "xong", failed: "không xong" };
const KIND = { director: "Đạo diễn", export: "Xuất video" };
const safeUrl = (u) => (/^https?:\/\//i.test(String(u ?? "")) ? u : null);
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

export function mountPanels(ctx, tabsEl, panelEl) {
  let tab = "director";
  let directions = null;
  const memo = { quick: "", style: "", brief: "" };
  const logEls = new Map(); // job id → <pre> of the open Đạo diễn AI tab

  const needManifest = () => (ctx.state.m ? null : h("div", { class: "muted" }, ctx.state.name ? "Dự án chưa có project.json" : "Chọn một dự án"));
  const loading = () => h("div", { class: "muted" }, "Đang tải…");
  const fail = (e) => h("div", { class: "muted" }, `Lỗi: ${e.message}`);

  // Search box + results area; run(q) returns the result nodes.
  function search(key, placeholder, run) {
    const input = h("input", { type: "search", placeholder, value: memo[key] });
    const out = h("div", { class: "panel-results", style: { display: "flex", flexDirection: "column", gap: "8px" } });
    const go = async () => {
      memo[key] = input.value.trim();
      out.replaceChildren(loading());
      try { const nodes = await run(memo[key]); out.replaceChildren(...(nodes.length ? nodes : [h("div", { class: "muted" }, "Không có kết quả")])); } catch (e) { out.replaceChildren(fail(e)); }
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    if (memo[key]) go();
    return [h("div", { class: "row" }, input, h("button", { class: "btn", onclick: go }, "Tìm")), out];
  }

  const views = {
    director() {
      const { name } = ctx.state;
      if (!name || !ctx.state.m) return [needManifest()];
      const brief = h("textarea", { value: memo.brief, placeholder: "Muốn đạo diễn sửa gì? Ví dụ: shot 2 chậm lại, chữ to hơn…" });
      brief.addEventListener("input", () => (memo.brief = brief.value));
      const ask = async () => { if (await ctx.direct({ scope: "project", text: brief.value.trim() })) { memo.brief = ""; render(); } };
      const renders = h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, loading());
      ctx.api(`/api/files?name=${encodeURIComponent(name)}&dir=renders`).then((fs) => {
        const mp4 = fs.filter((f) => /\.mp4$/i.test(f.path)).reverse();
        renders.replaceChildren(...(mp4.length ? mp4.map((f) => h("div", { class: "card" }, h("a", { href: `/p/${encodeURIComponent(name)}/${f.path.split("/").map(encodeURIComponent).join("/")}`, target: "_blank", rel: "noopener" }, f.path.replace(/^renders\//, "")), h("span", { class: "muted" }, mb(f.size)))) : [h("div", { class: "muted" }, "Chưa có bản xuất")]));
      }).catch((e) => renders.replaceChildren(fail(e)));
      const story = h("pre", { class: "text" }, "…");
      fetch(`/p/${encodeURIComponent(name)}/STORYBOARD.md`).then((r) => (r.ok ? r.text() : "Chưa có STORYBOARD.md")).then((t) => (story.textContent = t)).catch(() => (story.textContent = "Chưa có STORYBOARD.md"));
      const reqs = [...ctx.state.requests].reverse().slice(0, 8).map((r) => h("div", { class: "card" },
        h("div", { class: "row" }, h("span", { class: `badge ${r.status === "done" ? "pass" : r.status === "failed" ? "stale" : "unknown"}` }, STATUS[r.status] ?? r.status), h("span", { class: "muted" }, `${r.scope}${r.target ? ` ${r.target}` : ""} · v${r.base}`)),
        h("span", {}, r.text),
        r.receipt ? h("pre", { class: "text" }, r.receipt) : null,
        r.error ? h("pre", { class: "text" }, r.error) : null,
        r.status === "queued" || r.status === "running" ? h("button", { class: "btn", onclick: () => ctx.cancelRequest(r.id) }, "Huỷ yêu cầu") : null));
      logEls.clear();
      const jobs = [...ctx.state.jobs].reverse().slice(0, 4).map((j) => {
        const pre = h("pre", { class: "text" }, (ctx.state.logs.get(j.id) ?? []).join("\n"));
        logEls.set(j.id, pre);
        const live = j.status === "running" || j.status === "cancelling";
        return h("div", { class: "card" },
          h("div", { class: "row" }, h("strong", {}, `${KIND[j.kind] ?? j.kind}${j.meta?.step ? ` · ${j.meta.step}` : ""}`), h("span", { class: "muted" }, live ? "đang chạy" : j.status === "cancelled" ? "đã huỷ" : `exit ${j.code ?? j.signal}`)),
          j.meta?.message ? h("span", {}, j.meta.message) : null,
          h("details", { open: live }, h("summary", {}, "Log"), pre),
          live ? h("button", { class: "btn", onclick: () => ctx.cancelJob(j.id) }, "Dừng") : null);
      });
      return [
        h("h3", {}, "Đạo diễn AI"), brief,
        h("button", { class: "btn primary", onclick: ask }, "Nhờ đạo diễn sửa"),
        h("h3", {}, "Yêu cầu"), ...(reqs.length ? reqs : [h("div", { class: "muted" }, "Chưa có yêu cầu")]),
        h("h3", {}, "Việc đang chạy"), ...(jobs.length ? jobs : [h("div", { class: "muted" }, "Không có việc nào")]),
        h("h3", {}, "Bản xuất"), renders,
        h("details", {}, h("summary", {}, "Storyboard"), story),
      ];
    },
    quick() {
      return [h("h3", {}, "Nhanh theo case"), ...search("quick", "Từ khoá: logo, chart, product…", async (q) => {
        const rows = await ctx.api(`/api/cases?q=${encodeURIComponent(q)}`);
        return rows.map((c) => {
          const url = safeUrl(c.url);
          return h("div", { class: "card" },
            h("strong", {}, c.title || c.id),
            h("span", { class: "muted" }, `${c.author ?? "?"} · ${c.category ?? ""}`),
            url ? h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, url) : null,
            h("span", { class: "muted" }, String(c.prompt ?? "").slice(0, 160)),
            h("button", { class: "btn", onclick: () => ctx.direct({ scope: "project", text: `Dùng case ${c.id} cho dự án này (nhanh theo case ${c.id}): đọc case qua ov-cases và case-template, giữ nội dung và lời của dự án.` }) }, "Dùng mẫu này"));
        });
      })];
    },
    scenes() {
      const out = h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, loading());
      (directions ??= ctx.api("/api/directions")).then((d) => out.replaceChildren(...d.directions.map((x) => h("div", { class: "card" },
        h("strong", {}, x.ten_vi ?? x.id), h("span", { class: "muted" }, x.mo_ta_vi ?? ""),
        x.seams?.length ? h("span", { class: "muted" }, `Chuyển cảnh: ${x.seams.join(", ")}`) : null)))).catch((e) => out.replaceChildren(fail(e)));
      return [h("h3", {}, "Mẫu cảnh"), out];
    },
    media() {
      const { name } = ctx.state;
      if (!name) return [needManifest()];
      const out = h("div", { class: "thumbs" }, loading());
      ctx.api(`/api/files?name=${encodeURIComponent(name)}&dir=assets`).then((fs) => {
        const shown = fs.filter((f) => !/\.json$/i.test(f.path));
        out.replaceChildren(...(shown.length ? shown.map((f) => thumb(name, f.path)) : [h("div", { class: "muted" }, "Chưa có file trong assets/")]));
      }).catch((e) => out.replaceChildren(fail(e)));
      return [h("h3", {}, "Media"), out];
    },
    voice() {
      const m = ctx.state.m;
      if (!m) return [needManifest()];
      if (!m.lines.length) return [h("h3", {}, "Lồng tiếng"), h("div", { class: "muted" }, "Chưa có câu thoại")];
      return [h("h3", {}, "Lồng tiếng"), ...m.lines.map((l, i) => {
        const text = h("textarea", { value: l.text, disabled: !ctx.editable, "aria-label": `Câu ${i + 1}` });
        const save = async () => {
          if (text.value === l.text) return ctx.toast("Không có gì thay đổi");
          if (await ctx.patch([{ op: "set_line_text", id: l.id, text: text.value }])) ctx.toast("Cần đạo diễn duyệt viet-pro rồi lồng tiếng lại");
        };
        return h("div", { class: "card", "data-id": l.id },
          h("div", { class: "row" }, h("strong", {}, `${i + 1}. ${l.id}`), h("span", { class: `badge ${l.gate ?? "unknown"}` }, l.gate ?? "unknown")),
          text,
          l.gate === "stale" ? h("div", { class: "muted" }, "Cần đạo diễn duyệt viet-pro rồi lồng tiếng lại") : null,
          l.gate === "stale" ? h("button", { class: "btn", onclick: () => ctx.direct({ scope: "line", target: l.id, text: `Câu ${l.id} đã sửa lời: chạy cổng viet-pro cho câu này rồi lồng tiếng lại riêng câu đó.` }) }, "Nhờ đạo diễn duyệt và lồng tiếng lại") : null,
          h("button", { class: "btn", disabled: !ctx.editable, onclick: save }, "Lưu lời"));
      })];
    },
    music() {
      const m = ctx.state.m;
      if (!m) return [needManifest()];
      if (!m.music.length) return [h("h3", {}, "Nhạc"), h("div", { class: "muted" }, "Chưa có nhạc")];
      return [h("h3", {}, "Nhạc"), ...m.music.map((mu) => {
        const pct = h("span", { class: "muted" }, `${Math.round(mu.gain * 100)}%`);
        const slider = h("input", { type: "range", min: "0", max: "100", step: "1", value: String(Math.round(mu.gain * 100)), disabled: !ctx.editable, "aria-label": `Âm lượng ${mu.file}` });
        slider.addEventListener("input", () => (pct.textContent = `${slider.value}%`));
        slider.addEventListener("change", () => ctx.patch([{ op: "set_music", id: mu.id, field: "gain", value: Number(slider.value) / 100 }]));
        return h("div", { class: "card" }, h("strong", {}, mu.file.split("/").pop()), h("div", { class: "row" }, slider, pct));
      })];
    },
    style() {
      return [h("h3", {}, "Phong cách"), ...search("style", "Ví dụ: minimal, neon, editorial…", async (q) => {
        const rows = await ctx.api(`/api/styles?q=${encodeURIComponent(q || "minimal")}`);
        return rows.map((s) => h("div", { class: "card" }, h("strong", {}, s.ten_vi ?? s.id), h("span", { class: "muted" }, s.mo_ta_vi ?? ""), h("span", { class: "muted" }, s.id)));
      })];
    },
  };

  function render() {
    for (const b of tabsEl.querySelectorAll(".tab")) b.classList.toggle("active", b.dataset.tab === tab);
    panelEl.replaceChildren(...views[tab]().filter(Boolean));
  }

  tabsEl.addEventListener("click", (e) => {
    const b = e.target.closest(".tab");
    if (!b) return;
    tab = b.dataset.tab;
    render();
  });
  ctx.on("project", render);
  // Manifest-driven tabs follow new versions, unless the user is typing in the panel.
  const typing = () => panelEl.contains(document.activeElement) && document.activeElement.matches("textarea, input[type=text], input[type=search]");
  ctx.on("manifest", () => { if ((tab === "voice" || tab === "music") && !typing()) render(); });
  ctx.on("requests", () => { if (tab === "director" && !typing()) render(); });
  // A log line only extends its <pre>; start and exit redraw the tab (export list included).
  ctx.on("jobs", (e) => {
    if (tab !== "director") return;
    const pre = e?.type === "log" ? logEls.get(e.job.id) : null;
    if (pre) { pre.textContent += (pre.textContent ? "\n" : "") + e.line; pre.scrollTop = pre.scrollHeight; }
    else if (!typing()) render();
  });
  return { render };
}
