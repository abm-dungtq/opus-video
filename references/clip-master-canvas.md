# Nhánh clip làm trục + nền đồ hoạ dựng mới

Dùng khi người dùng gửi clip của chính họ (đi thực địa, giới thiệu nhà đất, quán, điểm du lịch, review tại chỗ) có sẵn lời nói, và muốn video đặt clip vào một khung nhỏ (PiP) trên nền đồ hoạ dựng mới: bản đồ khu vực, phối cảnh 2D/3D, sơ đồ mặt bằng. Hiệu ứng bám đúng từng chữ người nói (pin, tuyến đường, khoanh vùng, thẻ số liệu, key text, camera).

Khác `footage-lane.md`: nhánh đó cắt gọn talking-head; nhánh này giữ nguyên clip làm trục thời gian và dựng lớp nền mới. Clip cần cắt bớt thì cắt theo `footage-lane.md` trước, rồi quay lại đây với `cut.mp4`.

Đã chạy thật: video lô đất 72m² gần chợ Diên An (2026-10-13, 9:16, 60 giây). Mã nguồn tham chiếu: dự án `bds-ban-do-pip-9x16` trong workspace (`assets/fx/bds-fx.js`, `assets/fx/facts.js`, `assets/map/build-map.mjs`, `index.html`). Chưa đóng thành template; video thứ hai cùng dạng thì copy dự án đó làm khung rồi sửa.

## Nội dung là của người dùng

- **Không gắn nhãn rào đón lên hình**: "minh họa", "sơ đồ minh họa", "không đúng tỉ lệ", "ví dụ giả lập", "theo người đăng", "theo lời người nói", "video độc lập", dấu "~" trước số. Người dùng coi đây là nội dung thật của họ. `video-lint` báo `HEDGE_LABEL` là ERROR khi `voice_source: clip`.
- **Kỷ luật số liệu vẫn giữ**: số trên hình chỉ lấy từ lời nói hoặc chữ in sẵn trong clip, hoặc từ brief. Không tự tính khoảng cách trên sơ đồ vẽ tay, không thêm la bàn hay thước tỉ lệ khi không biết hướng và tỉ lệ thật. Nguồn của từng số ghi trong file dữ liệu (`facts.js`, trường `source`), không ghi trên hình.
- Lời người nói giữ nguyên ý. Phụ đề chỉ sửa chỗ máy nghe sai, không viết lại câu.

## BRIEF

Frontmatter phải có:

```yaml
---
aspect: 9:16
duration_s: 60.18      # = độ dài clip
language: vi
voice_source: clip     # cổng viet-pro lint phụ đề + chữ trên hình thay cho kịch bản TTS
---
```

## Quy trình

1. **Kiểm nguồn.** `ffprobe` clip: fps, kích thước, audio. Clip điện thoại VFR hoặc HDR 10-bit thì chuẩn hoá như bước 1 của `footage-lane.md`. Copy clip vào `assets/video/`.
2. **Chép lời.** `npx hyperframes transcribe <clip> -d . -e whisper -m large-v3 -l vi --json` (model `.en` không nhận tiếng Việt). Ra `transcript.json` (mảng từ có `start`/`end`).
3. **Bảng sửa lời nghe máy (người dùng duyệt).** Whisper hay nghe sai tên riêng và giọng địa phương. Ví dụ đã gặp: "Duyên An" → "Diên An", "an thương" → "an cư", "tiền ít" → "tiện ích", "tầm nơi" → "tận nơi", "còn ngay" → "cạnh ngay". Ghi `captions.fixes.json` với các khoá `fix`, `unclear`, `ranges`, rồi chạy:
   ```bash
   node $OV/scripts/captions-from-transcript.mjs --project . --global CAPTIONS --duration <độ dài clip>
   ```
   Lệnh này sinh `assets/fx/captions.js`, `script/captions.txt` và `captions.review.md`. Gửi bảng trong `captions.review.md` cho người dùng duyệt. Câu chưa nghe rõ thì đưa vào `unclear` (không có phụ đề), không đoán. Gom cụm tự động hay ra cụm một chữ; nếu script báo WARN thì chia cụm theo nghĩa bằng `ranges`.
