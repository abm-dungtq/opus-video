---
name: ov-studio
description: "Hướng timeline của opus-video: manifest project.json (shot, câu thoại, nhạc, phiên bản), nhập dự án cũ thành project.json mà không đổi file gốc (manifest-import.mjs), sửa timeline qua cổng lệnh gateway.mjs (patch, undo, redo, log, show, derive) và Motion Studio chạy trên máy. Dùng khi người dùng nói sửa video, mở studio, tạo dự án hay giao việc cho đạo diễn trong Studio, đổi shot, kéo dài cảnh hoặc dời câu thoại của một dự án đã có. Không dùng để làm video mới từ đầu trong terminal (opus-video chọn hướng dao-dien hoặc nhanh), tạo lại giọng (ov-audio) hay render bản giao (ov-deliver)."
---

# ov-studio: project.json, gateway, Motion Studio

`$OV` là thư mục gốc plugin opus-video, nơi có `scripts/` và `references/`: Claude Code `${CLAUDE_PLUGIN_ROOT}` (cài tại chỗ: `~/.claude/skills/opus-video`), Codex `~/.agents/skills/opus-video`, Antigravity `~/.gemini/config/skills/opus-video` (CLI: `~/.gemini/antigravity-cli/skills/opus-video`); tức thư mục chứa `skills/` và `scripts/` của plugin. Mọi lệnh là `node $OV/scripts/<x>.mjs` (PowerShell: thay `$OV` bằng đường dẫn đầy đủ).

## Phạm vi

Skill này sở hữu manifest `project.json`, cổng lệnh ghi duy nhất `gateway.mjs`, việc nhập dự án cũ, Motion Studio và yêu cầu gửi cho đạo diễn AI. Studio import plugin chỉ qua `scripts/studio-api.mjs` (`STUDIO_API = 4`, `PLUGIN_VERSION`, quyền của đạo diễn, `redo` và hàm thuần `redoTarget(history)` cho biết còn gì để làm lại; `SKILLS` là các skill đạo diễn dùng, `COMMANDS` là đường tuyệt đối tới các script Studio chạy, kèm `COMMANDS.choose` là lệnh chọn hướng). Dùng được: hai CLI dưới đây, Motion Studio (giao diện web trên máy) và MCP server `opus-video` cho đạo diễn AI.

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
  node $OV/scripts/gateway.mjs patch --project <dir> --actor human --base <n> --ops '[{"op":"update_music","id":"bgm","gain":0.5,"fade_in":1,"fade_out":2}]'
  node $OV/scripts/gateway.mjs patch --project <dir> --actor human --base <n> --ops '[{"op":"add_event","start":5,"sound":"assets/sfx/whoosh.mp3"}]'
  # op khác: {"op":"move_event","id":"sfx-1","start":3.5} · {"op":"remove_event","id":"sfx-1"}
  node $OV/scripts/gateway.mjs undo  --project <dir> --base <phiên bản đang thấy>
  node $OV/scripts/gateway.mjs redo  --project <dir> --base <phiên bản đang thấy>
  node $OV/scripts/gateway.mjs log   --project <dir>
  ```
  Exit 3 CONFLICT: phiên bản đã đổi, đọc lại bằng `show` rồi làm lại. Exit 8 BUSY: tiến trình khác đang ghi, thử lại sau. Exit 5 INVALID: op sai hoặc kết quả phá luật manifest (đọc lý do tiếng Việt). Exit 7: không còn gì để hoàn tác. Exit 9: không còn gì để làm lại (`redo` chỉ chạy khi các thay đổi cuối là undo/redo; patch mới xoá khả năng làm lại). Danh sách op ở `--help`.
- Nhạc: `update_music` đổi nhiều trường của một khối một lần (`start`, `end` hoặc `null` = tới hết video, `media_start`, `gain`, `fade_in`, `fade_out`). Derive ghi `data-volume` (= `gain`), `data-media-start`, `data-fade-in`, `data-fade-out` lên thẻ `<audio>` của nhạc (bỏ thuộc tính khi bằng 0). `audio-mix.mjs` áp `afade`, nên fade chỉ nghe trong bản xuất, không nghe trong player xem trước.
- Hiệu ứng âm thanh gắn sự kiện nằm trong `events` của `project.json` (`{id, shot, offset, sound, label}`): `id` là id của thẻ `<audio>`, gateway ghi `data-start` = đầu shot + `offset`. `manifest-import` lấy chúng từ các hàng `## Sự kiện` của PLAN.md có file âm thanh, khớp thẻ `<audio>` theo `src` (thẻ cần `id`). Đổi, thêm, xoá shot thì SFX đi theo shot và `sfx-sync` vẫn PASS, không sửa tay `data-start` của SFX. Xoá shot thì sự kiện của nó bị bỏ (biên nhận cảnh báo, thẻ `<audio>` vẫn ở HTML); hoàn tác trả lại cả sự kiện lẫn hàng PLAN.md. `move_line` không đụng SFX, chỉ dời các hàng `chữ:` nằm trong câu đó.
- SFX thêm từ Studio hay qua `add_event` là sự kiện `studio: true` (id mặc định `sfx-<n>` chưa dùng, `volume` 0.8). Derive chèn thẻ `<audio … data-studio-sfx>` cho nó (`data-track-index` ≥ 30, sau thẻ `<audio>` cuối) và xoá thẻ đó khi sự kiện mất (`remove_event` hay hoàn tác `add_event`). Thẻ không có `data-studio-sfx` không bao giờ bị xoá. `remove_event` chỉ nhận sự kiện `studio: true`; SFX do đạo diễn đặt thì nhờ đạo diễn xoá. Id trùng một thẻ `<audio>` đã có (thẻ viết tay) bị từ chối: exit 5, Studio nhận HTTP 422, không file nào bị ghi. Sửa tay trên thẻ `data-studio-sfx` sẽ mất khi xoá rồi hoàn tác, vì thẻ được dựng lại từ manifest. `manifest-import --force` giữ các sự kiện studio của manifest cũ (sự kiện có shot không còn thì bỏ, kèm WARN).
- Sửa lời một câu (`set_line_text`) đặt `gate: stale`: chạy lại `ov-script` cho câu đó, rồi `ov-audio` tạo lại giọng, rồi `ov-deliver`.

