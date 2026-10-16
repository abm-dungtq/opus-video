# Hướng dẫn chuyên sâu về các tính năng của opus-video

Tài liệu này dành cho người đã cài xong opus-video và muốn hiểu kỹ từng bước: file nào do ai ghi, cổng nào chặn ở đâu, mã thoát nghĩa là gì và gặp lỗi thì sửa thế nào. Phần cài đặt không nhắc lại ở đây, xem [README.md](../README.md) và [hướng dẫn cài cho từng agent](cai-dat-agent.md). Phần giới thiệu ngắn nằm ở [gioi-thieu.md](gioi-thieu.md). Muốn có sẵn câu lệnh để giao việc cho agent, xem [thư viện prompt mẫu](thu-vien-prompt/README.md).

Nguồn sự thật luôn là [skills/](../skills/opus-video/SKILL.md), các file trong `references/` và phần `--help` của từng script. Tài liệu này chỉ giải thích và dẫn đường. Khi hai bên khác nhau, tin vào script.

Quy ước trong tài liệu:

- `$OV` là thư mục gốc plugin opus-video (thư mục chứa `skills/` và `scripts/`) trên agent đang chạy (Claude Code dùng `~/.claude/skills/opus-video`).
- `$VP` là thư mục skill viet-pro. `node $OV/scripts/setup-check.mjs` in đường dẫn thật.
- Mọi lệnh chạy trong thư mục dự án video, trừ khi ghi khác. Mọi script của opus-video đều có `--help`.
- CLI `hyperframes` gọi trực tiếp hoặc qua `npx hyperframes`, hai cách như nhau.

## 1. Mô hình tư duy

### 1.1 Skill điều phối, không tự render

opus-video không có engine dựng hình riêng. Nó nối các skill có sẵn theo một thứ tự cố định: viet-pro viết và rà kịch bản tiếng Việt, ElevenLabs làm giọng đọc, SFX và nhạc nền, HyperFrames (hoặc Remotion, Canvas) dựng và render, Gemini qua `agy` xem video và chấm. Phần riêng của opus-video là các script cổng, script âm thanh, chỉ mục 813 case mẫu và thư viện pattern.

Vì vậy khi một bước hỏng, câu hỏi đầu tiên là bước đó thuộc công cụ nào. Lỗi lint composition thuộc HyperFrames, lỗi văn phong thuộc viet-pro, còn lỗi cổng (exit 4, exit 5) là opus-video đang làm đúng việc của nó.

### 1.2 Cổng là cưỡng chế, không phải lời khuyên

Bốn cổng không được bỏ qua, theo thứ tự:

| Cổng | Script | Chặn cái gì |
|---|---|---|
| Hướng đạo diễn chọn bằng mắt (bước 1b) | `make-pitch.mjs` + `check-preflight.mjs` | Plan và dựng khi BRIEF chưa có `direction:` (người dùng chọn 1 trong 3 styleframe theo chủ đề), trừ dự án footage có `creative_override` |
| Kịch bản viet-pro (bước 2) | `check-viet-pro.mjs` | Tạo giọng và render khi kịch bản chưa qua quy trình viet-pro đầy đủ, hoặc lời đọc vượt `word_budget` (hình dẫn, lời theo) |
| Plan (bước 4b) | `check-preflight.mjs --stage plan` | Tạo giọng và dựng khi chưa có `PLAN.md` đủ mục; với dự án có `direction:`: thiếu `## Ý đồ sáng tạo`, blueprint/rule bịa, beat nối bằng `fade`/`crossfade`, thiếu beat chỉ có nhạc |
| Clip nháp đã duyệt (bước 6b) | `check-preflight.mjs --stage final` | Render bản giao khi chưa có khung hình demo mới hơn plan và lời duyệt; với dự án có `direction:`: thiếu `animatic`, animatic đứng yên kiểu slideshow (qc-mp4 MOTION), thiếu `build/RECIPES.md` |

Hai script khác tự gọi lại cổng nên không thể đi đường vòng. `eleven.mjs tts` và `audio-meta` chạy cổng viet-pro qua `voice-gate.mjs` trước khi gọi API, chặn thì thoát mã 4. `render-final.mjs` chạy `check-preflight --stage final` trước khi render, chặn thì thoát mã 5. Bản giao cuối chỉ có một đường ra là `render-final.mjs`.

Cổng thứ tư nằm ở cuối: `check-viet-pro.mjs --stage delivery` kiểm caption và dấu kiểm của từng file giọng trước khi gửi link video cho người dùng.

### 1.3 Mọi bước để lại bằng chứng

Mỗi quyết định được ghi vào một file trong thư mục dự án: biên bản `## viet_pro` cho biết đã đọc gì và sửa pattern nào, `PLAN.md` cho biết sẽ dựng gì, `DEMO.md` ghi ai duyệt khung hình nào, `QA.md` ghi kết quả từng vòng kiểm. Người khác (hoặc một agent khác) mở thư mục ra là biết dự án đang ở đâu.

## 2. Giải phẫu thư mục dự án

Bố cục chuẩn theo [skills/](../skills/opus-video/SKILL.md). Bảng dưới đây ghi rõ ai tạo từng file và ở bước nào.

| File hoặc thư mục | Ai ghi | Bước | Ghi chú |
|---|---|---|---|
| `BRIEF.md` | agent | 1 | Khung theo [brief-template.md](../references/brief-template.md). Về sau thêm `engine`, `workflow`, `engine_reason`, `case_search`, id case tham khảo và biên bản `## viet_pro` |
| `SOURCES.md` | agent | 2 | Mỗi claim một dòng: claim, nguồn, trạng thái. Bắt buộc với explainer, phản bác ngộ nhận hoặc kịch bản có số liệu |
| `script-table.v1.md` | agent | 2 | Bản nháp đầu, trước lượt Humanizer. Cổng dùng nó để so dữ kiện với bản cuối |
| `script-table.md` | agent | 2 | Bảng 3 cột bản cuối. Không đặt tên `script.md` vì macOS coi `script.md` và `SCRIPT.md` là một file |
| `script/NN.txt` | agent | 2 | Mỗi file một câu đọc. Đây là văn bản duy nhất `eleven.mjs tts` nhận |
| `SCRIPT.md` | agent | 2 | Chỉ khi dùng workflow HyperFrames chuyên biệt. Mỗi frame phải trùng từng chữ với `script/NN.txt` |
| `BRIEF.case-query.json` | agent | 3 | Brief chuẩn hoá bằng tiếng Anh để tra case, trường nào brief không nói thì ghi `"not stated"` |
| `pitch/` | `make-pitch.mjs`, agent viết `index.html` | 1b | 3 project styleframe, `PICK.json`, `1..3.mp4`, `sheet.jpg`, `PITCH.md` (mục 12.1) |
| `sources/`, `SOURCES.md` | `source-ingest.mjs`, `poi-fetch.mjs`, agent | 2 | Văn bản gốc và mục nguồn; `poi-fetch` thêm mục `## POI (OpenStreetMap)` và dòng ghi công trong `assets/CREDITS.md` (mục 12.8, 12.9) |
| `STORYBOARD.md` | agent | 3 | Lưới beat, mỗi beat một hành động, cột SFX |
| `PLAN.md` | agent | 4b | Mẫu ở [plan-demo.md](../references/plan-demo.md) |
| `assets/voice/NN.mp3` | `eleven.mjs` | 5 | Kèm `NN.mp3.words.json` (mốc từng từ) và `NN.mp3.gate.json` (dấu kiểm cổng) |
| `audio_meta.json`, `audio_engine_meta.json` | `eleven.mjs audio-meta` | 5 | Chỉ ở workflow HyperFrames chuyên biệt. Không xoá sidecar `audio_engine_meta.json` |
| `assets/sfx/`, `assets/bgm/` | `eleven.mjs` hoặc `media-use resolve` | 5 | |
| `assets/CREDITS.md` | agent | 5 | Nguồn và license của mọi tài sản |
| `build/RECIPES.md` | `recipe-pack.mjs` | 6 | Công thức HyperFrames mà PLAN khai. Cổng final đòi file này mới hơn `PLAN.md` |
| `index.html`, `compositions/` | HyperFrames, frame worker | 6 | `compositions/main-9x16.html` khi dựng tay cả hai khổ |
| `demo/`, `demo/9x16/` | `make-demo.mjs` | 6b | PNG chụp đúng mốc trong `PLAN.md`; với `--animatic` có thêm `animatic.mp4` và `contact-sheet.jpg` |
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
- `brief_version: 2` đánh dấu dự án mới: phải qua bước 1b trước kịch bản. Người dùng chọn hướng bằng mắt trên 3 styleframe, `make-pitch.mjs choose` ghi `direction`, `word_budget` và các trường liên quan (mục 12.1). Agent không tự điền phong cách, hình chủ đạo, hiệu ứng, chuyển cảnh hay SFX.

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
| 1 | `BLOCKED`: thiếu biên bản hay trường bắt buộc, `files_read` thiếu file, thiếu `script-table.v1.md`, compare báo MISMATCH, lint còn ERROR ở `script-table.md`, `script/*.txt`, lời đọc trong `SCRIPT.md`, hoặc lời đọc vượt `word_budget` (mục 12.2) |
| 2 | Sai cú pháp hoặc không tìm thấy viet-pro (chỉ định bằng `--vp <thư mục>` hoặc biến `VIET_PRO_DIR`) |

