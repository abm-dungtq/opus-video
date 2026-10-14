# Chọn hướng sáng tạo và dữ liệu thật

Nhóm prompt cho bước 1b (chọn hướng bằng mắt trên 3 styleframe) và cho các video cần dữ liệu thật: tiện ích quanh một địa chỉ, số liệu từ bài báo. Cấu trúc mỗi mục giải thích ở [README.md](README.md). Cách các script hoạt động, mã thoát và lỗi thường gặp nằm ở mục 12 của [hướng dẫn chuyên sâu](../huong-dan-chuyen-sau.md).

Dự án mới luôn đi qua bước chọn hướng trước khi viết kịch bản, kể cả khi prompt không nhắc tới. Các mục dưới đây chỉ giúp bạn nói rõ điều mình muốn ở bước đó.

### 31. Làm video mới có bước chọn hướng

#### Khi nào dùng

Bạn muốn làm một video dựng mới hoàn toàn nhưng chưa hình dung được phong cách. Agent dựng 3 đoạn mẫu khoảng 3 giây bằng chính chủ đề của bạn, bạn xem rồi chọn. Muốn agent tự chọn để chạy liền thì dùng mục 33.

#### Prompt mẫu

```text
/opus-video Làm video {{khổ hình}}, {{thời lượng}} giây về {{chủ đề}}.
Người xem: {{người xem}}. Tài sản có sẵn: {{tài sản}}.
Trước khi viết kịch bản, dựng 3 styleframe theo 3 hướng khác nhau bằng chính chủ đề này, gửi tôi PITCH.md, sheet.jpg và 3 clip rồi dừng chờ tôi chọn.
Tôi chọn xong thì viết kịch bản theo ngân sách lời của hướng đó, gửi plan, rồi gửi clip nháp animatic để tôi duyệt chuyển động trước khi render bản cuối.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{khổ hình}}` | `16:9`, `9:16` hoặc `both` | `9:16` |
| `{{thời lượng}}` | Số giây | `15` |
| `{{chủ đề}}` | Video nói về gì, càng cụ thể càng tốt | `xưởng gỗ Mộc An ra mắt bàn làm việc gấp gọn cho căn hộ nhỏ` |
| `{{người xem}}` | Ai xem video | `người thuê căn hộ dưới 40 m2` |
| `{{tài sản}}` | Logo, ảnh sản phẩm, màu thương hiệu, hoặc "không" | `logo assets/logo.svg, ảnh bàn gấp và mở` |

#### Ví dụ đã điền

```text
/opus-video Làm video 9:16, 15 giây về xưởng gỗ Mộc An ra mắt bàn làm việc gấp gọn cho căn hộ nhỏ.
Người xem: người thuê căn hộ dưới 40 m2. Tài sản có sẵn: logo assets/logo.svg, ảnh bàn gấp và mở.
Trước khi viết kịch bản, dựng 3 styleframe theo 3 hướng khác nhau bằng chính chủ đề này, gửi tôi PITCH.md, sheet.jpg và 3 clip rồi dừng chờ tôi chọn.
Tôi chọn xong thì viết kịch bản theo ngân sách lời của hướng đó, gửi plan, rồi gửi clip nháp animatic để tôi duyệt chuyển động trước khi render bản cuối.
```

#### opus-video sẽ làm gì

- Điền brief tối thiểu với `brief_version: 2`, không tự điền phong cách hay hiệu ứng.
- `make-pitch.mjs init --project ./ --topic "<chủ đề>" --aspect <khổ> --category <nhóm>` chọn 3 hướng tương phản (khớp chủ đề nhất, liền mạch không cắt, táo bạo) trong 8 hướng của [creative-directions.md](../../references/creative-directions.md).
- Viết 3 styleframe theo `STYLEFRAME.md` và `RECIPES.md`, chạy `make-pitch.mjs render`. Styleframe nào gần như đứng yên (thoát 4) thì dựng lại trước khi gửi bạn.
- Gửi `PITCH.md`, `sheet.jpg` và 3 clip, rồi dừng chờ. Bạn trả lời xong, agent chạy `make-pitch.mjs choose`, BRIEF có `direction`, `word_budget` và mục `## creative_direction`.
- Kịch bản qua viet-pro đầy đủ, lời đọc không vượt `word_budget`. PLAN có `## Ý đồ sáng tạo`, mỗi beat nêu blueprint hoặc rule có thật và cách nối sang beat sau.
- Gom công thức bằng `recipe-pack.mjs`, dựng cảnh mở đầu từ styleframe bạn chọn, chụp animatic bằng `make-demo.mjs --animatic` và gửi bạn duyệt. Bản cuối render qua `render-final.mjs`, rồi `qc-mp4` kiểm cả dòng MOTION.

