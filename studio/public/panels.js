// panels.js — the left rail and its six panels, in the order a video gets made: give the AI work,
// footage, lines and voice, music, the reference library, export. Timeline edits go through
// ctx.patch; anything for the director (a task, "Dùng cho dự án", a changed line) through
// ctx.direct. The open panel is kept in localStorage ("studio.tab") and in the URL (?tab=).
// Keys: Alt+1…Alt+6 pick a panel; arrow keys, Home and End move along the rail (ARIA tabs).
import { h, thumb, fmtS } from "/dom.js";
import { icon } from "/icons.js";

const TABS = [
  { id: "ai", label: "Giao việc cho AI", lead: "Viết việc cần làm. Đạo diễn AI làm trên máy bạn và hỏi lại khi cần bạn chọn hoặc duyệt." },
  { id: "media", label: "Footage & chất liệu", lead: "Thêm video quay sẵn, B-roll, ảnh. File nằm ngoài workspace sẽ được chép vào footage/raw." },
  { id: "voice", label: "Lời & giọng", lead: "Sửa lời từng câu. Câu đã sửa cần qua cổng viet-pro và lồng tiếng lại." },
  { id: "music", label: "Nhạc & âm thanh", lead: "Nhạc nền và hiệu ứng âm thanh gắn theo shot." },
  { id: "library", label: "Thư viện mẫu", lead: "Tìm video, cảnh hoặc phong cách có sẵn để AI làm theo." },
  { id: "output", label: "Xuất bản", lead: "Xuất MP4 bản giao (render rồi nén) và tải file đã xuất." },
];
const IDS = TABS.map((t) => t.id);
const STORE = "studio.tab";

