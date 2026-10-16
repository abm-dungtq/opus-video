---
name: ov-studio
description: "Hướng timeline của opus-video: manifest project.json (shot, câu thoại, nhạc, phiên bản), nhập dự án cũ thành project.json mà không đổi file gốc (manifest-import.mjs), sửa timeline qua cổng lệnh gateway.mjs (patch, undo, log, show, derive) và Motion Studio chạy trên máy. Dùng khi người dùng nói sửa video, mở studio, đổi shot, kéo dài cảnh hoặc dời câu thoại của một dự án đã có. Không dùng để làm video mới từ đầu (opus-video chọn hướng dao-dien hoặc nhanh), tạo lại giọng (ov-audio) hay render bản giao (ov-deliver)."
---

# ov-studio: project.json, gateway, Motion Studio

`$OV` là thư mục gốc plugin opus-video, nơi có `scripts/` và `references/`: Claude Code `${CLAUDE_PLUGIN_ROOT}` (cài tại chỗ: `~/.claude/skills/opus-video`), Codex `~/.agents/skills/opus-video`, Antigravity `~/.gemini/config/skills/opus-video` (CLI: `~/.gemini/antigravity-cli/skills/opus-video`); tức thư mục chứa `skills/` và `scripts/` của plugin. Mọi lệnh là `node $OV/scripts/<x>.mjs` (PowerShell: thay `$OV` bằng đường dẫn đầy đủ).

## Phạm vi

Skill này sở hữu manifest `project.json`, cổng lệnh ghi duy nhất `gateway.mjs`, việc nhập dự án cũ, Motion Studio và yêu cầu gửi cho đạo diễn AI. Dùng được: hai CLI dưới đây, Motion Studio (giao diện web trên máy) và MCP server `opus-video` cho đạo diễn AI.

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

## Motion Studio

Giao diện web trên máy để xem và sửa timeline: player, timeline (Shot, Lồng tiếng, Nhạc), inspector của shot và bảy tab (Đạo diễn AI, Nhanh, Mẫu cảnh, Media, Lồng tiếng, Nhạc, Phong cách).

```bash
node $OV/scripts/studio.mjs start --background   # http://127.0.0.1:4317, gốc /Volumes/2/Edit-Video
node $OV/scripts/studio.mjs start --background --root <thư mục chứa các dự án>
node $OV/scripts/studio.mjs status               # running <url> (pid, root, từ …) | stopped
node $OV/scripts/studio.mjs stop                 # dừng khi xong việc
```

- Mỗi máy chỉ một server. `start` khi server đang chạy cho cùng thư mục gốc thì in URL; cho thư mục gốc khác thì từ chối (exit 3), dừng nó trước. Cổng 4317 bị tiến trình khác giữ: exit 3, không đổi cổng. Log nền: `~/.config/opus-video/studio.log`.
- Dự án là thư mục con trực tiếp của thư mục gốc có `project.json`. Thư mục có `index.html` và `BRIEF.md` mà chưa có manifest hiện nút **Nhập dự án** (chạy `manifest-import --write`).
- Mọi thao tác sửa đi qua gateway với actor `human`: kéo mép phải shot (`resize_shot`, bước 0,1 s, tối thiểu 0,5 s), kéo câu thoại (`move_line`), Áp dụng trong inspector (`set_shot`, `resize_shot`), sửa lời (`set_line_text`, gate thành `stale`), thanh âm lượng nhạc (`set_music`), Hoàn tác hoặc Ctrl/Cmd+Z (`undo`). Phiên bản đã đổi (409) thì Studio tải lại và báo "Đã có thay đổi mới, đã tải lại".
- Dự án chỉ xem hiện banner "Dự án nhập từ bản cũ: chỉ xem, sửa qua đạo diễn" và khoá mọi thao tác sửa.
- Bảo mật: chỉ nghe 127.0.0.1, kiểm tra Host và Origin, POST cần token của lần chạy (lưu trong `~/.config/opus-video/studio.json`, chmod 600). Không phục vụ `.env`, `.git` hay dotfile ngoài `.opus/`. Tiến trình cùng user trên máy nằm trong vùng tin cậy.
- Chưa nối đạo diễn: "Nhờ đạo diễn sửa", "Dùng mẫu này" và Xuất video mới chỉ báo "Chưa nối đạo diễn". Chưa có nút đưa lại hay huỷ một yêu cầu đang chạy bị kẹt.

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
