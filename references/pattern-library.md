# Pattern library — công thức theo nhóm video

Rút ra từ 813 case trong hai repo MIT (yihui-dev: 513 case, 279 prompt đầy đủ; chuspeeism: 300 case, 36 prompt công khai). Phần này là bản tóm lược viết lại, không chép nguyên văn prompt. Muốn xem prompt gốc thì chạy `scripts/find-cases.mjs`, hoặc mở `data/exemplars.md`. Brief để điền nằm ở `brief-template.md`, còn engine thì xem `engine-selection.md`.

Cách đọc số liệu: "N/549" là số prompt có chứa từ khoá, tính trên 513 prompt của yihui (gồm cả bản trích một phần) và 36 prompt công khai của chuspeeism. "N/279" là số prompt đầy đủ của yihui có chứa từ khoá. Đây là tần suất thô dùng để định hướng, không phải thống kê chặt chẽ.

## Cấu trúc prompt chung

Những prompt cho ra video tốt nhất trong corpus có chung một bộ xương. Nhóm dùng thẻ XML (`<inputs>`, `<direction>`/`<art_direction>`, `<structure>`, `<build>`, `<gotchas>`, `<start>`) xuất hiện trong khoảng 13–14 prompt và là nhóm chi tiết nhất. Phần lớn các prompt còn lại chỉ có một câu kiểu "showreel cho CV, go all out" (115/549).

1. **`<inputs>`**: liệt kê trước những thứ cần người dùng cung cấp (tên sản phẩm, 3–12 trạng thái UI, màu nhấn, footage thật, bài nhạc có license) rồi mới bắt tay làm.
2. **`<deliverables>`**: thời lượng chính xác, độ phân giải, fps, MP4 kèm mã nguồn chỉnh được, cộng câu "build, render, inspect, refine — không dừng ở storyboard". Thời lượng 15 giây áp đảo (106/549), sau đó là 30 giây (29) và 60 giây (4). 60 fps xuất hiện 29 lần. 9:16/vertical 18 lần, thường đi kèm yêu cầu "giữ nội dung trong vùng an toàn 9:16".
3. **`<art_direction>`**: 3–5 màu hex, một font sans (Geist/Inter rất phổ biến), có thể thêm một serif hoặc mono. Mỗi shot chỉ một ý, chừa nhiều khoảng trống. Kèm **banned list** (15/549 ghi rõ chữ "banned"). Những thứ hay bị cấm: crossfade/blur-in, glow/neon, particle burst, RGB split, camera shake, easing nảy, gradient trên UI chrome, kiểu template.
4. **`<structure>`**: lưới beat. 120 BPM chiếm đa số (BPM 24/549, "beat" 37/549). Ghi tổng số bar hoặc beat, rồi theo nguyên tắc "mỗi beat có một chuyện xảy ra". Storyboard có mốc thời gian dạng `0.0–0.6s`.
5. **`<build>`**: render tất định. Mọi style là hàm thuần của `seek(t)` (15/549): không dùng CSS transition, timer hay state giữa các frame. Spring dạng closed-form, mỗi lần đổi đích cộng thêm một spring (12/549). Chụp 3–6 subframe rồi trộn bằng `ffmpeg tmix` để có motion blur (19/549). Phân tích nhạc bằng numpy để lấy beat grid (12/549). Đặt SFX theo **đỉnh đo được** chứ không theo điểm đầu file (13/549). Loudnorm về −14 LUFS.
6. **Vòng build → render → inspect → refine**: render một still cho mỗi beat (contact sheet) trước khi render toàn bộ, sửa chỗ chật, tràn hoặc khó đọc, rồi mới render hết (19/549 có bước kiểm tra frame).
7. **`<gotchas>` và `<start>`**: ghi lại các bẫy kỹ thuật. Cuối prompt yêu cầu "hỏi input rồi trình storyboard trên beat grid trước khi viết code".

Công cụ được nhắc đến (`/tmp/ov-stats.json`): Remotion 89 bài (chủ yếu trong phần mô tả bài đăng), HyperFrames 38, three 44, ffmpeg 20, Playwright 16, ElevenLabs 10 (thêm 5 bài bên chuspeeism), GSAP 7. Tech tags: canvas 351, svg 219, threejs 147, shader 104, gsap 100.

