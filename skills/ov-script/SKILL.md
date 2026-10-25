---
name: ov-script
description: "Bước 2 của opus-video: cổng viet-pro đầy đủ cho mọi lời đọc, chữ trên hình và caption tiếng Việt: đọc đủ tài liệu viet-pro, soạn bảng 3 cột, lượt Humanizer có ghi chép, lint, biên bản ## viet_pro, rồi check-viet-pro.mjs phải PASS trước TTS hay render; kèm kiểm chứng nguồn (source-ingest, poi-fetch) và luật video TikTok/Reels viral. Dùng ở mọi hướng vận hành mỗi khi có chữ tiếng Việt mới hoặc lời đọc bị sửa. Không dùng để tạo giọng (ov-audio), viết PLAN.md (ov-build) hay caption lúc giao (ov-deliver, cùng quy trình này)."
---

# ov-script: kịch bản qua cổng viet-pro

`$OV` là thư mục gốc plugin opus-video, nơi có `scripts/` và `references/`: Claude Code `${CLAUDE_PLUGIN_ROOT}` (cài tại chỗ: `~/.claude/skills/opus-video`), Codex `~/.agents/skills/opus-video`, Antigravity `~/.gemini/config/skills/opus-video` (CLI: `~/.gemini/antigravity-cli/skills/opus-video`); tức thư mục chứa `skills/` và `scripts/` của plugin. Mọi lệnh là `node $OV/scripts/<x>.mjs` (PowerShell: thay `$OV` bằng đường dẫn đầy đủ).

## Bước 2: cổng viet-pro đầy đủ

**BẮT BUỘC với mọi lời đọc/chữ trên hình tiếng Việt, kể cả video TikTok viral.** Làm theo `$OV/references/script-workflow.md`. `VP` = thư mục skill `viet-pro` (`setup-check.mjs` in đường dẫn; Claude Code `~/.claude/skills/viet-pro`, Codex `~/.agents/skills/viet-pro`). Chạy viet-pro ở mức **Chuẩn** (brief → soạn → rà sự thật/ngôn ngữ → bản cuối), không dùng mức Nhanh. Làm đủ (a)–(e) theo đúng thứ tự:

- **(a) Đọc hết, không đọc lướt:** `$VP/SKILL.md`; toàn bộ `$VP/references/review/` (`lead.md`, `anti-ai.md`, `humanizer-patterns.md`, `natural.md`, `punctuation.md`, `capitalization.md`, `consistency.md`, `fact-check.md`); toàn bộ `$VP/references/editorial/` (`lead.md`, `hook-close.md`, `rhythm.md`, `story-core.md`, `debunk.md`, `emphasis.md`, `metaphor.md`, `reframe.md`, `technical.md`); và file kênh `$VP/references/publishing/video-script.md` (TikTok/Reels/Shorts/YouTube). Người dùng yêu cầu đọc đủ nên ở đây `humanizer-patterns.md` luôn được đọc toàn bộ, không chỉ khi có cụm dấu hiệu.
- **(b) Soạn** bảng 3 cột `Thời điểm | Voice-over (văn nói) | Visual / text trên hình` theo `video-script.md`. **Hình dẫn, lời theo:** cột Visual viết theo hướng đã chọn ở bước 1b (`## creative_direction`: hình chủ đạo, luật chống slideshow), có ít nhất `music_only_s` giây chỉ nhạc và hình (Voice-over `—`), và toàn bộ lời đọc không vượt `word_budget` trong BRIEF (15 giây ≈ 22–30 từ tuỳ nhịp; cổng chặn nếu vượt). Không chia "mỗi câu một cảnh". Chọn kỹ thuật theo loại video ở bảng trong `script-workflow.md`. Explainer, phản bác ngộ nhận hoặc có số liệu thì **bắt buộc kiểm chứng** theo `$VP/references/review/fact-check.md`, ghi `SOURCES.md`; nguồn là URL/PDF thì chạy `source-ingest.mjs` trước và mọi số liệu phải trỏ về một mục trong `SOURCES.md`. Lưu bản nháp đầu thành `script-table.v1.md`.
- **(c) Lượt Humanizer/anti-AI có ghi chép:** rà theo `$VP/references/review/anti-ai.md` và đủ 25 pattern trong `humanizer-patterns.md`; pattern mạnh 1–5 sửa từ một lần xuất hiện, pattern yếu 6–25 chỉ sửa khi thành cụm. Liệt kê **từng pattern tìm thấy → câu gốc → cách sửa** (hoặc ghi rõ "không thấy pattern 1–5"). Tối đa hai vòng sửa. Sau đó đối chiếu dữ kiện: `node $VP/scripts/compare-preserved-content.mjs script-table.v1.md script-table.md --keep "<tên riêng>"` (MISMATCH phải xử lý).
- **(d) Lint:** lưu bản cuối thành `script-table.md` (**không** đặt `script.md`, vì macOS coi `script.md` và `SCRIPT.md` là một file), tách lời vào `script/NN.txt` (mỗi file một câu đọc), rồi chạy `node $VP/scripts/lint-vietnamese-content.mjs script-table.md script/*.txt`. Sửa **hết ERROR** và mọi WARN đúng là lỗi văn phong (`oxford-comma`, `em-dash` trong lời đọc, `ai-label`, `chatbot-residue`, `staged-opener`, `contrast-formula-repeat`, `dramatic-closer-repeat`, `title-case`). Chỉ được giữ WARN do cú pháp bảng (`double-space`, gạch nối khoảng thời gian trong cột Thời điểm) hoặc tên riêng, và phải ghi lý do. Workflow HyperFrames chuyên biệt thì xuất thêm `SCRIPT.md` (`## Line N — … (Frame N)`).
- **(e) Ghi biên bản** vào `BRIEF.md` (khuyên dùng) hoặc `script-table.md`, dưới heading `## viet_pro`:
  ```markdown
  ## viet_pro
  - mode: Chuẩn
  - files_read: SKILL.md, review/lead.md, review/anti-ai.md, review/humanizer-patterns.md, review/natural.md, review/punctuation.md, review/capitalization.md, review/consistency.md, review/fact-check.md, review/translationese-vi.md, editorial/lead.md, editorial/hook-close.md, editorial/rhythm.md, editorial/story-core.md, editorial/debunk.md, editorial/emphasis.md, editorial/metaphor.md, editorial/reframe.md, editorial/technical.md, publishing/video-script.md
  - humanizer: #4 dẫn dài "Trong thời đại…" → mở bằng hành vi người xem; #13 "thay đổi cuộc chơi" → bỏ; không còn pattern 1–5
  - lint: script-table.md + script/01–07.txt: 0 ERROR; giữ 14 WARN double-space/em-dash do cú pháp bảng
  - words: 158 từ / 60 giây
  - facts: compare-preserved-content 0 MISMATCH; nguồn ở SOURCES.md
  ```
- **Cổng:** `node $OV/scripts/check-viet-pro.mjs --project .` phải in `PASS` (exit 0) **trước** khi chạy `eleven.mjs tts`/`audio-meta` (bước 5, `ov-audio`) hay bất kỳ lệnh render nào. Exit 1 (`BLOCKED`) thì sửa rồi chạy lại. Cổng kiểm cả `script-table.v1.md` (bản nháp trước Humanizer, so bằng `compare-preserved-content`, MISMATCH là chặn) và lời đọc trong `SCRIPT.md` nếu có.
- **`eleven.mjs` tự chặn.** `tts`/`audio-meta` gọi lại cổng; chưa PASS thì exit **4** trước khi gọi API. `tts` chỉ nhận `--text-file <project>/script/NN.txt` (không nhận `--text`), và mỗi frame trong `SCRIPT.md` phải trùng `script/NN.txt`. Ngôn ngữ lấy từ `BRIEF.md` `language:` (`vi`, `vie`, `vi-VN`, `tiếng Việt`/`tieng viet` hoặc bỏ trống đều tính là tiếng Việt). Dự án ngôn ngữ khác phải truyền `--lang` đúng ngôn ngữ đó, vì mặc định `vi` sẽ bị từ chối. Mỗi file giọng có kèm `NN.mp3.gate.json` (hash lời đọc và override). `--reuse` chỉ dùng lại file có stamp khớp, và `--stage delivery` chặn mp3 không có stamp, có stamp override hoặc lệch với `script/NN.txt` hiện tại.
- **Bỏ cổng** chỉ khi người dùng nói rõ là bỏ viet-pro: ghi `viet_pro_override: <lý do ≥10 ký tự, không có #>` vào frontmatter `BRIEF.md` rồi thêm cờ `--skip-viet-pro-gate`. Lý do được in ra mỗi lần chạy, và `check-viet-pro --stage delivery` sẽ chặn khi còn dòng override, nên trước khi giao phải bỏ override và tạo lại voice qua cổng.
- **Tuỳ chọn:** `check-viet-pro.mjs --project . --jev-audit` nhờ Jev rà từng câu lời đọc (Humanizer 1–5, câu mồi, trải nghiệm bịa, số không nguồn). Chỉ in WARN, không đổi kết quả cổng; xem `references/script-workflow.md`.