## Motion Studio

Giao diện web trên máy để làm video từ đầu tới bản giao: tạo dự án, nạp footage, giao việc cho đạo diễn AI, bấm duyệt, xem và sửa timeline, xuất MP4. Gồm player, timeline (Shot, Lồng tiếng, Nhạc, SFX), inspector theo khối đang chọn (shot, câu, nhạc, SFX) và thanh bên sáu mục: Giao việc cho AI, Footage & chất liệu, Lời & giọng, Nhạc & âm thanh, Thư viện mẫu, Xuất bản (Alt+1…6; tab đang mở giữ trong `?tab=`).

Studio là repo riêng [abm-dungtq/motion-studio](https://github.com/abm-dungtq/motion-studio). Clone về thư mục nào cũng được rồi đặt `MOTION_STUDIO_HOME` là thư mục đó. `$OV/scripts/studio.mjs` là shim: tìm Studio ở `MOTION_STUDIO_HOME`, không đặt thì ở `~/Projects/motion-studio`, và chạy `bin/motion-studio.mjs` với cùng tham số. Chưa có Studio thì shim in lệnh `git clone`, dòng `export MOTION_STUDIO_HOME=…` và exit 2.

Đạo diễn do Studio chạy có `MOTION_STUDIO_RUNNER=cli` (Studio cũ đặt `OPUS_STUDIO_RUNNER=cli`). MCP server đọc tên mới trước, không có thì đọc tên cũ.

```bash
node $OV/scripts/studio.mjs start --background   # http://127.0.0.1:4317, gốc /Volumes/2/Edit-Video
node $OV/scripts/studio.mjs start --background --root <thư mục chứa các dự án>
node $OV/scripts/studio.mjs status               # running <url> (pid, root, từ …) | stopped
node $OV/scripts/studio.mjs stop                 # dừng khi xong việc
```

- Mỗi máy chỉ một server. `start` khi server đang chạy cho cùng thư mục gốc thì in URL; cho thư mục gốc khác thì từ chối (exit 3), dừng nó trước. Cổng 4317 bị tiến trình khác giữ: exit 3, không đổi cổng. Log nền: `~/.config/opus-video/studio.log`.
- **Dự án mới** (nút trên thanh trên cùng): tên (chữ thường, số, gạch nối), tỷ lệ 16:9 / 9:16 / cả hai, chế độ (`tu-dau` làm từ đầu, `video-co-san` dựng từ video có sẵn + B-roll, `theo-nhac`, `mau-nhanh`), thời lượng, chủ đề, đối tượng và việc đầu tiên cho đạo diễn. Server chạy `new-project.sh` (chép font Be Vietnam Pro từ `shared-assets/fonts/`), ghi `mode/topic/audience/duration_s` vào BRIEF.md (không bao giờ ghi `direction:`), tạo `project.json` sửa được, mở dự án và xếp việc đầu tiên. API: `POST /api/projects/new`.
- **Footage & chất liệu:** duyệt thư mục trên máy (trong home và `/Volumes`) rồi đăng ký file video, âm thanh, ảnh. File đã nằm trong `footage/`, `shared-assets/` hoặc `assets/` của dự án được dùng tại chỗ; file khác được chép vào `footage/raw/` (tên trùng thành `-2`, `-3`, không ghi đè). Mọi đường dẫn kiểm bằng realpath. Metadata lấy bằng ffprobe, lưu ở `.opus/media.json` cho đạo diễn đọc. API: `GET /api/media/browse`, `POST /api/media/register`, `GET /api/media`.
- **Chip agent** (góc phải thanh trên): `claude` có không, phiên bản, đã đăng nhập chưa (chỉ đọc cờ `loggedIn` của `claude auth status`), runner, job gần nhất, ffprobe và ffmpeg. API: `GET /api/agent`.
- Dự án là thư mục con trực tiếp của thư mục gốc có `project.json`. Thư mục có `index.html` và `BRIEF.md` mà chưa có manifest hiện nút **Nhập dự án** (chạy `manifest-import --write`).
- Mọi thao tác sửa đi qua gateway với actor `human`: kéo mép phải shot (`resize_shot`, bước 0,1 s, tối thiểu 0,5 s), kéo câu thoại (`move_line`), Áp dụng trong inspector (`set_shot`, `resize_shot`), sửa lời (`set_line_text`, gate thành `stale`), thanh âm lượng nhạc (`set_music`), khối nhạc và SFX (`update_music`, `move_event`, `add_event`, `remove_event`, xem "Timeline"), Hoàn tác hoặc Ctrl/Cmd+Z (`undo`), Làm lại hoặc Ctrl/Cmd+Shift+Z (`redo`). Kéo chuột chỉ xem trước tại chỗ, thả ra mới gửi đúng một patch. Phiên bản đã đổi (409) thì Studio tải lại và báo "Đã có thay đổi mới, đã tải lại".
- **Timeline.**
  - Track SFX hiện mọi `events`: kéo khối gửi `move_event`; chuột phải "Thêm SFX tại đây…" chọn file trong `assets/` hoặc `shared-assets/sfx/` (file chung được chép vào dự án, trùng tên thành `-2`) rồi gửi `add_event`. Delete và "Xoá SFX" chỉ áp cho SFX thêm từ Studio; SFX do đạo diễn đặt có "Nhờ đạo diễn" thay vào.
  - Cắt shot: chọn shot, đặt playhead bên trong, bấm S. Một patch `resize_shot` + `add_shot` (+ `move_line`/`move_event` cho phần sau điểm cắt), tổng thời lượng không đổi. Shot mới **trống** (chưa có cảnh HTML, preflight final FAIL); Studio báo và đưa nút "Nhờ đạo diễn dựng shot mới".
  - Nhạc: kéo thân dời `start`, kéo mép trái cắt đầu (`start` + `media_start`), kéo mép phải cắt cuối (`end`); inspector chỉnh `gain`, `fade_in`, `fade_out`. Mỗi thao tác một `update_music`. Fade chỉ nghe trong bản xuất (audio-mix), player xem trước không fade.
  - Phím tắt (không chạy khi con trỏ ở ô nhập liệu): Space phát/dừng, J lùi một giây, K dừng, L phát, ←/→ một khung, Shift+←/→ một giây, Home/End về đầu/cuối, S cắt shot, Delete (hoặc Backspace) xoá SFX studio, +/− zoom, N bật/tắt hít, Cmd/Ctrl+Z hoàn tác, Cmd/Ctrl+Shift+Z làm lại, Shift+Z vừa khung. Kéo thước hoặc playhead để tua; Ctrl/Cmd+cuộn để zoom quanh con trỏ.
  - Nút Làm lại luôn bật trên dự án sửa được; không còn gì để làm lại thì hiện toast "Không còn gì để làm lại".
  - Hít (phím N hoặc nút "Hít"): khi kéo, mép khối hít vào playhead, mép shot, đầu/cuối câu, SFX, phách nhạc và đầu từ trong 8px, có vạch hít.
  - Trợ giúp nhìn: sóng âm trên khối giọng và nhạc (SFX không vẽ), vạch phách trên thước, chấm đầu từ khi zoom đủ lớn, nút "Vừa khung".
  - M/S (tắt tiếng/solo) trên nhãn track Lồng tiếng, Nhạc, SFX chỉ đổi player xem trước, không đổi `project.json` hay bản xuất.
  - Chip cổng cạnh nút Xuất video (`GET /api/gates`, chạy `check-preflight --stage final --json`): "Cần duyệt lại animatic" (bấm mở tab Giao việc cho AI) hoặc "Chưa đủ cổng xuất"; tab Xuất bản liệt kê các dòng FAIL phía trên nút Xuất video.
- Dự án chỉ xem hiện banner "Dự án nhập từ bản cũ: chỉ xem, sửa qua đạo diễn" và khoá mọi thao tác sửa.
- Bảo mật: chỉ nghe 127.0.0.1, kiểm tra Host và Origin, POST cần token của lần chạy (lưu trong `~/.config/opus-video/studio.json`, chmod 600). Không phục vụ `.env`, `.git` hay dotfile ngoài `.opus/`. Tiến trình cùng user trên máy nằm trong vùng tin cậy.

### Đạo diễn AI và xuất video từ Studio

- Yêu cầu cho đạo diễn: ô "Nhờ đạo diễn sửa" (phạm vi `project`), nút "Nhờ đạo diễn" trong inspector (phạm vi `shot`, kèm thời điểm playhead và ghi chú chuyển động), câu đã sửa lời trong tab Lồng tiếng (phạm vi `line`: duyệt viet-pro rồi lồng tiếng lại), "Dùng mẫu này" trong tab Nhanh. Dự án chỉ xem vẫn nhận yêu cầu, vì đạo diễn sửa HTML trực tiếp.
- Vòng đời một yêu cầu: `queued` → `running` → `done` (kèm biên nhận), `failed` (kèm lý do) hoặc `waiting_user` (đạo diễn hỏi bằng `studio_ask`). Tab Giao việc cho AI là khung hội thoại: yêu cầu, biên nhận, log trực tiếp, nút Huỷ và thẻ hỏi. Huỷ được cả yêu cầu đang chờ và yêu cầu bị kẹt ở `running`.
- **Thẻ hỏi và cổng duyệt.** Đạo diễn gọi `studio_ask` (kiểu `choice`, `approve` hoặc `text`, kèm file để xem) rồi kết thúc lượt; yêu cầu thành `waiting_user` và tab hiện huy hiệu. Người dùng trả lời trên thẻ (`POST /api/director/answer`); server tạo một yêu cầu nối tiếp (`follows`, cùng phiên, `--resume`). Hai cổng chỉ server ghi, theo cú bấm của người dùng: thẻ `gate: direction` chạy `make-pitch.mjs choose --pick N` (BRIEF `direction:`), thẻ `gate: animatic` được duyệt thì ghi `approval: user@studio <thời điểm> duyệt animatic <file>` vào DEMO.md. Đạo diễn bị chặn ghi `DEMO.md`, `BRIEF.md`, chạy `make-pitch.mjs choose`, `replace-in-file.mjs`, `cp`, `mv` hay lệnh Bash nhắc tới hai file đó. `waiting_user` quá 24 giờ thành `failed`; giao lại việc là tiếp tục được.
- Runner đặt trong `~/.config/opus-video/studio.json`, giữ qua các lần start/stop: `{"director": {"runner": "cli"}}` (mặc định) hoặc `"mcp"`.
  - `cli`: Studio tự chạy `claude -p` trong thư mục dự án, với `--permission-mode acceptEdits`, chỉ cho Read/Edit/Write/Glob/Grep, `node $OV/scripts/…`, `npx hyperframes …` và bảy tool MCP `opus-video`, cấm WebFetch/WebSearch. Mỗi dự án chạy một yêu cầu một lúc, yêu cầu sau chờ tới lượt. Phiên được nhớ trong `.opus/director.json` và lần sau `--resume`; resume hỏng thì chạy lại một lần với phiên mới. Đạo diễn đóng yêu cầu bằng `studio_request_done`; nếu nó thoát mà chưa đóng thì câu trả lời cuối thành biên nhận (exit 0) hoặc yêu cầu thành `failed` kèm 20 dòng log cuối. Đổi thời gian hoặc chuyển động thì đạo diễn chạy lại `recipe-pack` và `make-demo --animatic`; DEMO.md về `approval: pending`, nên "Xuất video" bị chặn tới khi người dùng duyệt lại animatic.
  - `mcp`: yêu cầu nằm chờ cho một phiên Claude Code đang mở lấy bằng `studio_request_next`.
- **Xuất video:** chạy `render-final.mjs` (giữ mọi cổng) ra `renders/<dự án>-<thời điểm>.mp4`, rồi `compress-final.sh` ra `…-final.mp4`. Exit 5 thì Studio báo "Thiếu cổng: …" với các dòng FAIL và không nén. Mỗi dự án chạy một job xuất một lúc. `stop` dừng mọi job (SIGTERM, 5 s sau SIGKILL), nên không còn tiến trình mồ côi.

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
| `studio_ask` | `project`, `id`, `kind`, `question`, `options?`, `artifacts?`, `gate?` | hỏi người dùng trong Studio: yêu cầu thành `waiting_user`; kết thúc lượt ngay, câu trả lời đến ở lượt sau |

Luật của đạo diễn:

- Luôn gọi `project_get` trước, rồi patch với đúng `base` vừa đọc. `CONFLICT` thì đọc lại và làm lại, không đoán phiên bản.
- Sửa chuyển động bên trong một shot bằng cách sửa HTML của cảnh đó. Mọi thay đổi về thời gian (độ dài shot, vị trí câu thoại, nhạc) chỉ đi qua `project_patch`, không sửa tay số giây.
- Đổi lời một câu (`set_line_text`) để `gate: "stale"` cho tới khi câu đó qua cổng `ov-script`; chỉ khi đó mới tạo lại giọng của riêng câu đó qua `ov-audio`.
- Cần người dùng chọn hướng hay duyệt animatic thì hỏi bằng `studio_ask` với `gate` tương ứng, không tự ghi `direction:` hay dòng `approval:`.
- Xong yêu cầu thì gọi `studio_request_done` với biên nhận tiếng Việt liệt kê mọi file và op đã đổi; không làm được thì `ok: false` kèm lý do.
