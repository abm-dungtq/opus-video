# Chọn engine dựng

Trong corpus 513 case (yihui), Opus 5.5 hầu như luôn viết animation thành code: canvas có 351 case, svg 219, threejs 147, shader 104, gsap 100. Muốn ra MP4 thì phải có một engine **seek được theo thời gian** để chụp từng frame. Thứ tự ưu tiên như sau.

## 1. HyperFrames (mặc định)

Dùng cho phần lớn trường hợp. Gọi skill `hyperframes` (cửa vào bắt buộc). Có `BRIEF.md` với trường `workflow:` thì nó đi thẳng vào workflow tương ứng. Các workflow có pipeline audio riêng (faceless-explainer, product-launch-video, pr-to-video) dùng được giọng ElevenLabs tiếng Việt nhờ cầu nối `eleven.mjs audio-meta` (xem `audio-pipeline.md` § Cầu nối HyperFrames). Chạy cầu nối này **thay cho** `audio.mjs generate` của workflow:

| Loại video | Workflow HyperFrames |
|---|---|
| Explainer không footage, kiến thức, list, how-to | `faceless-explainer` khi đã chạy `eleven.mjs audio-meta`; `general-video` khi dựng tay |
| Quảng cáo / ra mắt sản phẩm, có URL | `product-launch-video` |
| Bám nhạc: lyric video, slideshow theo beat | `music-to-video` |
| Ngắn, không lời, motion là chính (intro, title) | `motion-graphics` |
| Dài hơn, nhiều cảnh, montage, sizzle | `general-video` |
| Phụ đề nằm trong video | `embedded-captions` (dùng kèm) |
| Footage thật: talking-head, phỏng vấn, UGC cần cắt khoảng lặng | nhánh footage (beta), xem `references/footage-lane.md` |
| Nhiều biến thể của một mẫu quảng cáo | composition có biến + `render --batch` |

CLI (binary đã cài, `hyperframes` ≥ 0.8.144): `lint` → `check` → `render`. Trước khi tự viết motion, tìm primitive có sẵn bằng `hyperframes catalog --query "<hiệu ứng>"`.

## 2. Remotion (`ak-remotion`)

Dùng khi người dùng yêu cầu React hoặc đã có codebase Remotion. Nhiều biến thể của cùng một mẫu (headline, giá, CTA, tên cửa hàng) **không** còn là lý do chọn Remotion: dùng HyperFrames `render --variables` / `--batch rows.json --output "renders/{name}.mp4"` với `data-composition-variables` (xem `hyperframes-cli/references/compare-and-batch.md`). Trong corpus có 89 prompt nhắc tới Remotion, chủ yếu là video sản phẩm và data. Chỉ chọn khi có lý do rõ, và ghi lý do vào `engine_reason`.

## 3. Raw HTML/Canvas/Three.js + Playwright + ffmpeg

Dùng khi cần shader hoặc generative nặng mà HyperFrames không seek được (simulation có trạng thái, WebGL tự viết). Công thức:

1. Trang HTML chạy bằng một **clock giả định**: `window.__t` do script điều khiển, không dùng `requestAnimationFrame` theo thời gian thật. Mọi chuyển động phải là hàm thuần của `t`.
2. Script Playwright: với `i = 0..N-1`, đặt `__t = i / fps`, gọi hàm render, rồi `page.screenshot({ path: frames/frame_%05d.png })`.
3. Ghép frame: `ffmpeg -framerate 60 -i frames/frame_%05d.png -i audio_mix.wav -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest out.mp4`

Chỉ dùng khi hai engine trên không làm được, vì đường này không có lint, check hay studio.

## Font preset & tiếng Việt

