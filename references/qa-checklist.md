# QA checklist

Chạy cho **mỗi** file render. Ghi kết quả vào `<project>/QA.md` theo từng dòng `PASS|FAIL — mục — chi tiết`. Còn FAIL thì sửa rồi render lại, tối đa 3 vòng, sau đó dừng và hỏi người dùng.

## Đo bằng lệnh

| Mục | Lệnh | Đạt khi |
|---|---|---|
| Độ phân giải | `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 f.mp4` | `1920,1080` (16:9) hoặc `1080,1920` (9:16) |
| FPS | `ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 f.mp4` | đúng `fps` trong brief |
| Thời lượng | `ffprobe -v error -show_entries format=duration -of csv=p=0 f.mp4` | lệch ≤ 0,5 giây so với brief |
| Có audio | `ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 f.mp4` | `audio` |
| Loudness | `ffmpeg -i f.mp4 -af loudnorm=print_format=json -f null - 2>&1 \| tail -12` | `input_i` trong khoảng −16 đến −12 LUFS, `input_tp` ≤ −1 |
| Khung đen đầu/cuối | `ffmpeg -i f.mp4 -vf blackdetect=d=0.2:pix_th=0.1 -an -f null - 2>&1 \| grep black_start` | không có dòng nào ở 0s hoặc ở cuối (trừ khi brief yêu cầu). Với nền tối (vd. #0B1B2B), lệnh này báo nhầm các khung nền trống: trích khung đó ra xem; nếu chỉ là nền màu trong lúc nội dung đang hiện dần thì ghi PASS kèm ghi chú, không cần thêm nội dung chỉ để tránh cảnh báo |
| Lint/check (HyperFrames) | `hyperframes check` | exit 0 |
| Cổng viet-pro (kịch bản + caption) | `node ~/.claude/skills/opus-video/scripts/check-viet-pro.mjs --project . --stage delivery` | `PASS`, exit 0 (biên bản `## viet_pro` đủ, lint viet-pro 0 ERROR cho `script-table.md`, từng `script/NN.txt`, từng mục của `CAPTIONS.md`) |

## Xem bằng mắt

Trích 5 khung hình rải đều bằng ffmpeg (`hyperframes snapshot` không chọn được composition 9:16; với project 9:16 riêng thì dùng được `hyperframes snapshot <dir> --at T`):

```bash
mkdir -p qa && for T in 1 4 7 10 13; do ffmpeg -v error -y -ss $T -i renders/f.mp4 -frames:v 1 qa/f-$T.png; done
```

Đọc từng ảnh và kiểm tra:

- [ ] Chữ tiếng Việt đủ dấu, không lỗi font (ơ, ư, ạ, ễ, đ), không có chữ hiển thị thành ô vuông.
- [ ] Không có chữ tràn hoặc bị cắt ở mép khung.
- [ ] 9:16: không có nội dung chính trong 12% trên và 20% dưới.
- [ ] Bảng màu và font đúng `<art_direction>`, không có thứ nằm trong banned list.
- [ ] Mỗi mốc thời gian đúng cảnh như trong storyboard.
- [ ] Nghi lỗi dấu ở chữ nhỏ: `hyperframes snapshot . --at <T> --zoom "<selector hoặc x,y,w,h>"` để xem ảnh phóng to (độ phân giải gấp 3) trước khi kết luận.

## Nghe

- [ ] Phụ đề hoặc chữ trên hình lệch giọng không quá 150 ms. So `words.json` với thời điểm chữ xuất hiện trong composition.
- [ ] Giọng đọc không bị cắt đầu hoặc cuối câu, không có khoảng lặng dài hơn 0,8 giây ngoài chủ đích.
- [ ] Nhạc nền không lấn giọng. SFX trùng đúng hành động hình ảnh.
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
7. Dừng khi các cổng đều qua và: bản mới không thắng, hoặc đã tới v3, hoặc chỉ còn sửa nhỏ. Mỗi phiên bản phải sửa ít nhất một lỗi lớn.
8. Exit code của judge:
   - 3 (auth) hoặc 4 (thiếu agy): QA bằng ảnh tĩnh như các mục trên, ghi "không có giám khảo video".
   - 2: chạy lại 1 lần.
