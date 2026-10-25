# QA checklist

Chạy cho **mỗi** file render. Ghi kết quả vào `<project>/QA.md` theo từng dòng `PASS|FAIL — mục — chi tiết`. Còn FAIL thì sửa rồi render lại, tối đa 3 vòng, sau đó dừng và hỏi người dùng.

## Đo bằng lệnh

| Mục | Lệnh | Đạt khi |
|---|---|---|
| Độ phân giải | `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 f.mp4` | `1920,1080` (16:9) hoặc `1080,1920` (9:16) |
| FPS | `ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 f.mp4` | đúng `fps` trong brief |
| Thời lượng | `ffprobe -v error -show_entries format=duration -of csv=p=0 f.mp4` | lệch ≤ 0,5 giây so với brief |
| Có audio | `ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 f.mp4` | `audio` |
| Loudness, true peak, khung đen, đứng hình, khoảng lặng, bitrate | `node $OV/scripts/qc-mp4.mjs f.mp4 --project ./ --write-qa` (mã từng phép kiểm và ngưỡng: `--help`) | không có dòng `FAIL`, exit 0; mỗi `WARN` đã xem và ghi lý do. `BLACK_EDGE` hay báo nhầm với nền tối (vd. #0B1B2B): trích khung đó ra xem; nếu chỉ là nền màu trong lúc nội dung đang hiện dần thì ghi PASS kèm ghi chú, không cần thêm nội dung chỉ để tránh cảnh báo |
| SFX khớp sự kiện trên hình | `node $OV/scripts/sfx-sync.mjs --project . --write-qa` | không có dòng FAIL, exit 0; dòng WARN đã nghe và ghi lý do |
| Chữ trên hình khớp lời (hàng `chữ:` trong `## Sự kiện`) | `node $OV/scripts/word-sync.mjs --project ./ --write-qa` | không có dòng FAIL, exit 0 (lệch ≤ 150 ms là PASS, ≤ 250 ms là WARN); dòng WARN đã xem và ghi lý do. Dòng WARN "không có trong lời của cảnh … (TIMING)" chỉ có hai nghĩa: khối TIMING cũ hơn `words.json` (chạy lại `timing.mjs`), hoặc cụm từ vắt qua hai cảnh |
| Nhạc dưới giọng | `node $OV/scripts/mix-balance.mjs --project ./ --write-qa` | nhạc thấp hơn giọng 4–7 dB lúc có lời (PASS); WARN đã nghe và ghi lý do. `PASS … không có giọng đọc` ở dự án có lời nghĩa là track giọng không theo `vo-*`/`*-voice`/`voiceover`/`assets/voice/` (xem `audio-pipeline.md` mục 4) |
| Lint/check (HyperFrames) | `hyperframes check` | exit 0 |
| Cổng viet-pro (kịch bản + caption) | `node $OV/scripts/check-viet-pro.mjs --project . --stage delivery` | `PASS`, exit 0 (biên bản `## viet_pro` đủ, lint viet-pro 0 ERROR cho `script-table.md`, từng `script/NN.txt`, từng mục của `CAPTIONS.md`) |
| Plan + demo đã duyệt (bản giao cuối) | `node $OV/scripts/check-preflight.mjs --project . --stage final` | `PASS`, exit 0 (`PLAN.md` đủ mục, `demo/` đủ PNG mới hơn plan, `DEMO.md` có `approval:` thật). Bản giao render bằng `render-final.mjs` |

## Xem bằng mắt

Trích 5 khung hình rải đều bằng ffmpeg (`hyperframes snapshot` không chọn được composition 9:16; với project 9:16 riêng thì dùng được `hyperframes snapshot <dir> --at T`):

```bash
mkdir -p qa && for T in 1 4 7 10 13; do ffmpeg -v error -y -ss $T -i renders/f.mp4 -frames:v 1 qa/f-$T.png; done
# PowerShell: mkdir qa -Force; foreach ($T in 1,4,7,10,13) { ffmpeg -v error -y -ss $T -i renders/f.mp4 -frames:v 1 qa/f-$T.png }
```

Đọc từng ảnh và kiểm tra:

- [ ] Chữ tiếng Việt đủ dấu, không lỗi font (ơ, ư, ạ, ễ, đ), không có chữ hiển thị thành ô vuông.
- [ ] Không có chữ tràn hoặc bị cắt ở mép khung.
- [ ] 9:16: không có nội dung chính trong 12% trên và 20% dưới.
- [ ] Bảng màu và font đúng `<art_direction>`, không có thứ nằm trong banned list.
- [ ] Mỗi mốc thời gian đúng cảnh như trong storyboard.
- [ ] Nghi lỗi dấu ở chữ nhỏ: `hyperframes snapshot . --at <T> --zoom "<selector hoặc x,y,w,h>" -o snapshots/zoom` để xem ảnh phóng to (độ phân giải gấp 3) trước khi kết luận.

## Nghe

- [ ] Giọng đọc không bị cắt đầu hoặc cuối câu, không có khoảng lặng dài hơn 0,8 giây ngoài chủ đích.
- [ ] Nhạc nền không lấn giọng (số đo ở dòng `BALANCE`). SFX trùng đúng hành động hình ảnh.
- [ ] Thanh điệu tiếng Việt nghe tự nhiên. Agent không tự chấm mục này: đưa file cho người dùng nghe khi giao bản cuối.

## Vòng QA tự xem video (≤ 3 phiên bản)

`Z="seek=.05,.15,.25,.35,.45,.55,.65,.75,.85,.95"`. Mỗi phiên bản vN:
1. `hyperframes lint` exit 0.
2. Kiểm tra layout bằng `check`:
   - 16:9: `hyperframes check --frame-check --caption-zone "x0=0;y0=.82;x1=1;y1=1;severity=error;$Z"`
   - 9:16: `hyperframes check --frame-check`
   - `--at-transitions` chỉ để chẩn đoán (báo nhầm khi chữ trượt qua mask).
3. `node $OV/scripts/video-lint.mjs --hyperframes .` exit 0 (lowercase, chữ nhỏ, vùng UI che 9:16).
4. Render `renders/<name>-vN.mp4`.
5. `node $OV/scripts/judge.mjs check --video renders/<name>-vN.mp4 --hyperframes . --out qc/vN-check.json`.
   - Mỗi issue hard: mở frame trong `qc/vN-check_frames/` rồi mới quyết. Ở 540p, Gemini hay đọc nhầm dấu (ơ→đ) và chữ đang trượt qua mask, nên phải kiểm lại trên frame gốc.
   - Nếu là báo nhầm: ghi lý do và tên frame vào QA.md.
6. Từ v2: `node $OV/scripts/judge.mjs pair --a renders/<name>-vN.mp4 --b renders/<name>-vN-1.mp4 --out qc/vN-vs-prev.json`.
   - A: giữ bản mới. B: quay về bản cũ.
   - tie: giữ bản cũ, trừ khi bản mới sửa được lỗi hard.
   - invalid: **chưa so**, không tính là thua. Một lượt riêng lẻ không đáng tin vì Gemini thiên vị video đưa vào trước.
   - Muốn xem tận mắt hai phiên bản cạnh nhau (không cần Gemini, cần giữ bản sao thư mục project cũ): `hyperframes compare <dir-cũ> <dir-mới> --at <T> --labels cu,moi --out qc/compare-vN.png`.
7. Tuỳ chọn, chỉ quan sát: `node $OV/scripts/judge.mjs score --video renders/<name>-vN.mp4 --hyperframes . --runs 3 [--style <style_profile>] --out qc/vN-score.json`.
   - 7 tiêu chí 1–10 (5 bài sinh viên, 7 chuyên nghiệp, 8 agency, 9 vào vòng giải), trung vị 3 lượt, `spread` là độ dao động.
   - Không chặn render. Chưa dùng điểm để so phiên bản: Gemini dao động, xem `spread` và `unstable` trước khi tin một tiêu chí.
   - `fixes` có mốc giây và số cụ thể; chọn tối đa 5 fix đưa vào REVISIONS.md theo mẫu `references/revisions.md`.
8. Dừng khi các cổng đều qua và: bản mới không thắng, hoặc đã tới v3, hoặc chỉ còn sửa nhỏ. Mỗi phiên bản phải sửa ít nhất một lỗi lớn.
9. Exit code của judge:
   - 3 (auth) hoặc 4 (thiếu agy): QA bằng ảnh tĩnh như các mục trên, ghi "không có giám khảo video".
   - 2: chạy lại 1 lần.