Cổng chỉ in WARN, không chặn, khi gặp câu mồi tương tác, lời kể trải nghiệm ngôi thứ nhất cần người dùng xác nhận, hoặc lời đọc dài quá thời lượng. Agent phải đọc từng WARN và sửa hoặc ghi lý do giữ.

`--jev-audit` là tuỳ chọn khi có `TYPESAFE_API_KEY`: Jev rà từng `script/NN.txt` về Humanizer 1 đến 5, câu mồi, trải nghiệm tự bịa và số liệu không nguồn. Lệnh chỉ in WARN và không đổi mã thoát.

Video TikTok, Reels, Shorts vẫn theo viet-pro đầy đủ, với thêm các luật kênh ngắn trong [ov-script](../skills/ov-script/SKILL.md): hook 1 đến 3 giây vào thẳng ý, một video một insight, giọng "mình" và "bạn", không bịa trải nghiệm, tối đa một CTA cụ thể và không dùng câu mồi tương tác.

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

Mã thoát: 0 đạt, 1 bị chặn, 2 sai cú pháp. Cổng phải đạt trước khi tạo giọng và dựng. Dự án có `direction:` còn qua cổng sáng tạo: mục `## Ý đồ sáng tạo`, cột Blueprint/Rule, seam nối từng beat và các beat chỉ có nhạc (mục 12.3). Agent gửi tóm tắt plan cho người dùng; người dùng đổi ý thì sửa `PLAN.md` và chạy lại cổng.

### Bước 5. Âm thanh

Chỉ bắt đầu khi cổng viet-pro và cổng plan đều đã đạt. Thứ tự là giọng trước để có thời lượng thật, rồi chỉnh storyboard cho khớp, sau đó mới tới SFX, nhạc nền và mix. Chi tiết ở mục 6 và [audio-pipeline.md](../references/audio-pipeline.md).

### Bước 6. Dựng

- Chạy `recipe-pack.mjs --project ./` để có `build/RECIPES.md` và đọc hết trước khi viết HTML (mục 12.4). Cảnh mở đầu dựng tiếp từ styleframe ghi ở `styleframe:` trong BRIEF.
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

Ngoài các điều kiện của cổng plan, cổng final đòi `demo/` có đủ PNG thật cho mọi mốc (và `demo/9x16/` khi cần), mọi khung mới hơn `PLAN.md` và `DEMO.md` có lời duyệt thật. Với dự án cũ, composition sửa sau lần chụp demo cuối chỉ là WARN; nếu thay đổi nhìn thấy được thì chụp lại và xin duyệt lại. Dự án có `direction:` chụp bằng `--animatic` để người dùng duyệt chuyển động. Cổng chặn khi `index.html` hay `compositions/*.html` mới hơn animatic (mục 12.5).

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

- Dự án mới dựng từ skeleton: một `index.html`, bản 9:16 và 1:1 sinh bằng `reframe.mjs` (mục 14.5).
- Dự án cũ dựng tay (`general-video`): hai composition trong cùng project, `index.html` 1920×1080 và `compositions/main-9x16.html` 1080×1920.
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

Mức mục tiêu: giọng khoảng -16 LUFS, nhạc nền khi có giọng thấp hơn giọng 4–7 dB (đo bằng `mix-balance.mjs`, mục 14.4), nhạc khi không có giọng khoảng -20 LUFS, SFX khoảng -20 LUFS với đỉnh không quá -3 dBTP, bản master khoảng -14 LUFS integrated và -1 dBTP. Chỉnh bằng `hyperframes normalize-audio` và limiter ở bus master theo skill `hyperframes-audio`, rồi đo lại bằng `qc-mp4.mjs` (mục 10.1). Bảng đầy đủ ở [audio-pipeline.md](../references/audio-pipeline.md). Bản giao không giữ bản mix của HyperFrames mà dựng lại bằng `audio-mix.mjs` (mục 10.3).

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

**Điều kiện chặn.** `--audio-only` chỉ chạy khi file cũ có sidecar, `source_sha256` khớp file, sidecar cùng composition, `visual_hash` không đổi và không có tiếng động. Tiếng động là những thứ chỉ HyperFrames mix được: `data-automation`, `data-fx-chain`, tween GSAP trên volume hoặc script gán `.volume`, và `<audio>` hay `<video>` có tiếng trong một cảnh con. Gặp tiếng động, render đầy đủ vẫn giữ bản mix của HyperFrames (`mixer` là `hyperframes`). Từ v1.2.0, `data-audio-group` và `data-fx-carve` đi đường `audio-mix.mjs` (mục 14.4).

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
| Cổng plan hoặc final báo ``BRIEF.md has no `direction:` `` | BRIEF có `brief_version: 2` nhưng chưa qua bước 1b | Chạy `make-pitch.mjs init`, `render`, gửi pitch cho người dùng, rồi `choose` (mục 12.1). Dự án chỉ cắt footage thì ghi `creative_override` |
| `check-viet-pro` báo `VOICE_OVER_BUDGET` | Lời đọc trong `script/*.txt` nhiều hơn `word_budget` | Cắt lời hoặc chuyển ý sang hình và beat chỉ có nhạc. Đổi nhịp để nới ngân sách chỉ khi người dùng đồng ý (mục 12.2) |
| Cổng plan báo `soft seam "…" is only allowed for directions with allow_soft` | Seam mềm như `focus-pull` dùng với hướng không cho phép | Thay bằng seam liền mạch của hướng, xem [creative-directions.md](../references/creative-directions.md) |
| Cổng final báo `animatic … is older than PLAN.md` | Sửa `PLAN.md` sau khi render animatic | Chạy lại `make-demo.mjs --project ./ --animatic`, gửi lại cho người dùng và ghi lời duyệt mới |
| Cổng final báo `… newer than the animatic …` | Sửa `index.html` hay `compositions/*.html` sau khi người dùng duyệt animatic | Như dòng trên: render lại animatic và xin duyệt lại (mục 12.5) |
| `qc-mp4` in `FAIL MOTION`, cổng final báo animatic `trông như slideshow`, hoặc `make-pitch render` thoát 4 | Video gần như đứng yên kiểu slideshow | Dựng lại các beat theo `build/RECIPES.md` (styleframe thì theo `RECIPES.md` của nó), không nới ngưỡng (mục 12.6) |
| Cổng báo `creative_override needs a reason of at least 10 characters` | Lý do override quá ngắn | Ghi lý do rõ, ít nhất 10 ký tự, hoặc bỏ override và qua bước 1b |
| Dự án cần dựng hình mới mà cổng in `creative gate skipped: creative_override` | BRIEF còn dòng `creative_override` | Xoá dòng đó và qua bước 1b; `make-pitch.mjs choose` tự xoá override |
| Cổng final báo `build/RECIPES.md is older than PLAN.md` | Sửa PLAN sau khi gom công thức | Chạy lại `recipe-pack.mjs --project ./`, đọc lại công thức mới |
| `poi-fetch --address` thoát 1, báo `network error: fetch failed` | DNS của máy không phân giải `openstreetmap.org` | Chạy bằng `--lat` và `--lon` (mục 12.8) |
| `source-ingest` thoát 2, báo `pdftotext not found` | Máy chưa có poppler | Cài poppler rồi chạy lại |
| Cổng plan báo `PLAN.md has no "## Sự kiện" table` hoặc `"## Sự kiện" không có hàng sự kiện nào` | Dự án có `direction:` mà `PLAN.md` chưa có bảng sự kiện, hoặc mục để trống, chỉ có `TODO` hay chỉ có tiêu đề bảng | Thêm bảng `Thời điểm \| Sự kiện \| Âm thanh`, hoặc một dòng `không có SFX gắn sự kiện` khi video không có tiếng gắn với hình (mục 13.1) |
| `sfx-sync` hay cổng final in `SYNC FAIL` | Tiếng SFX vang lệch khỏi sự kiện quá ngưỡng, thường do file có đoạn im lặng ở đầu | Chạy `sfx-sync.mjs --project ./ --fix`, sửa `data-start` theo đề xuất rồi chạy lại (mục 13.1) |
| `sfx-sync` báo `"<file>" không có trong index.html` | Ô Âm thanh không khớp `src` trong HTML, SFX có `data-volume="0"`, hoặc SFX nằm trong composition con | Ghi đúng `src` như trong `index.html`; SFX trong composition con thì chuyển thẻ `<audio>` ra `index.html` với `data-start` theo timeline gốc (đo trong composition con là việc để sau) (mục 13.1) |
| `check-preflight` in WARN `… cần giữ ≥ <n>s` | Chữ trên hình rời đi trước khi đọc kịp | Chữ thật sự ở lại thì ghi `(giữ đến <t>s)` hoặc `(giữ đến hết)` trong ô Hình; chữ thật sự rời sớm thì kéo dài beat hoặc rút chữ (mục 13.2) |

