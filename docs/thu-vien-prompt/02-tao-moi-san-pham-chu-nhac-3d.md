# Sản phẩm, chữ, nhạc và 3D dựng mới

Nhóm prompt dựng mới cho quảng cáo sản phẩm, kinetic typography, video theo nhạc và cảnh 3D. Cấu trúc mỗi mục giải thích ở [README.md](README.md).

## Sản phẩm và quảng cáo

### 6. Promo phần mềm với UI và con trỏ

#### Khi nào dùng

Bạn có một ứng dụng hoặc phần mềm và muốn video ngắn khoe các thao tác chính bằng giao diện thật, con trỏ click, kéo, gõ. Nếu bạn chỉ có URL và muốn agent tự lấy nội dung từ trang, chọn mục 13.

#### Prompt mẫu

```text
/opus-video Làm promo {{thời lượng}} giây cho {{sản phẩm}}, khổ {{khổ hình}}.
Ảnh chụp giao diện thật ở {{thư mục ảnh UI}}. Các trạng thái cần đi qua theo thứ tự: {{danh sách trạng thái}}.
Con trỏ dẫn dắt mọi thay đổi trạng thái. Dữ liệu trên giao diện lấy đúng từ ảnh chụp, không bịa số hay tính năng.
Lời đọc tiếng Việt: {{có hoặc không}}. Nhạc nền {{BPM}} BPM. Màu nhấn {{mã màu}}.
Kết bằng logo và {{lời kêu gọi}}.
Gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{thời lượng}}` | Thường 15 đến 30 giây | `20` |
| `{{sản phẩm}}` | Tên sản phẩm | `Sổ Xanh` |
| `{{khổ hình}}` | `16:9`, `9:16` hoặc `both` | `both` |
| `{{thư mục ảnh UI}}` | Ảnh chụp màn hình thật | `assets/ui/` |
| `{{danh sách trạng thái}}` | 3 đến 12 trạng thái | `màn hình trống, nhập hoá đơn, báo cáo tháng, xuất file` |
| `{{có hoặc không}}` | Có lời đọc hay chỉ chữ trên hình | `có` |
| `{{BPM}}` | Nhịp nhạc | `120` |
| `{{mã màu}}` | Màu nhấn của thương hiệu | `#2ECC71` |
| `{{lời kêu gọi}}` | Một hành động cụ thể | `địa chỉ tải ứng dụng` |

#### Ví dụ đã điền

