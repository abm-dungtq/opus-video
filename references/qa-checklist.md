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
