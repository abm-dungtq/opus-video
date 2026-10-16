# Exemplars — prompt tiêu biểu từ corpus

Nguồn: hai repo MIT, https://github.com/yihui-dev/awesome-opus5-5-videos và https://github.com/chuspeeism/awesome-opus-5-5-videos. Prompt thuộc về tác giả gốc. Bản dưới đây đã được rút gọn (chỗ lược bỏ đánh dấu bằng "…") và giữ nguyên ngôn ngữ gốc. Đây là tài liệu để học cấu trúc, không phải để dán y nguyên. Công thức đã tổng hợp nằm ở `pattern-library.md`.

## Motion graphics / intro

### Showreel 15 giây có cấu trúc
@darel023 · https://x.com/darel023/status/2103424524297420829 · tags: motion · nhóm: Motion graphics/intro
Ghi chú: đây là bản nâng cấp ngắn gọn của câu "showreel cho CV". Prompt nêu rõ ba nhịp: hook ở giây 1, chuỗi kỹ thuật khác nhau, rồi khung cuối sạch.
```
You're a world-class motion designer, and this is your 15-second résumé reel. Make it dynamic and confident: open with a striking hook in the first second, build through a sequence of distinct techniques (typography, shape play, camera moves, colour shifts), and land on a clean, memorable final frame. Pacing should feel like it's cut to music. Go crazy.
```

### Launch film 15 giây bằng HyperFrames + GSAP (template có biến)
@ik_builds · https://x.com/ik_builds/status/2103890476885585923 · tags: canvas, svg · nhóm: Motion graphics/intro
Ghi chú: template có biến `{{...}}` chạy được trên HyperFrames. Prompt cấm chữ chuyên môn của animator xuất hiện trên màn hình, yêu cầu seek-safe và master −14 LUFS. Đoạn này trích từ bài đăng.
```
"Create a 15s motion-graphics film explaining {{PRODUCT}}. HyperFrames + GSAP, no voiceover, no footage.
Style: paper-light canvas, marker notes that draw on, real physics, huge kinetic type,
hard light/dark switches, a new idea every 1.5–2 s, a sound on every hit.
…
RULES
- No chrome (scrubber, timecode, fps, headers). No animator jargon on screen …
- No invented results: no %, multipliers, customer names or figures.
…
CRAFT
- Real easing, squash/stretch, stagger, overlap, onion skin, smear, follow-through. Check the
  HyperFrames registry first. Set every from-state at t=0 (seek-safe); never cover an exit.
  One primary move per transition; no generic push/slide/rotate-swing.
- … SFX: pops, pen scribbles, whooshes, logo sub-hit. CC0 or generated
  only; log sources. Master -14 LUFS, -2 dBTP, re-measured after AAC encode."
```

## Explainer / giáo dục

### Hành trình của photon — explainer 60 giây tự chủ
@AstroTheWizard · https://x.com/AstroTheWizard/status/2103629247751618782 · tags: canvas · nhóm: Explainer/giáo dục
Ghi chú: prompt đủ trọn bộ cho một explainer có lời đọc: TTS, phụ đề burn-in, nhạc đổi theo cảnh, nhạc ducking dưới giọng, mô phỏng thật, và vòng kiểm tra bằng số.
```
I want you to make a 60-second, fully animated explainer video, end to end, completely on your own. …
Topic: the journey of photons
Style: whimsical, charming, storybook. Give the photon a personality. … pure JavaScript animation, rendered from code frame by frame. …
Make it genuinely educational and accurate. Where you can, simulate the real thing: the random walk should be an actual random walk, not a drawing of one. Include real numbers … and be honest about uncertainty in the estimates. …
Deliverable: 1920x1080 at 60fps, exactly 60 seconds, with:
- A voiceover script you write yourself, voiced with the highest-quality text-to-speech model you can access
- Burned-in captions, since most people watch on X with the sound off
- An original music score that fits the whimsical tone and changes with each scene
- Sound design synced exactly to the on-screen action (every bounce, pop, whoosh and ding)
- A professional mix: music ducks under the voice, mastered to streaming loudness
…
Quality is paramount. Build verification loops: render stills of every scene and review them critically, check transitions frame by frame, measure the audio mix numerically, fix what's weak and re-render. …
```