```text
/opus-video Làm promo 20 giây cho Sổ Xanh, khổ both.
Ảnh chụp giao diện thật ở assets/ui/. Các trạng thái cần đi qua theo thứ tự: màn hình trống, nhập hoá đơn, báo cáo tháng, xuất file.
Con trỏ dẫn dắt mọi thay đổi trạng thái. Dữ liệu trên giao diện lấy đúng từ ảnh chụp, không bịa số hay tính năng.
Lời đọc tiếng Việt: có. Nhạc nền 120 BPM. Màu nhấn #2ECC71.
Kết bằng logo và địa chỉ tải ứng dụng.
Gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### opus-video sẽ làm gì

- Workflow `product-launch-video` hoặc `general-video`. Blueprint `cursor-ui-demo`, rule `context-sensitive-cursor`, `card-morph-anchor`, `coordinate-target-zoom` (dòng Sản phẩm / UI trong bảng nối nhóm).
- Thẻ kỹ thuật: Thẻ 1 (UI có con trỏ dẫn dắt), Thẻ 2 (một hình biến thành mọi cảnh), Thẻ 5 (camera reframe).
- Kịch bản theo dòng "Sản phẩm/quảng cáo" của `script-workflow.md`: nỗi đau, sản phẩm giải quyết thế nào, một bằng chứng, một CTA.
- Workflow chuyên biệt dùng `eleven.mjs audio-meta` thay cho bước tạo giọng của workflow.

#### Case tham khảo

`y:thegrootdev-966114`, `y:demonugc-525162`, `y:dzhohola-249003` (tra bằng `--category motion --keyword "UI states"`).

#### Lưu ý

- Không có ảnh UI thật thì agent không dựng dashboard giả. Hãy cấp ảnh chụp hoặc chọn mục 13 để agent chụp từ URL.
- Bản 9:16 phải dàn lại bố cục, mỗi tính năng ở trên màn hình ít nhất khoảng 2 giây.

### 7. Quảng cáo nhiều biến thể từ một mẫu

#### Khi nào dùng

Bạn cần nhiều video cùng một khung, chỉ khác vài trường như tên chi nhánh, giá, câu tiêu đề hay CTA. Ví dụ một mẫu khuyến mãi cho mười cửa hàng.

#### Prompt mẫu

```text
/opus-video Làm một mẫu quảng cáo {{thời lượng}} giây, khổ {{khổ hình}}, rồi xuất {{số biến thể}} biến thể.
Các trường thay đổi giữa biến thể: {{danh sách trường}}. Dữ liệu từng biến thể ở {{file dữ liệu}}.
Phần cố định: {{phần cố định}}.
Mọi chuỗi chữ tiếng Việt của mọi biến thể qua viet-pro.
Gửi tôi plan và khung hình demo của một biến thể đại diện trước khi render hàng loạt.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{thời lượng}}` | Độ dài mỗi biến thể | `10` |
| `{{khổ hình}}` | `16:9`, `9:16` hoặc `both` | `9:16` |
| `{{số biến thể}}` | Số video cần xuất | `8` |
| `{{danh sách trường}}` | Các trường đổi | `tên chi nhánh, địa chỉ, giá món chính` |
| `{{file dữ liệu}}` | File chứa dữ liệu | `data/chi-nhanh.csv` |
| `{{phần cố định}}` | Những gì giống nhau | `logo, nhạc nền, bố cục, câu mở` |

#### Ví dụ đã điền

```text
/opus-video Làm một mẫu quảng cáo 10 giây, khổ 9:16, rồi xuất 8 biến thể.
Các trường thay đổi giữa biến thể: tên chi nhánh, địa chỉ, giá món chính. Dữ liệu từng biến thể ở data/chi-nhanh.csv.
Phần cố định: logo, nhạc nền, bố cục, câu mở.
Mọi chuỗi chữ tiếng Việt của mọi biến thể qua viet-pro.
Gửi tôi plan và khung hình demo của một biến thể đại diện trước khi render hàng loạt.
```

#### opus-video sẽ làm gì

- Dùng composition có biến (`data-composition-variables`) và `render --batch` của HyperFrames, không chuyển sang Remotion chỉ vì có nhiều biến thể (`engine-selection.md`).
- Thẻ kỹ thuật: Thẻ 8 (banned list và vòng tự kiểm) cho mẫu chung.
- Plan và demo áp dụng cho mẫu; bản giao vẫn đi qua cổng final.

#### Case tham khảo

`c:2104033772949680192`, `c:2104074812276748449` (tra bằng `--category product --keyword ad`).

#### Lưu ý

- `render-final.mjs` chuyển tiếp nguyên các tham số sau `--` sang `hyperframes render`, nên bản giao nhiều biến thể chạy bằng `node $OV/scripts/render-final.mjs --project . -- --batch rows.json --output "renders/{name}.mp4"` (theo `references/engine-selection.md`).
- Chuỗi dài nhất trong dữ liệu quyết định bố cục. Nêu trường hợp dài nhất để agent đưa vào khung hình demo.

## Kinetic typography

### 8. Kinetic typography cho một câu nói

#### Khi nào dùng

Một câu nói, tuyên ngôn, tagline hay trích dẫn mà chữ là nhân vật chính, có thể kèm giọng đọc. Thời lượng ngắn, 15 đến 20 giây.

#### Prompt mẫu

```text
/opus-video Dàn dựng câu "{{câu nói}}" thành kinetic typography {{thời lượng}} giây, khổ {{khổ hình}}.
Lời khoá cứng, không thêm slogan. Từ khoá cần nhấn: {{từ khoá}}.
{{có hoặc không}} giọng đọc tiếng Việt; nếu có, chữ hiện theo cụm từ của giọng.
Font: {{font}}. Bảng màu: {{mã màu}}. Có ít nhất một nhịp đứng yên.
Gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{câu nói}}` | Nguyên văn câu cần dựng | `Làm ít thôi, nhưng làm cho xong` |
| `{{thời lượng}}` | Độ dài | `15` |
| `{{khổ hình}}` | `16:9`, `9:16` hoặc `both` | `9:16` |
| `{{từ khoá}}` | 2 đến 3 từ chịu lực | `ít, xong` |
| `{{có hoặc không}}` | Có giọng đọc hay không | `Có` |
| `{{font}}` | Font display và font phụ | `Be Vietnam Pro 800 và 400` |
| `{{mã màu}}` | 3 đến 4 màu | `#111111, #F5F0E6, #E4572E` |