**Audio trong skill này:** dùng ElevenLabs cho mọi khâu. Giọng đọc dùng TTS `eleven_v4`, SFX dùng `eleven.mjs sfx` (ưu tiên catalog trước), nhạc nền dùng `music_v2_5`. Trong corpus, người ta thường lấy nhạc Mixkit hoặc tổng hợp âm thanh bằng numpy/Web Audio. Với skill này, các bước đó được thay bằng ElevenLabs, nhưng vẫn giữ nguyên quy tắc đặt SFX theo đỉnh và loudnorm. Chi tiết ở `audio-pipeline.md`.

## Motion graphics / intro

**Khi nào dùng:** intro thương hiệu, bumper hay logo sting, kiểu "showreel cho CV". Video ngắn, không lời, tác động chủ yếu bằng hình và nhạc. Đây là nhóm lớn nhất (motion 317/513, 动效与片头 70/300).

**Engine gợi ý:** HyperFrames là mặc định (workflow `motion-graphics`). Chuyển sang Remotion khi người dùng muốn React hoặc cần sinh từ dữ liệu. Nếu cần shader hay generative nặng thì dùng raw Canvas/WebGL, chụp frame bằng Playwright rồi ghép bằng ffmpeg.

**Nhịp và thời lượng:** 15 giây là chuẩn ngầm (106/549), một số dài 20–30 giây. Hook phải có trong giây đầu tiên (12/549 nhắc "hook"). Mỗi 1.5–2 giây có một ý mới. Cắt theo nhạc 120–128 BPM. Khung cuối phải gọn, giữ đủ lâu để đọc.

**Kỹ thuật lặp lại nhiều:**
- Đi qua nhiều kỹ thuật khác nhau (typography, chơi với hình khối, chuyển động camera, đổi màu) nhưng giữ một ngôn ngữ thiết kế thống nhất. Không làm thành bộ sưu tập hiệu ứng rời rạc.
- Chuyển cảnh bằng chính vật thể: một hình biến thành hình tiếp theo (morph 18/549), dùng mask reveal (10/549), match cut.
- Camera kiểu punch-in hoặc smash-pan đặt đúng beat, không trôi ngẫu nhiên (camera 39/549).
- Spring giảm chấn mạnh, chỉ overshoot rất nhẹ (spring 17/549). Có motion blur thật nhờ trộn subframe.
- Video có thể loop, frame cuối trùng frame đầu (loop 26/549).

**Lỗi hay gặp / banned:** quá tay hiệu ứng (particle, glow, glitch), easing nảy kiểu hoạt hình, chữ quá to kiểu slide, quá nhiều phong cách trong 15 giây, khoảng chết không có gì xảy ra, logo xoay vô cớ. Prompt một dòng "go all out" thường ra kết quả lộn xộn hoặc giống PowerPoint (có tác giả phải góp ý "quá nhanh và giật"). Vì vậy luôn chốt palette, font và banned list trước.

**Câu prompt khung:** "Dựng một intro {N} giây cho {thương hiệu}, 1920×1080 60fps, cắt theo nhạc {BPM} BPM. Hook ngay giây đầu, sau đó mỗi beat là một kỹ thuật khác nhau nhưng chung palette {hex} và font {font}, kết thúc ở lockup logo đứng yên. Cấm glow, particle, easing nảy. Render một still cho mỗi beat để tự kiểm tra trước khi xuất MP4."

## Explainer / giáo dục

**Khi nào dùng:** giải thích một khái niệm, quy trình hay lịch sử, công thức, bài báo, hoặc làm explainer cho sản phẩm. Thường có lời đọc và phụ đề (explainer 67/513, 知识与教学 52/300).

**Engine gợi ý:** HyperFrames, dựng tay bằng `general-video` khi dùng voice ElevenLabs (bước audio của `faceless-explainer` sẽ sinh lại voice). Dùng Remotion khi nội dung sinh từ dữ liệu hoặc làm hàng loạt. Corpus có vài case dùng Manim cho toán (3/549), nhưng skill này không dùng Manim. Mô phỏng thật (random walk, vật lý) thì dùng raw Canvas.

**Nhịp và thời lượng:** thường 30–60 giây. Có 5 cảnh mẫu: vấn đề → giải pháp → cách hoạt động trong 3 bước → bằng chứng → tên hoặc CTA. Mỗi cảnh phải ở trên màn hình đủ lâu để đọc, khoảng 2.5 giây trở lên cho mỗi ý. Nhịp chậm hơn motion, chuyển cảnh mềm hơn.

