# Nhánh footage thật (beta)

Dùng khi người dùng đưa clip quay thật (talking-head, phỏng vấn, UGC) cần cắt gọn rồi thêm phụ đề, đồ hoạ, bản 9:16. Clip giữ nguyên làm trục và đặt trong khung PiP trên nền bản đồ/phối cảnh dựng mới: xem `clip-master-canvas.md`. Cả hai nhánh đặt `voice_source: clip` trong BRIEF khi lời nói là của clip (không TTS). Trạng thái **beta**: đã smoke trên clip tổng hợp có giọng tiếng Việt thật (2026-10-10); chưa chạy trên clip người thật.

## Quy trình

1. **Kiểm nguồn.** `ffprobe` từng clip: fps, kích thước, có audio. Nhiều clip khác fps hoặc màu thì chuẩn hoá trước bằng ffmpeg, vì `apply-edl` sẽ từ chối. Clip điện thoại thường có fps thay đổi (VFR): đổi sang fps cố định trước (`ffmpeg -i in.mp4 -fps_mode cfr -r 30 -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac raw/in-cfr.mp4`). iPhone mặc định quay 10-bit HDR (HLG): `apply-edl` từ chối, cần chuyển về SDR 8-bit trước.
2. **Bản chép lời.** Chạy local, không upload:
   `hyperframes transcribe <clip> -e whisper -m large-v3 -l vi -d transcripts/<tên-clip>` rồi đọc `transcripts/<tên-clip>/transcript.json` (lần đầu tải ~3 GB). Không redirect stdout vào file: `--json` chỉ in dòng tóm tắt và sẽ ghi đè bản chép. Rà lỗi chính tả trước khi dùng.
3. **Điểm cắt an toàn.** `node $OV/scripts/cut.mjs probe --in <clip> --out probe.json`. Chỉ cắt trong các `gaps` (khoảng lặng ≥ 250 ms), không cắt theo ranh giới từ của bản chép lời.
4. **Danh sách cắt.** Viết `edl.json`:
   ```json
   {"sources":{"a":"raw/clip.mp4"},
    "ranges":[{"source":"a","start":0.42,"end":7.9,"note":"mở bài"},
              {"source":"a","start":9.1,"end":21.3,"note":"ý chính"}]}
   ```
   Mỗi range bắt đầu và kết thúc trong một gap. Bỏ câu hỏng, lặp, ngập ngừng dài. Giữ thứ tự kể chuyện.
5. **Ghép.** `node $OV/scripts/cut.mjs apply-edl --edl edl.json --out assets/footage/cut.mp4`. Exit 2 nghĩa là nguồn lệch fps/màu hoặc là HDR/10-bit (quay lại bước 1). Chỉ một clip và vài đoạn giữ lại thì `media-use/scripts/transcript-cut.mjs` cũng đủ; dùng `cut.mjs` khi có nhiều nguồn hoặc cần EDL để duyệt lại.
6. **Dựng lớp trên.** Project HyperFrames với `cut.mp4` là lớp `<video>` nền. Đồ hoạ thông tin theo `talking-head-recut`; zoom, punch-in, reframe theo `hyperframes/references/motion.md` và `references/overlays.md` (skill `hyperframes-keyframes`, `hyperframes-core` chỉ còn trên máy cài HyperFrames ≤ 0.8.184). Âm thanh gốc chỉnh bằng `normalize-audio` (xem `audio-pipeline.md`).
7. **9:16.** Project riêng như bài học trong `engine-selection.md`; khung người nói đặt bằng crop/reframe thủ công theo từng đoạn (chưa có reframe theo khuôn mặt).
8. **QA.** Như `qa-checklist.md`. Thêm: chạy `cut.mjs probe` trên bản render; không còn khoảng lặng > 0,8 s ngoài chủ đích.

## Phụ đề sau khi cắt

Transcribe lại `cut.mp4` (bước 2). Whisper large-v3 nhận đúng chữ tiếng Việt nhưng mốc từ chưa đủ chính xác trong smoke (khớp 100%, lệch trung vị 0,22 s, p90 0,5 s; từ đầu câu hay bị kéo sớm vào khoảng lặng trước đó). Dùng bản chép lời làm nháp; sửa chữ và mốc bằng tay trong phụ đề trước khi render, và đưa người dùng duyệt.

Mốc gợi ý: chạy `cut.mjs probe` trên `cut.mp4`; với từ đầu mỗi đoạn `speech`, đặt start = `speech.start`. Các từ còn lại sửa theo tai.

## Chưa hỗ trợ

Reframe theo khuôn mặt, xoá từ đệm ("ừm", "à") tự động, tách người nói.
