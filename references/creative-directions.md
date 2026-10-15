# Hướng đạo diễn và từ khoá sáng tạo

> File sinh tự động từ `data/directions.json` bằng `node scripts/directions.mjs doc --write`. Không sửa tay; sửa JSON rồi sinh lại. `node scripts/directions.mjs check` kiểm mọi token có thật trong HyperFrames đã cài.

Dùng ở **bước 1b** (`SKILL.md`): agent chọn 3 hướng bằng `directions.mjs pick`, dựng styleframe bằng `make-pitch.mjs`, người dùng chọn bằng mắt rồi đổi tối đa vài từ khoá. Người dùng chỉ thấy cột tiếng Việt; token kỹ thuật ghi vào `BRIEF.md` và `PLAN.md`.

Hướng quyết định cách kể bằng hình. Giao diện (màu, chữ, chất liệu, chuyển cảnh) là trục riêng: style profile trong `data/styles/`, ghi vào BRIEF bằng `style_profile:`. Mỗi hướng gợi ý vài style hợp (`styles_goi_y`, số trong ngoặc là năng lượng 1–5); xem `references/style-system.md`.

## Hai núm chỉnh

| Núm | Lựa chọn |
|---|---|
| Nhịp (`energy`) | `em` Êm: Chuyển động lướt chậm, nhiều khoảng thở (≈22 từ/15s, ≥3s không lời)<br>`vua` Vừa: Nhịp đều, mỗi 1,5–2 giây một ý mới (≈26 từ/15s, ≥2s không lời)<br>`don-dap` Dồn dập: Cắt theo beat 120–128 BPM, chữ đập mạnh (≈30 từ/15s, ≥2s không lời) |
| Tông màu (`palette`) | `toi` Tối: Nền tối sâu, chữ và điểm nhấn sáng<br>`sang` Sáng: Nền sáng hoặc giấy kem, chữ đậm<br>`thuong-hieu` Màu thương hiệu: Lấy màu từ logo/brand kit người dùng đưa |

## 8 hướng đạo diễn

| Mã | Tên (người dùng thấy) | Mô tả | Nhóm pick | Luật chống slideshow |
|---|---|---|---|---|
| A1 | **Một khối biến hình liên hoàn** | Một khối duy nhất ở giữa màn hình đổi dáng qua từng ý: nút bấm thành thanh tải, thành biểu đồ, thành logo. Không cắt cảnh. | liền mạch, không cắt | Không bao giờ có hai thẻ cùng lúc; mọi ý mới là hình dạng mới của cùng một khối. |
| A2 | **Gõ lệnh, máy bung kết quả tức thì** | Khung gõ lệnh tự gõ một câu hỏi thật, AI chạy các bước, rồi kết quả (bảng, biểu đồ, bản kế hoạch) bung ra ngay trước mắt. | khớp chủ đề nhất | Mọi cảnh mọc ra từ khung lệnh; camera đẩy vào kết quả thay vì đổi thẻ. |
| A3 | **Chữ khổng lồ đập theo nhịp trống** | Chữ chiếm gần hết khung, từ mới lao vào húc văng từ cũ, nền đảo đen ↔ trắng đúng nhịp trống. | táo bạo | Không có thẻ chữ đứng yên; mỗi beat là một va chạm hoặc một cú đảo nền. |
| A4 | **Một máy quay lướt qua bàn làm việc** | Cả video là một không gian rộng không cắt cảnh. Máy quay lướt theo một con trỏ phóng to đang bấm, kéo, thả có lực thật. | liền mạch, không cắt | Không cắt: chuyển ý bằng cách máy quay di chuyển trong cùng một không gian. |
| A5 | **Bay xuyên không gian 3D** | Các lớp thông tin xếp nghiêng trong chiều sâu, máy quay bay xuyên qua từng lớp, lớp phía sau mờ đi để làm nổi lớp đang nói. | táo bạo | Chuyển ý bằng cách bay sâu hơn trong cùng một thế giới 3D, không đổi thẻ phẳng. |
| A6 | **Biểu đồ tự vẽ, số nhảy thật** | Biểu đồ tự vẽ nét theo giọng đọc, một vạch đọc quét ngang làm con số nhảy theo. Số liệu thật, có nguồn. | khớp chủ đề nhất | Một biểu đồ sống xuyên suốt: chuyển ý bằng zoom vào điểm dữ liệu, không thay slide số liệu. |
| A7 | **Tạp chí giấy, bút dạ vẽ tay** | Nền giấy ấm, chữ có chân sang trọng. Khi giọng đọc chạm từ khoá, nét bút dạ tự khoanh tròn, gạch chân, tô sáng. | khớp chủ đề nhất | Một trang giấy dài, camera lia dọc trang; chữ được đánh dấu chứ không bật thẻ. |
| A8 | **Bản đồ dẫn đường bám lời nói** | Máy quay bay trên bản đồ hoặc sơ đồ tổng thể, ghim rơi xuống, đường nối tự vẽ, nhãn số liệu bật đúng chữ đang đọc. | liền mạch, không cắt | Một tấm bản đồ duy nhất; chuyển ý bằng camera bay tới điểm mới. |

