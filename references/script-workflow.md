# Quy trình kịch bản (nối với viet-pro)

Dùng khi video có lời đọc hoặc chữ trên hình bằng tiếng Việt. Đường dẫn gốc: `VP=~/.claude/skills/viet-pro`. Chỉ đọc file cần cho loại video đang làm; kỹ thuật là lựa chọn, không phải quota.

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

## 2. Quy trình kịch bản

1. Gọi skill `viet-pro` ở chế độ **Nhanh**, nêu rõ: video ngắn, thời lượng, tỉ lệ khung, khán giả, loại video (bảng trên), file kỹ thuật cần đọc, dữ kiện bắt buộc giữ nguyên.
2. Yêu cầu đầu ra là **bảng 3 cột** `Thời điểm | Voice-over (văn nói) | Visual / text trên hình` theo `video-script.md`. Đếm từ cho khớp thời lượng.
3. Lưu bảng vào `<project>/script-table.md` (không dùng `script.md`, vì trên macOS nó trùng file với `SCRIPT.md`).
4. Tách lời theo frame: mỗi dòng bảng ứng với đúng một frame trong `STORYBOARD.md`. Dòng nào quá dài cho thời lượng frame thì tách frame hoặc cắt lời, không nói nhanh hơn.
5. Với workflow HyperFrames: xuất `<project>/SCRIPT.md` theo `~/.claude/skills/hyperframes/references/script-format.md`:
   - header `**Voice:**`, `**Voice settings:**`, `**Voice direction:**`;
   - mỗi lời một mục `## Line N — <nhãn> (Frame N)`, có `**Time:**` và `**Delivery:**`;
   - lời đọc thụt đúng 4 dấu cách (chỉ phần này được đưa vào TTS).

Ví dụ:

```markdown
## Line 1 — Hook (Frame 1)

**Time:** 0.0 – 3.0s
**Delivery:** Chắc, nhấn vào con số.

    Gần ba phần tư học sinh không đủ điểm vào trường công.
```

## 3. Kiểm chứng dữ kiện

Bắt buộc khi loại video là explainer/giáo dục hoặc phản bác ngộ nhận, hoặc khi kịch bản có bất kỳ số liệu nào.

- Làm theo `$VP/references/research/lead.md` để tìm nguồn và `$VP/references/review/fact-check.md` để xếp mức rủi ro, verify và xử lý claim chưa verify được (hedge, cite hoặc bỏ).
- Ghi nguồn vào `<project>/SOURCES.md`, mỗi claim một dòng: `claim — nguồn (tên, URL, ngày truy cập) — trạng thái đã verify/hedge/bỏ`.
- Số chính xác đặt trên text hiển thị ("72,4%"); lời đọc dùng số tròn ("gần ba phần tư").
- Không verify được thì bỏ claim, không giữ lại để video "có số".

## 4. Lint

```bash
node ~/.claude/skills/viet-pro/scripts/lint-vietnamese-content.mjs <project>/script-table.md
```

- ERROR: phải sửa rồi chạy lại đến khi hết ERROR.
- WARN về bảng hoặc dấu gạch ngang trong bảng: bỏ qua được (bảng 3 cột là định dạng chủ đích).
- WARN khác: đọc trong ngữ cảnh, sửa khi đúng là lỗi văn phong.

## 5. Bước 9 (tuỳ chọn): caption đăng mạng xã hội

Chỉ làm khi người dùng yêu cầu caption.

- Làm theo `$VP/references/publishing/repurpose-matrix.md` (giữ cùng insight và số liệu, viết lại hook theo kênh) và file kênh tương ứng: Facebook theo `$VP/references/publishing/facebook.md`; TikTok và YouTube theo `$VP/references/publishing/video-script.md` cùng dòng video-script trong ma trận.
- Ghi mỗi kênh một file: `<project>/captions/tiktok.md`, `<project>/captions/facebook.md`, `<project>/captions/youtube.md`.
- Chạy lint ở mục 4 cho từng file caption.
- File phụ đề cho YouTube/Facebook: `mkdir -p captions && hyperframes transcribe <voice.mp3> -e whisper -m large-v3 -l vi -d captions --to srt -o captions/<name>.srt` (tải mô hình ~3 GB lần đầu; `-d captions` để `transcript.json` không ghi đè file ở gốc project). Rà lại chính tả và dấu trước khi giao.
- **Không tự đăng.** Giao file cho người dùng; đăng hay không là việc của họ.
