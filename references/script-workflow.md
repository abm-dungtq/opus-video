# Quy trình kịch bản (nối với viet-pro)

Dùng khi video có lời đọc hoặc chữ trên hình bằng tiếng Việt. Đường dẫn gốc: `VP` = thư mục skill `viet-pro` trên agent đang chạy (Claude Code `~/.claude/skills/viet-pro`, Codex `~/.agents/skills/viet-pro`, Antigravity `~/.gemini/config/skills/viet-pro`; `setup-check.mjs` in đường dẫn thật). **Đây là cổng bắt buộc** (SKILL.md bước 2): mọi kịch bản tiếng Việt, kể cả video TikTok viral, đi qua quy trình viet-pro đầy đủ ở mục 2 và phải qua `scripts/check-viet-pro.mjs` trước khi tạo giọng hay render. Bảng ở mục 1 chỉ quyết định kỹ thuật nào được **dùng**; mọi file trong `review/` và `editorial/` vẫn phải **đọc**. Kỹ thuật là lựa chọn, không phải quota.

## 1. Bảng chọn theo loại video

| Loại video | Kỹ thuật viet-pro cần đọc | Hook gợi ý | Cấu trúc |
|---|---|---|---|
| Explainer/giáo dục | `$VP/references/editorial/technical.md`, `$VP/references/editorial/hook-close.md`, `$VP/references/editorial/metaphor.md` (khi khái niệm khó) | Data hoặc câu hỏi trực tiếp | Hook → vấn đề → giải thích A→B→C, mỗi bước 1 hình → chốt 1 ý |
| Phản bác ngộ nhận | `$VP/references/editorial/debunk.md`, `$VP/references/editorial/reframe.md`, `$VP/references/editorial/hook-close.md` | Nêu ngộ nhận phổ biến rồi lật (Paradox Flip) | 5 bước debunk rút gọn: công nhận phần đúng → nguồn nói gì → chỗ sai → kết fair |
| Sản phẩm/quảng cáo | `$VP/references/editorial/hook-close.md`, `$VP/references/editorial/story-core.md` (Show, không Tell) | Behavioral: hành vi/nỗi đau người xem nhận ra ngay | Nỗi đau → sản phẩm giải quyết thế nào (show) → 1 bằng chứng → CTA 1 hành động |
| Tự sự/music video | `$VP/references/editorial/story-core.md`, `$VP/references/editorial/metaphor.md`, `$VP/references/editorial/rhythm.md` | Anecdote: một khoảnh khắc cụ thể | Logic chain tình huống → biến cố → insight; ẩn dụ 3 điểm chạm, callback ở cảnh cuối |
| Kinetic typography/spoken-word | `$VP/references/editorial/rhythm.md`, `$VP/references/editorial/reframe.md` | Một câu ngắn đứng riêng, đặt tên khái niệm | Nhịp dồn rồi nhả (setup dài → dữ kiện ngắn); mỗi cụm chữ khớp 1 nhịp nói |
| Motion không lời | `$VP/references/editorial/hook-close.md`, `$VP/references/editorial/story-core.md` | Hình/dữ kiện gây chú ý trong 3 giây đầu | Chữ trên hình thay lời: 1 ý mỗi khung, ≤ 7 từ mỗi dòng, kết bằng 1 câu chốt |

Chuyển thể sang văn nói luôn theo `$VP/references/publishing/video-script.md` (bảng 3 cột, ~2,5–3 từ/giây, 1 insight/video ngắn).

## 2. Quy trình kịch bản (viet-pro đầy đủ, mức Chuẩn)

