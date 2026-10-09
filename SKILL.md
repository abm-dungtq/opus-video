---
name: opus-video
description: "Làm video với Claude Opus 5.5 từ brief, chủ đề hoặc kịch bản tiếng Việt: viết kịch bản bằng viet-pro, giọng đọc/SFX/nhạc nền ElevenLabs, dựng bằng HyperFrames (hoặc Remotion/Canvas tuỳ dự án), render 16:9 và 9:16, kiểm tra khung hình. Dùng khi người dùng muốn làm video, explainer, quảng cáo, motion graphics, music video hay video TikTok/Reels/YouTube."
---

# opus-video

Skill điều phối: biến một ý tưởng thành MP4 hoàn chỉnh. Skill này **không** tự render. Nó nối các skill có sẵn (`viet-pro`, `hyperframes` và các workflow con, `media-use`, `ak-remotion`) với script ElevenLabs của riêng nó, và áp dụng các mẫu chắt lọc từ 813 video làm bằng Opus 5.5.

Skill dir: `~/.claude/skills/opus-video` (bên dưới viết tắt là `$OV`).

## Thiết lập (mỗi phiên một lần)

```bash
node ~/.claude/skills/opus-video/scripts/eleven.mjs doctor
```

Kết quả đạt khi exit 0 và in ra `tier`, `tts model`, `voice`. Script tự đọc key từ `~/.config/opus-video/.env`.

- **Không** source, cat hay echo file `.env` trong shell, và không in key ra hội thoại.
- Nếu thiếu key, nhờ người dùng tạo file với 2 dòng `ELEVENLABS_API_KEY=...` và `OPUS_VIDEO_VOICE_ID=...` (chmod 600).
- Đổi giọng hoặc model theo dự án: dùng cờ `--voice` / `--model`, hoặc đặt `voice_id` / `tts_model` trong `BRIEF.md` rồi truyền vào lệnh.

Mặc định: voice `eGSd0uV8dNQnZuEEX9lu`, TTS `eleven_v4` (có tiếng Việt), music `music_v2_5`, SFX `eleven_text_to_sound_v2`.

## Quy trình 8 bước

Mỗi dự án có một thư mục riêng:

```
<project>/
  BRIEF.md  STORYBOARD.md  script-table.md  QA.md
  script/01.txt …          # lời đọc theo cảnh
  assets/voice/ assets/sfx/ assets/bgm/ assets/CREDITS.md
  renders/
```

1. **Brief.** Điền theo `references/brief-template.md` vào `BRIEF.md`. Chỉ hỏi người dùng những gì không suy ra được (chủ đề, `aspect` 16:9 / 9:16 / both, thời lượng). Các trường khác tự đề xuất.

2. **Kịch bản.** Làm theo `references/script-workflow.md`:
   - Chọn kỹ thuật viet-pro theo loại video (hook, story-core, debunk…), rồi gọi skill `viet-pro`.
   - Đầu ra là bảng 3 cột. Tiếng Việt khoảng 2,5–3 từ/giây, tức 15 giây khoảng 40 từ.
   - Explainer, phản bác ngộ nhận, hoặc kịch bản có số liệu thì **bắt buộc kiểm chứng dữ kiện**, ghi nguồn vào `SOURCES.md`.
   - Lưu bảng thành `script-table.md` (**không** đặt tên `script.md`: macOS không phân biệt hoa thường nên `script.md` và `SCRIPT.md` là cùng một file và sẽ ghi đè nhau). Tách lời vào `script/NN.txt`. Nếu dùng workflow HyperFrames chuyên biệt thì xuất thêm `SCRIPT.md` (`## Line N — … (Frame N)`).
   - Chạy lint tiếng Việt và xử lý hết ERROR.

