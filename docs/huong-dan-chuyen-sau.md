# Hướng dẫn chuyên sâu về các tính năng của opus-video

Tài liệu này dành cho người đã cài xong opus-video và muốn hiểu kỹ từng bước: file nào do ai ghi, cổng nào chặn ở đâu, mã thoát nghĩa là gì và gặp lỗi thì sửa thế nào. Phần cài đặt không nhắc lại ở đây, xem [README.md](../README.md) và [hướng dẫn cài cho từng agent](cai-dat-agent.md). Phần giới thiệu ngắn nằm ở [gioi-thieu.md](gioi-thieu.md). Muốn có sẵn câu lệnh để giao việc cho agent, xem [thư viện prompt mẫu](thu-vien-prompt/README.md).

Nguồn sự thật luôn là [SKILL.md](../SKILL.md), các file trong `references/` và phần `--help` của từng script. Tài liệu này chỉ giải thích và dẫn đường. Khi hai bên khác nhau, tin vào script.

Quy ước trong tài liệu:

- `$OV` là thư mục chứa `SKILL.md` của opus-video trên agent đang chạy (Claude Code dùng `~/.claude/skills/opus-video`).
- `$VP` là thư mục skill viet-pro. `node $OV/scripts/setup-check.mjs` in đường dẫn thật.
- Mọi lệnh chạy trong thư mục dự án video, trừ khi ghi khác. Mọi script của opus-video đều có `--help`.
- CLI `hyperframes` gọi trực tiếp hoặc qua `npx hyperframes`, hai cách như nhau.

## 1. Mô hình tư duy

### 1.1 Skill điều phối, không tự render

opus-video không có engine dựng hình riêng. Nó nối các skill có sẵn theo một thứ tự cố định: viet-pro viết và rà kịch bản tiếng Việt, ElevenLabs làm giọng đọc, SFX và nhạc nền, HyperFrames (hoặc Remotion, Canvas) dựng và render, Gemini qua `agy` xem video và chấm. Phần riêng của opus-video là các script cổng, script âm thanh, chỉ mục 813 case mẫu và thư viện pattern.

Vì vậy khi một bước hỏng, câu hỏi đầu tiên là bước đó thuộc công cụ nào. Lỗi lint composition thuộc HyperFrames, lỗi văn phong thuộc viet-pro, còn lỗi cổng (exit 4, exit 5) là opus-video đang làm đúng việc của nó.

### 1.2 Cổng là cưỡng chế, không phải lời khuyên

Ba cổng không được bỏ qua, theo thứ tự:

| Cổng | Script | Chặn cái gì |
|---|---|---|
| Kịch bản viet-pro (bước 2) | `check-viet-pro.mjs` | Tạo giọng và render khi kịch bản chưa qua quy trình viet-pro đầy đủ |
| Plan (bước 4b) | `check-preflight.mjs --stage plan` | Tạo giọng và dựng khi chưa có `PLAN.md` đủ mục |
| Demo đã duyệt (bước 6b) | `check-preflight.mjs --stage final` | Render bản giao khi chưa có khung hình demo mới hơn plan và lời duyệt |

Hai script khác tự gọi lại cổng nên không thể đi đường vòng. `eleven.mjs tts` và `audio-meta` chạy cổng viet-pro qua `voice-gate.mjs` trước khi gọi API, chặn thì thoát mã 4. `render-final.mjs` chạy `check-preflight --stage final` trước khi render, chặn thì thoát mã 5. Bản giao cuối chỉ có một đường ra là `render-final.mjs`.

Cổng thứ tư nằm ở cuối: `check-viet-pro.mjs --stage delivery` kiểm caption và dấu kiểm của từng file giọng trước khi gửi link video cho người dùng.

### 1.3 Mọi bước để lại bằng chứng

Mỗi quyết định được ghi vào một file trong thư mục dự án: biên bản `## viet_pro` cho biết đã đọc gì và sửa pattern nào, `PLAN.md` cho biết sẽ dựng gì, `DEMO.md` ghi ai duyệt khung hình nào, `QA.md` ghi kết quả từng vòng kiểm. Người khác (hoặc một agent khác) mở thư mục ra là biết dự án đang ở đâu.

## 2. Giải phẫu thư mục dự án

Bố cục chuẩn theo [SKILL.md](../SKILL.md). Bảng dưới đây ghi rõ ai tạo từng file và ở bước nào.

| File hoặc thư mục | Ai ghi | Bước | Ghi chú |
|---|---|---|---|
| `BRIEF.md` | agent | 1 | Khung theo [brief-template.md](../references/brief-template.md). Về sau thêm `engine`, `workflow`, `engine_reason`, `case_search`, id case tham khảo và biên bản `## viet_pro` |
| `SOURCES.md` | agent | 2 | Mỗi claim một dòng: claim, nguồn, trạng thái. Bắt buộc với explainer, phản bác ngộ nhận hoặc kịch bản có số liệu |
| `script-table.v1.md` | agent | 2 | Bản nháp đầu, trước lượt Humanizer. Cổng dùng nó để so dữ kiện với bản cuối |
| `script-table.md` | agent | 2 | Bảng 3 cột bản cuối. Không đặt tên `script.md` vì macOS coi `script.md` và `SCRIPT.md` là một file |
| `script/NN.txt` | agent | 2 | Mỗi file một câu đọc. Đây là văn bản duy nhất `eleven.mjs tts` nhận |
| `SCRIPT.md` | agent | 2 | Chỉ khi dùng workflow HyperFrames chuyên biệt. Mỗi frame phải trùng từng chữ với `script/NN.txt` |
| `BRIEF.case-query.json` | agent | 3 | Brief chuẩn hoá bằng tiếng Anh để tra case, trường nào brief không nói thì ghi `"not stated"` |
| `STORYBOARD.md` | agent | 3 | Lưới beat, mỗi beat một hành động, cột SFX |
| `PLAN.md` | agent | 4b | Mẫu ở [plan-demo.md](../references/plan-demo.md) |
| `assets/voice/NN.mp3` | `eleven.mjs` | 5 | Kèm `NN.mp3.words.json` (mốc từng từ) và `NN.mp3.gate.json` (dấu kiểm cổng) |
| `audio_meta.json`, `audio_engine_meta.json` | `eleven.mjs audio-meta` | 5 | Chỉ ở workflow HyperFrames chuyên biệt. Không xoá sidecar `audio_engine_meta.json` |
| `assets/sfx/`, `assets/bgm/` | `eleven.mjs` hoặc `media-use resolve` | 5 | |
| `assets/CREDITS.md` | agent | 5 | Nguồn và license của mọi tài sản |
| `index.html`, `compositions/` | HyperFrames, frame worker | 6 | `compositions/main-9x16.html` khi dựng tay cả hai khổ |
| `demo/`, `demo/9x16/` | `make-demo.mjs` | 6b | PNG chụp đúng mốc trong `PLAN.md` |
| `DEMO.md` | `make-demo.mjs`, rồi agent | 6b | Script ghi `approval: pending`. Agent chỉ ghi lời duyệt sau khi người dùng trả lời |
| `renders/` | `hyperframes render`, `render-final.mjs` | 7 | Bản nháp và bản giao |
| `qc/` | `judge.mjs` | 8 | Kết quả chấm và khung hình của lỗi hard |
| `QA.md` | agent | 8 | Mỗi dòng `PASS` hoặc `FAIL`, mục, chi tiết |
| `CAPTIONS.md` | agent | 9 | Hai mục `## Facebook cá nhân` và `## TikTok` |

Nhánh footage và nhánh clip làm trục có thêm vài file:

| File | Ai ghi | Ghi chú |
|---|---|---|
| `transcript.json` hoặc `transcripts/<tên-clip>/transcript.json` | `hyperframes transcribe` | Bản chép lời Whisper, mảng từ có `start` và `end` |
| `probe.json` | `cut.mjs probe` | Các khoảng lặng an toàn để cắt |
| `edl.json` | agent | Danh sách đoạn giữ lại, mỗi đoạn bắt đầu và kết thúc trong một khoảng lặng |
| `captions.fixes.json` | agent, người dùng duyệt | Bảng sửa lời nghe máy (`fix`, `unclear`, `ranges`) |
| `assets/fx/captions.js`, `script/captions.txt`, `captions.review.md` | `captions-from-transcript.mjs` | Phụ đề cho composition, bản text cho cổng viet-pro, bảng cho người dùng duyệt |
| `script/on-screen.txt` | agent | Mọi chuỗi chữ trên hình ngoài phụ đề, mỗi dòng một chuỗi |