### A1 — Một khối biến hình liên hoàn

- Hook: Giây đầu: khối nhỏ nảy vào giữa khung, giãn ra thành ý đầu tiên đúng lúc giọng đọc bắt đầu.
- Styleframe 3 giây: 3 giây: khối bo góc ở tâm morph qua 3 trạng thái (nút → thanh tải → thẻ tiêu đề chủ đề), chữ bên trong vào sau khi khung bắt đầu morph và ra trước lần morph kế.
- Style: preset `blue-professional` · Blueprint: `fixed-anchor-cycle`, `cta-morph-press` · Rule: `card-morph-anchor`, `scale-swap-transition`, `press-release-spring`
- Style profile gợi ý: `expressive-material` Chất liệu biểu cảm (3/5), `precision-dark-product` Sản phẩm tối chính xác (3/5), `glass-keynote` Keynote kính mờ (3/5), `neo-brutalist-web` Web tân thô mộc (4/5)
- Chuyển cảnh: `card-morph-anchor`, `scale-swap-transition`
- SFX: "soft tactile UI pop", "tight airy whoosh" · Nhịp: vua/don-dap · Nhóm: product, interactive, motion
- Case tham khảo: `y:thegrootdev-966114`, `y:verbove-268381`

### A2 — Gõ lệnh, máy bung kết quả tức thì

- Hook: Giây đầu: con trỏ nhấp nháy trong khung lệnh, câu hỏi gõ ra từng ký tự kèm tiếng phím.
- Styleframe 3 giây: 3 giây: khung lệnh gõ câu hỏi về chủ đề, nhấn Enter, ba dòng trạng thái chạy, khối kết quả đầu tiên trồi lên từ chính khung lệnh.
- Style: style `Data Drift` · Blueprint: `prompt-type-submit-generate`, `agent-progress-theater` · Rule: `discrete-text-sequence`, `camera-cursor-tracking`, `coordinate-target-zoom`
- Style profile gợi ý: `precision-dark-product` Sản phẩm tối chính xác (3/5), `terminal-ops` Phiên terminal (3/5), `glass-keynote` Keynote kính mờ (3/5), `accelerated-compute` Sức mạnh điện toán (4/5)
- Chuyển cảnh: `zoom-through`, `card-morph-anchor`
- SFX: "crisp mechanical keycap click", "subtle digital telemetry chirp", "deep clean sub bass impact" · Nhịp: vua/don-dap · Nhóm: product, interactive, explainer
- Case tham khảo: `y:twoclipping-496100`, `y:demonugc-525162`

### A3 — Chữ khổng lồ đập theo nhịp trống

