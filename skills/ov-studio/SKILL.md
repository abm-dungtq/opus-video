---
name: ov-studio
description: "Hướng timeline của opus-video: manifest project.json (shot, câu thoại, nhạc, phiên bản), nhập dự án cũ thành project.json mà không đổi file gốc (manifest-import.mjs), sửa timeline qua cổng lệnh gateway.mjs (patch, undo, log, show, derive) và Motion Studio chạy trên máy. Dùng khi người dùng nói sửa video, mở studio, đổi shot, kéo dài cảnh hoặc dời câu thoại của một dự án đã có. Không dùng để làm video mới từ đầu (opus-video chọn hướng dao-dien hoặc nhanh), tạo lại giọng (ov-audio) hay render bản giao (ov-deliver)."
---

# ov-studio: project.json, gateway, Motion Studio

`$OV` là thư mục gốc plugin opus-video, nơi có `scripts/` và `references/`: Claude Code `${CLAUDE_PLUGIN_ROOT}` (cài tại chỗ: `~/.claude/skills/opus-video`), Codex `~/.agents/skills/opus-video`, Antigravity `~/.gemini/config/skills/opus-video` (CLI: `~/.gemini/antigravity-cli/skills/opus-video`); tức thư mục chứa `skills/` và `scripts/` của plugin. Mọi lệnh là `node $OV/scripts/<x>.mjs` (PowerShell: thay `$OV` bằng đường dẫn đầy đủ).

## Phạm vi

Skill này sở hữu manifest `project.json`, cổng lệnh ghi duy nhất `gateway.mjs`, việc nhập dự án cũ, Motion Studio và yêu cầu gửi cho đạo diễn AI. Motion Studio (giao diện web trên máy), MCP server và đạo diễn AI **chưa có trong bản này**; hiện chỉ dùng hai CLI dưới đây.

## Đã dùng được

- Nhập dự án chưa có manifest (chỉ đọc file gốc, chỉ thêm `project.json` và `.opus/`):
  ```bash
  node $OV/scripts/manifest-import.mjs --project <dir>          # in thử, không ghi
  node $OV/scripts/manifest-import.mjs --project <dir> --write  # ghi phiên bản 1
  ```
  Exit 6: đã có `project.json` (thêm `--force` để nhập lại thành phiên bản mới). Dự án không có `TIMING:BEGIN` trong `index.html` là **chỉ xem** (`editable: false`): gateway trả exit 4, sửa timeline của dự án đó bằng cách sửa HTML trực tiếp.
- Sửa timeline qua gateway, không bao giờ sửa tay `project.json`, số giây trong khối TIMING, `data-start` của giọng hay cột Thời điểm của PLAN.md:
  ```bash
  node $OV/scripts/gateway.mjs show  --project <dir>
  node $OV/scripts/gateway.mjs patch --project <dir> --actor director --base <phiên bản đang thấy> --ops '[{"op":"resize_shot","id":"s2","duration":5.5}]'
  node $OV/scripts/gateway.mjs undo  --project <dir> --base <phiên bản đang thấy>
  node $OV/scripts/gateway.mjs log   --project <dir>
  ```
  Exit 3 CONFLICT: phiên bản đã đổi, đọc lại bằng `show` rồi làm lại. Exit 8 BUSY: tiến trình khác đang ghi, thử lại sau. Exit 5 INVALID: op sai hoặc kết quả phá luật manifest (đọc lý do tiếng Việt). Danh sách op ở `--help`.
- Sửa lời một câu (`set_line_text`) đặt `gate: stale`: chạy lại `ov-script` cho câu đó, rồi `ov-audio` tạo lại giọng, rồi `ov-deliver`.
