---
name: ov-build
description: "Phần dựng của opus-video: bước 3 STORYBOARD.md, bước 4 chọn engine và khung composition, bước 4b PLAN.md và cổng check-preflight --stage plan, bước 6 dựng cảnh HyperFrames (recipe-pack, catalog, 9:16 bằng reframe), bước 6b clip nháp animatic (make-demo --animatic) chờ người dùng duyệt và cổng --stage final, bước 7 render nháp. Dùng sau ov-script ở mọi hướng làm video mới. Không dùng để tra case (ov-cases), tạo giọng/nhạc (ov-audio), render bản giao, QA bản final hay caption (ov-deliver), cắt footage thật (ov-footage)."
---

# ov-build: storyboard, PLAN, dựng, animatic

`$OV` là thư mục gốc plugin opus-video, nơi có `scripts/` và `references/`: Claude Code `${CLAUDE_PLUGIN_ROOT}` (cài tại chỗ: `~/.claude/skills/opus-video`), Codex `~/.agents/skills/opus-video`, Antigravity `~/.gemini/config/skills/opus-video` (CLI: `~/.gemini/antigravity-cli/skills/opus-video`); tức thư mục chứa `skills/` và `scripts/` của plugin. Mọi lệnh là `node $OV/scripts/<x>.mjs` (PowerShell: thay `$OV` bằng đường dẫn đầy đủ).

## 3. Storyboard

Viết `STORYBOARD.md` từ bảng của viet-pro và hướng đã chọn, cộng thêm khối `<structure>` trong brief: BPM, beat, mỗi beat một hành động, cột blueprint/rule, cột seam nối sang beat sau, cột SFX (ưu tiên bảng SFX của hướng). Trước khi viết, tra case gần nhất bằng skill `ov-cases` (một lần mỗi dự án). Đọc `references/edit-method.md` trước khi viết STORYBOARD (`$OV/references/edit-method.md`).

## 4. Engine

Chọn theo `references/engine-selection.md` (`$OV/references/engine-selection.md`). Mặc định là HyperFrames. Ghi `engine`, `workflow`, `engine_reason` vào `BRIEF.md`. Nhiều biến thể của cùng một mẫu thì dùng `render --batch` của HyperFrames, không chuyển sang Remotion.

- **Dựng tay** (general-video, mặc định; HyperFrames 0.8.185 trở đi chỉ còn cách này, loại video đọc ở `hyperframes/references/types/`): khung là `node $OV/scripts/composition.mjs init --project .` (`new-project.sh` đã gọi sẵn): `index.html` có bộ hàm hoạt hình, `W(cảnh, "cụm từ")` mốc theo lời, `B(n)` mốc theo phách. Không gõ tay số giây. Karaoke tiếng Việt (`data-karaoke`), envelope giọng (`data-voice-env`), mascot và HUD (`composition.mjs add-part`) là lớp tuỳ chọn, phải bật trước animatic: xem `$OV/references/karaoke-va-mascot.md`.
- **Lớp lemo-canvas** (`lemo_style:` trong BRIEF, hoặc `style_profile` có `engine: lemo-canvas`): `node $OV/scripts/lemo.mjs add --project . --style <slug>` rồi viết `assets/lemo/scene.js` hoặc `scene3d.js`. Đọc `$OV/references/lemo-canvas.md` trước khi viết scene.

## 4b. Plan

**Plan (BẮT BUỘC).** Viết `PLAN.md` theo mẫu trong `$OV/references/plan-demo.md`: Mục tiêu · **Ý đồ sáng tạo** (Hướng, Style, Hình chủ đạo, Hiệu ứng, Chuyển cảnh, SFX, Luật chống slideshow) · Cảnh (bảng 7 cột: `# | Thời điểm | Lời đọc | Hình / hiệu ứng | Blueprint/Rule | Nối sang beat sau | Âm thanh`) · Âm thanh · Engine · Khung hình demo (mỗi cảnh ít nhất một mốc giây cần xem) · Khung hình demo 9:16 (khi `aspect: both`) · QA.