Mỗi frame preset (`hyperframes-creative/frame-presets/`) nạp font từ Google Fonts, và không phải font nào cũng đủ dấu tiếng Việt.
- **Đã kiểm chứng (2026-10-08):** mọi file Inter có sẵn trong các skill HyperFrames (`code-editorial`, `embedded-captions`, `talking-head-recut`) đều là subset latin, **thiếu** ư ễ đ ạ ơ. Không có Playfair Display local. `captions.mjs` cũng bắt buộc có file font trong `assets/fonts/`. Vì vậy với video tiếng Việt, **mặc định thay mọi `fontFamily` trong `frame.md` bằng `Be Vietnam Pro`** (`node $OV/scripts/replace-in-file.mjs frame.md 'fontFamily: "[^"]*"' 'fontFamily: "Be Vietnam Pro"'`) và copy `BeVietnamPro-{Regular,Medium,SemiBold,Bold}.ttf` (tải từ Google Fonts; nếu đã cài thì nằm ở `~/Library/Fonts/` trên macOS, `~/.local/share/fonts/` trên Linux, `%LOCALAPPDATA%\Microsoft\Windows\Fonts\` trên Windows) vào `assets/fonts/` ngay sau `build-frame.mjs`, **trước** khi giao việc cho các frame worker.
- Cách kiểm tra: render 1 frame có chuỗi `Ánh nắng ơ ư đ ễ ạ ỹ`, rồi trích ảnh bằng `ffmpeg -ss T -frames:v 1` để xem.
- Thiếu dấu hoặc lẫn font fallback: đặt `fontFamily` của role đó trong `frame.md` thành `Be Vietnam Pro`, rồi copy file `.ttf` vào `assets/fonts/` **trước** khi chạy `captions.mjs build`. Nếu không, lint sẽ báo `font_family_without_font_face`.

## Ngoài phạm vi

Blender (12 case trong corpus chuspeeism) và After Effects (5 case) có xuất hiện, nhưng skill này không điều khiển chúng.

## Hai khổ hình: 16:9 và 9:16

### Một index.html cho cả hai khổ (mặc định cho dự án mới)

Dự án mới có `aspect: both` chỉ có một thư mục và một `index.html` 16:9 (tạo bằng `composition.mjs init`). Bản 9:16 và 1:1 được sinh từ file đó, không crop thô.

1. **Dựng 16:9 kèm override.** Bố cục đặt trong class, không viết inline style, vì CSS không ghi đè được inline style. Khung lấy kích thước từ `--W`/`--H`. Phần khác cho khổ dọc viết trong khối `html[data-ratio="9x16"] …` (khổ vuông là `html[data-ratio="1x1"] …`) của `index.html`: vùng an toàn, cỡ chữ, bố cục trái–phải chuyển thành trên–dưới. Skeleton có sẵn một ví dụ cho `.headline`.
2. **Sinh bản dọc.** Chạy `node $OV/scripts/reframe.mjs . --ratio 9x16` (hoặc `--ratio 1x1`). Lệnh tạo `../<tên>-9x16/` với root 1080×1920, `data-ratio="9x16"` và `aspect: 9:16` trong BRIEF. `assets/` được hard-link nên dùng chung giọng đọc, nhạc và SFX. Mỗi dòng `WARN layout` chỉ ra một giá trị `left/top/width/height` ≥ 1080 px nằm ngoài khối override: sửa giá trị đó trong bản gốc. Không sửa thư mục bản dọc. Mỗi lần bản gốc đổi thì chạy lại với `--force`.
3. **Kiểm tra trong thư mục mới.** `cd ../<tên>-9x16 && npx --yes hyperframes@0.8.144 lint && npx --yes hyperframes@0.8.144 check`.
4. **Render** trong thư mục mới như bản 16:9 (`render-final.mjs` hoặc `npm run render`), rồi nén theo bước 9 của quy trình.

Giới hạn cần biết:

- `--force` chỉ thay thư mục rỗng hoặc thư mục do chính `reframe.mjs` tạo cho bản gốc này (có tệp `.reframe.json`). Thư mục khác bị từ chối, kể cả khi có `--force`.
- Dòng `WARN layout` chỉ quét `left/top/width/height` trong CSS và `style=""`. Lệnh không bắt `x:` hay `translate(...px)` của GSAP, không bắt `right/bottom/inset`, cũng không bắt `data-width="1920"` ở root của composition con trong `compositions/`. Hết WARN chưa có nghĩa bố cục đã vừa khung: vẫn phải xem bản dọc.
- `assets/` của bản dọc là hard-link tới file của bản gốc. Công cụ nào ghi đè một file trong `assets/` của bản dọc cũng đổi luôn file của bản gốc. Sửa và sinh asset trong bản gốc.
- Bản 1:1 ghi `data-resolution="square"`. Đây là tên preset 1080×1080 có trong `hyperframes render --resolution` của 0.8.144. Đã kiểm: `npx --yes hyperframes@0.8.144 lint` trên một bản 1:1 trong `/tmp` cho 0 lỗi (2026-10-15).

Dự án cũ, dự án tạo bằng `new-project.sh --legacy-pair` và workflow frame-worker vẫn làm bản 9:16 bằng cách copy thành dự án riêng như các mục dưới đây. `reframe.mjs` từ chối dự án có `compositions/frames/`.

### Cách cũ: composition hoặc dự án riêng cho từng khổ

- Trong HyperFrames, `--resolution` chỉ đổi kích thước render, còn khổ hình phải khớp composition. Vì vậy mỗi khổ cần **một composition riêng**:
  - `index.html`: 1920×1080 → `hyperframes render --output renders/<name>-16x9.mp4`
  - `compositions/main-9x16.html`: 1080×1920 → `hyperframes render -c compositions/main-9x16.html --output renders/<name>-9x16.mp4`
- Với `aspect: both`, dựng 16:9 trước rồi **dàn lại bố cục** cho 9:16. Không crop thô.
  - Vùng an toàn của 9:16: không đặt nội dung chính trong 12% phía trên và 20% phía dưới (UI của TikTok/Reels/Shorts).
  - Chữ to hơn khoảng 1,3 lần so với bản 16:9. Mỗi dòng tối đa khoảng 18 ký tự cho tiêu đề.
  - Bố cục ngang (trái–phải) chuyển thành dọc (trên–dưới).
- Dùng chung một bộ audio (voice, sfx, bgm) cho cả hai khổ để timing giống nhau.
- Bài học từ lần chạy thử (lint HyperFrames 0.8.140–0.8.141):
  - Từ 0.8.144, `../assets/...` trong `compositions/` đã qua lint; chỉ đường dẫn ra ngoài project mới lỗi. Vẫn nên viết `assets/...` cho thống nhất.
  - `window.__timelines["<id>"] = …` phải nằm inline trong từng file HTML (lỗi `missing_timeline_registry`). Logic chung đặt trong `assets/<name>.js`, file đó export một hàm build trả về timeline.
  - Mỗi SFX đặt trên một `data-track-index` riêng và có `data-duration`, để tránh cảnh báo `duplicate_audio_track`.
  - Chữ trắng trên nền màu nhấn phải đạt contrast ≥ 3:1. `hyperframes check` sẽ báo nếu không đạt.
  - GSAP nạp từ CDN lúc render, nên render offline sẽ lỗi. Cần offline thì tải gsap.min.js vào `assets/` và trỏ tới bản local.
- Bài học từ smoke v2 (workflow faceless-explainer, 2026-10-08):
  - Với workflow có frame worker, bản 9:16 là **một project riêng**: copy project, bỏ `compositions/frames/` và `.hyperframes/frame-packets/`, đổi `format: 1080x1920` trong STORYBOARD. Sau đó chạy lại frame-packets → workers (dispatch ghi `canvas 1080x1920` và vùng nội dung y 230–1320) → `captions.mjs build` → assemble → transitions. Giữ nguyên `audio_meta.json` và sidecar.
  - `captions.mjs build` cho 1080×1920 đặt caption band ở `top: 1600px`, tức nằm trong vùng bị UI che. Sửa `--cap-band-top: 1340px; --cap-band-height: 200px` trong `compositions/captions.html`. Mỗi lần build lại caption phải sửa lại.
  - `assemble-index` từ chối frame có hai clip **cùng `data-track-index`** mà khung thời gian chồng nhau. Dặn worker cho mỗi clip một lane riêng.
  - Thời lượng frame bằng đúng thời lượng voice, nên frame CTA cuối không còn nhịp giữ hình. Tăng `duration` của frame cuối trong STORYBOARD và `data-duration` trong file frame thêm khoảng 1 giây, rồi assemble lại.
  - Trường `blueprint:` trong STORYBOARD chỉ được ghi `<id>` hoặc `<id> (Adapt)`, vì `frame-packets.mjs` lấy nguyên chuỗi đó làm tên file. Muốn gợi ý registry block thì ghi vào dòng riêng `- registry_block: compositions/components/<name>.html`.
  - `build-frame.mjs` remix màu theo độ sáng nên có thể gán sai vai. Ví dụ ở dự án ABM, `cream-muted` (chữ phụ trên nền tối) bị gán thành navy đậm. Sau khi build phải đọc khối `colors:` trong `frame.md` và sửa tay các vai chữ sáng trên nền tối. Đồng thời đổi mọi font label/mono (IBM Plex Mono…) sang Be Vietnam Pro. (0.8.144 chỉ sửa phần tự kiểm contrast, phần remix vẫn vậy.)
  - Một số caption skin (ví dụ broadside) có `text-transform: lowercase`. Với tiếng Việt, kiểu này biến "AI" thành "ai" (nghĩa là "người nào") và "ABM" thành "abm". Ngay sau `build-frame.mjs`, sửa thành `none` trong `.hyperframes/caption-skin.html` để mọi lần dựng phụ đề sau đều đúng. Nhắc frame worker giữ nguyên chữ hoa cho từ viết tắt.
  - Lỗi lint/check hay gặp ở frame worker: xem `references/edit-method.md` § Kỷ luật GSAP / render.
