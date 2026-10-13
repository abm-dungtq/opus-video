# Vận hành sau khi dựng

Nhóm prompt cho việc sau khi dự án đã dựng xong hoặc đã có bản giao: sửa lời, đổi âm thanh, xuất lại, viết caption, kiểm tra trước khi giao, dọn file. Các mục này không cần tra case mẫu, nên phần case tham khảo ghi "chưa có case sát". Cấu trúc mỗi mục giải thích ở [README.md](README.md).

Hai mục 27 và 30 dùng script của workspace studio (`scripts/compress-final.sh`, `scripts/sweep-after-final.sh`), không thuộc opus-video. Xem mục 9 của [hướng dẫn chuyên sâu](../huong-dan-chuyen-sau.md). Không có workspace studio thì dùng `node $OV/scripts/export.mjs --project ./ --input renders/<tên>.mp4 --target facebook` thay cho `compress-final.sh`.

### 25. Sửa một câu lời đọc

#### Khi nào dùng

Video đã dựng, bạn muốn đổi một câu lời đọc (sai thông tin, đọc không tự nhiên, đổi cách nói) mà không làm lại cả dự án.

#### Prompt mẫu

```text
/opus-video Trong dự án {{thư mục dự án}}, sửa câu lời đọc số {{số câu}}.
Câu hiện tại: "{{câu cũ}}". Câu mới: "{{câu mới}}".
Sửa cả script-table.md, script/{{số câu}}.txt và SCRIPT.md nếu có, chạy lại lint và cổng viet-pro, chỉ tạo lại giọng của câu này.
Chỉnh timing cảnh theo thời lượng giọng mới. Nếu hình thay đổi, gửi tôi khung hình demo mới để duyệt trước khi render lại bản cuối.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{thư mục dự án}}` | Dự án cần sửa | `lai-kep` |
| `{{số câu}}` | Số thứ tự file trong `script/` | `03` |
| `{{câu cũ}}` | Câu đang có | `Gửi sớm thì tiền tự lớn.` |
| `{{câu mới}}` | Câu thay thế | `Gửi sớm hơn thì thời gian làm phần việc khó nhất.` |

#### Ví dụ đã điền

```text
/opus-video Trong dự án lai-kep, sửa câu lời đọc số 03.
Câu hiện tại: "Gửi sớm thì tiền tự lớn." Câu mới: "Gửi sớm hơn thì thời gian làm phần việc khó nhất."
Sửa cả script-table.md, script/03.txt và SCRIPT.md nếu có, chạy lại lint và cổng viet-pro, chỉ tạo lại giọng của câu này.
Chỉnh timing cảnh theo thời lượng giọng mới. Nếu hình thay đổi, gửi tôi khung hình demo mới để duyệt trước khi render lại bản cuối.
```

#### opus-video sẽ làm gì

- Sửa `script-table.md`, `script/NN.txt`, `SCRIPT.md`; chạy lint viet-pro, cập nhật biên bản `## viet_pro`, chạy `check-viet-pro.mjs --project .` tới khi `PASS`.
- Dựng tay: `eleven.mjs tts --text-file script/NN.txt --out assets/voice/NN.mp3` cho đúng câu đó. Workflow HyperFrames: `eleven.mjs audio-meta … --reuse`, các câu có dấu kiểm khớp được dùng lại, chỉ câu đã sửa tốn credit.
- Câu sửa đổi con số hay tên riêng có thể làm `compare-preserved-content` báo MISMATCH so với `script-table.v1.md`; agent đọc lại và hỏi bạn, không sửa bản nháp để lách cổng.
- Composition sửa sau lần chụp demo là WARN ở cổng final; thay đổi nhìn thấy được thì chụp lại demo và xin duyệt lại, rồi render qua `render-final.mjs`.

#### Case tham khảo

Chưa có case sát (việc vận hành, không cần tra corpus).

#### Lưu ý

- Không chép mp3 từ chỗ khác vào `assets/voice/`. Cổng giao chặn mp3 không có dấu kiểm hoặc lệch với `script/NN.txt`.
- Con số mới cần nguồn trong `SOURCES.md`.

### 26. Đổi nhạc nền hoặc SFX

#### Khi nào dùng

Bạn muốn đổi nhạc nền (tâm trạng khác, nhịp khác) hoặc thay vài tiếng SFX mà giữ nguyên lời đọc và hình.

