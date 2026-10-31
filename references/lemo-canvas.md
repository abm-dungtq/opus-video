# Lớp lemo-canvas: phong cách lemo-opuscar dưới composition HyperFrames

[lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) (MIT) là thư viện phong cách phim viết bằng code. Mỗi phong cách có một engine vẽ: canvas 2D (thuỷ màu, in ấn…) hoặc three.js (sản phẩm thuỷ tinh…). opus-video lấy engine đó vẽ vào một canvas nằm dưới lớp DOM của composition. Timeline GSAP vẫn điều khiển mọi thứ, nên player, Motion Studio, `render-final.mjs`, cổng viet-pro và chữ tiếng Việt không đổi.

Dùng lớp này khi brief cần chất liệu mà GSAP và DOM không làm được: nét cọ tự vẽ, giấy, sản phẩm thuỷ tinh có khúc xạ và tán sắc. Phần còn lại vẫn theo `engine-selection.md` mục 1. Trong `BRIEF.md` giữ `engine: hyperframes` và thêm `lemo_style: <slug>`.

## Phong cách có sẵn

| Slug | Profile (`styles.mjs`) | Loại | Trạng thái |
|---|---|---|---|
| `watercolor` | `lemo-watercolor` (Thuỷ màu tự vẽ) | 2D canvas | đã kiểm |
| `glass-product` | `lemo-glass-product` (Sản phẩm thuỷ tinh 3D) | three.js | đã kiểm |

Danh mục và commit lemo được ghim nằm trong `data/lemo/styles.json`. `node $OV/scripts/lemo.mjs list` liệt kê chúng.

## Chọn phong cách theo brief (`lemo-pick.mjs`)

Thư viện ở commit đã ghim có 59 phong cách; gallery: https://lemomo-ai.github.io/lemo-opuscar/. Bước 1b (`ov-direction`) dùng `lemo-pick.mjs` để gợi ý 2–3 phong cách:

```bash
node $OV/scripts/lemo-pick.mjs rank --brief-json BRIEF.case-query.json --limit 3 --stats
node $OV/scripts/lemo-pick.mjs choose --project . --style <slug> --search "<lemo_search>"
```

- `rank` đọc `styles/<slug>/style.json` (tên, nhóm, công dụng, câu tóm tắt phim mẫu) và phần mở đầu của `STYLE.md` (câu dẫn và mục 1). Có `TYPESAFE_API_KEY` thì Jev chấm từng phong cách từ 0 đến 4 trong một lượt: công dụng và giọng của phong cách có hợp mục đích, chủ đề, người xem của brief không, và hình của nó có chở được hình chủ đạo của brief không. Điểm bằng nhau thì xếp theo từ khoá. Không có key hay Jev lỗi thì xếp theo từ khoá: từ của brief có trong công dụng (×3), tên và nhóm (×2), câu phim mẫu và phần mở đầu `STYLE.md` (×1).
- `--library <dir>` đọc một bản thư viện khác, ví dụ cache của Motion Studio (`~/.cache/motion-studio/lemo-opuscar/<sha>`).
- `choose` ghi `lemo_style: <slug>` khi phong cách có lớp canvas (bảng trên), ghi `lemo_ref: <slug>` khi phong cách chỉ dựng theo ngữ pháp `STYLE.md`. `lemo_style` chỉ dành cho lớp canvas vì `make-pitch`, `lemo.mjs` và Motion Studio đọc nó theo nghĩa đó. Lệnh cũng ghi `lemo_search:` (`jev` hoặc `keyword (<lý do>)`) và thêm một dòng ghi công vào `assets/CREDITS.md`.

## Thêm lớp vào dự án

```bash
node $OV/scripts/lemo.mjs fetch                                   # một lần mỗi máy, cần mạng
node $OV/scripts/lemo.mjs add --project . --style watercolor
```

`fetch` lấy đúng những file danh mục cần từ commit đã ghim, cùng `style.json` và `STYLE.md` của mọi phong cách cho `lemo-pick.mjs` (tổng khoảng 2 MB) và gói three.js, rồi đặt chúng vào `~/.cache/opus-video/lemo-opuscar` (đổi chỗ bằng `LEMO_OPUSCAR_HOME`). Cache có sẵn thì lệnh chỉ kiểm commit, không reset.

`add` cần `index.html` có bốn dấu của skeleton (`composition.mjs init` từ v2.4.0 đã có sẵn):

- `<!-- LEMO-LAYER:BEGIN -->` và `<!-- LEMO-LAYER:END -->` trong `<div id="bg">`. Lệnh điền vào đây canvas, `<script>` của engine 2D, hoặc importmap cùng module của three.js.
- `/* LEMO:BEGIN */` và `/* LEMO:END */` sau khối `WINDOWS.forEach` của script timeline. Lệnh điền vào đây cầu nối.

Dự án cũ thiếu dấu thì `add` dừng với exit 3 và in chỗ cần chèn. Tự chèn bốn dấu rỗng đó rồi chạy lại.

