# Phương pháp biên tập (video thương hiệu / explainer không mặt)

Đọc trước khi viết STORYBOARD. Chép mục "Sàn chất lượng", "Chống slideshow" và "Kỷ luật GSAP" vào prompt cho frame worker.

**Dựng từ công thức, không dựng từ tính từ.** Trước khi viết HTML ở bước 6, chạy `node $OV/scripts/recipe-pack.mjs --project .` và đọc hết `build/RECIPES.md` (với frame worker: chép vào prompt). File này gom đúng các blueprint, rule và seam mà PLAN.md đã khai, kể cả khi đi đường dựng tay `general-video` (đường này không chạy `frame-packets.mjs` nên dễ biến từ khoá thành thẻ trượt lên/mờ dần). Cảnh mở đầu dựng tiếp từ styleframe người dùng đã chọn (`styleframe:` trong BRIEF.md).

## Chức năng câu → cách xử lý hình

| Câu đang làm gì | Lớp chính | Chuyển động | Gợi ý |
|---|---|---|---|
| Hook / câu hỏi | chữ lớn 1–2 dòng | lật token tại chỗ, gạch bỏ | blueprint `kinetic-type-beats` |
| Định vị thương hiệu | logo thật + 1 dòng định vị | logo đập vào, giữ yên | blueprint `logo-assemble-lockup` |
| Giải thích cơ chế | sơ đồ tự vẽ, từng bước | vẽ nét, camera lia | blueprint `spatial-pan-stations` |
| Con số | số lớn + nhãn ngắn | đếm lên khi lời đọc tới | blueprint `dataviz-countup` |
| Liệt kê / cấu trúc | 3–6 thẻ | lắp ráp theo stagger | blueprint `grid-card-assemble` |
| So sánh | hai cột / hai làn | hai bên chạy song song | blueprint `comparison-split` |
| Bằng chứng xã hội | ảnh thật, logo đối tác (có nhãn) | hiện theo hàng, giữ ≥ 1,4s | blueprint `grid-card-assemble` |
| CTA | nút + URL | chấm nở thành nút, nhấn, giữ ~1s | blueprint `cta-morph-press` |
| AI nhận lệnh, trả kết quả | khung lệnh + kết quả | gõ chữ, gửi, kết quả mọc ra từ khung | blueprint `prompt-type-submit-generate` |
| AI đang làm việc | bảng tiến trình | trạng thái chạy rồi tích xanh hàng loạt | blueprint `agent-progress-theater` |
| Chỉnh một thông số | bảng điều khiển + vật thể | kéo núm, vật thể đổi theo ngay | blueprint `panel-edit-live-sync` |
| Thao tác trên giao diện | UI thật + con trỏ | con trỏ rê, bấm, kéo có lực | blueprint `cursor-ui-demo` |
| Đi qua nhiều ý trong một thế giới | không gian rộng/3D | camera bay liên tục giữa các trạm | blueprint `camera-journey` |
| Từ chi tiết ra toàn cảnh | cận cảnh → toàn bộ | kéo lùi giảm tốc liên tục | blueprint `zoom-out-workspace-reveal` |
| Nhiều trạng thái của một thứ | một vật thể neo ở tâm | quanh nó đổi theme/nhãn theo beat | blueprint `fixed-anchor-cycle` |
| Lựa chọn bị gạt đi | băng chữ chạy | ý chính lao vào đẩy văng các lựa chọn | blueprint `ticker-takeover` |
| Quá tải → lời giải | nhiều mảnh vây quanh | lời giải ở tâm đẩy mọi thứ ra mép | blueprint `overwhelm-surround` |
| Hệ sinh thái / kết nối | các nút quanh một tâm | tia nối lần lượt bật sáng | blueprint `constellation-hub` |
| Sản phẩm trên thiết bị | khung thiết bị | màn hình đổi trạng thái trong khung | blueprint `device-surface-showcase` |
| Lời nói thành sản phẩm | bản chép lời cuộn | câu được chọn bung thành vật phẩm | blueprint `transcript-scroll-artifact-reveal` |
| Video chuyển sang chữ | khung video | video co lại nhường chỗ cho chữ chốt | blueprint `video-text-pivot` |
| Tiêu đề mở cảnh | chữ lớn | lộ ra sau mask | blueprint `titlecard-reveal` |
| Câu gõ ra từng chữ | dòng chữ | gõ từng ký tự theo lời | blueprint `typewriter-reveal` |