## 3. Quy trình 9 bước, đi sâu

### Bước 0. Kiểm tra cài đặt

```bash
node $OV/scripts/setup-check.mjs          # thêm --json nếu cần kết quả máy đọc
node $OV/scripts/eleven.mjs doctor
```

`setup-check` thoát 0 và in `READY` khi đủ công cụ, skill và key. Thoát 1 (`NOT READY`) thì làm theo dòng `fix:` dưới mỗi mục `MISSING`. Các mục `WARN` (`agy`, `TYPESAFE_API_KEY`, skill Remotion) không chặn. `eleven.mjs doctor` đạt khi thoát 0 và in `tier`, `tts model`, `voice`, kèm ba dòng thông tin `jev key`, `jev`, `viet-pro` không làm lệnh thất bại.

Key nằm trong `~/.config/opus-video/.env`. Script tự đọc file này và không bao giờ in giá trị key. Agent không được source, cat hay echo file đó.

### Bước 1. Brief

Agent điền `BRIEF.md` theo [brief-template.md](../references/brief-template.md). Chỉ ba thứ cần hỏi người dùng khi không suy ra được: chủ đề, `aspect` (`16:9`, `9:16` hoặc `both`) và thời lượng. Các trường khác agent tự đề xuất và ghi rõ là đề xuất.

Frontmatter quyết định hành vi của nhiều script về sau:

- `language:` quyết định cổng viet-pro có chạy không. `vi`, `vie`, `vi-VN`, "tiếng Việt" (có dấu hay không dấu) hoặc để trống đều tính là tiếng Việt.
- `voice_source: clip` chuyển cổng viet-pro sang chế độ lint phụ đề và chữ trên hình thay cho kịch bản TTS (mục 6).
- `aspect: both` buộc `PLAN.md` có thêm mục khung hình demo 9:16.
- `duration_s:` được cổng viet-pro dùng để cảnh báo khi lời đọc quá khoảng 3 từ mỗi giây.

### Bước 2. Kịch bản và cổng viet-pro

Quy trình chi tiết nằm ở [script-workflow.md](../references/script-workflow.md). Tóm tắt các việc agent phải làm theo đúng thứ tự:

1. Đọc hết `$VP/SKILL.md`, toàn bộ `$VP/references/review/`, toàn bộ `$VP/references/editorial/` và `$VP/references/publishing/video-script.md`.
2. Soạn bảng 3 cột `Thời điểm | Voice-over | Visual / text trên hình`, khoảng 2,5 đến 3 từ mỗi giây. Lưu thành `script-table.v1.md`.
3. Lượt Humanizer có ghi chép: đi qua đủ 25 pattern, ghi từng pattern tìm thấy, câu gốc và cách sửa. Tối đa hai vòng.
4. Đối chiếu dữ kiện giữa bản nháp và bản cuối bằng `node $VP/scripts/compare-preserved-content.mjs script-table.v1.md script-table.md --keep "<tên riêng>"`. MISMATCH phải xử lý.
5. Lưu bản cuối thành `script-table.md`, tách lời vào `script/NN.txt`, chạy `node $VP/scripts/lint-vietnamese-content.mjs script-table.md script/*.txt` và sửa hết ERROR cùng các WARN văn phong.
6. Ghi biên bản `## viet_pro` vào `BRIEF.md` với các trường `mode`, `files_read`, `humanizer`, `lint`, `words`, `facts`.

Sau đó chạy cổng:

```bash
node $OV/scripts/check-viet-pro.mjs --project .
```

| Mã thoát | Nghĩa |
|---|---|
| 0 | `PASS`, hoặc `SKIP` khi `language:` không phải tiếng Việt |
| 1 | `BLOCKED`: thiếu biên bản hay trường bắt buộc, `files_read` thiếu file, thiếu `script-table.v1.md`, compare báo MISMATCH, hoặc lint còn ERROR ở `script-table.md`, `script/*.txt`, lời đọc trong `SCRIPT.md` |
| 2 | Sai cú pháp hoặc không tìm thấy viet-pro (chỉ định bằng `--vp <thư mục>` hoặc biến `VIET_PRO_DIR`) |

Cổng chỉ in WARN, không chặn, khi gặp câu mồi tương tác, lời kể trải nghiệm ngôi thứ nhất cần người dùng xác nhận, hoặc lời đọc dài quá thời lượng. Agent phải đọc từng WARN và sửa hoặc ghi lý do giữ.

`--jev-audit` là tuỳ chọn khi có `TYPESAFE_API_KEY`: Jev rà từng `script/NN.txt` về Humanizer 1 đến 5, câu mồi, trải nghiệm tự bịa và số liệu không nguồn. Lệnh chỉ in WARN và không đổi mã thoát.

Video TikTok, Reels, Shorts vẫn theo viet-pro đầy đủ, với thêm các luật kênh ngắn trong [SKILL.md](../SKILL.md): hook 1 đến 3 giây vào thẳng ý, một video một insight, giọng "mình" và "bạn", không bịa trải nghiệm, tối đa một CTA cụ thể và không dùng câu mồi tương tác.

Bỏ cổng chỉ hợp lệ khi người dùng nói rõ là bỏ viet-pro: ghi `viet_pro_override: <lý do ít nhất 10 ký tự>` vào frontmatter `BRIEF.md` rồi thêm cờ `--skip-viet-pro-gate` cho `eleven.mjs`. Lý do được in ra mỗi lần chạy. Cổng giao sẽ chặn chừng nào dòng override còn đó.

### Bước 3. Storyboard và tra case mẫu

Trước khi viết `STORYBOARD.md`, agent tra case gần nhất một lần cho cả dự án (mục 4). Kết quả dẫn tới các thẻ kỹ thuật và dòng trong bảng nối nhóm sang HyperFrames của [pattern-library.md](../references/pattern-library.md). Id case tham khảo và giá trị `case_search` được ghi vào `BRIEF.md`.

`STORYBOARD.md` lấy từ bảng của viet-pro, cộng khối `<structure>` của brief: BPM, beat, mỗi beat một hành động, cột SFX. [edit-method.md](../references/edit-method.md) phải được đọc trước bước này, vì nó quy định câu đang làm gì thì hình xử lý ra sao.

### Bước 4. Engine

Mặc định là HyperFrames. Bảng chọn workflow và các trường hợp dùng Remotion hay Canvas nằm ở mục 5 và [engine-selection.md](../references/engine-selection.md). Agent ghi `engine`, `workflow`, `engine_reason` vào `BRIEF.md`.

### Bước 4b. Plan

`PLAN.md` có sáu mục `##` bắt buộc: Mục tiêu, Cảnh (bảng, mỗi cảnh một dòng), Âm thanh, Engine, Khung hình demo, QA. Khi `aspect: both` thì thêm mục Khung hình demo 9:16. Mỗi dòng khung hình demo là một gạch đầu dòng bắt đầu bằng số giây rồi tới điều cần xem, ví dụ `- 3 - logo đọc rõ, đủ dấu`, ít nhất một mốc cho mỗi cảnh. Các giá trị giữ chỗ như `…`, `TODO`, `TBD`, `<…>`, `pending` bị coi là trống. Tiêu đề khớp cả khi viết không dấu.

```bash
node $OV/scripts/check-preflight.mjs --project . --stage plan
```

Mã thoát: 0 đạt, 1 bị chặn, 2 sai cú pháp. Cổng phải đạt trước khi tạo giọng và dựng. Agent gửi tóm tắt plan cho người dùng; người dùng đổi ý thì sửa `PLAN.md` và chạy lại cổng.

### Bước 5. Âm thanh

Chỉ bắt đầu khi cổng viet-pro và cổng plan đều đã đạt. Thứ tự là giọng trước để có thời lượng thật, rồi chỉnh storyboard cho khớp, sau đó mới tới SFX, nhạc nền và mix. Chi tiết ở mục 6 và [audio-pipeline.md](../references/audio-pipeline.md).

### Bước 6. Dựng

- HyperFrames: gọi skill `hyperframes`. Vì đã có `BRIEF.md`, nó đi vào workflow ghi ở `workflow:`.
- Bắt buộc chạy `hyperframes catalog --query "<hiệu ứng>"` trước khi tự viết hiệu ứng, ưu tiên block hay blueprint đã chọn ở bước 3.
- Chép mục "Sàn chất lượng" và "Kỷ luật GSAP" của [edit-method.md](../references/edit-method.md) vào prompt của frame worker.
- Workflow có frame preset: đổi font sang Be Vietnam Pro nếu preset thiếu dấu tiếng Việt (mục 5.3).
- Áp dụng banned list trong brief.

