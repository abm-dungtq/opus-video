# Motion, intro và explainer dựng mới

Nhóm prompt dựng video hoàn toàn mới, không có footage. Cấu trúc mỗi mục giải thích ở [README.md](README.md).

## Motion graphics và intro

### 1. Intro thương hiệu, logo sting

#### Khi nào dùng

Bạn cần một đoạn mở đầu ngắn, không lời, để gắn vào đầu video kênh hoặc bài thuyết trình. Tác động nằm ở hình và nhạc, kết bằng logo đứng yên. Nếu cần lời đọc hoặc dài hơn 30 giây, chọn mục 2 hoặc mục 3.

#### Prompt mẫu

```text
/opus-video Làm intro {{thời lượng}} giây cho {{thương hiệu}}, khổ {{khổ hình}}, không lời đọc.
Logo: {{đường dẫn logo}}. Màu thương hiệu: {{mã màu}}. Font: {{font}}.
Cảm giác: {{tính từ}}. Kết bằng logo đứng yên đủ lâu để đọc, kèm dòng định vị "{{câu định vị}}".
Nhạc nền không lời, khoảng {{BPM}} BPM, cắt hình theo beat.
Cấm: {{banned list}}.
Làm đủ quy trình: gửi tôi plan và khung hình demo để duyệt trước khi render bản cuối.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{thời lượng}}` | Độ dài, thường 5 đến 15 giây | `8` |
| `{{thương hiệu}}` | Tên hiển thị trên hình | `Sổ Xanh` |
| `{{khổ hình}}` | `16:9`, `9:16` hoặc `both` | `16:9` |
| `{{đường dẫn logo}}` | File logo thật, ưu tiên SVG hoặc PNG nền trong | `shared-assets/logos/so-xanh.svg` |
| `{{mã màu}}` | 3 đến 5 mã hex | `#0B3D2E, #F4F1EA, #2ECC71` |
| `{{font}}` | Font có đủ dấu tiếng Việt | `Be Vietnam Pro` |
| `{{tính từ}}` | 2 đến 4 tính từ | `gọn, chắc, đáng tin` |
| `{{câu định vị}}` | Một dòng ngắn dưới logo | `Sổ sách gọn cho hộ kinh doanh` |
| `{{BPM}}` | Nhịp nhạc | `120` |
| `{{banned list}}` | Những thứ không muốn thấy | `glow, particle, easing nảy, logo xoay vô cớ` |

#### Ví dụ đã điền

```text
/opus-video Làm intro 8 giây cho Sổ Xanh, khổ 16:9, không lời đọc.
Logo: shared-assets/logos/so-xanh.svg. Màu thương hiệu: #0B3D2E, #F4F1EA, #2ECC71. Font: Be Vietnam Pro.
Cảm giác: gọn, chắc, đáng tin. Kết bằng logo đứng yên đủ lâu để đọc, kèm dòng định vị "Sổ sách gọn cho hộ kinh doanh".
Nhạc nền không lời, khoảng 120 BPM, cắt hình theo beat.
Cấm: glow, particle, easing nảy, logo xoay vô cớ.
Làm đủ quy trình: gửi tôi plan và khung hình demo để duyệt trước khi render bản cuối.
```

#### opus-video sẽ làm gì

- Workflow HyperFrames `motion-graphics`, blueprint `logo-assemble-lockup` hoặc `kinetic-type-beats`, block từ `catalog --query "logo reveal"` (dòng Motion graphics trong bảng nối nhóm của pattern-library).
- Thẻ kỹ thuật: Thẻ 3 (lưới beat theo BPM), Thẻ 7 (mask và line reveal), Thẻ 8 (banned list và vòng tự kiểm).
- Chữ trên hình (dòng định vị) vẫn qua cổng viet-pro. Nhạc nền sinh bằng `eleven.mjs music`, SFX thưa đặt ở nhịp logo.
- Plan, khung hình demo, `render-final.mjs`, QA như quy trình 9 bước.

#### Case tham khảo

`y:brainextends-606193`, `y:iamtanzil-120030`, `y:techhalla-498547` (tra bằng `--category motion --keyword brand`).

#### Lưu ý

- Logo phải là file thật. Agent không dựng logo giả để lấp khung.
- Khung cuối cần giữ yên đủ lâu để đọc; nói rõ nếu bạn muốn intro lặp liền mạch (Thẻ 6).

### 2. Showreel thương hiệu cắt theo nhạc

#### Khi nào dùng

