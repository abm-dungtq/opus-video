---
name: ov-direction
description: "Bước 1b của opus-video: gợi ý 2–3 phong cách lemo-opuscar bằng Jev (lemo-pick.mjs), pitch sáng tạo gồm 3 styleframe dựng bằng nội dung thật của người dùng (make-pitch.mjs init/render/choose), người dùng chọn hướng đạo diễn bằng mắt, rồi ghi direction, energy, palette, word_budget và style_profile vào BRIEF.md. Bắt buộc với dự án mới (brief_version: 2) trong hướng dao-dien và tu-nhac. Không dùng cho hướng nhanh theo mẫu (ov-cases), cho footage chỉ cắt gọn (ov-footage) hay để viết kịch bản (ov-script)."
---

# ov-direction: pitch 3 styleframe, chọn hướng và style

`$OV` là thư mục gốc plugin opus-video, nơi có `scripts/` và `references/`: Claude Code `${CLAUDE_PLUGIN_ROOT}` (cài tại chỗ: `~/.claude/skills/opus-video`), Codex `~/.agents/skills/opus-video`, Antigravity `~/.gemini/config/skills/opus-video` (CLI: `~/.gemini/antigravity-cli/skills/opus-video`); tức thư mục chứa `skills/` và `scripts/` của plugin. Mọi lệnh là `node $OV/scripts/<x>.mjs` (PowerShell: thay `$OV` bằng đường dẫn đầy đủ).

## Bước 1b: pitch sáng tạo

**Gợi ý phong cách lemo-opuscar (trước `init`, một lần mỗi dự án).** [lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) của LemoLab có 59 phong cách phim dựng bằng code (mã MIT, phim mẫu CC BY 4.0). Jev chọn 2–3 phong cách hợp brief:

- Dùng `BRIEF.case-query.json` đã viết ở bước gợi ý case (`ov-cases`); chưa có thì viết theo khuôn ở đó và chạy `rerank-cases.mjs --suggest --project .` trước. Rồi chạy:
  ```bash
  node $OV/scripts/lemo-pick.mjs rank --brief-json BRIEF.case-query.json --limit 3 --stats
  ```
  Script tự đọc `TYPESAFE_API_KEY` (không source/cat/echo file key). Có key thì Jev chấm cả 59 phong cách trong một lượt, mất khoảng 1 giây, chưa tới 0,01 USD. Không có key, API lỗi hay hết giờ thì script tự xếp theo từ khoá và vẫn exit 0. Có key mà Jev lỗi thì stderr có dòng `lemo-pick: Jev unavailable (…)`; báo người dùng nếu là 401. Exit 4 là chưa có thư viện: chạy `node $OV/scripts/lemo.mjs fetch` (cần mạng, một lần mỗi máy) rồi chạy lại.
- Mỗi kết quả có `lý do` và một nhãn. **lớp canvas** nghĩa là `lemo.mjs add` vẽ được engine của phong cách đó dưới composition. **theo ngữ pháp** nghĩa là dựng bằng GSAP, DOM hoặc canvas của dự án theo `STYLE.md` của phong cách. Dòng `> note: weak matches` nghĩa là không phong cách nào sát brief; khi đó nói rõ với người dùng và đề nghị bỏ qua.
- Gửi người dùng 2–3 phong cách, mỗi phong cách kèm tên, lý do bằng tiếng Việt và link phim mẫu ở gallery https://lemomo-ai.github.io/lemo-opuscar/. Hỏi một câu: chọn phong cách nào, hay không dùng. Người dùng nói chạy không dừng thì lấy hạng 1.
- Người dùng chọn thì ghi lựa chọn bằng lệnh, không gõ tay. Giá trị `--search` chép nguyên trường `lemo_search` của dòng `--stats`, ví dụ `jev` hoặc `keyword (no TYPESAFE_API_KEY)`:
  ```bash
  node $OV/scripts/lemo-pick.mjs choose --project . --style <slug> --search "<lemo_search>"
  ```
  Phong cách lớp canvas được ghi thành `lemo_style: <slug>`, nên `make-pitch init` tự dùng nó cho hướng táo bạo. Phong cách theo ngữ pháp được ghi thành `lemo_ref: <slug>`; `make-pitch init` khi đó không gán style profile cho hướng nào, mà ghi vào `STYLEFRAME.md` của mọi hướng đường dẫn `STYLE.md` của phong cách để dựng giao diện theo ngữ pháp đó, và `choose` không ghi `style_profile` (thêm `--style-profile` nếu muốn mượn bảng màu và chữ của một profile). Cả hai trường hợp đều ghi `lemo_search:` và thêm một dòng ghi công LemoLab vào `assets/CREDITS.md`. Chỉ học ngữ pháp hình của phong cách, không chép câu chuyện, cảnh hay chữ ký của phim mẫu.

**3 styleframe, người dùng chọn bằng mắt (BẮT BUỘC với dự án mới: BRIEF có `brief_version: 2`).** Danh mục 8 hướng đạo diễn và 5 nhóm từ khoá ở `$OV/references/creative-directions.md` (sinh từ `data/directions.json`; mọi token là tên có thật trong HyperFrames, `directions.mjs check` kiểm).

