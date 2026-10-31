---
name: ov-cases
description: "Gợi ý và tra corpus case video làm bằng Opus 5.5 của opus-video: chuẩn hoá brief sang JSON tiếng Anh, Jev xếp hạng (rerank-cases.mjs --suggest) rồi gửi người dùng 2–3 case kèm lý do, đọc case và chọn thẻ kỹ thuật trong pattern-library; kèm hướng vận hành nhanh/theo mẫu (một case thay cho 3 styleframe). Dùng ngay sau ov-brief ở mọi hướng làm video mới (một lần mỗi dự án), ở bước storyboard khi chưa có CASES.md, hoặc khi người dùng nói làm nhanh, theo mẫu, giống video này. Không dùng để chọn hướng bằng styleframe (ov-direction), viết storyboard/PLAN (ov-build) hay đọc thẳng data/cases.jsonl."
---

# ov-cases: tra case và hướng nhanh theo mẫu

`$OV` là thư mục gốc plugin opus-video, nơi có `scripts/` và `references/`: Claude Code `${CLAUDE_PLUGIN_ROOT}` (cài tại chỗ: `~/.claude/skills/opus-video`), Codex `~/.agents/skills/opus-video`, Antigravity `~/.gemini/config/skills/opus-video` (CLI: `~/.gemini/antigravity-cli/skills/opus-video`); tức thư mục chứa `skills/` và `scripts/` của plugin. Mọi lệnh là `node $OV/scripts/<x>.mjs` (PowerShell: thay `$OV` bằng đường dẫn đầy đủ).

## Gợi ý case (ngay sau brief, mọi hướng làm video mới)

Một lần mỗi dự án, trước `ov-direction` (hay trước khi chọn case ở hướng `nhanh`):

1. Viết `BRIEF.case-query.json` theo khuôn ở mục dưới.
2. Chạy:
   ```bash
   node $OV/scripts/rerank-cases.mjs --suggest --project . --category <motion|explainer|3d|interactive|product|story-music> --keyword <từ khoá tiếng Anh>
   ```
   Script đọc `BRIEF.case-query.json` và `aspect` trong đó (chưa có file này thì đọc thẳng `BRIEF.md`, kém chính xác hơn; Motion Studio chạy theo cách này), cho Jev chấm cả corpus (`--pool all`, khoảng 2 giây, khoảng 0,04 USD), bỏ dòng trùng cùng một bài đăng, giữ 3 case (`--limit` để đổi), in một khối tiếng Việt (id, tác giả, một dòng mô tả, `Vì sao:` theo điểm loại video/chủ đề/phong cách, `Video demo:` là trang demo trong repo mẫu (Skillry có bản gốc và bản làm lại) hoặc video trong repo, không có dòng này khi video chỉ nằm trong bài gốc, rồi link bài gốc). Khi trong pool có case cùng chủ đề (topic ≥ 2/4), case Jev chấm lạc chủ đề (topic < 1/4) xếp sau, dù loại video và phong cách khớp, ghi khối đó vào `CASES.md` và ghi `case_search:`, `case_refs:` vào `BRIEF.md`. Exit 2 là chưa có cả `BRIEF.case-query.json` lẫn `BRIEF.md`.
3. **Gửi nguyên khối in ra cho người dùng** (khối đã kết bằng lời mời chọn "case 2" hoặc bỏ qua). Không tự tóm tắt lại thành một dòng, không bỏ dòng `>` hay link demo.
4. Khối mở đầu bằng `⚠ Jev không chạy (…)` nghĩa là không có key, key sai (HTTP 401), hết giờ hay lỗi mạng: danh sách chỉ xếp theo từ khoá. Vẫn gửi khối cho người dùng và nói rõ lý do; 401 hay thiếu key thì chỉ họ tới `ov-setup`.
5. Trong Motion Studio, đạo diễn (`MOTION_STUDIO_RUNNER=cli`) không được ghi `BRIEF.md`, nên script chỉ ghi `CASES.md`; đạo diễn chép nguyên khối vào biên nhận `studio_request_done` của yêu cầu đầu tiên của dự án mới (hoặc vào thẻ `studio_ask` nếu đang hỏi người dùng).

6. Người dùng chọn một case: làm mục **Sau khi người dùng chọn case** dưới đây. Họ bỏ qua thì đi tiếp, các case vẫn là tham khảo cho storyboard.

