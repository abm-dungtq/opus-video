# Footage thật

Nhóm prompt cho clip quay thật: talking-head, phỏng vấn, clip đi thực địa. Lời nói là của người trong clip, nên các dự án ở đây thường đặt `voice_source: clip` trong `BRIEF.md`. Quy trình gốc ở [footage-lane.md](../../references/footage-lane.md) và [clip-master-canvas.md](../../references/clip-master-canvas.md). Nhánh footage đang ở trạng thái beta. Cấu trúc mỗi mục giải thích ở [README.md](README.md).

Clip của bạn là nội dung thật. Agent không gắn nhãn rào đón lên hình; `video-lint` báo `HEDGE_LABEL` ở mức ERROR với dự án `voice_source: clip`.

### 17. Cắt gọn talking-head

#### Khi nào dùng

Bạn có một clip nói trước máy quay còn nhiều chỗ ngập ngừng, câu hỏng, khoảng lặng dài. Bạn muốn một bản gọn có phụ đề. Không cần đồ hoạ nhiều; cần thẻ đồ hoạ thì chọn mục 18.

#### Prompt mẫu

```text
/opus-video Cắt gọn clip {{đường dẫn clip}} thành bản khoảng {{thời lượng}} giây, khổ {{khổ hình}}.
Giữ các ý: {{ý cần giữ}}. Bỏ: {{phần bỏ}}.
Chỉ cắt ở khoảng lặng an toàn, giữ thứ tự kể. Gửi tôi danh sách đoạn cắt để duyệt trước khi ghép.
Thêm phụ đề tiếng Việt từ bản chép lời; chỗ máy nghe sai thì lập bảng sửa cho tôi duyệt, chỗ không rõ thì bỏ phụ đề, không đoán.
Gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{đường dẫn clip}}` | Clip gốc, nên đặt trong `footage/raw/` | `footage/raw/gioi-thieu.mp4` |
| `{{thời lượng}}` | Độ dài mong muốn | `60` |
| `{{khổ hình}}` | `16:9`, `9:16` hoặc `both` | `9:16` |
| `{{ý cần giữ}}` | Các ý chính | `giới thiệu bản thân, ba dịch vụ, cách liên hệ` |
| `{{phần bỏ}}` | Những gì bỏ | `câu nói lại, đoạn chào đầu dài` |

#### Ví dụ đã điền

```text
/opus-video Cắt gọn clip footage/raw/gioi-thieu.mp4 thành bản khoảng 60 giây, khổ 9:16.
Giữ các ý: giới thiệu bản thân, ba dịch vụ, cách liên hệ. Bỏ: câu nói lại, đoạn chào đầu dài.
Chỉ cắt ở khoảng lặng an toàn, giữ thứ tự kể. Gửi tôi danh sách đoạn cắt để duyệt trước khi ghép.
Thêm phụ đề tiếng Việt từ bản chép lời; chỗ máy nghe sai thì lập bảng sửa cho tôi duyệt, chỗ không rõ thì bỏ phụ đề, không đoán.
Gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### opus-video sẽ làm gì

- `ffprobe` clip, chuẩn hoá nếu là fps thay đổi hoặc HDR 10-bit.
- Chép lời local bằng `hyperframes transcribe … -e whisper -m large-v3 -l vi`.
- `cut.mjs probe` tìm khoảng lặng, agent viết `edl.json`, `cut.mjs apply-edl` ghép ra `cut.mp4`.
- Chép lời lại trên `cut.mp4`, dựng phụ đề qua `captions-from-transcript.mjs`, `script/captions.txt` qua cổng viet-pro.
- QA thêm một lần `cut.mjs probe` trên bản render để chắc không còn khoảng lặng quá 0,8 giây ngoài chủ đích.

#### Case tham khảo

`y:sab8a-475686` (tra bằng `--category motion --keyword talking-head`).

#### Lưu ý

- Chưa hỗ trợ xoá từ đệm tự động, reframe theo khuôn mặt hay tách người nói.
- Mốc từ của Whisper có thể lệch; agent sửa mốc phụ đề bằng tay và đưa bạn duyệt.

### 18. Talking-head kèm thẻ đồ hoạ

#### Khi nào dùng

Clip nói trước máy quay đã ổn, bạn muốn thêm tiêu đề động, lower-third, thẻ số liệu, trích dẫn hoặc khung PiP đồng bộ với lời nói, clip chạy nguyên bên dưới.

#### Prompt mẫu

```text
/opus-video Thêm thẻ đồ hoạ cho clip {{đường dẫn clip}}, khổ {{khổ hình}}.
Người nói: {{tên và chức danh}}. Các thẻ cần có: {{danh sách thẻ}}.
Mỗi thẻ hiện đúng lúc người nói nhắc tới. Số trên thẻ chỉ lấy từ lời nói hoặc từ {{nguồn số}}.
Bảng màu {{mã màu}}, font {{font}}. Phụ đề: {{có hoặc không}}.
Gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{đường dẫn clip}}` | Clip đã cắt hoặc clip gốc | `footage/cut/phong-van-cut.mp4` |
| `{{khổ hình}}` | `16:9`, `9:16` hoặc `both` | `16:9` |
| `{{tên và chức danh}}` | Cho lower-third | `Chị Lan, chủ tiệm bánh` |
| `{{danh sách thẻ}}` | Loại thẻ | `lower-third tên, thẻ số liệu doanh thu, trích dẫn câu chốt` |
| `{{nguồn số}}` | Brief hoặc tài liệu kèm | `BRIEF.md` |
| `{{mã màu}}` | 3 đến 4 màu | `#FFF8F0, #3A2E2A, #E07A5F` |
| `{{font}}` | Font có dấu tiếng Việt | `Be Vietnam Pro` |
| `{{có hoặc không}}` | Có phụ đề hay không | `có` |