## 12. Hướng sáng tạo, brand kit và dữ liệu thật

Chương này gom các công cụ của bước 1b và các cổng chống slideshow. Lý do có chúng nằm ở [skills/](../skills/opus-video/SKILL.md): khi agent tự điền phong cách, nó chọn kiểu an toàn nhất là nền tối và thẻ chữ trượt lên rồi mờ dần, mỗi câu một thẻ. Vì vậy người dùng chọn hướng bằng mắt trên 3 styleframe dựng từ chính chủ đề của họ, kịch bản viết sau khi đã có hướng. Máy chặn kiểu slideshow ở PLAN, ở clip nháp và ở bản render.

Các cổng này chỉ bật khi `BRIEF.md` có `direction:` hoặc `brief_version: 2`. Dự án cũ không có hai dòng đó chỉ nhận một dòng WARN `creative gate skipped: BRIEF.md has no direction: and no brief_version: 2 (dự án cũ)` và đi theo cổng cũ.

### 12.1 Chọn hướng bằng `directions.mjs` và `make-pitch.mjs`

**Dùng khi nào.** Mọi dự án mới (`brief_version: 2`), ngay sau brief tối thiểu ở bước 1 và trước kịch bản. Danh mục 8 hướng, 2 núm (nhịp, tông màu) và 5 nhóm từ khoá đổi được nằm ở [creative-directions.md](../references/creative-directions.md). File đó sinh từ `data/directions.json` bằng `directions.mjs doc --write`, không sửa tay.

`directions.mjs` là công cụ tra cứu, agent ít khi gọi trực tiếp vì `make-pitch.mjs` đã dùng nó bên trong:

```bash
node $OV/scripts/directions.mjs check                       # mọi token là blueprint, rule, preset, style, seam có thật trong HyperFrames
node $OV/scripts/directions.mjs pick --category bat-dong-san --aspect 9:16 --topic "<chủ đề>"
node $OV/scripts/directions.mjs show A8
node $OV/scripts/directions.mjs compat --direction A8 --energy don-dap
```

Mã thoát của `directions.mjs`: 0 xong, 1 `check` thấy token không có thật, 2 sai cú pháp, 3 `compat` có cảnh báo phối. `setup-check.mjs` cũng chạy `check`.

`make-pitch.mjs` đi theo bốn bước:

```bash
node $OV/scripts/make-pitch.mjs init --project ./ --topic "<chủ đề>" --aspect 9:16 --category <nhóm> --energy vua
# agent viết pitch/<n>-<slug>/index.html cho cả 3 hướng, theo STYLEFRAME.md và RECIPES.md cùng thư mục
node $OV/scripts/make-pitch.mjs render --project ./
# gửi pitch/PITCH.md, pitch/sheet.jpg và 3 clip cho người dùng, dừng chờ trả lời
node $OV/scripts/make-pitch.mjs choose --project ./ --pick 2 --transition lao-xuyen-tam --energy em
```

- `init` chọn tất định 3 hướng tương phản: một hướng khớp chủ đề nhất, một hướng liền mạch không cắt, một hướng táo bạo. Mỗi hướng có một project HyperFrames trống trong `pitch/`, kèm `STYLEFRAME.md` (dựng gì trong khoảng 3 giây) và `RECIPES.md`. Không truyền `--duration` thì script lấy `duration_s` trong BRIEF, không có thì 15 giây.
- `render` render 3 clip nháp, cắt một khung cho mỗi clip, ghép `sheet.jpg`, đo chuyển động và ghi `PITCH.md` gồm menu số, hai núm và 3 đến 4 từ khoá đổi được cho mỗi nhóm.
- Người dùng trả lời bằng một số (`2`), số kèm điều chỉnh (`2, chuyển cảnh: lao-xuyen-tam, nhịp: em`) hoặc `tự chọn`. Từ trong câu trả lời ứng với cờ của `choose`: `phong cách` là `--style`, `hình` là `--visual`, `hiệu ứng` là `--effect`, `chuyển cảnh` là `--transition`, `âm thanh` là `--sfx`, `nhịp` là `--energy`, `màu` là `--palette`.
- `choose` ghi vào frontmatter `BRIEF.md` các trường `direction`, `direction_swaps`, `energy`, `palette`, `word_budget`, `music_only_s`, `creative_selection`, `styleframe` cùng mục `## creative_direction`. Lệnh cũng xoá dòng `creative_override` nếu có. Agent không gõ tay các trường này.
- `choose --auto` lấy phương án 1 và ghi `creative_selection: auto`. Chỉ dùng khi người dùng đã nói rõ là chạy không dừng.

Styleframe được chọn là cảnh mở đầu của video thật, dựng tiếp ở bước 6. SKILL.md khuyên viết 3 styleframe bằng 3 agent song song khi runtime cho phép; viết tuần tự thì tính khoảng 15 phút.

| Mã thoát | Nghĩa |
|---|---|
| 0 | Xong |
| 1 | `init` hay `render` lỗi, thiếu ffmpeg hoặc ffprobe, hoặc thiếu skill HyperFrames |
| 2 | Sai cú pháp, chưa chạy `init`, styleframe chưa viết, từ khoá không có trong danh mục, brand lỗi |
| 3 | `choose` thấy phối không hợp: hỏi người dùng một lần, họ vẫn giữ thì chạy lại với `--accept-warnings` |
| 4 | `render` thấy một styleframe gần như đứng yên. `PITCH.md` vẫn được ghi, nhưng chưa gửi cho người dùng |

Lỗi thường gặp:

- `pitch/PICK.json not found; run make-pitch.mjs init first`: chạy `init` trước `render` hay `choose`.
- `<thư mục>/index.html is still the blank hyperframes scaffold (styleframe chưa viết)`: agent chưa viết styleframe đó. Viết theo `STYLEFRAME.md` rồi render lại.
- `ffmpeg … not found; install ffmpeg`: cài ffmpeg (kèm ffprobe), chạy `setup-check.mjs`, rồi render lại.
- `FAIL  styleframe 2 gần như đứng yên (MOTION)` (thoát 4): dựng lại styleframe đó theo `RECIPES.md`, chuyển động phải liên tục suốt clip.
- `không có từ khoá "<mã>" trong nhóm …` (thoát 2): mã gõ sai. Lấy đúng mã trong `PITCH.md`.
- `WARN  hướng A8 "…" vốn ở nhịp Êm/Vừa, chọn nhịp Dồn dập có thể làm mất chất của hướng` (thoát 3): báo người dùng một lần, không tự đổi lựa chọn của họ.

### 12.2 `word_budget`, ngân sách lời đọc