Một câu chỉ có một ý hình. Câu dài hai ý thì tách thành hai frame.

## Chống slideshow (bắt buộc với dự án có `direction:`)

1. **Không dồn hết lên đầu cảnh.** Đừng đặt toàn bộ phần tử của beat ở t=0 rồi đứng yên. Viết beat thành chuỗi thời điểm (vd. `0.0–1.2s` khung giãn → `1.2–2.8s` bước 1 tích xanh), phần tử lộ dần theo `words.json`, phần lớn rơi vào nửa sau của beat (faceless-explainer `motion-language.md`).
2. **Không exit-rồi-enter.** Cấm cảnh cũ mờ về 0 rồi cảnh mới mới hiện ("jump cut with a dip", `third_party/hyperframes-skills/hyperframes-animation/transitions/overview.md`). Hai cảnh chồng nhau trong seam đã khai ở cột "Nối sang beat sau".
3. **Bốn seam liền mạch** (`third_party/hyperframes-skills/faceless-explainer/references/cut-catalog.md`): `zoom-through` (phóng 1→1,2 + nhoè ~10px rồi cảnh sau từ 0,75→1), `inverse-zoom-through` (lùi 1→0,8, cảnh sau từ 1,25→1), `cut-the-curve` (hai ease `power4` đối xứng, cùng hướng, khớp vận tốc), `waterfall-cut` (từng từ rút đi, từng từ trào vào). Ngoài ra: morph tại chỗ (`card-morph-anchor`, `scale-swap-transition`), camera (`multi-phase-camera`, `viewport-change`), shader `@hyperframes/shader-transitions` (`domain-warp`, `gravitational-lens`, `whip-pan`, `sdf-iris`…), và `beat-cut` (cắt đúng downbeat kèm đảo cực màu). Từ vựng đầy đủ ở `creative-directions.md`.
4. **Mỗi beat có một chuyển động bậc cao** (morph kích thước/bo góc, camera, mask/clip-path, 3D, vẽ path, shader), không chỉ `opacity` + `y`. `video-lint` báo sớm `SLIDESHOW_MOTION`; `qc-mp4` MOTION chặn bản render đứng yên (≥60% khung gần như không đổi và không có cú chuyển động mạnh nào).
5. **Beat không lời là beat hình**: các đoạn `(nhạc)` trong PLAN.md phải tự kể bằng hình (morph, camera bay, chữ đập theo beat), không để khung trống chờ lời.

**Tiêu chuẩn chuyển động.** Cách làm từng chuyển động cho tới mức thành phẩm nằm ở `motion-craft.md`: mức hiệu ứng theo `energy:` (`em`, `vua`, `don-dap`), mười nguyên tắc mọi cảnh phải giữ, bộ kỹ thuật dùng các hàm của skeleton, bảng dấu hiệu nhìn ra là demo và danh sách kiểm từng cảnh. Đi qua danh sách đó trước khi render animatic, rồi đọc sheet từng cảnh trong `demo/scenes/` mà `make-demo.mjs --animatic` sinh ra.

## Sàn chất lượng

