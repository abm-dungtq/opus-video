# Video dọc cho mạng xã hội

Nhóm prompt cho TikTok, Reels, Shorts. Kịch bản vẫn đi qua viet-pro đầy đủ, cộng thêm luật kênh ngắn trong [SKILL.md](../../SKILL.md): hook 1 đến 3 giây vào thẳng ý, một video một insight, giọng "mình" và "bạn", không bịa trải nghiệm, tối đa một CTA cụ thể, không câu mồi tương tác. Cấu trúc mỗi mục giải thích ở [README.md](README.md).

Vùng an toàn 9:16: không đặt nội dung chính trong 12% phía trên và 20% phía dưới. `video-lint` báo `SAFE_ZONE_9X16` khi chữ lấn vào đó.

### 22. Tin nhanh dọc

#### Khi nào dùng

Một tin vừa xảy ra (chính sách mới, sản phẩm mới, số liệu mới công bố) cần video dọc 30 đến 45 giây, nói rõ chuyện gì, ảnh hưởng tới ai, nguồn ở đâu.

#### Prompt mẫu

```text
/opus-video Làm tin nhanh dọc {{thời lượng}} giây, khổ 9:16, về {{tin}}.
Nguồn: {{nguồn}}. Chỉ nói những gì nguồn xác nhận; chỗ còn chưa rõ thì nói là chưa rõ.
Người xem: {{người xem}}. Điều họ cần biết: {{điều cần biết}}.
Hook vào thẳng dữ kiện, không chào. Số chính xác hiện trên hình, lời đọc nói tròn.
Kết bằng {{kết}}.
Làm đủ quy trình viet-pro, gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{thời lượng}}` | 30 đến 45 giây | `40` |
| `{{tin}}` | Một câu tóm tắt tin | `quy định mới về hoá đơn điện tử cho hộ kinh doanh` |
| `{{nguồn}}` | Link văn bản hoặc bài báo gốc | `link văn bản chính thức` |
| `{{người xem}}` | Ai bị ảnh hưởng | `hộ kinh doanh nhỏ` |
| `{{điều cần biết}}` | Hai ba ý | `áp dụng từ ngày nào, ai phải làm, làm ở đâu` |
| `{{kết}}` | Dữ kiện hoặc hành động cụ thể | `nơi tra cứu văn bản gốc` |

#### Ví dụ đã điền

```text
/opus-video Làm tin nhanh dọc 40 giây, khổ 9:16, về quy định mới về hoá đơn điện tử cho hộ kinh doanh.
Nguồn: link văn bản chính thức tôi dán bên dưới. Chỉ nói những gì nguồn xác nhận; chỗ còn chưa rõ thì nói là chưa rõ.
Người xem: hộ kinh doanh nhỏ. Điều họ cần biết: áp dụng từ ngày nào, ai phải làm, làm ở đâu.
Hook vào thẳng dữ kiện, không chào. Số chính xác hiện trên hình, lời đọc nói tròn.
Kết bằng nơi tra cứu văn bản gốc.
Làm đủ quy trình viet-pro, gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### opus-video sẽ làm gì

- Kiểm chứng dữ kiện bắt buộc theo `fact-check.md` của viet-pro, `SOURCES.md` ghi từng claim.
- Workflow `general-video` dựng tay hoặc `faceless-explainer`; composition 1080×1920.
- Blueprint `dataviz-countup` cho mốc ngày và số; Thẻ 7, Thẻ 8.
- `CAPTIONS.md` cho Facebook và TikTok ở bước 9, cùng số liệu với video.

#### Case tham khảo

`y:kangaroohere-818789`, `y:l3d1c-632524` (tra bằng `--category motion --keyword news`). Rerank báo `no vertical (9:16) case` thì agent tự lo vùng an toàn theo pattern-library.

#### Lưu ý

- Tin chưa có nguồn chính thức thì không làm thành video khẳng định.
- Không dùng câu mồi kiểu "sự thật gây sốc" hay "xem đến cuối".

### 23. Giải thích ngắn theo ngách, 60 đến 90 giây

#### Khi nào dùng

Bạn làm kênh theo một ngách (tài chính cá nhân, công nghệ văn phòng, nấu ăn, luật cho người thuê nhà) và cần từng video dọc giải thích một ý cho người trong ngách đó.

#### Prompt mẫu

```text
/opus-video Làm video dọc {{thời lượng}} giây cho kênh về {{ngách}}, khổ 9:16.
Chủ đề tập này: {{chủ đề}}. Một insight duy nhất: {{insight}}.
Người xem: {{người xem}}. Họ thường gặp tình huống: {{tình huống}}.
Kinh nghiệm thật tôi muốn đưa vào (nếu có): {{trải nghiệm thật}}.
Giọng mình và bạn, câu ngắn. Phong cách hình thống nhất với kênh: {{phong cách kênh}}.
Làm đủ quy trình viet-pro, gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{thời lượng}}` | 60 đến 90 giây | `75` |
| `{{ngách}}` | Ngách của kênh | `tài chính cá nhân cho người mới đi làm` |
| `{{chủ đề}}` | Chủ đề tập | `quỹ khẩn cấp` |
| `{{insight}}` | Một câu | `quỹ khẩn cấp đo bằng số tháng chi tiêu, không bằng một con số cố định` |
| `{{người xem}}` | Ai xem | `người 22 đến 28 tuổi, lương cố định` |
| `{{tình huống}}` | Tình huống họ nhận ra ngay | `cuối tháng hết tiền dù không mua gì lớn` |
| `{{trải nghiệm thật}}` | Chỉ ghi khi có thật; không có thì xoá dòng | `xoá dòng này` |
| `{{phong cách kênh}}` | Màu, font, kiểu hình đã dùng | `nền kem, chữ đen, màu nhấn cam, sơ đồ nét tay` |

#### Ví dụ đã điền

```text
/opus-video Làm video dọc 75 giây cho kênh về tài chính cá nhân cho người mới đi làm, khổ 9:16.
Chủ đề tập này: quỹ khẩn cấp. Một insight duy nhất: quỹ khẩn cấp đo bằng số tháng chi tiêu, không bằng một con số cố định.
Người xem: người 22 đến 28 tuổi, lương cố định. Họ thường gặp tình huống: cuối tháng hết tiền dù không mua gì lớn.
Giọng mình và bạn, câu ngắn. Phong cách hình thống nhất với kênh: nền kem, chữ đen, màu nhấn cam, sơ đồ nét tay.
Làm đủ quy trình viet-pro, gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### opus-video sẽ làm gì

