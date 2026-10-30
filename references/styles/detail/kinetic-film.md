# Style: kinetic film (chữ nổ theo beat)

Phim chữ chạy theo beat nhạc 160–175 BPM: chữ khổng lồ đập vào mỗi beat, máy lia vụt giữa các câu, nền đổi màu theo cụm và không khung nào đứng yên trước thẻ logo. Chọn style này cho teaser, phim ra mắt và đoạn cắt mạng xã hội. Phương pháp viết chữ và xếp bảng beat nằm ở `references/kinetic-film.md`.

## Tokens

```css
--bg: #0b1020; --ink: #f3eee3; --accent: #ffc21a; --hot: #ff8a1f; --paper: #f3eee3; --paper-ink: #14120e;
```

`node $OV/scripts/styles.mjs css kinetic-film` in ra cùng khối này. Ba nền: `--bg` tối, `--accent` vàng, `--paper` sáng. Chữ theo nền: `--ink` trên nền tối, `--paper-ink` trên nền sáng và nền accent. `--hot` chỉ tô chữ quan trọng nhất của cụm.

## Fonts

**Archivo** variable (weight 800–900, width 62–125; đủ dấu tiếng Việt, OFL; tải từ Google Fonts vào `assets/fonts/` như Be Vietnam Pro trong `references/engine-selection.md`) cho chữ lớn; trục width là một phần của chuyển động. **Be Vietnam Pro** 600–700 cho caption và dòng tiếng Việt nhỏ, **JetBrains Mono** 500 cho nhãn và bộ đếm. Không dùng font thiếu dấu: thử mỗi font bằng chuỗi `Ánh nắng ơ ư đ ễ ạ ỹ` trong một snapshot.

## Layers (sau ra trước)

`#ground` (màu nền, đổi theo cụm) → `#cam` (wrapper camera: đẩy 4–6 %, nghiêng 0,5–1° mỗi block, lia, rung) → các cảnh → `#fx` (vạch tốc độ, vòng, chớp) → caption → `#flash`. Trong skeleton: `#bg` đổi thành `#ground`, `#cam` bọc `#stage` bên trong `#pulse`, `#fx` nằm ngay sau `#pulse`:

```html
<svg width="0" height="0" style="position:absolute"><filter id="smear"><feGaussianBlur id="smear-b" stdDeviation="0 0"/></filter></svg>
<div id="ground" class="layer"></div>
<div id="pulse" class="layer"><div id="cam" class="layer" style="perspective:1400px"><div id="stage" class="layer">…</div></div></div>
<div id="fx" class="layer"><i class="ring"></i><i class="bar"></i><i class="slash"></i><i class="shine"></i></div>
<!-- each big word sits in its own full-frame slot: <div id="s-no" class="slot layer"><div id="w-no" class="word">NỔ</div></div> -->
```

CSS cần có: `.word { display: inline-block; white-space: nowrap }` (để `fitWord` đo đúng bề rộng chữ, không phải khung chứa), `.ch { display: inline-block }` (để chữ cái rơi được) và mọi phần tử trong `#fx` ẩn sẵn (`position: absolute; opacity: 0`, `.bar` thêm `transform: scaleX(0)`), nếu không vạch chéo `.slash` hiện suốt phim. `fitWord` đo font đã tải: bọc phần dựng timeline trong một hàm và gọi nó sau `Promise.all([document.fonts.load('900 100px "Archivo"', "CHỮ"), …]).then(dung, dung)`, gán `window.__timelines["main"]` ở cuối hàm đó.

## Hàm dùng chung

Dán khối này sau phần `animation vocabulary` của skeleton (`templates/composition/index-skeleton.html`). Nó dùng `tl`, `$`, `$$`, `B`, `slam`, `settleCam` có sẵn. Tween trên phần tử chung (`#fx`, `#cam`) dùng `immediateRender: false`, như `flash`, để không hiện từ khung 0. Mọi cảnh nằm trong `#cam`, nên tween trên `#cam` di chuyển cả khung. Thời điểm luôn viết bằng `B(n)`; ở bản có giọng, làm tròn `W()` về beat gần nhất trước.