**Kỹ thuật lặp lại nhiều:**
- Mô phỏng thật thay vì vẽ minh hoạ (random walk thật, dòng chảy thật). Dùng số liệu thật và nói rõ mức không chắc chắn.
- Cú zoom liên tục qua nhiều thang đo, ví dụ từ bàn làm việc xuống tận nguyên tử hoặc từ đồi lên vũ trụ, kèm thước đo tỷ lệ (zoom 21/549).
- Có nhân vật hoặc mascot với gag thị giác, onomatopoeia và callback để giữ chú ý.
- Lời đọc kèm phụ đề burn-in, vì phần lớn người xem trên X tắt tiếng (voice/TTS 25/549, captions 8/549). Câu chuyện vẫn phải hiểu được khi tắt tiếng (6/549).
- Mỗi cảnh một ý hình thức mạnh, theo kiểu The Pudding hay 3Blue1Brown.

**Lỗi hay gặp / banned:** bịa số liệu, chữ code nhỏ không đọc được, thành slideshow gạch đầu dòng, nhạc lấn giọng (phải ducking). Lời đọc và hình lệch nhau khi không có `words.json`. Lỗi nữa là dùng TTS kém cho tiếng Việt, nên luôn dùng `eleven_v4`.

**Câu prompt khung:** "Làm explainer {N} giây về {chủ đề} cho người mới. Cấu trúc 5 cảnh: vấn đề, cơ chế, 3 bước, một con số thật có nguồn, kết. Lời đọc tiếng Việt bằng ElevenLabs, phụ đề burn-in khớp `words.json`, nhạc nền ducking dưới giọng. Mỗi cảnh một ý hình thức, mô phỏng thật khi có thể. Render still từng cảnh, kiểm tra chữ và số rồi mới xuất."

## Sản phẩm / quảng cáo (UI có con trỏ)

**Khi nào dùng:** launch video cho SaaS hoặc app, promo tính năng, quảng cáo trên mạng xã hội. Thường dựa trên UI thật của sản phẩm (品牌与产品 74/300, và rất nhiều case motion của yihui).

**Engine gợi ý:** HyperFrames với workflow `product-launch-video` khi có URL sản phẩm. Dùng Remotion khi repo của người dùng đã có Remotion hoặc cần dựng từ component React có sẵn. Thường cần chụp UI thật bằng Playwright trước khi dựng.

**Nhịp và thời lượng:** 15–30 giây, hiếm khi tới 45–100 giây. Bám lưới 120 BPM, khoảng 7 bar, tức 28 beat trong 14 giây. Mỗi tính năng ở trên màn hình ít nhất 2–2.5 giây khi bản 9:16 dành cho Reels/TikTok.

**Kỹ thuật lặp lại nhiều:**
- **Một hình, không cắt.** Một phần tử duy nhất morph kích thước, bo góc và màu để đi qua mọi trạng thái: button → loader → check → player → slider → toggle → tab → chart → ⌘K → toast → button. Mẫu này được tái dùng gần như nguyên văn trong khoảng 10 prompt.
- **Con trỏ dẫn dắt** mọi tương tác: click, kéo, gõ, hover (cursor 21/549). Kéo là thao tác trực tiếp, nhả tay thì spring từ đúng vị trí và vận tốc lúc nhả.
- Tab indicator hoặc knob có hai mép chạy theo hai spring khác nhau, nên mép trước kéo giãn trông như chất lỏng.
- Camera zoom kiểu Screen Studio để mỗi trạng thái lấp đầy khung.
- Dùng UI thật, dữ liệu thật, logo thật, không placeholder. Không bịa tính năng hay con số (nhóm research/real/actual 37/549).

**Lỗi hay gặp / banned:** mockup chung chung, dashboard giả, gradient trên UI chrome, icon có nét không đồng nhất, chữ đổi trong container đang morph bị chồng nhau (phải tách timing vào và ra), `will-change` làm mờ chữ khi camera scale, vòng loop bị giật vì vị trí hoặc tốc độ con trỏ ở frame cuối không khớp frame đầu. Dựng 9:16 bằng cách crop thô bản 16:9 cũng là lỗi; phải dàn lại bố cục.