- Cổng sáng tạo chặn: blueprint/rule không có thật, hàng không nêu cách dựng, seam `fade`/`crossfade`/`cut`, seam mềm khi hướng không cho phép, tổng beat không lời < `music_only_s`.
- **Cổng:** `node $OV/scripts/check-preflight.mjs --project . --stage plan` phải `PASS` (exit 0) **trước** khi tạo voice (bước 5, `ov-audio`) và dựng (bước 6).
- Gửi tóm tắt plan cho người dùng. Người dùng đổi ý thì sửa `PLAN.md` và chạy lại cổng. Dự án có `project.json`: đổi khung thời gian shot bằng `gateway.mjs patch` (`ov-studio`), gateway tự ghi lại cột Thời điểm.

## 6. Dựng

Chép mục "Sàn chất lượng", "Chống slideshow" và "Kỷ luật GSAP" của `edit-method.md` vào prompt frame worker.

- **Bắt buộc gom công thức:** `node $OV/scripts/recipe-pack.mjs --project .` → `build/RECIPES.md` (blueprint, rule, seam mà PLAN.md khai, lấy nguyên văn từ HyperFrames). Đọc hết trước khi viết HTML; với frame worker thì chép vào prompt. Áp dụng cả khi dựng tay `general-video`. Cổng final chặn khi file này thiếu hoặc cũ hơn PLAN.md.
- Cảnh mở đầu dựng tiếp từ styleframe đã chọn (`styleframe:` trong BRIEF.md).
- HyperFrames: gọi skill `hyperframes`. Vì đã có `BRIEF.md`, nó sẽ đi vào workflow ghi ở `workflow:`.
- **Bắt buộc** chạy `hyperframes catalog --query "<hiệu ứng>"` trước khi tự viết hiệu ứng, và ưu tiên block hoặc blueprint đã chọn ở bước 3.
- Workflow có frame preset (`build-frame.mjs`): kiểm tra font preset có đủ dấu tiếng Việt (`engine-selection.md`). Thiếu thì đổi sang Be Vietnam Pro và copy file font vào `assets/fonts/`.
- Remotion: dùng skill `ak-remotion`.
- Lớp lemo-canvas: scene là hàm thuần của `t`, mốc theo tỉ lệ shot, chữ tiếng Việt ở lớp DOM (`references/lemo-canvas.md`). Bản 3D render chậm khoảng 5 lần, nên xem nháp bằng `ssaa: 1`.
- Raw canvas: làm theo công thức trong `engine-selection.md`.
- Với `aspect: both`, bản dọc phải dàn lại bố cục, không crop:
  - **Dự án mới** (một `index.html`): viết phần khác của khổ dọc trong `html[data-ratio="9x16"]`, rồi `node $OV/scripts/reframe.mjs ./ --ratio 9x16` (hoặc `1x1`) sinh `../<project>-9x16`. Chi tiết và giới hạn ở `engine-selection.md`.
  - **Dự án cũ dựng tay**: 2 composition trong cùng project, gồm `index.html` (1920×1080) và `compositions/main-9x16.html` (1080×1920).
  - **Workflow có frame worker** (faceless-explainer, pr-to-video, product-launch-video; chỉ khi máy còn skill cũ của HyperFrames ≤ 0.8.184): làm **một project 9:16 riêng**, theo mục "Bài học từ smoke v2" trong `engine-selection.md`. Sau mỗi lần `captions.mjs build` ở 1080×1920, **bắt buộc** chạy `node $OV/scripts/replace-in-file.mjs compositions/captions.html "--cap-band-top: [0-9]*px;" "--cap-band-top: 1340px;" "--cap-band-height: [0-9]*px;" "--cap-band-height: 200px;"`, vì mặc định 1600px rơi vào vùng UI che.