#### Ví dụ đã điền

```text
/opus-video Thêm thẻ đồ hoạ cho clip footage/cut/phong-van-cut.mp4, khổ 16:9.
Người nói: Chị Lan, chủ tiệm bánh. Các thẻ cần có: lower-third tên, thẻ số liệu doanh thu, trích dẫn câu chốt.
Mỗi thẻ hiện đúng lúc người nói nhắc tới. Số trên thẻ chỉ lấy từ lời nói hoặc từ BRIEF.md.
Bảng màu #FFF8F0, #3A2E2A, #E07A5F, font Be Vietnam Pro. Phụ đề: có.
Gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### opus-video sẽ làm gì

- Workflow HyperFrames `talking-head-recut` cho thẻ đồ hoạ; zoom, punch-in theo `hyperframes-keyframes` (bước 6 của `footage-lane.md`).
- `voice_source: clip`: mọi chuỗi trên thẻ ghi vào `script/on-screen.txt`, phụ đề vào `script/captions.txt`, cả hai qua cổng viet-pro.
- Thẻ kỹ thuật: Thẻ 7 (mask reveal cho thẻ), Thẻ 8.
- Âm thanh gốc chỉnh mức bằng `hyperframes normalize-audio`.

#### Case tham khảo

`y:sab8a-475686` (tra bằng `--category motion --keyword talking-head`).

#### Lưu ý

- Thẻ không được che mặt người nói. Bản 9:16 đặt khung người nói bằng crop thủ công theo từng đoạn.
- Trích dẫn giữ đúng lời người nói, phụ đề chỉ sửa chỗ máy nghe sai.

### 19. Ghép phỏng vấn từ nhiều clip

#### Khi nào dùng

Bạn có nhiều clip (nhiều người, nhiều lần quay) và muốn ghép thành một video theo một mạch kể, có danh sách cắt để duyệt lại.

#### Prompt mẫu

```text
/opus-video Ghép các clip {{danh sách clip}} thành video {{thời lượng}} giây, khổ {{khổ hình}}.
Mạch kể: {{mạch kể}}.
Chép lời từng clip, đề xuất danh sách cắt (EDL) theo mạch kể, chỉ cắt ở khoảng lặng an toàn, gửi tôi duyệt trước khi ghép.
Clip nào lệch fps hay màu thì chuẩn hoá trước. Thêm lower-third tên người nói: {{tên người nói}}.
Gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{danh sách clip}}` | Các file nguồn | `footage/raw/a.mp4, footage/raw/b.mp4, footage/raw/c.mp4` |
| `{{thời lượng}}` | Độ dài | `90` |
| `{{khổ hình}}` | `16:9`, `9:16` hoặc `both` | `16:9` |
| `{{mạch kể}}` | Thứ tự ý | `vấn đề khách gặp, cách đội xử lý, kết quả` |
| `{{tên người nói}}` | Tên và vai trò từng người | `anh Minh (kỹ thuật), chị Hoa (khách hàng)` |

#### Ví dụ đã điền

```text
/opus-video Ghép các clip footage/raw/a.mp4, footage/raw/b.mp4, footage/raw/c.mp4 thành video 90 giây, khổ 16:9.
Mạch kể: vấn đề khách gặp, cách đội xử lý, kết quả.
Chép lời từng clip, đề xuất danh sách cắt (EDL) theo mạch kể, chỉ cắt ở khoảng lặng an toàn, gửi tôi duyệt trước khi ghép.
Clip nào lệch fps hay màu thì chuẩn hoá trước. Thêm lower-third tên người nói: anh Minh (kỹ thuật), chị Hoa (khách hàng).
Gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### opus-video sẽ làm gì

