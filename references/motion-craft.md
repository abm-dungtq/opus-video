# Tiêu chuẩn chuyển động

Dựng video như một motion designer có kinh nghiệm đang giao bản thành phẩm cho một lần ra mắt thật. Đây không phải bản demo, bản nháp hay bản chạy thử template. Người xem phải cảm được chuyển động trước khi đọc chữ. Hướng (A1–A8) và style quyết định được dùng kiểu chuyển động nào; tài liệu này quy định làm kiểu đó tới mức nào.

Mọi kỹ thuật ở đây chạy trong khung `templates/composition/index-skeleton.html`: một timeline GSAP dừng sẵn, mốc lấy từ `window.TIMING`, ngẫu nhiên có seed qua `rng`. Mốc theo lời lấy bằng `W(sid, "cụm từ")` hoặc `WE(...)`, mốc theo phách lấy bằng `B(n)`. Không gõ tay số giây.

## 1. Mức hiệu ứng theo năng lượng

"Mức hiệu ứng" là lượng lấy đà, vượt đích, va chạm và chuyển động phụ trong một cảnh. Đọc `energy:` trong BRIEF trước (các giá trị nằm trong `data/directions.json`). Nếu hướng hoặc style đã chọn cấm một kỹ thuật, ví dụ "không rung" hay "mọi tween đều có ease, không nảy", thì luật đó luôn thắng bảng dưới.

| `energy` | Mức | Được dùng |
|---|---|---|
| `em` | 1–2 (điện ảnh, điềm tĩnh, cao cấp) | Không rung, không nảy, không elastic. Sức hút đến từ ease được chọn kỹ, các chuyển động gối lên nhau, chiều sâu parallax, vệt sáng quét, match-move và những khoảng đứng yên có chủ đích. |
| `vua` | 3 (sản phẩm, biên tập) | Vượt đích nhẹ (`back.out(1.4)`), smear trên giao diện, mỗi đoạn một cú va chạm ở drop (`slam(el, t, { soft: true })`), có chớp sáng nhưng không rung. |
| `don-dap` | 4–5 (vui nhộn, thể thao, sôi động) | Đủ bộ: `slam`, nén giãn, `shake`, khung smear, khung va chạm, hạt bung ra theo tiếng kick. |

## 2. Mười nguyên tắc mọi cảnh phải giữ