**Dùng khi nào.** Từ bước 2 trở đi, với mọi dự án có `direction:`. Nguyên tắc là hình dẫn, lời theo: lời đọc ít đi để hình có chỗ kể.

`choose` tính `word_budget` và `music_only_s` từ nhịp đã chọn và `duration_s` trong BRIEF. Số từ cho mỗi 15 giây và số giây chỉ có nhạc của từng nhịp nằm ở mục `energy` của `data/directions.json`; với 15 giây, ngân sách từ 22 đến 30 từ tuỳ nhịp. Muốn đổi ngân sách thì chạy lại `choose` với nhịp khác hoặc sau khi sửa `duration_s`. Chỉ làm vậy khi người dùng đồng ý, vì nhịp đổi thì chất của hướng cũng đổi.

```bash
node $OV/scripts/check-viet-pro.mjs --project ./
```

Cổng viet-pro đếm từ trong mọi `script/*.txt`. Vượt ngân sách là FAIL, cổng thoát 1 với dòng:

```text
FAIL  VOICE_OVER_BUDGET: voice has <n> words, BRIEF word_budget is <m> (hình dẫn, lời theo: cắt lời hoặc chuyển ý sang hình/beat không lời)
```

BRIEF thiếu `word_budget` mà có `direction:` thì cổng tự tính từ nhịp và thời lượng. Dự án `creative_override` hoặc `voice_source: clip` không bị tính ngân sách tự động. Cảnh báo cũ về lời đọc quá khoảng 3 từ mỗi giây vẫn còn, nhưng chỉ là WARN.

Cách sửa: cắt câu, gộp ý, hoặc chuyển một ý sang hình và beat chỉ có nhạc. Không nâng `word_budget` bằng tay để lọt cổng.

### 12.3 PLAN sáng tạo và các luật chặn

**Dùng khi nào.** Bước 4b, với dự án có `direction:`. Mẫu `PLAN.md` ở [plan-demo.md](../references/plan-demo.md) có thêm mục `## Ý đồ sáng tạo` và bảng `## Cảnh` 7 cột.

```bash
node $OV/scripts/check-preflight.mjs --project ./ --stage plan
```

Mã thoát: 0 đạt, 1 bị chặn, 2 sai cú pháp. Ngoài các luật của cổng plan cũ (bước 4b), cổng sáng tạo chặn khi:

- BRIEF có `brief_version: 2` mà chưa có `direction:`. Dòng FAIL bắt đầu bằng ``BRIEF.md has no `direction:` `` và nhắc chạy bước 1b.
- `direction:` không có trong `data/directions.json`.
- `## Ý đồ sáng tạo` thiếu, hoặc thiếu một trong ba dòng `Hướng:`, `Chuyển cảnh:`, `Luật chống slideshow:`.
- Bảng `## Cảnh` thiếu cột `Blueprint/Rule` hoặc cột `Nối sang beat sau`.
- Một hàng không nêu blueprint hay rule nào, nêu tên không có trong `hyperframes-animation` (`… is not a blueprint or rule in hyperframes-animation`), hoặc cả bảng có ít hơn 2 token khác nhau.
- Một hàng (trừ hàng cuối) nối sang beat sau bằng `fade`, `crossfade`, `cut`, "mờ dần", "hiện dần" hay các từ cấm khác (`… is a slide swap (banned)`), không nêu seam nào trong từ vựng (`no known seam in …`), hoặc dùng seam mềm khi hướng không cho phép.
- Tổng thời lượng các hàng chỉ có nhạc ít hơn `music_only_s`. Hàng chỉ có nhạc là hàng có ô Lời đọc để trống, ghi `(nhạc)`, `không lời` hoặc một dấu gạch dài.

Seam mềm (`focus-pull`, `blur-crossfade`, `cross-warp-morph`…) chỉ dùng được với hướng có `allow_soft`; danh sách hướng và seam ở [creative-directions.md](../references/creative-directions.md). Dùng sai thì cổng in:

```text
FAIL  PLAN.md "## Cảnh" row 2: soft seam "focus-pull" is only allowed for directions with allow_soft (A2 has none)
```

Cách sửa: thay bằng một seam liền mạch của hướng. Dòng FAIL `no known seam` liệt kê sẵn các seam của hướng đang dùng.

**`creative_override`.** Dự án chỉ cắt gọn footage, không dựng hình mới, ghi `creative_override: <lý do ít nhất 10 ký tự>` vào frontmatter `BRIEF.md` thay cho bước 1b. Cổng in WARN `creative gate skipped: creative_override "<lý do>"` rồi bỏ qua mọi luật sáng tạo. Lý do ngắn hơn 10 ký tự thì cổng chặn với dòng `BRIEF.md creative_override needs a reason of at least 10 characters`. Khi có override, `qc-mp4` chỉ báo MOTION ở mức WARN và demo không bắt buộc animatic. Clip làm trục kèm nền dựng mới vẫn nên qua bước 1b; hướng A8 hợp với bản đồ và PiP. Chạy `make-pitch.mjs choose` sẽ xoá dòng override.

### 12.4 `recipe-pack.mjs`, gom công thức trước khi dựng

**Dùng khi nào.** Bước 6, sau khi cổng plan đạt và trước khi viết HTML, kể cả khi dựng tay `general-video`. `make-pitch init` cũng tự gọi nó để ghi `RECIPES.md` cho từng styleframe.

```bash
node $OV/scripts/recipe-pack.mjs --project ./
node $OV/scripts/recipe-pack.mjs --direction A8 --transition lao-xuyen-tam --out <file.md>
```

Lệnh đầu đọc blueprint, rule và seam mà `PLAN.md` khai, cộng các token của hướng trong BRIEF, rồi ghi nguyên văn file công thức của HyperFrames vào `build/RECIPES.md`. Agent đọc hết file này trước khi viết HTML; với frame worker thì chép vào prompt.

Mã thoát: 0 đã ghi, 1 không có token nào hoặc thiếu skill HyperFrames, 2 sai cú pháp hoặc mã hướng không có.

Lỗi thường gặp:

- `recipe-pack: no blueprint/rule/seam found`: PLAN chưa có cột Blueprint/Rule và BRIEF chưa có `direction:`.
- Ở cổng final: `build/RECIPES.md not found` hoặc `build/RECIPES.md is older than PLAN.md; re-run recipe-pack.mjs`. Sửa PLAN thì chạy lại `recipe-pack.mjs`.

### 12.5 Duyệt bằng animatic

**Dùng khi nào.** Bước 6b, với dự án có `direction:`. Ảnh tĩnh không cho thấy kiểu thẻ trượt lên rồi mờ dần, nên người dùng duyệt clip nháp có chuyển động.

```bash
node $OV/scripts/make-demo.mjs --project ./ --animatic
node $OV/scripts/qc-mp4.mjs demo/animatic.mp4 --project ./ --draft
```

`--animatic` render toàn bộ composition ở `--quality draft`, thu cạnh ngắn về 540 px, giữ lại thành `demo/animatic.mp4`, cắt các khung theo mốc trong `PLAN.md`, ghép `contact-sheet.jpg` và ghi `animatic:` cùng `approval: pending` vào `DEMO.md`. Dùng được cùng `--composition` và `--hyperframes`. Không dùng chung với `--from-video` (thoát 2). Mã thoát giống mục 6b: 0 đã chụp, 1 chụp lỗi, 2 sai cú pháp hoặc `PLAN.md` thiếu mốc.

Agent tự xem từng khung, chạy `qc-mp4` trên animatic (MOTION không được FAIL), gửi clip nháp và contact sheet cho người dùng rồi dừng chờ. Người dùng đồng ý thì ghi lời duyệt vào `DEMO.md` như bước 6b.

Cổng final (`check-preflight.mjs --project ./ --stage final`, cũng là cổng của `render-final.mjs`) chặn khi:

- `DEMO.md` không có dòng `animatic:`, hoặc file đó không còn. Dự án `aspect: both` cần thêm dòng `animatic_9x16:`, tạo bằng `reframe.mjs ./ --ratio 9x16` rồi `make-demo.mjs --project ./ --animatic --aspect 9x16 --hyperframes ../<project>-9x16` (dự án cũ có `compositions/main-9x16.html` thì thay `--hyperframes …` bằng `--composition compositions/main-9x16.html`). Thiếu cả hai cờ đó thì HyperFrames render `index.html` khổ ngang. Cả hai animatic đều qua các luật bên dưới.
- `animatic_9x16` có khung ngang (rộng không nhỏ hơn cao): `animatic demo/9x16/animatic.mp4 is 960×540, not portrait; re-run reframe.mjs …`. Render lại từ bản 9:16.
- Animatic cũ hơn `PLAN.md`: `animatic demo/animatic.mp4 is older than PLAN.md; re-run make-demo.mjs --animatic`.
- `index.html` hoặc một file `compositions/*.html` được sửa sau khi render animatic: `<file> newer than the animatic demo/animatic.mp4; the user approved older motion, re-run make-demo.mjs --animatic`. Với dự án cũ, sửa composition sau demo chỉ là WARN; với dự án có `direction:` thì chặn, vì người dùng đã duyệt một chuyển động khác.
- Animatic bị MOTION chấm FAIL (mục 12.6): `animatic demo/animatic.mp4: <số đo> … trông như slideshow …`.

Cách sửa chung: sửa xong thì chạy lại `make-demo.mjs --animatic`. Lệnh này đưa `approval` về `pending`, nên phải gửi lại clip cho người dùng và ghi lời duyệt mới.

### 12.6 MOTION trong `qc-mp4` và `SLIDESHOW_MOTION` trong `video-lint`

**MOTION** là một dòng trong kết quả `qc-mp4.mjs`. Nó đo mức thay đổi giữa các khung liên tiếp và in hai con số: tỉ lệ khung gần như đứng yên và đỉnh chuyển động (phân vị 90). Slideshow vừa đứng yên nhiều vừa không bao giờ chuyển động mạnh. Với dự án có `direction:` và không có `creative_override`, mặc định FAIL khi tỉ lệ đứng yên từ 60% trở lên và đỉnh dưới 1,5; nhịp `em` có ngưỡng riêng. Dự án khác chỉ nhận WARN ở cùng mức đó. Ngưỡng đầy đủ và số hiệu chỉnh ở `--help` của `qc-mp4.mjs` (hằng `LIMITS`).

```bash
node $OV/scripts/qc-mp4.mjs renders/<tên>.mp4 --project ./ --write-qa
```

Cần `--project` để script đọc `direction`, `energy` và `creative_override` trong BRIEF. Dòng FAIL có dạng:

```text
FAIL MOTION <n>% khung gần như đứng yên (<khung đứng>/<tổng khung>), đỉnh chuyển động <x>; ngưỡng … trông như slideshow, dựng lại beat có chuyển động liền mạch (build/RECIPES.md)
```

Có FAIL thì `qc-mp4` thoát 1. Cùng phép đo này chạy ở ba chỗ: `make-pitch render` trên styleframe (thoát 4), cổng final trên animatic, `qc-mp4` trên bản render. Cách sửa luôn là dựng lại các beat theo `build/RECIPES.md` cho chuyển động liền mạch, không nới ngưỡng.

**`SLIDESHOW_MOTION`** là WARN sớm của `video-lint.mjs`, chạy trên code chứ chưa cần render: timeline có từ 12 thuộc tính được animate trở lên mà dưới 15% vượt ra ngoài `opacity` và `translate`, đồng thời không dùng HyperShader, THREE hay WebGL. Luật này không chặn và không đổi mã thoát, vì đọc code tĩnh dễ đánh lừa. Thấy WARN này thì xem lại beat trước khi tốn thời gian render; phần chặn thật là MOTION.

### 12.7 Brand kit

**Dùng khi nào.** Làm nhiều video cho cùng một thương hiệu và muốn màu, font, logo, giọng đọc giống nhau từ styleframe đầu tiên.

Chép [brand.example.json](../references/brand.example.json) thành `shared-assets/brand.json` của workspace (hoặc `<dự án>/brand.json`) rồi sửa. File có `name`, `logo`, `watermark`, `fonts.heading`, `fonts.body`, `palette` (`bg`, `fg`, `accent`, `accent2` tuỳ chọn), `voice_id`, `tts_model` và `banned_directions`. Đường dẫn tính từ thư mục chứa `brand.json`.

```bash
node $OV/scripts/brand.mjs check --project ./
```

Script tìm theo thứ tự: `--file`, rồi `<dự án>/brand.json`, rồi `<dự án>/../shared-assets/brand.json`. Không có brand thì in gợi ý và thoát 0, vì brand kit là tuỳ chọn.

| Mã thoát | Nghĩa |
|---|---|
| 0 | Hợp lệ, hoặc không có brand |
| 1 | Có ERROR: màu không đúng dạng `#rrggbb`, hoặc `banned_directions` có mã hướng không tồn tại |
| 2 | Sai cú pháp, JSON hỏng, hoặc `--file` trỏ tới file không có |

File logo, watermark hay font không tìm thấy chỉ là WARN (`logo: file not found: …`); font heading không phải `.ttf`, `.otf` hay `.woff2` cũng là WARN.

`make-pitch` tự đọc brand. `init` bỏ các hướng trong `banned_directions` khỏi danh sách chọn và ghi màu, logo, font vào `STYLEFRAME.md`. `choose` mặc định tông màu `thuong-hieu`, ghi `brand:` vào BRIEF, rồi điền `voice_id`, `tts_model` của brand khi BRIEF chưa có hoặc đang để giá trị mặc định của mẫu. Brand có ERROR thì `init` thoát 2. `--palette thuong-hieu` mà không có brand thì `choose` thoát 2.

### 12.8 `poi-fetch.mjs`, tiện ích thật quanh địa chỉ

**Dùng khi nào.** Video bất động sản hoặc địa điểm (hướng A8, thẻ 9 trong [pattern-library.md](../references/pattern-library.md)) cần trường, chợ, siêu thị, trạm xe, bệnh viện, công viên, trung tâm thương mại quanh dự án, kèm khoảng cách và phút đi bộ có thật.

```bash
node $OV/scripts/poi-fetch.mjs --project ./ --address "<địa chỉ dự án>"
node $OV/scripts/poi-fetch.mjs --project ./ --lat <vĩ độ> --lon <kinh độ> --radius 1000 --route
```

- Dữ liệu lấy từ OpenStreetMap: Nominatim để đổi địa chỉ ra toạ độ, Overpass để tìm tiện ích. `--route` hỏi thêm bộ định tuyến đi bộ OSRM của FOSSGIS để có phút đi bộ theo đường thật; dịch vụ này lỗi thì script in WARN và dùng ước tính.
- Mặc định bán kính 1500 m, tối đa 5000 m. `--kinds` chọn loại trong `school,market,supermarket,transit,hospital,park,mall`.
- Một số tiện ích có nhãn riêng trong bảng: trạm xe buýt (`transit`), phòng khám (`hospital`) và cửa hàng tiện lợi (`supermarket`). Mỗi nhãn giữ tối đa 3 nơi gần nhất, nên Circle K hay GS25 sát nhà không đẩy siêu thị thật ra khỏi bảng.
- Script ghi `sources/poi.json` (cache), mục `## POI (OpenStreetMap)` trong `SOURCES.md` và dòng ghi công ODbL trong `assets/CREDITS.md`. Chạy lại với cùng tâm, bán kính, `--kinds` và `--route` thì dùng cache, không gọi mạng; `--refresh` để lấy lại.
- Bảng trong `SOURCES.md` có cả khoảng cách đường thẳng lẫn phút đi bộ kèm quãng đường đi, cùng cột cách tính (ước tính hay OSRM). Số trên hình lấy từ bảng này, PLAN ghi đúng cách tính. Không ghi nguồn lên hình.
- OSRM nắn điểm ra con đường gần nhất rồi mới tính, nên một nơi rất gần vẫn có thể ra vài phút đi bộ. Nơi cách dưới khoảng 50 m thì viết "ngay cạnh" thay cho số phút.
- Với `--address`, script in dòng `poi-fetch: geocode "<địa chỉ>" → <tên nơi tìm được> (<vĩ độ>, <kinh độ>)`. Tên đó không phải dự án thì chạy lại bằng `--lat` và `--lon`.

