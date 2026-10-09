# Phương pháp biên tập (video thương hiệu / explainer không mặt)

Đọc trước khi viết STORYBOARD. Chép mục 2 và 4 vào prompt cho frame worker.

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

Một câu chỉ có một ý hình. Câu dài hai ý thì tách thành hai frame.

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

## SFX thưa

- Chỉ đặt tiếng ở nhịp có nghĩa: vào cảnh, logo, con số dừng, nút nhấn. Không đặt cho mọi chuyển động.
- Tối đa 2 tiếng trong 3s. Mỗi frame thường chỉ cần 0–1 tiếng.
- Âm lượng thấp hơn giọng khoảng 11–16 dB. Không đặt tiếng mạnh trùng từ khoá đang đọc.
- Impact lùi khoảng +0,1s để trùng cú nảy; whoosh đặt sớm khoảng −0,08s trước điểm cắt.