```js
const W_FRAME = document.documentElement.clientWidth || 1920;
// fitWord: measured once fonts are loaded; pass maxW = 0.88 * W_FRAME / peak, peak = the largest scale after landing
const fitWord = (el, maxW = 0.88 * W_FRAME) => {
  const e = typeof el === "string" ? $(el) : el, size = parseFloat(getComputedStyle(e).fontSize), w = e.getBoundingClientRect().width;
  const fit = w > maxW ? Math.floor((size * maxW) / w) : size; e.style.fontSize = `${fit}px`;
  if (fit < 200) console.warn(`[fitWord] ${e.textContent} ${fit}px: tách cụm`);
  return fit;
};
// splitChars: one .ch span per grapheme (NFC first, so a tone mark never gets its own span); add .ch-o by hand for xuyen-chu
const seg = new Intl.Segmenter("vi", { granularity: "grapheme" });
const splitChars = (el) => { el.innerHTML = Array.from(seg.segment(el.textContent.normalize("NFC")), (g) => g.segment).map((c) => (c === " " ? " " : `<span class="ch">${c}</span>`)).join(""); };
// drift: a landed word grows at `rate` per second (4-6 %/s; slower reads as still in qc-mp4), from scale `from`
const drift = (el, t0, t1, rate = 0.05, from = 1) => tl.fromTo(el, { scale: from }, { scale: from * (1 + Math.min(0.06, Math.max(0.04, rate)) * Math.max(0.1, t1 - t0)), duration: Math.max(0.1, t1 - t0), ease: "none", immediateRender: false }, t0);
// whip: the camera flies off-axis with a skew smear and a directional blur (#smear); alternate dir between "x" and "y"
const whip = (t, dir = "x", sign = 1, d = 0.22, skew = dir === "x" ? "skewX" : "skewY") => {
  const sd = (v) => (dir === "x" ? `${v} 0` : `0 ${v}`);
  tl.set("#cam", { filter: "url(#smear)" }, t - d / 2).set("#cam", { filter: "none" }, t + d / 2);
  tl.fromTo("#smear-b", { attr: { stdDeviation: sd(0) } }, { attr: { stdDeviation: sd(60) }, duration: d / 2, ease: "expo.in", immediateRender: false }, t - d / 2);
  tl.fromTo("#smear-b", { attr: { stdDeviation: sd(60) } }, { attr: { stdDeviation: sd(0) }, duration: d / 2, ease: "expo.out", immediateRender: false }, t);
  tl.to("#cam", { [dir]: -1800 * sign, [skew]: 20 * sign, duration: d / 2, ease: "expo.in" }, t - d / 2);
  tl.fromTo("#cam", { [dir]: 1800 * sign, [skew]: -20 * sign }, { [dir]: 0, [skew]: 0, duration: d / 2, ease: "expo.out", immediateRender: false }, t);
};
// flipGround: hard ground change on a downbeat; type follows the ground
const INK_ON = { "var(--bg)": "var(--ink)", "var(--accent)": "var(--paper-ink)", "var(--paper)": "var(--paper-ink)" };
const flipGround = (t, color) => tl.set("#ground", { backgroundColor: color }, t).set("#cam", { color: INK_ON[color] || "var(--ink)" }, t);
// kick: the next word knocks the old slot off-axis on the beat, then it is gone (words never pile up)
const kick = (slot, t, sign = 1) => tl.to(slot, { xPercent: 130 * sign, rotation: 14 * sign, duration: 0.14, ease: "expo.in", immediateRender: false }, t - 0.1).set(slot, { autoAlpha: 0 }, t + 0.04);
```

## Công thức

### `chu-dap`

Một chữ đập vào giữa khung bằng `slam`, các chữ cái rơi lần lượt, sau đó trôi 4–6 %/s tới khi rời khung. Biến thể xếp chồng: chữ nhỏ ở trên đáp trước, chữ lớn đập sau nửa beat. Beat danh nghĩa: 1 mỗi chữ.

```js
const chuDap = (sel, slot, n, len = 1, kicker, { peak = 1.1, drop = -120, rate = 0.05, hook = false } = {}) => {
  const el = $(sel);
  splitChars(el), fitWord(el, (0.88 * W_FRAME) / peak);
  tl.set(slot, { autoAlpha: 1 }, Math.max(0, B(n) - 0.22));
  if (kicker) slam(kicker, B(n), { soft: true, d: 0.1 });
  const at = B(kicker ? n + 0.5 : n), chars = $$(".ch", el);
  if (hook) bump(el, at, { s: 1.06 }); // the hook shows from frame 0, so it gets no slam
  else slam(el, at), tl.set(chars, { yPercent: drop }, Math.max(0, at - 0.22));
  if (!hook) tl.fromTo(chars, { yPercent: drop }, { yPercent: 0, duration: 0.18, ease: "expo.out", stagger: 0.02, immediateRender: false }, at);
  shake("#cam", at, { amp: 10, n: 5, seed: 7 + Math.round(n * 2) });
  drift(slot, at, B(n + len), rate); // on the slot, so it never fights slam's scale on the word
  kick(slot, B(n + len), n % 2 ? -1 : 1);
};
chuDap("#w-dung", "#s-dung", 0, 4); // kicker variant: chuDap("#w-video", "#s-video", 4, 4, "#k-mot")
```