**Cổng:** brief `brief_version: 3` (mặc định của dự án mới) chưa có `case_search:` lẫn `CASES.md` thì `make-pitch.mjs init` dừng với exit 6 và `check-preflight` FAIL ở cả hai stage. Dự án `brief_version: 2` chỉ nhận WARN. Motion Studio tự chạy lệnh này với `--cases-only` (`COMMANDS.suggestCases`: chỉ ghi `CASES.md`, không đụng `BRIEF.md`; `CASES.md` đủ mở cổng) và hiện `CASES.md` trên tab Đạo diễn.

## Sau khi người dùng chọn case

Các thư viện mẫu là thư viện prompt: case người dùng chọn phải thành một prompt viết cho video của họ, kèm lý do và video demo để họ xem.

1. Ghi mẫu từ case đã chọn:
   ```bash
   node $OV/scripts/case-template.mjs --project . --case <id> [--reference]
   ```
   Hướng `nhanh` chạy không có `--reference` (case thay cho 3 styleframe, script đặt `creative_override: nhanh theo case <id>` khi chưa có). Hướng `dao-dien` và `tu-nhac` thêm `--reference`: case chỉ là tham chiếu, cổng chọn hướng (`ov-direction`) giữ nguyên. Cả hai đều ghi `case_pick: <id>` vào `BRIEF.md` (đạo diễn trong Motion Studio thì không, xem bước 5 ở trên) và `build/TEMPLATE.md` gồm: tác giả, bài gốc, video demo, trang prompt trong repo (ghim theo commit), license, chủ đề/khổ hình/thời lượng của brief, dòng "Jev chấm" lấy từ `CASES.md`, hai mục để trống, prompt gốc nguyên văn và checklist.
2. Viết hai mục trong `build/TEMPLATE.md`, thay dòng `(agent viết…)`:
   - `## Vì sao dùng prompt này`: 2–4 câu tiếng Việt cho người dùng: case giống video của họ ở đâu (loại video, nhịp, cách dựng, kỹ thuật), sẽ giữ gì, đổi gì. Dựa vào dòng "Jev chấm" và prompt gốc, không khen chung chung.
   - `## Prompt chuyển thể`: viết lại prompt của case cho video này, **cùng ngôn ngữ với prompt gốc** (thường là tiếng Anh): giữ cấu trúc, nhịp, kỹ thuật, chuyển cảnh; thay chủ thể, chữ trên hình, số liệu, khổ hình và thời lượng bằng thông tin trong `BRIEF.md`. Không bịa số, tên hay trích dẫn; chỗ brief chưa có thì ghi rõ `[cần người dùng cho: …]`. Chữ tiếng Việt sẽ lên hình hay lời đọc vẫn qua `ov-script`.
   Chạy lại `case-template.mjs` cho cùng case thì hai mục đã viết được giữ.
3. Chạy `node $OV/scripts/case-template.mjs --project . --show` và **gửi nguyên khối in ra cho người dùng**: case đã chọn, video demo, bài gốc, trang prompt trong repo, lý do, prompt chuyển thể trong khối code. Exit 3 nghĩa là một trong hai mục còn là dòng `(agent viết…)` hoặc quá ngắn; viết xong rồi chạy lại. Trong Motion Studio, đạo diễn chép nguyên khối này vào biên nhận `studio_request_done` (script không ghi `BRIEF.md` khi chạy dưới đạo diễn).
4. Người dùng sửa prompt thì sửa mục `## Prompt chuyển thể` rồi `--show` lại. Từ đây `ov-direction` (hướng có `--reference`), `ov-script` và `ov-build` đọc `build/TEMPLATE.md` làm mẫu.

## Tra case (bước 3, trước khi viết STORYBOARD.md)

Đã có `CASES.md` thì đọc các case trong đó, không tra lại. Chưa có thì tra như dưới (**một lần mỗi dự án**, không chạy lại theo từng cảnh):

- **Chuẩn hoá brief:** tự viết `BRIEF.case-query.json` trong thư mục dự án (đã viết ở bước 1b để chọn phong cách lemo thì dùng lại), bằng **tiếng Anh**, chỉ lấy thông tin có trong brief của người dùng, **không bịa**. Trường nào brief không nói thì ghi `"not stated"`. `aspect` lấy đúng từ `BRIEF.md`.
  ```json
  {"video_type":"…","purpose":"…","topic":"…","industry":"…","aspect":"16:9|9:16|both",
   "duration_s":30,"tone":"…","key_visuals":"…","narration":"…","source_material":"…"}
  ```
