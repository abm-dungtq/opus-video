# Từ nguồn có sẵn

Nhóm prompt biến một nguồn đã có (pull request, trang sản phẩm, bài viết, chủ đề, bộ ảnh) thành video. Cấu trúc mỗi mục giải thích ở [README.md](README.md).

### 12. Pull request GitHub thành video

#### Khi nào dùng

Bạn muốn giới thiệu một thay đổi code (tính năng mới, bản sửa lỗi, refactor) cho đội ngũ hoặc người dùng, dựng từ diff, commit và file của một pull request. Nếu nguồn là trang sản phẩm chứ không phải code, chọn mục 13.

#### Prompt mẫu

```text
/opus-video Làm video {{thời lượng}} giây giới thiệu pull request {{PR}}, khổ {{khổ hình}}.
Người xem: {{người xem}}. Điều họ cần hiểu sau khi xem: {{insight}}.
Chỉ nói những gì có trong diff, commit và mô tả PR. Đoạn code hiện trên hình phải đọc được trên {{thiết bị xem}}.
Lời đọc tiếng Việt. Thuật ngữ kỹ thuật giữ nguyên tiếng Anh khi không có từ Việt thông dụng.
Gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{thời lượng}}` | Độ dài | `45` |
| `{{PR}}` | Link PR, `owner/repo#N`, hoặc "PR đang mở ở repo này" | `PR đang mở ở repo này` |
| `{{khổ hình}}` | `16:9`, `9:16` hoặc `both` | `16:9` |
| `{{người xem}}` | Ai xem | `người dùng skill, không đọc code` |
| `{{insight}}` | Một câu | `bản giao cuối giờ không thể render khi chưa duyệt demo` |
| `{{thiết bị xem}}` | Màn hình xem chính | `điện thoại` |

#### Ví dụ đã điền

```text
/opus-video Làm video 45 giây giới thiệu pull request đang mở ở repo này, khổ 16:9.
Người xem: người dùng skill, không đọc code. Điều họ cần hiểu sau khi xem: bản giao cuối giờ không thể render khi chưa duyệt demo.
Chỉ nói những gì có trong diff, commit và mô tả PR. Đoạn code hiện trên hình phải đọc được trên điện thoại.
Lời đọc tiếng Việt. Thuật ngữ kỹ thuật giữ nguyên tiếng Anh khi không có từ Việt thông dụng.
Gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### opus-video sẽ làm gì

- Workflow HyperFrames `pr-to-video`. Giọng tiếng Việt qua `eleven.mjs audio-meta` thay cho bước tạo giọng của workflow; `SCRIPT.md` phải trùng `script/NN.txt`.
- Thẻ kỹ thuật: Thẻ 5 (camera reframe để đoạn code lấp khung), Thẻ 7.
- Font preset của workflow được đổi sang Be Vietnam Pro nếu thiếu dấu; khổ 9:16 làm project riêng.

#### Case tham khảo

`c:2103545787875733862` (tra bằng `--category product --keyword repo`).

#### Lưu ý

- Chữ code nhỏ là lỗi hay gặp. `video-lint` báo `FONT_TOO_SMALL` khi chữ dưới ngưỡng.
- Repo riêng tư cần agent có quyền đọc qua `gh`. Agent không tự đăng gì lên repo.

### 13. URL sản phẩm thành video ra mắt

#### Khi nào dùng

Bạn có trang web sản phẩm và muốn agent tự lấy nội dung, màu, font, logo thật từ trang để dựng video ra mắt hoặc quảng bá. Đây cũng là lựa chọn cho video giới thiệu một website.

#### Prompt mẫu

```text
/opus-video Làm video ra mắt {{thời lượng}} giây cho {{URL}}, khổ {{khổ hình}}.
Mục đích: {{mục đích}}. Người xem: {{người xem}}.
Lấy copy, màu, font và logo thật từ trang. Không bịa tính năng, số liệu hay lời khách hàng.
Nhấn vào {{tính năng chính}}. Kết bằng {{lời kêu gọi}}.
Lời đọc tiếng Việt: {{có hoặc không}}.
Gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{thời lượng}}` | Độ dài | `30` |
| `{{URL}}` | Trang sản phẩm | `https://example.com` |
| `{{khổ hình}}` | `16:9`, `9:16` hoặc `both` | `both` |
| `{{mục đích}}` | Ra mắt, quảng bá tính năng, giới thiệu trang | `ra mắt tính năng đặt lịch` |
| `{{người xem}}` | Ai xem | `chủ tiệm làm tóc` |
| `{{tính năng chính}}` | 2 đến 3 tính năng | `đặt lịch qua tin nhắn, nhắc lịch tự động` |
| `{{lời kêu gọi}}` | Một hành động | `địa chỉ trang đăng ký` |
| `{{có hoặc không}}` | Có lời đọc hay không | `có` |

#### Ví dụ đã điền