### Bước 6b. Khung hình demo và duyệt

```bash
node $OV/scripts/make-demo.mjs --project .                                                         # bản chính, ghi demo/
node $OV/scripts/make-demo.mjs --project . --aspect 9x16 --composition compositions/main-9x16.html  # 9:16 cùng project
node $OV/scripts/make-demo.mjs --project . --aspect 9x16 --hyperframes ../<project-9x16>             # 9:16 là project riêng
node $OV/scripts/make-demo.mjs --project . --from-video renders/<nháp>.mp4                          # cắt từ bản nháp người dùng đã xem
```

Mặc định script dùng `hyperframes snapshot` tại đúng các mốc trong `PLAN.md`. `--composition` render bản nháp rồi cắt PNG bằng ffmpeg, vì snapshot không chọn được composition. `--from-video` chỉ nhận MP4 mới hơn `index.html` và `compositions/*.html`. Mỗi lần chụp, script xoá `frame-*.png` cũ và ghi lại `DEMO.md` với `approval: pending`. Mã thoát: 0 đã chụp, 1 chụp lỗi, 2 sai cú pháp hoặc `PLAN.md` thiếu mốc.

Agent tự xem từng khung (đủ dấu, không tràn chữ, đúng vùng an toàn, đúng nội dung cảnh), gửi khung hình cho người dùng rồi dừng chờ trả lời. Người dùng đồng ý thì ghi vào `DEMO.md`, ví dụ `approval: người dùng, 2026-10-12 14:05, "ok, render bản cuối"`. Chỉ khi người dùng đã nói rõ là chạy không dừng thì agent mới được ghi `approval: auto` kèm lý do và lời của người dùng. `approval` trống, `pending` hoặc ngắn hơn 6 ký tự đều bị chặn.

```bash
node $OV/scripts/check-preflight.mjs --project . --stage final
```

Ngoài các điều kiện của cổng plan, cổng final đòi `demo/` có đủ PNG thật cho mọi mốc (và `demo/9x16/` khi cần), mọi khung mới hơn `PLAN.md` và `DEMO.md` có lời duyệt thật. Composition sửa sau lần chụp demo cuối chỉ là WARN; nếu thay đổi nhìn thấy được thì chụp lại và xin duyệt lại.

### Bước 7. Render

```bash
# bản nháp, bản QA
hyperframes render --quality looks --output renders/<name>-16x9.mp4
hyperframes render -c compositions/main-9x16.html --quality looks --output renders/<name>-9x16.mp4

# bản giao, chỉ qua cổng
node $OV/scripts/render-final.mjs --project . -- --output renders/<name>-16x9.mp4
node $OV/scripts/render-final.mjs --project . -- -c compositions/main-9x16.html --output renders/<name>-9x16.mp4
```

`render-final.mjs` chạy `check-preflight --stage final`, kiểm ffmpeg và ffprobe chạy được, rồi `hyperframes render --quality delivery` với các tham số sau `--`. Render xong, script thay tiếng bằng bản mix của `audio-mix.mjs` và ghi `<output>.render.json` (mục 10.3). Mã thoát: 5 là cổng chặn, 2 là sai cú pháp (kể cả khi truyền `--quality` hay `-q`) hoặc thiếu ffmpeg, 1 là mix lại tiếng lỗi, còn lại là mã thoát của chính lệnh render. Chỉ đổi nhạc, SFX hay mức âm thì dùng `--audio-only` thay cho render lại (mục 10.3). Không gọi thẳng `hyperframes render --quality delivery`. `--resolution` chỉ đổi kích thước render, không đổi khổ hình. Project 9:16 riêng thì chạy lệnh ngay trong thư mục đó.

### Bước 8. QA

Vòng QA tự xem video ở mục 7, tối đa ba phiên bản, kết quả ghi vào `QA.md`.

### Bước 9. Caption khi giao

Bắt buộc với video tiếng Việt. Chi tiết ở mục 8.

## 4. Tra case mẫu

Skill mang theo chỉ mục 813 video làm bằng Opus 5.5 trong `data/cases.jsonl`. Không đọc file này trực tiếp, luôn tra bằng script.

### 4.1 Tra nhanh bằng `find-cases`

```bash
node $OV/scripts/find-cases.mjs --category <motion|explainer|3d|interactive|product|story-music> --keyword <từ khoá tiếng Anh> --limit 5
```

Các cờ khác có trong `--help`: `--tag`, `--full-only`, `--max-chars`, `--json`. Cờ `--keyword` lặp lại được. Mỗi kết quả có dòng `### <id> · @tác giả · nhóm · tag`, link nguồn và đoạn đầu prompt. Không có kết quả thì stderr in `no matching cases`; khi đó bỏ `--keyword` và tra lại chỉ theo nhóm. Prompt trong corpus thuộc về tác giả gốc, chỉ dùng để học cấu trúc và luôn kèm link khi trích.

### 4.2 Xếp hạng bằng Jev với `rerank-cases`

Khi có `TYPESAFE_API_KEY`, agent viết `BRIEF.case-query.json` bằng tiếng Anh, chỉ lấy thông tin có trong brief, rồi chạy:

```bash
node $OV/scripts/rerank-cases.mjs --brief-json BRIEF.case-query.json --aspect <16:9|9:16|both> --pool all --limit 5 --stats \
     --category <nhóm> --keyword <từ khoá tiếng Anh>
```

- `--pool all` chấm khoảng 740 case có prompt từ 40 ký tự trở lên theo loại video, chủ đề và phong cách hình, rồi code cộng thêm độ chi tiết của prompt và luật khổ hình (case dọc được đẩy lên cho brief 9:16). Mất khoảng 1 giây và khoảng 0,03 USD.
- Luôn kèm `--category` và `--keyword`: thiếu key, lỗi API hay hết giờ thì script tự trả kết quả `find-cases` với đúng các cờ đó và vẫn thoát 0.
- Dòng `###` có `· jev 0.xx (…)` nghĩa là Jev đã xếp hạng. Không có `jev` nghĩa là đang ở chế độ dự phòng.
- `--stats` in một dòng JSON ra stderr có trường `case_search`. Chép nguyên giá trị vào `BRIEF.md`, ví dụ `case_search: jev` hoặc `case_search: find-cases (HTTP 401)`.
- Brief nặng về phong cách hình (cắt giấy, pixel art, kinetic type) thì thêm `--weights '{"style":0.3}'`.
- Không bật `--pair` hay `--shortlist`. Hai cờ này đã được thử và không cho kết quả tốt hơn, `--pair` còn làm mất case dọc.

### 4.3 Đọc dòng ghi chú

| Ghi chú | Nghĩa | Cách xử lý |
|---|---|---|
| `weak matches` | Corpus không có mẫu sát chủ đề (hay gặp với làm đẹp, F&B, bất động sản, sự kiện, talking-head, du lịch) | Chỉ mượn cấu trúc và kỹ thuật, dựa chủ yếu vào pattern-library |
| `weak style fit` | Không case nào trong top có phong cách hình giống brief | Mượn cấu trúc và nhịp, phong cách lấy từ `key_visuals` của brief và thẻ kỹ thuật |
| `no vertical (9:16) case` | Không có case dọc | Tự lo vùng an toàn 9:16 theo pattern-library |

Điểm `jev` chỉ để định hướng. Hạng 4 và 5 gần nhau thì coi như ngang nhau, ưu tiên case có prompt đầy đủ. Agent đọc 2 đến 3 case rồi chọn thẻ kỹ thuật trong [pattern-library.md](../references/pattern-library.md). Muốn đọc prompt mẫu nguyên văn có nguồn thì mở [exemplars.md](../data/exemplars.md).

## 5. Engine và khổ hình

### 5.1 Chọn workflow