3. **Storyboard.** Viết `STORYBOARD.md` từ bảng của viet-pro, cộng thêm khối `<structure>` trong brief: BPM, beat, mỗi beat một hành động, cột SFX. Trước khi viết, tra case gần nhất:
   ```bash
   node $OV/scripts/find-cases.mjs --category <motion|explainer|3d|interactive|product|story-music> --keyword <từ khoá tiếng Anh> --limit 5
   ```
   - Không có kết quả (stderr `no matching cases`) thì bỏ `--keyword` và tra lại chỉ theo category.
   - Đọc 2–3 case. Chọn **thẻ kỹ thuật** và dòng trong **bảng nối nhóm → HyperFrames** ở `references/pattern-library.md` (blueprint, rule, catalog query, preset).
   - Ghi id case tham khảo vào `BRIEF.md`.

4. **Engine.** Chọn theo `references/engine-selection.md`. Mặc định là HyperFrames. Ghi `engine`, `workflow`, `engine_reason` vào `BRIEF.md`.

5. **Âm thanh.** Làm theo `references/audio-pipeline.md`.
   - **Dùng workflow HyperFrames chuyên biệt** (faceless-explainer, product-launch-video, pr-to-video): **không** chạy `audio.mjs generate` của workflow. Thay vào đó chạy:
     ```bash
     node $OV/scripts/eleven.mjs audio-meta --script SCRIPT.md --hyperframes . --bgm assets/bgm/bgm.mp3 --bgm-volume 0.2
     ```
     Lệnh này ghi `audio_meta.json` và `audio_engine_meta.json`. **Không xoá sidecar**, vì `fetch-sfx` cần nó để giữ giọng. Sau đó vẫn chạy `sync-durations` và `fetch-sfx` của workflow như bình thường.
   - **Dựng tay** (general-video): voice làm trước: `node $OV/scripts/eleven.mjs tts --text-file script/01.txt --out assets/voice/01.mp3` (sinh kèm `01.mp3.words.json`).
   - Chỉnh mốc storyboard theo thời lượng giọng thật. Frame dài đúng bằng voice, nên frame cuối (CTA) phải cộng thêm khoảng 1 giây giữ hình trước khi assemble.
   - SFX: chạy `hyperframes media-use resolve --type sfx …` trước, nếu không có thì dùng `eleven.mjs sfx`.
   - Nhạc nền: `eleven.mjs music`. Nếu exit 3 (`MUSIC_UNAVAILABLE`) thì dùng `media-use resolve --type bgm`.
   - **Không** dùng TTS của media-use cho tiếng Việt.

6. **Dựng.** Đọc `references/edit-method.md` trước khi viết STORYBOARD; chép mục "Sàn chất lượng" và "Kỷ luật GSAP" vào prompt frame worker.
   - HyperFrames: gọi skill `hyperframes`. Vì đã có `BRIEF.md`, nó sẽ đi vào workflow ghi ở `workflow:`.
   - **Bắt buộc** chạy `hyperframes catalog --query "<hiệu ứng>"` trước khi tự viết hiệu ứng, và ưu tiên block hoặc blueprint đã chọn ở bước 3.
   - Workflow có frame preset (`build-frame.mjs`): kiểm tra font preset có đủ dấu tiếng Việt (`engine-selection.md`). Thiếu thì đổi sang Be Vietnam Pro và copy file font vào `assets/fonts/`.
   - Remotion: dùng skill `ak-remotion`.
   - Raw canvas: làm theo công thức trong `engine-selection.md`.
   - Với `aspect: both`, bản dọc phải dàn lại bố cục, không crop:
     - **Dựng tay** (general-video): 2 composition trong cùng project, gồm `index.html` (1920×1080) và `compositions/main-9x16.html` (1080×1920).
     - **Workflow có frame worker** (faceless-explainer, pr-to-video, product-launch-video): làm **một project 9:16 riêng**, theo mục "Bài học từ smoke v2" trong `engine-selection.md`. Sau mỗi lần `captions.mjs build` ở 1080×1920, **bắt buộc** chạy `sed -i '' 's/--cap-band-top: [0-9]*px;/--cap-band-top: 1340px;/; s/--cap-band-height: [0-9]*px;/--cap-band-height: 200px;/' compositions/captions.html`, vì mặc định 1600px rơi vào vùng UI che.
   - Áp dụng banned list trong brief.