| Mã thoát | Nghĩa |
|---|---|
| 0 | Xong |
| 1 | Lỗi mạng hoặc dịch vụ (in mã HTTP, mã lỗi mạng, hoặc dòng `remark` khi Overpass hết giờ hay hết bộ nhớ). Không ghi cache, `SOURCES.md` hay `CREDITS.md` |
| 2 | Sai cú pháp: thiếu `--project`, có cả `--address` lẫn `--lat`/`--lon`, bán kính hay loại không hợp lệ |
| 4 | Không tìm thấy địa chỉ: `poi-fetch: không tìm thấy địa chỉ "<địa chỉ>"` |

**`--address` cần DNS phân giải được `openstreetmap.org`.** Một số resolver (ví dụ DNS của Tailscale trên máy đã thử) không trả kết quả cho tên miền này, khi đó lệnh thoát 1 với dòng `poi-fetch: network error: fetch failed`, có thể kèm mã như `(ENOTFOUND)`. `--lat`/`--lon` vẫn chạy được, vì Overpass và OSRM nằm ở tên miền khác. Lấy toạ độ từ bản đồ rồi chạy bằng `--lat`/`--lon`, hoặc đổi DNS của máy nếu người dùng quyết.

### 12.9 `source-ingest.mjs`, lấy văn bản gốc để kiểm số liệu

**Dùng khi nào.** Bước 2, khi kịch bản dựa trên bài báo, trang web, PDF hay trang abstract arXiv, nhất là tin nóng và explainer có số liệu. Chạy trước khi soạn, để lượt kiểm chứng của viet-pro có câu gốc mà đối chiếu.

```bash
node $OV/scripts/source-ingest.mjs --project ./ <url> [<url-khác>] [bao-cao.pdf] [arxiv:<id>]
```

- Mỗi nguồn thành một file `sources/<slug>.txt` và một mục `## <tiêu đề>` trong `SOURCES.md` gồm URL hoặc file, ngày đăng (để trống khi không rõ), ngày truy cập, đường dẫn văn bản và các "Câu ứng viên" có chữ số hoặc dấu trích dẫn.
- Script không tóm tắt. Câu ứng viên chỉ là chỗ cần đọc lại; agent đọc `sources/<slug>.txt` và tự viết ý chính có trích câu gốc. Mọi số liệu trong kịch bản phải trỏ về một mục trong `SOURCES.md`.
- Chạy lại cùng URL hay file thì mục cũ được thay, không thêm mục mới. `--max-candidates` đổi số câu ứng viên (mặc định 8).
- PDF đọc bằng `pdftotext` của poppler. URL trả về PDF cũng được xử lý như file PDF.
- `arxiv:<id>` chỉ lấy trang abstract (`https://arxiv.org/abs/<id>`): tiêu đề, tác giả, tóm tắt, không có thân bài. Cần số liệu trong bảng hay trong bài thì truyền thêm URL PDF `https://arxiv.org/pdf/<id>`.

| Mã thoát | Nghĩa |
|---|---|
| 0 | Mọi nguồn đã lấy xong |
| 1 | Có nguồn lỗi; các nguồn khác vẫn được ghi |
| 2 | Sai cú pháp, hoặc gặp PDF mà máy chưa có `pdftotext` |

Lỗi thường gặp:

- `source-ingest: <nguồn>: HTTP 403` hoặc `fetch failed: …`: trang chặn truy cập tự động hay cần đăng nhập. Lưu bài thành PDF rồi chạy lại với file PDF.
- `no text extracted`: trang không có văn bản đọc được. Thử bản PDF hoặc một nguồn khác cho cùng dữ kiện.
- `pdftotext not found`: cài poppler (`brew install poppler` trên macOS) rồi chạy lại. Các nguồn lấy được trước đó vẫn có mục trong `SOURCES.md`.
- `not a URL, .pdf file or arxiv:<id>`: tham số không phải URL đầy đủ, file `.pdf` hay `arxiv:<id>`.

## 13. Khớp tiếng, giữ chữ và vòng sửa

Chương này nói về ba kiểm tra thêm vào ngày 2026-10-14. Mỗi kiểm tra bắt một lỗi mà các cổng trước không thấy: tiếng SFX vang lệch khỏi khoảnh khắc trên hình, chữ biến mất trước khi người xem đọc kịp, mỗi lần sửa phải render lại cả video mà không có ghi chép đã sửa gì.

Dự án cũ (BRIEF không có `direction:` và không có `brief_version: 2`) không bị chặn thêm: mọi dòng FAIL của `sfx-sync` đổi thành WARN. Kiểm tra giữ chữ và kiểm tra `REVISIONS.md` chỉ in WARN với mọi dự án.

### 13.1 Khớp SFX với sự kiện trên hình

**Dùng khi nào.** Bước 4b khi viết `PLAN.md`, rồi bước 6 sau khi đặt SFX vào `index.html`. Nhiều file SFX có một đoạn im lặng ở đầu, nên `data-start` đặt đúng lúc nút được nhấn vẫn cho tiếng click vang trễ.

`PLAN.md` của dự án có `direction:` cần mục `## Sự kiện`, mỗi khoảnh khắc trên hình có gắn tiếng là một dòng:

```markdown
## Sự kiện
| Thời điểm | Sự kiện | Âm thanh |
|---|---|---|
| 2.12s | Nút gửi lún xuống | assets/sfx/send.mp3 |
| 11.75s | Thẻ kết quả bung ra | assets/sfx/impact.mp3 |
```

`Thời điểm` là số giây trên timeline gốc, `Âm thanh` ghi đúng `src` trong `index.html`. Video không có tiếng gắn với hình thì thay bảng bằng một dòng `không có SFX gắn sự kiện`; dòng này chỉ cho ra WARN. Dòng đó chỉ có nghĩa khi bảng không có hàng: bảng có hàng thì các hàng vẫn được đo. Mục để trống, chỉ có `TODO` hay chỉ có tiêu đề bảng bị coi là chưa viết và bị chặn như khi thiếu mục.

```bash
node $OV/scripts/sfx-sync.mjs --project ./ --fix
node $OV/scripts/sfx-sync.mjs --project ./ --write-qa
```

Script đo đoạn im lặng đầu mỗi file SFX bằng ffmpeg. Ngưỡng im lặng lấy theo đỉnh của chính file trừ 20 dB, nên file nhỏ tiếng không bị coi là im lặng cả file. Kết quả đo được lưu theo sha256 ở `assets/sfx-onsets.json`, lần chạy sau không gọi ffmpeg lại. Lúc tiếng thật sự vang bằng `data-start` cộng đoạn im lặng (trừ `data-media-start`, chia `data-playback-rate`). Mỗi sự kiện in một dòng:

```text
PASS  SYNC   2.12s Nút gửi lún xuống ← assets/sfx/send.mp3 lệch +0 ms (đầu file im 0 ms)
```

Số lệch dương là tiếng trễ hơn hình. Ngưỡng theo ITU-R BT.1359-1: tiếng sớm tới 45 ms hoặc trễ tới 125 ms là PASS, sớm tới 90 ms hoặc trễ tới 185 ms là WARN, xa hơn là FAIL. `--fix` in thêm dòng `đề xuất: data-start="…"` cho từng dòng chưa PASS và không sửa HTML. `--write-qa` ghi các dòng vào `QA.md`, `--json` in mảng kết quả.

Cổng final của `check-preflight.mjs` (cũng là cổng của `render-final.mjs`) chạy cùng phép đo này với dự án có `direction:`: dòng FAIL chặn, dòng WARN chỉ cảnh báo. Ở cổng plan, thiếu mục `## Sự kiện` thì chặn; ở cổng final, thiếu mục này chỉ WARN, để dự án đã giao vẫn render lại được.

| Mã thoát | Nghĩa |
|---|---|
| 0 | Không có dòng FAIL |
| 1 | Có ít nhất một dòng FAIL |
| 2 | Sai cú pháp, hoặc thiếu `PLAN.md` hay file HTML |

Lỗi thường gặp:

- `SYNC FAIL … lệch +270 ms (đầu file im 120 ms)`: file có đoạn im lặng ở đầu. Sửa `data-start` theo dòng `đề xuất` rồi chạy lại.
- `"assets/sfx/x.mp3" không có trong index.html (hoặc data-volume="0"; SFX trong composition con chưa được kiểm)`: ô Âm thanh không khớp `src`, SFX bị tắt tiếng, hoặc SFX nằm trong composition con. Script chỉ đọc `index.html` (hay file truyền bằng `--html`), vì `data-start` trong composition con tính theo đồng hồ của composition đó. Lối ra hiện nay là đặt thẻ `<audio>` của SFX trong `index.html`; cổng final không có cách bỏ qua dòng FAIL này.
- `thời điểm "…" không đọc được`: ô Thời điểm phải là số giây, ví dụ `6.5`, `6.5s` hoặc `6,5s`.
- Đổi cách đo đoạn im lặng thì xoá `assets/sfx-onsets.json` để đo lại.