- `cut.mjs probe` cho từng clip, `edl.json` có nhiều nguồn trong `sources`, `cut.mjs apply-edl` ghép bằng một lần encode. `cut.mjs` được khuyên dùng khi có nhiều nguồn hoặc cần EDL để duyệt lại.
- Thoát 2 nghĩa là nguồn lệch fps, màu hoặc là HDR 10-bit; agent chuẩn hoá bằng ffmpeg rồi chạy lại.
- Lower-third theo `talking-head-recut`, chuỗi chữ qua cổng viet-pro.

#### Case tham khảo

Chưa có case sát (`--category story-music --keyword interview` không ra kết quả).

#### Lưu ý

- Chưa có tách người nói tự động. Bạn cho biết ai nói ở clip nào để agent gắn tên đúng.
- Mỗi đoạn trong EDL bắt đầu và kết thúc trong một khoảng lặng, nên độ dài cuối có thể lệch vài giây so với mong muốn.

### 20. Clip thực địa bất động sản trong khung PiP trên bản đồ

#### Khi nào dùng

Bạn quay clip đi thực địa giới thiệu lô đất, nhà, quán hay điểm du lịch, có lời nói sẵn. Video đặt clip trong khung nhỏ trên nền bản đồ hoặc sơ đồ dựng mới, hiệu ứng (pin, tuyến đường, khoanh lô, thẻ số liệu) bám đúng từng chữ người nói.

#### Prompt mẫu

```text
/opus-video Dựng video từ clip thực địa {{đường dẫn clip}}, khổ {{khổ hình}}, clip đặt trong khung PiP trên nền bản đồ khu vực.
Đây là nội dung thật của tôi. Thông tin tin đăng: {{thông tin tin đăng}}.
Các điểm cần có trên bản đồ: {{điểm trên bản đồ}}.
Mỗi ý tôi nói kích một hiệu ứng đúng lúc: pin, tuyến đường, khoanh lô, thẻ số liệu. Số trên hình chỉ lấy từ lời tôi nói, chữ trong clip hoặc thông tin trên.
Phụ đề từ bản chép lời, bảng sửa chỗ máy nghe sai gửi tôi duyệt.
Gửi tôi bản nháp và khung hình demo để duyệt trước khi render bản cuối.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{đường dẫn clip}}` | Clip gốc | `footage/raw/lo-dat.mp4` |
| `{{khổ hình}}` | `16:9`, `9:16` hoặc `both` | `9:16` |
| `{{thông tin tin đăng}}` | Giá, diện tích, pháp lý, vị trí | `lô 72m², gần chợ Diên An, đường ô tô vào tận nơi` |
| `{{điểm trên bản đồ}}` | Địa điểm, tiện ích xung quanh | `chợ Diên An, trường tiểu học, trục đường chính` |

#### Ví dụ đã điền

```text
/opus-video Dựng video từ clip thực địa footage/raw/lo-dat.mp4, khổ 9:16, clip đặt trong khung PiP trên nền bản đồ khu vực.
Đây là nội dung thật của tôi. Thông tin tin đăng: lô 72m², gần chợ Diên An, đường ô tô vào tận nơi.
Các điểm cần có trên bản đồ: chợ Diên An, trường tiểu học, trục đường chính.
Mỗi ý tôi nói kích một hiệu ứng đúng lúc: pin, tuyến đường, khoanh lô, thẻ số liệu. Số trên hình chỉ lấy từ lời tôi nói, chữ trong clip hoặc thông tin trên.
Phụ đề từ bản chép lời, bảng sửa chỗ máy nghe sai gửi tôi duyệt.
Gửi tôi bản nháp và khung hình demo để duyệt trước khi render bản cuối.
```

