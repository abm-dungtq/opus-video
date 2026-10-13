# Thư viện prompt mẫu cho opus-video

Thư viện này gom các câu giao việc mẫu để bạn dán thẳng cho agent đã cài opus-video. Mỗi prompt đã được viết để agent đi đủ quy trình của skill: kịch bản qua viet-pro, plan, khung hình demo cho bạn duyệt, render bản giao qua `render-final.mjs`, QA và caption. Bạn chỉ cần thay các chỗ `{{biến}}` bằng thông tin thật của mình.

Muốn hiểu từng bước agent sẽ làm, đọc [hướng dẫn chuyên sâu](../huong-dan-chuyen-sau.md). Quy trình gốc nằm ở [SKILL.md](../../SKILL.md).

## Cách dùng

1. Chọn prompt trong bảng mục lục ở cuối trang theo loại video bạn cần.
2. Chép khối "Prompt mẫu" và thay mọi `{{biến}}`. Bảng biến ngay dưới prompt giải thích từng biến và cho ví dụ. Biến nào bạn chưa có thì xoá cả cụm đó, agent sẽ tự đề xuất và ghi rõ là đề xuất.
3. Dán vào agent. Prompt mẫu mở đầu bằng `/opus-video` theo cú pháp Claude Code. Codex dùng `$opus-video`; agent khác thì mở đầu bằng "Dùng skill opus-video để" (xem mục 6 của [README.md](../../README.md)).
4. Trả lời khi agent hỏi chủ đề, khổ hình hoặc thời lượng còn thiếu, rồi duyệt plan và khung hình demo khi agent gửi.

Khổ hình chỉ nhận ba giá trị: `16:9`, `9:16` hoặc `both`. Với `both`, bản dọc được dàn lại bố cục chứ không cắt từ bản ngang.

## Cấu trúc mỗi mục

Mọi mục trong thư viện dùng chung một khung cố định để dễ tra:

| Phần | Nội dung |
|---|---|
| Tên | Tiêu đề của mục |
| Khi nào dùng | Tình huống hợp với prompt này, kèm gợi ý khi nào nên chọn mục khác |
| Prompt mẫu | Khối chép dán, các chỗ cần điền viết dạng `{{biến}}` |
| Bảng biến | Tên biến, ý nghĩa, ví dụ |
| Ví dụ đã điền | Cùng prompt với biến đã thay bằng nội dung cụ thể |
| opus-video sẽ làm gì | Workflow HyperFrames, thẻ kỹ thuật trong [pattern-library.md](../../references/pattern-library.md) và các bước, cổng chính |
| Case tham khảo | Id case thật lấy bằng `find-cases.mjs`, kèm câu lệnh đã chạy. Không có kết quả phù hợp thì ghi "chưa có case sát" |
| Lưu ý | Điểm dễ sai, giới hạn của skill |

Id case được tra bằng `node $OV/scripts/find-cases.mjs --category <nhóm> --keyword <từ khoá> --limit 3`. Agent sẽ tự tra lại theo brief của bạn ở bước 3, nên id ở đây chỉ để bạn xem trước phong cách. Prompt trong corpus thuộc về tác giả gốc.

## Nguyên tắc chung cho mọi prompt

Các prompt trong thư viện tuân theo mấy nguyên tắc dưới đây. Khi bạn tự viết prompt mới, giữ đúng các nguyên tắc này:

- Không yêu cầu bỏ cổng viet-pro, bỏ plan hay bỏ bước duyệt khung hình demo. Muốn agent chạy liền không dừng hỏi thì nói rõ điều đó; agent sẽ ghi lời của bạn vào `DEMO.md` thay cho lời duyệt.
- Nội dung bạn đưa (clip, ảnh, số liệu) là nội dung thật, nên prompt không yêu cầu gắn nhãn rào đón lên hình hay dòng tuyên bố kiểu video độc lập. Số liệu vẫn chỉ lấy từ nguồn bạn đưa hoặc nguồn agent kiểm chứng được.
- Không dùng câu mồi tương tác (kêu gọi like, share, follow, comment để nhận quà). Kết bằng một dữ kiện hoặc một hành động cụ thể khi brief cần.
- Không yêu cầu agent kể trải nghiệm ngôi thứ nhất mà bạn không cung cấp. Nếu có trải nghiệm thật, ghi nó vào prompt.
- Khổ hình là `16:9`, `9:16` hoặc `both`.

## Mục lục

### Tạo mới hoàn toàn