#### Case tham khảo

Chưa có case sát cho bước này. Hướng lấy từ `references/creative-directions.md`; case mẫu được tra ở bước 3, sau khi đã có hướng.

#### Lưu ý

- Trả lời pitch bằng một số (`2`), số kèm điều chỉnh (mục 32), hoặc `tự chọn`.
- Styleframe bạn chọn thành cảnh mở đầu của video thật.
- Có brand kit (`shared-assets/brand.json`) thì 3 styleframe dùng sẵn màu, font và logo của brand. Các hướng bạn đã cấm không xuất hiện trong pitch.

### 32. Chọn hướng kèm đổi từ khoá

#### Khi nào dùng

Agent đã gửi `PITCH.md` và bạn thích một hướng, nhưng muốn đổi một phần: cách chuyển cảnh, nhịp, tông màu, phong cách, hình chủ đạo, hiệu ứng hay âm thanh. Đây là câu trả lời gửi trong cùng phiên với mục 31.

#### Prompt mẫu

```text
Chọn {{số phương án}}, {{điều chỉnh}}.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{số phương án}}` | Số của hướng trong `PITCH.md` | `2` |
| `{{điều chỉnh}}` | Các cặp `nhóm: mã`, cách nhau bằng dấu phẩy. Nhóm là `phong cách`, `hình`, `hiệu ứng`, `chuyển cảnh`, `âm thanh`, `nhịp`, `màu`. Mã lấy trong `PITCH.md` | `chuyển cảnh: lao-xuyen-tam, nhịp: em` |

#### Ví dụ đã điền

```text
Chọn 2, chuyển cảnh: lao-xuyen-tam, nhịp: em.
```

#### opus-video sẽ làm gì

- Đổi câu trả lời thành cờ của `make-pitch.mjs choose`: `--pick 2 --transition lao-xuyen-tam --energy em`.
- Lệnh thoát 3 khi phối không hợp, ví dụ nhịp bạn chọn không phải nhịp vốn có của hướng. Agent báo bạn đúng một lần kèm lý do. Bạn vẫn giữ thì agent chạy lại với `--accept-warnings` và ghi cảnh báo đã được chấp nhận vào BRIEF.
- Mã gõ sai (không có trong danh mục) thì lệnh thoát 2; agent hỏi lại bạn mã đúng trong `PITCH.md`.

#### Case tham khảo

Chưa có case sát (việc chọn hướng, không cần tra corpus).

#### Lưu ý

- `PITCH.md` chỉ gợi ý 3 đến 4 mã mỗi nhóm. Danh sách đầy đủ ở `references/creative-directions.md`.
- Đổi nhịp thì ngân sách lời (`word_budget`) và số giây chỉ có nhạc cũng đổi theo.
- `màu: thuong-hieu` cần brand kit; chưa có thì agent báo lỗi và hỏi bạn.

### 33. Chạy không dừng, để agent tự chọn hướng

#### Khi nào dùng

Bạn cần bản nháp nhanh và chấp nhận để agent tự chọn hướng, tự ghi duyệt demo. Các cổng kiểm vẫn chạy đủ; chỉ bỏ các lần dừng chờ bạn.

#### Prompt mẫu

```text
/opus-video Làm video {{khổ hình}}, {{thời lượng}} giây về {{chủ đề}}.
Chạy không dừng: tự chọn hướng 1 trong pitch, tự duyệt plan và clip nháp, không cần hỏi tôi. Lý do: {{lý do}}.
Gửi tôi PITCH.md cùng bản render cuối để tôi xem lại các hướng còn lại.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{khổ hình}}` | `16:9`, `9:16` hoặc `both` | `16:9` |
| `{{thời lượng}}` | Số giây | `20` |
| `{{chủ đề}}` | Video nói về gì | `lãi kép khi gửi tiết kiệm hằng tháng` |
| `{{lý do}}` | Vì sao không cần duyệt từng bước | `cần bản nháp gửi nhóm trong chiều nay, sẽ làm lại nếu cần` |

