# Hệ style với 63 profile, chọn theo từng cảnh

Một video của opus-video có hai trục chọn độc lập:

| Trục | Quyết định | Nguồn | Ghi vào BRIEF |
|---|---|---|---|
| **Hướng** (A1–A8) | Cách kể bằng hình: khối biến hình, khung lệnh, máy quay lướt, bản đồ… Blueprint, rule, seam, luật chống slideshow | `data/directions.json`, `references/creative-directions.md` | `direction:` |
| **Style** (63 profile) | Giao diện: màu, chữ, bố cục, chất liệu, texture, camera, chuyển cảnh, nhịp, phản ứng theo beat, UI, sơ đồ, nhân vật, caption, âm thanh | `data/styles/<id>.json`, `data/styles/index.json` | `style_profile:` và `## style_layers` |

Cùng hướng A2 (gõ lệnh, máy bung kết quả) có thể mặc `precision-dark-product` (nền gần đen, viền mảnh) hoặc `terminal-ops` (cả khung là terminal). Đổi style không đổi cách kể; đổi hướng không đổi bảng màu.

Hai trục gặp nhau ở ba chỗ.

- Mỗi hướng có `styles_goi_y` (3–5 id) trong `data/directions.json`. `make-pitch.mjs init` lấy style gợi ý đầu tiên hợp nhịp cho mỗi styleframe, ba styleframe không trùng style nếu được.
- Seam giữa các beat vẫn do hướng quyết định. Cổng sáng tạo chặn `fade`, `cut`, `crossfade` dù style có liệt kê chúng; chuyển cảnh của style chỉ là chất liệu để dựng seam đó.
- Từ khoá `style` cũ của hướng (token HyperFrames như `Data Drift`, `Swiss Pulse`) cũng mang bảng màu. Khi đã có `style_profile`, profile thắng ở phần màu, chữ, chất liệu. Đổi cả hai cùng lúc thì `directions.mjs compat` cảnh báo hai nguồn bảng màu.

61 profile lấy từ ak-motion-video (AgentKit, MIT), đổi từ YAML sang JSON. Hai profile họ `lemo-opuscar` (`lemo-watercolor`, `lemo-glass-product`) chuyển từ hướng dẫn phong cách của lemo-opuscar (MIT). Nội dung kỹ thuật giữ tiếng Anh; mỗi profile có thêm `ten_vi` (tối đa 5 từ) và `mo_ta_vi` (một câu, tối đa 25 từ) để đưa cho người dùng. Tên thương hiệu chỉ nằm trong `aliases`. Video không mượn logo, font có bản quyền, linh vật, khẩu hiệu hay mã màu chính xác của thương hiệu. Video cũng không ngụ ý được thương hiệu bảo trợ.

## Agent đọc gì

Không đọc cả thư mục `data/styles/`. Đọc theo thứ tự:

1. `data/styles/index.json`: mỗi dòng một style (`id, ten_vi, name, family, aliases, energy, best_for, summary, mo_ta_vi, depth, engine`). Đủ để chọn. `engine` là `hyperframes` với hầu hết style; `lemo-canvas` nghĩa là hình vẽ bằng engine lemo trên một canvas dưới DOM.
2. Đúng một profile `data/styles/<id>.json` cho style nền, thêm một profile cho mỗi lớp mượn thật sự dùng.
3. `references/styles/detail/<id>.md` khi `depth` là `reference` (hiện có `glass-keynote`, `comic-multiverse`, `cinematic-product-launch`): token, lớp, thành phần và trường hợp biên từ một bản đã làm xong.
4. Style có `engine: lemo-canvas`: đọc thêm `references/lemo-canvas.md`. Profile có trường `lemo: { style, kind }` trỏ tới danh mục `data/lemo/styles.json`; `styles.mjs show` in lệnh `lemo.mjs add` cần chạy, và `resolve --project` cảnh báo khi `index.html` chưa có lớp đó.

Lệnh tra cứu:

```bash
node $OV/scripts/styles.mjs find "giống Apple"          # tối đa 5 dòng: id — ten_vi — điểm
node $OV/scripts/styles.mjs show glass-keynote           # tóm tắt một profile (--json để lấy cả profile)
node $OV/scripts/styles.mjs css glass-keynote            # :root { --bg: …; --ink: …; … }
node $OV/scripts/styles.mjs suggest --direction A6 --energy em
```

`find` khớp id trước, rồi alias, rồi từ trong `summary`, `mo_ta_vi`, `best_for`. Không phân biệt hoa thường, dấu, gạch nối; bỏ qua các chữ "style", "kiểu", "phong cách". Một tên khớp hai style ngang nhau, hoặc không khớp gì, thì báo các ứng viên cho người dùng chọn, không đoán.

