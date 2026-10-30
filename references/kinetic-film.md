# Phương pháp kinetic-film: chữ nổ theo beat

Tài liệu này đi từ brief tới bảng beat cho style `kinetic-film` (`data/styles/kinetic-film.json`). Token, lớp và công thức GSAP nằm ở `references/styles/detail/kinetic-film.md`. Ở đây chỉ nói cách nghĩ và cách xếp chữ lên beat.

## Khi nào dùng

| Loại video | Thời lượng | Số beat (160–175 BPM) |
|---|---|---|
| Teaser | 15–25 s | 45–70 beat |
| Phim ra mắt | 40–55 s | 115–160 beat |

Ở 172 BPM một beat dài 0,35 s, nên mỗi beat chỉ đủ cho một chữ hoặc một cú đổi. Cần bản dịu hơn, 30–45 s ở 120–128 BPM, thì dùng `kinetic-typography` thay vì style này. Style này không hợp với demo giao diện, terminal hay sơ đồ dài: những thứ đó cần người xem đọc, mà ở đây không có thời gian đọc.

## Viết chữ trước

Chữ là nội dung, nhạc là đồng hồ. Viết chữ xong mới dựng hình.

1. Viết một kịch bản ngắn, rồi cắt thành 1–2 chữ mỗi beat.
2. Với tiếng Việt, đếm theo âm tiết: một cụm 4–8 âm tiết chiếm 4–9 beat.
3. Mỗi cụm mang một ý, và ý đó phải đúng. Không có cụm nào để lấp chỗ.
4. Dùng danh từ, động từ cụ thể. "Dựng 66 phong cách" mạnh hơn "trải nghiệm tuyệt vời".
5. Cứ 3–4 cụm thì có một cú rẽ: một lời phủ định ("KHÔNG CẦN TIMELINE"), một trò đùa, một con số, hoặc một cú lật nghĩa.
6. Kết bằng tên. Chỉ thẻ logo được đứng yên.

Mọi chữ trên hình vẫn qua cổng viet-pro (`ov-script`, `check-viet-pro.mjs`) như mọi dự án. Chữ ngắn không được miễn: một chữ sai dấu trên khung hình 500 px còn lộ hơn trong một câu dài.

## Bảng beat

Bảng beat là bản thiết kế của phim. Nó nằm trong `STORYBOARD.md`, mỗi cụm một dòng:

| Beat bắt đầu | Beat kết thúc | Chữ | Nền | Công thức | Cú đánh beat đầu |
|---|---|---|---|---|---|
| 0 | 4 | DỰNG | bg | `chu-dap` | hit + shake |
| 4 | 8 | VIDEO | accent | `chu-dap` | đổi nền |
| 8 | 12 | KHÔNG CẦN TIMELINE | paper | `gach-bo` | hit |
| 12 | 15 | 66 | bg | `so-lon` | riser kết |
| 16 | 24 | OPUS VIDEO | bg | `the-logo` | nhạc dừng |

Trong `PLAN.md`, cột "Blueprint/Rule" của mỗi cảnh ghi tên công thức (`chu-dap`, `gach-bo`…). Như vậy người dựng biết khối JS nào cần viết, và người duyệt so được bảng với ảnh tĩnh.

## Ánh xạ cụm câu sang công thức

| Cụm câu | Công thức |
|---|---|
| Câu mở đầu, một chữ chốt | `chu-dap` |
| Một dãy chữ dồn dập trước drop | `chuoi-cat` |
| Lời phủ định ("KHÔNG …") | `gach-bo` |
| Một con số | `so-lon` |
| Tên sản phẩm | `ten-noi` |
| Tranh hoặc ảnh sản phẩm | `tranh-day` |
| Từ đầu vào tới kết quả | `chuoi-diem` |
| Chuyển khối bằng một chữ có lỗ | `xuyen-chu` |
| Kết | `the-logo` |

Hai cụm liền nhau không dùng cùng một công thức, trừ `chu-dap`, vì đó là nhịp nền của style.

## Đặt cú drop

Thay đổi lớn nhất của phim (nền đổi sang accent lần đầu, tranh đầu tiên, tên sản phẩm) phải rơi đúng drop của nhạc.

1. Đo nhạc bằng `beat-grid.mjs` (`ov-audio`). Lệnh trả `beat0`, `beatLen` và vị trí drop.
2. Chọn beat bắt đầu phim sao cho drop rơi đúng beat đã định trong bảng. Nếu drop ở beat 64 mà bảng muốn tên sản phẩm ở beat 32, cắt nhạc vào từ beat 32.
3. Chạy `beat-fit.mjs --project .` (bản có giọng thêm `--tight`, như hướng `tu-nhac`), đọc bảng nó in, rồi chạy lại với `--apply`.

Trước drop là `chuoi-cat` và một riser. Sau drop có vòng lan và vạch tốc độ, và chỉ ở drop mới có.

## Mục tiêu năng lượng