4. **PLAN.md ngay sau bản chép lời**, trước dòng hiệu ứng đầu tiên. Bản chép lời chính là danh sách cảnh: mỗi ý người nói là một dòng trong bảng Cảnh, cột Hình ghi hiệu ứng bám vào chữ nào. Chạy `check-preflight --stage plan`.
5. **Dữ liệu và nền.** `facts.js` gồm điểm (pin), tuyến, lô, vùng, thẻ số liệu, mỗi mục có `source`. Nền vẽ tay sinh từ `facts.js` (`build-map.mjs` trong dự án tham chiếu) để vị trí trên nền và vị trí hiệu ứng luôn khớp. Bản đồ thật (MapLibre, ảnh vệ tinh) chỉ dùng làm ảnh tĩnh xuất sẵn, không tải trực tiếp lúc render.
6. **Hiệu ứng bám chữ.** Mỗi hiệu ứng nhận `(tl, t, opts)` với `t` là giây của từ trong `transcript.json`. Camera chuyển trước chữ khoảng 0,3–0,5 giây. Clip là `<video data-has-audio="true">` (không `muted`), root `data-duration` = độ dài clip.
7. **Chữ trên hình qua viet-pro.** Ghi mọi chuỗi hiện trên hình (nhãn pin, thẻ, key text, nhãn khung) vào `script/on-screen.txt`, mỗi dòng một chuỗi. Ghi biên bản `## viet_pro` (mode, files_read gồm SKILL.md và `review/*`, lint) rồi chạy `check-viet-pro --project .` cho tới khi PASS.
8. **SFX.** Mỗi hiệu ứng chính một tiếng (pop cho pin, whoosh cho camera và thẻ, sparkle cho tuyến, chime cho kết), âm lượng 0,2–0,4 dưới giọng gốc. Thường không cần nhạc nền vì clip đã có tiếng hiện trường.
9. **Demo và duyệt.** Người dùng thường muốn xem cả bản nháp hơn là từng khung. Render nháp (`--quality looks`), gửi bản nháp, rồi cắt khung demo từ chính file đó: `node $OV/scripts/make-demo.mjs --project . --from-video renders/<nháp>.mp4`. DEMO.md ghi `source:` là bản nháp; lời duyệt của người dùng ghi vào `approval:`.
10. **QA và giao.** `npx hyperframes lint`, `npm run check`, `video-lint` (gồm `HEDGE_LABEL`), `render-final.mjs`, rồi `CAPTIONS.md` (Facebook + TikTok) qua `check-viet-pro --stage delivery`.

## Bố cục 9:16 đã kiểm

| Lớp | Vị trí |
|---|---|
| Vùng nội dung an toàn | x 60–1020, y 230–1320 |
| Khung PiP (bo góc, clip đi đường) | x 60–490, y 555–1320 (430×765). Clip cảnh đường phố không cắt tròn được vì mất nhiều hình; khung tròn hợp với clip selfie |
| Tâm khung nhìn bản đồ | cột phải, sx ≈ 765–800 |
| Thẻ số liệu, key text | y ≈ 330, trên khung PiP |
| Dải phụ đề | y 1340–1540 |

## Bẫy đã gặp

- **Số chạy (count-up) cho số thật** làm hiện các số trung gian sai, ví dụ "67 m²" trước khi về 72. Số của tin đăng phải hiện ngay giá trị cuối; count-up chỉ để bật tuỳ chọn.
- **Lớp phủ màu toàn khung** che nhãn bản đồ và `hyperframes check` báo `text_occluded`. Đặt lớp tint trong lớp bản đồ, dưới nhãn; vignette ở lớp trên chỉ tối nhẹ ở góc.
- **Trôi chậm toàn bản đồ** (scale 1 → 1,04 suốt video) giúp khung không đứng im giữa các lần chuyển camera mà không lệch nhãn.
- **Contact sheet lớn** (`hyperframes snapshot`) cần thu nhỏ bằng ffmpeg (`scale=1400:-1`) trước khi agent đọc ảnh.
- **Tiến trình preview** của dự án khác có thể đang chạy. Chỉ dừng preview do chính mình mở.