- Hook: Giây đầu: một từ khoá đập vào giữa khung trên nhịp trống đầu tiên, nền đảo màu.
- Styleframe 3 giây: 3 giây: ba từ khoá của chủ đề lần lượt đập vào theo 3 beat, từ sau húc văng từ trước, nền đổi cực màu ở beat thứ ba.
- Style: style `Maximalist Type` · Blueprint: `kinetic-type-beats`, `ticker-takeover` · Rule: `kinetic-beat-slam`, `reactive-displacement`, `waterfall-entry`
- Style profile gợi ý: `kinetic-typography` Chữ chuyển động (4/5), `athletic-impact` Thể thao bùng nổ (5/5), `extreme-energy` Cảm giác mạnh (5/5), `swiss-kinetic-editorial` Chữ Thuỵ Sĩ chuyển động (3/5)
- Chuyển cảnh: `beat-cut`, `waterfall-cut`
- SFX: "punchy modern electronic stomp clap", "tight transient percussion hit" · Nhịp: don-dap · Nhóm: motion, story-music, product
- Case tham khảo: `y:raphaelaubryy-687877`, `y:techhalla-498547`

### A4 — Một máy quay lướt qua bàn làm việc

- Hook: Giây đầu: con trỏ to lướt vào khung và bấm lún một nút, máy quay đẩy theo.
- Styleframe 3 giây: 3 giây: con trỏ phóng to kéo một thẻ liên quan chủ đề qua màn hình, nhả tay thẻ nảy về chỗ, camera trượt sang vùng kế tiếp.
- Style: preset `capsule` · Blueprint: `cursor-ui-demo`, `camera-journey`, `zoom-out-workspace-reveal` · Rule: `context-sensitive-cursor`, `cursor-drag`, `physics-press-reaction`, `coordinate-target-zoom`
- Style profile gợi ý: `creative-canvas` Bảng vẽ cộng tác (3/5), `saas-bento` Lưới bento SaaS (3/5), `premium-ui-demo` Giao diện cao cấp (2/5), `playful-productivity` Làm việc vui vẻ (4/5)
- Chuyển cảnh: `multi-phase-camera`, `viewport-change`
- SFX: "crisp mechanical keycap click", "soft tactile UI pop" · Nhịp: vua/don-dap · Nhóm: product, interactive
- Case tham khảo: `y:annacher-433425`, `y:demonugc-525162`

### A5 — Bay xuyên không gian 3D

- Hook: Giây đầu: máy quay lao từ xa vào giữa một không gian có chiều sâu, các mảnh bay về khoá đúng chỗ.
- Styleframe 3 giây: 3 giây: ba tầng thẻ nghiêng 3D về chủ đề, máy quay bay xuyên tầng đầu, tầng sau rõ nét dần (rack focus).
- Style: style `Data Drift` · Blueprint: `camera-journey`, `zoom-out-workspace-reveal` · Rule: `3d-camera-flight`, `depth-of-field-blur`, `depth-scatter-assemble`, `orbit-3d-entry`
- Style profile gợi ý: `immersive-console` Ra mắt máy chơi game (4/5), `holographic-hud` Màn hình HUD (3/5), `accelerated-compute` Sức mạnh điện toán (4/5), `neon-cyberpunk` Đêm neon cyberpunk (5/5)
- Chuyển cảnh: `zoom-through`, `cinematic-zoom`
- SFX: "tight airy cinematic whoosh", "deep clean sub bass impact" · Nhịp: vua/don-dap · Nhóm: 3d, motion, explainer
- Case tham khảo: `y:koldo2k-778767`

### A6 — Biểu đồ tự vẽ, số nhảy thật