- **Ảnh và clip AI (tuỳ chọn):** `node $OV/scripts/gflow.mjs image|video` qua Google Flow. Prompt luôn nằm trong file của dự án (`--prompt-file`), đầu ra trong `assets/gen/`, mỗi lần chạy ghi `assets/gen/gflow-ledger.jsonl`. Mọi lần chạy dồn vào một dự án Flow có tên (`--flow-project <tên>`, mặc định là tên thư mục dự án), id lưu ở `assets/gen/gflow-projects.json`, nên không sinh dự án nháp mới mỗi lần; dự án bị xoá trên web thì lệnh báo lỗi chứ không tự tạo lại. Ảnh (`image`, mặc định Nano Banana 2, 9:16) không tốn credit; nhân vật lặp lại phải đưa bảng nhân vật đã duyệt vào `--ref`. Clip (`video`, ảnh khung đầu `--start`, tuỳ chọn `--end`) tốn credit Flow: chỉ chạy khi người dùng đã đồng ý, kèm `--spend`, mỗi lần một clip. Thêm `--upscale` để file ở `--out` là bản 1080p xuất miễn phí thay cho bản 720p (cần gflow cài từ gflow-studio, có `video i2v --upscale`); xuất 1080p lỗi thì giữ bản 720p, in cảnh báo và ghi vào ledger. Lệnh không bao giờ tự gửi lại; lỗi thì đọc mã thoát (23 là Flow đổi giao diện, chạy `gflow update`) rồi hỏi người dùng trước khi tạo lại. Clip AI là một lớp trong composition như footage, không thay cho plan và animatic.
- Áp dụng banned list trong brief.
- Đặt câu chữ dài nhất sẽ dùng vào cảnh rồi chạy `npx hyperframes check --at-transitions`: chữ tràn hay đè nhau ở chỗ nối cảnh thì sửa chữ hoặc bố cục trước khi chỉnh chuyển động.

## 6b. Clip nháp và duyệt

**Khung hình demo (BẮT BUỘC trước video cuối).** Làm theo `references/plan-demo.md`:

- Dự án có `direction:`: `node $OV/scripts/make-demo.mjs --project ./ --animatic` (bản 9:16: thêm `--aspect 9x16 --hyperframes ../<project>-9x16`, là bản `reframe.mjs` sinh hoặc project 9:16 riêng; dự án cũ có `compositions/main-9x16.html` thì `--composition` file đó; cổng final chặn `animatic_9x16` có khung ngang). Script render clip nháp toàn bộ `demo/animatic.mp4`, cắt đúng các mốc trong `PLAN.md`, ghép `demo/contact-sheet.jpg` và ghi `DEMO.md` (`animatic:` + `approval: pending`). Dự án `creative_override` chụp ảnh tĩnh như cũ (bỏ `--animatic`); riêng hướng `nhanh` vẫn chạy `--animatic`.
- Script cắt thêm một sheet mỗi cảnh (`demo/scenes/sheet-s<#>.jpg`, khoá `scene_sheets:`; bản 9:16 ở `demo/9x16/scenes/`, khoá `scene_sheets_9x16:`). Xem từng sheet theo danh sách kiểm trong `$OV/references/motion-craft.md`.
- Tự xem từng khung (đủ dấu, không tràn chữ, vùng an toàn, đúng nội dung cảnh) và chạy `qc-mp4.mjs demo/animatic.mp4 --project . --draft` (MOTION không được FAIL), rồi **gửi clip nháp + contact sheet cho người dùng duyệt** và dừng chờ trả lời. Người dùng duyệt chuyển động, không chỉ ảnh tĩnh.
- Có góp ý thì ghi `REVISIONS.md` theo `$OV/references/revisions.md`, kiểm từng mục bằng `snapshot --at`, hết vòng mới chạy lại `make-demo --animatic`. Người dùng đồng ý thì ghi `approval: <ai>, <khi nào>, "<lời đồng ý>"` vào `DEMO.md`. Chỉ khi người dùng đã nói rõ là chạy không dừng mới được ghi `approval: auto — <lý do và lời người dùng>`.
- Kiểm: `node $OV/scripts/check-preflight.mjs --project . --stage final` phải `PASS`.
- Với dự án có `direction:`, cổng final đo từng SFX theo bảng `## Sự kiện` trong `PLAN.md`. Gặp dòng `SYNC FAIL` thì chạy `node $OV/scripts/sfx-sync.mjs --project . --fix` và sửa `data-start` theo đề xuất.