1. **Mỗi lúc chỉ một điểm nhìn.** Ở từng phách, quyết định mắt người xem đặt vào đâu và chỉ cho chuyển động những gì phục vụ điểm đó. Phần còn lại đứng yên hoặc trôi nhẹ.
2. **Không có khung chết.** Một lần giữ hình kéo dài ít nhất một phách để đọc, nhưng vẫn có chuyển động nhỏ: `settleCam` đẩy máy từ 1.00 lên 1.03–1.05, parallax trôi chậm hoặc vệt sáng quét qua. Trên màn hình không có gì đứng im hoàn toàn.
3. **Gối lên nhau, không xếp hàng.** Chuyển động sau bắt đầu khi chuyển động trước mới đi được 30–60% quãng lắng. Stagger dùng phân bố có ease (`stagger: { each: 0.05, from: "center", ease: "power1.in" }`), không dùng bước đều 0.1 s.
4. **Lấy đà, ra đòn, đi theo quán tính.** Chuyển động lớn lùi ngược 2–4 khung, vượt đích rồi mới lắng. Phần phụ (bóng, nhãn, icon, gạch chân) tới sau phần chính 2–4 khung và lắng muộn hơn.
5. **Ease có chủ đích.** Lối vào dùng `expo.out` hoặc `power4.out` (nhanh rồi lắng dài). Camera và thay đổi bố cục dùng `power3.inOut` hoặc `expo.inOut`. Lối ra dài khoảng 60% lối vào, dùng ease `.in`. Không bao giờ dùng `linear` (trừ đoạn giữ opacity và `settleCam`), cũng không để mặc định `power1`.
6. **Đi theo đường cong, không chạy trên ray.** Vật di chuyển theo đường cong: tween `x` và `y` bằng hai ease khác nhau (`x: expo.out`, `y: power2.inOut`), hoặc thêm một góc xoay nhỏ rồi trả về 0 khi chạm đích.
7. **Liền mạch qua điểm cắt.** Cảnh này trao chuyển động cho cảnh sau: một hình lớn dần thành nền cảnh sau, chủ thể co lại vào đúng chỗ của nó (match-move), hoặc hướng chuyển động giữ nguyên qua một cú whip. Mờ về không rồi dựng lại từ đầu chỉ là đường lùi, không phải mặc định (xem thêm mục "Chống slideshow" trong `edit-method.md`).
8. **Có chiều sâu.** Ít nhất ba lớp: nền (chậm nhất, có thể làm mờ và bake sẵn), nội dung ở giữa cộng một điểm nhấn tiền cảnh (hạt, bokeh, mảng kính, viền khung) chạy nhanh nhất. Tỉ lệ parallax khoảng 0.3 : 1 : 1.6.
9. **Nhịp là thứ được dựng.** Chuyển động lớn rơi vào phách mạnh và `TIMING.drops` (`B(n)`), chữ hiện đúng từ khoá được đọc (`W(sid, "từ")`), nhấn nhỏ rơi vào phách yếu. Đổi mật độ theo đoạn: dẫn vào êm, dồn lên, bùng ở drop, rồi thở. Ba cảnh liền nhau cùng một mức năng lượng sẽ trông như template.
10. **Đọc được.** Chữ đứng yên ít nhất 0.4 s + 0.06 s cho mỗi từ sau khi đã lắng. Không cho chuyển động chạy sau một dòng chữ khi người xem đang đọc nó.

## 3. Bộ kỹ thuật

Skeleton có sẵn `slam`, `smear`, `lineIn`, `settleCam`, `shake` bên cạnh `pop`, `rise`, `draw`, `slideX`, `flipIn`, `fadeOut`, `bump`, `typeIn`, `odo`, `splitWords`. Các kỹ thuật khác dựng bằng GSAP trên cùng một timeline `tl`.