### 13.2 Giữ chữ đủ lâu để đọc

**Dùng khi nào.** Bước 4b, khi bảng `## Cảnh` có chữ trên hình. Chữ trên hình là chuỗi trong ngoặc kép ở cột Hình; chuỗi trong cột Lời đọc không tính.

```bash
node $OV/scripts/check-preflight.mjs --project ./ --stage plan
```

Mỗi chữ cần ở trên hình ít nhất `số từ / 2,5 + 0,5 giây`, tối thiểu 1 giây. Tốc độ 2,5 từ mỗi giây lấy từ tài liệu kịch bản video của viet-pro. Thời gian mắt tìm tới chữ 0,5 giây là giả định, chưa đo. Vì ngưỡng chưa được hiệu chỉnh, kiểm tra này chỉ in WARN ở cả cổng plan lẫn cổng final với mọi dự án. Nó không đổi mã thoát:

```text
WARN  PLAN.md "## Cảnh" row 4: chữ trên hình "Từ kế hoạch đến kiểm thử" (11 từ) cần giữ ≥ 4.9s, beat dài 3.6s
```

Không có mốc thì cổng coi chữ rời đi lúc hết beat. Chữ còn ở lại qua các beat sau thì ghi mốc trong ô Hình: `(giữ đến 15s)` theo giây trên timeline gốc, hoặc `(giữ đến hết)` khi chữ ở tới cuối video. Cổng đo từ đầu beat tới mốc đó. Câu như "giữ hình khoảng 1 giây cuối" không phải mốc.

Lỗi thường gặp:

- WARN `cần giữ ≥` cho chữ thật ra vẫn ở trên hình: thêm `(giữ đến <t>s)` hoặc `(giữ đến hết)`.
- WARN cho chữ thật sự rời sớm: kéo dài beat hoặc rút bớt chữ.
- Một hàng có nhiều chuỗi thì số từ là tổng các chuỗi. Câu WARN nêu chuỗi dài nhất của hàng.

### 13.3 Vòng sửa khoanh vùng với `REVISIONS.md`

**Dùng khi nào.** Bước 6b, khi người dùng xem animatic hoặc bản final và xin sửa. Mục đích là sửa đúng chỗ và kiểm từng chỗ bằng ảnh chụp mà không render lại cả video. Ghi chép của từng vòng được giữ lại. Mẫu và luật đầy đủ ở [revisions.md](../references/revisions.md).

Mỗi loạt góp ý là một vòng `## Vòng <n>` trong `REVISIONS.md`, tiêu đề chép nguyên văn lời người dùng. Mỗi vòng có tối đa 5 mục `### R<n>`, mỗi mục đủ bốn dòng `Vị trí:`, `Lỗi thấy:`, `Đổi:`, `Giữ nguyên:`. `Vị trí` ghi giây trên timeline gốc.

Sửa xong một mục thì kiểm ngay trên composition hiện tại, không cần render:

```bash
npx --yes hyperframes@0.8.144 snapshot ./ --at 6.2,6.5,7.0 --no-end
npx --yes hyperframes@0.8.144 check --at-transitions
```

Thêm vào `--at` các mốc ghi ở `Giữ nguyên`. Bản 0.8.144 không có cờ `--range` cho `snapshot` hay `check`. Hết vòng thì chạy một lần `make-demo.mjs --project ./ --animatic`; người dùng duyệt animatic mới, ảnh chụp và đoạn cắt không được tính là duyệt.

`check-preflight.mjs --stage final` đọc `REVISIONS.md` khi file có mặt và in WARN, không chặn:

- `REVISIONS.md <vòng>: <n> mục, tối đa 5 mỗi vòng`: tách bớt mục sang vòng sau, hỏi người dùng mục nào để sau.
- `REVISIONS.md R<n>: thiếu <trường>`: bổ sung dòng còn thiếu trước khi giao.

Mã thoát của `check-preflight` không đổi: 0 đạt, 1 bị chặn, 2 sai cú pháp.

## 14. Template, style và đồng bộ

Chương này nói về bản v1.2.0 (2026-10-15). Các phần mới học từ skill motion-video của AgentKit (MIT) và được viết lại bằng Node cùng ffmpeg, không gọi script Python lúc chạy. Có năm việc: dựng từ một khung sẵn, giảm nhạc khi có giọng và đo được bằng số, đo nhịp nhạc thật, kiểm chữ chốt khớp lời, sinh bản 9:16 và 1:1 từ một `index.html`. Thêm vào đó là 61 style, một trục thứ hai bên cạnh 8 hướng đạo diễn.

Dự án cũ (BRIEF không có `direction:` và không có `brief_version: 2`) không bị chặn thêm: các cổng mới chỉ in WARN với chúng.

### 14.1 Khung composition và mốc thời gian theo lời

**Dùng khi nào.** Bước 4 và 6, khi dựng tay (`general-video`). `new-project.sh` đã gọi sẵn lệnh tạo khung.

```bash
node $OV/scripts/composition.mjs init --project . [--aspect 16:9|9:16]
node $OV/scripts/timing.mjs --project . [--music assets/bgm/bgm.mp3] [--dry]
```

- `composition.mjs init` chép `templates/composition/index-skeleton.html` thành `index.html`, đặt kích thước khung theo `aspect` của BRIEF (`both` bắt đầu từ 16:9). Lệnh không ghi đè file đã có.
- Skeleton có sẵn bộ hàm hoạt hình (`pop`, `rise`, `draw`, `slideX`, `flipIn`, `typeIn`, `odo`, `slam`, `settleCam`, `shake`…), cộng ba hàm mốc: `W("s2", "mã nguồn")` trả giây lúc giọng đọc nói cụm đó trong cảnh s2, `WE` trả lúc cụm nói xong, `B(n)` trả giây của phách thứ n.
- `timing.mjs` đọc bảng `## Cảnh` của `PLAN.md` và mọi `words.json` của track giọng (id `vo-*` hoặc `*-voice`, `data-audio-group="voiceover"`, hoặc file nằm trong `assets/voice/`), rồi ghi đè khối nằm giữa `TIMING:BEGIN` và `TIMING:END`. Sửa giọng xong chỉ cần chạy lại lệnh này, không sửa tay số giây.
- Cụm từ khớp theo chữ đã bỏ dấu câu và gộp hoa thường, nên "mã nguồn" khớp với hai token "mã" và "nguồn,". Không khớp thì `W` in `W miss: <cảnh> <cụm>` và trả lúc bắt đầu cảnh.
- Giọng kéo quá `data-duration` của root thì lệnh in WARN và không tự kéo dài video.

### 14.2 Đo nhịp nhạc

**Dùng khi nào.** Bước 5, với hướng `don-dap` hoặc nhóm `story-music`, khi hình cần cắt theo phách.

```bash
node $OV/scripts/beat-grid.mjs assets/bgm/bgm.mp3 --write
node $OV/scripts/timing.mjs --project .
```

Dòng đầu cho biết tempo, phách đầu và độ ổn định, ví dụ `BPM 119.8  BEAT0 0.025 s  stability 16 ms`. Sau đó là bảng ô nhịp với `K` ở phách có kick. `--write` ghi `bgm.mp3.beats.json` cạnh file nhạc. Lệnh chỉ đo, không cắt ghép nhạc.

- `stability` trên 45 ms thì lệnh in `UNSTABLE`, exit 1 và không ghi file. Khi đó `B()` không dùng được cho bài nhạc này: dựng theo `W()` hoặc theo giây.
- Ngưỡng 45 ms đo trên 6 bản nhạc thật trong workspace (từ 16 đến 40 ms, cả 6 đọc đúng tempo). Một chuỗi kick trôi từ 100 lên 140 BPM cho khoảng 100 ms nên vẫn bị chặn.
- Nhạc chậm bị đọc ra gấp đôi tempo nghe được thì chạy lại với `--max-bpm 100`.
- Chưa đo nhịp mà gọi `B()` thì composition ném lỗi `B() cần beat-grid.mjs`.