1. **Đọc** (một lần mỗi dự án, đọc hết file): `$VP/SKILL.md`; mọi file trong `$VP/references/review/` (lead, anti-ai, humanizer-patterns, natural, punctuation, capitalization, consistency, fact-check); mọi file trong `$VP/references/editorial/` (lead, hook-close, rhythm, story-core, debunk, emphasis, metaphor, reframe, technical); `$VP/references/publishing/video-script.md`. Đến bước caption thì đọc thêm `publishing/facebook.md` và `publishing/repurpose-matrix.md`.
2. **Chốt brief vừa đủ** theo `$VP/SKILL.md`: mục tiêu, khán giả, kênh, thời lượng, ngôi xưng ("mình"/"bạn" cho video ngắn), dữ kiện phải giữ nguyên, phần bị cấm. Thiếu dữ kiện thì nêu giả định, không bịa.
3. **Soạn** bảng 3 cột `Thời điểm | Voice-over (văn nói) | Visual / text trên hình` theo `video-script.md`. Đếm từ: khoảng 2,5–3 từ/giây. Một video ngắn một insight. Lưu bản nháp đầu thành `<project>/script-table.v1.md`.
4. **Humanizer có ghi chép:** đi qua đủ 25 pattern của `$VP/references/review/humanizer-patterns.md` theo quy trình 4 bước của `anti-ai.md` (phát hiện → viết lại theo đoạn → đối chiếu dữ kiện → bản cuối). Ghi từng pattern tìm thấy, câu gốc và cách sửa. Rà thêm `natural.md` (trộn tiếng Anh, nối câu), `punctuation.md`, `capitalization.md`, `consistency.md` (thuật ngữ một khái niệm một từ). Tối đa hai vòng sửa.
5. **Đối chiếu dữ kiện** giữa bản nháp và bản cuối:
   ```bash
   node $VP/scripts/compare-preserved-content.mjs <project>/script-table.v1.md <project>/script-table.md --keep "Claude" --keep "<tên riêng khác>"
   ```
   MISMATCH (exit 1) phải xử lý; REVIEW thì đọc lại câu đó.
6. Lưu bản cuối vào `<project>/script-table.md` (không dùng `script.md`, vì trên macOS nó trùng file với `SCRIPT.md`). Tách lời theo frame vào `script/NN.txt`: mỗi dòng bảng ứng với đúng một frame trong `STORYBOARD.md`. Dòng nào quá dài cho thời lượng frame thì tách frame hoặc cắt lời, không nói nhanh hơn.
7. **Lint** (mục 4), rồi ghi biên bản `## viet_pro` (mục 4.1), rồi chạy cổng `check-viet-pro.mjs`.
8. Với workflow HyperFrames: xuất `<project>/SCRIPT.md` theo `references/script-format.md` của skill `hyperframes` (cùng thư mục skills với opus-video):
   - header `**Voice:**`, `**Voice settings:**`, `**Voice direction:**`;
   - mỗi lời một mục `## Line N — <nhãn> (Frame N)`, có `**Time:**` và `**Delivery:**`;
   - lời đọc thụt đúng 4 dấu cách (chỉ phần này được đưa vào TTS), và phải trùng từng chữ với `script/NN.txt` đã qua lint.

Ví dụ:

```markdown
## Line 1 — Hook (Frame 1)

**Time:** 0.0 – 3.0s
**Delivery:** Chắc, nhấn vào con số.

    Gần ba phần tư học sinh không đủ điểm vào trường công.
```

### 2.1 Video TikTok/Reels/Shorts viral

Vẫn là viet-pro, chỉ cụ thể hoá cho kênh ngắn:

- **Hook 1–3 giây** bằng dữ kiện, hành vi người xem nhận ra ngay hoặc câu hỏi gắn với insight (`hook-close.md` mục 1, `video-script.md`). Không chào, không "Trong thời đại…"/"Hãy tưởng tượng…" (humanizer #4), không câu mồi công thức: "Đừng lướt qua", "99% người không biết", "Bạn sẽ không tin", "Sự thật gây sốc", "Xem đến cuối" (#13 thổi phồng). Ô `[Hook — câu sốc]` trong bảng mẫu của `video-script.md` chỉ là chỗ trống; nguyên tắc của file đó là "không bắt buộc gây sốc".
- **Một góc nhìn:** một insight. Ý khác ghi "video sau".
- **Giọng người thật:** văn nói "mình"/"bạn", câu ngắn chủ động, đọc thành tiếng. Lặp từ hoặc câu dồn được phép khi có chủ đích (ngoại lệ của `video-script.md`). Không chuỗi từ quảng cáo rỗng (#12, #16), không châm ngôn tự chế (#3), không câu kết kịch tính (#2).
- **Không bịa trải nghiệm hay nhân vật:** không "mình đã dùng X tháng", "mình test thấy…", "khách của mình kể…" nếu người dùng không đưa trải nghiệm đó. Tự chứng minh (`story-core.md` 3.2) chỉ dùng với trải nghiệm thật của người dùng.
- **Số liệu:** nói tròn, số chính xác lên chữ trên hình; claim phải có trong `SOURCES.md`.
- **CTA:** tối đa một hành động cụ thể và chỉ khi brief cần. Không "like, share, follow", "comment 'X' để nhận", "follow để không bỏ lỡ", "tag một người bạn". Kết bằng dữ kiện hoặc bước làm thật cũng được.

## 3. Kiểm chứng dữ kiện

Bắt buộc khi loại video là explainer/giáo dục hoặc phản bác ngộ nhận, hoặc khi kịch bản có bất kỳ số liệu nào.

- Có nguồn là URL hoặc PDF thì chạy `source-ingest.mjs` trước (`node $OV/scripts/source-ingest.mjs --project . <url|file.pdf|arxiv:<id>>`). Đọc `sources/<slug>.txt`, viết ý chính có trích câu gốc. Mọi số liệu trong kịch bản phải trỏ về một mục trong `SOURCES.md`.
- Làm theo `$VP/references/research/lead.md` để tìm nguồn và `$VP/references/review/fact-check.md` để xếp mức rủi ro, verify và xử lý claim chưa verify được (hedge, cite hoặc bỏ).
- Ghi nguồn vào `<project>/SOURCES.md`, mỗi claim một dòng: `claim — nguồn (tên, URL, ngày truy cập) — trạng thái đã verify/hedge/bỏ`.
- Số chính xác đặt trên text hiển thị ("72,4%"); lời đọc dùng số tròn ("gần ba phần tư").
- Không verify được thì bỏ claim, không giữ lại để video "có số".

## 4. Lint

```bash
node $VP/scripts/lint-vietnamese-content.mjs <project>/script-table.md <project>/script/*.txt
```

- ERROR: phải sửa rồi chạy lại đến khi hết ERROR.
- WARN phải sửa khi đúng là lỗi văn phong: `oxford-comma`, `em-dash` trong lời đọc, `ai-label`, `chatbot-residue`, `staged-opener`, `contrast-formula-repeat`, `dramatic-closer-repeat`, `decorative-bold-labels`, `title-case` (trừ tên riêng), `transition-overuse`.
- WARN được giữ (ghi lý do vào biên bản): `double-space` do cú pháp bảng, gạch nối khoảng thời gian (`0.6–9.1s`) trong cột Thời điểm, tên riêng viết hoa.

### 4.1 Biên bản `## viet_pro` và cổng kiểm tra

Ghi vào `BRIEF.md` (khuyên dùng) hoặc `script-table.md`. Mỗi trường một dòng `- khoá: giá trị`; trường dài thì viết tiếp ở các dòng thụt 4 dấu cách.

```markdown
## viet_pro
- mode: Chuẩn
- files_read: SKILL.md, review/lead.md, review/anti-ai.md, review/humanizer-patterns.md, review/natural.md, review/punctuation.md, review/capitalization.md, review/consistency.md, review/fact-check.md, review/translationese-vi.md, editorial/lead.md, editorial/hook-close.md, editorial/rhythm.md, editorial/story-core.md, editorial/debunk.md, editorial/emphasis.md, editorial/metaphor.md, editorial/reframe.md, editorial/technical.md, publishing/video-script.md
- humanizer: <pattern #N → câu gốc → cách sửa; hoặc "không thấy pattern 1–5">
- lint: <file: số ERROR/WARN, WARN nào giữ và vì sao>
- words: <số từ> / <thời lượng> giây
- facts: <compare-preserved-content: số MISMATCH; nguồn ở SOURCES.md>
- captions: <bước 9: pattern đã sửa, lint FB/TikTok>
```

```bash
node $OV/scripts/check-viet-pro.mjs --project <project>                    # trước eleven.mjs tts/audio-meta và render
node $OV/scripts/check-viet-pro.mjs --project <project> --stage delivery   # trước khi giao
```

Cổng chặn (exit 1) khi: thiếu biên bản hoặc trường bắt buộc; thiếu `script-table.v1.md`; `compare-preserved-content` báo MISMATCH giữa `script-table.v1.md` và `script-table.md`; lint ERROR ở `script-table.md`, `script/*.txt` hoặc lời đọc trong `SCRIPT.md` (`SCRIPT.md#voice`); ở bước giao còn dòng `viet_pro_override` trong `BRIEF.md`. `eleven.mjs tts`/`audio-meta` tự chạy lại cổng và exit 4 khi bị chặn, nên lời đọc phải nằm trong `script/NN.txt` và `SCRIPT.md` phải trùng từng file đó.

**Tuỳ chọn: `--jev-audit`** (cần `TYPESAFE_API_KEY`). Lệnh gửi từng `script/NN.txt` cho Jev và hỏi xác suất câu đó mắc Humanizer 1–5, câu mồi, trải nghiệm tự bịa hoặc số liệu không nguồn. Kết quả chỉ in `WARN  jev <pattern> p=… script/NN.txt`, không đổi exit code. Chi phí khoảng 0,04 USD/1 triệu token đầu vào. Agent đọc từng WARN như một gợi ý để rà lại; Jev không thay việc đọc viet-pro. Độ chính xác từng pattern đo bằng `node $OV/scripts/jev-audit-eval.mjs` trên `data/jev-audit-eval.jsonl` (24 câu có nhãn). Chỉ người dùng mới quyết định nâng một pattern thành lỗi chặn, và chỉ khi precision ≥ 0,9.

Cổng kiểm tra biên bản có đủ `mode`, `files_read`, `humanizer`, `lint` (bước 9 thêm `captions`) và `files_read` có nêu đủ mọi file `review/`, `editorial/` của bản viet-pro đang cài. Cổng tự chạy lại lint viet-pro cho từng file, còn ERROR là `BLOCKED` (exit 1). Câu mồi, lời kể trải nghiệm ngôi thứ nhất và lời đọc quá ~3 từ/giây chỉ là WARN: đọc và sửa, hoặc ghi lý do giữ. `BRIEF.md` có `language:` khác `vi` thì cổng bỏ qua (SKIP).

## 5. Bước 9 (bắt buộc khi giao): `CAPTIONS.md`

Hai caption, mỗi caption đi qua đúng quy trình viet-pro như kịch bản: đọc `$VP/references/publishing/facebook.md` và `$VP/references/publishing/repurpose-matrix.md` (cộng các file `review/`, `editorial/` đã đọc ở bước 2) → soạn → Humanizer có ghi chép → lint riêng từng caption.

```markdown
## Facebook cá nhân

<văn xuôi liền mạch, có thể copy-paste thẳng lên Facebook>

## TikTok

<caption ngắn>
```

- **Facebook cá nhân** (`facebook.md`): vào đề thẳng ở câu đầu, không tiêu đề, không heading/bullet/markdown/`---` bên trong mục, tách đoạn bằng dòng trống. Xưng "mình"/"tôi", không gọi "bạn" (trừ câu hỏi tu từ). Nguồn đan vào câu, không có mục "Tham khảo". Không hashtag/emoji nếu brief không cần.
- **TikTok:** viet-pro chưa có file kênh TikTok caption, nên theo `publishing/lead.md` (kênh chưa có reference thì làm theo brief và quy chuẩn hiện hành, ghi rõ giả định) và dòng video-script của `repurpose-matrix.md`. Dòng đầu tự đứng được và vào thẳng ý (hook viết lại, không chép câu mở của video), một insight, giọng "mình"/"bạn", tối đa một CTA cụ thể. Không dùng câu mồi ở mục 2.1. Hashtag chỉ khi người dùng muốn: 3–5 cái đúng chủ đề, đặt cuối caption, không nhồi tag chung chung.
- Cùng insight và số liệu với video, không thêm claim mới.
- Lint: `check-viet-pro.mjs --stage delivery` tách hai mục ra file tạm và lint từng mục riêng. Muốn lint tay thì chép từng mục ra file riêng rồi chạy `node $VP/scripts/lint-vietnamese-content.mjs <file>`.
- Ghi `- captions:` vào biên bản `## viet_pro` và thêm `publishing/facebook.md`, `publishing/repurpose-matrix.md` vào `files_read`.
- File phụ đề cho YouTube/Facebook (khi cần): `mkdir -p captions && hyperframes transcribe <voice.mp3> -e whisper -m large-v3 -l vi -d captions --to srt -o captions/<name>.srt` (tải mô hình ~3 GB lần đầu; `-d captions` để `transcript.json` không ghi đè file ở gốc project). Rà lại chính tả và dấu trước khi giao.
- **Không tự đăng.** Giao file cho người dùng; đăng hay không là việc của họ.