#### Ví dụ đã điền

```text
/opus-video Làm video 16:9, 20 giây về lãi kép khi gửi tiết kiệm hằng tháng.
Chạy không dừng: tự chọn hướng 1 trong pitch, tự duyệt plan và clip nháp, không cần hỏi tôi. Lý do: cần bản nháp gửi nhóm trong chiều nay, sẽ làm lại nếu cần.
Gửi tôi PITCH.md cùng bản render cuối để tôi xem lại các hướng còn lại.
```

#### opus-video sẽ làm gì

- Vẫn dựng và render 3 styleframe, rồi chạy `make-pitch.mjs choose --auto`: lấy phương án 1, ghi `creative_selection: auto` vào BRIEF.
- Vẫn qua cổng viet-pro với `word_budget`, cổng plan sáng tạo, `recipe-pack.mjs`, animatic và MOTION.
- `DEMO.md` ghi `approval: auto` kèm lý do và lời của bạn, thay cho lời duyệt từng lần.
- Báo cáo cuối có `PITCH.md` để bạn xem các hướng không được chọn.

#### Case tham khảo

Chưa có case sát (việc chọn hướng, không cần tra corpus).

#### Lưu ý

- Chế độ này chỉ bỏ các lần dừng chờ. Animatic gần như đứng yên vẫn bị chặn, kịch bản vượt ngân sách lời vẫn bị chặn.
- Không thích hướng agent chọn thì gửi `Chọn {{số}}` như mục 32. Agent chạy lại `choose`, rồi viết lại kịch bản và PLAN theo hướng mới.

### 34. Video bất động sản có tiện ích thật quanh dự án

#### Khi nào dùng

Video giới thiệu lô đất, căn hộ hay một địa điểm, cần nói đúng khoảng cách tới trường, chợ, siêu thị, trạm xe, bệnh viện, công viên quanh đó. Có clip quay thực địa thì kết hợp với mục 20 trong [04-footage-that.md](04-footage-that.md).

#### Prompt mẫu

```text
/opus-video Làm video 9:16, {{thời lượng}} giây giới thiệu {{tên dự án}} tại {{vị trí}}.
Lấy tiện ích thật quanh dự án trong bán kính {{bán kính}} m bằng poi-fetch, có phút đi bộ theo đường thật. Kiểm tên nơi geocode tìm được có đúng dự án không rồi mới dùng.
Thông tin dự án: {{thông tin}}. Chỉ dùng số từ thông tin tôi đưa và từ SOURCES.md.
Gửi tôi pitch 3 hướng, rồi plan, rồi clip nháp animatic để duyệt.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{thời lượng}}` | Số giây | `30` |
| `{{tên dự án}}` | Tên lô đất, căn hộ hay dự án | `lô đất 72 m2 sổ riêng` |
| `{{vị trí}}` | Địa chỉ đầy đủ, hoặc toạ độ lấy từ bản đồ | `toạ độ 10.7725, 106.6980` |
| `{{bán kính}}` | Bán kính tìm tiện ích, tối đa 5000 | `1000` |
| `{{thông tin}}` | Diện tích, giá, pháp lý, hướng nhà... do bạn cung cấp | `72 m2, ngang 4,5 m, sổ hồng riêng, hẻm xe hơi` |

#### Ví dụ đã điền

```text
/opus-video Làm video 9:16, 30 giây giới thiệu lô đất 72 m2 sổ riêng tại toạ độ 10.7725, 106.6980.
Lấy tiện ích thật quanh dự án trong bán kính 1000 m bằng poi-fetch, có phút đi bộ theo đường thật. Kiểm tên nơi geocode tìm được có đúng dự án không rồi mới dùng.
Thông tin dự án: 72 m2, ngang 4,5 m, sổ hồng riêng, hẻm xe hơi. Chỉ dùng số từ thông tin tôi đưa và từ SOURCES.md.
Gửi tôi pitch 3 hướng, rồi plan, rồi clip nháp animatic để duyệt.
```