#### Ví dụ đã điền

```text
/opus-video Dàn dựng câu "Làm ít thôi, nhưng làm cho xong" thành kinetic typography 15 giây, khổ 9:16.
Lời khoá cứng, không thêm slogan. Từ khoá cần nhấn: ít, xong.
Có giọng đọc tiếng Việt; nếu có, chữ hiện theo cụm từ của giọng.
Font: Be Vietnam Pro 800 và 400. Bảng màu: #111111, #F5F0E6, #E4572E. Có ít nhất một nhịp đứng yên.
Gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### opus-video sẽ làm gì

- Workflow `motion-graphics`, thêm `embedded-captions` khi có giọng đọc. Blueprint `kinetic-type-beats`, `typewriter-reveal`; rule `kinetic-beat-slam`, `discrete-text-sequence`.
- Thẻ kỹ thuật: Thẻ 4 (chữ đóng vai trò kiến trúc), Thẻ 7 (mask reveal).
- Có giọng thì nhịp chữ theo `words.json` của `eleven.mjs tts`, không ép theo beat nhạc.

#### Case tham khảo

`y:gdgtify-929495` (tra bằng `--category motion --keyword spoken-word`).

#### Lưu ý

- Kiểm dấu tiếng Việt kỹ khi chữ bị biến dạng hoặc phóng to. Agent đổi font sang Be Vietnam Pro nếu preset thiếu dấu.
- Viết tắt giữ chữ hoa; không dùng kiểu chữ thường toàn bộ cho tiếng Việt.

## Tự sự và music video theo beat

### 9. Music video, lyric video theo beat

#### Khi nào dùng

Bạn có một bài nhạc (hoặc muốn agent sinh nhạc nền không lời) và cần video mà mọi cú cắt bám beat: lyric video, video cảm xúc cho dịp lễ, MV ngắn.

#### Prompt mẫu

```text
/opus-video Làm {{loại video}} {{thời lượng}} giây theo bài nhạc {{file nhạc}}, khổ {{khổ hình}}.
Câu chuyện hoặc cảm xúc: {{nội dung}}.
Lời bài hát hiện trên hình: {{lời bài hát}}.
Cắt trên downbeat, cảnh lớn ở đoạn cao trào, cảnh lặng ở đoạn nghỉ. Hình ảnh dùng {{tài sản hình}}.
Phong cách: {{phong cách}}.
Trình beat map và khung hình demo cho tôi duyệt trước khi render bản cuối.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{loại video}}` | Lyric video, MV, video cảm xúc | `lyric video` |
| `{{thời lượng}}` | Độ dài | `45` |
| `{{file nhạc}}` | File nhạc có license; chưa có thì ghi "nhạc nền ElevenLabs" | `shared-assets/bgm/ban-nhac.mp3` |
| `{{khổ hình}}` | `16:9`, `9:16` hoặc `both` | `9:16` |
| `{{nội dung}}` | Một hai câu | `một ngày đi làm về muộn, thành phố lên đèn` |
| `{{lời bài hát}}` | File lời hoặc "không có" | `script/lyrics.txt` |
| `{{tài sản hình}}` | Ảnh, clip của bạn hoặc "dựng bằng hình khối" | `dựng bằng hình khối và chữ` |
| `{{phong cách}}` | Vài chữ | `đêm thành phố, màu neon dịu` |

#### Ví dụ đã điền

```text
/opus-video Làm lyric video 45 giây theo bài nhạc shared-assets/bgm/ban-nhac.mp3, khổ 9:16.
Câu chuyện hoặc cảm xúc: một ngày đi làm về muộn, thành phố lên đèn.
Lời bài hát hiện trên hình: script/lyrics.txt.
Cắt trên downbeat, cảnh lớn ở đoạn cao trào, cảnh lặng ở đoạn nghỉ. Hình ảnh dựng bằng hình khối và chữ.
Phong cách: đêm thành phố, màu neon dịu.
Trình beat map và khung hình demo cho tôi duyệt trước khi render bản cuối.
```

#### opus-video sẽ làm gì

- Workflow `music-to-video`. Blueprint `camera-journey`, `spatial-pan-stations`; rule `kinetic-beat-slam`, `multi-phase-camera`; block từ `catalog --query "beat sync"`.
- Thẻ kỹ thuật: Thẻ 3 (lưới beat theo BPM, có lệnh `hyperframes beats`), Thẻ 7.
- Lời bài hát hiện trên hình là chữ tiếng Việt nên vẫn qua cổng viet-pro.
- Chưa có nhạc thì sinh bằng `eleven.mjs music` (không lời); thoát 3 thì lấy từ `media-use resolve --type bgm`.

#### Case tham khảo

`y:anabology-491441`, `y:anjmaxx-459455`, `y:doubleunplussed-181894` (tra bằng `--category motion --keyword lyric`).

#### Lưu ý

- Chỉ dùng nhạc bạn có quyền dùng. Nguồn ghi vào `assets/CREDITS.md`.
- Sinh video bằng mô hình AI tạo hình (kiểu Seedance, Kling) nằm ngoài phạm vi skill.

### 10. Câu chuyện ngắn có lời dẫn

#### Khi nào dùng

Một câu chuyện ngắn có tình huống, biến cố và insight, kể bằng lời dẫn tiếng Việt trên nền hình dựng mới, hợp với video thương hiệu kể chuyện hoặc video dịp lễ.

#### Prompt mẫu

```text
/opus-video Làm video kể chuyện {{thời lượng}} giây, khổ {{khổ hình}}.
Câu chuyện: {{tóm tắt chuyện}}. Nhân vật và chi tiết lấy từ: {{nguồn chuyện}}.
Insight cuối: {{insight}}.
Lời dẫn tiếng Việt, mở bằng một khoảnh khắc cụ thể. Hình ảnh {{phong cách}}, nhạc nền {{mood nhạc}}.
Không thêm nhân vật hay chi tiết ngoài những gì tôi đưa.
Gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{thời lượng}}` | Độ dài | `60` |
| `{{khổ hình}}` | `16:9`, `9:16` hoặc `both` | `16:9` |
| `{{tóm tắt chuyện}}` | Ba bốn câu | `tiệm sửa xe của ông Tư mở từ năm 1990, ...` |
| `{{nguồn chuyện}}` | Chuyện thật bạn cung cấp | `ghi chú phỏng vấn trong notes/ong-tu.md` |
| `{{insight}}` | Một câu | `nghề giữ được nhờ khách quen, không nhờ quảng cáo` |
| `{{phong cách}}` | Vài chữ | `tranh phẳng màu đất, chuyển cảnh bằng vật thể` |
| `{{mood nhạc}}` | Tâm trạng nhạc | `ấm, chậm, guitar mộc` |

#### Ví dụ đã điền

```text
/opus-video Làm video kể chuyện 60 giây, khổ 16:9.
Câu chuyện: tiệm sửa xe của ông Tư mở từ năm 1990 ở đầu hẻm, ba mươi năm không đổi biển hiệu. Nhân vật và chi tiết lấy từ: ghi chú phỏng vấn trong notes/ong-tu.md.
Insight cuối: nghề giữ được nhờ khách quen, không nhờ quảng cáo.
Lời dẫn tiếng Việt, mở bằng một khoảnh khắc cụ thể. Hình ảnh tranh phẳng màu đất, chuyển cảnh bằng vật thể, nhạc nền ấm, chậm, guitar mộc.
Không thêm nhân vật hay chi tiết ngoài những gì tôi đưa.
Gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### opus-video sẽ làm gì

