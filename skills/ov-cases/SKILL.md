---
name: ov-cases
description: "Tra corpus case video làm bằng Opus 5.5 của opus-video: chuẩn hoá brief sang JSON tiếng Anh, xếp hạng bằng Jev (rerank-cases.mjs) hoặc find-cases.mjs, đọc 2–3 case và chọn thẻ kỹ thuật trong pattern-library; kèm hướng vận hành nhanh/theo mẫu (một case thay cho 3 styleframe). Dùng ở bước 3 (storyboard, một lần mỗi dự án) hoặc khi người dùng nói làm nhanh, theo mẫu, giống video này. Không dùng để chọn hướng bằng styleframe (ov-direction), viết storyboard/PLAN (ov-build) hay đọc thẳng data/cases.jsonl."
---

# ov-cases: tra case và hướng nhanh theo mẫu

`$OV` là thư mục gốc plugin opus-video, nơi có `scripts/` và `references/`: Claude Code `${CLAUDE_PLUGIN_ROOT}` (cài tại chỗ: `~/.claude/skills/opus-video`), Codex `~/.agents/skills/opus-video`, Antigravity `~/.gemini/config/skills/opus-video` (CLI: `~/.gemini/antigravity-cli/skills/opus-video`); tức thư mục chứa `skills/` và `scripts/` của plugin. Mọi lệnh là `node $OV/scripts/<x>.mjs` (PowerShell: thay `$OV` bằng đường dẫn đầy đủ).

## Tra case (bước 3, trước khi viết STORYBOARD.md)

Tra case gần nhất (**một lần mỗi dự án**, không chạy lại theo từng cảnh):

- **Chuẩn hoá brief:** tự viết `BRIEF.case-query.json` trong thư mục dự án, bằng **tiếng Anh**, chỉ lấy thông tin có trong brief của người dùng, **không bịa**. Trường nào brief không nói thì ghi `"not stated"`. `aspect` lấy đúng từ `BRIEF.md`.
  ```json
  {"video_type":"…","purpose":"…","topic":"…","industry":"…","aspect":"16:9|9:16|both",
   "duration_s":30,"tone":"…","key_visuals":"…","narration":"…","source_material":"…"}
  ```
- **Tra case (Jev, tuỳ chọn):** script tự đọc `TYPESAFE_API_KEY` từ `~/.config/opus-video/.env` (không source/cat/echo file này). Có key thì Jev chấm khoảng 740 case theo 3 tiêu chí (`--pool all` = mọi case có prompt từ 40 ký tự trở lên, tức 738/813 case, cộng các case khớp từ khoá; 75 case chỉ có tiêu đề/caption ngắn không được chấm) (loại video, chủ đề, phong cách), rồi code cộng thêm độ chi tiết của prompt và luật khổ hình (case dọc được đẩy lên cho brief 9:16). Mất khoảng 1 giây, khoảng 0,03 USD:
  ```bash
  node $OV/scripts/rerank-cases.mjs --brief-json BRIEF.case-query.json --aspect <16:9|9:16|both> --pool all --limit 5 --stats \
       --category <motion|explainer|3d|interactive|product|story-music> --keyword <từ khoá tiếng Anh>
  ```
  - Luôn kèm `--category`/`--keyword`: không có key, API lỗi hay hết giờ thì script **tự lặng lẽ trả kết quả của `find-cases`** với đúng các cờ đó.
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

1. Tra case như trên (hoặc lấy đúng case người dùng chỉ), đưa người dùng 1–3 case kèm link và tóm tắt một dòng, chờ họ chọn **một** case.
2. Ghi vào frontmatter `BRIEF.md`: `creative_override: nhanh theo case <id>` cùng id case và `case_search:`. Không chạy `make-pitch` (bước 1b); phong cách, hình chủ đạo, chuyển cảnh lấy từ case đã chọn và thẻ kỹ thuật của nó.
3. Đi tiếp `ov-script` (viet-pro vẫn đủ (a)–(e)), `ov-audio`, `ov-build`. Ở `ov-build` vẫn viết PLAN.md, vẫn chạy `make-demo.mjs --animatic` và chờ người dùng duyệt clip nháp, rồi `ov-deliver`.

## Tham chiếu

| File | Dùng khi |
|---|---|
| `$OV/references/pattern-library.md` | Bước 3: công thức theo 8 nhóm video |
| `$OV/scripts/find-cases.mjs` | Bước 3: tra 813 case trong `data/cases.jsonl`. Tra bằng script, không đọc file trực tiếp |
| `$OV/scripts/rerank-cases.mjs` | Bước 3 (tuỳ chọn, cần `TYPESAFE_API_KEY`): Jev xếp hạng ~740 case có prompt dùng được (≥ 40 ký tự) theo brief JSON; thiếu key hoặc lỗi API thì tự trả kết quả `find-cases` (`--stats` cho biết lý do) |
| `$OV/scripts/case-features.mjs` | Gắn nhãn cố định cho từng case vào `data/case-features.jsonl` (khổ hình, thể loại, chủ đề, độ chi tiết). **Chạy lại mỗi khi `data/cases.jsonl` thay đổi** (chỉ gắn nhãn dòng mới/đổi, khoảng 0,07 USD cho cả corpus) |
| `data/exemplars.md` | 17 prompt mẫu nguyên văn, có nguồn. Chỉ mở khi cần đọc prompt đầy đủ |
| `data/SOURCES.md` | Nguồn, commit và license của corpus; lệnh rebuild |
| `$OV/scripts/corpus-stats.mjs` | Thống kê lại corpus khi cập nhật dữ liệu nguồn |
