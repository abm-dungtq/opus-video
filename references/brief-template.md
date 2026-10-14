# Brief template

Điền brief này vào `<project>/BRIEF.md` trước khi dựng. Thứ tự các khối lấy theo cấu trúc chung của những prompt Opus 5.5 hiệu quả nhất trong corpus (xem `pattern-library.md`).

**Hỏi người dùng (bước 1):** chủ đề, aspect, thời lượng, tài sản thương hiệu (logo, màu, footage). Kỹ thuật dựng (engine, workflow, fps, BPM) agent tự đề xuất và ghi rõ là "đề xuất".

**Không tự đề xuất phong cách.** Phong cách, hình chủ đạo, hiệu ứng, chuyển cảnh và SFX do người dùng chọn **bằng mắt** ở bước 1b (`make-pitch.mjs`: 3 styleframe theo chủ đề). `make-pitch.mjs choose` ghi các trường `direction` … `styleframe` và mục `## creative_direction`; agent không gõ tay các trường này. Chỉ khi người dùng nói rõ là chạy không dừng thì mới dùng `choose --auto` (ghi `creative_selection: auto`). Dự án chỉ cắt footage, không dựng hình mới, có thể đặt `creative_override: <lý do ≥10 ký tự>` thay cho bước 1b.

```markdown
---
workflow: <faceless-explainer | product-launch-video | music-to-video | motion-graphics | general-video>
engine: <hyperframes | remotion | raw-canvas>
engine_reason: <1 câu: vì sao chọn engine này>
aspect: <16:9 | 9:16 | both>
duration_s: <số giây>
fps: <30 | 60>
language: vi
voice_source: <tts | clip>   # clip: lời nói lấy từ clip của người dùng, cổng viet-pro lint phụ đề + chữ trên hình
voice_id: eGSd0uV8dNQnZuEEX9lu
tts_model: eleven_v4
brief_version: 2   # dự án mới: bật cổng sáng tạo (bước 1b); dự án cũ không có dòng này
# ↓ make-pitch.mjs choose ghi (bước 1b); không gõ tay
direction: <A1..A8>
direction_swaps: <none | transition=lao-xuyen-tam; style=…>
energy: <em | vua | don-dap>
palette: <toi | sang | thuong-hieu>
word_budget: <số từ tối đa của toàn bộ lời đọc>
music_only_s: <số giây tối thiểu chỉ có nhạc và hình>
creative_selection: <user | auto>
styleframe: pitch/<n>-<slug>/index.html
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

## creative_direction
(make-pitch.mjs choose ghi mục này: hướng, style, blueprint/rule, chuyển cảnh, SFX, ngân sách lời, luật chống slideshow, styleframe mở đầu)

<art_direction>
- Bảng màu (3–5 mã hex) lấy theo style/preset của hướng đã chọn và `palette`: nền #…, chữ #…, nhấn #…
- Font: 1 sans chính có đủ dấu tiếng Việt (vd. Be Vietnam Pro) + tuỳ chọn 1 serif/mono
- Banned: thẻ trượt lên rồi mờ dần, cảnh cũ mờ hết rồi cảnh mới mới hiện (exit-then-enter), crossfade vô cớ, glow/bokeh trang trí, particle thừa, chữ/khung trang trí ở 4 góc, thời gian chết > 1s, giao diện kiểu template
</art_direction>

<structure>
- BPM: <vd. 100–128> · tổng beat: <duration_s × BPM / 60>
- Storyboard theo **hình** trước, lời gắn vào sau (mỗi beat có 1 hành động; có beat chỉ nhạc và hình):
  | Thời điểm | Voice-over | Hình (blueprint/rule) | Nối sang beat sau (seam) | SFX |
  | 0.00–1.50 | — | … | zoom-through | whoosh |
</structure>

<audio>
- Lời đọc: lấy từ script-table.md (viet-pro), không vượt `word_budget`
- SFX cue: <thời điểm → mô tả tiếng Anh ngắn>, ưu tiên bảng SFX của hướng đã chọn
- Nhạc nền: <mood, BPM, không lời>, ducking dưới giọng (xem audio-pipeline.md)
</audio>

<qa>
Xem `qa-checklist.md`. Ghi kết quả vào `<project>/QA.md`.
</qa>
```

## Ví dụ: explainer 15 giây (hướng A6, liền mạch)

```markdown
---
workflow: general-video
engine: hyperframes
engine_reason: explainer không footage; dựng tay để giữ voice ElevenLabs tiếng Việt, công thức lấy từ build/RECIPES.md
aspect: 9:16
duration_s: 15
fps: 30
voice_id: eGSd0uV8dNQnZuEEX9lu
tts_model: eleven_v4
brief_version: 2
direction: A6
direction_swaps: transition=lao-xuyen-tam
energy: vua
palette: sang
word_budget: 26
music_only_s: 2
creative_selection: user
styleframe: pitch/1-live-data-simulation/index.html
---

<inputs>
- Chủ đề: Vì sao bầu trời màu xanh? (tán xạ Rayleigh)
- Nguồn: kiến thức vật lý phổ thông; không cần số liệu
- Tài sản: không
</inputs>

<structure>
- BPM 110
  | 0.0–1.5 | — | một tia sáng trắng tự vẽ xuyên khung (svg-path-draw) | zoom-through vào tia sáng | whoosh |
  | 1.5–6.0 | "Ánh sáng trắng là cả dải màu…" | tia tách phổ ngay trên đường vừa vẽ (dataviz-countup, svg-path-draw) | zoom-through vào dải xanh | soft click |
  | 6.0–11.0 | "Màu xanh bị không khí hắt đi mạnh nhất" | vạch đọc quét dải phổ, cột xanh vọt cao nhất (chart-scrub-readout) | push-slide theo hướng tia | — |
  | 11.0–13.0 | — | các tia xanh tán khắp khung thành bầu trời (stat-bars-and-fills) | zoom-through ra ngoài | rising tone |
  | 13.0–15.0 | "Vì vậy trời màu xanh." | bầu trời giữ yên, chữ chốt khoá lại (counting-dynamic-scale) | — | soft impact |
</structure>

<audio>
- Lời đọc 20 từ (≤ word_budget 26), có 3,5 giây chỉ nhạc và hình
- SFX: 0.0s whoosh, 1.6s soft click, 11.0s rising tone, 13.0s soft impact
- Nhạc nền: calm curious ambient, 110 BPM, instrumental
</audio>
```