#### Prompt mẫu

```text
/opus-video Trong dự án {{thư mục dự án}}, đổi nhạc nền thành {{mô tả nhạc}} và {{thay đổi SFX}}.
Giữ nguyên lời đọc và hình. Nhạc không lời, dài bằng video, đặt dưới giọng đọc theo mức trong audio-pipeline.
Ghi nguồn mới vào assets/CREDITS.md. Đo lại loudness sau khi render.
Render lại bản cuối qua render-final.mjs khi xong.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{thư mục dự án}}` | Dự án cần sửa | `xuong-moc-an` |
| `{{mô tả nhạc}}` | Tâm trạng, nhạc cụ, BPM | `guitar mộc ấm, 100 BPM` |
| `{{thay đổi SFX}}` | SFX nào bỏ, thêm, thay | `bỏ tiếng whoosh ở cảnh 2, thêm tiếng click nhẹ khi logo hiện` |

#### Ví dụ đã điền

```text
/opus-video Trong dự án xuong-moc-an, đổi nhạc nền thành guitar mộc ấm, 100 BPM và bỏ tiếng whoosh ở cảnh 2, thêm tiếng click nhẹ khi logo hiện.
Giữ nguyên lời đọc và hình. Nhạc không lời, dài bằng video, đặt dưới giọng đọc theo mức trong audio-pipeline.
Ghi nguồn mới vào assets/CREDITS.md. Đo lại loudness sau khi render.
Render lại bản cuối qua render-final.mjs khi xong.
```

#### opus-video sẽ làm gì

- Nhạc: `eleven.mjs music --prompt "<mô tả tiếng Anh, có BPM>" --seconds <độ dài> --out assets/bgm/<tên>.mp3`. Thoát 3 kèm `MUSIC_UNAVAILABLE` thì `hyperframes media-use resolve --type bgm`.
- SFX: thử `hyperframes media-use resolve --type sfx` trước, không hợp thì `eleven.mjs sfx`. Mỗi tiếng gắn với một hành động hình, tối đa 2 tiếng trong 3 giây.
- Mức âm: nhạc khi có giọng -28 đến -31 LUFS, bản master khoảng -14 LUFS và -1 dBTP, chỉnh bằng `hyperframes normalize-audio` rồi đo lại.
- Nhạc và SFX không qua cổng viet-pro, nhưng bản giao vẫn đi qua `render-final.mjs`.

#### Case tham khảo

Chưa có case sát (việc vận hành, không cần tra corpus).

#### Lưu ý

- Gói Creator cho tối đa 2 luồng song song, nên agent không gọi music song song.
- Nhạc bạn tự đưa vào phải là nhạc bạn có quyền dùng.

### 27. Xuất lại bản nén để giao

#### Khi nào dùng

Bản render cuối quá nặng để gửi hoặc đăng. Bạn cần bản nén giữ nguyên độ phân giải, fps. Mục này dùng script của workspace studio; cần bản riêng cho từng nơi đăng (Zalo, YouTube, TikTok, Facebook) kèm thumbnail thì dùng `export.mjs` của opus-video, xem lưu ý cuối mục.

#### Prompt mẫu

```text
Nén {{file render}} thành file giao {{file ra}} bằng ./scripts/compress-final.sh trong workspace studio.
Kiểm lại file ra: độ phân giải, fps, thời lượng, bitrate. Không xoá file nguồn cho tới khi tôi xác nhận file giao.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{file render}}` | Bản render bằng `render-final.mjs` | `lai-kep/renders/lai-kep-16x9.mp4` |
| `{{file ra}}` | Tên file giao, nên chứa chữ `final` | `lai-kep/renders/lai-kep-final-16x9.mp4` |

#### Ví dụ đã điền

```text
Nén lai-kep/renders/lai-kep-16x9.mp4 thành file giao lai-kep/renders/lai-kep-final-16x9.mp4 bằng ./scripts/compress-final.sh trong workspace studio.
Kiểm lại file ra: độ phân giải, fps, thời lượng, bitrate. Không xoá file nguồn cho tới khi tôi xác nhận file giao.
```

#### opus-video sẽ làm gì