### Công thức cocktail dạng motion graphic
@Ror_Fly · https://x.com/Ror_Fly/status/2102853258582880547 · tags: canvas · nhóm: Explainer/giáo dục
Ghi chú: brief ngắn nhưng có trạng thái đầu và cuối rõ ràng (ly rỗng → cocktail xong), cộng dữ liệu cần hiển thị. Đây là khung tốt cho explainer dạng quy trình.
```
… render a recipe motion graphic animation using javascript or html (w/e you think will produce the best) to show the full recipe from start to finish (empty glass to completed cocktail) - Explainer video style - Showing the recipe ingreidents + measurements as they're going into the cup. Should be a 30s video.
```

### Infinite zoom kiểu After Effects
@koldo2k · https://x.com/koldo2k/status/2103129343253778767 · tags: canvas, ai-image · nhóm: Explainer/giáo dục
Ghi chú: Upstream đã gỡ case này ở 92aee2f (không làm từ một prompt Opus 5.5 đơn thuần): chỉ đọc để học cách viết, không coi là mẫu Opus 5.5. prompt dạy toán của cú zoom liên tục (tốc độ hằng, thời lượng tỷ lệ với log zoom) và parallax ba lớp. Phần sinh ảnh bằng AI nằm ngoài phạm vi skill này.
```
Build a looping "infinite zoom" animation, After Effects style: the camera
travels from landscape to landscape by flying through vintage objects.
…
HOW:
- Split each landscape into 3 depth layers from its depth map and fill the
  hidden areas. Parallax: layer scale = camera^Z, Z between 0.45 and 1.22.
- Each portal's glass holds the next world; cut seamlessly when it fills
  the frame.
- Constant speed: exponential zoom to a fixed point, each segment's duration
  proportional to log(zoom). Verify the cuts frame by frame.
…
- 20 s loop, 1920×1080, 30 fps. Music: 96 BPM, cut to exactly 8 bars = 20 s.
…
Show me screenshots before each expensive step.
```

## Sản phẩm / quảng cáo (UI có con trỏ)

### Spotify "Glass Tides" — timeline chi tiết từng 0.8 giây
@brainextends · https://x.com/brainextends/status/2103801834930606193 · tags: shader, svg · nhóm: Sản phẩm/quảng cáo
Ghi chú: mẫu đầy đủ nhất cho `<deliverables>` + `<art_direction>` + `<timeline>`. Prompt dùng một player bar cố định làm neo thị giác xuyên suốt video.
```
<deliverables> An 18-second MP4 at 1920×1080 and true 60 fps, with music and subtle sound effects Complete editable source Build, render, inspect, and refine the animation before delivering it Do not stop at a storyboard, still images, or an implementation plan </deliverables>
<art_direction>
A premium music-product film presented inside a large, nearly black rounded rectangular stage
…
Spotify green # 1ED760 for emphasis and controls
One clean sans-serif font, such as Geist or Inter
…
Text should feel like music-product advertising, not oversized presentation headings
</art_direction>
…
<timeline> 0.0–0.6 seconds: A green Spotify icon grows smoothly into the center of the dark stage Give it a confident arrival with minimal overshoot
0.6–1.5 seconds:
The icon transitions into a small Spotify identity above two centered lines: …
Reveal them with short masked vertical movements
…
8.3–9.8 seconds:
… Use controlled motion blur during the fastest part of the zoom
…
</timeline>
```

