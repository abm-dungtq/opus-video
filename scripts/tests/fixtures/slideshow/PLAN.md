# Kế hoạch sản xuất video Gemini 4 Argon (15s TikTok 9:16)

## Mục tiêu
- Sản xuất video dọc TikTok `9:16` (`1080x1920`, `30fps`, `15s`) giới thiệu 3 tính năng công nghệ cốt lõi của `Gemini 4 Argon` bằng tiếng Việt.
- Giữ toàn bộ tiêu đề, đồ họa trung tâm và phụ đề khớp từng từ nằm gọn trong vùng an toàn TikTok (`y` từ `240px` đến `1500px`), tuyệt đối không có khung ngắm hay chữ trang trí ở 4 góc màn hình.

## Cảnh
| Cảnh | Thời gian | Lời đọc | Nội dung hiển thị |
|---|---|---|---|
| 01 | 0.0s - 4.9s | Gemini 4 Argon xử lý đồng thời mã nguồn, ảnh và âm thanh. | Lõi quang học Argon và 3 nút Đa phương thức (Mã nguồn, Hình ảnh, Âm thanh) |
| 02 | 4.9s - 8.5s | Đưa dự án vào, mô hình tự phân tích và sửa lỗi. | Thẻ phân tích kiến trúc dự án và tia quét tự động sửa lỗi mã nguồn |
| 03 | 8.5s - 11.8s | Từ lên kế hoạch đến kiểm thử, mọi bước tự động. | Chuỗi 3 khối tác tử tự động nối tiếp từ Lập kế hoạch, Thực thi đến Kiểm thử |
| 04 | 11.8s - 15.0s | Lưu video để thử ngay cho dự án. | Biểu tượng Gemini 4 Argon trung tâm và thẻ kêu gọi Lưu video để thử ngay |

## Âm thanh
- Giọng đọc: ElevenLabs `eleven_v4` (`eGSd0uV8dNQnZuEEX9lu`), tiếng Việt, tổng thời lượng lời thoại `13.60s` trên nền video `15.0s`, căn nhịp từng từ từ `assets/voice/01.mp3.words.json`..`04.mp3.words.json`.
- Nhạc nền: `assets/bgm/argon-tech-bgm.mp3` (nhạc điện tử công nghệ cao cấp, âm lượng `0.18` để giọng đọc rõ nét).
- Hiệu ứng âm thanh (SFX): 4 điểm nhấn chuyển cảnh (`assets/sfx/01-whoosh.mp3`, `02-scan.mp3`, `03-pulse.mp3`, `04-chime.mp3`) đặt ở âm lượng `0.25`.

## Engine
- Sử dụng `HyperFrames` (`index.html`, `1080x1920`, `30fps`, `duration: 15s`) kết hợp GSAP 3.12.5, đồ họa SVG vector sắc nét và Canvas 2D hạt ánh sáng nền.
- Font chữ nội bộ: `Be Vietnam Pro` (400, 500, 600, 700, 800) và `JetBrains Mono` (500, 700) nhúng trực tiếp từ `assets/fonts/` đảm bảo hiển thị hoàn hảo mọi dấu tiếng Việt.

## Khung hình demo
- 2.2s — Cảnh 01: Lõi quang học Gemini 4 Argon, 3 nút đa phương thức và phụ đề khớp từ trong vùng an toàn
- 6.6s — Cảnh 02: Thẻ phân tích cấu trúc dự án, tia quét sửa lỗi mã nguồn và tiêu đề tiếng Việt rõ dấu
- 10.2s — Cảnh 03: Chuỗi 3 khối tác tử tự động (Lập kế hoạch, Thực thi, Kiểm thử) phát sáng tuần tự
- 13.5s — Cảnh 04: Biểu tượng khóa thương hiệu Gemini 4 Argon và nút kêu gọi Lưu video để thử ngay

## QA
- Kiểm tra `check-viet-pro.mjs --stage script` và `--stage delivery` đạt `PASS`.
- Kiểm tra `hyperframes lint`, `hyperframes check`, và `video-lint.mjs` đạt `0 error`.
- Kiểm tra bằng mắt 4 khung hình demo trong `demo/` đảm bảo chữ tiếng Việt (`ử, ồ, ự, ể, ẫ`) đúng font `Be Vietnam Pro`, không tràn lề, không đè lên nhau và không có chi tiết thừa ở 4 góc.
- Kiểm tra bản xuất cuối `renders/gemini-4-argon-tiktok.mp4` qua `qc-mp4.mjs` và `judge.mjs`.
