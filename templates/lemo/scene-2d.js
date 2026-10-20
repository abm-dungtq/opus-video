// Starting scene for a lemo-opuscar 2D style (lemo.mjs add copied the engine next to this file:
// MIT, see LICENSE-lemo-opuscar and CREDITS). This file is the project's own: replace the sample
// strokes with the brief's subject. Read the style guide named in CREDITS before drawing, and do
// not copy the demo film's story, scenes or signature; the subject is the user's.
// Rules: make every stroke once under a fixed seed (withSeed), keep window.lemoRender(t, win) a
// pure function of t, time everything as a fraction of a shot (at(f)) so a resized shot stretches
// the painting, and keep all Vietnamese text in the DOM layer, never on this canvas.
(() => {
  const cv = document.getElementById('wc'), ctx = cv.getContext('2d');
  const GROUND = Math.round(cv.height * .78);

  const horizon = withSeed(2, () => mk(qcurve(90, GROUND, cv.width - 90, GROUND + 4, -6, 40), 5.2, INK2, { prof: 'even', nb: 5, a: .88, rough: .3 }));
  const tree = withSeed(1, () => gum(1.2));
  tree.spr = sprite(tree.S);

  // stroke list painted up to p; a finished list is drawn from its cached sprite
  const paint = (L, p, x, y, spr) => {
    if (p <= 0) return;
    ctx.setTransform(1, 0, 0, 1, x, y);
    if (p >= 1 && spr) ctx.drawImage(spr.cv, spr.x0, spr.y0); else drawList(ctx, L, p);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  // win = { <scene id>: [start, end] } from window.TIMING, in WINDOWS order
  window.lemoRender = (t, win) => {
    const [a0, a1] = Object.values(win)[0], at = (f) => a0 + (a1 - a0) * f;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, cv.width, cv.height);
    drawS(ctx, horizon, seg(t, at(.05), at(.35)));
    paint(tree.S, eio(seg(t, at(.3), at(.9))), cv.width * .4, GROUND + 6, tree.spr);
  };
})();