- Kịch bản theo dòng "Tự sự/music video" trong `script-workflow.md`: đọc `editorial/story-core.md`, `metaphor.md`, `rhythm.md`; ẩn dụ có điểm chạm và callback ở cảnh cuối.
- Workflow `general-video` với giọng `eleven.mjs tts`. Blueprint `camera-journey`; Thẻ 2 (một hình biến thành cảnh sau) hoặc Thẻ 7 cho chuyển cảnh bằng vật thể.

#### Case tham khảo

Chưa có case sát vì `--category story-music --keyword narration` không ra kết quả, nên agent dựa vào pattern-library nhóm Tự sự.

#### Lưu ý

- viet-pro không cho bịa nhân vật, trải nghiệm hay kết quả. Chuyện phải đến từ nguồn bạn đưa.
- Muốn dùng ảnh thật của nhân vật thì cấp ảnh và xác nhận quyền dùng.

## 3D và không gian

### 11. Vật thể hoặc không gian 3D

#### Khi nào dùng

Sản phẩm hay vật thể cần thể hiện độ dày, hoặc một không gian (kiến trúc, mô hình, tái dựng lịch sử) đi qua bằng một cú camera liền, thường 10 đến 20 giây và ít cắt.

#### Prompt mẫu

```text
/opus-video Dựng cảnh 3D {{thời lượng}} giây về {{chủ thể}}, khổ {{khổ hình}}.
Camera: {{hành trình camera}}. Phong cách ánh sáng và tô bóng: {{phong cách}}.
Dữ liệu hình dáng lấy từ {{nguồn dữ liệu}}; chi tiết nào không có nguồn thì để đơn giản.
Chữ trên hình tiếng Việt: {{chữ trên hình}}. Nhạc nền {{mood nhạc}}.
Gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{thời lượng}}` | Độ dài | `15` |
| `{{chủ thể}}` | Vật thể hoặc không gian | `mô hình nhà phố ba tầng` |
| `{{khổ hình}}` | `16:9`, `9:16` hoặc `both` | `16:9` |
| `{{hành trình camera}}` | Camera đi từ đâu tới đâu | `từ mặt tiền lia lên mái rồi xoay quanh` |
| `{{phong cách}}` | Kiểu tô bóng | `toon shading 3 bậc, viền mảnh` |
| `{{nguồn dữ liệu}}` | Bản vẽ, kích thước | `bản vẽ mặt bằng trong assets/ban-ve.pdf` |
| `{{chữ trên hình}}` | Vài nhãn | `tên dự án, diện tích sàn` |
| `{{mood nhạc}}` | Tâm trạng nhạc | `nhẹ, rộng, không lời` |