Chữ hook ở beat 0 phải thấy từ khung 0: để slot và chữ hiện sẵn trong CSS và gọi với `{ hook: true }`, vì `slam` luôn bắt đầu từ alpha 0. Kiểm: ảnh tĩnh ở `B(n) + 0.3` cho thấy chữ đã đáp, ở `B(n + len) + 0.1` chữ đã đi; `qc-mp4` không có hold > 0,6 s trong khoảng `B(n)`…`B(n + len)`.

### `chuoi-cat`

Chuỗi cú cắt tăng tốc 1, 1, 1, ½, ½, ¼ beat rồi chớp trắng; mỗi cú đổi nền. Dùng ngay trước drop. Beat danh nghĩa: 4–6. Tổng `steps` phải bằng số beat từ `n0` tới drop, để chớp trắng rơi đúng drop.

```js
const chuoiCat = (words, n0, steps = [1, 1, 1, 0.5, 0.5, 0.25]) => {
  const grounds = ["var(--bg)", "var(--accent)", "var(--paper)"];
  let n = n0;
  words.forEach((sel, i) => {
    const step = steps[Math.min(i, steps.length - 1)];
    flipGround(B(n), grounds[i % 3]);
    tl.set(sel, { autoAlpha: 1, scale: 1 }, B(n));
    tl.to(sel, { scale: 1.06, duration: step * T.beatLen, ease: "none" }, B(n));
    tl.set(sel, { autoAlpha: 0 }, B(n + step));
    n += step;
  });
  flash(B(n), 0.9);
  return n; // the drop beat
};
chuoiCat(["#c1", "#c2", "#c3", "#c4", "#c5", "#c6"], 22, [1.5, 1.5, 1, 1, 0.5, 0.5]); // 6 beats, drop at 28
```

Kiểm: ảnh tĩnh ở mỗi `B(n)` của chuỗi có nền khác ảnh trước; khung ở beat trả về là chớp trắng.

### `gach-bo`

"KHÔNG" đập ở +1 beat; chữ viền (outline) được tô đầy ở +1,5 beat; hình mô phỏng thứ cũ (một thanh timeline, một lưới ô) vỡ hoặc tắt ở +2 beat; kết bằng tắt kiểu TV, ép thành vạch rồi thành điểm. Beat danh nghĩa: 3–4 mỗi mục. Cảnh dài hơn 4 beat thì giãn mốc (vỡ ở +3, vạch gạch ngang ở +4, tắt TV kết ở +6) và để `drift` chạy trên slot suốt cảnh, nếu không đoạn sau cú vỡ đứng yên quá 0,6 s.

```js
const gachBo = (n, no, word, mock) => {
  tl.set(mock, { autoAlpha: 1 }, B(n));
  drift(mock, B(n), B(n + 2));
  slam(no, B(n + 1));
  tl.fromTo(word, { color: "transparent", webkitTextStroke: "4px currentColor" }, { color: "var(--hot)", duration: 0.12, ease: "none" }, B(n + 1.5));
  const r = rng(n); tl.to($$(".cell", $(mock)), { y: () => 200 + r() * 200, rotation: () => (r() - 0.5) * 60, autoAlpha: 0, duration: 0.3, ease: "power2.in", stagger: 0.015 }, B(n + 2));
  // TV switch-off: squash to a line, then to a point
  tl.to(`${no}, ${word}`, { scaleY: 0.02, duration: 0.12, ease: "expo.in" }, B(n + 3) - 0.24).to(`${no}, ${word}`, { scaleX: 0, duration: 0.12, ease: "expo.in" }, B(n + 3) - 0.12);
};
gachBo(8, "#no", "#w-timeline", "#mock-timeline");
```

Độ lệch của từng ô lấy từ `rng(seed)`, không từ `Math.random`, để mọi lần render giống nhau. Kiểm: ảnh tĩnh ở `B(n + 2)` thấy chữ đã tô đầy; ở `B(n + 3) - 0.1` chỉ còn một vạch.

### `so-lon`

Một con số khổng lồ quay bằng `odo`, nhãn nhỏ JetBrains Mono, một vòng lan ra. Số phải do người dùng hoặc nguồn cung cấp, không bịa. Beat danh nghĩa: 3.

