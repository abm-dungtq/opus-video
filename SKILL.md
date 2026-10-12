---
name: opus-video
description: "Làm video với Claude Opus 5.5 từ brief, chủ đề hoặc kịch bản tiếng Việt: viết kịch bản bằng viet-pro, giọng đọc/SFX/nhạc nền ElevenLabs, dựng bằng HyperFrames (hoặc Remotion/Canvas tuỳ dự án), render 16:9 và 9:16, kiểm tra khung hình. Dùng khi người dùng muốn làm video, explainer, quảng cáo, motion graphics, music video hay video TikTok/Reels/YouTube."
---

# opus-video

Skill điều phối: biến một ý tưởng thành MP4 hoàn chỉnh. Skill này **không** tự render. Nó nối các skill có sẵn (`viet-pro`, `hyperframes` và các workflow con, `media-use`, `ak-remotion`) với script ElevenLabs của riêng nó, và áp dụng các mẫu chắt lọc từ 813 video làm bằng Opus 5.5.

Skill dir: `~/.claude/skills/opus-video` (bên dưới viết tắt là `$OV`).

## Thiết lập (mỗi phiên một lần)

```bash
node ~/.claude/skills/opus-video/scripts/eleven.mjs doctor
```

Kết quả đạt khi exit 0 và in ra `tier`, `tts model`, `voice`. Script tự đọc key từ `~/.config/opus-video/.env`. Ba dòng phụ không làm lệnh thất bại: `jev key: present|absent` (`TYPESAFE_API_KEY`, cùng file `.env`, chỉ báo có/không), `jev: reachable|unreachable|skipped`, `viet-pro: installed|missing` (thiếu viet-pro thì cổng bước 2 không chạy được).

- **Không** source, cat hay echo file `.env` trong shell, và không in key ra hội thoại.
- Nếu thiếu key, nhờ người dùng tạo file với 2 dòng `ELEVENLABS_API_KEY=...` và `OPUS_VIDEO_VOICE_ID=...` (chmod 600).
- Tuỳ chọn: dòng `TYPESAFE_API_KEY=...` trong cùng file bật bước xếp hạng case bằng Jev ở bước 3. Thiếu thì bước 3 tự dùng `find-cases`, không cần hỏi người dùng.
- Đổi giọng hoặc model theo dự án: dùng cờ `--voice` / `--model`, hoặc đặt `voice_id` / `tts_model` trong `BRIEF.md` rồi truyền vào lệnh.

Mặc định: voice `eGSd0uV8dNQnZuEEX9lu`, TTS `eleven_v4` (có tiếng Việt), music `music_v2_5`, SFX `eleven_text_to_sound_v2`.

## Nhánh footage thật (beta)

Người dùng đưa clip quay thật cần cắt gọn (talking-head, phỏng vấn, UGC): làm theo `references/footage-lane.md` (`scripts/cut.mjs` tìm điểm cắt và ghép), rồi quay lại bước 6–9 bên dưới (lời đọc hay chữ tiếng Việt mới thêm vẫn phải qua cổng viet-pro ở bước 2). Video dựng mới hoàn toàn thì đi thẳng quy trình 9 bước.

## Quy trình 9 bước

Mỗi dự án có một thư mục riêng:

```
<project>/
  BRIEF.md  STORYBOARD.md  script-table.md  QA.md  CAPTIONS.md
  script/01.txt …          # lời đọc theo cảnh
  assets/voice/ assets/sfx/ assets/bgm/ assets/CREDITS.md
  renders/
```

1. **Brief.** Điền theo `references/brief-template.md` vào `BRIEF.md`. Chỉ hỏi người dùng những gì không suy ra được (chủ đề, `aspect` 16:9 / 9:16 / both, thời lượng). Các trường khác tự đề xuất.