## Năng lượng

Profile có `energy` từ 1 đến 5. opus-video dùng ba mức như `references/motion-craft.md`:

| `energy:` trong BRIEF | Năng lượng profile |
|---|---|
| `em` | 1–2 |
| `vua` | 3 |
| `don-dap` | 4–5 |

`styles.mjs suggest --energy` chỉ giữ style đúng mức. `directions.mjs compat --style-profile <id>` và `make-pitch.mjs choose --style-profile <id>` cảnh báo khi năng lượng profile lệch quá một bậc khỏi khoảng của mức đã chọn (ví dụ `em` với profile 4).

## 14 chiều

Bộ chiều đóng: profile nào cũng có đủ, lớp mượn chỉ được mượn trong bộ này.

| Chiều | Gồm |
|---|---|
| `palette` | chế độ (dark, light, mixed), token màu, luật dùng màu |
| `typography` | họ font và độ đậm, cỡ, giãn chữ, cách xử lý chữ |
| `layout` | lưới, khung, mật độ, chỗ đặt chủ thể và chữ |
| `material` | bề mặt: kính, giấy, kim loại, đất sét, phẳng, kèm viền và bóng |
| `texture` | hạt, halftone, vạch quét, nhiễu, lưới chuyển sắc (texture nặng nướng sẵn thành PNG) |
| `camera` | máy quay ảo: đẩy vào, thị sai, xoay quanh, đứng yên, rung tay |
| `transitions` | vốn chuyển cảnh vào và ra |
| `pacing` | dải BPM `[lo, hi]` và cách độ dài cảnh thay đổi theo đoạn |
| `beat_response` | thứ gì phản ứng theo phách và kick, mạnh tới đâu |
| `ui_choreography` | giao diện, thẻ, danh sách vào, đổi và ra thế nào |
| `diagrams` | luồng, đồ thị, biểu đồ, kiến trúc được vẽ và chạy ra sao |
| `character_motion` | linh vật, người, đồ vật: co giãn, bước, "on twos", hoặc không có |
| `captions` | kiểu phụ đề trong dải dưới theo luật vùng an toàn |
| `sound` | dòng nhạc, mật độ và tính chất SFX |

## Loại cảnh

Dùng trong `scene_types` của profile và để chọn cảnh cho lớp mượn. Ghi vào cột tuỳ chọn `Loại` của bảng `## Cảnh` trong PLAN.md:

`cover`, `hook`, `title`, `stats`, `feature`, `ui-demo`, `product-hero`, `spec`, `diagram`, `chart`, `terminal`, `code`, `comparison`, `timeline`, `montage`, `quote`, `testimonial`, `cta`, `outro`.

Ô để trống hoặc `—` là cảnh không có loại. Loại khác danh sách này là lỗi.

## Spec trong BRIEF

Style nền nằm ở frontmatter, do `make-pitch.mjs choose` ghi (hoặc `choose --style-profile <id|alias>` khi người dùng đổi):

```yaml
style_profile: cinematic-product-launch
```

Chỉ một style nền là đủ. Lớp mượn đặt trong mục `## style_layers`, là một mảng JSON trong code fence:

````markdown
## style_layers

```json
[
  { "style": "precision-dark-product", "dimensions": ["ui_choreography", "material"], "scenes": { "types": ["ui-demo"] } },
  { "style": "blueprint-engineering", "dimensions": ["diagrams", "texture"], "scenes": { "types": ["diagram"] } },
  { "style": "athletic-impact", "dimensions": ["transitions", "pacing", "typography"], "scenes": { "ids": ["s6"] } }
]
```
````

- `style`: id hoặc alias.
- `dimensions`: các chiều mượn, nằm trong 14 chiều ở trên.
- `scenes.ids` chọn cảnh theo id `s<#>` (cột `#` của `## Cảnh`); `scenes.types` chọn theo cột `Loại`. Bỏ `scenes` thì lớp áp cho cả video.
- `palette_mode`: `accent` (mặc định) hoặc `full`.

Khoá lạ, loại cảnh lạ hay `palette_mode` lạ đều là lỗi, không bị bỏ qua.

Thêm lớp chỉ khi người dùng nói rõ một nét style nền không có ("giao diện kiểu Linear", "sơ đồ như bản vẽ kỹ thuật", "đoạn kết kiểu Nike"). Gọi một style bằng tên ("kiểu truyện tranh", "giống Apple") là chỉ có style nền.

## 7 luật resolve

`styles.mjs resolve` áp các luật này theo đúng thứ tự, cùng đầu vào cho cùng kết quả:

1. Mỗi tên style quy về đúng một id: id trùng khớp, rồi alias, không phân biệt hoa thường. Tên khác là lỗi, kèm các id gần nhất.
2. Style nền cấp mọi chiều cho mọi cảnh.
3. Lớp áp theo thứ tự liệt kê. Ở mỗi cảnh lớp chọn, lớp chỉ thay các chiều nó nêu. Hai lớp cùng chạm một chiều của cùng một cảnh thì lớp sau thắng.
4. `palette` của lớp chỉ thêm màu nhấn lên `bg`/`ink` của nền, trừ khi lớp đặt `"palette_mode": "full"`.
5. `constraints` của style nền ràng buộc mọi cảnh; ràng buộc của lớp chỉ áp ở cảnh lớp chọn. Giá trị mượn mà phạm ràng buộc của nền thì giữ giá trị của nền và ghi vào PLAN. Lệnh cảnh báo khi giá trị mượn nhắc tới thứ nền liệt kê ở `avoid` (hoặc ràng buộc dạng "No …").
6. Lớp bất biến không bao giờ bị ghi đè: hợp đồng composition và tính tất định, khối `TIMING` và mốc theo lời, dải phụ đề và độ dễ đọc, mục tiêu mix, cổng sáng tạo (seam của hướng, luật chống slideshow), giới hạn của trình render.
7. Tối đa một style nền và bốn lớp. Hơn hai ngôn ngữ chuyển cảnh trong một video nhìn thành nhiễu; lệnh cảnh báo khi điều đó xảy ra.

## Lệnh resolve

```bash
node $OV/scripts/styles.mjs resolve --project .              # bảng, ràng buộc, rồi các dòng WARN
node $OV/scripts/styles.mjs resolve --project . --markdown   # khối dán vào PLAN.md "## Ý đồ sáng tạo"
node $OV/scripts/styles.mjs resolve --project . --json       # cho tool đọc máy
```

Lệnh đọc `style_profile:` và `## style_layers` của BRIEF.md, cảnh từ `## Cảnh` của PLAN.md. Chưa có PLAN.md thì cả video là một cảnh. Bảng chỉ hiện các chiều có ít nhất một cảnh khác nền; chiều không hiện thì lấy từ nền ở mọi cảnh.

Lệnh `check-preflight.mjs` chạy cùng phép resolve ở cả hai stage. Dự án sáng tạo (BRIEF có `direction:` hoặc `brief_version: 2`) có `style_profile:` sai hoặc `## style_layers` lỗi thì FAIL; dự án cũ chỉ WARN. Dự án sáng tạo thiếu `style_profile:` chỉ WARN.

## Dựng từ bảng đã resolve

- Khai báo token CSS một lần từ bảng màu nền (`styles.mjs css <id>`), rồi thêm màu nhấn của từng lớp. Có brand kit thì màu thương hiệu thắng bảng màu của style.
- Font của style phải có đủ dấu tiếng Việt; thiếu thì thay bằng Be Vietnam Pro.
- Nước đi đặc trưng của style dựng bằng các hàm có sẵn trong `index.html` khung (`W`, `WE`, `B`, `pop`, `rise`, `draw`…), không thêm CSS animation.
- Vòng lặp (nhún, trôi, yoyo) có số lần lặp hữu hạn theo độ dài cảnh; `repeat: -1` làm hỏng thời lượng timeline.
- Style nền có tài liệu chi tiết thì theo tài liệu đó ở những chỗ profile để ngỏ.

## Thêm một style

1. Chép một profile có sẵn thành `data/styles/<id>.json`. Id viết kebab-case, tả giao diện, không mang tên thương hiệu.
2. Điền đủ 14 chiều bằng giá trị dựng được: mã màu `#rrggbb` (`bg`, `ink`, `accent` bắt buộc là hex; token khác được dùng `rgba()`), font Google Fonts hoặc OFL, ease GSAP, thời lượng, cỡ pixel.
3. Viết `ten_vi` và `mo_ta_vi` cho người dùng; tên thương hiệu chỉ đặt trong `aliases`.
4. Chạy `node $OV/scripts/styles.mjs index --write` rồi `node $OV/scripts/styles.mjs validate`. Style vẽ bằng lớp lemo-canvas thêm `engine: "lemo-canvas"`, `lemo: { "style": <slug trong data/lemo/styles.json>, "kind": "2d" | "3d" }` và `family: "lemo-opuscar"`; validate kiểm slug và kind khớp danh mục. Xem `references/lemo-canvas.md` mục "Thêm một phong cách lemo khác".
5. Muốn hướng nào gợi ý style mới thì thêm id vào `styles_goi_y` của hướng đó, chạy `directions.mjs check` rồi `directions.mjs doc --write`.