Lệnh chép engine vào `assets/lemo/`, chép three.js vào `assets/three/` (với 3D), sinh `paper.jpg` (với thuỷ màu, cần Python có numpy và Pillow, chọn bằng `OV_PYTHON`), ghi `LICENSE-lemo-opuscar`, `LICENSE-three` và `CREDITS` có commit. Cuối cùng nó tạo `assets/lemo/scene.js` (2D) hoặc `scene3d.js` (3D) từ mẫu, nhưng chỉ khi file đó chưa có. Chạy lại cần `--force`; scene của dự án không bao giờ bị ghi đè. `lemo.mjs remove --project .` gỡ lớp và giữ scene.

## Hợp đồng của scene

Cầu nối là một tween proxy trên timeline đang dừng. Mỗi lần player seek, nó gọi `window.lemoRender(t, win)`:

- `t` là giây tính từ đầu video.
- `win` là `{ s1: [đầu, cuối], s2: [...], … }`, lấy từ `WINDOWS` và `TIMING`, theo đúng thứ tự cảnh của PLAN.md.

Scene phải giữ năm luật sau.

1. **Hàm thuần của `t`.** Cùng `t` thì cùng hình, seek tới lui bao nhiêu lần cũng vậy. Không dùng `Math.random`, `performance.now` hay trạng thái tích luỹ giữa các khung.
2. **Mốc theo tỉ lệ shot.** Viết `const at = (f) => a0 + (a1 - a0) * f` từ `win` rồi đặt mọi mốc bằng `at(0.3)`, không viết giây cứng. Kéo dài shot trong Motion Studio hay bằng `gateway.mjs patch resize_shot` thì tranh co giãn theo.
3. **Dựng một lần, vẽ mỗi khung.** 2D: mọi nét tạo một lần trong `withSeed(n, …)`; vật đã vẽ xong thì vẽ từ sprite cache, chỉ nét đang vẽ mới vẽ lại từng nét. 3D: tạo mesh và vật liệu một lần ở đầu module.
4. **Chữ ở lớp DOM.** Mọi chữ tiếng Việt (tiêu đề, ghi chú, phụ đề) là phần tử HTML dùng Be Vietnam Pro và qua cổng viet-pro. Canvas không vẽ chữ, vì font của lemo không có dấu tiếng Việt.
5. **Module 3D tải sau.** Module ES chạy sau script timeline. Cầu nối giữ `window.__lemoT` và `window.__lemoWin`, và cuối `scene3d.js` gọi `lemoRender` một lần với hai giá trị đó. Mẫu đã có sẵn dòng này, đừng xoá.

Với 3D, `setPixelRatio(2)` cùng `ssaa: 2` là mức giao hàng. Xem nháp nhanh thì hạ `ssaa` xuống 1 rồi trả lại trước khi render bản giao.

## Luật của lemo áp vào video người dùng

- Chủ đề là của người dùng. Đọc `STYLE.md` của phong cách (đường dẫn trong `CREDITS` và trong dòng `next:` của `add`) để lấy ngữ pháp hình ảnh, không lấy câu chuyện.
- Không chép câu chuyện, cảnh, nhân vật hay thẻ kết của phim demo. `DEMO.md` chỉ đọc sau khi đã có ý đồ riêng.
- Với `glass-product`, vật thể phải là vật hư cấu: không dùng dáng sản phẩm, logo hay giao diện có thật.
- Giữ `LICENSE-lemo-opuscar`, `LICENSE-three` và `CREDITS` trong `assets/`.

## Thước MOTION với phong cách chậm hoặc in theo nhịp hai khung

`qc-mp4` MOTION (và `check-preflight` khi đo animatic) so hai khung liền nhau ở bề ngang 360 px, 30 fps; khung có YDIF < 0,5 tính là đứng yên. Thước này bắt slideshow, nhưng hai ngữ pháp lemo bị nó phạt dù hình vẫn sống:

- **Risograph và các phong cách in bản:** ngữ pháp là đổi theo nhịp hai khung (một bản in giữ hai khung rồi mới lệch). Ở 30 fps cứ mỗi khung thứ hai lặp lại khung trước, nên riêng nhịp này đã cho khoảng 50% khung đứng yên, vượt vạch WARN 45%. Đo trên animatic của bản thử bánh mì: 19% khung đứng yên khi so từng khung, 3% khi so cách hai khung.
- **Watercolor:** nét cọ loang chậm trên nền giấy sáng, mỗi khung đổi rất ít. Animatic đầu của bản thử cà phê phin có 88% khung gần như đứng yên; bản giao cuối vẫn 51% (WARN) sau khi đã thêm camera bốn chặng.

Cách qua mà không đổi thước:

1. **Chuyển động camera liên tục** trên lớp DOM bao cả canvas: dolly hoặc pan chậm, scale 1,00 → 1,04 suốt cảnh, parallax giữa giấy, lớp màu và chữ. Mỗi khung đều đổi một chút nên không còn khung đứng yên, và nét cọ vẫn chậm.
2. **Các bản in lệch nhau một khung** (risograph): đừng để mọi bản đổi cùng một khung. Bản vàng đổi ở khung chẵn, bản xanh ở khung lẻ, bản đỏ lệch thêm một khung nữa. Mắt vẫn thấy nhịp hai khung của từng bản, còn giữa hai khung liền nhau luôn có một bản đổi.
3. Hạt giấy, lưới chấm hay độ lệch bản thì cho trôi theo `t` thay vì đứng yên giữa hai beat.

Khi ngữ pháp đã đúng mà thước vẫn phạt, ghi vào frontmatter `BRIEF.md`:

```yaml
motion_override: step=2 | risograph in theo nhịp hai khung, mỗi bản in giữ hai khung
```

- `step=2` (hoặc `3`) cho MOTION so hai khung cách nhau 2 (hoặc 3) khung, đúng với hình vẽ theo nhịp hai hoặc ba khung. Slideshow vẫn đứng yên khi so cách hai khung, nên thước vẫn bắt được nó.
- `still=<tỉ lệ>` và `peak=<số>` chỉ dời vạch WARN, và chỉ tới vạch FAIL (với nhịp `vua`: still 0,45…0,6, peak 1,5…2,0). Vạch FAIL (≥ 60% đứng yên và đỉnh < 1,5) không bao giờ đổi, ngưỡng mặc định cũng không đổi.
- Lý do sau dấu `|` là bắt buộc (≥ 20 ký tự, không dùng `#`). Thiếu lý do hoặc giá trị ngoài khoảng thì override bị bỏ qua và dòng MOTION ghi rõ vì sao. Khi override có hiệu lực, lý do được in trong dòng MOTION của `QA.md`.
- Dùng override sau khi đã thử ba cách ở trên, không thay cho chúng. Watercolor gần như đứng yên thì cần camera chứ không cần override.

## Tốc độ và tính tất định

Số đo trên hai spike (MacBook, 10 giây, 300 khung, HyperFrames 0.8.144, 2026-10-20):

| | Thời gian render | Hai lần render |
|---|---|---|
| Skeleton GSAP thuần | khoảng 6,1 giây | giống nhau từng byte |
| `watercolor` (2D) | 7,5–7,8 giây, khoảng 1,3 lần | giống nhau từng byte |
| `glass-product` (3D, GPU) | 28,7–36,7 giây, khoảng 5 lần | PSNR trung bình 56,7 dB, thấp nhất 53,4 dB, mắt thường không thấy khác |
| `glass-product` (3D, `--no-browser-gpu`) | khoảng 30 phút | giống nhau từng byte; so với bản GPU PSNR khoảng 46 dB |

Vì vậy với 3D trên GPU, tiêu chí là PSNR từ 50 dB trở lên giữa hai lần render, không phải framemd5. SwiftShader (`--no-browser-gpu`) cho hai bản giống nhau từng byte nhưng quá chậm để dùng hằng ngày, và hình của nó lệch nhẹ so với bản GPU, nên đừng trộn khung của hai cách render trong một video.

## Khổ dọc

Canvas 2D lấy cỡ từ `data-width` và `data-height` của root, còn scene 3D đọc cỡ khi chạy. Tuy vậy scene vẫn được vẽ cho bố cục ngang. `reframe.mjs` in `WARN lemo` khi dự án có lớp này. Bản 9:16 cần scene riêng, và phải xem lại từng shot trước khi giao.

## Giấy phép và ghi công

lemo-opuscar là của LemoLab: mã và tài liệu phong cách theo MIT (`third_party/lemo-opuscar/LICENSE`), phim mẫu theo CC BY 4.0. `lemo.mjs add` chép `LICENSE-lemo-opuscar` và `CREDITS` vào `assets/lemo/`; `lemo-pick.mjs choose` thêm dòng ghi công vào `assets/CREDITS.md`. Dùng lại khung hay đoạn phim mẫu thì ghi công LemoLab và link phim theo CC BY 4.0.

## Thêm một phong cách lemo khác

1. Đọc mục "Engine reference" trong `DEMO.md` của phong cách đó, liệt kê các file engine mà scene cần (không lấy `main.js` hay `story.js` của demo).
2. Thêm một mục vào `data/lemo/styles.json` với `kind`, `files`, `guide` (và `paper` hoặc `three_addons` nếu cần), đặt `status: "untested"`, rồi chạy `lemo.mjs fetch`.
3. Viết profile `data/styles/lemo-<slug>.json` với `engine: "lemo-canvas"` và `lemo: { style, kind }` theo mục "Thêm một style" của `style-system.md`, rồi chạy `styles.mjs index --write` và `styles.mjs validate`.
4. Smoke: dự án tạm, `add`, viết scene, lint, check, snapshot, render hai lần và so. Đạt thì đổi `status` thành `verified`.
