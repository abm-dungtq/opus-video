# opus-video

Skill cho Claude Code: biến brief hoặc chủ đề tiếng Việt thành video MP4 hoàn chỉnh, xuất cả 16:9 và 9:16.

Skill này là phần điều phối và không tự render. Nó nối các bước sau:

1. **Kịch bản:** viết bằng [viet-pro](https://github.com/abm-dungtq/viet-pro-codex) ở mức đầy đủ (đọc hết review/editorial, lượt Humanizer có ghi chép, lint), có kiểm chứng dữ kiện. `scripts/check-viet-pro.mjs` chặn render khi chưa đạt, còn `eleven.mjs` tự chạy lại cổng và không tạo giọng (exit 4) khi chưa đạt hoặc khi lời đọc khác `script/NN.txt`; lúc giao kèm `CAPTIONS.md` (Facebook cá nhân + TikTok) cũng qua viet-pro.
2. **Âm thanh:** ElevenLabs. Giọng đọc `eleven_v4` có timestamp từng từ, SFX `eleven_text_to_sound_v2`, nhạc nền `music_v2_5`.
3. **Dựng:** [HyperFrames](https://hyperframes.dev) là mặc định. Remotion hoặc Canvas được dùng khi dự án cần.
4. **QA:** lint, check, kiểm vùng an toàn 9:16, rồi cho Gemini (qua `agy`) xem video và chấm, tối đa 3 vòng.
5. **Footage thật (beta):** tìm khoảng lặng và ghép clip theo danh sách cắt bằng `scripts/cut.mjs`, rồi thêm phụ đề và đồ hoạ bằng HyperFrames.

Mẫu dựng được chắt lọc từ 813 video làm bằng Opus 5.5 (xem `data/SOURCES.md`).

## Cài đặt

```bash
git clone https://github.com/abm-dungtq/opus-video ~/.claude/skills/opus-video
```

Cần có:
- Node.js 20 trở lên và `ffmpeg`.
- CLI `hyperframes` (bản 0.8.144 trở lên) cùng các skill `hyperframes*`.
- Skill `viet-pro`.
- Key ElevenLabs. Tạo file `~/.config/opus-video/.env` rồi `chmod 600`:
  ```
  ELEVENLABS_API_KEY=...
  OPUS_VIDEO_VOICE_ID=...
  ```
- Tuỳ chọn: [`agy`](https://antigravity.google) đã đăng nhập tài khoản Google, dùng cho bước giám khảo video. Video gửi lên Gemini là bản sao 540p tạm thời.

Kiểm tra cài đặt:

```bash
node ~/.claude/skills/opus-video/scripts/eleven.mjs doctor
```

## Dùng

Trong Claude Code:

```
/opus-video làm video 30 giây giới thiệu <sản phẩm>, cả 16:9 và 9:16
```

Quy trình 9 bước nằm trong `SKILL.md`. Chi tiết từng bước nằm trong `references/`.

## Script

| Script | Việc |
|---|---|
| `scripts/eleven.mjs` | `doctor`, `tts`, `sfx`, `music`, `audio-meta` (cầu nối sang workflow HyperFrames) |
| `scripts/find-cases.mjs` | Tra 813 case mẫu theo nhóm và từ khoá |
| `scripts/rerank-cases.mjs` | (Tuỳ chọn, cần `TYPESAFE_API_KEY`) TypeSafe Jev xếp hạng ~740 case có prompt ≥ 40 ký tự (738/813 + case khớp từ khoá) theo brief; thiếu key hoặc lỗi API thì trả kết quả như `find-cases` |
| `scripts/case-features.mjs` | Gắn nhãn một lần cho mọi case vào `data/case-features.jsonl`; chạy lại khi `data/cases.jsonl` đổi |
| `scripts/check-viet-pro.mjs` | Cổng viet-pro: biên bản `## viet_pro`, `script-table.v1.md` + compare, lint viet-pro từng file lời đọc và `SCRIPT.md`, `CAPTIONS.md` (Facebook + TikTok) khi giao; `--jev-audit` (tuỳ chọn) chỉ in WARN |
| `scripts/voice-gate.mjs` | Cổng mà `eleven.mjs tts`/`audio-meta` gọi trước khi tạo giọng (exit 4) |
| `scripts/jev-audit.mjs`, `scripts/jev-audit-eval.mjs` | (Tuỳ chọn, cần `TYPESAFE_API_KEY`) Jev rà lời đọc; đo precision theo pattern trên `data/jev-audit-eval.jsonl` |
| `scripts/video-lint.mjs` | Bắt chữ bị ép thường, chữ quá nhỏ, nội dung lấn vùng UI ở khổ 9:16 |
| `scripts/judge.mjs` | Gemini chấm một video (`check`) hoặc so hai phiên bản có đổi thứ tự (`pair`) |
| `scripts/cut.mjs` | `probe` tìm khoảng lặng an toàn để cắt; `apply-edl` ghép footage theo danh sách cắt JSON |

Mọi script đều có `--help` / `-h` (in phần mô tả đầu file, thoát mã 0, không làm gì khác).

Chạy test:

```bash
node --test ~/.claude/skills/opus-video/scripts/tests/
```

Test cần project thật sẽ tự bỏ qua khi không tìm thấy project đó. Có thể trỏ tới project của bạn bằng `OPUS_VIDEO_SMOKE_DIR` và `OPUS_VIDEO_ABM_DIR`.

## Giấy phép

Mã nguồn và tài liệu dùng giấy phép MIT (xem `LICENSE`). Corpus trong `data/` lấy từ hai repo có giấy phép MIT. Prompt trong corpus thuộc về tác giả gốc, và mỗi dòng đều ghi tác giả cùng link. Repo không phân phối lại video gốc. `scripts/cut.mjs` phỏng theo ý tưởng của [open-edit](https://github.com/veedstudio/open-edit) (Apache-2.0, © VEED LIMITED); xem `NOTICE`.