**Câu prompt khung:** "Đọc landing page và repo của {sản phẩm}, lấy copy, màu, font và logo thật. Dựng promo {N} giây trên lưới 120 BPM: một phần tử UI duy nhất morph qua {8–12 trạng thái}, con trỏ thật click, kéo và gõ trên từng beat, camera zoom theo trạng thái, kết ở logo và URL. Không bịa số. Render một frame mỗi beat để duyệt trước."

## Tự sự / music video (bám beat)

**Khi nào dùng:** có sẵn bài hát hoặc lời bài hát, câu chuyện ngắn có nhân vật, MV, video cảm xúc cho dịp lễ (叙事与音乐 86/300, nhóm đông nhất bên chuspeeism).

**Engine gợi ý:** HyperFrames với workflow `music-to-video`. Khi cần lồng footage thật thì tách footage thành chuỗi JPEG hoặc re-encode all-intra để seek chính xác. Nếu phong cách là vẽ tay hoặc giấy và cần nhiều mô phỏng thì dùng raw Canvas, Playwright và ffmpeg. Các case dùng AI sinh video (Seedance, Kling) nằm ngoài phạm vi skill này.

**Nhịp và thời lượng:** 20–60 giây cho bản social, cả bài nếu là MV. Cắt trên downbeat. Hit UI hoặc hành động đặt trên beat. Cảnh lớn đặt ở drop, cảnh yên đặt ở breakdown. Cường độ hiệu ứng tăng theo đoạn, ví dụ intro khoảng 40%, verse 70%, chorus 100%.

**Kỹ thuật lặp lại nhiều:**
- Phân tích nhạc trước (BPM, vị trí beat đầu, đầu mỗi bar, năng lượng từng đoạn, drop), hiệu chỉnh grid theo tiếng kick thật (sync-to-beat 21/549).
- Đổi cut mỗi beat theo một vòng gồm toàn thân, bán thân, cận mắt, lặp nhiều lần với màu khác. Hai beat liền nhau không dùng cùng một pose.
- Lyric lúc to lúc nhỏ: phần hook mở đầu thì to và nổi, đoạn sau có lúc chỉ như phụ đề. Nhân vật đứng một bên để chừa chỗ cho chữ (lyrics/MV 9/549).
- Chia cảnh bằng shot list có hai vị trí camera cố định và bản đồ không gian cố định cho cả phim, để giữ hướng nhìn và tránh lỗi continuity.
- Đặt hiệu ứng âm thanh theo đỉnh đo được, giữ SFX nhỏ dưới nhạc, rồi loudnorm.

**Lỗi hay gặp / banned:** nhân vật nhép miệng giả trông giật (có tác giả phải yêu cầu bỏ), tay chân nhân vật trông như lỗi, hiệu ứng glitch làm nhân vật mờ quá lâu, trôi beat khi grid không được hiệu chỉnh, dùng nhạc không có license thương mại, đuôi bài thừa sau khi hát xong.

**Câu prompt khung:** "Dùng bài nhạc {file} (nhạc nền ElevenLabs `music_v2_5` nếu chưa có). Phân tích BPM, drop và breakdown. Dựng MV {N} giây về {câu chuyện}: mỗi cut nằm trên downbeat, cảnh lớn ở drop, cảnh lặng ở breakdown, lyric khi to khi nhỏ theo đoạn. Giữ bản đồ không gian và nhân vật nhất quán. Trình beat map và 4 still trước khi render."

## 3D / không gian

**Khi nào dùng:** sản phẩm hoặc vật thể cần độ dày và chiều sâu, kiến trúc, tái dựng lịch sử, flythrough, zoom xuyên thang đo, diorama (3d 59/513, 三维与空间 18/300, tag threejs 147).

**Engine gợi ý:** Three.js chạy trong HyperFrames nếu seek được. Nếu không thì dùng Three.js/WebGL raw với clock giả định thời gian, chụp từng frame bằng Playwright rồi ghép bằng ffmpeg. Blender và After Effects có trong corpus (blender 12 case bên chuspeeism) nhưng nằm ngoài phạm vi skill.

**Nhịp và thời lượng:** 10–20 giây cho một cú camera liên tục, ít cắt. Camera di chuyển chậm và mượt. Chuyển động của vật thể phải có lý về vật lý, ví dụ nắp mở quanh bản lề hay huy chương xoay quanh trục.