#### opus-video sẽ làm gì

- Pitch với `--category bat-dong-san`. Hướng A8 "Bản đồ dẫn đường bám lời nói" hợp với bản đồ và PiP.
- `poi-fetch.mjs --project ./ --lat <vĩ độ> --lon <kinh độ> --radius <m> --route` (hoặc `--address "<địa chỉ>"`). Script ghi bảng tiện ích vào `SOURCES.md` với khoảng cách đường thẳng, phút đi bộ, quãng đường đi và cách tính, ghi công OpenStreetMap vào `assets/CREDITS.md`.
- Với `--address`, agent đọc dòng `geocode … →` và so với dự án; sai nơi thì chạy lại bằng toạ độ.
- Số khoảng cách và phút trên hình lấy từ bảng đó, PLAN ghi rõ cách tính. Nơi cách dưới khoảng 50 m thì ghi "ngay cạnh" thay cho số phút.
- Phần còn lại như mục 31: kịch bản viet-pro, PLAN, `recipe-pack.mjs`, animatic, `render-final.mjs`, `qc-mp4`.

#### Case tham khảo

Chưa có case sát (`--category explainer --keyword "real estate"` không ra kết quả). Mẫu đã chạy thật nằm trong `references/clip-master-canvas.md`.

#### Lưu ý

- Đưa toạ độ thì chắc hơn địa chỉ: địa chỉ có thể bị đổi ra một nơi khác gần đó. `--address` còn cần DNS của máy phân giải được `openstreetmap.org`. Lệnh báo `network error: fetch failed` với `--address` thì gửi agent toạ độ.
- Không ghi nguồn hay nhãn rào đón lên hình. Nguồn nằm trong `SOURCES.md` và `assets/CREDITS.md`.
- Dữ liệu OpenStreetMap có thể thiếu hoặc gắn nhãn chưa đúng. Agent gửi bạn bảng tiện ích để bạn bỏ những dòng không đúng thực tế.

### 35. Tin nóng từ một bài báo

#### Khi nào dùng

Bạn có link bài báo, trang công bố hay file PDF và muốn một video tin nhanh dọc, mọi con số đúng nguồn. Tin chưa có nguồn chính thức thì chưa nên làm.

#### Prompt mẫu

```text
/opus-video Làm video tin nhanh 9:16, {{thời lượng}} giây về {{tin}}.
Nguồn: {{nguồn}}. Lấy văn bản gốc bằng source-ingest; mọi con số trong kịch bản phải trỏ về một mục trong SOURCES.md.
Không đọc lại tiêu đề báo, không dùng ảnh chụp bài báo làm nền.
Gửi tôi pitch 3 hướng trước khi viết kịch bản, rồi clip nháp animatic để duyệt.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{thời lượng}}` | Số giây, tin nhanh thường 15 đến 30 | `20` |
| `{{tin}}` | Tin nói về gì, một câu | `ngân hàng nhà nước giữ nguyên lãi suất điều hành` |
| `{{nguồn}}` | Một hay nhiều URL, file `.pdf`, hoặc `arxiv:<id>` | `https://<trang-tin>/<bai-viet>` |

#### Ví dụ đã điền

```text
/opus-video Làm video tin nhanh 9:16, 20 giây về ngân hàng nhà nước giữ nguyên lãi suất điều hành.
Nguồn: https://<trang-tin>/<bai-viet>. Lấy văn bản gốc bằng source-ingest; mọi con số trong kịch bản phải trỏ về một mục trong SOURCES.md.
Không đọc lại tiêu đề báo, không dùng ảnh chụp bài báo làm nền.
Gửi tôi pitch 3 hướng trước khi viết kịch bản, rồi clip nháp animatic để duyệt.
```

#### opus-video sẽ làm gì

- `source-ingest.mjs --project ./ <nguồn>` lưu văn bản vào `sources/<slug>.txt` và ghi một mục vào `SOURCES.md` kèm các câu có số để đọc lại. Script không tóm tắt; agent đọc bài và tự viết ý chính có trích câu gốc.
- Pitch 3 hướng, bạn chọn. Kịch bản qua viet-pro đầy đủ, có lượt kiểm chứng theo `fact-check.md`; số chính xác đặt trên hình, lời đọc dùng số tròn.
- Phần còn lại như mục 31: PLAN, `recipe-pack.mjs`, animatic, `render-final.mjs`, `qc-mp4`.

