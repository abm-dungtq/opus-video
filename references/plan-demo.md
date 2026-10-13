# PLAN.md và khung hình demo (bắt buộc trước video cuối)

Không render bản giao cuối khi chưa có **plan** đã viết và **khung hình demo** đã được duyệt. Hai cổng:

| Cổng | Lệnh | Khi nào |
|---|---|---|
| Plan | `node $OV/scripts/check-preflight.mjs --project . --stage plan` | Bước 4b, sau Engine, **trước** khi tạo voice (bước 5) và dựng (bước 6) |
| Demo + duyệt | `node $OV/scripts/check-preflight.mjs --project . --stage final` | Bước 6b, trước bản giao. `render-final.mjs` tự chạy cổng này, chặn thì exit **5** |

`$OV` là thư mục chứa `SKILL.md` của opus-video trên agent đang chạy (Claude Code `~/.claude/skills/opus-video`, Codex `~/.agents/skills/opus-video`, Antigravity `~/.gemini/config/skills/opus-video`…).

## 1. Mẫu PLAN.md

Viết sau `STORYBOARD.md` và lựa chọn engine. Mỗi mục `##` phải có nội dung thật (`…`, `TODO`, `TBD`, `<…>`, `pending` bị coi là trống). Tiêu đề khớp cả khi không dấu (`## Canh` = `## Cảnh`).

```markdown
# PLAN: <tên video>

## Mục tiêu
Người xem là ai, xem xong làm gì. Thời lượng, khổ hình (16:9 / 9:16 / both), kênh đăng.

## Cảnh
| # | Thời điểm | Lời đọc (tóm tắt) | Hình / hiệu ứng | Âm thanh |
|---|---|---|---|---|
| 1 | 0–6s | Hook: … | Logo bật lên, key text "…" | whoosh |
| 2 | 6–15s | … | Terminal gõ lệnh cài | click, nhạc vào |

## Âm thanh
Giọng (voice id/model), nhạc nền (prompt, âm lượng), SFX theo beat, ngôn ngữ.

## Engine
HyperFrames <workflow> (hoặc Remotion/Canvas) và lý do; composition nào cho khổ nào.

## Khung hình demo
- 3 — logo và key text cảnh 1 đọc rõ, đủ dấu tiếng Việt
- 10 — terminal cảnh 2, chữ lệnh không tràn
(ít nhất một mốc mỗi cảnh; mốc tính bằng giây trên timeline bản 16:9 / bản chính)

## Khung hình demo 9:16
- 3 — logo nằm trong vùng an toàn
- 10 — terminal dàn lại theo chiều dọc
(chỉ bắt buộc khi BRIEF.md `aspect: both`)

## QA
Lệnh sẽ chạy ở bước 8 (lint, check, video-lint, judge) và tiêu chí đạt.
```

Cổng plan kiểm: đủ 6 mục, bảng Cảnh có ít nhất một dòng, số mốc demo ≥ số cảnh, và có mục 9:16 khi `aspect: both`. Sửa plan sau khi đã chụp demo thì phải chụp lại (frame cũ hơn `PLAN.md` bị chặn).

## 2. Chụp khung hình demo

Sau khi dựng xong (bước 6), **trước** bản giao cuối:

```bash
node $OV/scripts/make-demo.mjs --project .                                          # bản chính → demo/
node $OV/scripts/make-demo.mjs --project . --aspect 9x16 --composition compositions/main-9x16.html   # 9:16 cùng project → demo/9x16/
node $OV/scripts/make-demo.mjs --project . --aspect 9x16 --hyperframes ../<project-9x16>              # 9:16 là project riêng
```

- Mặc định dùng `npx hyperframes snapshot` tại đúng các mốc trong PLAN.md.
- `--composition` render bản nháp (`--quality draft`) rồi cắt PNG bằng ffmpeg, vì snapshot không chọn được composition.
- Mỗi lần chụp, script xoá `frame-*.png` cũ và ghi lại `DEMO.md` với `approval: pending`.

## 3. Duyệt demo

1. Gửi các PNG trong `demo/` (và `demo/9x16/`) cho người dùng xem. Agent cũng tự xem từng khung: chữ đủ dấu, không tràn, đúng vùng an toàn, đúng nội dung cảnh.
2. Người dùng góp ý thì sửa composition và chụp lại (approval quay về `pending`).
3. Người dùng đồng ý thì ghi vào `DEMO.md`:

```markdown
approval: <ai>, <ngày giờ>, "<lời đồng ý>"
```

Ví dụ: `approval: người dùng, 2026-10-12 14:05, "ok, render bản cuối"`.

Chỉ khi người dùng đã nói rõ là chạy liền không dừng hỏi, agent được tự duyệt, và phải ghi lý do:

```markdown
approval: auto — người dùng yêu cầu chạy không dừng (2026-10-12 "làm hết luôn"); agent đã tự xem 8/8 khung
```

`approval` trống, `pending` hoặc ngắn hơn 6 ký tự đều bị chặn.

## 4. Render bản cuối

```bash
node $OV/scripts/render-final.mjs --project . -- --output renders/<name>-16x9.mp4
node $OV/scripts/render-final.mjs --project . -- -c compositions/main-9x16.html --output renders/<name>-9x16.mp4
```

- Luôn render `--quality delivery`; truyền `--quality`/`-q` sẽ bị từ chối (exit 2).
- Cổng chặn thì exit **5** và in lý do; sửa rồi chạy lại. Không gọi thẳng `hyperframes render --quality delivery` để né cổng.
- Bản nháp và bản QA (`--quality draft|looks`) vẫn chạy `hyperframes render` như cũ.
- Composition sửa sau lần chụp demo cuối chỉ là WARN: nếu thay đổi nhìn thấy được, chụp lại demo và xin duyệt lại.
- Thumbnail của bản giao không chụp riêng: `node $OV/scripts/export.mjs --project ./ --input renders/<name>.mp4 --target <…>` lấy một khung trong mục `## Frames` của `DEMO.md` đã duyệt (`--thumb-frame <n>` để chọn khung khác khung đầu).