Bạn muốn một đoạn 15 đến 30 giây khoe phong cách của thương hiệu hoặc studio, đi qua nhiều kỹ thuật chuyển động nhưng chung một ngôn ngữ thiết kế. Phù hợp làm bài đăng giới thiệu hoặc video đầu trang.

#### Prompt mẫu

```text
/opus-video Làm showreel {{thời lượng}} giây cho {{thương hiệu}}, khổ {{khổ hình}}.
Nội dung cần xuất hiện: {{danh sách nội dung}}.
Hook ngay giây đầu, sau đó mỗi beat một kỹ thuật khác nhau nhưng chung bảng màu {{mã màu}} và font {{font}}.
Nhạc nền không lời {{mood nhạc}}, {{BPM}} BPM. Chữ trên hình tiếng Việt, ngắn.
Kết bằng {{khung cuối}}. Cấm: {{banned list}}.
Gửi tôi plan và khung hình demo để duyệt trước khi render bản cuối.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{thời lượng}}` | Độ dài | `20` |
| `{{thương hiệu}}` | Tên thương hiệu hoặc studio | `Xưởng Mộc An` |
| `{{khổ hình}}` | `16:9`, `9:16` hoặc `both` | `both` |
| `{{danh sách nội dung}}` | 3 đến 6 ý hoặc tài sản cần lên hình | `ảnh sản phẩm trong assets/, ba dịch vụ chính, địa chỉ xưởng` |
| `{{mã màu}}` | 3 đến 5 mã hex | `#1E1B18, #E8DCC8, #C8742F` |
| `{{font}}` | Font chính | `Be Vietnam Pro` |
| `{{mood nhạc}}` | Tâm trạng nhạc bằng vài chữ | `ấm, mộc, nhịp vừa` |
| `{{BPM}}` | Nhịp | `110` |
| `{{khung cuối}}` | Thứ đứng yên ở cuối | `logo và số điện thoại` |
| `{{banned list}}` | Thứ không muốn thấy | `glitch, RGB split, camera shake` |

#### Ví dụ đã điền

```text
/opus-video Làm showreel 20 giây cho Xưởng Mộc An, khổ both.
Nội dung cần xuất hiện: ảnh sản phẩm trong assets/, ba dịch vụ chính (đóng tủ, làm bàn, sửa đồ gỗ), địa chỉ xưởng.
Hook ngay giây đầu, sau đó mỗi beat một kỹ thuật khác nhau nhưng chung bảng màu #1E1B18, #E8DCC8, #C8742F và font Be Vietnam Pro.
Nhạc nền không lời ấm, mộc, nhịp vừa, 110 BPM. Chữ trên hình tiếng Việt, ngắn.
Kết bằng logo và số điện thoại. Cấm: glitch, RGB split, camera shake.
Gửi tôi plan và khung hình demo để duyệt trước khi render bản cuối.
```

#### opus-video sẽ làm gì

- Workflow `motion-graphics` cho bản ngắn; trên khoảng 30 giây hoặc nhiều cảnh thì `general-video`.
- Thẻ kỹ thuật: Thẻ 3 (lưới beat), Thẻ 5 (camera reframe đặt đúng beat), Thẻ 7 (mask reveal), Thẻ 8 (banned list).
- Với `both`: dựng 16:9 trước rồi dàn lại bố cục cho 9:16 trong `compositions/main-9x16.html`, chung một bộ âm thanh.
- Khung hình demo có mốc cho cả hai khổ.

#### Case tham khảo

`y:howdevelop-733090`, `y:techhalla-498547`, `y:daniel-haida-636937` (tra bằng `--category motion --keyword showreel`).

#### Lưu ý

- Prompt kiểu "làm thật hoành tráng" mà không có bảng màu, font và banned list thường ra kết quả rời rạc. Giữ đủ ba thứ đó.
- Ảnh sản phẩm do bạn cấp thì ghi rõ thư mục. Không có ảnh thì agent dựng bằng chữ và hình khối, không dựng sản phẩm giả.

## Explainer giáo dục

### 3. Explainer giải thích một khái niệm

#### Khi nào dùng

Bạn muốn giải thích một khái niệm, cơ chế hay quy trình cho người mới, có lời đọc tiếng Việt và phụ đề. Không có footage, hình ảnh được dựng theo từng cảnh.

#### Prompt mẫu

