# opus-video, xưởng phim gói gọn trong một thư mục skill

Bạn gõ một câu: "làm video 60 giây giới thiệu sản phẩm, cả 16:9 và 9:16". Khi quy trình khép lại, trong thư mục dự án có hai file MP4 đã render, một kịch bản tiếng Việt đã qua biên tập, bộ khung hình demo bạn đã duyệt, biên bản QA và sẵn caption cho Facebook và TikTok.

opus-video là skill điều phối biến agent lập trình thành một xưởng làm video. Nó không thay thế công cụ nào. Nó bắt các công cụ tốt nhất làm việc theo đúng thứ tự và không cho bước sau chạy khi bước trước chưa đạt.

## Đứng trên 813 video

Mỗi lựa chọn dựng hình bắt đầu từ dữ liệu. Skill mang theo chỉ mục 813 video làm bằng Opus 5.5, lấy từ hai bộ sưu tập mã nguồn mở có giấy phép MIT, kèm prompt gốc và link tác giả. Trước khi viết storyboard, agent tra những case gần nhất với brief của bạn. Nếu có key TypeSafe Jev, khoảng 740 case có prompt đầy đủ được xếp hạng theo loại video, chủ đề và phong cách hình ảnh, trong khoảng một giây với chi phí khoảng 0,03 USD. Không có key, skill tự quay về tra theo nhóm và từ khoá, quy trình vẫn chạy tiếp.

Từ case mẫu, agent chọn kỹ thuật dựng cụ thể trong thư viện pattern: blueprint, preset, hiệu ứng có sẵn trong catalog HyperFrames. Hình ảnh vì thế có cấu trúc đã được kiểm chứng, không phải ngẫu hứng.

## Kịch bản tiếng Việt viết như người làm nghề

Lời đọc là thứ người xem nghe đầu tiên, nên opus-video giao phần này cho viet-pro ở mức đầy đủ. Agent đọc hết bộ quy tắc biên tập, soạn bảng ba cột (thời điểm, lời đọc, hình ảnh), rà 25 dấu hiệu văn máy và ghi lại từng chỗ đã sửa. Sau đó nó đối chiếu để tên riêng, con số, đường link không bị đổi trong lúc sửa, rồi chạy lint tiếng Việt.

Cổng này có tính cưỡng chế. Kịch bản chưa đạt thì script ElevenLabs từ chối tạo giọng. Lời đọc khác với bản đã duyệt cũng bị chặn. Mỗi file giọng mang dấu kiểm tra riêng, nên lúc giao không thể lọt một câu chưa qua biên tập.

## Âm thanh, hình ảnh và hai khổ hình

Giọng đọc dùng ElevenLabs `eleven_v4`, có tiếng Việt và mốc thời gian đến từng từ để chữ trên hình khớp với lời. SFX và nhạc nền cũng sinh từ ElevenLabs hoặc lấy từ catalog có giấy phép, nguồn ghi vào `assets/CREDITS.md`.

Phần dựng mặc định chạy trên HyperFrames, chuyển sang Remotion hoặc Canvas khi dự án cần. Với video cần cả 16:9 lẫn 9:16, bản dọc được dàn lại bố cục từ đầu thay vì cắt xén bản ngang, có tính tới vùng giao diện của TikTok và Reels che mất.

## Không có bản cuối nào ra đời mà bạn chưa thấy trước

Phiên bản mới thêm hai cổng trước khi render bản giao. Thứ nhất là `PLAN.md`: mục tiêu, bảng cảnh, âm thanh, engine, các mốc cần xem và tiêu chí QA, được kiểm tra trước khi tạo giọng và dựng. Thứ hai là khung hình demo: agent chụp đúng các mốc trong plan, tự soát chữ, dấu và vùng an toàn, rồi gửi bạn duyệt. Lời đồng ý của bạn được ghi vào `DEMO.md`.

Bản giao cuối chỉ có một đường ra là `render-final.mjs`. Thiếu plan, thiếu demo, demo cũ hơn plan hay chưa có lời duyệt thì lệnh dừng lại và nói rõ thiếu gì.

## QA bằng mắt máy và mắt người

Sau mỗi lần render, agent đo độ phân giải, khung hình, độ ồn, khung đen, rồi kiểm chữ bị ép thường, chữ quá nhỏ và nội dung lấn vùng UI ở khổ dọc. Nếu máy có `agy`, Gemini xem bản 540p và chấm điểm, từ vòng thứ hai còn so phiên bản mới với bản cũ. Tối đa ba vòng sửa. Những gì cần tai người, như giọng và thanh điệu, skill nói thẳng là bạn tự nghe.

## Chạy ở đâu cũng được

opus-video chạy trên Claude Code, OpenAI Codex, Google Antigravity (app và CLI) và mọi agent đọc được thư mục skill, trên macOS, Linux, WSL và Windows. Một lệnh cài đặt kéo về viet-pro, HyperFrames CLI cùng 20 skill HyperFrames, tạo file key mẫu, rồi `setup-check` xác nhận máy đã sẵn sàng hoặc chỉ ra lệnh sửa cho từng mục còn thiếu. Bộ test hiện có 126 ca, tất cả đều đạt.

Ngoài video dựng mới, skill còn nhánh footage thật (beta): tìm khoảng lặng an toàn trong clip quay sẵn, ghép theo danh sách cắt, rồi thêm phụ đề và đồ hoạ.

## Ranh giới rõ ràng

Skill không tự đăng video hay caption lên mạng xã hội. Key không bao giờ bị in ra. Prompt trong corpus thuộc về tác giả gốc và chỉ dùng để học cấu trúc. Mã nguồn phát hành theo giấy phép MIT.

Từ một câu yêu cầu đến MP4 đã duyệt, mỗi bước đều để lại bằng chứng trong thư mục dự án. Bạn đọc lại được kịch bản đã sửa thế nào, khung hình nào đã được duyệt và bản cuối đã qua những lần kiểm tra nào.

Cài đặt: xem [README.md](../README.md) và [hướng dẫn cài cho từng agent](cai-dat-agent.md).
