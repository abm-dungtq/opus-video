---
name: ov-deliver
description: "Phần giao của opus-video: render bản giao chỉ qua render-final.mjs (kể cả --audio-only khi chỉ đổi tiếng), QA mọi bản render (qc-mp4, word-sync, video-lint, judge), caption Facebook cá nhân và TikTok qua viet-pro, cổng check-viet-pro --stage delivery, giao link và xuất theo nơi đăng (export.mjs). Dùng sau khi clip nháp đã được duyệt và check-preflight --stage final PASS. Không dùng cho render nháp hay animatic (ov-build), tạo lại giọng (ov-audio) hay viết lời mới (ov-script)."
---

# ov-deliver: render bản giao, QA, caption, xuất

`$OV` là thư mục gốc plugin opus-video, nơi có `scripts/` và `references/`: Claude Code `${CLAUDE_PLUGIN_ROOT}` (cài tại chỗ: `~/.claude/skills/opus-video`), Codex `~/.agents/skills/opus-video`, Antigravity `~/.gemini/config/skills/opus-video` (CLI: `~/.gemini/antigravity-cli/skills/opus-video`); tức thư mục chứa `skills/` và `scripts/` của plugin. Mọi lệnh là `node $OV/scripts/<x>.mjs` (PowerShell: thay `$OV` bằng đường dẫn đầy đủ).

## 7. Render bản giao

- **Bản giao cuối chỉ render qua cổng:** `node $OV/scripts/render-final.mjs --project . -- --output renders/<name>-16x9.mp4` (9:16: thêm `-c compositions/main-9x16.html`). Script tự chạy `check-preflight --stage final` rồi `hyperframes render --quality delivery`; exit **5** là thiếu plan/demo/duyệt. Không gọi thẳng `hyperframes render --quality delivery`.
- Sau khi render, `render-final.mjs` thay tiếng bằng bản mix của `audio-mix.mjs` (ffmpeg), trừ khi composition có tiếng động (`data-fx-chain`, `data-automation`, tween volume…) thì giữ bản mix của HyperFrames. Script ghi kèm `<output>.render.json`.
- **Chỉ đổi nhạc, SFX hay mức âm** thì không render lại hình: `node $OV/scripts/render-final.mjs --project ./ --audio-only renders/<cũ>.mp4 -- --output renders/<mới>.mp4` (9:16: thêm `-c compositions/main-9x16.html`). File âm thanh mới để trong `assets/voice/`, `assets/sfx/` hoặc `assets/bgm/`. Exit **6** là không đổi tiếng được (thiếu sidecar, hình đã đổi, tiếng động…), khi đó render đầy đủ.

## 8. QA

Mọi bản render đều chạy `node $OV/scripts/qc-mp4.mjs renders/<name>.mp4 --project ./ --write-qa` trước; còn dòng FAIL (exit 1) thì sửa rồi render lại, WARN thì xem và ghi lý do vào `QA.md`. Dòng `MOTION` FAIL (dự án có `direction:`) nghĩa là video gần như đứng yên kiểu slideshow: dựng lại các beat theo `build/RECIPES.md`, không nới ngưỡng. Chữ chốt trên hình (hàng `chữ:` trong `## Sự kiện`) phải khớp lời: `node $OV/scripts/word-sync.mjs --project ./ --write-qa` (lệch ≤ 150 ms). Sau đó làm theo `$OV/references/qa-checklist.md` § "Vòng QA tự xem video": lint + check → `video-lint.mjs` → render vN → `judge.mjs check`, từ v2 thêm `pair`. Ghi kết quả vào `QA.md`. Tối đa 3 vòng, sau đó dừng lại và báo người dùng kèm bằng chứng.

## 9. Caption khi giao

**Caption khi giao (BẮT BUỘC với video tiếng Việt).** Viết hai caption, **Facebook cá nhân** và **TikTok**, qua đúng quy trình viet-pro đầy đủ như bước 2 (`ov-script`; đọc thêm `$VP/references/publishing/facebook.md` và `$VP/references/publishing/repurpose-matrix.md`; soạn → lượt Humanizer có ghi chép → lint). Lưu chung một file `CAPTIONS.md` gồm hai mục `## Facebook cá nhân` và `## TikTok`; chi tiết ở mục 5 của `$OV/references/script-workflow.md`.