| Loại video | Workflow HyperFrames |
|---|---|
| Explainer không footage, kiến thức, list, how-to | `faceless-explainer` khi đã chạy `eleven.mjs audio-meta`; `general-video` khi dựng tay |
| Quảng cáo, ra mắt sản phẩm có URL | `product-launch-video` |
| Pull request GitHub thành video giải thích thay đổi | `pr-to-video` |
| Bám nhạc: lyric video, slideshow theo beat | `music-to-video` |
| Ngắn, không lời, motion là chính | `motion-graphics` |
| Dài hơn, nhiều cảnh, montage | `general-video` |
| Phụ đề nằm trong video | `embedded-captions` (dùng kèm) |
| Talking-head cần thẻ đồ hoạ phủ lên | `talking-head-recut` |
| Footage thật cần cắt khoảng lặng | nhánh footage (mục 6.6) |
| Nhiều biến thể của một mẫu | composition có biến và `render --batch` |

Skill `slideshow` của HyperFrames tạo bộ slide điều hướng được, không phải MP4. Muốn ra video từ một bộ ảnh thì dùng `music-to-video`.

Remotion chỉ chọn khi người dùng yêu cầu React hoặc đã có codebase Remotion. Khi đó ghi lý do vào `engine_reason`. Raw HTML, Canvas hay Three.js với Playwright và ffmpeg chỉ dùng khi cần shader hay mô phỏng có trạng thái mà HyperFrames không seek được, vì đường này không có lint, check hay studio. Blender và After Effects nằm ngoài phạm vi skill.

### 5.2 Hai khổ hình

Mỗi khổ cần một composition riêng, vì `--resolution` không đổi khổ. Với `aspect: both`, bản dọc được dàn lại bố cục, không crop:

- Dựng tay (`general-video`): hai composition trong cùng project, `index.html` 1920×1080 và `compositions/main-9x16.html` 1080×1920.
- Workflow có frame worker (`faceless-explainer`, `pr-to-video`, `product-launch-video`): một project 9:16 riêng, giữ nguyên `audio_meta.json` và sidecar. Sau mỗi lần `captions.mjs build` ở 1080×1920, chạy lệnh sửa dải phụ đề vì mặc định 1600px rơi vào vùng UI che:

```bash
node $OV/scripts/replace-in-file.mjs compositions/captions.html "--cap-band-top: [0-9]*px;" "--cap-band-top: 1340px;" "--cap-band-height: [0-9]*px;" "--cap-band-height: 200px;"
```

Luật bố cục cho bản 9:16:

- Không đặt nội dung chính trong 12% phía trên và 20% phía dưới, vì đó là vùng giao diện TikTok, Reels, Shorts che.
- Chữ to hơn khoảng 1,3 lần so với bản ngang.
- Tiêu đề tối đa khoảng 18 ký tự mỗi dòng.
- Bố cục trái phải chuyển thành trên dưới.
- Hai khổ dùng chung một bộ âm thanh để timing giống nhau.

### 5.3 Font tiếng Việt

Các file Inter có sẵn trong skill HyperFrames là subset latin, thiếu các chữ như ư, ễ, đ, ạ, ơ. Với video tiếng Việt, ngay sau `build-frame.mjs` và trước khi giao việc cho frame worker, đổi mọi `fontFamily` trong `frame.md` sang Be Vietnam Pro và copy các file `BeVietnamPro-*.ttf` vào `assets/fonts/`:

```bash
node $OV/scripts/replace-in-file.mjs frame.md 'fontFamily: "[^"]*"' 'fontFamily: "Be Vietnam Pro"'
```

Kiểm tra bằng cách render một khung có chuỗi `Ánh nắng ơ ư đ ễ ạ ỹ` rồi trích ảnh xem. Các bài học khác khi dựng (đăng ký timeline inline, mỗi SFX một `data-track-index`, contrast, GSAP offline, caption skin chữ thường) nằm ở [engine-selection.md](../references/engine-selection.md).

## 6. Âm thanh

Mọi lệnh âm thanh đi qua `node $OV/scripts/eleven.mjs <lệnh>`. Mặc định: voice `eGSd0uV8dNQnZuEEX9lu`, TTS `eleven_v4`, nhạc `music_v2_5`, SFX `eleven_text_to_sound_v2`.

### 6.1 Các lệnh con

| Lệnh | Việc | Qua cổng viet-pro |
|---|---|---|
| `doctor` | Kiểm key, gói, model, giọng; báo Jev và viet-pro | không |
| `voice-info [--voice id]` | Thông tin một giọng | không |
| `models` | Danh sách model | không |
| `tts --text-file <project>/script/NN.txt --out f.mp3` | Tạo giọng một câu, tuỳ chọn `--project`, `--voice`, `--model`, `--speed`, `--lang`, `--skip-viet-pro-gate` | có |
| `sfx --text "<mô tả tiếng Anh>" --seconds 1.5 --out f.mp3` | Sinh SFX, tuỳ chọn `--influence` | không |
| `music --prompt "<mô tả>" --seconds 15 --out f.mp3` | Sinh nhạc nền không lời | không |
| `probe-models --text-file <file> --models a,b` | So giọng hoặc model, file luôn ghi vào `$TMPDIR/ov-probe/` | không |
| `audio-meta --script SCRIPT.md --hyperframes .` | Cầu nối sang workflow HyperFrames, tuỳ chọn `--project`, `--bgm`, `--bgm-volume`, `--reuse`, `--skip-viet-pro-gate` | có |

Mã thoát của `eleven.mjs`: 0 thành công, 1 lỗi, 2 sai cú pháp, 3 nhạc không dùng được trên gói hiện tại, 4 cổng viet-pro chặn.

### 6.2 Giọng đọc và dấu kiểm

Dựng tay thì làm giọng từng câu:

```bash
node $OV/scripts/eleven.mjs tts --text-file script/01.txt --out assets/voice/01.mp3
```

Đầu ra gồm `01.mp3`, `01.mp3.words.json` (mảng `{text, start, end}` tính bằng giây, dùng cho phụ đề và canh beat) và `01.mp3.gate.json` (hash của lời đọc đã chuẩn hoá cùng lý do override nếu có). `tts` chỉ nhận `--text-file` trỏ vào `script/NN.txt`, không nhận `--text`. Dự án không phải tiếng Việt phải truyền `--lang` đúng ngôn ngữ, vì giá trị mặc định `vi` sẽ bị từ chối.

Vì giọng mặc định không gắn nhãn tiếng Việt, luôn đưa file cho người dùng nghe trước khi giao. Agent không tự chấm chất lượng giọng hay thanh điệu. `--speed` trong khoảng 0,9 đến 1,1 dùng để chỉnh nhịp.

Không chép mp3 từ chỗ khác vào `assets/voice/` và không xoá file `.gate.json`, vì cổng giao chặn mọi mp3 không có dấu kiểm, có dấu kiểm override hoặc lệch với `script/NN.txt` hiện tại.

### 6.3 Cầu nối HyperFrames với `audio-meta`

Bước `audio.mjs generate` của các workflow HyperFrames ghim model không có tiếng Việt. Với `faceless-explainer`, `product-launch-video`, `pr-to-video`, agent bỏ bước đó và chạy:

```bash
node $OV/scripts/eleven.mjs audio-meta --script SCRIPT.md --hyperframes . --bgm assets/bgm/bgm.mp3 --bgm-volume 0.2
```

Lệnh so từng frame của `SCRIPT.md` với `script/NN.txt` (bỏ qua khác biệt khoảng trắng), tạo giọng cho từng frame vào `assets/voice/NN.mp3`, rồi ghi `audio_meta.json` và `audio_engine_meta.json`. Sau đó chạy tiếp `audio.mjs sync-durations`, `audio.mjs fetch-sfx`, `captions.mjs build` của workflow như bình thường. `fetch-sfx` merge từ sidecar rồi ghi đè `audio_meta.json`, nên thiếu sidecar là mất hết giọng.

`--reuse` chỉ dùng lại file có dấu kiểm khớp với lời hiện tại và không phải override, nên sửa một câu rồi chạy lại với `--reuse` thì chỉ câu đó tốn credit.

### 6.4 SFX và nhạc nền

- SFX: thử catalog trước bằng `hyperframes media-use resolve --type sfx --intent "<mô tả>" --project .`, thiếu hoặc không hợp thì `eleven.mjs sfx`. Mỗi video ngắn 2 đến 6 SFX, mỗi tiếng gắn với một hành động hình. Tối đa 2 tiếng trong 3 giây.
- Nhạc nền: `eleven.mjs music` với BPM ghi trong prompt để storyboard bám beat. Gói Creator cho tối đa 2 luồng song song nên không gọi music song song. Thoát 3 kèm `MUSIC_UNAVAILABLE` thì chuyển sang `hyperframes media-use resolve --type bgm --intent "<mood>" --project .`.
- Không dùng TTS của `media-use` cho tiếng Việt.
- Ghi nguồn mọi tài sản vào `assets/CREDITS.md`.

