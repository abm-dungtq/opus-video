# opus-video

Skill cho Claude Code: biến brief hoặc chủ đề tiếng Việt thành video MP4 hoàn chỉnh, xuất cả 16:9 và 9:16.

Skill này là phần điều phối và không tự render. Nó nối các bước sau:

1. **Kịch bản:** viết bằng [viet-pro](https://github.com/abm-dungtq/viet-pro-codex), có kiểm chứng dữ kiện.
2. **Âm thanh:** ElevenLabs. Giọng đọc `eleven_v4` có timestamp từng từ, SFX `eleven_text_to_sound_v2`, nhạc nền `music_v2_5`.
3. **Dựng:** [HyperFrames](https://hyperframes.dev) là mặc định. Remotion hoặc Canvas được dùng khi dự án cần.
4. **QA:** lint, check, kiểm vùng an toàn 9:16, rồi cho Gemini (qua `agy`) xem video và chấm, tối đa 3 vòng.

Mẫu dựng được chắt lọc từ 813 video làm bằng Opus 5.5 (xem `data/SOURCES.md`).

## Cài đặt

```bash
git clone https://github.com/abm-dungtq/opus-video ~/.claude/skills/opus-video
```

Cần có:
- Node.js 20 trở lên và `ffmpeg`.
- CLI `hyperframes` (bản 0.8.140 trở lên) cùng các skill `hyperframes*`.
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

Quy trình 8 bước nằm trong `SKILL.md`. Chi tiết từng bước nằm trong `references/`.

## Script

| Script | Việc |
|---|---|
| `scripts/eleven.mjs` | `doctor`, `tts`, `sfx`, `music`, `audio-meta` (cầu nối sang workflow HyperFrames) |
| `scripts/find-cases.mjs` | Tra 813 case mẫu theo nhóm và từ khoá |
| `scripts/video-lint.mjs` | Bắt chữ bị ép thường, chữ quá nhỏ, nội dung lấn vùng UI ở khổ 9:16 |
| `scripts/judge.mjs` | Gemini chấm một video (`check`) hoặc so hai phiên bản có đổi thứ tự (`pair`) |

Chạy test:

```bash
node --test ~/.claude/skills/opus-video/scripts/tests/
```

Test cần project thật sẽ tự bỏ qua khi không tìm thấy project đó. Có thể trỏ tới project của bạn bằng `OPUS_VIDEO_SMOKE_DIR` và `OPUS_VIDEO_ABM_DIR`.

## Giấy phép

Mã nguồn và tài liệu dùng giấy phép MIT (xem `LICENSE`). Corpus trong `data/` lấy từ hai repo có giấy phép MIT. Prompt trong corpus thuộc về tác giả gốc, và mỗi dòng đều ghi tác giả cùng link. Repo không phân phối lại video gốc.