2. **Kịch bản: cổng viet-pro đầy đủ (BẮT BUỘC với mọi lời đọc/chữ trên hình tiếng Việt, kể cả video TikTok viral).** Làm theo `references/script-workflow.md`. `VP=~/.claude/skills/viet-pro`. Chạy viet-pro ở mức **Chuẩn** (brief → soạn → rà sự thật/ngôn ngữ → bản cuối), không dùng mức Nhanh. Làm đủ (a)–(e) theo đúng thứ tự:
   - **(a) Đọc hết, không đọc lướt:** `$VP/SKILL.md`; toàn bộ `$VP/references/review/` (`lead.md`, `anti-ai.md`, `humanizer-patterns.md`, `natural.md`, `punctuation.md`, `capitalization.md`, `consistency.md`, `fact-check.md`); toàn bộ `$VP/references/editorial/` (`lead.md`, `hook-close.md`, `rhythm.md`, `story-core.md`, `debunk.md`, `emphasis.md`, `metaphor.md`, `reframe.md`, `technical.md`); và file kênh `$VP/references/publishing/video-script.md` (TikTok/Reels/Shorts/YouTube). Người dùng yêu cầu đọc đủ nên ở đây `humanizer-patterns.md` luôn được đọc toàn bộ, không chỉ khi có cụm dấu hiệu.
   - **(b) Soạn** bảng 3 cột `Thời điểm | Voice-over (văn nói) | Visual / text trên hình` theo `video-script.md`, khoảng 2,5–3 từ/giây (60 giây ≈ 150–180 từ, đếm trước khi chốt). Chọn kỹ thuật theo loại video ở bảng trong `script-workflow.md`. Explainer, phản bác ngộ nhận hoặc có số liệu thì **bắt buộc kiểm chứng** theo `$VP/references/review/fact-check.md`, ghi `SOURCES.md`. Lưu bản nháp đầu thành `script-table.v1.md`.
   - **(c) Lượt Humanizer/anti-AI có ghi chép:** rà theo `$VP/references/review/anti-ai.md` và đủ 25 pattern trong `humanizer-patterns.md`; pattern mạnh 1–5 sửa từ một lần xuất hiện, pattern yếu 6–25 chỉ sửa khi thành cụm. Liệt kê **từng pattern tìm thấy → câu gốc → cách sửa** (hoặc ghi rõ "không thấy pattern 1–5"). Tối đa hai vòng sửa. Sau đó đối chiếu dữ kiện: `node $VP/scripts/compare-preserved-content.mjs script-table.v1.md script-table.md --keep "<tên riêng>"` (MISMATCH phải xử lý).
   - **(d) Lint:** lưu bản cuối thành `script-table.md` (**không** đặt `script.md`, vì macOS coi `script.md` và `SCRIPT.md` là một file), tách lời vào `script/NN.txt` (mỗi file một câu đọc), rồi chạy `node $VP/scripts/lint-vietnamese-content.mjs script-table.md script/*.txt`. Sửa **hết ERROR** và mọi WARN đúng là lỗi văn phong (`oxford-comma`, `em-dash` trong lời đọc, `ai-label`, `chatbot-residue`, `staged-opener`, `contrast-formula-repeat`, `dramatic-closer-repeat`, `title-case`). Chỉ được giữ WARN do cú pháp bảng (`double-space`, gạch nối khoảng thời gian trong cột Thời điểm) hoặc tên riêng, và phải ghi lý do. Workflow HyperFrames chuyên biệt thì xuất thêm `SCRIPT.md` (`## Line N — … (Frame N)`).
   - **(e) Ghi biên bản** vào `BRIEF.md` (khuyên dùng) hoặc `script-table.md`, dưới heading `## viet_pro`:
     ```markdown
     ## viet_pro
     - mode: Chuẩn
     - files_read: SKILL.md, review/lead.md, review/anti-ai.md, review/humanizer-patterns.md, review/natural.md, review/punctuation.md, review/capitalization.md, review/consistency.md, review/fact-check.md, editorial/lead.md, editorial/hook-close.md, editorial/rhythm.md, editorial/story-core.md, editorial/debunk.md, editorial/emphasis.md, editorial/metaphor.md, editorial/reframe.md, editorial/technical.md, publishing/video-script.md
     - humanizer: #4 dẫn dài "Trong thời đại…" → mở bằng hành vi người xem; #13 "thay đổi cuộc chơi" → bỏ; không còn pattern 1–5
     - lint: script-table.md + script/01–07.txt: 0 ERROR; giữ 14 WARN double-space/em-dash do cú pháp bảng
     - words: 158 từ / 60 giây
     - facts: compare-preserved-content 0 MISMATCH; nguồn ở SOURCES.md
     ```
   - **Cổng:** `node $OV/scripts/check-viet-pro.mjs --project .` phải in `PASS` (exit 0) **trước** khi chạy `eleven.mjs tts`/`audio-meta` (bước 5) hay bất kỳ lệnh render nào. Exit 1 (`BLOCKED`) thì sửa rồi chạy lại. Cổng kiểm cả `script-table.v1.md` (bản nháp trước Humanizer, so bằng `compare-preserved-content`, MISMATCH là chặn) và lời đọc trong `SCRIPT.md` nếu có.
   - **`eleven.mjs` tự chặn.** `tts`/`audio-meta` gọi lại cổng; chưa PASS thì exit **4** trước khi gọi API. `tts` chỉ nhận `--text-file <project>/script/NN.txt` (không nhận `--text`), và mỗi frame trong `SCRIPT.md` phải trùng `script/NN.txt`. Ngôn ngữ lấy từ `BRIEF.md` `language:`, không lấy từ `--lang`.
   - **Bỏ cổng** chỉ khi người dùng nói rõ là bỏ viet-pro: ghi `viet_pro_override: <lý do ≥10 ký tự, không có #>` vào frontmatter `BRIEF.md` rồi thêm cờ `--skip-viet-pro-gate`. Lý do được in ra mỗi lần chạy, và `check-viet-pro --stage delivery` sẽ chặn khi còn dòng override, nên trước khi giao phải bỏ override và tạo lại voice qua cổng.
   - **Tuỳ chọn:** `check-viet-pro.mjs --project . --jev-audit` nhờ Jev rà từng câu lời đọc (Humanizer 1–5, câu mồi, trải nghiệm bịa, số không nguồn). Chỉ in WARN, không đổi kết quả cổng; xem `references/script-workflow.md`.
   - **Riêng video TikTok/Reels/Shorts viral** (vẫn theo viet-pro, không thay thế viet-pro):
     - **Hook 1–3 giây:** vào thẳng ý bằng dữ kiện, hành vi người xem nhận ra ngay hoặc câu hỏi gắn với insight (`hook-close.md`, `video-script.md`). Không chào, không dàn cảnh, và không dùng câu mồi công thức như "Đừng lướt qua", "99% người không biết", "Sự thật gây sốc", "Xem đến cuối" (humanizer #4, #13). Ô `[Hook — câu sốc]` trong bảng mẫu của `video-script.md` chỉ là chỗ trống; chính file đó ghi rõ là không bắt buộc gây sốc.
     - **Một góc nhìn:** một video một insight. Ý phụ ghi "video sau", không nhồi.
     - **Giọng người thật:** văn nói xưng "mình" với "bạn", câu ngắn chủ động, đọc thành tiếng phải trôi. Không trộn tiếng Anh khi không cần (`natural.md`), không chồng từ kiểu "đột phá, liền mạch, mạnh mẽ" (#12, #16). Số nói tròn, số chính xác đưa lên chữ trên hình.
     - **Không bịa trải nghiệm:** không viết "mình đã dùng 3 tháng", "mình test thử thấy…" hay kể chuyện ngôi thứ nhất nếu người dùng không cung cấp trải nghiệm đó (viet-pro: không bịa nhân vật, trải nghiệm, kết quả). Tự chứng minh (`story-core.md` 3.2) chỉ dùng với trải nghiệm thật của người dùng.
     - **CTA:** tối đa một hành động cụ thể và chỉ khi brief cần (`video-script.md`, `repurpose-matrix.md`). Không dùng câu mồi tương tác sáo như "like share follow", "comment 'X' để nhận", "follow để không bỏ lỡ", "tag một người bạn". Có thể kết bằng dữ kiện hoặc hành động thật ("mở Output, chọn Dashboards, hỏi đúng câu sếp vừa hỏi").
     - `check-viet-pro.mjs` cảnh báo (WARN) khi gặp câu mồi, lời kể trải nghiệm ngôi thứ nhất hoặc lời đọc quá ~3 từ/giây; agent đọc từng cảnh báo và sửa hoặc ghi lý do giữ.

3. **Storyboard.** Viết `STORYBOARD.md` từ bảng của viet-pro, cộng thêm khối `<structure>` trong brief: BPM, beat, mỗi beat một hành động, cột SFX. Trước khi viết, tra case gần nhất (**một lần mỗi dự án**, không chạy lại theo từng cảnh):
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
     - `weak matches`: corpus không có mẫu sát (hay gặp với làm đẹp, F&B, bất động sản, sự kiện, talking-head, du lịch). Chỉ mượn cấu trúc/kỹ thuật của case, không bám chủ đề, và dựa chủ yếu vào `references/pattern-library.md`.
     - `weak style fit` (style tốt nhất trong top < 2/4): không case nào có phong cách hình giống brief. Chỉ mượn cấu trúc/nhịp của case; phong cách hình lấy từ `key_visuals` trong brief và **thẻ kỹ thuật** trong `references/pattern-library.md`. Nếu note gợi ý một case có style tốt hơn ngoài top thì chỉ đọc case đó để tham khảo vẻ ngoài. Note này không đổi thứ hạng.
     - `no vertical (9:16) case`: tự lo vùng an toàn 9:16 theo pattern-library.
     - Điểm `jev` chỉ để định hướng. Hạng 4–5 gần nhau coi như ngang nhau; ưu tiên case có prompt đầy đủ.
   - Đọc 2–3 case. Chọn **thẻ kỹ thuật** và dòng trong **bảng nối nhóm → HyperFrames** ở `references/pattern-library.md` (blueprint, rule, catalog query, preset).
   - Ghi id case tham khảo vào `BRIEF.md` (kèm `case_search: jev` hoặc `case_search: find-cases`).

4. **Engine.** Chọn theo `references/engine-selection.md`. Mặc định là HyperFrames. Ghi `engine`, `workflow`, `engine_reason` vào `BRIEF.md`. Nhiều biến thể của cùng một mẫu thì dùng `render --batch` của HyperFrames, không chuyển sang Remotion.

5. **Âm thanh.** Chỉ bắt đầu khi `check-viet-pro.mjs --project .` đã PASS ở bước 2 (đổi lời đọc sau đó thì chạy lại cổng trước khi tạo lại voice; `eleven.mjs` exit 4 nghĩa là cổng chặn). Làm theo `references/audio-pipeline.md`.
   - **Dùng workflow HyperFrames chuyên biệt** (faceless-explainer, product-launch-video, pr-to-video): **không** chạy `audio.mjs generate` của workflow. Thay vào đó chạy:
     ```bash
     node $OV/scripts/eleven.mjs audio-meta --script SCRIPT.md --hyperframes . --bgm assets/bgm/bgm.mp3 --bgm-volume 0.2
     ```
     Lệnh này ghi `audio_meta.json` và `audio_engine_meta.json`. **Không xoá sidecar**, vì `fetch-sfx` cần nó để giữ giọng. Sau đó vẫn chạy `sync-durations` và `fetch-sfx` của workflow như bình thường.
   - **Dựng tay** (general-video): voice làm trước: `node $OV/scripts/eleven.mjs tts --text-file script/01.txt --out assets/voice/01.mp3` (sinh kèm `01.mp3.words.json`).
   - Chỉnh mốc storyboard theo thời lượng giọng thật. Frame dài đúng bằng voice, nên frame cuối (CTA) phải cộng thêm khoảng 1 giây giữ hình trước khi assemble.
   - SFX: chạy `hyperframes media-use resolve --type sfx …` trước, nếu không có thì dùng `eleven.mjs sfx`.
   - Nhạc nền: `eleven.mjs music`. Nếu exit 3 (`MUSIC_UNAVAILABLE`) thì dùng `media-use resolve --type bgm`.
   - **Không** dùng TTS của media-use cho tiếng Việt.

6. **Dựng.** Đọc `references/edit-method.md` trước khi viết STORYBOARD; chép mục "Sàn chất lượng" và "Kỷ luật GSAP" vào prompt frame worker.
   - HyperFrames: gọi skill `hyperframes`. Vì đã có `BRIEF.md`, nó sẽ đi vào workflow ghi ở `workflow:`.
   - **Bắt buộc** chạy `hyperframes catalog --query "<hiệu ứng>"` trước khi tự viết hiệu ứng, và ưu tiên block hoặc blueprint đã chọn ở bước 3.
   - Workflow có frame preset (`build-frame.mjs`): kiểm tra font preset có đủ dấu tiếng Việt (`engine-selection.md`). Thiếu thì đổi sang Be Vietnam Pro và copy file font vào `assets/fonts/`.
   - Remotion: dùng skill `ak-remotion`.
   - Raw canvas: làm theo công thức trong `engine-selection.md`.
   - Với `aspect: both`, bản dọc phải dàn lại bố cục, không crop:
     - **Dựng tay** (general-video): 2 composition trong cùng project, gồm `index.html` (1920×1080) và `compositions/main-9x16.html` (1080×1920).
     - **Workflow có frame worker** (faceless-explainer, pr-to-video, product-launch-video): làm **một project 9:16 riêng**, theo mục "Bài học từ smoke v2" trong `engine-selection.md`. Sau mỗi lần `captions.mjs build` ở 1080×1920, **bắt buộc** chạy `sed -i '' 's/--cap-band-top: [0-9]*px;/--cap-band-top: 1340px;/; s/--cap-band-height: [0-9]*px;/--cap-band-height: 200px;/' compositions/captions.html`, vì mặc định 1600px rơi vào vùng UI che.
   - Áp dụng banned list trong brief.

7. **Render.**
   - 16:9: `hyperframes render --quality looks --output renders/<name>-16x9.mp4`
   - 9:16: `hyperframes render -c compositions/main-9x16.html --quality looks --output renders/<name>-9x16.mp4`. Nếu là project 9:16 riêng thì chạy `hyperframes render` ngay trong thư mục đó.
   - `--resolution` chỉ đổi kích thước render, không đổi khổ hình.
   - Bản giao cuối render với `--quality delivery`.

8. **QA.** Làm theo `references/qa-checklist.md` § "Vòng QA tự xem video": lint + check → `video-lint.mjs` → render vN → `judge.mjs check`, từ v2 thêm `pair`. Ghi kết quả vào `QA.md`. Tối đa 3 vòng, sau đó dừng lại và báo người dùng kèm bằng chứng.

9. **Caption khi giao (BẮT BUỘC với video tiếng Việt).** Viết hai caption, **Facebook cá nhân** và **TikTok**, qua đúng quy trình viet-pro đầy đủ như bước 2 (đọc thêm `$VP/references/publishing/facebook.md` và `$VP/references/publishing/repurpose-matrix.md`; soạn → lượt Humanizer có ghi chép → lint). Lưu chung một file `CAPTIONS.md` gồm hai mục `## Facebook cá nhân` và `## TikTok`; chi tiết ở mục 5 của `references/script-workflow.md`.
   - Cùng insight và số liệu với kịch bản, không thêm claim mới. Hook viết lại theo kênh, không copy câu mở của video.
   - Mỗi caption được lint **riêng**: `check-viet-pro.mjs` tách hai mục ra file tạm rồi lint từng file. Thêm dòng `- captions:` vào biên bản `## viet_pro` (pattern đã sửa, kết quả lint từng caption) và bổ sung `publishing/facebook.md`, `publishing/repurpose-matrix.md` vào `files_read`.
   - **Cổng giao:** `node $OV/scripts/check-viet-pro.mjs --project . --stage delivery` phải PASS trước khi gửi link video cho người dùng.
   - Không tự đăng. Người dùng muốn thêm caption YouTube thì làm theo cùng quy trình, thêm mục `## YouTube`.

Giao cho người dùng: đường dẫn MP4, `CAPTIONS.md` (đã qua cổng `--stage delivery`), link preview (`hyperframes preview --background`; ghi PID và dừng preview khi người dùng xem xong), cùng tóm tắt QA. Các mục cần tai người (giọng, thanh điệu) phải nói rõ là người dùng tự nghe.

## Ranh giới

- Không sửa file trong các skill `hyperframes*`, `media-use`, `viet-pro`. Các skill đó được cập nhật từ upstream.
- Không tự đăng video lên mạng xã hội hay publish. Chỉ làm khi người dùng yêu cầu rõ.
- Tôn trọng bản quyền: chỉ dùng tài sản người dùng cấp, audio sinh từ ElevenLabs, hoặc catalog có license. Ghi nguồn vào `assets/CREDITS.md`.
- `judge.mjs` gửi video 540p lên Gemini qua agy (đã được đồng ý 2026-10-08).
- `scripts/cut.mjs` phỏng theo ý tưởng của open-edit (Apache-2.0); giữ `NOTICE` và `third_party/open-edit/LICENSE` khi phân phối.
- Prompt trong corpus (`data/`) thuộc về tác giả gốc. Chỉ dùng để học cấu trúc, và luôn kèm link khi trích.

## Tham chiếu

| File | Dùng khi |
|---|---|
| `references/brief-template.md` | Bước 1: khung brief và ví dụ 15 giây |
| `references/pattern-library.md` | Bước 3: công thức theo 6 nhóm video |
| `references/script-workflow.md` | Bước 2 và 9: cổng viet-pro đầy đủ, kỹ thuật theo loại video, kiểm chứng, lint, TikTok viral, `CAPTIONS.md` |
| `scripts/check-viet-pro.mjs` | Bước 2 (`--stage script`, trước voice/render) và bước 9 (`--stage delivery`): biên bản `## viet_pro`, `script-table.v1.md` + compare, lint viet-pro từng file và `SCRIPT.md`, caption FB + TikTok; `--jev-audit` tuỳ chọn (chỉ WARN) |
| `references/engine-selection.md` | Bước 4 và 6: chọn engine, xử lý 16:9 / 9:16 |
| `references/audio-pipeline.md` | Bước 5: voice, SFX, nhạc nền, mix, bản quyền |
| `references/qa-checklist.md` | Bước 8: đo bằng lệnh, xem frame, nghe |
| `scripts/eleven.mjs` | `doctor`, `voice-info`, `models`, `tts`, `sfx`, `music`, `probe-models`, `audio-meta`; `tts`/`audio-meta` qua cổng viet-pro (`scripts/voice-gate.mjs`, exit 4) |
| `references/edit-method.md` | Bước 3 và 6: chức năng câu → hình, sàn chất lượng, GSAP, SFX |
| `scripts/video-lint.mjs` | Bước 8: lowercase, chữ nhỏ, vùng UI 9:16 |
| `scripts/judge.mjs` | Bước 8: `check`/`pair`; exit 3–4 → QA ảnh tĩnh |
| `references/footage-lane.md` | Nhánh footage thật (beta): transcribe, probe, EDL, ghép |
| `scripts/cut.mjs` | `probe` (khoảng lặng an toàn), `apply-edl` (ghép theo danh sách cắt) |
| `scripts/find-cases.mjs` | Bước 3: tra 813 case trong `data/cases.jsonl`. Tra bằng script, không đọc file trực tiếp |
| `scripts/rerank-cases.mjs` | Bước 3 (tuỳ chọn, cần `TYPESAFE_API_KEY`): Jev xếp hạng ~740 case có prompt dùng được (≥ 40 ký tự) theo brief JSON; thiếu key hoặc lỗi API thì tự trả kết quả `find-cases` (`--stats` cho biết lý do) |
| `scripts/case-features.mjs` | Gắn nhãn cố định cho từng case vào `data/case-features.jsonl` (khổ hình, thể loại, chủ đề, độ chi tiết). **Chạy lại mỗi khi `data/cases.jsonl` thay đổi** (chỉ gắn nhãn dòng mới/đổi, khoảng 0,07 USD cho cả corpus) |
| `data/exemplars.md` | 17 prompt mẫu nguyên văn, có nguồn. Chỉ mở khi cần đọc prompt đầy đủ |
| `data/SOURCES.md` | Nguồn, commit và license của corpus; lệnh rebuild |
| `scripts/corpus-stats.mjs` | Thống kê lại corpus khi cập nhật dữ liệu nguồn |