- **Chọn 3 hướng tương phản:** `node $OV/scripts/make-pitch.mjs init --project . --topic "<chủ đề>" --aspect <…> --category <motion|explainer|3d|interactive|product|story-music|bat-dong-san> --energy <em|vua|don-dap> --duration <giây>`. Script chọn tất định một hướng *khớp chủ đề nhất*, một hướng *liền mạch không cắt*, một hướng *táo bạo*, tạo `pitch/<n>-<slug>/` (project HyperFrames trống) kèm `STYLEFRAME.md` và `RECIPES.md` cho từng hướng. Thêm `--lemo <watercolor|glass-product>` khi chủ đề hợp một phong cách vẽ bằng code (thuỷ màu, sản phẩm thuỷ tinh): hướng táo bạo nhận profile lemo đó, project của nó bắt đầu từ skeleton opus-video, và `STYLEFRAME.md` ghi lệnh `lemo.mjs add` cần chạy (`$OV/references/lemo-canvas.md`). Font mà `index.html` của styleframe nạp từ `assets/fonts/` (skeleton dùng Be Vietnam Pro) được chép sang từ `assets/fonts/` của dự án hoặc thư mục font của máy; thiếu thì `init` cảnh báo và `render` dừng (exit 2).
- **Dựng 3 styleframe ~3 giây** bằng chính chữ/khái niệm của người dùng: mỗi `pitch/<n>-*/index.html` viết theo `STYLEFRAME.md` và đọc hết `RECIPES.md` trước khi viết. Không lorem ipsum, không bịa số, không chữ ở 4 góc, chuyển động liên tục. Có ví dụ cùng hướng (dòng `Ví dụ cùng hướng` trong `STYLEFRAME.md`) thì đọc để học cách dựng. Viết 3 styleframe bằng 3 agent song song khi runtime cho phép; viết tuần tự thì tính khoảng 15 phút.
- **Render và trình bày:** `node $OV/scripts/make-pitch.mjs render --project .` → `pitch/1..3.mp4`, `pitch/sheet.jpg` (3 khung xếp 1·2·3), `pitch/PITCH.md` (menu số, 2 núm nhịp/tông màu, 3–4 từ khoá đổi được mỗi nhóm, nhãn tiếng Việt). Tự xem sheet và từng clip trước (chữ tràn, dấu, vùng an toàn; MOTION `FAIL` thì dựng lại; `render` trả exit 4), rồi **gửi PITCH.md + sheet.jpg + 3 clip cho người dùng và dừng chờ**. Trên Antigravity có thể nhúng ảnh/clip vào chat; trên mọi agent, menu số trong PITCH.md là đủ.
- **Ghi lựa chọn:** người dùng trả lời `2` hoặc `2, chuyển cảnh: lao-xuyen-tam, nhịp: em`. Chạy `node $OV/scripts/make-pitch.mjs choose --project . --pick 2 [--transition lao-xuyen-tam] [--energy em] [--style …] [--visual …] [--effect …] [--sfx …] [--palette …]`. Exit **3** = phối không hợp: hỏi người dùng **một lần** kèm lý do; họ vẫn giữ thì chạy lại với `--accept-warnings`. Script ghi vào `BRIEF.md`: `direction`, `direction_swaps`, `energy`, `palette`, `word_budget`, `music_only_s`, `creative_selection`, `styleframe` và mục `## creative_direction`.
- **Chạy không dừng:** chỉ khi người dùng nói rõ, dùng `choose --auto` (hướng 1, ghi `creative_selection: auto`) và vẫn gửi PITCH.md trong báo cáo cuối.
- Styleframe được chọn là **cảnh mở đầu** của video thật (dựng tiếp ở bước 6, `ov-build`), không phải đồ bỏ đi.
- **Style** (trục thứ hai, độc lập với hướng): `choose` ghi `style_profile:` theo styleframe đã chọn; đổi bằng `--style-profile <id|alias>`, tìm bằng `styles.mjs find "<từ khoá>"`. Chỉ đọc `data/styles/index.json` và đúng một profile. Phối style theo cảnh: `$OV/references/style-system.md`.

Sau bước này: viết kịch bản theo hướng đã chọn (`ov-script`), vì kịch bản viết **sau** khi đã có hướng.

## Tham chiếu

| File | Dùng khi |
|---|---|
| `$OV/references/creative-directions.md` | Bước 1b: 8 hướng đạo diễn, 2 núm, 5 nhóm từ khoá đổi được, từ vựng chuyển cảnh (sinh từ `data/directions.json`) |
| `$OV/scripts/directions.mjs` | Bước 0/1b: `check` (token có thật trong HyperFrames, cũng chạy trong setup-check), `pick` (3 hướng tương phản), `compat` (cảnh báo phối sai), `doc --write` |
| `$OV/scripts/make-pitch.mjs` | Bước 1b: `init` (3 project styleframe + STYLEFRAME.md + RECIPES.md; `--lemo` đặt một style lemo-canvas cho hướng táo bạo), `render` (3 clip, sheet.jpg, PITCH.md menu số; exit 4 khi styleframe FAIL MOTION), `choose` (ghi BRIEF, exit 3 khi phối sai) |
| `$OV/scripts/lemo-pick.mjs` | Bước 1b: `rank` (Jev xếp hạng 59 phong cách lemo-opuscar theo brief, thiếu key hay lỗi thì xếp theo từ khoá), `choose` (ghi `lemo_style` hoặc `lemo_ref`, `lemo_search` và ghi công) |
| `$OV/references/lemo-canvas.md` | Lớp canvas lemo, cách chọn phong cách, giấy phép và ghi công |
| `$OV/scripts/recipe-pack.mjs` | Bước 1b (và 6): gom blueprint/rule/seam theo hướng thành `RECIPES.md` |
| `$OV/references/style-system.md` | Bước 1b và 4b: 64 style, `style_profile`, `## style_layers`, luật resolve theo cảnh (`styles.mjs`) |
| `$OV/scripts/styles.mjs` | `find`, `show`, `suggest --direction`, `resolve --project` (cú pháp ở `--help`) |
| `$OV/scripts/brand.mjs` | `make-pitch` tự đọc brand kit (màu, font, logo, hướng bị cấm) |