**Kỹ thuật lặp lại nhiều:**
- Dựng hình hoàn toàn từ code, không tải mesh hay texture. Dùng generator tái sử dụng được (mặt tiền, mái, đèn...) và mỗi chi tiết truy được về nguồn dữ liệu.
- Shading kiểu toon hoặc cel (toon/cel 9/549): 3–4 bậc gradient, ba nguồn sáng (key, sky, rim). Viền vẽ bằng post-process edge detection trên normal và depth, không dùng mẹo backface phóng to.
- Parallax theo lớp độ sâu và zoom hàm mũ với tốc độ hằng, thời lượng mỗi đoạn tỷ lệ với log(zoom) (depth/parallax 9/549).
- Một cú zoom liên tục qua nhiều thang đo, có thước đo tỷ lệ đi kèm.
- Có trạng thái idle (xoay chậm, nhấp nhô, bóng đổ mềm thay đổi theo độ cao) để người xem thấy được độ dày của vật thể.

**Lỗi hay gặp / banned:** đặt opacity hoặc filter lên phần tử `preserve-3d` làm nó bị phẳng (phải fade wrapper bên ngoài), lật thẻ lớn bằng CSS 3D bị méo (đưa vào WebGL), glow phủ lên chủ thể thành một mảng trắng, particle quét ngang mặt chủ thể, texture canvas độ phân giải thấp nên bị mờ khi zoom. Hay gặp nữa là "pixel cảm" do render ở độ phân giải thấp; cần render 1.5× rồi supersample.

**Câu prompt khung:** "Dựng bằng Three.js thuần code một cú camera liên tục {N} giây đi qua {vật thể hoặc không gian}. Toon shading 3–4 bậc, ba nguồn sáng, viền bằng edge detection. Mọi chuyển động là hàm của t để chụp frame tất định ở 60 fps. Không mesh tải ngoài. Kiểm tra 8 frame tiêu biểu về độ rõ chủ thể và ánh sáng trước khi xuất."

## Kinetic typography (spoken-word)

**Khi nào dùng:** câu nói, manifesto, tagline, lời bài hát, quote. Chữ là nhân vật chính, có thể kèm giọng đọc. Nhóm này ít case nhưng prompt rất kỹ (typograph 13/549, word-by-word 9/549).

**Engine gợi ý:** HyperFrames, dùng SVG hoặc Canvas để có path glyph thật. Dùng Remotion khi chữ sinh từ dữ liệu. Lời đọc tiếng Việt bằng ElevenLabs `eleven_v4`, lấy `words.json` để làm cue sheet.

**Nhịp và thời lượng:** 15–20 giây, khổ vuông 1080×1080 cho X hoặc 9:16. Có hai kiểu nhịp: theo **cue sheet của lời nói** (cụm từ, khoảng ngừng, nhấn) cho spoken-word, hoặc theo **lưới 120 BPM** cho bumper (stagger 1/16 nốt, tức 125 ms). Cần ít nhất một khoảnh khắc đứng yên khoảng 400 ms trở lên.

**Kỹ thuật lặp lại nhiều:**
- Gán vai trò cho từng từ. Từ biến thành cấu trúc (dầm, trụ, sàn, khe mở), và vai trò đó phải lộ ra từ chính hình chữ chứ không từ hình minh hoạ đặt phía sau.
- Spring riêng cho từng glyph (y, opacity, blur) và reveal theo đúng thứ tự đọc.
- Chuyển giữa hai câu bằng mask lấy từ đường viền của chữ sắp rời đi. Không nội suy điểm path giữa hai từ không liên quan.
- Hệ ba font: display rất đậm cho từ chịu lực, serif hoặc grotesque cho câu, mono nhỏ cho nhãn và timecode. Palette khoá cứng 3–4 màu.
- Loop hoàn hảo, render(0) = render(T).

**Lỗi hay gặp / banned:** chữ bị biến dạng trước khi người xem kịp đọc, hở lỗ chữ (counter) khi deform, câu chữ ép theo beat nhảy trong khi đây là lời nói, thêm slogan ngoài lời đã chốt, sáo ngữ như loa, cờ, micro, poster phản kháng, AI clichés (não, robot, sparkle), paragraph dài.

**Câu prompt khung:** "Dàn dựng câu nói '{lời}' thành kinetic typography {N} giây, 1080×1080. Mỗi từ khoá có một vai trò hình học và câu cuối đứng trên cấu trúc mà các từ trước đã dựng. Reveal theo cụm từ của giọng đọc ElevenLabs (`words.json`), có một nhịp lặng 400 ms. Dùng glyph path thật và mask chuyển cảnh từ chữ cũ. Kiểm tra 8 frame xem câu có đọc đúng thứ tự không."