```text
/opus-video Làm explainer {{thời lượng}} giây về {{chủ đề}} cho {{người xem}}, khổ {{khổ hình}}.
Ý chính người xem phải nhớ: {{insight}}.
Nguồn tôi có: {{nguồn}}. Số liệu nào không kiểm chứng được thì bỏ.
Lời đọc tiếng Việt, giọng mình và bạn, có phụ đề khớp lời. Mỗi cảnh một ý hình.
Phong cách hình: {{phong cách}}.
Làm đủ quy trình viet-pro, gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{thời lượng}}` | Thường 30 đến 60 giây | `45` |
| `{{chủ đề}}` | Khái niệm cần giải thích | `lãi kép` |
| `{{người xem}}` | Ai xem, họ biết gì sẵn | `sinh viên mới đi làm, chưa đầu tư bao giờ` |
| `{{khổ hình}}` | `16:9`, `9:16` hoặc `both` | `both` |
| `{{insight}}` | Một câu duy nhất | `thời gian quan trọng hơn số tiền gửi ban đầu` |
| `{{nguồn}}` | Link hoặc tài liệu; không có thì ghi "chưa có" | `chưa có, nhờ agent tìm nguồn chính thống` |
| `{{phong cách}}` | Vài chữ về hình | `sơ đồ tối giản, số lớn, nền tối` |

#### Ví dụ đã điền

```text
/opus-video Làm explainer 45 giây về lãi kép cho sinh viên mới đi làm, chưa đầu tư bao giờ, khổ both.
Ý chính người xem phải nhớ: thời gian quan trọng hơn số tiền gửi ban đầu.
Nguồn tôi có: chưa có, nhờ agent tìm nguồn chính thống. Số liệu nào không kiểm chứng được thì bỏ.
Lời đọc tiếng Việt, giọng mình và bạn, có phụ đề khớp lời. Mỗi cảnh một ý hình.
Phong cách hình: sơ đồ tối giản, số lớn, nền tối.
Làm đủ quy trình viet-pro, gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### opus-video sẽ làm gì

- Kịch bản theo dòng "Explainer/giáo dục" trong `script-workflow.md`: hook bằng dữ kiện hoặc câu hỏi, giải thích từng bước, chốt một ý. Kiểm chứng dữ kiện bắt buộc, nguồn ghi vào `SOURCES.md`.
- Workflow `general-video` khi dựng tay với giọng `eleven.mjs tts`, hoặc `faceless-explainer` khi dùng cầu nối `eleven.mjs audio-meta`.
- Blueprint `dataviz-countup`, `spatial-pan-stations`; thẻ kỹ thuật Thẻ 7 (mask reveal) và Thẻ 8. Chữ chốt hiện đúng lúc lời đọc nhắc tới, dựa vào `words.json`.
- Kèm `CAPTIONS.md` cho Facebook và TikTok ở bước 9.

#### Case tham khảo

`y:astrothewizard-618782`, `y:retropunkai-277590`, `c:2102853258582880547` (tra bằng `--category explainer --keyword explainer`).

#### Lưu ý

- Số chính xác đặt trên chữ hình, lời đọc dùng số tròn.
- Một video một insight. Ý phụ để dành cho video sau.

### 4. Explainer phản bác một ngộ nhận

#### Khi nào dùng

Có một niềm tin phổ biến nhưng sai hoặc thiếu. Bạn muốn sửa nó một cách công bằng: công nhận phần đúng, nêu nguồn nói gì, chỉ chỗ sai.

#### Prompt mẫu

```text
/opus-video Làm video {{thời lượng}} giây phản bác ngộ nhận "{{ngộ nhận}}", khổ {{khổ hình}}.
Người xem: {{người xem}}.
Nguồn đối chiếu: {{nguồn}}.
Công nhận phần đúng của ngộ nhận trước, rồi mới chỉ chỗ sai. Kết bằng điều người xem nên làm thay thế: {{hành động thay thế}}.
Không phóng đại, không câu giật gân. Lời đọc tiếng Việt có phụ đề.
Làm đủ quy trình viet-pro, gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{thời lượng}}` | Độ dài | `60` |
| `{{ngộ nhận}}` | Câu ngộ nhận đúng như người ta hay nói | `uống nhiều nước đá gây viêm họng` |
| `{{khổ hình}}` | `16:9`, `9:16` hoặc `both` | `9:16` |
| `{{người xem}}` | Ai xem | `phụ huynh có con nhỏ` |
| `{{nguồn}}` | Nguồn y khoa, khoa học, văn bản chính thức | `link bài của bệnh viện hoặc tổ chức y tế` |
| `{{hành động thay thế}}` | Một việc cụ thể | `theo dõi triệu chứng thay vì kiêng hoàn toàn` |

#### Ví dụ đã điền

```text
/opus-video Làm video 60 giây phản bác ngộ nhận "uống nhiều nước đá gây viêm họng", khổ 9:16.
Người xem: phụ huynh có con nhỏ.
Nguồn đối chiếu: các link bài của bệnh viện và tổ chức y tế mà tôi dán bên dưới.
Công nhận phần đúng của ngộ nhận trước, rồi mới chỉ chỗ sai. Kết bằng điều người xem nên làm thay thế: theo dõi triệu chứng thay vì kiêng hoàn toàn.
Không phóng đại, không câu giật gân. Lời đọc tiếng Việt có phụ đề.
Làm đủ quy trình viet-pro, gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### opus-video sẽ làm gì