### UI morph "một hình, không cắt" trên 120 BPM
@twoclipping · https://x.com/twoclipping/status/2103273003555402193 · tags: svg · nhóm: Sản phẩm/quảng cáo
Ghi chú: đây là bộ xương được sao chép nhiều nhất corpus, khoảng 10 biến thể. Prompt có đủ `<inputs>`, `<direction>`, `<structure>`, `<build>`, `<gotchas>` và `<start>`.
```
<inputs>
Ask me for: 8 to 12 UI states I want the shape to become (e.g. button, loader, player, slider, toggle, tabs, chart, command palette, toast), pure black and white or one accent color, and a royalty-free song around 120 BPM (e.g. Mixkit, free for commercial use).
</inputs>
<direction>
Dribbble-level UI motion. One shape, never cut: every state is the same element morphing its size, radius and color while its content swaps with a short blur. A cursor drives every change with real clicks and drags. … The last frame is the first frame, so it loops.
Banned: bouncy easing, particle bursts, glows, gradients on UI chrome, mismatched icon strokes, dead time, anything that looks like a template.
</direction>
<structure>
120 BPM, 7 bars, something happens on every beat. …
</structure>
<build>
1. One HTML file, square 1440x1440. Every style is computed from time inside seek(t): no CSS transitions, no timers, no state carried between frames.
2. Springs are closed-form step responses. A value that changes target many times is the sum of one spring per change, so it stays a pure function of time.
…
5. Analyze the song with numpy for the beat grid and start on a downbeat. Place every UI sound by its measured peak.
6. Render with Playwright: 4 subframes per frame, blended with ffmpeg tmix for motion blur at 60fps.
7. Render one frame per beat before the full render. Fix anything off the grid, cramped or hard to read.
</build>
<gotchas>
Never put will-change on anything the camera scales or the text renders blurry. Text that swaps inside a morphing container needs its own enter and exit timing or it overlaps. …
</gotchas>
```

### TanStack AI — launch film có rào chắn độ chính xác
@HowDevelop · https://x.com/HowDevelop/status/2103840883812733090 · tags: canvas · nhóm: Sản phẩm/quảng cáo
Ghi chú: mỗi chuyển cảnh phải minh hoạ một tính năng. Prompt giữ nội dung trong vùng an toàn 9:16 và có mục "Accuracy guardrails" chống phóng đại tính năng.
```
Create and render a 15-second motion graphics video introducing TanStack AI. …
- 1920×1080, 30 fps, exactly 15 seconds; keep important content within a 9:16-safe central area.
- Deliver the rendered MP4 and the editable project/source. …
- Add an original electronic sound design: … The story must also work muted.
… Every transition should visually demonstrate a feature, rather than simply replace one title card with another. … Avoid generic stock footage, spinning logos, fake dashboards, excessive glitch effects, and tiny code nobody can read.
Exact 15-second sequence
- 0:00–0:02 — Hook: A single prompt cursor blinks. It sends one signal that expands into a network of possibilities. …
…
Accuracy guardrails
… Do not call it a stable v1 release. Do not present planned orchestration features as already shipped.
Make the video, inspect the rendered result, and fix any clipped text, weak transitions, mistimed beats, or unreadable frames before delivering it. …
```

### NotchBrowser teaser trên HyperFrames — một camera liên tục
@jake11moran · https://x.com/jake11moran/status/2103237884564414633 · tags: canvas, svg, gsap, ai-image · nhóm: Sản phẩm/quảng cáo
Ghi chú: ví dụ hiếm có gọi thẳng HyperFrames và một component trong registry. Camera chậm 1.5–3 giây, có con trỏ macOS cỡ lớn.
```
Using HyperFrames, make a hype teaser for the product in this post - [link]. Landscape, around 27 seconds. …
Motion should feel slow and polished - one continuous camera over one Mac desktop, no hard cuts. Camera pushes, pulls and pans run like 1.5 to 3 seconds on gentle ease-in-out curves, nothing snappy - aim for half the speed you'd default to. Add motion blur on fast moves and a light film grain finish. Use an oversized macOS cursor. …
1. Open on a big centered line - "in the AI era, the hard part is" - entering word by word from the right with an orange colorama text wipe over it (the `colorama-wipe` registry component). …
…
5. Pan up to a really tight framing of just the notch … A cursor comes up and hovers - the notch morphs into a pill with the name "NotchBrowser", then opens into the browser panel …
```