## 7. Render nháp

- Bản nháp/QA, 16:9: `hyperframes render --quality looks --output renders/<name>-16x9.mp4`
- Bản nháp/QA, 9:16: `hyperframes render -c compositions/main-9x16.html --quality looks --output renders/<name>-9x16.mp4`. Nếu là project 9:16 riêng thì chạy `hyperframes render` ngay trong thư mục đó.
- `--resolution` chỉ đổi kích thước render, không đổi khổ hình.
- Bản giao cuối: sang `ov-deliver` (chỉ render qua `render-final.mjs`).

## Tham chiếu

| File | Dùng khi |
|---|---|
| `$OV/references/engine-selection.md` | Bước 4 và 6: chọn engine, xử lý 16:9 / 9:16 |
| `$OV/references/plan-demo.md` | Bước 4b, 6b, 7: mẫu `PLAN.md`, chụp và duyệt demo, `DEMO.md`, render bản cuối |
| `$OV/references/edit-method.md` | Bước 3 và 6: chức năng câu → hình, sàn chất lượng, GSAP, SFX |
| `$OV/references/motion-craft.md` | Bước 6 và 6b: mức hiệu ứng theo `energy`, 10 nguyên tắc, bộ kỹ thuật của skeleton, danh sách kiểm từng cảnh; mục 7: giới hạn renderer (khung đen khi quá nhiều gradient, blur, clip-path), phản ứng theo kick, drop, silent stop và cắt cảnh theo beat |
| `$OV/scripts/check-preflight.mjs` | Bước 4b (`--stage plan`) và 6b (`--stage final`): cổng plan + demo + duyệt; cổng sáng tạo (Ý đồ sáng tạo, blueprint/rule có thật, seam mỗi beat, beat không lời, animatic không đứng yên, RECIPES.md) |
| `$OV/scripts/recipe-pack.mjs` | Bước 6 (và 1b): gom blueprint/rule/seam theo PLAN.md hoặc theo hướng thành `build/RECIPES.md` |
| `$OV/scripts/make-demo.mjs` | Bước 6b: chụp khung hình demo theo `PLAN.md`, ghi `DEMO.md`; `--animatic` render clip nháp toàn bộ + contact sheet (bắt buộc với dự án có `direction:`); `--from-video` cắt từ bản nháp người dùng đã xem |
| `$OV/scripts/sfx-sync.mjs` | Bước 6b và 8: đo lúc SFX thật sự vang so với `## Sự kiện` trong `PLAN.md`, ngưỡng theo ITU-R BT.1359-1; `--fix` in đề xuất `data-start` (không sửa HTML); `--write-qa` ghi vào `QA.md` |
| `$OV/scripts/composition.mjs` | Bước 4: khung composition từ skeleton (`init`), chèn mascot hay HUD (`add-part`) |
| `$OV/references/karaoke-va-mascot.md` | Bước 4 và 6: karaoke, envelope giọng, mascot, HUD, chữ ký |
| `$OV/scripts/lemo.mjs` | Bước 4 và 6: lớp lemo-canvas (`fetch`, `list`, `add --style`, `remove`) |
| `$OV/references/lemo-canvas.md` | Bước 4 và 6: hợp đồng scene `lemoRender(t, win)`, ghi công, tốc độ render, thêm phong cách |
| `$OV/scripts/reframe.mjs` | Bước 6: bản 9:16/1:1 của dự án một `index.html` |
| `$OV/scripts/gflow.mjs` | Bước 6: ảnh (`image`, Nano Banana) và clip từ ảnh (`video`, Veo / Omni Flash, cần `--spend`) qua gflow-cli; `doctor` kiểm tra cài đặt và đăng nhập |
| `$OV/scripts/styles.mjs` | Bước 4b: `resolve --project` in khối style theo cảnh cho `## Ý đồ sáng tạo` |