```text
/opus-video Làm video ra mắt 30 giây cho https://example.com, khổ both.
Mục đích: ra mắt tính năng đặt lịch. Người xem: chủ tiệm làm tóc.
Lấy copy, màu, font và logo thật từ trang. Không bịa tính năng, số liệu hay lời khách hàng.
Nhấn vào đặt lịch qua tin nhắn, nhắc lịch tự động. Kết bằng địa chỉ trang đăng ký.
Lời đọc tiếng Việt: có.
Gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### opus-video sẽ làm gì

- Workflow `product-launch-video` (mặc định cho URL thương mại). Giọng tiếng Việt qua `eleven.mjs audio-meta`, sau đó `sync-durations`, `fetch-sfx`, `captions.mjs build` của workflow.
- Blueprint `cursor-ui-demo`, `device-surface-showcase`; Thẻ 1, Thẻ 2, Thẻ 5.
- Bản 9:16 là project riêng, dải phụ đề được dời về vùng an toàn bằng `replace-in-file.mjs`.

#### Case tham khảo

`y:annacher-433425`, `y:daniel-haida-636937`, `y:reflex-cloud-304046` (tra bằng `--category motion --keyword promo`).

#### Lưu ý

- Copy trên trang thường là tiếng Anh hoặc văn quảng cáo. Lời đọc tiếng Việt vẫn được viết lại qua viet-pro, không dịch máy từng chữ.
- Ảnh có thương hiệu bên thứ ba dễ bị hiểu là xác nhận thì agent bỏ hoặc gắn nhãn rõ (`edit-method.md`).

### 14. Bài viết thành faceless explainer

#### Khi nào dùng

Bạn có một bài viết, ghi chú hay tài liệu và muốn chuyển thành video giải thích không có người dẫn, hình dựng theo từng cảnh (chữ, sơ đồ, biểu đồ).

#### Prompt mẫu

```text
/opus-video Chuyển bài viết {{nguồn bài}} thành explainer {{thời lượng}} giây, khổ {{khổ hình}}.
Người xem: {{người xem}}. Chỉ giữ một insight: {{insight}}.
Dữ kiện, số liệu chỉ lấy từ bài và nguồn bài dẫn; claim nào không kiểm chứng được thì bỏ.
Lời đọc tiếng Việt, phụ đề khớp lời. Phong cách hình: {{phong cách}}.
Gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{nguồn bài}}` | Link hoặc file | `notes/bai-viet.md` |
| `{{thời lượng}}` | Độ dài | `60` |
| `{{khổ hình}}` | `16:9`, `9:16` hoặc `both` | `9:16` |
| `{{người xem}}` | Ai xem | `nhân viên văn phòng mới dùng AI` |
| `{{insight}}` | Một câu rút từ bài | `giao việc cho AI cần đủ bối cảnh, không cần câu lệnh dài` |
| `{{phong cách}}` | Vài chữ | `typography lớn, sơ đồ nét mảnh, nền sáng` |

#### Ví dụ đã điền

```text
/opus-video Chuyển bài viết notes/bai-viet.md thành explainer 60 giây, khổ 9:16.
Người xem: nhân viên văn phòng mới dùng AI. Chỉ giữ một insight: giao việc cho AI cần đủ bối cảnh, không cần câu lệnh dài.
Dữ kiện, số liệu chỉ lấy từ bài và nguồn bài dẫn; claim nào không kiểm chứng được thì bỏ.
Lời đọc tiếng Việt, phụ đề khớp lời. Phong cách hình: typography lớn, sơ đồ nét mảnh, nền sáng.
Gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### opus-video sẽ làm gì

- Workflow `faceless-explainer` với `eleven.mjs audio-meta`, hoặc `general-video` khi dựng tay.
- Kịch bản qua viet-pro mức Chuẩn, kiểm chứng dữ kiện, `compare-preserved-content` giữ tên riêng và số.
- Blueprint `spatial-pan-stations`, `constellation-hub`; Thẻ 7, Thẻ 8. `edit-method.md` quy định mỗi câu một ý hình.

#### Case tham khảo

`y:henkvaness-975279` (tra bằng `--category explainer --keyword article`).

#### Lưu ý

- Bài dài thì video vẫn chỉ một insight. Phần còn lại có thể thành video sau.
- Bài của người khác cần quyền dùng; trích dẫn kèm nguồn.

### 15. Chủ đề thành video liệt kê hoặc hướng dẫn

#### Khi nào dùng

Bạn chỉ có một chủ đề và muốn video dạng danh sách (ba lỗi, năm bước) hoặc hướng dẫn từng bước, không có bài viết sẵn.

#### Prompt mẫu