- Việc nén do `compress-final.sh` làm: H.264 8 Mbit/s, tiếng AAC 192 kbit/s, giữ độ phân giải và fps. Nguồn đã từ 12 Mbit/s trở xuống thì script không nén lại. Script không ghi đè file ra đã có và tự xoá file ra khi độ phân giải, fps hoặc thời lượng bị lệch.
- Kiểm lại bằng `qc-mp4.mjs` (luật `BITRATE` cảnh báo trên 12 Mbit/s).

#### Case tham khảo

Chưa có case sát (việc vận hành, không cần tra corpus).

#### Lưu ý

- Prompt này không mở đầu bằng `/opus-video` vì nén là việc của script studio; agent vẫn đọc được prompt trong cùng phiên.
- Cần render lại vì composition thay đổi thì đi qua `render-final.mjs` trước, rồi mới nén.
- Ngoài workspace studio, hoặc khi cần bản theo nơi đăng, nhờ `/opus-video` chạy `node $OV/scripts/export.mjs --project ./ --input renders/<tên>.mp4 --target facebook` (hoặc `zalo`, `youtube`, `tiktok`, cách nhau bằng dấu phẩy). Script chạy lại cổng final, ghi `<tên>-<target>.mp4` và `<tên>-thumb.jpg` cạnh file nguồn, lấy thumbnail từ khung demo đã duyệt. Thông số `zalo` và `facebook` là giả định, xem mục 10.2 của [hướng dẫn chuyên sâu](../huong-dan-chuyen-sau.md).

### 28. Viết caption Facebook và TikTok

#### Khi nào dùng

Video đã xong và bạn cần caption để đăng. Với video tiếng Việt, bước này bắt buộc trước khi agent gửi link video.

#### Prompt mẫu

```text
/opus-video Viết CAPTIONS.md cho dự án {{thư mục dự án}}: một caption Facebook cá nhân và một caption TikTok.
Cùng insight và số liệu với video, không thêm claim mới. Hook viết lại theo kênh, không chép câu mở của video.
Hashtag: {{hashtag}}. Lời kêu gọi (nếu cần): {{lời kêu gọi}}.
Qua đủ quy trình viet-pro và cổng check-viet-pro --stage delivery.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{thư mục dự án}}` | Dự án | `lai-kep` |
| `{{hashtag}}` | 3 đến 5 hashtag đúng chủ đề, hoặc "không" | `#taichinhcanhan #laikep #tietkiem` |
| `{{lời kêu gọi}}` | Một hành động cụ thể, hoặc "không" | `không` |

#### Ví dụ đã điền

```text
/opus-video Viết CAPTIONS.md cho dự án lai-kep: một caption Facebook cá nhân và một caption TikTok.
Cùng insight và số liệu với video, không thêm claim mới. Hook viết lại theo kênh, không chép câu mở của video.
Hashtag: #taichinhcanhan #laikep #tietkiem. Lời kêu gọi (nếu cần): không.
Qua đủ quy trình viet-pro và cổng check-viet-pro --stage delivery.
```

#### opus-video sẽ làm gì

- Đọc thêm `publishing/facebook.md` và `publishing/repurpose-matrix.md` của viet-pro; soạn, lượt Humanizer có ghi chép, lint riêng từng caption.
- Facebook cá nhân: văn xuôi liền mạch, không heading hay bullet trong mục. TikTok: dòng đầu tự đứng được, một insight, hashtag đặt cuối.
- Biên bản `## viet_pro` thêm dòng `captions`; cổng `check-viet-pro.mjs --stage delivery` chạy trong thư mục dự án phải `PASS`.

#### Case tham khảo

Chưa có case sát (việc vận hành, không cần tra corpus).

#### Lưu ý

- Agent không tự đăng caption hay video.
- Cần caption YouTube thì thêm vào prompt; agent làm theo cùng quy trình với mục `## YouTube`.

### 29. QC trước khi giao

#### Khi nào dùng

Bản giao đã render và bạn muốn một lượt kiểm cuối có bằng chứng: kỹ thuật file, chữ trên hình, cổng kịch bản và caption, plan và demo.

#### Prompt mẫu