#### opus-video sẽ làm gì

- Theo `clip-master-canvas.md`: `BRIEF.md` đặt `voice_source: clip` và `duration_s` bằng độ dài clip; chép lời, lập `captions.fixes.json`, chạy `captions-from-transcript.mjs`.
- `PLAN.md` viết ngay sau bản chép lời, mỗi ý người nói một dòng cảnh.
- Dữ liệu điểm, tuyến, lô, thẻ số liệu ghi trong `facts.js`, mỗi mục có trường `source`; nền bản đồ sinh từ chính file đó để vị trí luôn khớp.
- Thẻ kỹ thuật: Thẻ 9 (bản đồ, vị trí bám lời người nói). Bố cục 9:16 theo bảng đã kiểm trong `clip-master-canvas.md`.
- Demo cắt từ bản nháp bạn đã xem bằng `make-demo.mjs --from-video`.

#### Case tham khảo

Chưa có case sát (`--category explainer --keyword "real estate"` không ra kết quả). Mẫu đã chạy thật nằm trong `clip-master-canvas.md`.

#### Lưu ý

- Số thật hiện ngay giá trị cuối; số đếm lên dễ làm hiện số trung gian sai.
- Agent không tự tính khoảng cách trên sơ đồ vẽ tay, không thêm la bàn hay thước tỉ lệ khi không biết hướng và tỉ lệ thật.
- Thường không cần nhạc nền vì clip đã có tiếng hiện trường; SFX nhỏ dưới giọng gốc.

### 21. Phụ đề karaoke cho clip có lời nói

#### Khi nào dùng

Bạn chỉ cần phụ đề nằm trong video, chữ sáng lên theo từng từ người nói, không cắt clip hay thêm đồ hoạ khác.

#### Prompt mẫu

```text
/opus-video Thêm phụ đề tiếng Việt kiểu karaoke cho clip {{đường dẫn clip}}, khổ {{khổ hình}}: từ đang nói sáng màu {{màu nhấn}}.
Phụ đề lấy từ bản chép lời; lập bảng sửa chỗ máy nghe sai cho tôi duyệt, chỗ không rõ thì bỏ trống.
Mỗi cụm tối đa {{số chữ}} chữ, chia theo nghĩa. Dải phụ đề nằm trong vùng an toàn, không che mặt.
Gửi tôi bảng duyệt phụ đề, plan và khung hình demo trước khi render bản cuối.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{đường dẫn clip}}` | Clip có lời nói | `footage/cut/chia-se.mp4` |
| `{{khổ hình}}` | `16:9`, `9:16` hoặc `both` | `9:16` |
| `{{màu nhấn}}` | Màu từ đang nói | `#FFD23F` |
| `{{số chữ}}` | Số chữ tối đa mỗi cụm | `6` |

#### Ví dụ đã điền

```text
/opus-video Thêm phụ đề tiếng Việt kiểu karaoke cho clip footage/cut/chia-se.mp4, khổ 9:16: từ đang nói sáng màu #FFD23F.
Phụ đề lấy từ bản chép lời; lập bảng sửa chỗ máy nghe sai cho tôi duyệt, chỗ không rõ thì bỏ trống.
Mỗi cụm tối đa 6 chữ, chia theo nghĩa. Dải phụ đề nằm trong vùng an toàn, không che mặt.
Gửi tôi bảng duyệt phụ đề, plan và khung hình demo trước khi render bản cuối.
```

#### opus-video sẽ làm gì

- Chép lời bằng Whisper `large-v3`, lập `captions.fixes.json` (`fix`, `unclear`, `ranges` để chia cụm theo nghĩa), chạy `captions-from-transcript.mjs`. File `assets/fx/captions.js` có mốc từng từ để làm hiệu ứng sáng theo từ.
- Workflow HyperFrames `embedded-captions` để chọn kiểu phụ đề.
- `script/captions.txt` qua cổng viet-pro; `video-lint` kiểm vùng an toàn 9:16 và cỡ chữ.

#### Case tham khảo

`y:sab8a-475686` (tra bằng `--category motion --keyword subtitle`). Tra `--keyword karaoke` không ra kết quả.

#### Lưu ý

- Khi script báo cụm một chữ, agent chia lại bằng `ranges` thay vì để nguyên.
- Viết tắt và tên riêng giữ chữ hoa; caption skin có kiểu chữ thường phải được sửa về `none`.