```js
const soLon = (n, sel, label) => {
  tl.set(sel, { autoAlpha: 1 }, B(n));
  odo(sel, B(n), { d: 2 * T.beatLen });
  bump(sel, B(n + 2), { s: 1.1 });
  tl.fromTo("#fx .ring", { scale: 0.2, autoAlpha: 0.9 }, { scale: 3, autoAlpha: 0, duration: 0.6, ease: "expo.out", immediateRender: false }, B(n + 2));
  typeIn(label, B(n + 1));
  drift(sel, B(n + 2) + 0.4, B(n + 3), 0.06); // after the bump
};
soLon(12, "#n-styles", "#n-label"); // <span class="odo" data-value="66"></span>
```

Kiểm: ảnh tĩnh ở `B(n + 2)` đọc đúng con số trong nguồn; vòng chỉ xuất hiện ở beat đó.

### `ten-noi`

Tên sản phẩm bay ra từ chiều sâu, 6–10 bản sao lệch làm khối nổi, quét sáng một lần; dòng phụ gõ bằng `typeIn`. Beat danh nghĩa: 6–8.

```js
const tenNoi = (n, sel, sub, depth = 8) => {
  const el = $(sel);
  fitWord(el);
  for (let i = 1; i <= depth; i++) {
    const c = Object.assign(el.cloneNode(true), { id: "", className: `${el.className} extrude` });
    gsap.set(c, { x: i * 3, y: i * 3, zIndex: -i, color: "var(--hot)", opacity: 1 - i / (depth + 2) }), el.parentNode.insertBefore(c, el);
  }
  tl.fromTo(el.parentNode, { z: -2400, autoAlpha: 0, transformPerspective: 1200 }, { z: 0, autoAlpha: 1, duration: T.beatLen, ease: "expo.out" }, B(n));
  tl.fromTo("#fx .shine", { xPercent: -120 }, { xPercent: 120, duration: 2 * T.beatLen, ease: "power2.inOut", immediateRender: false }, B(n + 2));
  typeIn(sub, B(n + 4));
  drift(el.parentNode, B(n + 1), B(n + 8), 0.05);
};
tenNoi(32, "#t-name", "#t-sub");
```

Kiểm: ảnh tĩnh ở `B(n + 1)` thấy khối nổi; dòng phụ đọc trọn ở `B(n + 6)`.

### `tranh-day`

Tranh phủ khung, tối đi bằng lớp tint 0,25–0,4; máy đẩy và lia; mỗi chữ đè lên là một cú punch-in, có một cú cắt cận vào chi tiết trên beat. Tranh rộng ít nhất 2048 px. Beat danh nghĩa: 6–8.

```js
const tranhDay = (n, img, words, detail) => {
  tl.set(img, { autoAlpha: 1 }, B(n));
  tl.fromTo(img, { scale: 1.05, xPercent: -2 }, { scale: 1.12, xPercent: 2, duration: 6 * T.beatLen, ease: "none" }, B(n));
  tl.set(".tint", { opacity: 0.32 }, B(n));
  words.forEach((w, i) => {
    slam(w, B(n + 1 + i * 2), { soft: true });
    bump("#cam", B(n + 1 + i * 2), { s: 1.06 }); // punch-in
  });
  tl.set(img, { xPercent: detail.x, yPercent: detail.y }, B(n + 6)); // hard cut to a close-up detail
  drift(img, B(n + 6), B(n + 8), 0.06, 2.4);
};
tranhDay(40, "#pic", ["#p1", "#p2"], { x: -18, y: 10 });
```

Kiểm: chữ đọc được trên tranh ở mọi beat có chữ (tint đủ tối); ảnh tĩnh ở `B(n + 6)` là cú cận.

### `chuoi-diem`

Ba chữ đặt xa nhau trong một thế giới; máy chạy theo một sao chổi sáng từ điểm này sang điểm kia; mỗi điểm đáp kèm vòng; cuối cùng lùi ra thấy cả chuỗi. Beat danh nghĩa: 10–12.