## Thẻ kỹ thuật

Mỗi thẻ là một kỹ thuật lặp lại trong các prompt dài nhất của corpus (> 1500 ký tự), viết lại ngắn gọn. Dòng `HyperFrames:` chỉ dùng tên có thật trong `hyperframes-animation` (blueprint, rule), `hyperframes-creative/frame-presets` và registry (`hyperframes catalog`).

### Thẻ 1 — UI có con trỏ dẫn dắt
Con trỏ là diễn viên chính: mọi thay đổi trạng thái đều do một cú click, kéo, hover hay gõ phím thật gây ra. Kéo là thao tác trực tiếp (giá trị bám theo vị trí con trỏ, nhả ra thì spring về từ đúng vị trí và vận tốc lúc nhả). Kéo quá giới hạn thì thanh trượt giãn ra rồi co lại. UI lấy từ sản phẩm thật, dữ liệu thật, không placeholder.
Case: `y:demonugc-525162`, `y:annacher-433425`
HyperFrames: blueprint `cursor-ui-demo` · rule `context-sensitive-cursor`, `cursor-drag` · `catalog --query "cursor click"` (block: `oversized-cursor`) · preset `capsule`

### Thẻ 2 — Một hình biến thành mọi cảnh (one-shape morph)
Không cắt cảnh. Một phần tử duy nhất đổi kích thước, bo góc và màu để thành nút, loader, player, slider, tab, chart, toast… Nội dung bên trong vào sau khi khung bắt đầu morph và ra trước lần morph kế, kèm blur ngắn, nên chữ không chồng nhau. Hai mép tab indicator chạy hai spring khác nhau để mép trước giãn ra trước.
Case: `y:thegrootdev-966114`, `y:verbove-268381`
HyperFrames: blueprint `fixed-anchor-cycle` · rule `card-morph-anchor`, `scale-swap-transition` · `catalog --query "morph shape"` (block: `morph-swap`) · preset `blue-professional`

### Thẻ 3 — Lưới beat theo BPM
Chốt 120 BPM, đếm theo bar (thường 7–10 bar), mỗi beat phải có một chuyện xảy ra. Đo beat grid từ chính bài nhạc rồi hiệu chỉnh theo tiếng kick thật, mọi cú cắt rơi vào downbeat, cú zoom lớn rơi đúng drop. Trình danh sách trạng thái trên lưới beat trước khi viết code.
Case: `y:raphaelaubryy-687877`, `y:twoclipping-496100`
HyperFrames: blueprint `kinetic-type-beats` · rule `kinetic-beat-slam` · `catalog --query "beat sync"` (block: `beat-accent`) · lệnh `hyperframes beats` · preset `bold-poster`

### Thẻ 4 — Chữ đóng vai trò kiến trúc (kinetic typography)
Mỗi từ khoá nhận một vai trò hình học (dầm, trụ, khe mở, sàn) và vai trò đó phải lộ ra từ chính glyph. Câu chốt đứng trên cấu trúc mà các từ trước đã dựng. Ba font có vai riêng: display rất đậm, serif/grotesque cho câu, mono nhỏ cho nhãn. Lời khoá cứng, không thêm slogan, stagger theo nốt 1/16.
Case: `y:gdgtify-929495`, `y:techhalla-498547`
HyperFrames: blueprint `kinetic-type-beats` · rule `spring-pop-entrance`, `discrete-text-sequence` · `catalog --query "kinetic typography"` (block: `kinetic-center-build`) · preset `editorial-forest`

### Thẻ 5 — Camera reframe kiểu screen-studio
Camera zoom và lia theo từng điểm tương tác để trạng thái hiện tại luôn lấp khung và dễ đọc, con trỏ scale cùng camera. Chỉ có punch-in nhẹ và smash-pan đặt đúng beat, không trôi ngẫu nhiên. Không đặt `will-change` lên phần tử bị camera scale vì chữ sẽ mờ.
Case: `y:twoclipping-496100`, `y:thegrootdev-966114`
HyperFrames: blueprint `camera-journey` · rule `coordinate-target-zoom`, `camera-cursor-tracking` · `catalog --query "camera zoom"` (block: `ui-focus-zoom`) · preset `code-editorial`

