---
name: ov-audio
description: "Bước 5 của opus-video: giọng đọc ElevenLabs (eleven.mjs tts/audio-meta), SFX, nhạc nền, đo nhịp beat-grid, ghi mốc TIMING (timing.mjs), đo mix nhạc dưới giọng (mix-balance) và audio-mix. Dùng sau khi check-viet-pro và check-preflight --stage plan đã PASS, khi đổi lời đọc, hoặc đầu hướng tu-nhac (đo beat trước). Không dùng để viết hay sửa lời (ov-script), dựng hình (ov-build), render bản giao hay thay tiếng bản final (ov-deliver)."
---

# ov-audio: giọng, SFX, nhạc, TIMING, mix

`$OV` là thư mục gốc plugin opus-video, nơi có `scripts/` và `references/`: Claude Code `${CLAUDE_PLUGIN_ROOT}` (cài tại chỗ: `~/.claude/skills/opus-video`), Codex `~/.agents/skills/opus-video`, Antigravity `~/.gemini/config/skills/opus-video` (CLI: `~/.gemini/antigravity-cli/skills/opus-video`); tức thư mục chứa `skills/` và `scripts/` của plugin. Mọi lệnh là `node $OV/scripts/<x>.mjs` (PowerShell: thay `$OV` bằng đường dẫn đầy đủ).

## Bước 5: âm thanh

Chỉ bắt đầu khi `check-viet-pro.mjs --project .` đã PASS ở bước 2 (`ov-script`) và `check-preflight --stage plan` đã PASS ở bước 4b (`ov-build`) (đổi lời đọc sau đó thì chạy lại cổng trước khi tạo lại voice; `eleven.mjs` exit 4 nghĩa là cổng chặn). Làm theo `$OV/references/audio-pipeline.md`.

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
- Composition từ skeleton: có giọng thì chạy `node $OV/scripts/timing.mjs --project .` để ghi khối TIMING từ `words.json`; sửa giọng xong chỉ chạy lại lệnh này. Dự án đã có `project.json` (xem `ov-studio`): `timing.mjs` lấy khung shot từ manifest qua `gateway.mjs derive`, và đổi thời lượng shot phải đi qua `gateway.mjs patch`, không sửa tay số giây trong PLAN.md hay HTML.
- Hướng `don-dap` hoặc nhóm `story-music`: đo nhịp `node $OV/scripts/beat-grid.mjs assets/bgm/bgm.mp3 --write` rồi chạy lại `timing.mjs`. `UNSTABLE` thì không dùng `B()`; nhạc chậm bị đọc gấp đôi tempo thì thêm `--max-bpm 100`.
- Đo mix: `node $OV/scripts/mix-balance.mjs --project .`, đích nhạc thấp hơn giọng 4–7 dB lúc có lời. `audio-mix` tự giảm nhạc nền có `data-fx-carve` theo giọng.

## Theo hướng vận hành

- `tu-nhac` từ nhạc: có bài nhạc trước thì đo `beat-grid.mjs --write` ngay sau brief, ghi BPM vào `BRIEF.md`, rồi mới sang `ov-direction` và `ov-script`; lời đọc viết theo số beat, không ép nhạc theo lời.
- `timeline` sửa dự án: chỉ tạo lại giọng cho câu thoại có `gate` khác `pass` trong `project.json` (lời vừa sửa), sau khi `check-viet-pro.mjs` PASS lại; các câu khác giữ file cũ (`--reuse`).

## Tham chiếu

| File | Dùng khi |
|---|---|
| `$OV/references/audio-pipeline.md` | Bước 5: voice, SFX, nhạc nền, mix, bản quyền |
| `$OV/scripts/eleven.mjs` | `doctor`, `voice-info`, `models`, `tts`, `sfx`, `music`, `probe-models`, `audio-meta`; `tts`/`audio-meta` qua cổng viet-pro (`scripts/voice-gate.mjs`, exit 4) |
| `$OV/scripts/timing.mjs` | Mốc TIMING từ PLAN.md hoặc `project.json` và `words.json` (cú pháp ở `--help`) |
| `$OV/scripts/beat-grid.mjs` | Nhịp nhạc: BPM, BEAT0, kick, drop; `--write` ghi `<nhạc>.beats.json` khi ổn định |
| `$OV/scripts/mix-balance.mjs` | Cân bằng nhạc dưới giọng lúc có lời |
| `$OV/scripts/audio-mix.mjs` | Bước 7 (do `render-final` gọi): dựng lại tiếng của composition thành một WAV bằng ffmpeg từ các thuộc tính audio tĩnh; `--dry-run` in lệnh ffmpeg |