| # | Tên | File |
|---|---|---|
| 1 | Intro thương hiệu, logo sting | [01-tao-moi-motion-explainer.md](01-tao-moi-motion-explainer.md) |
| 2 | Showreel thương hiệu cắt theo nhạc | [01-tao-moi-motion-explainer.md](01-tao-moi-motion-explainer.md) |
| 3 | Explainer giải thích một khái niệm | [01-tao-moi-motion-explainer.md](01-tao-moi-motion-explainer.md) |
| 4 | Explainer phản bác một ngộ nhận | [01-tao-moi-motion-explainer.md](01-tao-moi-motion-explainer.md) |
| 5 | Explainer xoay quanh một con số | [01-tao-moi-motion-explainer.md](01-tao-moi-motion-explainer.md) |
| 6 | Promo phần mềm với UI và con trỏ | [02-tao-moi-san-pham-chu-nhac-3d.md](02-tao-moi-san-pham-chu-nhac-3d.md) |
| 7 | Quảng cáo nhiều biến thể từ một mẫu | [02-tao-moi-san-pham-chu-nhac-3d.md](02-tao-moi-san-pham-chu-nhac-3d.md) |
| 8 | Kinetic typography cho một câu nói | [02-tao-moi-san-pham-chu-nhac-3d.md](02-tao-moi-san-pham-chu-nhac-3d.md) |
| 9 | Music video, lyric video theo beat | [02-tao-moi-san-pham-chu-nhac-3d.md](02-tao-moi-san-pham-chu-nhac-3d.md) |
| 10 | Câu chuyện ngắn có lời dẫn | [02-tao-moi-san-pham-chu-nhac-3d.md](02-tao-moi-san-pham-chu-nhac-3d.md) |
| 11 | Vật thể hoặc không gian 3D | [02-tao-moi-san-pham-chu-nhac-3d.md](02-tao-moi-san-pham-chu-nhac-3d.md) |

### Từ nguồn có sẵn

| # | Tên | File |
|---|---|---|
| 12 | Pull request GitHub thành video | [03-tu-nguon-co-san.md](03-tu-nguon-co-san.md) |
| 13 | URL sản phẩm thành video ra mắt | [03-tu-nguon-co-san.md](03-tu-nguon-co-san.md) |
| 14 | Bài viết thành faceless explainer | [03-tu-nguon-co-san.md](03-tu-nguon-co-san.md) |
| 15 | Chủ đề thành video liệt kê hoặc hướng dẫn | [03-tu-nguon-co-san.md](03-tu-nguon-co-san.md) |
| 16 | Bộ ảnh thành slideshow theo nhạc | [03-tu-nguon-co-san.md](03-tu-nguon-co-san.md) |

### Footage thật

| # | Tên | File |
|---|---|---|
| 17 | Cắt gọn talking-head | [04-footage-that.md](04-footage-that.md) |
| 18 | Talking-head kèm thẻ đồ hoạ | [04-footage-that.md](04-footage-that.md) |
| 19 | Ghép phỏng vấn từ nhiều clip | [04-footage-that.md](04-footage-that.md) |
| 20 | Clip thực địa bất động sản trong khung PiP trên bản đồ | [04-footage-that.md](04-footage-that.md) |
| 21 | Phụ đề karaoke cho clip có lời nói | [04-footage-that.md](04-footage-that.md) |

### Video dọc cho mạng xã hội

| # | Tên | File |
|---|---|---|
| 22 | Tin nhanh dọc | [05-doc-mang-xa-hoi.md](05-doc-mang-xa-hoi.md) |
| 23 | Giải thích ngắn theo ngách, 60 đến 90 giây | [05-doc-mang-xa-hoi.md](05-doc-mang-xa-hoi.md) |
| 24 | Làm thêm bản dọc cho video ngang đã có | [05-doc-mang-xa-hoi.md](05-doc-mang-xa-hoi.md) |

### Vận hành sau khi dựng

| # | Tên | File |
|---|---|---|
| 25 | Sửa một câu lời đọc | [06-van-hanh-sau-dung.md](06-van-hanh-sau-dung.md) |
| 26 | Đổi nhạc nền hoặc SFX | [06-van-hanh-sau-dung.md](06-van-hanh-sau-dung.md) |
| 27 | Xuất lại bản nén để giao | [06-van-hanh-sau-dung.md](06-van-hanh-sau-dung.md) |
| 28 | Viết caption Facebook và TikTok | [06-van-hanh-sau-dung.md](06-van-hanh-sau-dung.md) |
| 29 | QC trước khi giao | [06-van-hanh-sau-dung.md](06-van-hanh-sau-dung.md) |
| 30 | Dọn file sau khi có bản final | [06-van-hanh-sau-dung.md](06-van-hanh-sau-dung.md) |