- **Tra case (Jev, tuỳ chọn):** script tự đọc `TYPESAFE_API_KEY` từ `~/.config/opus-video/.env` (không source/cat/echo file này). Có key thì Jev chấm khoảng 930 case theo 3 tiêu chí (loại video, chủ đề, phong cách). `--pool all` là mọi case có prompt từ 40 ký tự trở lên, tức 928/1003 case, cộng các case khớp từ khoá; 75 case chỉ có tiêu đề/caption ngắn không được chấm. Sau đó code cộng thêm độ chi tiết của prompt và luật khổ hình (case dọc được đẩy lên cho brief 9:16). Mất khoảng 1 giây, khoảng 0,04 USD:
  ```bash
  node $OV/scripts/rerank-cases.mjs --brief-json BRIEF.case-query.json --aspect <16:9|9:16|both> --pool all --limit 5 --stats \
       --category <motion|explainer|3d|interactive|product|story-music> --keyword <từ khoá tiếng Anh>
  ```
  - Luôn kèm `--category`/`--keyword`: không có key, API lỗi hay hết giờ thì script trả kết quả của `find-cases` với đúng các cờ đó (ở chế độ thường thiếu key thì không có cảnh báo; `--suggest` luôn báo).
  - Nhận biết: dòng `###` có `· jev 0.xx (kind · topic · style /4; …)` là Jev đã xếp hạng. Không có `jev` là đang ở fallback `find-cases` (script đã tự tra lại chỉ theo category nếu từ khoá không ra gì).
  - `--stats` in một dòng JSON ra stderr có trường `case_search`: chép nguyên giá trị đó vào `BRIEF.md`, ví dụ `case_search: jev` hoặc `case_search: find-cases (no TYPESAFE_API_KEY)` / `find-cases (HTTP 401)` / `find-cases (request failed: TimeoutError)`.
  - Có key mà Jev lỗi (401, hết giờ…) thì stderr luôn có một dòng `rerank-cases: Jev unavailable (…)`, kể cả khi không có `--stats`. Không dừng quy trình, cứ dùng kết quả `find-cases`; báo người dùng nếu là 401 (key sai/hết hạn).
  - Brief nặng về phong cách hình ảnh (cắt giấy, pixel art, kinetic type, tranh khắc gỗ…): thêm `--weights '{"style":0.3}'`.
  - **Không** bật `--pair` hay `--shortlist` (đã thử, không tốt hơn, `--pair` còn làm mất case dọc).
- **Không có key** (hoặc muốn tra nhanh không tốn tiền):
  ```bash
  node $OV/scripts/find-cases.mjs --category <motion|explainer|3d|interactive|product|story-music> --keyword <từ khoá tiếng Anh> --limit 5
  ```
  Không có kết quả (stderr `no matching cases`) thì bỏ `--keyword` và tra lại chỉ theo category.
- Đọc dòng `> note:` nếu có:
  - `weak matches`: corpus không có mẫu sát (hay gặp với làm đẹp, F&B, bất động sản, sự kiện, talking-head, du lịch). Chỉ mượn cấu trúc/kỹ thuật của case, không bám chủ đề, và dựa chủ yếu vào `$OV/references/pattern-library.md`.
  - `weak style fit` (style tốt nhất trong top < 2/4): không case nào có phong cách hình giống brief. Chỉ mượn cấu trúc/nhịp của case; phong cách hình lấy từ `key_visuals` trong brief và **thẻ kỹ thuật** trong `references/pattern-library.md`. Nếu note gợi ý một case có style tốt hơn ngoài top thì chỉ đọc case đó để tham khảo vẻ ngoài. Note này không đổi thứ hạng.
  - `no vertical (9:16) case`: tự lo vùng an toàn 9:16 theo pattern-library.
  - Điểm `jev` chỉ để định hướng. Hạng 4–5 gần nhau coi như ngang nhau; ưu tiên case có prompt đầy đủ.
- Đọc 2–3 case. Chọn **thẻ kỹ thuật** và dòng trong **bảng nối nhóm → HyperFrames** ở `references/pattern-library.md` (blueprint, rule, catalog query, preset).
- Ghi id case tham khảo vào `BRIEF.md` (kèm `case_search: jev` hoặc `case_search: find-cases`).