## Riêng video TikTok/Reels/Shorts viral

Vẫn theo viet-pro, không thay thế viet-pro:

- **Hook 1–3 giây:** vào thẳng ý bằng dữ kiện, hành vi người xem nhận ra ngay hoặc câu hỏi gắn với insight (`hook-close.md`, `video-script.md`). Không chào, không dàn cảnh, và không dùng câu mồi công thức như "Đừng lướt qua", "99% người không biết", "Sự thật gây sốc", "Xem đến cuối" (humanizer #4, #13). Ô `[Hook — câu sốc]` trong bảng mẫu của `video-script.md` chỉ là chỗ trống; chính file đó ghi rõ là không bắt buộc gây sốc.
- **Một góc nhìn:** một video một insight. Ý phụ ghi "video sau", không nhồi.
- **Giọng người thật:** văn nói xưng "mình" với "bạn", câu ngắn chủ động, đọc thành tiếng phải trôi. Không trộn tiếng Anh khi không cần (`natural.md`), không chồng từ kiểu "đột phá, liền mạch, mạnh mẽ" (#12, #16). Số nói tròn, số chính xác đưa lên chữ trên hình.
- **Không bịa trải nghiệm:** không viết "mình đã dùng 3 tháng", "mình test thử thấy…" hay kể chuyện ngôi thứ nhất nếu người dùng không cung cấp trải nghiệm đó (viet-pro: không bịa nhân vật, trải nghiệm, kết quả). Tự chứng minh (`story-core.md` 3.2) chỉ dùng với trải nghiệm thật của người dùng.
- **CTA:** tối đa một hành động cụ thể và chỉ khi brief cần (`video-script.md`, `repurpose-matrix.md`). Không dùng câu mồi tương tác sáo như "like share follow", "comment 'X' để nhận", "follow để không bỏ lỡ", "tag một người bạn". Có thể kết bằng dữ kiện hoặc hành động thật ("mở Output, chọn Dashboards, hỏi đúng câu sếp vừa hỏi").
- `check-viet-pro.mjs` cảnh báo (WARN) khi gặp câu mồi, lời kể trải nghiệm ngôi thứ nhất hoặc lời đọc quá ~3 từ/giây; agent đọc từng cảnh báo và sửa hoặc ghi lý do giữ. Vượt `word_budget` của BRIEF là **FAIL**.

## Tham chiếu

| File | Dùng khi |
|---|---|
| `$OV/references/script-workflow.md` | Bước 2 và 9: cổng viet-pro đầy đủ, kỹ thuật theo loại video, kiểm chứng, lint, TikTok viral, `CAPTIONS.md` |
| `$OV/scripts/check-viet-pro.mjs` | Bước 2 (`--stage script`, trước voice/render) và bước 9 (`--stage delivery`): biên bản `## viet_pro`, `script-table.v1.md` + compare, lint viet-pro từng file và `SCRIPT.md`, caption FB + TikTok; `voice_source: clip` lint phụ đề + chữ trên hình thay kịch bản; `--jev-audit` tuỳ chọn (chỉ WARN) |
| `$OV/scripts/source-ingest.mjs` | Bước 2 (kiểm chứng): tải bài báo URL, PDF hoặc trang abstract arXiv (toàn văn thì truyền `https://arxiv.org/pdf/<id>`) vào `sources/<slug>.txt` và ghi mục nguồn kèm câu ứng viên có số vào `SOURCES.md`; không tóm tắt bằng AI |
| `$OV/scripts/poi-fetch.mjs` | Video BĐS/địa điểm (hướng A8, Thẻ 9): tiện ích quanh địa chỉ từ OpenStreetMap, khoảng cách và phút đi bộ (ước tính hoặc `--route` OSRM) vào `sources/poi.json` + `SOURCES.md`, ghi công ODbL ở `assets/CREDITS.md` |
| `$OV/scripts/voice-gate.mjs` | Cổng viet-pro mà `eleven.mjs tts`/`audio-meta` gọi lại (exit 4) |