7. **Render.**
   - 16:9: `hyperframes render --quality looks --output renders/<name>-16x9.mp4`
   - 9:16: `hyperframes render -c compositions/main-9x16.html --quality looks --output renders/<name>-9x16.mp4`. Nếu là project 9:16 riêng thì chạy `hyperframes render` ngay trong thư mục đó.
   - `--resolution` chỉ đổi kích thước render, không đổi khổ hình.
   - Bản giao cuối render với `--quality delivery`.

8. **QA.** Làm theo `references/qa-checklist.md` § "Vòng QA tự xem video": lint + check → `video-lint.mjs` → render vN → `judge.mjs check`, từ v2 thêm `pair`. Ghi kết quả vào `QA.md`. Tối đa 3 vòng, sau đó dừng lại và báo người dùng kèm bằng chứng.

9. **Caption mạng xã hội (tuỳ chọn, khi người dùng muốn đăng).** Làm theo mục Bước 9 trong `references/script-workflow.md` và ghi vào `captions/{tiktok,facebook,youtube}.md`. Không tự đăng.

Giao cho người dùng: đường dẫn MP4, link preview (`hyperframes preview --background`; ghi PID và dừng preview khi người dùng xem xong), cùng tóm tắt QA. Các mục cần tai người (giọng, thanh điệu) phải nói rõ là người dùng tự nghe.

## Ranh giới

- Không sửa file trong các skill `hyperframes*`, `media-use`, `viet-pro`. Các skill đó được cập nhật từ upstream.
- Không tự đăng video lên mạng xã hội hay publish. Chỉ làm khi người dùng yêu cầu rõ.
- Tôn trọng bản quyền: chỉ dùng tài sản người dùng cấp, audio sinh từ ElevenLabs, hoặc catalog có license. Ghi nguồn vào `assets/CREDITS.md`.
- `judge.mjs` gửi video 540p lên Gemini qua agy (đã được đồng ý 2026-10-08).
- Prompt trong corpus (`data/`) thuộc về tác giả gốc. Chỉ dùng để học cấu trúc, và luôn kèm link khi trích.

## Tham chiếu

| File | Dùng khi |
|---|---|
| `references/brief-template.md` | Bước 1: khung brief và ví dụ 15 giây |
| `references/pattern-library.md` | Bước 3: công thức theo 6 nhóm video |
| `references/script-workflow.md` | Bước 2 và 9: viet-pro theo loại video, kiểm chứng, lint, caption đa kênh |
| `references/engine-selection.md` | Bước 4 và 6: chọn engine, xử lý 16:9 / 9:16 |
| `references/audio-pipeline.md` | Bước 5: voice, SFX, nhạc nền, mix, bản quyền |
| `references/qa-checklist.md` | Bước 8: đo bằng lệnh, xem frame, nghe |
| `scripts/eleven.mjs` | `doctor`, `voice-info`, `models`, `tts`, `sfx`, `music`, `probe-models`, `audio-meta` |
| `references/edit-method.md` | Bước 3 và 6: chức năng câu → hình, sàn chất lượng, GSAP, SFX |
| `scripts/video-lint.mjs` | Bước 8: lowercase, chữ nhỏ, vùng UI 9:16 |
| `scripts/judge.mjs` | Bước 8: `check`/`pair`; exit 3–4 → QA ảnh tĩnh |
| `scripts/find-cases.mjs` | Bước 3: tra 813 case trong `data/cases.jsonl`. Tra bằng script, không đọc file trực tiếp |
| `data/exemplars.md` | 17 prompt mẫu nguyên văn, có nguồn. Chỉ mở khi cần đọc prompt đầy đủ |
| `data/SOURCES.md` | Nguồn, commit và license của corpus; lệnh rebuild |
| `scripts/corpus-stats.mjs` | Thống kê lại corpus khi cập nhật dữ liệu nguồn |