```js
const chuoiDiem = (n, pts) => {
  // pts: [{ sel, x, y }] in world px inside #world; the camera centres on each in turn
  pts.forEach((p, i) => {
    const t = B(n + i * 3);
    tl.to("#world", { x: -p.x, y: -p.y, duration: 2 * T.beatLen, ease: "power3.inOut" }, t - 2 * T.beatLen);
    tl.to(".comet", { x: p.x, y: p.y, duration: 2 * T.beatLen, ease: "power3.inOut" }, t - 2 * T.beatLen);
    slam(p.sel, t);
    tl.fromTo("#fx .ring", { scale: 0.2, autoAlpha: 0.8 }, { scale: 2.5, autoAlpha: 0, duration: 0.5, ease: "expo.out", immediateRender: false }, t);
  });
  // pull back to show the whole chain
  tl.to("#world", { x: 0, y: 0, scale: 0.42, duration: 2 * T.beatLen, ease: "expo.inOut" }, B(n + 9));
  drift("#world", B(n + 11), B(n + 12), 0.05, 0.42);
};
chuoiDiem(48, [{ sel: "#d1", x: 0, y: 0 }, { sel: "#d2", x: 2600, y: -900 }, { sel: "#d3", x: 5200, y: 400 }]);
```

Kiểm: ảnh tĩnh ở `B(n)`, `B(n + 3)`, `B(n + 6)` mỗi ảnh có đúng một chữ ở giữa; ở `B(n + 11)` thấy cả ba.

### `xuyen-chu`

Máy lao vào lòng một chữ có lỗ (O, D, A, B, P, R, 0) cho tới khi lòng chữ thành khung tiếp theo. Beat danh nghĩa: 1.

```js
const xuyenChu = (n, letter, next) => {
  // transformOrigin = the counter's centre in layout px (offsets ignore tweened transforms)
  const el = $(letter);
  if (!el) throw new Error(`xuyen-chu: ${letter} not found (splitChars, then add .ch-o)`);
  let ox = el.offsetWidth / 2, oy = el.offsetHeight * 0.52;
  for (let e = el; e && e.id !== "cam"; e = e.offsetParent) { ox += e.offsetLeft; oy += e.offsetTop; }
  tl.to("#cam", { scale: 40, transformOrigin: `${ox}px ${oy}px`, duration: T.beatLen, ease: "expo.in" }, B(n) - T.beatLen);
  tl.set("#cam", { scale: 1, transformOrigin: "50% 50%" }, B(n));
  tl.fromTo(next, { autoAlpha: 1, scale: 0.6 }, { scale: 1, duration: 0.3, ease: "expo.out", immediateRender: false }, B(n));
};
xuyenChu(20, "#w-opus .ch-o", "#scene-next");
```

Kiểm: khung ngay trước `B(n)` toàn màu nền bên trong lòng chữ (không lộ mép chữ).

### `the-logo`

Gói trong 4 giây cuối (`tail_s: 4` của `motion_gate`). Vạch sáng, nét chéo và cú đánh trên beat 1; logo hiện từng phần; tagline mờ vào, chỗ duy nhất trong phim được fade; máy đẩy chậm và quét sáng tới hết. Nhạc dừng ở beat 1. Beat danh nghĩa: 8–10 (≤ 4 s ở 160 BPM).

```js
const theLogo = (n, logo, tagline) => {
  const end = T.duration;
  if (end - B(n) > 4) console.warn(`[the-logo] ${(end - B(n)).toFixed(2)} s > 4 s: phần trước 4 s cuối phải trôi ≥ 4 %/s`);
  flipGround(B(n), "var(--bg)");
  tl.fromTo("#fx .bar", { scaleX: 0 }, { scaleX: 1, duration: 0.12, ease: "expo.out", immediateRender: false }, B(n));
  tl.fromTo("#fx .slash", { xPercent: -150, autoAlpha: 0.85 }, { xPercent: 1700, duration: 0.25, ease: "expo.inOut", immediateRender: false }, B(n)).set("#fx .slash", { autoAlpha: 0 }, B(n) + 0.26);
  flash(B(n), 0.7);
  shake("#cam", B(n), { amp: 18 });
  tl.fromTo($$(".part", $(logo)), { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.3, ease: "back.out(2)", stagger: T.beatLen / 2 }, B(n + 1));
  tl.fromTo(tagline, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, ease: "power2.out" }, B(n + 4));
  settleCam("#cam", B(n), end, 0.03);
  tl.fromTo("#fx .shine", { xPercent: -120 }, { xPercent: 120, duration: end - B(n + 2), ease: "none", immediateRender: false }, B(n + 2));
};
theLogo(60, "#logo", "#tagline");
```

Kiểm: `T.duration - B(n) ≤ 4`; dòng `MOTION` của `qc-mp4` không tính đoạn này vào cổng; nhạc tắt đúng `B(n)` (xem dạng sóng trong `mix-balance.mjs`).

Trường hợp biên (chữ Việt dài, 9:16, hình AI, số liệu): `references/kinetic-film.md`.