const STATUS = { queued: "đang chờ", running: "đang làm", done: "xong", failed: "không xong", waiting_user: "chờ bạn trả lời" };
const KIND = { director: "Đạo diễn", export: "Xuất video" };
const safeUrl = (u) => (/^https?:\/\//i.test(String(u ?? "")) ? u : null);
// Shortens text at a word boundary so a card never ends mid-word.
const clip = (t, n) => { const s = String(t ?? "").trim(); if (s.length <= n) return s; const cut = s.slice(0, n); return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), n * 0.6)).trimEnd()}…`; };
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
const fileUrl = (name, path) => `/p/${encodeURIComponent(name)}/${path.split("/").map(encodeURIComponent).join("/")}`;

// The three library sources share one search box. run(q) returns rows; use(row) is the request
// text sent to the director. These are segments inside the library panel, not rail tabs.
const LIBRARY = {
  cases: {
    label: `Video mẫu`, placeholder: "Từ khoá: logo, chart, product…",
    run: (ctx, q) => ctx.api(`/api/cases?q=${encodeURIComponent(q)}`),
    title: (c) => c.title || c.id,
    lines: (c) => [`${c.author ?? "?"} · ${c.category ?? ""}`, clip(c.prompt, 160)],
    link: (c) => safeUrl(c.url),
    use: (c) => `Dùng case ${c.id} cho dự án này (nhanh theo case ${c.id}): đọc case qua ov-cases và case-template, giữ nội dung và lời của dự án.`,
  },
  scenes: {
    label: `Cảnh mẫu`, placeholder: "Từ khoá: biểu đồ, logo, chuyển cảnh…",
    run: async (ctx, q) => {
      const d = await ctx.api("/api/directions");
      const k = q.toLowerCase();
      return d.directions.filter((x) => !k || [x.id, x.ten_vi, x.mo_ta_vi].some((s) => String(s ?? "").toLowerCase().includes(k)));
    },
    title: (x) => x.ten_vi ?? x.id,
    lines: (x) => [x.mo_ta_vi ?? "", x.seams?.length ? `Chuyển cảnh: ${x.seams.join(", ")}` : ""],
    use: (x) => `Dùng mẫu cảnh ${x.id} (${x.ten_vi ?? x.id}) cho dự án này: dựng lại các shot theo hướng cảnh đó, giữ nội dung và lời của dự án.`,
  },
  styles: {
    label: `Phong cách`, placeholder: "Ví dụ: minimal, neon, editorial…",
    run: (ctx, q) => ctx.api(`/api/styles?q=${encodeURIComponent(q)}`),
    title: (s) => s.ten_vi ?? s.id,
    lines: (s) => [s.mo_ta_vi ?? "", s.id],
    use: (s) => `Áp phong cách ${s.id} (${s.ten_vi ?? s.id}) cho dự án này: đổi màu, chữ và chuyển động theo phong cách đó, giữ nội dung, lời và nhịp.`,
  },
};

function readTab() {
  const fromUrl = new URL(location.href).searchParams.get("tab");
  if (IDS.includes(fromUrl)) return fromUrl;
  try { const saved = localStorage.getItem(STORE); if (IDS.includes(saved)) return saved; } catch { /* storage blocked */ }
  return "ai";
}

export function mountPanels(ctx, railEl, panelEl) {
  let tab = readTab();
  const memo = { brief: "", libMode: "cases", libQuery: "" };
  const logEls = new Map(); // job id → <pre> of the open Xuất bản panel

  // Rail buttons with icon, label and a count badge; roving tabindex as in the ARIA tabs pattern.
  const buttons = new Map(TABS.map((t, i) => {
    const count = h("span", { class: "rail-count", hidden: true });
    const b = h("button", { type: "button", role: "tab", id: `tab-${t.id}`, class: "rail-item", "data-tab": t.id, "aria-controls": "panel", title: `${t.label} (Alt+${i + 1})` },
      h("span", { class: "rail-icon" }, icon(t.id), count), h("span", { class: "rail-label" }, t.label));
    railEl.append(b);
    return [t.id, { b, count, label: t.label }];
  }));

  const loading = () => h("p", { class: "muted" }, "Đang tải…");
  const fail = (e) => h("p", { class: "empty" }, `Không tải được: ${e.message}. Thử bấm lại mục này trên thanh trái.`);
  // Every empty state says what to do next, with a button when the next step is in the Studio.
  const empty = (text, action, to) => h("div", { class: "empty" }, h("p", {}, text), action ? h("button", { class: "btn", onclick: () => select(to, true) }, action) : null);
  const needManifest = () => {
    if (ctx.state.m) return null;
    if (!ctx.state.name) return h("div", { class: "empty" }, h("p", {}, "Chưa mở dự án nào. Chọn một dự án ở thanh trên cùng để bắt đầu."),
      h("button", { class: "btn", onclick: () => document.getElementById("project-select")?.focus() }, "Chọn dự án"));
    return h("div", { class: "empty" }, h("p", {}, "Dự án chưa có project.json. Bấm \"Nhập dự án\" trên dải vàng phía trên để mở nó trong Studio."));
  };

  const views = {
    ai() {
      const { name } = ctx.state;
      if (!name || !ctx.state.m) return [needManifest()];
      const brief = h("textarea", { value: memo.brief, "aria-label": "Việc giao cho AI", placeholder: "Ví dụ: shot 2 chậm lại, chữ to hơn, thêm logo cuối video…" });
      brief.addEventListener("input", () => (memo.brief = brief.value));
      const ask = async () => { if (await ctx.direct({ scope: "project", text: brief.value.trim() })) { memo.brief = ""; render(); } };
      const story = h("pre", { class: "text" }, "…");
      fetch(fileUrl(name, "STORYBOARD.md")).then((r) => (r.ok ? r.text() : "Chưa có STORYBOARD.md")).then((t) => (story.textContent = t)).catch(() => (story.textContent = "Chưa có STORYBOARD.md"));
      const reqs = [...ctx.state.requests].reverse().slice(0, 8).map((r) => h("div", { class: "card" },
        h("div", { class: "row" }, h("span", { class: `badge ${r.status === "done" ? "pass" : r.status === "failed" || r.status === "waiting_user" ? "stale" : "unknown"}` }, STATUS[r.status] ?? r.status), h("span", { class: "muted" }, `${r.scope}${r.target ? ` ${r.target}` : ""} · v${r.base}`)),
        h("span", {}, r.text),
        r.status === "waiting_user" && r.ask?.question ? h("strong", {}, r.ask.question) : null,
        r.receipt ? h("pre", { class: "text" }, r.receipt) : null,
        r.error ? h("pre", { class: "text" }, r.error) : null,
        r.status === "queued" || r.status === "running" ? h("div", { class: "row" }, h("button", { class: "btn", onclick: () => ctx.cancelRequest(r.id) }, "Huỷ yêu cầu")) : null));
      return [
        h("section", { class: "group" }, brief, h("div", { class: "row" }, h("button", { class: "btn primary", onclick: ask }, "Giao việc"))),
        h("section", { class: "group" }, h("h3", {}, "Việc đã giao"), ...(reqs.length ? reqs : [h("p", { class: "empty" }, "Chưa giao việc nào. Viết việc đầu tiên ở ô trên rồi bấm Giao việc.")])),
        h("details", {}, h("summary", {}, "Storyboard"), story),
      ];
    },
    media() {
      const { name } = ctx.state;
      if (!name || !ctx.state.m) return [needManifest()];
      const out = h("div", { class: "thumbs" }, loading());
      ctx.api(`/api/files?name=${encodeURIComponent(name)}&dir=assets`).then((fs) => {
        const shown = fs.filter((f) => !/\.json$/i.test(f.path));
        if (shown.length) out.replaceChildren(...shown.map((f) => thumb(name, f.path)));
        else out.replaceWith(empty("Chưa có file nào trong assets/. Giao việc cho AI tìm footage hoặc tạo hình cho dự án.", "Giao việc cho AI", "ai"));
      }).catch((e) => out.replaceWith(fail(e)));
      return [h("section", { class: "group" }, h("h3", {}, "File trong assets/"), out)];
    },
    voice() {
      const m = ctx.state.m;
      if (!m) return [needManifest()];
      if (!m.lines.length) return [empty("Chưa có câu thoại. Giao việc cho AI viết kịch bản.", "Giao việc cho AI", "ai")];
      return m.lines.map((l, i) => {
        const text = h("textarea", { value: l.text, disabled: !ctx.editable, "aria-label": `Câu ${i + 1}` });
        const save = async () => {
          if (text.value === l.text) return ctx.toast("Không có gì thay đổi");
          if (await ctx.patch([{ op: "set_line_text", id: l.id, text: text.value }])) ctx.toast("Cần đạo diễn duyệt viet-pro rồi lồng tiếng lại");
        };
        return h("div", { class: "card", "data-id": l.id },
          h("div", { class: "row" }, h("strong", {}, `${i + 1}. ${l.id}`), h("span", { class: `badge ${l.gate ?? "unknown"}` }, l.gate ?? "unknown")),
          text,
          l.gate === "stale" ? h("p", { class: "muted" }, "Cần đạo diễn duyệt viet-pro rồi lồng tiếng lại") : null,
          h("div", { class: "row" },
            h("button", { class: "btn", disabled: !ctx.editable, onclick: save }, "Lưu lời"),
            l.gate === "stale" ? h("button", { class: "btn", onclick: () => ctx.direct({ scope: "line", target: l.id, text: `Câu ${l.id} đã sửa lời: chạy cổng viet-pro cho câu này rồi lồng tiếng lại riêng câu đó.` }) }, "Nhờ duyệt và lồng tiếng lại") : null));
      });
    },
    music() {
      const m = ctx.state.m;
      if (!m) return [needManifest()];
      const tracks = m.music.map((mu) => {
        const pct = h("span", { class: "num" }, `${Math.round(mu.gain * 100)}%`);
        const slider = h("input", { type: "range", min: "0", max: "100", step: "1", value: String(Math.round(mu.gain * 100)), disabled: !ctx.editable, "aria-label": `Âm lượng ${mu.file}` });
        slider.addEventListener("input", () => (pct.textContent = `${slider.value}%`));
        slider.addEventListener("change", () => ctx.patch([{ op: "set_music", id: mu.id, field: "gain", value: Number(slider.value) / 100 }]));
        return h("div", { class: "card" }, h("strong", {}, mu.file.split("/").pop()), h("div", { class: "row" }, slider, pct));
      });
      const events = (m.events ?? []).map((ev) => h("div", { class: "card" },
        h("div", { class: "row" }, h("strong", {}, ev.label || ev.id), h("span", { class: "muted num" }, `${ev.shot} + ${fmtS(ev.offset)}`)),
        ev.sound ? h("span", { class: "muted" }, ev.sound.split("/").pop()) : null));
      return [
        h("section", { class: "group" }, h("h3", {}, "Nhạc nền"), ...(tracks.length ? tracks : [empty("Chưa có nhạc nền. Giao việc cho AI chọn nhạc hợp nội dung.", "Giao việc cho AI", "ai")])),
        h("section", { class: "group" }, h("h3", {}, "Hiệu ứng âm thanh"), ...(events.length ? events : [h("p", { class: "empty" }, "Chưa có hiệu ứng âm thanh nào gắn theo shot. Giao việc cho AI nếu cần tiếng nhấn.")])),
      ];
    },
    library() {
      const input = h("input", { type: "search", value: memo.libQuery, "aria-label": "Tìm trong thư viện mẫu", placeholder: LIBRARY[memo.libMode].placeholder });
      const out = h("div", { class: "stack", "aria-live": "polite" });
      const seg = h("div", { class: "seg", role: "group", "aria-label": "Loại mẫu" }, ...Object.entries(LIBRARY).map(([k, src]) =>
        h("button", { type: "button", class: "seg-btn", "aria-pressed": String(k === memo.libMode), onclick: () => { memo.libMode = k; render(); } }, src.label)));
      const go = async () => {
        const src = LIBRARY[memo.libMode];
        memo.libQuery = input.value.trim();
        out.replaceChildren(loading());
        try {
          const rows = await src.run(ctx, memo.libQuery);
          if (!rows.length) return out.replaceChildren(h("p", { class: "empty" }, `Không thấy ${src.label.toLowerCase()} nào khớp "${memo.libQuery}". Thử từ khoá ngắn hơn hoặc đổi loại mẫu.`));
          out.replaceChildren(...rows.slice(0, 40).map((row) => {
            const url = src.link?.(row);
            return h("div", { class: "card" },
              h("strong", {}, src.title(row)),
              ...src.lines(row).filter(Boolean).map((t) => h("span", { class: "muted clamp" }, t)),
              h("div", { class: "row" }, h("button", { class: "btn", disabled: !ctx.state.m, title: ctx.state.m ? null : "Mở một dự án trước", onclick: () => ctx.direct({ scope: "project", text: src.use(row) }) }, "Dùng cho dự án"), url ? h("a", { class: "ext", href: url, target: "_blank", rel: "noopener noreferrer", title: url }, "Xem bản gốc") : null));
          }));
        } catch (e) { out.replaceChildren(fail(e)); }
      };
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
      go();
      return [seg, h("div", { class: "search" }, input, h("button", { class: "btn", onclick: go }, "Tìm")), out];
    },
    output() {
      const { name } = ctx.state;
      if (!name || !ctx.state.m) return [needManifest()];
      const renders = h("div", { class: "stack" }, loading());
      ctx.api(`/api/files?name=${encodeURIComponent(name)}&dir=renders`).then((fs) => {
        const mp4 = fs.filter((f) => /\.mp4$/i.test(f.path)).reverse();
        renders.replaceChildren(...(mp4.length ? mp4.map((f) => h("div", { class: "card file-row" }, h("a", { href: fileUrl(name, f.path), target: "_blank", rel: "noopener" }, f.path.replace(/^renders\//, "")), h("span", { class: "muted num" }, mb(f.size))))
          : [h("p", { class: "empty" }, "Chưa có bản xuất. Bấm Xuất video ở trên; file MP4 hiện ở đây khi xong.")]));
      }).catch((e) => renders.replaceChildren(fail(e)));
      logEls.clear();
      const jobs = [...ctx.state.jobs].reverse().slice(0, 4).map((j) => {
        const pre = h("pre", { class: "text" }, (ctx.state.logs.get(j.id) ?? []).join("\n"));
        logEls.set(j.id, pre);
        const live = j.status === "running" || j.status === "cancelling";
        return h("div", { class: "card" },
          h("div", { class: "row" }, h("strong", {}, `${KIND[j.kind] ?? j.kind}${j.meta?.step ? ` · ${j.meta.step}` : ""}`), h("span", { class: "muted" }, live ? "đang chạy" : j.status === "cancelled" ? "đã huỷ" : `exit ${j.code ?? j.signal}`)),
          j.meta?.message ? h("span", {}, j.meta.message) : null,
          h("details", { open: live }, h("summary", {}, "Log"), pre),
          live ? h("div", { class: "row" }, h("button", { class: "btn", onclick: () => ctx.cancelJob(j.id) }, "Dừng")) : null);
      });
      return [
        h("section", { class: "group" }, h("div", { class: "row" }, h("button", { class: "btn primary", onclick: () => ctx.exportVideo() }, "Xuất video"))),
        h("section", { class: "group" }, h("h3", {}, "Việc đang chạy"), ...(jobs.length ? jobs : [h("p", { class: "empty" }, "Không có việc nào đang chạy. Bấm Xuất video để render bản giao.")])),
        h("section", { class: "group" }, h("h3", {}, "File đã xuất"), renders),
      ];
    },
  };

  function badges() {
    const counts = {
      ai: ctx.state.requests.filter((r) => r.status === "waiting_user").length,
      voice: (ctx.state.m?.lines ?? []).filter((l) => l.gate === "stale").length,
    };
    for (const [id, { b, count, label }] of buttons) {
      const n = counts[id] ?? 0;
      count.hidden = !n;
      count.textContent = n > 99 ? "99+" : String(n);
      if (n) b.setAttribute("aria-label", `${label}, ${n} việc chờ bạn`); else b.removeAttribute("aria-label");
    }
  }

  function render() {
    const t = TABS.find((x) => x.id === tab);
    for (const [id, { b }] of buttons) {
      const on = id === tab;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    }
    panelEl.setAttribute("aria-labelledby", `tab-${tab}`);
    const head = h("header", { class: "panel-head" }, h("h2", {}, t.label), h("p", {}, t.lead));
    panelEl.replaceChildren(head, ...views[tab]().filter(Boolean));
    badges();
  }

  function select(id, focus = false) {
    if (!IDS.includes(id)) return;
    if (id !== tab) {
      tab = id;
      try { localStorage.setItem(STORE, id); } catch { /* storage blocked: the URL still keeps it */ }
      const url = new URL(location.href);
      url.searchParams.set("tab", id);
      history.replaceState(null, "", url);
      render();
      panelEl.scrollTop = 0;
    }
    if (focus) buttons.get(id).b.focus();
  }

  railEl.addEventListener("click", (e) => { const b = e.target.closest(".rail-item"); if (b) select(b.dataset.tab); });
  railEl.addEventListener("keydown", (e) => {
    const i = IDS.indexOf(tab);
    const next = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: IDS.length - 1 }[e.key];
    if (next == null) return;
    e.preventDefault();
    select(IDS[(next + IDS.length) % IDS.length], true);
  });
  // e.code, not e.key: on macOS Alt+digit types a symbol (Alt+1 → "¡").
  document.addEventListener("keydown", (e) => {
    if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const m = /^Digit([1-6])$/.exec(e.code);
    if (!m) return;
    e.preventDefault();
    select(IDS[Number(m[1]) - 1], true);
  });

  ctx.on("project", render);
  // Manifest-driven panels follow new versions, unless the user is typing in the panel.
  const typing = () => panelEl.contains(document.activeElement) && document.activeElement.matches("textarea, input[type=text], input[type=search]");
  ctx.on("manifest", () => { if ((tab === "voice" || tab === "music") && !typing()) render(); else badges(); });
  ctx.on("requests", () => { if (tab === "ai" && !typing()) render(); else badges(); });
  // A log line only extends its <pre>; start and exit redraw the panel (export list included).
  ctx.on("jobs", (e) => {
    if (tab !== "output") return;
    const pre = e?.type === "log" ? logEls.get(e.job.id) : null;
    if (pre) { pre.textContent += (pre.textContent ? "\n" : "") + e.line; pre.scrollTop = pre.scrollHeight; }
    else if (!typing()) render();
  });
  render();
  return { render, select };
}
