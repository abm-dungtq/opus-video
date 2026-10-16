---
name: ov-brief
description: "Bước 1 của opus-video: viết BRIEF.md tối thiểu (chủ đề, aspect 16:9/9:16/both, thời lượng, tài sản thương hiệu) và kiểm brand kit bằng brand.mjs. Dùng sau ov-setup, khi bắt đầu một video mới ở bất kỳ hướng vận hành nào. Không dùng để chọn phong cách hay hướng đạo diễn (ov-direction), tra case mẫu (ov-cases) hay viết kịch bản (ov-script)."
---

# ov-brief: brief tối thiểu

`$OV` là thư mục gốc plugin opus-video, nơi có `scripts/` và `references/`: Claude Code `${CLAUDE_PLUGIN_ROOT}` (cài tại chỗ: `~/.claude/skills/opus-video`), Codex `~/.agents/skills/opus-video`, Antigravity `~/.gemini/config/skills/opus-video` (CLI: `~/.gemini/antigravity-cli/skills/opus-video`); tức thư mục chứa `skills/` và `scripts/` của plugin. Mọi lệnh là `node $OV/scripts/<x>.mjs` (PowerShell: thay `$OV` bằng đường dẫn đầy đủ).

## Bước 1: brief tối thiểu

Điền theo `references/brief-template.md` vào `BRIEF.md` (file `$OV/references/brief-template.md`). Hỏi người dùng chủ đề, `aspect` (16:9 / 9:16 / both), thời lượng, tài sản thương hiệu (logo, màu, footage). Kỹ thuật dựng (engine, workflow, fps) tự đề xuất.

- **Không tự điền phong cách, hình chủ đạo, hiệu ứng, chuyển cảnh, SFX**: các trường đó do bước 1b (`ov-direction`) ghi. Hướng `nhanh` lấy chúng từ case đã chọn (`ov-cases`).
- Có `shared-assets/brand.json` (tạo từ `references/brand.example.json`, kiểm bằng `brand.mjs check`) thì `make-pitch` dùng màu, font, logo, voice_id của brand và bỏ các hướng bị cấm.

```bash
node $OV/scripts/brand.mjs check
```

- Dự án mới có `brief_version: 2` trong frontmatter: bước 1b là bắt buộc.
- Footage quay thật hay clip làm trục: thêm thông tin clip vào brief rồi sang `ov-footage`.

Xong brief thì đi tiếp theo chuỗi của hướng vận hành (skill `opus-video`): `ov-direction` (đạo diễn), `ov-cases` (nhanh), `ov-audio` hoặc `ov-footage` (từ nhạc/footage).

## Tham chiếu

| File | Dùng khi |
|---|---|
| `$OV/references/brief-template.md` | Bước 1: khung brief và ví dụ 15 giây |
| `$OV/references/brand.example.json` | Mẫu brand kit; chép thành `shared-assets/brand.json` rồi sửa (đường dẫn tính từ file đó) |
| `$OV/scripts/brand.mjs` | Bước 1/1b: `check` brand kit (màu #rrggbb, hướng bị cấm có thật, file logo/font tồn tại); `make-pitch` tự đọc |