### 6.5 Mix

Mức mục tiêu: giọng khoảng -16 LUFS, nhạc nền khi có giọng -28 đến -31 LUFS, nhạc khi không có giọng khoảng -20 LUFS, SFX khoảng -20 LUFS với đỉnh không quá -3 dBTP, bản master khoảng -14 LUFS integrated và -1 dBTP. Chỉnh bằng `hyperframes normalize-audio` và limiter ở bus master theo skill `hyperframes-audio`, rồi đo lại bằng `qc-mp4.mjs` (mục 10.1). Bảng đầy đủ ở [audio-pipeline.md](../references/audio-pipeline.md). Bản giao không giữ bản mix của HyperFrames mà dựng lại bằng `audio-mix.mjs` (mục 10.3).

### 6.6 Nhánh footage thật (beta)

Dùng khi người dùng đưa clip quay thật (talking-head, phỏng vấn, UGC) cần cắt gọn. Quy trình đầy đủ ở [footage-lane.md](../references/footage-lane.md):

1. `ffprobe` từng clip. Clip điện thoại có fps thay đổi hoặc 10-bit HDR phải chuẩn hoá trước bằng ffmpeg.
2. Chép lời local: `hyperframes transcribe <clip> -e whisper -m large-v3 -l vi -d transcripts/<tên-clip>`. Không redirect stdout vào file.
3. Tìm điểm cắt an toàn:

```bash
node $OV/scripts/cut.mjs probe --in <clip> --out probe.json           # tuỳ chọn --min-gap-ms 250
node $OV/scripts/cut.mjs apply-edl --edl edl.json --out assets/footage/cut.mp4   # tuỳ chọn --fade-ms 12
```

`probe` tìm các khoảng lặng ít nhất 250 ms. Chỉ cắt trong các khoảng lặng này, không cắt theo ranh giới từ của bản chép lời. `apply-edl` ghép các đoạn trong `edl.json` bằng một lần encode, mỗi mối nối có fade âm thanh ngắn. Mã thoát của `cut.mjs`: 0 thành công, 1 sai cú pháp hoặc EDL không hợp lệ, 2 nguồn không dùng được (không có tương phản tiếng nói, hoặc các nguồn lệch fps, kích thước, định dạng điểm ảnh, màu), 3 ffmpeg lỗi hoặc lệch thời lượng.

Sau đó dựng lớp trên trong HyperFrames với `cut.mp4` làm nền, rồi quay lại bước 4b và các bước 6 đến 9. Lời đọc hay chữ tiếng Việt mới thêm vẫn qua cổng viet-pro, plan và demo vẫn bắt buộc. Reframe theo khuôn mặt, xoá từ đệm tự động và tách người nói chưa được hỗ trợ.

### 6.7 Clip làm trục và phụ đề từ bản chép lời

Dùng khi clip của người dùng có sẵn lời nói và được đặt trong khung PiP trên nền bản đồ, phối cảnh hay sơ đồ dựng mới, hiệu ứng bám đúng từng chữ.

Quy trình và bố cục 9:16 đã kiểm nằm ở [clip-master-canvas.md](../references/clip-master-canvas.md). Các điểm khác với quy trình TTS:

- `BRIEF.md` có `voice_source: clip` và `duration_s` bằng độ dài clip.
- Chép lời bằng `npx hyperframes transcribe <clip> -d ./ -e whisper -m large-v3 -l vi --json`. Model `.en` không nhận tiếng Việt.
- Agent lập `captions.fixes.json` (sửa chỗ máy nghe sai, đánh dấu đoạn chưa rõ, chia cụm) rồi chạy:

```bash
node $OV/scripts/captions-from-transcript.mjs --project . --global CAPTIONS --duration <độ dài clip>
```

Lệnh ghi `assets/fx/captions.js`, `script/captions.txt` và `captions.review.md`, thoát 0 khi ghi xong và 2 khi sai cú pháp hoặc không đọc được đầu vào. Các tuỳ chọn `--transcript`, `--fixes`, `--out` đổi đường dẫn mặc định. Người dùng duyệt bảng trong `captions.review.md`. Câu chưa nghe rõ đưa vào `unclear` để không có phụ đề, không đoán.

- `PLAN.md` viết ngay sau bản chép lời: mỗi ý người nói là một dòng trong bảng Cảnh.
- Mọi chuỗi chữ khác trên hình ghi vào `script/on-screen.txt`. Cổng viet-pro lint `script/captions.txt` và `script/on-screen.txt` thay cho bảng kịch bản; biên bản cần `mode`, `files_read` (gồm `SKILL.md` và `review/*`) và `lint`, không cần `humanizer`.
- Số trên hình chỉ lấy từ lời nói, chữ in sẵn trong clip hoặc brief. Nguồn của từng số ghi trong file dữ liệu, không ghi trên hình.
- Nội dung là của người dùng nên không gắn nhãn rào đón lên hình. `video-lint` báo `HEDGE_LABEL` ở mức ERROR với dự án `voice_source: clip`.
- Demo thường cắt từ bản nháp người dùng đã xem bằng `make-demo.mjs --from-video`.

## 7. QA

### 7.1 Vòng tự xem video

Mỗi phiên bản vN đi qua các bước trong [qa-checklist.md](../references/qa-checklist.md):

1. `hyperframes lint` thoát 0.
2. `hyperframes check --frame-check` (bản 16:9 thêm `--caption-zone` theo checklist).
3. `node $OV/scripts/video-lint.mjs --hyperframes .` thoát 0.
4. Render `renders/<name>-vN.mp4`.
5. `node $OV/scripts/judge.mjs check --video renders/<name>-vN.mp4 --hyperframes ./ --out qc/vN-check.json`.
6. Từ v2: `node $OV/scripts/judge.mjs pair --a renders/<name>-vN.mp4 --b renders/<name>-vN-1.mp4 --out qc/vN-vs-prev.json`.

Dừng khi các cổng đều qua và bản mới không thắng, hoặc đã tới v3, hoặc chỉ còn sửa nhỏ. Mỗi phiên bản phải sửa ít nhất một lỗi lớn. Quá ba vòng thì dừng và báo người dùng kèm bằng chứng.

### 7.2 `video-lint`

Bắt những gì `hyperframes check` bỏ sót. Tuỳ chọn `--json` và `--skip-runtime`.

| Mã | Mức | Bắt gì |
|---|---|---|
| `LOWERCASE_TRANSFORM` | ERROR | `text-transform: lowercase` biến "AI" thành "ai" |
| `FONT_TOO_SMALL` | ERROR dưới 1,6%, WARN dưới 2,2% cạnh ngắn | Chữ quá nhỏ để đọc trên điện thoại |
| `SAFE_ZONE_9X16` | ERROR | Chữ trong dải 12% trên hoặc 20% dưới của khung dọc |
| `HEDGE_LABEL` | ERROR khi `voice_source: clip`, WARN trong các trường hợp còn lại | Nhãn rào đón hiện trên hình, danh sách đầy đủ trong `--help` |

Mã thoát: 0 sạch hoặc chỉ có WARN, 1 có ERROR, 2 sai cú pháp hoặc công cụ lỗi.

### 7.3 `judge`

`judge.mjs` gửi bản 540p cho Gemini qua `agy`. `check` tìm lỗi hard và đối chiếu chữ trên hình với HTML của project, khung hình của lỗi hard được trích từ video gốc vào `<out>_frames/`. `pair` so hai phiên bản hai lần với thứ tự đảo, kết quả là `A`, `B`, `tie` hoặc `invalid`.

| Mã thoát | Nghĩa | Xử lý |
|---|---|---|
| 0 | `check` đạt hoặc `pair` có đồng thuận | |
| 1 | `check` có lỗi | Mở khung hình gốc trước khi kết luận, vì ở 540p Gemini hay đọc nhầm dấu |
| 2 | Kết quả không hợp lệ hoặc sai cú pháp | Chạy lại một lần |
| 3 | `agy` chưa đăng nhập | QA bằng ảnh tĩnh, ghi "không có giám khảo video" |
| 4 | Thiếu `agy` | Như trên |

Với `pair`: `A` giữ bản mới, `B` quay về bản cũ, `tie` giữ bản cũ trừ khi bản mới sửa được lỗi hard, `invalid` nghĩa là chưa so được, không tính là thua.