#### Ví dụ đã điền

```text
/opus-video Dựng cảnh 3D 15 giây về mô hình nhà phố ba tầng, khổ 16:9.
Camera: từ mặt tiền lia lên mái rồi xoay quanh. Phong cách ánh sáng và tô bóng: toon shading 3 bậc, viền mảnh.
Dữ liệu hình dáng lấy từ bản vẽ mặt bằng trong assets/ban-ve.pdf; chi tiết nào không có nguồn thì để đơn giản.
Chữ trên hình tiếng Việt: tên dự án, diện tích sàn. Nhạc nền nhẹ, rộng, không lời.
Gửi tôi plan và khung hình demo trước khi render bản cuối.
```

#### opus-video sẽ làm gì

- Three.js trong HyperFrames nếu seek được (workflow `general-video`, blueprint `camera-journey`, `zoom-out-workspace-reveal`, rule `3d-camera-flight`, `orbit-3d-entry`). Không seek được thì raw Three.js với clock giả định, chụp frame bằng Playwright rồi ghép bằng ffmpeg (`engine-selection.md`).
- Thẻ kỹ thuật: Thẻ 5 (camera), Thẻ 6 nếu cần vòng lặp, Thẻ 8.

#### Case tham khảo

`y:twoclipping-496100`, `y:raphaelaubryy-687877`, `y:twoclipping-000267` (tra bằng `--category 3d --keyword product`). Tái dựng không gian lịch sử: `y:alexalbert-274839` (tra bằng `--category 3d --keyword 1906`).

#### Lưu ý

- Blender và After Effects nằm ngoài phạm vi skill.
- Đường raw Canvas không có lint, check hay studio, nên vòng QA dựa nhiều hơn vào khung hình demo.