- Hook: Giây đầu: một con số lớn đếm vụt lên đúng lúc giọng đọc nói ra nó.
- Styleframe 3 giây: 3 giây: đường biểu đồ tự vẽ, vạch đọc quét theo, con số chính của chủ đề đếm lên và khoá lại.
- Style: style `Swiss Pulse` · Blueprint: `dataviz-countup`, `comparison-split` · Rule: `chart-scrub-readout`, `counting-dynamic-scale`, `stat-bars-and-fills`, `svg-path-draw`
- Style profile gợi ý: `data-editorial` Báo chí dữ liệu (2/5), `systematic-enterprise` Doanh nghiệp hệ thống (2/5), `friendly-system-motion` Hệ thống thân thiện (3/5), `swiss-kinetic-editorial` Chữ Thuỵ Sĩ chuyển động (3/5)
- Chuyển cảnh: `zoom-through`, `push-slide`
- SFX: "subtle digital telemetry chirp", "soft tactile UI pop" · Nhịp: em/vua · Nhóm: explainer, product, bat-dong-san

### A7 — Tạp chí giấy, bút dạ vẽ tay

- Hook: Giây đầu: một câu in trên giấy, nét bút dạ quẹt tô sáng đúng từ đang được đọc.
- Styleframe 3 giây: 3 giây: tiêu đề chủ đề in kiểu tạp chí, bút dạ khoanh tròn từ khoá, máy quay lia nhẹ sang đoạn kế trên cùng trang giấy.
- Style: preset `code-editorial` · Blueprint: `spatial-pan-stations`, `transcript-scroll-artifact-reveal` · Rule: `css-marker-patterns`, `svg-path-draw`, `asr-keyword-glow`
- Style profile gợi ý: `editorial-intelligence` Bài luận về AI (2/5), `calm-workspace` Trang làm việc yên tĩnh (1/5), `quirky-editorial` Tạp chí lập dị (3/5), `paper-cut-collage` Cắt dán giấy (3/5)
- Chuyển cảnh: `multi-phase-camera`, `push-slide` (cho phép chuyển cảnh mềm: `focus-pull`, `blur-crossfade`, `cross-warp-morph`, `thermal-distortion`, `light-leak`)
- SFX: "felt tip marker stroke on textured paper", "crisp magazine page snap" · Nhịp: em/vua · Nhóm: explainer, story-music

### A8 — Bản đồ dẫn đường bám lời nói

- Hook: Giây đầu: máy quay sà xuống bản đồ, một chiếc ghim rơi nảy đúng điểm chính.
- Styleframe 3 giây: 3 giây: sơ đồ/bản đồ của chủ đề, ghim rơi, một đường nối tự vẽ tới điểm thứ hai, nhãn số liệu bật lên.
- Style: preset `cartesian` · Blueprint: `camera-journey`, `constellation-hub` · Rule: `svg-path-draw`, `viewport-change`, `ai-tracking-box`
- Style profile gợi ý: `blueprint-engineering` Bản vẽ kỹ thuật (2/5), `precision-hardware` Thiết bị chính xác (3/5), `isometric-systems` Hệ thống isometric (2/5), `mission-control` Trung tâm điều khiển phóng (4/5)
- Chuyển cảnh: `viewport-change`, `multi-phase-camera` (cho phép chuyển cảnh mềm: `focus-pull`, `blur-crossfade`, `cross-warp-morph`, `thermal-distortion`, `light-leak`)
- SFX: "soft tactile UI pop", "tight airy whoosh" · Nhịp: em/vua · Nhóm: explainer, story-music, bat-dong-san

## Từ khoá đổi được (5 nhóm)

Người dùng chọn một hướng rồi đổi từng nhóm bằng mã từ khoá. Phối không hợp thì `directions.mjs compat` cảnh báo (thẻ `tags` gặp `clash`).

### Phong cách (`style`)

