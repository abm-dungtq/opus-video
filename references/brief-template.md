# Brief template

Điền brief này vào `<project>/BRIEF.md` trước khi dựng. Thứ tự các khối lấy theo cấu trúc chung của những prompt Opus 5.5 hiệu quả nhất trong corpus (xem `pattern-library.md`). Chỉ hỏi người dùng các trường không suy ra được: chủ đề, aspect, thời lượng. Các trường còn lại tự đề xuất rồi ghi rõ là "đề xuất".

```markdown
---
workflow: <faceless-explainer | product-launch-video | music-to-video | motion-graphics | general-video>
engine: <hyperframes | remotion | raw-canvas>
engine_reason: <1 câu: vì sao chọn engine này>
aspect: <16:9 | 9:16 | both>
duration_s: <số giây>
fps: <30 | 60>
voice_id: eGSd0uV8dNQnZuEEX9lu
tts_model: eleven_v4
---

<inputs>
- Chủ đề / thông điệp chính: …
- Nguồn dữ liệu, số liệu (có link): …
- Tài sản người dùng cấp (logo, ảnh, footage, font): … (không có thì ghi "không")
</inputs>

<deliverables>
- MP4 <W×H>, <fps> fps, <duration_s> giây; nếu aspect = both thì có 2 file riêng (16x9, 9x16)
- Mã nguồn dựng được (project HyperFrames/Remotion/HTML)
- Quy trình bắt buộc: build → render → inspect → refine. Không dừng ở storyboard, ảnh tĩnh hay kế hoạch.
</deliverables>

<art_direction>
- Bảng màu (3–5 mã hex): nền #…, chữ #…, nhấn #…
- Font: 1 sans chính (vd. Be Vietnam Pro, Inter, Geist; phải có đủ dấu tiếng Việt) + tuỳ chọn 1 serif/mono
- Cảm giác: <2–4 tính từ>
- Banned: crossfade vô cớ, glow/bokeh trang trí, particle thừa, chữ chiếm quá nửa khung, thời gian chết > 1s, giao diện kiểu template
</art_direction>

<structure>
- BPM: <vd. 100–120> · tổng beat: <duration_s × BPM / 60>
- Storyboard (mỗi beat có 1 hành động):
  | Thời điểm | Voice-over | Hình / chữ trên hình | Chuyển động | SFX |
  | 0.00–3.00 | hook | … | … | whoosh |
</structure>

<audio>
- Lời đọc: lấy từ script-table.md (viet-pro), khoảng 2,5–3 từ/giây
- SFX cue: <thời điểm → mô tả tiếng Anh ngắn>
- Nhạc nền: <mood, BPM, không lời>, ducking dưới giọng (xem audio-pipeline.md)
</audio>

<qa>
Xem `qa-checklist.md`. Ghi kết quả vào `<project>/QA.md`.
</qa>
```

## Ví dụ: explainer 15 giây

```markdown
---
workflow: general-video
engine: hyperframes
engine_reason: explainer không footage, typography + sơ đồ đơn giản; dựng tay để giữ voice ElevenLabs tiếng Việt
aspect: both
duration_s: 15
fps: 30
voice_id: eGSd0uV8dNQnZuEEX9lu
tts_model: eleven_v4
---

<inputs>
- Chủ đề: Vì sao bầu trời màu xanh? (tán xạ Rayleigh)
- Nguồn: kiến thức vật lý phổ thông; không cần số liệu
- Tài sản: không
</inputs>

<deliverables>
- renders/sky-16x9.mp4 (1920×1080) và renders/sky-9x16.mp4 (1080×1920), 30 fps, 15 giây
- Project HyperFrames trong thư mục dự án
- build → render → inspect → refine
</deliverables>

<art_direction>
- Màu: nền #0B1B2B, chữ #F4F1EA, nhấn #4DA3FF, phụ #FFB347
- Font: Be Vietnam Pro 800 cho tiêu đề, 500 cho chữ phụ
- Cảm giác: trong trẻo, khoa học, gọn
- Banned: glow, particle trang trí, chữ chạy marquee
</art_direction>

<structure>
- BPM 100 → 25 beat
  | 0.0–3.0 | Hook: "Vì sao trời lại xanh?" | chữ lớn rơi vào khung, bầu trời gradient | mask reveal | whoosh |
  | 3.0–9.0 | Ánh sáng trắng gồm nhiều màu… | tia sáng tách phổ, chạm phân tử khí | line draw | soft click |
  | 9.0–13.0 | Màu xanh bị tán xạ mạnh nhất | sóng xanh dội khắp khung | scale + ripple | — |
  | 13.0–15.0 | Chốt + CTA | "Tán xạ Rayleigh" + follow | type-on | impact nhẹ |
</structure>

<audio>
- Lời đọc khoảng 40 từ (viet-pro)
- SFX: 0.2s whoosh, 3.2s soft click, 13.0s soft impact
- Nhạc nền: calm curious ambient, 100 BPM, instrumental
</audio>
```