### 14.3 Chữ chốt khớp lời

**Dùng khi nào.** Bước 4b khi viết `PLAN.md`, rồi bước 8. Thêm vào bảng `## Sự kiện` một hàng cho mỗi chữ chốt cần hiện đúng lúc giọng nói tới:

```markdown
| 7.8 | chữ: "phân tích dự án" | — |
```

```bash
node $OV/scripts/word-sync.mjs --project . --write-qa
```

- Lệnh tìm cụm trong lời đọc theo cùng luật với `W()`. Cụm xuất hiện nhiều lần thì lấy lần gần `Thời điểm` nhất. Lệch tới 150 ms là PASS, tới 250 ms là WARN, xa hơn hoặc không có trong lời đọc là FAIL.
- Cụm trong ngoặc kép dừng ở dấu đóng ngoặc: `chữ: "kiểm thử" bay vào` cho cụm `kiểm thử`.
- Dòng WARN "không có trong lời của cảnh … (TIMING)" chỉ có hai nghĩa: khối TIMING cũ hơn `words.json` (chạy lại `timing.mjs`), hoặc cụm vắt qua hai cảnh.
- Cổng final của `check-preflight` chạy phép kiểm này với dự án sáng tạo: FAIL chặn, WARN cảnh báo.

### 14.4 Nhạc dưới giọng: giảm và đo

`audio-mix.mjs` (bản giao của `render-final.mjs` đi qua lệnh này) đọc `data-audio-group` và `data-fx-carve` rồi đổi thành sidechain ffmpeg. Không phải sửa HTML của dự án cũ.

- Đích là nhạc thấp hơn giọng `4 + 2,5 × strength` dB lúc có lời (strength 0,8 cho 6 dB). Lệnh đo mức tự nhiên, rồi tìm ngưỡng compressor bằng cách đo lại sau mỗi lần thử.
- `--loudnorm` tăng hoặc giảm cả bản mix một mức cố định để về −14 LUFS, nhưng không vượt đỉnh −1,5 dBTP. Khi đỉnh chặn, bản mix nhỏ hơn −14 LUFS và lệnh in `WARN LOUDNESS`. `render-final.mjs` luôn bật cờ này.

Đo kết quả:

```bash
node $OV/scripts/mix-balance.mjs --project . [--write-qa] [--json]
```

Kết quả là một dòng như `PASS BALANCE nhạc dưới giọng 6.1 dB (lúc có lời), nhạc lúc không lời −22.3 dBFS`. Từ 4 đến 7 dB là PASS, 2–4 hoặc 7–10 dB là WARN, ngoài khoảng đó là FAIL. Khoảng này có lý do: motion-video ghi lại rằng khi nhạc thấp hơn giọng khoảng 10 dB, người xem báo là "không có nhạc". Cổng final chạy phép đo này với dự án có `index.html`.

Track giọng được nhận khi có id `vo-*` hoặc `*-voice` (dự án faceless-explainer đặt `el-01-…-voice`), group `voiceover`, file nằm trong `assets/voice/`, hoặc là nguồn của một carve. Dự án có lời mà lệnh vẫn in `PASS BALANCE không có giọng đọc` thì đặt lại id hoặc group của track giọng.

### 14.5 Một index.html cho 16:9, 9:16 và 1:1

Dự án mới `aspect: both` chỉ có một thư mục. Phần khác của khổ dọc viết trong khối CSS `html[data-ratio="9x16"] …` của `index.html` (khổ vuông là `1x1`), bố cục đặt trong class thay vì inline style.

```bash
node $OV/scripts/reframe.mjs . --ratio 9x16      # hoặc --ratio 1x1
cd ../<project>-9x16 && npx --yes hyperframes@0.8.144 lint
```

- Lệnh tạo `../<project>-9x16/` với khung 1080×1920 (1:1 là 1080×1080, `data-resolution="square"`), giữ nguyên giọng, nhạc, TIMING và bản mix. `assets/` là bản clone APFS của bản gốc (chép thường khi khác ổ): ghi ở bản dọc không đổi file của bản gốc. Asset sinh lại ở bản gốc chỉ sang bản dọc sau khi chạy lại `--force`.
- Mỗi dòng `WARN layout` chỉ một giá trị `left/top/width/height` từ 1080 px trở lên nằm ngoài khối override. Lệnh không bắt `x:` hay `translate(...px)` của GSAP, `right/bottom/inset`, cũng không bắt `data-width="1920"` của composition con. Vẫn phải xem bản dọc bằng mắt.
- Bản gốc đổi thì chạy lại với `--force`. `--force` chỉ thay thư mục rỗng hoặc thư mục do chính `reframe.mjs` tạo cho bản gốc này, và chỉ thay các tệp do lệnh sinh ra. `renders/`, `demo/`, `DEMO.md`, `QA.md`, `REVISIONS.md` của bản dọc được giữ.
- Animatic dọc: `make-demo.mjs --project ./ --animatic --aspect 9x16 --hyperframes ../<project>-9x16`.
- Dự án cũ, dự án tạo bằng `new-project.sh --legacy-pair` và workflow frame-worker vẫn làm bản 9:16 bằng project riêng như mục 5.2.

### 14.6 Chuyển động từng cảnh

[motion-craft.md](../references/motion-craft.md) là tiêu chuẩn chuyển động bằng tiếng Việt: mức hiệu ứng theo `energy`, 10 nguyên tắc, bộ kỹ thuật dùng hàm của skeleton, các dấu hiệu nhìn ra là demo và danh sách kiểm 6 mục cho từng cảnh.

`make-demo.mjs --animatic` cắt thêm một sheet cho mỗi cảnh: 18 khung xếp 6×3 ở `demo/scenes/sheet-s<#>.jpg`, ghi vào `DEMO.md` dưới khoá `scene_sheets:`. Bản 9:16 nằm ở `demo/9x16/scenes/`, khoá `scene_sheets_9x16:`. Cảnh ngắn hơn 0,5 giây không có sheet. Với `--composition`, cảnh bắt đầu sau khi animatic đã hết cũng không có sheet và lệnh in WARN. Trong `REVISIONS.md`, ô `Vị trí` ghi kèm sheet của cảnh, ví dụ `cảnh 3 (demo/scenes/sheet-s3.jpg)`.

### 14.7 Style: trục thứ hai

Hướng đạo diễn (A1–A8) quyết định cách kể bằng hình. Style quyết định giao diện: màu, chữ, chất liệu, chuyển cảnh, nhịp. Có 61 style trong `data/styles/`, mỗi style một file JSON với tên và mô tả tiếng Việt (`ten_vi`, `mo_ta_vi`). Agent chỉ đọc `data/styles/index.json` (một dòng mỗi style) và đúng một profile đã chọn.

```bash
node $OV/scripts/styles.mjs find "keynote kính"
node $OV/scripts/styles.mjs suggest --direction A3 --energy don-dap
node $OV/scripts/styles.mjs show glass-keynote
node $OV/scripts/styles.mjs resolve --project . --markdown
```

- `make-pitch init` gán cho mỗi styleframe một style trong danh sách gợi ý của hướng, hợp với nhịp. `choose` ghi `style_profile:` vào BRIEF; đổi bằng `--style-profile <id|alias>`.
- Phối theo cảnh: mục `## style_layers` trong BRIEF là một mảng JSON, mỗi lớp mượn vài chiều của một style khác cho vài cảnh (theo id `s2` hoặc theo cột `Loại` của `## Cảnh`). `resolve --markdown` in khối để dán vào `## Ý đồ sáng tạo`. Luật đầy đủ ở [style-system.md](../references/style-system.md).
- `find` chấm điểm khác bản Python gốc: khớp đúng id hoặc alias được 1; còn lại lấy điểm cao hơn giữa độ giống tên (theo bigram, chỉ tính từ 0,5) và tỉ lệ từ khoá có trong mô tả. Kết quả xếp hạng có thể khác motion-video với cùng câu tìm.
- Cổng `check-preflight` (cả hai stage): BRIEF có `style_profile:` mà resolve lỗi thì FAIL với dự án mới, WARN với dự án cũ. Dự án sáng tạo thiếu `style_profile:` chỉ bị WARN.