| Mã | Tên | Người dùng hình dung | Token | Không hợp với |
|---|---|---|---|---|
| `dem-cong-nghe` | Đêm công nghệ sâu | Nền đen sâu, vệt sáng dữ liệu xanh tím, chữ mảnh lơ lửng | style `Data Drift` | paper |
| `luoi-thuy-si` | Lưới chuẩn Thụy Sĩ | Lưới cột sắc nét, số khổng lồ, bố cục cân tuyệt đối | style `Swiss Pulse` | playful |
| `poster-bung-no` | Poster chữ bùng nổ | Chữ siêu đậm chiếm 70% khung, tương phản đen-trắng-đỏ gắt | style `Maximalist Type` | calm, luxury |
| `toi-gian-xa-xi` | Tối giản xa xỉ | Nền nhung tối, sắc vàng champagne, nhiều khoảng thở, lướt êm | style `Velvet Standard` | loud, playful |
| `tap-chi-giay` | Tạp chí giấy kem | Nền kem ấm, chữ có chân, khung code xanh navy | preset `code-editorial` | dark, loud |
| `khoi-vien-dam` | Khối viền đậm trẻ trung | Viền đen dày, bóng đổ khối cứng, màu tươi, rất bắt mắt trên TikTok | preset `blockframe` | luxury |

### Hình chủ đạo (`visual`)

| Mã | Tên | Người dùng hình dung | Token | Không hợp với |
|---|---|---|---|---|
| `khoi-bien-hinh` | Khối trung tâm biến hình | Một khối ở tâm đổi dáng qua mọi ý, không dùng nhiều thẻ | blueprint `fixed-anchor-cycle` | — |
| `khung-go-lenh` | Khung gõ lệnh AI | Khung lệnh tự gõ câu hỏi và bung kết quả ngay | blueprint `prompt-type-submit-generate` | paper |
| `con-tro-to` | Con trỏ phóng to dẫn mắt | Con trỏ lớn tự rê, bấm lún, kéo thả có lực | blueprint `cursor-ui-demo` | luxury |
| `bang-tien-trinh` | Bảng tiến trình AI | Nhiều tác vụ chạy song song rồi đồng loạt tích xanh | blueprint `agent-progress-theater` | paper |
| `san-khau-3d` | Sân khấu nhiều lớp 3D | Các lớp thông tin xếp nghiêng có chiều sâu và bóng đổ | blueprint `camera-journey` | paper |
| `doi-dau` | Hai nửa đối đầu | Cách cũ chậm chạp và cách mới tức thì chạy song song | blueprint `comparison-split` | — |
| `mang-luoi` | Mạng lưới kết nối | Các nút tự phóng tia nối với nhau khi máy quay lia qua | blueprint `constellation-hub` | — |

### Hiệu ứng (`effect`)

| Mã | Tên | Người dùng hình dung | Token | Không hợp với |
|---|---|---|---|---|
| `lat-giai-ma` | Chữ lật giải mã | Chữ lật 3D, chạy ký tự nhiễu rồi khoá thành từ khoá | rule `hacker-flip-3d` | paper, luxury |
| `dap-theo-beat` | Từ khoá đập theo nhịp | Từ khoá đập vào khung khớp từng tiếng trống | rule `kinetic-beat-slam` | calm, luxury |
| `huc-van` | Húc văng | Ý mới lao vào đẩy văng ý cũ ra khỏi khung | rule `reactive-displacement` | luxury |
| `xoa-phong` | Xoá phông lấy nét | Làm mờ lớp phụ để lấy nét sắc vào thông tin chính | rule `depth-of-field-blur` | — |
| `vet-toc-do` | Vệt nhoè tốc độ | Vệt nhoè khi vật thể lao vút qua màn hình | rule `motion-blur-streak` | calm |
| `but-da` | Bút dạ đánh dấu | Nét bút dạ tự khoanh, gạch chân, tô sáng đúng chữ đang đọc | rule `css-marker-patterns` | dark |
| `manh-hut-ve` | Mảnh bay hút về | Mảnh ghép bay lơ lửng trong 3D rồi hút chặt về vị trí | rule `depth-scatter-assemble` | — |

### Chuyển cảnh (`transition`)