### 7.4 Đo bằng lệnh và nghe

Độ phân giải, fps, thời lượng và có audio được đo bằng các lệnh ffprobe trong [qa-checklist.md](../references/qa-checklist.md). Loudness, true peak, khung đen, đứng hình, khoảng lặng và bitrate do `qc-mp4.mjs` đo (mục 10.1). Nền tối dễ làm `BLACK_EDGE` báo nhầm: trích khung đó ra xem, nếu chỉ là nền màu trong lúc nội dung đang hiện dần thì ghi PASS kèm ghi chú. Phần nghe trong checklist gồm phụ đề lệch giọng không quá 150 ms (so `words.json` với thời điểm chữ xuất hiện), giọng không bị cắt, nhạc không lấn giọng. Thanh điệu tiếng Việt thì agent không tự chấm mà đưa file cho người dùng nghe.

## 8. Caption khi giao

Video tiếng Việt phải kèm `CAPTIONS.md` gồm hai mục `## Facebook cá nhân` và `## TikTok`. Mỗi caption đi qua đúng quy trình viet-pro như kịch bản, đọc thêm `$VP/references/publishing/facebook.md` và `$VP/references/publishing/repurpose-matrix.md`. Chi tiết ở mục 5 của [script-workflow.md](../references/script-workflow.md).

- Facebook cá nhân: vào đề ngay câu đầu, văn xuôi liền mạch, không heading, bullet hay markdown bên trong mục, xưng "mình" hoặc "tôi", nguồn đan vào câu.
- TikTok: dòng đầu tự đứng được và vào thẳng ý (viết lại hook, không chép câu mở của video), một insight, tối đa một CTA cụ thể. Hashtag chỉ khi người dùng muốn, 3 đến 5 cái đúng chủ đề, đặt cuối.
- Cùng insight và số liệu với video, không thêm claim mới.
- Biên bản `## viet_pro` thêm dòng `- captions:`, còn `files_read` thêm hai file publishing ở trên.

```bash
node $OV/scripts/check-viet-pro.mjs --project . --stage delivery
```

Cổng giao kiểm mọi điều kiện của cổng kịch bản, cộng thêm: `CAPTIONS.md` đủ hai mục và lint riêng từng mục, mục Facebook không có heading hay bullet, biên bản có `captions`, không còn `viet_pro_override`, mọi `assets/voice/NN.mp3` có dấu kiểm không phải override khớp với `script/NN.txt` hiện tại. Phải `PASS` trước khi gửi link video.

File phụ đề SRT cho YouTube hay Facebook (khi cần) tạo bằng `hyperframes transcribe <voice.mp3> -e whisper -m large-v3 -l vi -d captions --to srt -o captions/<name>.srt`, rồi rà chính tả và dấu trước khi giao. Agent không tự đăng video hay caption.

Bộ giao cho người dùng gồm:

- Đường dẫn MP4 render bằng `render-final.mjs`.
- `PLAN.md` và `DEMO.md` đã duyệt.
- `CAPTIONS.md` đã qua cổng giao.
- Link preview (`hyperframes preview --background`), dừng preview khi người dùng xem xong.
- Tóm tắt QA, nói rõ các mục cần tai người để người dùng tự nghe.

## 9. Script của workspace studio

Ba script dưới đây không thuộc opus-video. Chúng nằm trong thư mục `scripts/` của workspace studio đi kèm (thư mục gốc chứa nhiều dự án video, có `footage/`, `shared-assets/`). Chúng chỉ dùng được khi bạn làm việc trong workspace đó.

| Script | Việc | Điểm cần biết |
|---|---|---|
| `./scripts/new-project.sh <tên> --aspect 16:9\|9:16\|both [--duration <giây>]` | Tạo dự án mới với `package.json` ghim phiên bản HyperFrames, `.gitignore` chặn media, `BRIEF.md`, `STORYBOARD.md` khung và các thư mục `script/`, `assets/`, `renders/`, `compositions/` | `9:16` tạo thư mục `<tên>-9x16`, `both` tạo cả hai thư mục, khớp với mô hình project 9:16 riêng. Thư mục đã có thì bỏ qua để tránh mất dữ liệu |
| `./scripts/compress-final.sh <nguon.mp4> <dau-ra.mp4>` | Nén bản render thành file giao: giữ độ phân giải và fps, hình H.264 8 Mbit/s, tiếng AAC 192 kbit/s | Nguồn đã từ 12 Mbit/s trở xuống thì không nén lại. Không ghi đè file ra đã có, không xoá file nguồn. Tự xoá file ra nếu độ phân giải, fps hoặc thời lượng bị lệch |
| `./scripts/sweep-after-final.sh <dự án> [--keep renders/<file>]... [--apply]` | Dọn phần sinh ra không còn là đầu vào sau khi đã có bản final | Mặc định chỉ liệt kê, có `--apply` mới xoá. Giữ file trong `renders/` có tên chứa `final`, `delivery` hoặc `compressed`. Không đụng `assets/`, `script/`, `compositions/`, sidecar âm thanh, file `.md` |

`npm run render` trong dự án studio là lệnh render HyperFrames thường, phù hợp cho bản nháp. Bản giao vẫn đi qua `render-final.mjs`. Xoá ảnh demo bằng `sweep-after-final.sh` thì lần `render-final` sau phải chạy lại `make-demo.mjs`, vì cổng final đòi PNG mới hơn `PLAN.md`.

Không có workspace studio thì dùng `node $OV/scripts/export.mjs --project ./ --input renders/<tên>.mp4 --target facebook` thay cho `compress-final.sh` (mục 10.2).

## 10. Công cụ mới

### 10.1 `qc-mp4.mjs`, kiểm kỹ thuật file MP4

`qc-mp4.mjs` gom các lệnh đo tay trong [qa-checklist.md](../references/qa-checklist.md) thành một lệnh chạy trên file MP4 trước khi giao. Một lần chạy trên video 60 giây mất khoảng 3 giây.

```bash
node $OV/scripts/qc-mp4.mjs <file.mp4> [--project <dir>] [--write-qa] [--json]
```

- `--project` cho phép so khổ hình và thời lượng với `BRIEF.md` của dự án. Thư mục không có `BRIEF.md` thì lệnh thoát với mã 2.
- Phép kiểm nào không áp dụng được (không có `--project`, file không có tiếng, BRIEF thiếu `duration_s`) vẫn in một dòng `PASS <mã> không kiểm (<lý do>)`, để mã nào cũng có mặt trong báo cáo.
- `--write-qa` (cần `--project`) nối kết quả vào `QA.md` dưới một khối `## qc-mp4 <tên file> <thời điểm>`.
- `--json` in mảng kết quả thay cho các dòng chữ.
- Mỗi kết quả in một dòng `LEVEL CODE detail`, dòng cuối là `qc-mp4: PASS|WARN|FAIL (<n> WARN, <m> FAIL)`.
- Mã thoát: 0 không có FAIL (có thể có WARN), 1 có FAIL, 2 sai cú pháp hoặc không đọc được file.

| Mã | Kiểm gì | WARN | FAIL |
|---|---|---|---|
| `NO_VIDEO` | Có stream hình | | Không có stream hình |
| `NO_AUDIO` | Có stream tiếng | Không có tiếng | |
| `ASPECT` | Kích thước so với `aspect` trong BRIEF (16:9 là 1920×1080, 9:16 là 1080×1920, `both` nhận cả hai) | | Lệch, chỉ kiểm khi có `--project` |
| `DURATION` | Thời lượng so với `duration_s` | Lệch quá 10% | |
| `BLACK_EDGE` | Khung đen ở đầu hoặc cuối | Có đoạn đen sát đầu hoặc trong 0,2 giây cuối (nền tối có thể báo nhầm, trích khung ra xem) | |
| `FREEZE` | Đứng hình | Mỗi đoạn đứng hình từ 2 giây | |
| `SILENCE` | Khoảng lặng | Mỗi đoạn lặng từ 1,5 giây | Lặng cả file |
| `LOUDNESS` | Loudness tích hợp | Ngoài khoảng -16 đến -12 LUFS | |
| `TRUE_PEAK` | Đỉnh | Trên -1 dBFS | Trên 0 dBFS |
| `BITRATE` | Bitrate tổng | Trên 12 Mbit/s, tức file chưa nén | |