## Tự sự / music video (bám beat)

### Phim 10 bar có drop, footage thật và match cut
@twoclipping · https://x.com/twoclipping/status/2102554209166000267 · tags: svg, css · nhóm: Tự sự/music video
Ghi chú: mẫu chuẩn cho phim cắt theo nhạc. Grid được hiệu chỉnh theo tiếng kick thật, footage tách thành chuỗi JPEG, SFX đặt theo đỉnh, loudnorm −14 LUFS.
```
<direction>
High-end minimal. One idea per shot, lots of empty space, one accent color, one clean sans (Geist or Inter) with tight tracking. Masked type reveals, match cuts, one smooth camera language. Real footage only, never placeholder cards. No full stops in on-screen text.
Banned: shockwave rings, particle bursts, RGB split, camera shake, lens flares, neon glows, grid floors, flashing backgrounds, bouncy easing.
</direction>
<structure>
10 bars at 120 BPM, 2 seconds each.
Bar 1: the hook lands word by word on the beats. …
The drop: a circle opens out of the button into a dark scene. …
</structure>
<build>
…
2. Real video: extract clips to 30fps JPEG sequences with ffmpeg and swap img sources per frame. seek awaits the image decodes.
3. Analyze the song with numpy: tempo, beat grid, energy per bar, the drop. Calibrate the grid to the real kick hits. Every cut sits on a downbeat, every UI hit on a beat.
…
5. Place each sound effect so its measured peak, not its file start, lands on the event. Keep the effects quiet under the music. Loudnorm to -14 LUFS.
6. Probe 20 or more frames before the full render. …
</build>
<gotchas>
Never set opacity or filter on a preserve-3d element, because it flattens and both faces show. Fade its wrapper instead. …
</gotchas>
```

### MV psychedelic glitch — luật dựng theo từng beat
@pound75423 · https://x.com/pound75423/status/2103722556918464968 · tags: canvas, css · nhóm: Tự sự/music video
Ghi chú: biến "dựng MV" thành bộ luật cụ thể: cut theo beat, cường độ hiệu ứng theo đoạn nhạc, có chỗ nghỉ ở đoạn năng lượng thấp. Pipeline là Canvas → Playwright → ffmpeg.
```
【制作方法】
HTML Canvas でアニメーションを書き、Playwright で 1 フレームずつキャプチャし、ffmpeg で音声と合成して MP4 を出力してください（1280×720、30fps、30MB 以内）。
…
【前処理】
2. 楽曲を解析する：BPM、最初の拍の位置、各小節（4 拍）の頭、
   各セクションのエネルギーの高低（イントロ／A メロ／サビ／落ちる部分）を求める。
【編集ルール】
- 1 拍ごとにカットを切り替える。…
- 隣り合う 2 拍で同じポーズを使わない。
- エネルギーが低い箇所はシーン画像や静かなカットにして、ひと息つかせる。
- エフェクトの強さはセクションに合わせる：イントロ約 40%、A メロ 70%、サビ 100%。
…
- 本番出力の前に、各セクションのスクリーンショット一覧を見せて確認させてください。
```

