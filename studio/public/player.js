// player.js — the composition in an iframe (studio/PLAYER.md): /p/<name>/<html> with the
// HyperFrames runtime injected by the server; control goes through window.__player. The playhead
// reads __player.getTime() (the GSAP timeline time stays at the seek point while playing).
import { fmt, h } from "/dom.js";

export function mountPlayer(ctx, el, { playBtn, timeEl }) {
  let frame = null, hf = null, raf = 0, w = 1920, ht = 1080, shown = null;

  const fit = () => {
    if (!frame) return;
    const s = Math.min(el.clientWidth / w, el.clientHeight / ht) || 1;
    frame.style.transform = `translate(${(el.clientWidth - w * s) / 2}px, ${(el.clientHeight - ht * s) / 2}px) scale(${s})`;
  };
  new ResizeObserver(fit).observe(el);

  const duration = () => hf?.getDuration?.() || ctx.state.m?.duration || 0;
  const show = (t) => { timeEl.textContent = `${fmt(t)} / ${fmt(duration())}`; ctx.emit("time", t); };
  const glyph = () => { playBtn.firstElementChild.className = `glyph ${hf?.isPlaying?.() ? "pause" : "play"}`; };
  const tick = () => { if (hf) show(hf.getTime()); glyph(); raf = requestAnimationFrame(tick); };

  function clear(text = "Chọn một dự án") {
    cancelAnimationFrame(raf);
    hf = null; frame = null; shown = null;
    el.replaceChildren(h("div", { class: "player-empty" }, text));
    show(0);
  }

  function load(m, keep = 0) {
    cancelAnimationFrame(raf);
    hf = null;
    w = m.width || 1920; ht = m.height || 1080;
    shown = `${ctx.state.name}:${m.version}`;
    const html = String(m.html || "index.html").split("/").map(encodeURIComponent).join("/");
    frame = h("iframe", { src: `/p/${encodeURIComponent(ctx.state.name)}/${html}?v=${m.version}`, width: w, height: ht, title: "Xem trước", style: { width: `${w}px`, height: `${ht}px` } });
    el.replaceChildren(frame);
    fit();
    const me = frame, t0 = Date.now();
    const wait = () => {
      if (frame !== me) return;
      const win = me.contentWindow;
      if (win?.__player && win.__playerReady) {
        hf = win.__player;
        if (keep) hf.seek(Math.min(keep, duration()));
        show(keep);
        tick();
        return;
      }
      if (Date.now() - t0 > 15000) { el.append(h("div", { class: "player-empty" }, "Không nạp được player (thiếu HyperFrames runtime?)")); return; }
      setTimeout(wait, 100);
    };
    me.addEventListener("load", wait);
  }

  function seek(t) { if (!hf) return; hf.seek(t); show(t); }

  playBtn.addEventListener("click", () => {
    if (!hf) return;
    if (hf.isPlaying()) hf.pause();
    else { if (hf.getTime() >= duration() - 0.05) hf.seek(0); hf.play(); }
    glyph();
  });

  // A new version may change index.html (timing markers): reload and return to the same time.
  let reloadTimer = 0;
  ctx.on("manifest", (m) => {
    if (!m) return clear();
    if (shown === `${ctx.state.name}:${m.version}`) return;
    const same = shown?.startsWith(`${ctx.state.name}:`);
    clearTimeout(reloadTimer);
    if (!same) return load(m);
    const keep = hf?.getTime?.() ?? 0;
    reloadTimer = setTimeout(() => load(m, keep), 250);
  });

  return { load, clear, seek };
}