Khi `BITRATE` báo WARN, xuất bản giao bằng `export.mjs` (mục 10.2), hoặc nén bằng `compress-final.sh` nếu đang ở workspace studio, rồi chạy lại `qc-mp4` trên file mới. `qc-mp4` chỉ đo kỹ thuật, không thay vòng QA ở mục 7 hay phần nghe của người dùng.

### 10.2 `export.mjs`, bản giao theo nơi đăng

`export.mjs` tạo bản giao cho từng nơi đăng từ một bản final, kèm thumbnail lấy từ khung demo người dùng đã duyệt.

```bash
node $OV/scripts/export.mjs --project . --input renders/<tên>.mp4 --target <zalo|youtube|tiktok|facebook>[,<...>] [--thumb-frame <n>] [--no-thumb]
```

- Script chạy `check-preflight --stage final` trước tiên. Cổng chặn thì không xuất gì.
- File ra nằm cạnh file nguồn, tên `<tên>-<target>.mp4` và `<tên>-thumb.jpg`. File đã có thì không ghi đè.
- Mọi target giữ fps, dùng `yuv420p`, `+faststart`, tiếng AAC 48 kHz và chuẩn hoá loudness hai lượt về -14 LUFS, true peak -1 dBFS.
- Xuất xong, mỗi file được kiểm lại: fps giữ nguyên, thời lượng lệch không quá 0,5 giây, kích thước đúng bảng, loudness trong khoảng 1 LU quanh -14. Trượt thì file đó bị xoá.

| Target | Kích thước | Hình | Tiếng |
|---|---|---|---|
| `youtube` | Giữ nguyên | H.264 high, 10 Mbit/s (tối đa 12) | AAC 192 kbit/s |
| `tiktok` | Giữ nguyên | 8 Mbit/s (tối đa 10) | AAC 192 kbit/s |
| `facebook` | Giữ nguyên | 8 Mbit/s (tối đa 10) | AAC 192 kbit/s |
| `zalo` | Cạnh ngắn 720, giữ tỉ lệ | 3 Mbit/s (tối đa 4) | AAC 128 kbit/s |

Thông số `zalo` và `facebook` là giả định, chưa đối chiếu với tài liệu của nền tảng (Zalo không công bố thông số chính thức). Chúng nằm trong hằng `TARGETS` của `scripts/export.mjs`. Nếu bản Zalo bị mờ rõ sau khi gửi thì đổi sang cạnh ngắn 1080 và 5 Mbit/s.

Thumbnail lấy từ các dòng `- demo/....png (<nhãn>)` dưới mục `## Frames` của `DEMO.md`. Video dọc dùng khung nhãn `9:16` (không có thì dùng `main`), video ngang dùng `main`. Mặc định lấy khung đầu tiên, `--thumb-frame <n>` chọn khung thứ n (đếm từ 0). `DEMO.md` phải có lời duyệt, `approval: pending` bị chặn. `--no-thumb` bỏ qua thumbnail.

| Mã thoát | Nghĩa |
|---|---|
| 0 | Xuất xong |
| 1 | ffmpeg lỗi hoặc file ra trượt bước kiểm sau khi xuất |
| 2 | Sai cú pháp, không có file vào, hoặc file ra đã có |
| 5 | Cổng chặn: `check-preflight --stage final` không PASS hoặc demo chưa duyệt |

### 10.3 `render-final --audio-only` và `audio-mix.mjs`, đổi tiếng không render lại

`render-final.mjs` luôn dựng lại tiếng của bản giao bằng `audio-mix.mjs`, một lệnh ffmpeg đọc các thuộc tính audio tĩnh trong composition: mọi `<audio>` và `<video>` không `muted` (bỏ qua `data-volume="0"`), với `data-start`, `data-duration`, `data-volume`, `data-media-start`, `data-playback-rate`. Vì tiếng do ffmpeg dựng từ HTML, có thể đổi tiếng của một bản final cũ mà không render lại hình. Đo trên video 9:16 dài 60 giây: render đầy đủ mất khoảng 108 đến 111 giây, `--audio-only` khoảng 1 giây; loudness của bản mix HyperFrames và bản `audio-mix` lệch 0,1 LU.

Dùng khi chỉ đổi nhạc nền, SFX hay mức âm. Đổi lời đọc, chữ, hình hay thời lượng thì render đầy đủ.

```bash
node $OV/scripts/render-final.mjs --project . --audio-only renders/<cũ>.mp4 -- --output renders/<mới>.mp4
node $OV/scripts/render-final.mjs --project . --audio-only renders/<cũ>-9x16.mp4 -- -c compositions/main-9x16.html --output renders/<mới>-9x16.mp4
```

- Lệnh chạy cùng cổng final như render đầy đủ. Sau `--` chỉ nhận `-c` và `--output`; `--output` bắt buộc và không được trùng file cũ.
- Script chép nguyên luồng hình của file cũ, ghép tiếng mới vào `--output` và ghi sidecar với `mode` là `audio-only`. File tạm nằm cạnh file ra, không nằm trong `/tmp`.
- Tiếng không đổi so với sidecar thì lệnh báo file cũ vẫn đúng, thoát 0 và không ghi file mới.
- File âm thanh mới đặt trong `assets/voice/`, `assets/sfx/` hoặc `assets/bgm/`. Các file khác trong `assets/` được tính vào hình.
- `audio-mix.mjs` chạy riêng được để xem lệnh ffmpeg: `node $OV/scripts/audio-mix.mjs --html index.html --duration <giây> --out mix.wav --base ./ --dry-run`. Đầu ra là WAV 48 kHz stereo. Mã thoát: 0 xong, 1 ffmpeg lỗi, 2 sai cú pháp hoặc thiếu file `src`.

**Sidecar** `<output>.render.json` được ghi sau mỗi lần `render-final` ra một file MP4 (`--format` khác mp4 hay `--batch` thì không có sidecar):

| Trường | Nghĩa |
|---|---|
| `composition` | Composition đã render, ví dụ `index.html` hay `compositions/main-9x16.html` |
| `visual_hash` | Băm phần hình: composition và các cảnh con đã bỏ `<audio>` và `data-volume`, file không phải HTML trong `compositions/`, `assets/` trừ `voice/`, `sfx/`, `bgm/`, và mọi file cục bộ được tham chiếu (`src`, `<link href>`, `url()`, kể cả `../` ra ngoài dự án) |
| `audio_hash` | Băm các track tiếng và nội dung file của chúng |
| `mode` | `full` hoặc `audio-only` |
| `mixer` | `audio-mix`, hoặc `hyperframes` khi giữ bản mix của HyperFrames (tiếng động, hoặc composition không có track tiếng) |
| `source` | File cũ đã lấy hình (chỉ với `audio-only`) |
| `source_sha256` | sha256 của chính file MP4 này. Nén hay sửa file sau khi render thì không còn khớp |
| `created` | Thời điểm ghi |

**Điều kiện chặn.** `--audio-only` chỉ chạy khi file cũ có sidecar, `source_sha256` khớp file, sidecar cùng composition, `visual_hash` không đổi và không có tiếng động. Tiếng động là những thứ chỉ HyperFrames mix được: `data-audio-group`, `data-automation`, `data-fx-chain`, `data-fx-carve`, tween GSAP trên volume hoặc script gán `.volume`, và `<audio>` hay `<video>` có tiếng trong một cảnh con. Gặp tiếng động, render đầy đủ vẫn giữ bản mix của HyperFrames (`mixer` là `hyperframes`).

Cảnh con là các file nhúng qua `data-composition-src` (đệ quy). Composition anh em như `compositions/main-9x16.html` cạnh `index.html` không phải cảnh con. Đường dẫn trong composition tìm theo thư mục của composition trước, không thấy thì tìm từ gốc dự án, giống HyperFrames. Đường dẫn trong tham số lệnh và sau `--audio-only` tính từ thư mục dự án.

| Mã thoát | Nghĩa |
|---|---|
| 0 | Xong, hoặc tiếng không đổi |
| 1 | Mix hay ghép tiếng lỗi. Với render đầy đủ, file ra giữ tiếng của HyperFrames |
| 2 | Sai cú pháp, thiếu ffmpeg hoặc ffprobe, hoặc render đầy đủ không có `--output` mà `renders/` có nhiều file MP4 mới |
| 5 | Cổng final chặn |
| 6 | Không đổi tiếng được: không có sidecar, sidecar không khớp file, khác composition, hình đã đổi, có tiếng động, hoặc thiếu file được tham chiếu |

## 11. Xử lý sự cố