| Kỹ thuật | Cách làm | Dùng cho |
|---|---|---|
| Đập vào (slam) | `slam(el, W(sid, "từ"))`: chữ rơi vào to và nhoè đúng lúc từ được đọc, nén 3 khung, lắng bằng elastic | số lớn, tiêu đề ở drop |
| Nén và giãn | lúc chạm đích `scaleX: 1.08, scaleY: 0.9` trong 2–3 khung, rồi `elastic.out(1, 0.5)`; giữ thể tích (x × y ≈ 1) | linh vật, huy hiệu, icon |
| Khung smear | `smear(el, t, { dx: -300 })`: nghiêng theo hướng chạy rồi trả về 0. Muốn vệt dài hơn thì thêm 2–3 bản sao `.ghost` ở opacity 0.35/0.2/0.1, mỗi bản trễ 1 khung | lối vào ngang nhanh, chuyển cảnh whip |
| Lộ chữ qua mask dòng | bọc mỗi dòng trong một khối `overflow: hidden`, tách từ bằng `splitWords`, rồi `lineIn(words, t)`: từng từ trồi lên từ dưới mask với góc xoay nhỏ trả về 0 | tiêu đề, chữ động |
| Từ khoá động | `bump(el, W(sid, "từ"), { s: 1.12 })` đúng lúc từ được đọc, đổi sang màu nhấn, letter-spacing siết từ 0.04em về -0.02em | nhấn một từ trong câu |
| Whip pan | sân khấu cũ đi `x: -W, skewX: 12` trong 0.22 s `expo.in`, sân khấu mới vào từ `+W` bằng `expo.out`, đặt trên phách; thêm một lớp vệt tốc độ dài 1 khung | đổi cảnh sôi động |
| Zoom xuyên | cảnh hiện tại phóng 1 → 2.4 và opacity về 0 trong 0.3 s `expo.in`, cùng lúc cảnh sau đi từ 0.85 → 1 | lộ chi tiết hoặc sản phẩm |
| Quét mảng màu | một khối màu nhấn quét ngang (`scaleX` 0 → 1 từ trái, rồi 1 → 0 sang phải), cảnh được đổi bên dưới ở điểm giữa | chuyển cảnh gọn, mang màu thương hiệu |
| Mở tròn (iris) | `clipPath: circle(0% at x y)` → `circle(150% ...)` bằng `expo.inOut` (tính vào giới hạn clip-path) | dồn sự chú ý vào một phần giao diện |
| Đẩy máy và đổi nét | bọc cảnh trong một nhóm camera; `settleCam` trong lúc giữ hình; đổi nét bằng cách hoán `filter: blur()` giữa hai lớp đã bake trong 0.4 s | giữ hình cao cấp, chiều sâu |
| Khung va chạm | lớp `#flash` lên 0.6–0.9 trong 1 khung, rồi `shake` tắt dần trong 6 khung, có thể thêm tách RGB 2 khung | drop, cú lộ lớn (chỉ `don-dap`) |
| Vệt sáng | một thanh gradient trắng nghiêng chạy qua thẻ, nằm trong mask của thẻ, 0.6 s `power2.inOut`, opacity ≤ 0.35 | thẻ cao cấp, ánh trên sản phẩm |
| Hạt bung | 8–16 chấm dựng sẵn, góc và quãng lấy từ `rng`, bay ra bằng `expo.out`, mờ muộn, `y` hơi rơi xuống | nhấn nút, mở khoá, thành tích |
| Bộ đếm | `odo` với `power3.out` để chậm dần vào giá trị, rồi `bump(el, t, { s: 1.06 })` và chớp màu nhấn ở chữ số cuối | số liệu |
| Biểu đồ mọc | cột mọc bằng `back.out(1.3)`, stagger từ cột cao nhất; đường kẻ dùng `draw` kèm một chấm chạy ở đầu nét | cảnh dữ liệu |
| Biên đạo giao diện | con trỏ đi theo đường cong rồi chậm dần, cú nhấn là `scale: 0.96` trong 3 khung kèm gợn sóng, các panel đổ xuống gối lên nhau, kết quả chạm đích với vượt đích nhẹ | demo sản phẩm |

Luật khi dùng bộ kỹ thuật:

- Hiệu ứng nặng (`filter`, `clip-path`, gradient lớn) theo giới hạn của renderer: chỉ gắn khi đang chạy và đặt lại `none` khi xong, như `slam` và `typeIn` đã làm.
- Bản sao `.ghost`, hạt và lớp quét phải có sẵn trong DOM trước tween đầu tiên. Script chỉ lên lịch tween cho chúng, không tạo phần tử giữa chừng.
- Kỹ thuật bị hướng hoặc style cấm thì không dùng, dù nó làm cảnh "đã" hơn. Khi style cho sẵn thông số của một kỹ thuật (mức zoom, hướng quét) thì dùng thông số của style.
- Mask dòng, cuộn số và mask vệt sáng gắn `data-layout-allow-overflow`, nếu không `check` sẽ báo phần bị cắt là lỗi.

## 4. Dấu hiệu nhìn ra là demo và cách thay