1. Mỗi nhịp có ≥ 2 lớp (nền có chất liệu + chủ thể + chi tiết phụ). Nền phẳng một màu mà chỉ có một dòng chữ là chưa đạt.
2. Không có nhịp chết ≥ 2s, trừ nhịp giữ hình có chủ đích ở CTA.
3. Chữ chốt hiện đúng lúc lời đọc nhắc tới (dùng `words.json`), không hiện sớm cả câu.
4. Viết tắt giữ chữ hoa (AI, ABM). Không dùng `text-transform: lowercase` với tiếng Việt.
5. Chữ phụ ≥ 0,022 × cạnh ngắn (~24px ở 1080). Tagline và slogan phải đọc được trên điện thoại.
6. Chuyển cảnh có blur/zoom (0,4–0,6s) thì cú nhấn đầu frame sau phải lùi tới hết đoạn mờ.
7. Không dựng giao diện hay sản phẩm giả để lấp khung.

## Có hình thật và không có hình thật

- Có tài sản thật (capture website, ảnh sự kiện, logo, screenshot) thì dùng nó, phủ màu tối cho chữ đọc được. Ảnh có thương hiệu bên thứ ba dễ bị hiểu là xác nhận thì bỏ, hoặc gắn nhãn rõ.
- Đoạn chỉ có quan điểm thì chọn **một** cách vẽ cho mỗi đoạn:
  - **Chữ thành cấu trúc:** từ khoá đóng vai vật thể (đẩy, chặn, xếp chồng).
  - **Một khung biến hình:** một hình duy nhất đổi dạng suốt đoạn, không cắt cảnh.
  - **Quy trình tick dần:** các bước lần lượt được điền hoặc đánh dấu theo lời.
  - **Mô phỏng thật:** tính số thật bằng JS rồi vẽ, thay cho sơ đồ minh hoạ.
  - **Poster chữ lớn:** 1–4 chữ chiếm khung, nhịp theo câu nói.
- Không lùi về "khung nhỏ + nền trống + thẻ nhỏ".

## Kỷ luật GSAP / render

- Phần tử xuất hiện sau thì dùng CSS `opacity:0` rồi `.set` hoặc `.to`. Hạn chế `.from`, vì khi seek nó lộ trạng thái sai.
- Nhiều `tl.fromTo` trên cùng một target: mọi lệnh trừ lệnh sớm nhất phải có `immediateRender:false`. Không chồng hai tween cùng thuộc tính của cùng một phần tử.
- Overlay toàn khung bắt đầu bằng `opacity:0` trong CSS.
- id không bắt đầu bằng chữ số (`hook01-x`, không phải `01-hook-x`). Mỗi clip có id và `data-track-index` riêng.
- Đường dẫn asset tính từ gốc project (`assets/...`), không dùng `../`.
- Chữ phụ trên nền sáng hoặc ảnh phải đạt contrast ≥ 4,5:1 (`#8A8178` của preset cartesian không đạt, dùng `#6F6860`).
- Bố cục ngang phải dàn lại cho khổ dọc, không kéo giãn.
- Sau assemble, so thời lượng index với tổng voice cộng phần giữ hình. Lệch > 0,15s mà không có chủ đích thì xem lại.

## Thời điểm luôn tính trên timeline gốc

Mọi thời điểm trong PLAN, `## Sự kiện`, DEMO và REVISIONS là giây trên timeline gốc. Thời điểm bên trong composition con ghi thành `<giây bắt đầu composition> + <giây bên trong>` rồi cộng ra giây gốc. Ví dụ composition con bắt đầu ở 12s và nút được nhấn ở giây 1.5 bên trong thì ghi `12 + 1.5 = 13.5s`.

## SFX thưa

- Chỉ đặt tiếng ở nhịp có nghĩa: vào cảnh, logo, con số dừng, nút nhấn. Không đặt cho mọi chuyển động.
- Tối đa 2 tiếng trong 3s. Mỗi frame thường chỉ cần 0–1 tiếng.
- Âm lượng thấp hơn giọng khoảng 11–16 dB. Không đặt tiếng mạnh trùng từ khoá đang đọc.
- Impact lùi khoảng +0,1s để trùng cú nảy; whoosh đặt sớm khoảng −0,08s trước điểm cắt.