## Hướng `nhanh` (theo mẫu)

Người dùng nói "làm nhanh", "theo mẫu", "giống video này" hoặc đưa link một case:

1. Dùng khối gợi ý case ở trên (`CASES.md`). Người dùng đưa link hay id thì lấy đúng case đó. Chờ họ chọn **một** case.
2. Làm mục **Sau khi người dùng chọn case** với `case-template.mjs --project . --case <id>` (không có `--reference`). Exit 2 nghĩa là id sai hoặc case đã bị upstream gỡ, khi đó chọn case khác. `WARN prompt không đầy đủ` nghĩa là case chỉ có một phần prompt; mẫu vẫn được ghi, phần thiếu lấy từ brief.
3. Ghi `case_search:` vào `BRIEF.md`. Không chạy `make-pitch` (bước 1b). Người dùng muốn một phong cách lemo-opuscar cho bản làm nhanh thì chạy `node $OV/scripts/lemo-pick.mjs rank --brief-json BRIEF.case-query.json --limit 3 --stats` với cùng file brief, đưa họ 2–3 kết quả kèm lý do, rồi ghi lựa chọn bằng `lemo-pick.mjs choose` (chi tiết ở `ov-direction`). Phong cách, hình chủ đạo và chuyển cảnh lấy từ `build/TEMPLATE.md` và thẻ kỹ thuật của case.
4. Đi tiếp `ov-script` (viet-pro vẫn đủ (a)–(e)), `ov-audio`, `ov-build`. Ở `ov-build` vẫn viết PLAN.md, vẫn chạy `make-demo.mjs --animatic` và chờ người dùng duyệt clip nháp, rồi `ov-deliver`. Ở chặng final, `check-preflight` bỏ qua các kiểm tra hướng sáng tạo nhưng vẫn đòi animatic mới hơn PLAN.md và có chuyển động.

Case bị upstream gỡ (`upstream_removed`) bị ẩn khỏi `find-cases` và `rerank-cases`; chỉ thêm `--include-removed` khi người dùng hỏi đúng case đó.

## Tham chiếu

| File | Dùng khi |
|---|---|
| `$OV/references/pattern-library.md` | Bước 3: công thức theo 8 nhóm video |
| `$OV/scripts/find-cases.mjs` | Bước 3: tra 1003 case trong `data/cases.jsonl` (105 case upstream đã gỡ bị ẩn). Tra bằng script, không đọc file trực tiếp |
| `$OV/scripts/rerank-cases.mjs` | Sau brief: `--suggest --project .` in khối gợi ý cho người dùng và ghi `CASES.md`. Bước 3 (tuỳ chọn, cần `TYPESAFE_API_KEY`): Jev xếp hạng khoảng 930 case có prompt dùng được (≥ 40 ký tự) theo brief JSON; thiếu key hoặc lỗi API thì tự trả kết quả `find-cases` (`--stats` cho biết lý do) |
| `$OV/scripts/case-features.mjs` | Gắn nhãn cố định cho từng case vào `data/case-features.jsonl` (khổ hình, thể loại, chủ đề, độ chi tiết). **Chạy lại mỗi khi `data/cases.jsonl` thay đổi** (chỉ gắn nhãn dòng mới/đổi, khoảng 0,07 USD cho cả corpus) |
| `data/exemplars.md` | 17 prompt mẫu nguyên văn, có nguồn. Chỉ mở khi cần đọc prompt đầy đủ |
| `$OV/scripts/lemo-pick.mjs` | Hướng nhanh (tuỳ chọn): Jev chọn 2–3 phong cách lemo-opuscar theo cùng `BRIEF.case-query.json`; thiếu key hay lỗi thì xếp theo từ khoá |
| `$OV/scripts/case-template.mjs` | Sau khi người dùng chọn case: `--case <id> [--reference]` ghi `build/TEMPLATE.md` và `case_pick` (hướng nhanh còn đặt `creative_override`); `--show` in khối prompt chuyển thể, lý do và video demo cho người dùng |
| `data/SOURCES.md` | Nguồn, commit và license của corpus; lệnh rebuild |
| `$OV/scripts/corpus-stats.mjs` | Thống kê lại corpus khi cập nhật dữ liệu nguồn |
