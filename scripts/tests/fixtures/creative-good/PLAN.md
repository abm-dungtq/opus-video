# PLAN: Gemini 4 Argon — 15 giây TikTok (smoke test hướng A2)

## Mục tiêu
Người xem TikTok thấy Gemini 4 Argon nhận một yêu cầu và trả kết quả ngay trước mắt. 15 giây, 9:16.

## Ý đồ sáng tạo
- Hướng: A2 — Gõ lệnh, máy bung kết quả tức thì (người dùng chọn phương án 1)
- Style: Data Drift, nền tối, vệt dữ liệu xanh tím
- Hình chủ đạo: một khung lệnh duy nhất (prompt-type-submit-generate)
- Hiệu ứng: discrete-text-sequence, agent-progress-theater, coordinate-target-zoom
- Chuyển cảnh: zoom-through, card-morph-anchor
- SFX: crisp mechanical keycap click, clean glass UI confirmation pop
- Luật chống slideshow: mọi beat mọc ra từ khung lệnh; camera đẩy vào kết quả thay vì đổi thẻ

## Cảnh
| # | Thời điểm | Lời đọc | Hình / hiệu ứng | Blueprint/Rule | Nối sang beat sau | Âm thanh |
|---|---|---|---|---|---|---|
| 1 | 0–2s | — | Khung lệnh gõ yêu cầu, nhấn gửi (styleframe 1) | prompt-type-submit-generate, discrete-text-sequence | card-morph-anchor | keycap click |
| 2 | 2–6s | "Đưa một yêu cầu, Argon tự chia việc." | Khung giãn thành bảng tiến trình, ba bước tích xanh | agent-progress-theater | zoom-through vào bước cuối | soft pop |
| 3 | 6–11s | "Kết quả bung ra ngay trong khung lệnh." | Bản kế hoạch mở ra, camera đẩy vào biểu đồ | coordinate-target-zoom, card-morph-anchor | zoom-through | whoosh |
| 4 | 11–13s | (nhạc) | Biểu đồ co lại thành logo Argon | card-morph-anchor | card-morph-anchor | sub impact |
| 5 | 13–15s | "Gemini 4 Argon." | Logo khoá giữa khung | cta-morph-press | — | glass pop |

## Âm thanh
Voice eleven_v4 tiếng Việt, 16 từ (≤ word_budget 30); nhạc nền synth 124 BPM −20 dB; SFX theo bảng trên.

## Engine
HyperFrames general-video 9:16, dựng từ build/RECIPES.md; cảnh 1 lấy từ pitch/1-prompt-live-artifact/index.html.

## Khung hình demo
- 1 — khung lệnh đang gõ, chữ không tràn
- 4 — bảng tiến trình có ba bước
- 8 — kết quả mở ra trong khung
- 12 — biểu đồ đang co thành logo
- 14 — logo khoá, ngoài vùng UI TikTok

## QA
check-viet-pro, check-preflight, video-lint, qc-mp4 (MOTION), judge.
