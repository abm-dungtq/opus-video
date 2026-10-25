# Karaoke tiếng Việt, envelope giọng, mascot và HUD

Bốn lớp tuỳ chọn của composition dựng từ skeleton (`composition.mjs init`). Mặc định đều tắt, nên dự án cũ không đổi gì.

## Bật karaoke

1. Thêm thuộc tính `data-karaoke` vào thẻ `<html>` của `index.html`.
2. Chạy `node $OV/scripts/timing.mjs --project .`. Dự án có `project.json` thì chạy `gateway.mjs derive --project .`.
3. Khối TIMING có thêm `captions`: danh sách chunk `{start, end, words: [[chữ, start, end]]}`. Lớp `#cap-layer` của skeleton dựng từng chunk và cho từng từ sáng lên đúng onset của nó.

Luật chữ:

- Chữ hiển thị lấy từ chữ đã qua viet-pro. Dự án có `project.json` thì lấy `line.text`; không có thì lấy file `script/NN.txt` mà `<giọng>.gate.json` ghi. Không lấy chữ của `words.json`, vì đó là chữ ElevenLabs trả về và có thể sai dấu hay sai cách viết số.
- Chữ nguồn được tách theo khoảng trắng. Số từ phải bằng số từ trong `words.json`. Lệch thì timing in `WARN karaoke <id>: số từ chữ nguồn a khác words.json b` và dùng chữ của `words.json`. Sửa bằng cách viết lại câu cho khớp, ví dụ viết số bằng chữ như lúc đọc.
- Không tìm thấy chữ nguồn thì có `WARN karaoke <id>: không tìm thấy chữ nguồn`. Câu chưa qua cổng (`gate` khác `pass`) có WARN riêng; cổng preflight vẫn chặn render như cũ.
- Mỗi chunk tối đa 9 từ, 42 ký tự mỗi dòng, 2 dòng. Chunk kết thúc không muộn hơn lúc chunk sau bắt đầu.
- Dải chữ nằm ở đáy khung:
  - 16:9: rộng `--W` trừ 260px, chừa góc phải dưới cho chữ ký.
  - 1:1: cách đáy 64px.
  - 9:16: cách đáy `--safe-bottom` + 24px, trên vùng nút của TikTok, Reels và Shorts.
- Đổi màu, cỡ chữ hay nền hộp chữ ở CSS `.cap-box`, `.cap-w`, `.cap-w.on` và các biến `--cap-w`, `--cap-bottom`, `--cap-size`.

## Phải bật trước animatic

`render-final.mjs` so picture hash của `index.html` với hash ghi trong `DEMO.md` lúc người dùng duyệt animatic. Hash bỏ qua khối TIMING, nên đổi số liệu trong `captions` không làm mất duyệt. Thêm `data-karaoke` hay một part thì đổi DOM, tức là đổi hash. Bật karaoke sau khi duyệt thì phải làm lại animatic (`make-demo --animatic`) và xin duyệt lại.

## Envelope giọng

1. Thêm `data-voice-env` vào `<html>`, rồi chạy `timing.mjs` hoặc `derive`.
2. TIMING có thêm `env`: mỗi khung một số từ 0 đến 1, cho biết giọng to tới đâu.
   - `scripts/voice-envelope.mjs` giải mã các track giọng bằng ffmpeg (24 kHz mono), tính RMS theo khung rồi chia cho phân vị 95.
   - Kết quả được lưu ở `assets/gen/vo-envelope.json`. Chỉ tính lại khi file giọng, `data-start`, `data-media-start`, tốc độ phát, fps hay thời lượng thay đổi.
3. Trong code cảnh:
   - `envAt(t)` trả độ to tại giây `t`, bằng 0 khi chưa bật.
   - `envKeys(sel, t0, t1, step, map)` đặt keyframe theo độ to giọng. Chỉ gọi khi `T.env?.length`, ví dụ:

```js
if (T.env?.length) envKeys("#wave", W("s2", "bắt đầu"), WE("s2", "xong"), 2 / 30, (v) => ({ scaleY: 0.3 + v }));
```

Thiếu ffmpeg hay thiếu file giọng thì `env` là mảng rỗng, kèm WARN. Timing không dừng vì lỗi này. Mảng `env` nằm trong `index.html`: video 3 phút ở 30 fps thêm khoảng 25 KB, nên `hyperframes lint` dễ báo `composition_file_too_large` (chỉ là cảnh báo).

## Mascot và HUD

```bash
node $OV/scripts/composition.mjs add-part --project . --part mascot
node $OV/scripts/composition.mjs add-part --project . --part hud-counter
```

- Mỗi lệnh chèn hai phần:
  - markup đặt trước marker `<!-- PARTS:END -->` trong `#root`;
  - script đặt trước `/* PARTS:END */` của timeline chính.
- Part đã có thì exit 2. Dự án cũ không có marker cũng exit 2; khi đó chép markup và script trong `templates/composition/parts/<part>.html` vào tay.
- `mascot`:
  - tự thêm `data-voice-env`, rồi chạy lại `timing.mjs` hay `derive`;
  - miệng (`.m-mouth`) mở theo `TIMING.env` trên từng câu thoại;
  - mắt nháy mỗi 3,2 giây;
  - thân nhún (`.m-squash`) trên phách kick, nếu đã đo lưới beat;
  - vị trí đổi ở `.mascot` (`left`, `bottom`). Bản 9:16 tự nằm trên vùng an toàn đáy.
- `hud-counter`:
  - bộ đếm `01/12` ở góc phải trên;
  - sửa mảng `STEPS` (`[id cảnh, cụm từ được nói]`) và tổng trong `.hud-t`;
  - mỗi bước nhảy số đúng lúc cụm từ được nói (`W()`), nên vẫn khớp khi đổi lịch.
- Mọi mốc là giây cố định, từ được nói hoặc phách. Không dùng `Math.random`, đồng hồ hay `requestAnimationFrame`, để mỗi lần render ra giống hệt nhau.

## Chữ ký

Skeleton có khối `#sig` (chữ và nét vẽ ở góc phải dưới), mặc định bị ẩn bằng thuộc tính `hidden`. Muốn dùng: bỏ `hidden`, ghi tên lấy từ `BRIEF.md` vào `#sig-txt`. Chữ ký hiện ở giây 1, nét gạch vẽ ngay sau.

## Nguồn

Lớp karaoke, `envKeys`, chữ ký và cấu trúc lớp mascot chuyển thể từ skill motion-video của AgentKit v1.3.0 (MIT): `assets/templates/index-skeleton.html` và `references/composition-contract.md`. Code ở đây viết lại cho TIMING, `W()` và `B()` của opus-video.
