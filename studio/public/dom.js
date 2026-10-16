// dom.js — small DOM helpers shared by the Studio modules. Text always goes in as text nodes,
// never as HTML, so manifest strings and case prompts cannot inject markup.
const PROPS = new Set(["value", "checked", "disabled", "selected", "hidden"]);

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") Object.assign(el.style, v);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (PROPS.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

export const round1 = (x) => Math.round(x * 10) / 10;
export const px = (x) => `${x}px`;

// 0:11.8 — minutes and tenths of a second.
export function fmt(t) {
  const d = Math.max(0, Math.round((Number(t) || 0) * 10));
  return `${Math.floor(d / 600)}:${((d % 600) / 10).toFixed(1).padStart(4, "0")}`;
}
export const fmtS = (t) => `${round1(t).toFixed(1)}s`;

let timer = 0;
export function toast(msg, err = false) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `toast${err ? " err" : ""}`;
  el.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => (el.hidden = true), err ? 6000 : 3000);
}

export const isMedia = (p) => /\.(png|jpe?g|webp|gif|svg)$/i.test(p) ? "img" : /\.(mp4|mov|webm)$/i.test(p) ? "video" : null;

// Thumbnail for a project file served under /p/<name>/.
export function thumb(name, path) {
  const src = `/p/${encodeURIComponent(name)}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const kind = isMedia(path);
  if (kind === "img") return h("img", { src, alt: path, title: path, loading: "lazy" });
  if (kind === "video") return h("video", { src: `${src}#t=0.1`, title: path, muted: true, preload: "metadata", class: "file" });
  return h("div", { class: "file", title: path }, path.split("/").pop());
}