#### Case tham khảo

`y:kangaroohere-818789`, `y:l3d1c-632524` (tra bằng `--category motion --keyword news`).

#### Lưu ý

- Trang chặn truy cập tự động hay cần đăng nhập thì `source-ingest` báo lỗi HTTP. Lưu bài thành PDF rồi gửi agent đường dẫn file.
- Một nguồn lỗi không làm mất các nguồn khác; agent báo nguồn nào chưa lấy được.
- Không ghi nhãn nguồn lên hình.

### 36. Dự án chỉ cắt footage, bỏ bước chọn hướng

#### Khi nào dùng

Bạn có clip talking-head hay phỏng vấn và chỉ cần cắt gọn, thêm phụ đề, không dựng hình mới. Bước chọn hướng không có ý nghĩa ở đây, nên ghi `creative_override` thay cho bước 1b. Clip làm trục kèm nền dựng mới (bản đồ, phối cảnh) thì vẫn nên qua bước chọn hướng, xem mục 20 và mục 34.

#### Prompt mẫu

```text
/opus-video Cắt gọn clip {{clip}} thành video {{khổ hình}} khoảng {{thời lượng}} giây: bỏ đoạn ngập ngừng, ý lặp và khoảng lặng dài.
Video chỉ cắt footage, không dựng hình mới, nên bỏ bước chọn hướng: ghi creative_override vào BRIEF với lý do "{{lý do}}".
Phụ đề và chữ trên hình vẫn qua viet-pro. Gửi tôi plan và khung hình demo để duyệt trước khi render bản cuối.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{clip}}` | Đường dẫn clip gốc | `footage/raw/phong-van-chu-xuong.mp4` |
| `{{khổ hình}}` | `16:9`, `9:16` hoặc `both` | `9:16` |
| `{{thời lượng}}` | Số giây mong muốn | `60` |
| `{{lý do}}` | Ít nhất 10 ký tự, nói rõ vì sao không dựng hình mới | `chỉ cắt gọn phỏng vấn, không dựng hình mới` |

#### Ví dụ đã điền

```text
/opus-video Cắt gọn clip footage/raw/phong-van-chu-xuong.mp4 thành video 9:16 khoảng 60 giây: bỏ đoạn ngập ngừng, ý lặp và khoảng lặng dài.
Video chỉ cắt footage, không dựng hình mới, nên bỏ bước chọn hướng: ghi creative_override vào BRIEF với lý do "chỉ cắt gọn phỏng vấn, không dựng hình mới".
Phụ đề và chữ trên hình vẫn qua viet-pro. Gửi tôi plan và khung hình demo để duyệt trước khi render bản cuối.
```

#### opus-video sẽ làm gì

- Làm theo nhánh footage thật trong `references/footage-lane.md`: chép lời, `cut.mjs probe` tìm khoảng lặng an toàn, `cut.mjs apply-edl` ghép theo danh sách cắt.
- Ghi `creative_override: <lý do>` vào frontmatter BRIEF. Cổng plan và cổng final in WARN `creative gate skipped: creative_override "<lý do>"` và bỏ qua luật sáng tạo.
- Plan và khung hình demo vẫn bắt buộc; demo chụp ảnh tĩnh, không cần animatic. `qc-mp4` chỉ báo MOTION ở mức WARN, vì clip nói chuyện thường ít chuyển động.
- Phụ đề và chữ trên hình vẫn qua cổng viet-pro; bản cuối render qua `render-final.mjs`.

#### Case tham khảo

`y:sab8a-475686` (tra bằng `--category motion --keyword talking-head`).

#### Lưu ý

- Lý do ngắn hơn 10 ký tự thì cổng chặn.
- Override không dùng để lách bước chọn hướng cho video dựng hình mới. Về sau muốn dựng thêm hình thì bỏ dòng override và chạy pitch; `make-pitch.mjs choose` tự xoá dòng đó.