| Triệu chứng | Nguyên nhân | Cách sửa |
|---|---|---|
| `setup-check` báo `skill … not installed` | Thiếu skill HyperFrames | `npx hyperframes skills`, rồi mở phiên agent mới |
| `skill viet-pro … self-test failed` | Bản viet-pro hỏng hoặc lệch phiên bản | Cài lại viet-pro theo [README.md](../README.md) |
| `eleven.mjs` thoát 4 | Cổng viet-pro chặn, hoặc `SCRIPT.md` lệch `script/NN.txt` | Chạy `check-viet-pro.mjs --project .`, sửa các dòng chặn, đồng bộ `SCRIPT.md` với `script/NN.txt` |
| `tts` từ chối `--text` | Lệnh chỉ nhận văn bản đã qua cổng | Ghi lời vào `script/NN.txt` rồi dùng `--text-file` |
| Dự án tiếng Anh mà `tts` vẫn từ chối | Mặc định `--lang vi` không khớp `language:` trong BRIEF | Truyền `--lang` đúng ngôn ngữ |
| `probe-models` thoát 2 khi có `--outdir` | Lệnh luôn ghi vào `$TMPDIR/ov-probe/` để không sinh giọng chưa qua cổng | Bỏ `--outdir` |
| `eleven.mjs music` thoát 3, in `MUSIC_UNAVAILABLE` | Gói ElevenLabs không có nhạc | `hyperframes media-use resolve --type bgm --intent "<mood>" --project .` |
| Mất hết giọng sau `fetch-sfx` | Đã xoá `audio_engine_meta.json` | Chạy lại `eleven.mjs audio-meta … --reuse`, không xoá sidecar |
| `check-viet-pro --stage delivery` chặn vì file giọng | mp3 không có dấu kiểm, có dấu override hoặc lệch `script/NN.txt` | Tạo lại giọng câu đó qua `eleven.mjs tts` sau khi cổng kịch bản đạt |
| Cổng giao chặn vì `viet_pro_override` | Override chỉ dùng tạm khi làm nháp | Xoá dòng override, chạy lại cổng kịch bản, tạo lại giọng qua cổng |
| `check-viet-pro` báo MISMATCH | Bản cuối đổi tên riêng, số hoặc link so với `script-table.v1.md` | Đọc lại câu bị báo, khôi phục dữ kiện hoặc hỏi người dùng |
| `check-preflight --stage plan` chặn | Thiếu mục, mục còn giá trị giữ chỗ, số mốc demo ít hơn số cảnh, thiếu mục 9:16 khi `aspect: both` | Bổ sung `PLAN.md` theo [plan-demo.md](../references/plan-demo.md) |
| `render-final.mjs` thoát 5 | Thiếu plan, demo, hoặc chưa có lời duyệt | Chạy `check-preflight.mjs --stage final` trong thư mục dự án để xem lý do |
| Cổng final chặn dù đã chụp demo | Sửa `PLAN.md` sau khi chụp, khung cũ hơn plan | Chạy lại `make-demo.mjs` và xin duyệt lại |
| `render-final.mjs` thoát 2 | Truyền `--quality` hoặc `-q` | Bỏ cờ đó, lệnh luôn render `delivery` |
| `render-final.mjs` thoát 2, báo `cannot run ffmpeg` | Chưa cài ffmpeg (kèm ffprobe) | Cài ffmpeg, chạy `setup-check.mjs`, rồi render lại |
| `render-final.mjs` thoát 2, báo `new MP4s in renders/` | Không có `--output` mà lần render tạo nhiều MP4 mới | Truyền `--output renders/<tên>.mp4` sau `--` |
| `--audio-only` thoát 6, báo `has no sidecar` hoặc `sha256 differs` | File cũ render trước khi có sidecar, hoặc đã nén hay sửa sau khi render | Render đầy đủ một lần bằng `render-final.mjs`, lần sau mới đổi tiếng riêng được |
| `--audio-only` thoát 6, báo `was rendered from` | Sai composition (thiếu hoặc thừa `-c`) | Truyền đúng `-c` như lần render file cũ |
| `--audio-only` thoát 6, báo `picture changed` | Đã sửa hình, chữ, file trong `compositions/` hay `assets/` ngoài `voice/`, `sfx/`, `bgm/` | Render đầy đủ; file tiếng mới để trong ba thư mục trên |
| `--audio-only` thoát 6, báo `dynamic effects` | Composition có tiếng động (mục 10.3) | Render đầy đủ, HyperFrames giữ bản mix |
| `--audio-only` thoát 6, báo `not found` | Thiếu file mà composition tham chiếu | Khôi phục file hoặc sửa đường dẫn rồi chạy lại |
| `make-demo --from-video` từ chối | Bản nháp cũ hơn composition | Render lại bản nháp rồi cắt khung |
| `find-cases` in `no matching cases` | Từ khoá không khớp | Bỏ `--keyword`, tra lại chỉ theo nhóm |
| `rerank-cases: Jev unavailable (HTTP 401)` | Key Jev sai hoặc hết hạn | Quy trình vẫn chạy với kết quả `find-cases`, báo người dùng về key |
| Chữ tiếng Việt thiếu dấu, lint báo `font_family_without_font_face` | Font preset là subset latin, hoặc chưa có file font | Đổi sang Be Vietnam Pro và copy file `.ttf` vào `assets/fonts/` trước `captions.mjs build` |
| `video-lint` báo `LOWERCASE_TRANSFORM` | Caption skin hoặc CSS ép chữ thường | Sửa thành `text-transform: none`, với caption skin thì sửa trong `.hyperframes/caption-skin.html` |
| `video-lint` báo `SAFE_ZONE_9X16` | Chữ nằm trong vùng UI che | Dời nội dung vào vùng an toàn; dải phụ đề workflow thì chạy lệnh `replace-in-file` ở mục 5.2 |
| `video-lint` báo `HEDGE_LABEL` | Có nhãn rào đón trên hình | Bỏ nhãn khỏi hình, nguồn số liệu ghi trong file dữ liệu |
| Lint báo `missing_timeline_registry` | `window.__timelines` không nằm inline trong file HTML | Đăng ký timeline inline, logic chung để trong `assets/<name>.js` |
| Cảnh báo `duplicate_audio_track` | Nhiều SFX chung một `data-track-index` | Mỗi SFX một track riêng, có `data-duration` |
| `hyperframes check` báo `text_occluded` | Lớp phủ màu toàn khung che nhãn | Đặt lớp tint dưới nhãn, vignette chỉ tối nhẹ ở góc |
| Render offline lỗi GSAP | GSAP nạp từ CDN lúc render | Tải `gsap.min.js` vào `assets/` và trỏ tới bản local |
| `cut.mjs apply-edl` thoát 2 | Nguồn lệch fps, màu, hoặc là HDR 10-bit | Chuẩn hoá nguồn bằng ffmpeg theo bước 1 của [footage-lane.md](../references/footage-lane.md) |
| Whisper không ra tiếng Việt | Dùng model `.en` | Dùng `-m large-v3 -l vi` |
| Bản chép lời bị ghi đè | Redirect stdout của `transcribe --json` vào file | Không redirect, đọc file `transcript.json` do lệnh ghi |
| `judge.mjs` thoát 3 hoặc 4 | `agy` chưa đăng nhập hoặc chưa cài | QA bằng ảnh tĩnh, ghi "không có giám khảo video" vào `QA.md` |
| `qc-mp4` báo `BLACK_EDGE` với video nền tối | Nền tối dưới ngưỡng phát hiện khung đen | Trích khung ra xem, ghi PASS kèm ghi chú nếu chỉ là nền màu |
| `export.mjs` thoát 5 | Cổng final chặn, hoặc `DEMO.md` chưa có lời duyệt | Chạy `check-preflight.mjs --stage final` trong thư mục dự án để xem lý do, sửa rồi chạy lại |
| `export.mjs` thoát 2 vì file ra đã có | Script không ghi đè `<tên>-<target>.mp4` hay `<tên>-thumb.jpg` | Đổi tên hoặc xoá file cũ có chủ đích rồi chạy lại |
| `compress-final.sh` báo file ra đã có | Script không ghi đè | Đổi tên file ra hoặc xoá file cũ có chủ đích |
| `sweep-after-final.sh` dừng, không xoá gì | Nhiều video mà không file nào tên `final` hay `delivery` | Chỉ định file cần giữ bằng `--keep renders/<file>` |
