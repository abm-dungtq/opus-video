---
name: ov-studio
description: "Hướng timeline của opus-video: manifest project.json (shot, câu thoại, nhạc, phiên bản), nhập dự án cũ thành project.json mà không đổi file gốc (manifest-import.mjs), sửa timeline qua cổng lệnh gateway.mjs (patch, undo, log, show, derive) và Motion Studio chạy trên máy. Dùng khi người dùng nói sửa video, mở studio, đổi shot, kéo dài cảnh hoặc dời câu thoại của một dự án đã có. Không dùng để làm video mới từ đầu (opus-video chọn hướng dao-dien hoặc nhanh), tạo lại giọng (ov-audio) hay render bản giao (ov-deliver)."
---

# ov-studio: project.json, gateway, Motion Studio

`$OV` là thư mục gốc plugin opus-video, nơi có `scripts/` và `references/`: Claude Code `${CLAUDE_PLUGIN_ROOT}` (cài tại chỗ: `~/.claude/skills/opus-video`), Codex `~/.agents/skills/opus-video`, Antigravity `~/.gemini/config/skills/opus-video` (CLI: `~/.gemini/antigravity-cli/skills/opus-video`); tức thư mục chứa `skills/` và `scripts/` của plugin. Mọi lệnh là `node $OV/scripts/<x>.mjs` (PowerShell: thay `$OV` bằng đường dẫn đầy đủ).

## Phạm vi

Skill này sở hữu manifest `project.json`, cổng lệnh ghi duy nhất `gateway.mjs`, việc nhập dự án cũ, Motion Studio và yêu cầu gửi cho đạo diễn AI. Motion Studio (giao diện web trên máy) **chưa có trong bản này**. Dùng được: hai CLI dưới đây và MCP server `opus-video` cho đạo diễn AI.

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

## MCP server cho đạo diễn AI

Claude Code nạp server `opus-video` (`$OV/mcp/server.mjs`, khai báo trong `.claude-plugin/plugin.json`) ở phiên mới. Mọi tool nhận `project` là đường dẫn **tuyệt đối** tới thư mục có `project.json`.

| Tool | Đầu vào | Việc |
|---|---|---|
| `project_get` | `project` | đọc manifest |
| `project_log` | `project`, `limit?` | N dòng lịch sử mới nhất |
| `project_patch` | `project`, `base`, `ops`, `receipt_note?` | sửa qua gateway với actor `director`; trả phiên bản mới và biên nhận, hoặc `CONFLICT`/`INVALID` (isError) |
| `project_undo` | `project`, `base` | hoàn tác thay đổi mới nhất |
| `studio_request_next` | `project` | nhận yêu cầu Studio cũ nhất đang chờ (runner `mcp`); `null` khi trống |
| `studio_request_done` | `project`, `id`, `ok`, `receipt` hoặc `error` | đóng yêu cầu: `done` hoặc `failed` |

Luật của đạo diễn:

- Luôn gọi `project_get` trước, rồi patch với đúng `base` vừa đọc. `CONFLICT` thì đọc lại và làm lại, không đoán phiên bản.
- Sửa chuyển động bên trong một shot bằng cách sửa HTML của cảnh đó. Mọi thay đổi về thời gian (độ dài shot, vị trí câu thoại, nhạc) chỉ đi qua `project_patch`, không sửa tay số giây.
- Đổi lời một câu (`set_line_text`) để `gate: "stale"` cho tới khi câu đó qua cổng `ov-script`; chỉ khi đó mới tạo lại giọng của riêng câu đó qua `ov-audio`.
- Xong yêu cầu thì gọi `studio_request_done` với biên nhận tiếng Việt liệt kê mọi file và op đã đổi; không làm được thì `ok: false` kèm lý do.
