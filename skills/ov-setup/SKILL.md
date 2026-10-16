---
name: ov-setup
description: "Bước 0 của opus-video: kiểm tra máy đã đủ công cụ, skill và key để làm video (setup-check.mjs, eleven.mjs doctor), cách xử lý file key ElevenLabs/Jev. Dùng ở đầu mỗi máy hoặc agent mới, mỗi phiên làm video, hoặc khi một lệnh báo thiếu công cụ/skill/key. Không dùng để viết brief (ov-brief), tạo giọng (ov-audio) hay chọn hướng vận hành (opus-video)."
---

# ov-setup: kiểm tra cài đặt và thiết lập

`$OV` là thư mục gốc plugin opus-video, nơi có `scripts/` và `references/`: Claude Code `${CLAUDE_PLUGIN_ROOT}` (cài tại chỗ: `~/.claude/skills/opus-video`), Codex `~/.agents/skills/opus-video`, Antigravity `~/.gemini/config/skills/opus-video` (CLI: `~/.gemini/antigravity-cli/skills/opus-video`); tức thư mục chứa `skills/` và `scripts/` của plugin. Mọi lệnh là `node $OV/scripts/<x>.mjs` (PowerShell: thay `$OV` bằng đường dẫn đầy đủ).

## Bước 0: kiểm tra cài đặt (BẮT BUỘC, mỗi máy/agent mới và khi có lỗi thiếu công cụ)

```bash
node $OV/scripts/setup-check.mjs
```

Phải in `READY` (exit 0) **trước** bước 1. Exit 1 (`NOT READY`) thì làm theo dòng `fix:` dưới mỗi mục `MISSING` (Node ≥ 22, git, ffmpeg/ffprobe, CLI hyperframes, viet-pro và self-test của nó, đủ bộ skill HyperFrames gồm core + `media-use` + mọi workflow, key ElevenLabs), hoặc chạy lại installer (`install.sh` / `install.ps1`, xem `README.md`), rồi chạy lại cho tới khi `READY`. Không bỏ qua bước này và không tự viết lại workflow HyperFrames khi skill của nó chưa cài. `WARN` (agy, `TYPESAFE_API_KEY`, skill Remotion) không chặn. Dòng `opus-video plugin: installed|missing` chỉ để biết plugin đã được nạp hay chưa, không chặn.

## Thiết lập (mỗi phiên một lần)

```bash
node $OV/scripts/eleven.mjs doctor
```

Kết quả đạt khi exit 0 và in ra `tier`, `tts model`, `voice`. Script tự đọc key từ `~/.config/opus-video/.env`. Ba dòng phụ không làm lệnh thất bại: `jev key: present|absent` (`TYPESAFE_API_KEY`, cùng file `.env`, chỉ báo có/không), `jev: reachable|unreachable|skipped` (khi có key, mỗi lần doctor tốn một request Jev rất nhỏ), `viet-pro: installed|missing` (thiếu viet-pro thì cổng bước 2 không chạy được).

- **Không** source, cat hay echo file `.env` trong shell, và không in key ra hội thoại.
- Nếu thiếu key, nhờ người dùng tạo file với 2 dòng `ELEVENLABS_API_KEY=...` và `OPUS_VIDEO_VOICE_ID=...` (chmod 600).
- Tuỳ chọn: dòng `TYPESAFE_API_KEY=...` trong cùng file bật bước xếp hạng case bằng Jev ở bước 3. Thiếu thì bước 3 tự dùng `find-cases`, không cần hỏi người dùng.
- Đổi giọng hoặc model theo dự án: dùng cờ `--voice` / `--model`, hoặc đặt `voice_id` / `tts_model` trong `BRIEF.md` rồi truyền vào lệnh.

Mặc định: voice `eGSd0uV8dNQnZuEEX9lu`, TTS `eleven_v4` (có tiếng Việt), music `music_v2_5`, SFX `eleven_text_to_sound_v2`.

Xong bước này thì quay về chuỗi của hướng vận hành (skill `opus-video`), thường là `ov-brief`.

## Tham chiếu

| File | Dùng khi |
|---|---|
| `$OV/scripts/setup-check.mjs` | Bước 0: đủ công cụ, skill, key chưa (`READY` / `NOT READY` + lệnh sửa theo hệ điều hành) |
| `$OV/scripts/skill-paths.mjs` | Tìm skill trên mọi agent (Claude Code, Codex, Antigravity, workspace) |
| `$OV/scripts/replace-in-file.mjs` | Thay chuỗi trong file bằng regex, chạy được mọi hệ điều hành (thay `sed -i`) |
| `$OV/scripts/directions.mjs` | `check`: token hướng đạo diễn có thật trong HyperFrames (cũng chạy trong setup-check) |