```text
/opus-video Làm video {{dạng video}} {{thời lượng}} giây về {{chủ đề}}, khổ {{khổ hình}}.
Người xem: {{người xem}}. Số mục: {{số mục}}.
Mỗi mục một cảnh, có một hình cụ thể. Bước nào cần thao tác thật thì mô tả đúng thao tác, không bịa kết quả.
Lời đọc tiếng Việt, phụ đề khớp lời. Kết bằng {{kết}}.
Gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{dạng video}}` | Liệt kê hoặc hướng dẫn | `hướng dẫn` |
| `{{thời lượng}}` | Độ dài | `40` |
| `{{chủ đề}}` | Chủ đề | `sao lưu ảnh điện thoại lên máy tính` |
| `{{khổ hình}}` | `16:9`, `9:16` hoặc `both` | `9:16` |
| `{{người xem}}` | Ai xem | `người lớn tuổi ít dùng máy tính` |
| `{{số mục}}` | Số bước hoặc số ý | `4 bước` |
| `{{kết}}` | Câu kết hoặc hành động | `bước kiểm tra ảnh đã sao lưu đủ` |

#### Ví dụ đã điền

```text
/opus-video Làm video hướng dẫn 40 giây về sao lưu ảnh điện thoại lên máy tính, khổ 9:16.
Người xem: người lớn tuổi ít dùng máy tính. Số mục: 4 bước.
Mỗi mục một cảnh, có một hình cụ thể. Bước nào cần thao tác thật thì mô tả đúng thao tác, không bịa kết quả.
Lời đọc tiếng Việt, phụ đề khớp lời. Kết bằng bước kiểm tra ảnh đã sao lưu đủ.
Gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### opus-video sẽ làm gì

- Workflow `faceless-explainer` (listicle, how-to) với `eleven.mjs audio-meta`.
- Blueprint `grid-card-assemble` cho liệt kê (bảng chức năng câu trong `edit-method.md`); kiểu "quy trình tick dần" cho hướng dẫn.
- Thẻ kỹ thuật: Thẻ 7, Thẻ 8.

#### Case tham khảo

`y:alex-prompter-997524` (tra bằng `--category explainer --keyword "how it works"`).

#### Lưu ý

- Ảnh chụp màn hình thao tác thật làm video đáng tin hơn hình vẽ. Có thì cấp cho agent.
- Một bước quá dài cho thời lượng cảnh thì tách cảnh hoặc cắt lời, không đọc nhanh hơn.

### 16. Bộ ảnh thành slideshow theo nhạc

#### Khi nào dùng

Bạn có một bộ ảnh (sự kiện, chuyến đi, sản phẩm) và muốn video MP4 trong đó ảnh chuyển theo beat nhạc. Skill `slideshow` của HyperFrames làm bộ slide trình chiếu chứ không ra MP4, nên mục này đi qua `music-to-video`.

#### Prompt mẫu

```text
/opus-video Làm video {{thời lượng}} giây từ bộ ảnh {{thư mục ảnh}}, khổ {{khổ hình}}, ảnh chuyển theo beat nhạc.
Nhạc: {{nhạc}}. Thứ tự ảnh: {{thứ tự}}.
Chữ trên hình: {{chữ trên hình}}. Không crop mất chủ thể; ảnh ngang trong khung dọc thì dàn bố cục lại.
Gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{thời lượng}}` | Độ dài | `30` |
| `{{thư mục ảnh}}` | Ảnh của bạn | `assets/photos/` |
| `{{khổ hình}}` | `16:9`, `9:16` hoặc `both` | `9:16` |
| `{{nhạc}}` | File nhạc có license, hoặc mô tả để sinh nhạc không lời | `nhạc nền không lời vui, 120 BPM` |
| `{{thứ tự}}` | Theo tên file, theo thời gian, hoặc để agent chọn | `theo tên file` |
| `{{chữ trên hình}}` | Tiêu đề, ngày, địa điểm | `Tất niên 2025, công ty ABC` |

#### Ví dụ đã điền

```text
/opus-video Làm video 30 giây từ bộ ảnh assets/photos/, khổ 9:16, ảnh chuyển theo beat nhạc.
Nhạc: nhạc nền không lời vui, 120 BPM. Thứ tự ảnh: theo tên file.
Chữ trên hình: Tất niên 2025, công ty ABC. Không crop mất chủ thể; ảnh ngang trong khung dọc thì dàn bố cục lại.
Gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### opus-video sẽ làm gì

- Workflow `music-to-video` (slideshow theo beat). Thẻ 3 (lưới beat), Thẻ 5 cho punch-in nhẹ trên ảnh.
- Nhạc sinh bằng `eleven.mjs music`; thoát 3 thì lấy từ `media-use resolve --type bgm`.
- Chữ trên hình qua cổng viet-pro.

#### Case tham khảo

`y:twoclipping-496100` (tra bằng `--category 3d --keyword photos`).

#### Lưu ý

- Ảnh là nội dung thật của bạn, agent không gắn nhãn rào đón lên hình.
- Ảnh có người cần sự đồng ý của người trong ảnh khi đăng công khai.