### Phim ngắn ngoài không gian — shot list hai góc máy
@alexwtlf · https://x.com/alexwtlf/status/2103713416367981005 · tags: canvas · nhóm: Tự sự/music video
Ghi chú: Upstream đã gỡ case này ở 92aee2f (không làm từ một prompt Opus 5.5 đơn thuần): chỉ đọc để học cách viết, không coi là mẫu Opus 5.5. cách viết bản đồ không gian và hình học cố định cho cả phim để giữ continuity, kèm mốc thời gian chính xác cho từng cut.
```
SCENE CONTEXT
… 25 seconds, seven cuts between two camera positions: OUTSIDE, looking at the window from space, and INSIDE, her own eyes looking out through the porthole.
LOCATION MAP
THE WINDOW IS SMALL: a porthole about 50 cm across. …
Geometry, fixed for the whole film: from outside, her right hand is on the screen-LEFT side, the astronaut is on the screen-RIGHT side, …
CUT 1, 0:00 to 0:03, OUTSIDE, wide side view:
At 0:00.5 he pushes off the hull with both hands, gently, and drifts straight back … NO meteor in this cut; nothing in the sky but stars. Last frame: …
```

## 3D / không gian

### Khoảnh khắc mở rương 3D toon (Three.js)
@op7418 · https://x.com/op7418/status/2103724883301814408 · tags: threejs, shader, canvas, gsap · nhóm: 3D/không gian
Ghi chú: bộ quy tắc kỹ thuật cho 3D toon gồm 3–4 bậc shading, viền bằng edge detection, glow đặt sau chủ thể, và danh sách tự kiểm tra frame. Bản gốc là demo tương tác, nhưng các quy tắc dùng được cho video.
```
【主体物：做成真 3D】
- 用 Three.js 建模，不要用平面 SVG 贴图。要有厚度、倒角，以及符合主体的结构细节 …
- 着色用卡通分阶（MeshToonMaterial 加 3～4 阶的渐变贴图），配三种灯光：主光、天光、等级色的轮廓光。
- 描边用后期边缘检测：渲染法线图 + 深度图，再用着色器画线。… 另外做 1.5 倍超采样和多重采样抗锯齿。
  不要用「放大一圈的黑色背面」那种描边，那样粗细不均、转角会断。
…
- 主角的外发光要放在主体背后，只从边缘溢出，不能盖在主体前面把它糊成一片白。
…
- 不要用 CSS 3D 透视去翻转大尺寸元素 … 3D 翻转一律放在 WebGL 里做。
…
【交付前自检】
在蓄力、爆发、揭晓、结算这几个时刻各截一张图，逐张检查：
- 主角有没有被光晕、粒子或文字挡住？ …
```

### Tranh khảm kính và vàng lá — phim WebGL2 80 giây
@zeezomb · https://x.com/zeezomb/status/2102906701552726206 · tags: threejs, shader · nhóm: 3D/không gian
Ghi chú: ý tưởng hình thức chỉ gói trong hai câu. Toàn bộ dựng từ code, không dùng asset nào; nhân vật là đàn mảnh ghép.
```
Make an 80 second square animated film as a single HTML file, using WebGL2 and plain JavaScript, with no libraries and no image, font or audio files. It should look like a glass and gold leaf wall mosaic whose tiles were never glued down, so they can lift, flip, fly and click back into place. Figures are flocks of tiles, so a fish swims by its tiles swimming.
```

### Tái dựng Market Street 1906 từ dữ liệu
@alexalbert__ · https://x.com/alexalbert__/status/2102466523164274839 · tags: threejs, shader, canvas · nhóm: 3D/không gian
Ghi chú: mỗi chi tiết phải truy được về nguồn kèm mức độ tin cậy, và hình được dựng bằng generator tái sử dụng. Bản gốc dùng Blender (ngoài phạm vi), nhưng cách làm "nguồn dữ liệu trước, generator sau" áp dụng được cho Three.js.
```
Recreate Market Street, San Francisco as it stood on April 17, 1906, the afternoon before the earthquake, in Blender. …
Before modeling anything, build a source file from: the 1899-1905 Sanborn fire insurance maps …, period photographs … Record every building with footprint, height, facade material, occupant, and the source for each fact with a confidence level.
Build everything in Blender Python. No downloaded meshes, textures or HDRIs. Write reusable generators (Victorian commercial facade, mansard roof, bay windows, …) and assemble the street from the source file, so every building traces back to data.
Provide a 10 second video up the street.
```