| Số đo | Mục tiêu | Đo bằng |
|---|---|---|
| Khung gần như đứng yên | ≤ 40 % | `qc-mp4` MOTION (`still`) |
| Đoạn đứng dài nhất, ngoài 4 s cuối | ≤ 0,6 s | `qc-mp4` MOTION, cổng `motion_gate` của style |
| Số cú cắt mỗi 10 s | 9–13 | đếm trong bảng beat |

Cổng `motion_gate` của profile là `{ max_hold_s: 0.6, tail_s: 4 }`: `qc-mp4` báo FAIL khi có một đoạn khung đứng yên (YDIF < 0,5 ở 30 fps, bề ngang 360 px) dài quá 0,6 s trước 4 giây cuối. Bốn giây cuối dành cho thẻ logo. Cổng đọc `style_profile` nền và áp cho cả video, kể cả cảnh mượn lớp style khác.

Số đo hiệu chỉnh (2026-10-30): chữ Archivo 360 px phóng 2 %/s bị tính là đứng ở 22/59 khung; phóng 5 %/s thì không khung nào bị tính. Vì vậy chữ đã đáp phải tiếp tục trôi 4–6 %/s (công thức `drift`) hoặc trượt khoảng 70 px/s. Chữ đáp xong rồi đứng im là lỗi thường gặp nhất của style này.

## Hai biến thể

**Chỉ nhạc** (mặc định, hướng `tu-nhac`):

- Đo beat trước khi viết bảng.
- Nhạc tạo bằng ElevenLabs theo đúng BPM của style (drum and bass, phonk, breakbeat 160–175 BPM, có drop rõ).
- BRIEF không có `voice`. Chữ là toàn bộ nội dung.

**Có giọng:**

- Lời đọc tạo bằng ElevenLabs (`ov-audio`), qua viet-pro trước.
- Chữ rơi ở beat gần nhất với lúc từ đó được nói. Dùng `W(scene, "cụm")` để lấy thời điểm từ, rồi làm tròn về `B(n)`: `B(Math.round((W(...) - T.beat0) / T.beatLen))`.
- Nhạc nằm dưới giọng 4–7 dB, đo bằng `mix-balance.mjs`.
- Cổng 0,6 s vẫn áp dụng. Giữa hai câu đọc, máy và chữ vẫn phải chuyển động.

## Âm thanh

- Mỗi cú cắt có một tiếng: hit trên beat, whoosh khi lia, riser vào drop, tiếng phím khi gõ chữ (`typeIn`).
- Hit nằm trên nhạc, không chìm dưới nhạc.
- Nhạc dừng gắt ở cú đánh của thẻ logo. Phần còn lại của thẻ chỉ có một tiếng ngân hoặc im lặng.
- Bộ SFX tạo bằng `eleven.mjs` như mọi dự án (`ov-audio`). Không dùng dịch vụ khác.

## Kiểm như người dựng

1. Xem ảnh tĩnh ở đúng các beat trong bảng, không phải ở thời điểm ngẫu nhiên. Mỗi beat phải cho thấy một chữ hoặc một nền khác beat trước.
2. Khung cuối trước mỗi cú cắt của một cú lia vẫn phải nhoè. Khung nét căng ngay trước cú cắt nghĩa là cú lia đã dừng quá sớm.
3. Chữ không vượt 88 % bề ngang khung, và không nhỏ hơn 200 px.
4. Chạy `qc-mp4` trên bản nháp. Dòng `MOTION` ghi đoạn đứng dài nhất và trung vị chuyển động. Nếu nó FAIL, tìm đoạn đó trong bảng beat và thêm chuyển động liên tục, đừng hạ ngưỡng.

## Trường hợp biên khi dựng

- **Chữ Việt dài khi viết hoa.** "KHÔNG CẦN TIMELINE" ở 500 px tràn khung 1920. Gọi `fitWord` cho mọi chữ lớn; nếu nó cảnh báo dưới 200 px, tách cụm thành hai beat. Dấu mũ và dấu nặng làm chữ cao hơn: để `line-height` ≥ 1,05 và chừa 8 % phía trên.
- **Khổ 9:16.** Cỡ chữ tính theo `--W`, không theo 1920. Xếp cặp chữ trên dưới thay vì trái phải trong khối `html[data-ratio="9x16"]` (xem `references/engine-selection.md`). `whip` trục dọc dài hơn: đổi ±1800 thành ±2600.
- **Hình do AI vẽ.** Xem ở 100 % để tìm logo thương hiệu thật hoặc chữ rác lọt vào, trước khi đưa vào `tranh-day`.
- **Số liệu.** Không bịa. `so-lon` chỉ dùng con số người dùng đưa hoặc in ra từ nguồn (ví dụ `styles.mjs validate` in số style profile).

## Ghi nguồn cảm hứng

Ngữ pháp của style này học từ cách dựng phim chữ kinetic nhịp nhanh, trong đó có skill scenario-kinetic-film của Scenario; opus-video không dùng mã hay văn bản của skill đó.