- Kịch bản theo dòng "Phản bác ngộ nhận" trong `script-workflow.md`, đọc `editorial/debunk.md` và `editorial/reframe.md` của viet-pro. Kiểm chứng bắt buộc, claim không kiểm chứng được thì bỏ.
- Workflow `general-video` hoặc `faceless-explainer`. Blueprint `comparison-split` cho cảnh đặt ngộ nhận cạnh dữ kiện (bảng chức năng câu trong `edit-method.md`).
- Thẻ kỹ thuật: Thẻ 7, Thẻ 8.

#### Case tham khảo

Chưa có case sát (`--category explainer --keyword myth` không ra kết quả). Agent dựa vào pattern-library nhóm Explainer.

#### Lưu ý

- Chủ đề sức khoẻ, tài chính, pháp lý cần nguồn chính thống. Không có nguồn thì agent sẽ hỏi lại hoặc thu hẹp claim.
- Hook có thể nêu ngộ nhận rồi lật lại, nhưng không dùng câu mồi kiểu "sự thật gây sốc".

### 5. Explainer xoay quanh một con số

#### Khi nào dùng

Video ngắn dựng quanh một hoặc vài con số có nguồn, ví dụ kết quả khảo sát, báo cáo năm, chỉ số thị trường. Số là nhân vật chính.

#### Prompt mẫu

```text
/opus-video Làm video {{thời lượng}} giây về con số {{con số}} trong {{nguồn số liệu}}, khổ {{khổ hình}}.
Bối cảnh cần nói: {{bối cảnh}}.
Điều con số này nói lên: {{insight}}.
Số chính xác hiện trên hình, lời đọc nói tròn. Biểu đồ đơn giản, đếm số lên khi lời đọc nhắc tới.
Bảng màu {{mã màu}}. Lời đọc tiếng Việt.
Gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{thời lượng}}` | Độ dài | `30` |
| `{{con số}}` | Số chính, có đơn vị | `72,4%` |
| `{{nguồn số liệu}}` | Tên báo cáo kèm link | `báo cáo khảo sát của đơn vị X, link` |
| `{{khổ hình}}` | `16:9`, `9:16` hoặc `both` | `16:9` |
| `{{bối cảnh}}` | Một hai câu | `tỉ lệ học sinh không đủ điểm vào trường công năm nay` |
| `{{insight}}` | Một câu | `áp lực tuyển sinh dồn về nhóm trường tư` |
| `{{mã màu}}` | 3 đến 5 mã hex | `#0B1B2B, #F4F1EA, #4DA3FF` |

#### Ví dụ đã điền

```text
/opus-video Làm video 30 giây về con số 72,4% trong báo cáo khảo sát tuyển sinh tôi dán link bên dưới, khổ 16:9.
Bối cảnh cần nói: tỉ lệ học sinh không đủ điểm vào trường công năm nay.
Điều con số này nói lên: áp lực tuyển sinh dồn về nhóm trường tư.
Số chính xác hiện trên hình, lời đọc nói tròn. Biểu đồ đơn giản, đếm số lên khi lời đọc nhắc tới.
Bảng màu #0B1B2B, #F4F1EA, #4DA3FF. Lời đọc tiếng Việt.
Gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### opus-video sẽ làm gì

- Blueprint `dataviz-countup`, rule `stat-bars-and-fills`, `counting-dynamic-scale`, block từ `catalog --query "explainer chart"`.
- Kiểm chứng số bắt buộc, `SOURCES.md` ghi nguồn từng claim. `compare-preserved-content` giữ số không bị đổi trong lúc sửa văn.
- Workflow `general-video`.

#### Case tham khảo

`y:astrothewizard-618782`, `y:verbove-268381`, `y:charlesmendez-476517` (tra bằng `--category explainer --keyword data`).

#### Lưu ý

- Số đếm lên chỉ hợp khi giá trị trung gian không gây hiểu sai. Với số của tin đăng hay số pháp lý, nói rõ là muốn hiện ngay giá trị cuối.
- Biểu đồ dùng số thật, không vẽ minh hoạ thay số.