- Kịch bản theo bảng loại video trong `script-workflow.md` (thường là explainer), cộng luật TikTok/Reels/Shorts. Khoảng 2,5 đến 3 từ mỗi giây; `check-viet-pro` cảnh báo khi lời đọc dài quá thời lượng.
- `check-viet-pro` cũng cảnh báo khi thấy lời kể trải nghiệm ngôi thứ nhất, để bạn xác nhận đó là trải nghiệm thật.
- Workflow `faceless-explainer` với `eleven.mjs audio-meta`; project 9:16 có dải phụ đề dời về 1340px.
- Thẻ kỹ thuật theo nhóm Explainer của pattern-library.

#### Case tham khảo

`y:amberpromptai-345137`, `y:tony-tt-872147` (tra bằng `--category explainer --keyword short`).

#### Lưu ý

- Giữ cùng bảng màu và font giữa các tập bằng cách ghi chúng vào `<art_direction>` của brief mỗi tập.
- Ý phụ ghi lại cho tập sau, không nhồi vào tập này.

### 24. Làm thêm bản dọc cho video ngang đã có

#### Khi nào dùng

Dự án đã có bản 16:9 hoàn chỉnh và bạn cần thêm bản dọc cho mạng xã hội, dùng chung lời đọc và âm thanh.

#### Prompt mẫu

```text
/opus-video Làm thêm bản 9:16 cho dự án {{thư mục dự án}}. Bản 16:9 đã duyệt.
Dàn lại bố cục cho khổ dọc, không crop bản ngang. Dùng chung lời đọc, nhạc và SFX để timing giống nhau.
Ưu tiên giữ trên hình: {{nội dung ưu tiên}}.
Gửi tôi khung hình demo 9:16 để duyệt trước khi render bản cuối.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{thư mục dự án}}` | Dự án đã có bản 16:9 | `lai-kep` |
| `{{nội dung ưu tiên}}` | Thứ phải giữ khi khung hẹp lại | `con số chính, logo cuối video` |

#### Ví dụ đã điền

```text
/opus-video Làm thêm bản 9:16 cho dự án lai-kep. Bản 16:9 đã duyệt.
Dàn lại bố cục cho khổ dọc, không crop bản ngang. Dùng chung lời đọc, nhạc và SFX để timing giống nhau.
Ưu tiên giữ trên hình: con số chính, logo cuối video.
Gửi tôi khung hình demo 9:16 để duyệt trước khi render bản cuối.
```

#### opus-video sẽ làm gì

- Dựng tay (`general-video`): thêm `compositions/main-9x16.html` 1080×1920 trong cùng project.
- Workflow có frame worker: một project 9:16 riêng, copy project, bỏ `compositions/frames/` và `.hyperframes/frame-packets/`, giữ nguyên `audio_meta.json` và sidecar (`engine-selection.md`).
- `PLAN.md` thêm mục "Khung hình demo 9:16" khi BRIEF chuyển sang `aspect: both`; demo chụp bằng `make-demo.mjs --aspect 9x16`.
- Render bản giao qua `render-final.mjs` với `-c compositions/main-9x16.html`, hoặc chạy trong project 9:16 riêng.

#### Case tham khảo

Chưa có case sát. `--category motion --keyword 9:16` chỉ trả về các case không bàn về dàn lại bố cục.

#### Lưu ý

- Chữ trên bản dọc to hơn khoảng 1,3 lần, tiêu đề tối đa khoảng 18 ký tự mỗi dòng.
- Trong workspace studio, `./scripts/new-project.sh <tên> --aspect 9:16` tạo sẵn thư mục `<tên>-9x16` theo đúng mô hình project riêng.