| Mã | Tên | Người dùng hình dung | Token | Không hợp với |
|---|---|---|---|---|
| `lao-xuyen-tam` | Lao xuyên tâm | Máy quay phóng xuyên qua chữ/vật thể cảnh trước để mở cảnh sau | seam `zoom-through` | — |
| `vut-ngang` | Vút ngang đồng tốc | Cảnh cũ lao sang bên ở tốc độ đỉnh, cảnh mới nối đuôi cùng chiều | seam `cut-the-curve` | calm |
| `bien-hinh-tai-cho` | Biến hình tại chỗ | Khung chính giữ nguyên, co giãn thành bố cục cảnh sau | seam `card-morph-anchor` | — |
| `song-chu` | Làn sóng chữ | Từng từ câu cũ rút đi, từng từ câu mới trào lên như sóng | seam `waterfall-cut` | — |
| `be-cong-khong-gian` | Bẻ cong không gian | Khung hình uốn như thấu kính rồi tan sang cảnh mới (WebGL) | seam `gravitational-lens` | paper |
| `dao-cuc-mau` | Đảo cực màu theo beat | Cắt đúng nhịp trống, đảo nền đen ↔ trắng tức khắc | seam `beat-cut` | calm, luxury |

### Âm thanh (`sfx`)

| Mã | Tên | Người dùng hình dung | Token | Không hợp với |
|---|---|---|---|---|
| `dien-anh-tram` | Điện ảnh trầm hùng | Gió lướt sâu trước điểm cắt, âm trầm rung khi chữ khoá | "tight airy cinematic whoosh", "deep clean sub bass impact" | playful |
| `co-hoc-xuc-giac` | Cơ học xúc giác | Phím cơ bấm giòn, công tắc khớp lệnh, chuông xác nhận trong | "crisp mechanical keycap click", "clean glass UI confirmation pop" | — |
| `tin-hieu-so` | Tín hiệu siêu máy tính | Tiếng quét dữ liệu tần số cao tinh tế, nạp năng lượng khi biểu đồ chạy | "subtle digital telemetry chirp", "soft plasma power-up hum" | paper |
| `giay-but` | Giấy và bút dạ | Bút dạ quẹt trên giấy nhám, lật trang tạp chí | "felt tip marker stroke on textured paper", "crisp magazine page snap" | dark |
| `trong-don-dap` | Nhịp trống dồn dập | Búng tay, trống kick dứt khoát khoá nhịp với từng cụm chữ | "punchy modern electronic stomp clap", "tight transient percussion hit" | calm, luxury |

## Từ vựng chuyển cảnh (cột "Nối sang beat sau" trong PLAN.md)

- **Bị chặn:** `fade`, `fade-in`, `fade-out`, `crossfade`, `dissolve`, `opacity`, `none`, `cut`, `dip`, `color-dip`, `mờ dần`, `hiện dần`, `trượt lên`.
- **Mềm** (chỉ hướng có `allow_soft`): `focus-pull`, `blur-crossfade`, `cross-warp-morph`, `thermal-distortion`, `light-leak`.
- **Liền mạch:** `zoom-through` (cut-catalog), `inverse-zoom-through` (cut-catalog), `cut-the-curve` (cut-catalog), `waterfall-cut` (cut-catalog), `card-morph-anchor` (rule), `scale-swap-transition` (rule), `theme-crossfade-morph` (rule), `multi-phase-camera` (rule), `viewport-change` (rule), `push-slide` (css), `squeeze` (css), `circle-iris` (css), `diagonal-split` (css), `gravity-drop` (css), `staggered-blocks` (css), `grid-dissolve` (css), `morph-circle` (css), `zoom-out` (css), `sdf-iris` (shader), `domain-warp` (shader), `gravitational-lens` (shader), `whip-pan` (shader), `cinematic-zoom` (shader), `ridged-burn` (shader), `swirl-vortex` (shader), `chromatic-split` (shader), `beat-cut` (native), `match-cut` (native).
- Nguồn công thức: `cut-catalog` → `faceless-explainer/references/cut-catalog.md`; `rule` → `hyperframes-animation/rules/<id>.md`; `css`/`shader` → `hyperframes-animation/transitions/`; `native` → mô tả trong `data/directions.json`.