- Cùng insight và số liệu với kịch bản, không thêm claim mới. Hook viết lại theo kênh, không copy câu mở của video.
- Mỗi caption được lint **riêng**: `check-viet-pro.mjs` tách hai mục ra file tạm rồi lint từng file. Thêm dòng `- captions:` vào biên bản `## viet_pro` (pattern đã sửa, kết quả lint từng caption) và bổ sung `publishing/facebook.md`, `publishing/repurpose-matrix.md` vào `files_read`.
- **Cổng giao:** `node $OV/scripts/check-viet-pro.mjs --project . --stage delivery` phải PASS trước khi gửi link video cho người dùng.
- Không tự đăng. Người dùng muốn thêm caption YouTube thì làm theo cùng quy trình, thêm mục `## YouTube`.

## Giao và xuất

Giao cho người dùng: đường dẫn MP4 (render bằng `render-final.mjs`), `PLAN.md` và `DEMO.md` đã duyệt, `CAPTIONS.md` (đã qua cổng `--stage delivery`), link preview (`hyperframes preview --background`; ghi PID và dừng preview khi người dùng xem xong), cùng tóm tắt QA. Các mục cần tai người (giọng, thanh điệu) phải nói rõ là người dùng tự nghe.

Cần bản đăng theo từng nơi thì xuất từ bản final bằng `node $OV/scripts/export.mjs --project ./ --input renders/<name>.mp4 --target <zalo|youtube|tiktok|facebook>` (nhiều nơi thì cách nhau bằng dấu phẩy). Script chạy lại cổng final, ghi `<name>-<target>.mp4` cạnh file nguồn và lấy thumbnail `<name>-thumb.jpg` từ khung demo đã duyệt; exit 5 là cổng chặn hoặc demo chưa duyệt.

Sửa sau bản final: ghi góp ý vào `REVISIONS.md` theo `$OV/references/revisions.md`, quay lại `ov-build` (hoặc `ov-studio` khi dự án có `project.json`), rồi render lại qua cổng.

## Tham chiếu

| File | Dùng khi |
|---|---|
| `$OV/references/qa-checklist.md` | Bước 8: đo bằng lệnh, xem frame, nghe |
| `$OV/references/revisions.md` | Bước 6b và sau bản final: mẫu `REVISIONS.md` 4 trường, tối đa 5 mục mỗi vòng, kiểm từng mục bằng `snapshot --at`, hết vòng chạy lại animatic |
| `$OV/scripts/render-final.mjs` | Bước 7: render bản giao (`--quality delivery`) chỉ khi cổng final PASS (exit 5 nếu chặn), mix lại tiếng bằng `audio-mix.mjs` và ghi `<output>.render.json`; `--audio-only <cũ.mp4>` chỉ thay tiếng, giữ hình (exit 6 nếu không thay được) |
| `$OV/scripts/qc-mp4.mjs` | Bước 8: kiểm kỹ thuật file MP4 (khổ hình, thời lượng, khung đen, đứng hình, khoảng lặng, loudness, true peak, bitrate, MOTION chống slideshow); `--write-qa` ghi vào `QA.md`, exit 1 khi có FAIL |
| `$OV/scripts/word-sync.mjs` | Bước 8: chữ chốt trên hình khớp lời (lệch ≤ 150 ms) |
| `$OV/scripts/video-lint.mjs` | Bước 8: lowercase, chữ nhỏ, vùng UI 9:16, nhãn rào đón (`HEDGE_LABEL`), báo sớm `SLIDESHOW_MOTION` (WARN) |
| `$OV/scripts/judge.mjs` | Bước 8: `check`/`pair`; exit 3–4 → QA ảnh tĩnh |
| `$OV/scripts/sfx-sync.mjs` | Bước 8: `--write-qa` ghi độ lệch SFX vào `QA.md` |
| `$OV/scripts/export.mjs` | Sau bước 9: bản giao theo nơi đăng (`zalo`, `youtube`, `tiktok`, `facebook`) kèm thumbnail từ khung demo đã duyệt; exit 5 nếu cổng final chặn |
| `$OV/scripts/check-viet-pro.mjs` | Bước 9: `--stage delivery`, caption FB + TikTok |