| Dấu hiệu demo | Cách làm của bản thành phẩm |
|---|---|
| Mọi thứ chỉ hiện ra bằng opacity | Mỗi phần tử có một động từ vào cảnh riêng: trồi lên từ mask, đập vào, smear, vẽ nét, mọc từ điểm neo |
| Cùng một thời lượng và một ease ở mọi chỗ | Thời lượng đổi theo khối lượng và quãng đường; chi tiết giao diện nhỏ chạy nhanh hơn panel lớn |
| Mọi phần tử bắt đầu cùng lúc | Biên đạo gối lên nhau, có một phần tử dẫn đầu rõ ràng |
| Chữ giữa khung trên nền phẳng, cảnh này nối cảnh kia | Bố cục có khung: lệch tâm, tương phản cỡ, nhiều lớp sâu, giao diện sản phẩm đặt trong ngữ cảnh |
| Cảnh nào cũng dựng một kiểu | Mỗi loại cảnh có biên đạo riêng; loại cảnh lặp lại thì theo cảnh mẫu đã duyệt |
| Cắt cứng rồi dựng lại từ khung trống | Chuyển cảnh mang chuyển động, hình hoặc màu sang cảnh sau |
| Chuyển động dừng sững ở cuối tween | Vượt đích rồi lắng, sau đó giữ chuyển động nhỏ tới lúc ra |
| Chữ giữ chỗ, viền mặc định, gradient có sẵn | Thông tin thật, thành phần được thiết kế, chất liệu bake sẵn |

## 5. Danh sách kiểm từng cảnh

Trước khi render animatic, đi qua từng cảnh với danh sách này và sửa chỗ chưa đạt:

- [ ] Điểm nhìn ở mỗi phách đều rõ. Khoảnh khắc chính rơi đúng từ khoá được đọc (`W`) hoặc đúng drop (`B`).
- [ ] Cảnh có đủ ba lớp sâu. Ít nhất một phần tử vẫn chuyển động trong lúc giữ hình.
- [ ] Mọi lối vào có lấy đà hoặc mask, mọi lần chạm đích có đi theo quán tính.
- [ ] Lối ra trao chuyển động cho cảnh sau (match-move, whip, quét mảng màu hoặc zoom xuyên), đúng seam đã khai ở cột "Nối sang beat sau".
- [ ] Chữ đọc được trong suốt thời gian giữ. Không có chuyển động nào chạy sau dòng chữ đang được đọc.
- [ ] Mức hiệu ứng khớp `energy:` trong BRIEF và không phạm luật cấm của hướng hoặc style.

## 6. Xem chuyển động mà không tốn công

Ảnh tĩnh che mất lỗi chuyển động, còn xem lại cả bản render thì tốn thời gian và ngữ cảnh. Cách rẻ hơn là render một bản nháp rồi đọc mỗi cảnh qua một contact sheet: một ảnh nhỏ cho mỗi cảnh, 18 khung rải đều suốt cảnh.

`make-demo.mjs --animatic` làm việc này sau khi render animatic. Với mỗi hàng trong bảng `## Cảnh` của PLAN.md, lệnh sinh `demo/scenes/sheet-s<#>.jpg` (bản 9:16 nằm ở `demo/9x16/scenes/`, khoá `scene_sheets_9x16:`) và ghi danh sách vào `DEMO.md` dưới khoá `scene_sheets:`. Cảnh ngắn hơn 0.5 s bị bỏ qua kèm một dòng WARN. Lệnh ffmpeg cho mỗi cảnh là:

```bash
ffmpeg -v error -y -ss <giây bắt đầu cảnh> -t <độ dài cảnh> -i demo/animatic.mp4 \
  -vf "fps=18/<độ dài cảnh>,scale=320:-1,tile=6x3" -frames:v 1 demo/scenes/sheet-s<#>.jpg
```

Một sheet cho thấy cả lối vào, các đoạn giữ, lối ra và chỗ trao sang cảnh sau. Nhìn vào đó biết được chuyển động có gối lên nhau không, có vượt đích rồi lắng không, có quãng nào chết không. Lối vào nhanh thì cắt thêm một sheet cho giây đầu của cảnh với `fps=18`. Xem sheet rồi sửa. Chỉ render lại khi biên đạo đã đổi.

Khi người dùng xin sửa, mục `Vị trí` trong `REVISIONS.md` ghi kèm sheet của cảnh đó, ví dụ `cảnh 3 (demo/scenes/sheet-s3.jpg)` (xem `revisions.md`).