```text
/opus-video Kiểm bản giao {{file giao}} của dự án {{thư mục dự án}} trước khi gửi.
Chạy kiểm kỹ thuật MP4, video-lint, cổng check-preflight --stage final và check-viet-pro --stage delivery.
Có agy thì cho Gemini xem và chấm. Ghi kết quả vào QA.md. Lỗi nào cần sửa thì báo tôi kèm khung hình, chưa tự sửa.
Liệt kê các mục tôi cần tự nghe.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{file giao}}` | MP4 cần kiểm | `renders/lai-kep-final-16x9.mp4` |
| `{{thư mục dự án}}` | Dự án | `lai-kep` |

#### Ví dụ đã điền

```text
/opus-video Kiểm bản giao renders/lai-kep-final-16x9.mp4 của dự án lai-kep trước khi gửi.
Chạy kiểm kỹ thuật MP4, video-lint, cổng check-preflight --stage final và check-viet-pro --stage delivery.
Có agy thì cho Gemini xem và chấm. Ghi kết quả vào QA.md. Lỗi nào cần sửa thì báo tôi kèm khung hình, chưa tự sửa.
Liệt kê các mục tôi cần tự nghe.
```

#### opus-video sẽ làm gì

- `node $OV/scripts/qc-mp4.mjs <file.mp4> --project <thư mục dự án> --write-qa`: khổ hình, thời lượng, khung đen, đứng hình, khoảng lặng, loudness, true peak, bitrate. Thoát 1 khi có FAIL.
- `video-lint.mjs --hyperframes .`, `check-preflight.mjs --stage final`, `check-viet-pro.mjs --stage delivery`.
- `judge.mjs check`; thoát 3 hoặc 4 thì QA bằng ảnh tĩnh và ghi "không có giám khảo video".
- Thanh điệu tiếng Việt và giọng đọc được liệt kê là mục bạn tự nghe.

#### Case tham khảo

Chưa có case sát (việc vận hành, không cần tra corpus).

#### Lưu ý

- Nền tối dễ làm phát hiện khung đen báo nhầm; agent trích khung ra xem trước khi kết luận.
- Vòng sửa và render lại tối đa ba phiên bản theo `qa-checklist.md`.

### 30. Dọn file sau khi có bản final

#### Khi nào dùng

Dự án đã có bản final và bạn muốn giải phóng dung lượng: xoá master nặng, khung QA, phần sinh ra không còn là đầu vào. Mục này dùng script của workspace studio.

#### Prompt mẫu

```text
Chạy ./scripts/sweep-after-final.sh {{dự án}} trong workspace studio, chỉ liệt kê trước.
Video cần giữ: {{file cần giữ}}.
Gửi tôi danh sách sẽ xoá và dòng "Giữ:". Chỉ chạy lại với --apply khi tôi đồng ý.
```

#### Bảng biến

| Biến | Ý nghĩa | Ví dụ |
|---|---|---|
| `{{dự án}}` | Thư mục dự án ngay dưới studio | `lai-kep` |
| `{{file cần giữ}}` | Video giữ lại; bỏ trống thì script giữ file tên chứa `final`, `delivery` hoặc `compressed` | `renders/lai-kep-final-16x9.mp4` |

#### Ví dụ đã điền

```text
Chạy ./scripts/sweep-after-final.sh lai-kep trong workspace studio, chỉ liệt kê trước.
Video cần giữ: renders/lai-kep-final-16x9.mp4.
Gửi tôi danh sách sẽ xoá và dòng "Giữ:". Chỉ chạy lại với --apply khi tôi đồng ý.
```

#### opus-video sẽ làm gì

- Việc dọn do `sweep-after-final.sh` làm. Không có `--apply` thì chỉ in danh sách. File cần giữ truyền bằng `--keep renders/<file>`.
- Script không đụng `assets/` (gồm giọng, `words.json`, `*.gate.json`), `audio_meta.json`, `audio_engine_meta.json`, `script/`, `compositions/`, file `.md`, `footage/`, `shared-assets/`.

#### Case tham khảo

Chưa có case sát (việc vận hành, không cần tra corpus).

#### Lưu ý

- Xoá ảnh demo thì lần `render-final` sau phải chạy lại `make-demo.mjs` và xin duyệt lại, vì cổng final đòi PNG mới hơn `PLAN.md`.
- Nhiều video mà không file nào tên `final` hay `delivery` thì script dừng, không xoá gì. Footage gốc trong `footage/raw/` chỉ xoá khi bạn yêu cầu.