## Kinetic typography (spoken-word)

### "BUILD THE FLOOR" — chữ dựng thành kiến trúc
@Gdgtify · https://x.com/Gdgtify/status/2103458245213929495 · tags: canvas · nhóm: Kinetic typography
Ghi chú: mẫu spoken-word tốt nhất corpus. Từ được gán vai trò kiến trúc, nhịp theo cue sheet của lời nói thay vì beat, có khoảnh khắc lặng 400 ms, render(0)=render(20) và một quality gate 8 frame.
```
Create a 20.00-second kinetic spoken-word film titled "BUILD THE FLOOR." … Every line changes the architecture of the frame. The final declaration must stand on something the earlier words physically constructed. Deliver one self-contained HTML file, 1080×1080, targeting 60fps, using SVG and/or Canvas. …
ART DIRECTION Background #102820. Paper # F4E9D5. Structural accent # F2B544. … Use a high-contrast serif for the speech, a heavy grotesque for load-bearing words, and a restrained monospace for small timing marks. …
CENTRAL VISUAL RULE Words have assigned architectural roles. WAIT is a lintel. WAITING is a suspended load. VOICE is a support. ROOM is an opening. FLOOR is a platform. These roles must emerge from the actual letterforms, not from separate illustrations placed behind text.
STORYBOARD 0.00–3.00 "We were told to wait." The sentence occupies a narrow horizontal opening beneath a massive WAIT. … The pressure comes from the layout, not camera shake. …
CHOREOGRAPHY Do not force the speech onto a dance beat. Use a cue sheet based on phrases, pauses, and emphasis. … Allow at least one 400ms moment of absolute stillness. …
TYPE IMPLEMENTATION Use actual glyph paths for structural words. Preserve counters and legibility during deformation. … do not interpolate arbitrary path points. …
ENGINEERING Implement window. seek(t) as a deterministic scene renderer. … Use a 20-second periodic timeline with render(0)=render(20). …
QUALITY GATE Inspect eight representative frames. Check that the speech reads in the correct order. …
```

### TechHalla — bumper kinetic 20 giây trên 120 BPM
@techhalla · https://x.com/techhalla/status/2103411244468498547 · tags: canvas · nhóm: Kinetic typography
Ghi chú: bản đối lập với mẫu trên vì nhịp ở đây theo beat. Thông điệp khoá cứng theo thứ tự, hệ ba font, stagger 1/16 nốt, mask lấy từ chữ đi ra, cùng một banned list dài.
```
You are a world-class motion designer doing a 20.00s kinetic identity bumper for TechHalla …
DURATION: exactly 20.00 seconds. LOOPABLE: frame 0 == frame last …
FORMAT: one HTML file, 1080×1080 (square, X-native). 60fps.
PALETTE (strict): … No other hues. No gradients on UI chrome. …
TYPE SYSTEM (use all three; never one font for everything): …
MESSAGE (locked — do not soften, do not add filler slogans): …
CONCRETE TECHNIQUES (required — implement, don't approximate):
1. seek(t) pure function of time. No CSS transitions. No setInterval. No React state across frames.
2. Springs = closed-form step responses. Stack one spring per target change so motion stays deterministic.
3. Kinetic type: per-glyph spring (y, opacity, blur). Stagger = 1/16 note at 120 BPM (125ms).
…
5. Mask reveal: destination text revealed by animating a path mask derived from the outgoing word's outlines.
6. Camera: one orthographic camera; only punch-in (1.0→1.08) and horizontal smash-pans timed to beats — never random drift.
…
9. Pre-pass: before full render, export one still per major beat (8 frames). Fix cramped type, orphan words, low contrast — then render.
BANNED:
Generic AI clichés (brains, robots, neural nets, sparkles), soft gradients, bouncy cartoon easing, particle explosions, stock "futuristic HUD", long paragraphs, … purple/blue neon, glassmorphism.
```