### Thẻ 6 — Vòng lặp liền mạch
Frame cuối trùng frame đầu, gồm cả vị trí và vận tốc con trỏ, nếu không vòng lặp sẽ giật. Cảnh cuối dẫn ngược về hình mở đầu chứ không fade. Với infinite zoom: zoom mũ về một điểm cố định, thời lượng mỗi đoạn tỷ lệ với log(zoom), cắt khi "cổng" lấp đầy khung và kiểm tra từng frame quanh điểm cắt.
Case: `y:demonugc-525162`, `y:koldo2k-778767`
HyperFrames: blueprint `zoom-out-workspace-reveal` · rule `sine-wave-loop` · `catalog --query "loop"` (block: `drift-hold`) · preset `cartesian`

### Thẻ 7 — Mask và line reveal
Chữ trồi lên từ sau một đường mask thay cho fade hay blur-in. Chuyển giữa hai câu bằng mask lấy từ outline của chữ đang rời đi. Một khối đen phủ kín khung rồi co lại thành cảnh sau; cú phủ phải tràn qua góc và kéo dài khoảng 0.3 s, nếu không nửa màn hình đổi trong một frame. Match cut cần đo vị trí phần tử lúc chạy.
Case: `y:raphaelaubryy-687877`, `y:techhalla-498547`
HyperFrames: blueprint `titlecard-reveal` · rule `svg-path-draw` · `catalog --query "mask reveal"` (block: `svg-mask-reveal`) · preset `cobalt-grid`

### Thẻ 8 — Banned list và vòng tự kiểm tra
Viết danh sách cấm cụ thể (crossfade, glow, particle, RGB split, camera shake, easing nảy, gradient trên UI chrome, kiểu template, khoảng chết). Trước khi render toàn bộ: xuất một still mỗi beat thành contact sheet, sửa chỗ chật, tràn, khó đọc; sau render thì dò các frame nhảy đột ngột (độ chênh frame gấp 3 lần frame bên cạnh).
Case: `y:techhalla-498547`, `y:verbove-268381`
HyperFrames: lệnh `hyperframes snapshot`, `hyperframes check` (thẻ quy trình, không gắn blueprint)

## Bảng nối nhóm → HyperFrames

Tên trong bảng đều có thật (blueprint/rule trong `hyperframes-animation`, preset trong `hyperframes-creative/frame-presets`, block lấy từ output của câu `catalog --query` cùng dòng).

| Nhóm | Workflow | Blueprint | Rule | `catalog --query` (block) | Preset |
|---|---|---|---|---|---|
| Motion graphics / intro | `motion-graphics` | `logo-assemble-lockup`, `kinetic-type-beats` | `spring-pop-entrance`, `scale-swap-transition` | "logo reveal" (`logo-sting`) | `bold-poster`, `coral` |
| Explainer / giáo dục | `general-video` (hoặc `faceless-explainer`) | `dataviz-countup`, `spatial-pan-stations`, `constellation-hub` | `stat-bars-and-fills`, `svg-path-draw`, `counting-dynamic-scale` | "explainer chart" (`chart-story`) | `cobalt-grid`, `cartesian` |
| Sản phẩm / UI | `product-launch-video` | `cursor-ui-demo`, `prompt-type-submit-generate`, `device-surface-showcase` | `context-sensitive-cursor`, `card-morph-anchor`, `coordinate-target-zoom` | "product demo" (`typed-prompt`) | `capsule`, `blue-professional` |
| Tự sự / music video | `music-to-video` | `camera-journey`, `spatial-pan-stations` | `kinetic-beat-slam`, `multi-phase-camera` | "beat sync" (`beat-freeze-cut`) | `broadside`, `biennale-yellow` |
| 3D / không gian | `general-video` | `camera-journey`, `zoom-out-workspace-reveal` | `3d-camera-flight`, `orbit-3d-entry`, `depth-of-field-blur` | "three.js 3d scene" (`three-orbiting-cards`) | `code-editorial` |
| Kinetic typography | `motion-graphics` (thêm `embedded-captions` khi có giọng đọc) | `kinetic-type-beats`, `typewriter-reveal` | `kinetic-beat-slam`, `discrete-text-sequence`, `asr-keyword-glow` | "kinetic typography" (`kinetic-type-swap`) | `editorial-forest`, `broadside` |
