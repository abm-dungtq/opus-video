# opus-video

[English](README.md) · **Tiếng Việt**

opus-video là plugin cho Claude Code, dùng được cả với OpenAI Codex và Google Antigravity, biến một chủ đề hay một bản brief thành video tiếng Việt hoàn chỉnh. Agent làm cùng bạn theo một quy trình cố định: brief, chọn hướng hình ảnh, kịch bản phải qua cổng [viet-pro](https://github.com/abm-dungtq/viet-pro-codex), giọng đọc ElevenLabs, hiệu ứng âm thanh và nhạc, dựng bằng [HyperFrames](https://hyperframes.dev) (HTML và GSAP), clip nháp (animatic) để bạn duyệt, rồi render bản giao, kiểm tra chất lượng và viết caption. Video xuất ra là MP4 khổ 16:9, 9:16 hoặc 1:1. Plugin không tự đăng gì lên mạng xã hội.

[![Release](https://img.shields.io/badge/release-v2.7.1-orange.svg)](https://github.com/abm-dungtq/opus-video/releases/tag/v2.7.1)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node ≥ 22](https://img.shields.io/badge/node-%E2%89%A5%2022-339933.svg)
![Tests](https://img.shields.io/badge/tests-683%20passing-brightgreen.svg)

[Video mẫu](#video-mẫu) · [Plugin làm được gì](#plugin-làm-được-gì) · [Cài đặt](#cài-đặt) · [Skill và hướng](#các-skill-và-bốn-hướng-vận-hành) · [Quy trình](#quy-trình-9-bước) · [Cổng viet-pro](#cổng-viet-pro) · [Script](#các-script-chính) · [Phong cách Lemo-Opuscar](#phong-cách-lemo-opuscar) · [Motion Studio](#motion-studio) · [Test](#test-và-xử-lý-lỗi) · [Ghi công](#ghi-công-và-giấy-phép) · [Đóng góp](#đóng-góp)

## Video mẫu

Các video dưới đây làm bằng opus-video. Bấm vào ảnh để mở file MP4 trong [bản release `demo-videos`](https://github.com/abm-dungtq/opus-video/releases/tag/demo-videos).

| | | |
|---|---|---|
| [![Ra mắt sản phẩm, 9:16](docs/demo/gemini-argon-9x16.jpg)](https://github.com/abm-dungtq/opus-video/releases/download/demo-videos/gemini-argon-9x16.mp4) | [![Giới thiệu doanh nghiệp, 9:16](docs/demo/abm-intro-9x16.jpg)](https://github.com/abm-dungtq/opus-video/releases/download/demo-videos/abm-intro-9x16.mp4) | [![Tin đăng bất động sản, 9:16](docs/demo/bds-lo-72m2-9x16.jpg)](https://github.com/abm-dungtq/opus-video/releases/download/demo-videos/bds-lo-72m2-9x16.mp4) |
| Ra mắt sản phẩm, 9:16, 15 giây | Giới thiệu doanh nghiệp, 9:16, 30 giây | Tin đăng bất động sản dùng clip người bán tự quay, 9:16 bản 720p, 60 giây |
| [![Explainer, 16:9](docs/demo/viet-pro-intro-16x9.jpg)](https://github.com/abm-dungtq/opus-video/releases/download/demo-videos/viet-pro-intro-16x9.mp4) | [![Giới thiệu doanh nghiệp, 16:9](docs/demo/abm-intro-16x9.jpg)](https://github.com/abm-dungtq/opus-video/releases/download/demo-videos/abm-intro-16x9.mp4) | |
| Video giới thiệu viet-pro, 16:9, 60 giây | Giới thiệu doanh nghiệp, 16:9, 30 giây | |

## Plugin làm được gì

- **Bạn chọn hình bằng mắt.** Với dự án mới, agent dựng ba styleframe ngắn từ chính chủ đề của bạn, mỗi cái một hướng khác hẳn nhau. Bạn chọn một, rồi kịch bản mới được viết, trong giới hạn số từ của hướng đó. Có 8 hướng đạo diễn và 64 hồ sơ phong cách, cộng hai phong cách canvas lấy từ lemo-opuscar (xem [Phong cách Lemo-Opuscar](#phong-cách-lemo-opuscar)).
- **Chưa duyệt animatic thì chưa có bản cuối.** Agent render animatic 540p để bạn duyệt. `render-final.mjs` từ chối render bản giao (exit 5) khi thiếu plan, thiếu animatic, chưa duyệt, hoặc animatic gần như đứng yên.
- **Đồng bộ có đo đạc.** Hiệu ứng âm thanh được đo theo khung đồng bộ ITU-R BT.1359-1, chữ trên hình được so với lúc từ đó được đọc, nhạc nằm dưới giọng 4 đến 7 dB (`mix-balance.mjs`).
- **Âm thanh.** Giọng ElevenLabs có mốc thời gian từng từ, hiệu ứng âm thanh và nhạc. Nhạc có thể soạn theo kế hoạch từng đoạn, cắt lại theo ô nhịp cho khớp timeline và đối chiếu với bản gốc. Điểm cắt cảnh có thể bám theo phách, hiệu ứng âm thanh có thể gắn vào một từ được đọc. Forced alignment lấy mốc từng từ cho giọng thu thật. Gemini TTS là lựa chọn thêm cho giọng đọc.
- **Dữ liệu thật.** Tiện ích xung quanh lấy từ OpenStreetMap, kèm khoảng cách và thời gian đi bộ. Bài báo, file PDF và trang tóm tắt arXiv được lưu nguyên văn trong `sources/`, nên con số nào trên hình cũng đối chiếu được với bản gốc.
- **Case tham khảo.** Bộ chỉ mục 1.003 video làm bằng Claude Opus 5.5 (từ hai danh sách giấy phép MIT), được xếp hạng theo brief bằng TypeSafe Jev khi có key, nếu không thì theo từ khoá.
- **Footage thật (beta).** Cắt clip nói chuyện hay phỏng vấn tại các khoảng lặng, hoặc giữ clip của người nói làm trục cho phần dựng mới.
- **Sửa trên timeline.** Dự án có thể có timeline `project.json`. Mọi chỉnh sửa đi qua một cổng lệnh duy nhất, nên mỗi lần sửa là một phiên bản, hoàn tác và làm lại được. Một MCP server mở phần này cho các phiên agent.

## Cài đặt

### Cần có

Node.js 22 trở lên, git, ffmpeg kèm ffprobe. `agy` (Antigravity CLI đã đăng nhập) là tuỳ chọn, dùng cho bước Gemini chấm video trong `judge.mjs`; thiếu nó thì QA soát bằng ảnh tĩnh.

### Trình cài đặt

macOS, Linux, WSL hoặc Git Bash:

```bash
curl -fsSL https://raw.githubusercontent.com/abm-dungtq/opus-video/main/install.sh | bash
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/abm-dungtq/opus-video/main/install.ps1 | iex
```

Trình cài đặt cài opus-video, viet-pro v5.6.1, CLI và các skill HyperFrames cho mọi agent nó tìm thấy, rồi tạo file key. Bản cũ được chuyển sang `~/.opus-video-backups/` chứ không bị xoá. Cuối cùng nó chạy `setup-check`.

Muốn cài cho một vài agent thôi thì thêm cờ (ghép được nhiều cờ):

| Cờ | Agent | Thư mục |
|---|---|---|
| `--claude` | Claude Code | `~/.claude/skills/opus-video` |
| `--codex` | OpenAI Codex | `~/.agents/skills/opus-video` |
| `--agy` | Antigravity app/IDE | `~/.gemini/config/skills/opus-video` |
| `--agy-cli` | Antigravity CLI | `~/.gemini/antigravity-cli/skills/opus-video` |
| `--workspace`, `-w` | chỉ dự án hiện tại | `./.claude/skills` và `./.agents/skills` |

Cờ khác: `--ref <nhánh-hoặc-tag>` (mặc định `main`), `--with-remotion` (skill Remotion, chỉ cần khi `engine: remotion`), `--skip-deps` (chỉ cài opus-video, bỏ viet-pro và HyperFrames). Ví dụ: `... | bash -s -- --codex --agy`.

### Claude Code dạng plugin

Claude Code nạp thẳng `~/.claude/skills/opus-video` thành plugin `opus-video@skills-dir`, nên trên máy đó đừng chạy thêm `claude plugin install`. Nếu plugin nằm ở chỗ khác, thêm thư mục đó làm marketplace rồi cài từ đó:

```bash
claude plugin marketplace add <đường-dẫn-opus-video>
claude plugin install opus-video@opus-video-private
```

### Windows

`install.ps1` nhận `-Hosts claude,codex,agy,agy-cli`, `-Ref`, `-WithRemotion` và `-SkipDeps`. Nó cài viet-pro bằng `git clone` thẻ release của viet-pro-codex, vì viet-pro chưa có trình cài cho PowerShell. Bản PowerShell chưa được chạy thử trên máy Windows thật; nếu lỗi, cài tay theo [hướng dẫn cài cho agent](docs/cai-dat-agent.md). Dùng WSL thì cài và chạy agent bên trong WSL.

### Key

Điền vào `~/.config/opus-video/.env` (Windows: `%USERPROFILE%\.config\opus-video\.env`):

```
ELEVENLABS_API_KEY=...
OPUS_VIDEO_VOICE_ID=...
# tuỳ chọn: TypeSafe Jev xếp hạng case tham khảo và phong cách lemo, soát kịch bản
TYPESAFE_API_KEY=...
# tuỳ chọn: chỉ cần khi dùng giọng Gemini
GEMINI_API_KEY=...
```

Chỉ để mình bạn đọc được file này (`chmod 600`). Script đọc file nhưng không bao giờ in key ra.

### Kiểm tra máy

```bash
node ~/.claude/skills/opus-video/scripts/setup-check.mjs
node ~/.claude/skills/opus-video/scripts/eleven.mjs doctor
```

`setup-check` in `READY`, hoặc in lệnh sửa cho từng mục còn thiếu. Nó đòi Node 22 trở lên, git, ffmpeg, ffprobe, CLI `hyperframes` từ 0.8.192, viet-pro cùng bài tự kiểm của nó, các skill HyperFrames, `ELEVENLABS_API_KEY` và `OPUS_VIDEO_VOICE_ID`. Thiếu `agy`, `TYPESAFE_API_KEY` hay Remotion chỉ bị cảnh báo. Thêm `--json` nếu cần đầu ra cho máy đọc.

### Làm video

Mở phiên agent mới và tả video bạn cần, ví dụ "làm video giới thiệu <sản phẩm> dài 30 giây, khổ 16:9 và 9:16".

- Claude Code tự chọn skill `opus-video`. Bạn cũng có thể gọi từ menu lệnh gạch chéo, nơi skill của plugin nằm dưới tiền tố `opus-video:`.
- Codex: `$opus-video <yêu cầu>`.
- Antigravity: `/opus-video <yêu cầu>`, hoặc "dùng skill opus-video để ...".
- Agent khác: "Đọc `<opus-video>/skills/opus-video/SKILL.md` và làm theo để ...".

## Các skill và bốn hướng vận hành

Plugin có 11 skill. `opus-video` là điểm vào: nó chọn hướng rồi gọi các skill `ov-*` theo thứ tự.

| Skill | Việc |
|---|---|
| `opus-video` | Điểm vào: chọn hướng, giữ luật chung và các cổng |
| `ov-setup` | Bước 0: `setup-check`, `eleven.mjs doctor`, key |
| `ov-brief` | Bước 1: `BRIEF.md` tối thiểu, bộ nhận diện thương hiệu |
| `ov-direction` | Bước 1b: gợi ý phong cách lemo-opuscar, ba styleframe, chốt hướng và phong cách |
| `ov-cases` | Case tham khảo (Jev hoặc `find-cases`); hướng làm nhanh từ một case |
| `ov-script` | Bước 2: cổng viet-pro đầy đủ, kiểm chứng nguồn |
| `ov-audio` | Bước 5: giọng, SFX, nhạc, đo phách, mốc thời gian, mix |
| `ov-build` | Bước 3 đến 7: storyboard, engine, `PLAN.md`, dựng, animatic, render nháp |
| `ov-footage` | Footage thật, hoặc clip của người nói làm trục |
| `ov-deliver` | Bước 7 đến 9: render bản giao, QA, caption, xuất file |
| `ov-studio` | `project.json`, cổng lệnh, nhập dự án cũ, Motion Studio |

Thư mục `agents/` có hai agent: `ov-director` (chỉ đọc; viết hướng dựng từng cảnh và duyệt contact sheet) và `ov-executor` (chạy quy trình theo hướng đã chốt). Nói `--poor` hoặc "tiết kiệm" để làm hết trong một phiên với một vòng duyệt; không cổng nào bị bỏ. Chi tiết ở [references/dao-dien-va-thi-cong.md](references/dao-dien-va-thi-cong.md).

| Hướng | Khi bạn nói | Chuỗi skill |
|---|---|---|
| `dao-dien` (đạo diễn, mặc định) | "làm video", "explainer", "quảng cáo" | setup → brief → direction → script → audio → build → deliver |
| `nhanh` (theo một case) | "làm nhanh", "giống video này" | setup → brief → cases → script → audio → build → deliver |
| `tu-nhac` (từ nhạc hoặc footage) | "từ bài nhạc này", "theo beat", "từ clip của tôi" | setup → brief → audio (đo phách trước) hoặc footage → direction → script → build → deliver |
| `timeline` (sửa dự án đã có) | "sửa video", "mở studio", "đổi shot" | studio → sửa qua gateway → audio (chỉ câu đã đổi) → deliver |

Hướng nào cũng giữ cổng viet-pro và các cổng giao của `render-final.mjs`. Hướng nhanh chỉ thay ba styleframe bằng một case tham khảo.

## Quy trình 9 bước

| Bước | Việc | Skill |
|---|---|---|
| 0 | Kiểm tra công cụ, skill, key | `ov-setup` |
| 1 | Brief tối thiểu | `ov-brief` |
| 1b | Gợi ý lemo-opuscar, ba styleframe, bạn chọn hướng | `ov-direction` |
| 2 | Kịch bản qua cổng viet-pro | `ov-script` |
| 3, 4, 4b | Storyboard (có tra case), engine, `PLAN.md` và cổng plan | `ov-build` |
| 5 | Giọng, SFX, nhạc, mốc thời gian, mix | `ov-audio` |
| 6, 6b | Dựng cảnh, rồi animatic để bạn duyệt | `ov-build` |
| 7 | Render bản giao qua `render-final.mjs` | `ov-deliver` |
| 8 | QA: `qc-mp4`, `word-sync`, `video-lint`, `judge` nếu có | `ov-deliver` |
| 9 | Caption, bàn giao và xuất theo từng nền tảng | `ov-deliver` |

Ở hướng đạo diễn, thứ tự là 0, 1, 1b, 2, 3, 4, 4b, 5, 6, 6b, 7, 8, 9. Bốn cổng không bỏ được: hướng bạn chọn bằng mắt, kịch bản qua viet-pro, `PLAN.md`, và animatic đã duyệt. Thư mục dự án cuối cùng có `BRIEF.md`, `STORYBOARD.md`, bảng kịch bản, `PLAN.md`, `DEMO.md`, `QA.md`, `CAPTIONS.md`, `assets/` và `renders/`.

## Cổng viet-pro

Mọi lời đọc, chữ trên hình và caption tiếng Việt đều đi qua quy trình [viet-pro](https://github.com/abm-dungtq/viet-pro-codex) trước khi tạo giọng hay render: bảng kịch bản ba cột, một lượt Humanizer có ghi chép, lint, và biên bản `## viet_pro` trong dự án. Sau đó:

```bash
node <opus-video>/scripts/check-viet-pro.mjs --project .                     # trước khi tạo giọng (stage script)
node <opus-video>/scripts/check-viet-pro.mjs --project . --stage delivery    # trước khi bàn giao
```

Lệnh trả exit 0 khi đạt, exit 1 khi cổng chặn. `eleven.mjs` chạy lại đúng cổng này trước khi tạo hay căn giọng, và trả exit 4 khi cổng còn chặn. Sửa một câu đọc về sau thì cổng phải đạt lại trước khi đọc lại câu đó. Quy trình chi tiết ở [references/script-workflow.md](references/script-workflow.md).

## Các script chính

Mọi script nằm trong `scripts/`, chỉ dùng thư viện có sẵn của Node, và in cách dùng, cờ, mã thoát khi gọi `--help`.

| Nhóm | Script |
|---|---|
| Cài đặt | `setup-check.mjs`, `skill-paths.mjs` |
| Hướng hình ảnh | `make-pitch.mjs` (`init`, `render`, `choose`), `directions.mjs`, `styles.mjs`, `lemo-pick.mjs`, `lemo.mjs`, `brand.mjs` |
| Kịch bản và nguồn | `check-viet-pro.mjs`, `voice-gate.mjs`, `source-ingest.mjs`, `poi-fetch.mjs`, `find-cases.mjs`, `rerank-cases.mjs`, `case-template.mjs` |
| Âm thanh | `eleven.mjs` (`doctor`, `tts`, `sfx`, `music`, `align`, `audio-meta`), `beat-grid.mjs`, `arrange-music.mjs`, `verify-arrangement.mjs`, `audio-mix.mjs`, `mix-balance.mjs` |
| Dựng | `composition.mjs` (`init`, `add-part`), `timing.mjs`, `recipe-pack.mjs`, `beat-fit.mjs`, `cues.mjs`, `reframe.mjs` |
| Cổng và QA | `check-preflight.mjs` (`--stage plan`, `--stage final`), `make-demo.mjs`, `sfx-sync.mjs`, `word-sync.mjs`, `qc-mp4.mjs`, `video-lint.mjs`, `judge.mjs` |
| Bàn giao | `render-final.mjs`, `captions-from-transcript.mjs`, `export.mjs` |
| Timeline | `gateway.mjs` (`patch`, `undo`, `redo`, `log`, `show`, `derive`), `manifest-import.mjs`, `studio.mjs` |
| Footage | `cut.mjs` (`probe`, `apply-edl`) |

Hướng dẫn dài hơn: [giới thiệu](docs/gioi-thieu.md), [hướng dẫn cài cho agent](docs/cai-dat-agent.md), [hướng dẫn chuyên sâu](docs/huong-dan-chuyen-sau.md), [thư viện prompt](docs/thu-vien-prompt/README.md). Ghi chú từng bản phát hành ở [CHANGELOG.md](CHANGELOG.md).

## Phong cách Lemo-Opuscar

[lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) của LemoLab là thư viện phong cách phim viết bằng code. Ở commit mà opus-video ghim (trong `data/lemo/styles.json`) thư viện có 59 phong cách; xem trong [gallery](https://lemomo-ai.github.io/lemo-opuscar/). Ở bước 1b, `ov-direction` gợi ý hai hoặc ba phong cách hợp brief trước khi dựng styleframe.

```bash
node <opus-video>/scripts/lemo.mjs fetch     # mỗi máy một lần, cần mạng
node <opus-video>/scripts/lemo-pick.mjs rank --brief-json BRIEF.case-query.json --limit 3 --stats
node <opus-video>/scripts/lemo-pick.mjs choose --project . --style <slug> --search "<lemo_search>"
```

- `fetch` tải thêm `style.json` và `STYLE.md` của từng phong cách vào cache trên máy. `rank` đọc các file đó; `--library <dir>` trỏ sang một bản thư viện khác, ví dụ cache của Motion Studio.
- `BRIEF.case-query.json` là bản brief dạng JSON tiếng Anh mà agent viết từ brief của bạn cho `ov-cases`.
- Có `TYPESAFE_API_KEY` thì Jev chấm mọi phong cách từ 0 đến 4 trong một lần gọi: hình, công dụng quen thuộc và giọng của phong cách có hợp brief không. Điểm bằng nhau thì xếp theo từ khoá.
- Không có key, hoặc lần gọi Jev lỗi (lỗi HTTP, quá thời gian, trả về sai dạng), `rank` xếp theo từ khoá và vẫn trả exit 0: từ của brief có trong công dụng của phong cách được tính ba lần, trong tên và nhóm hai lần, trong câu tóm tắt phim mẫu và phần mở đầu `STYLE.md` một lần. Khi lần gọi lỗi, lệnh in một dòng báo trên stderr.
- Mỗi kết quả có lý do bằng tiếng Việt và cho biết phong cách đó là lớp canvas mà `lemo.mjs add` vẽ được, hay phải dựng theo ngữ pháp trong `STYLE.md`. `--stats` in giá trị `lemo_search` để ghi vào brief.
- `choose` ghi lựa chọn vào front matter của `BRIEF.md`: `lemo_style: <slug>` nếu là phong cách có lớp canvas (hiện có `watercolor` và `glass-product`), hoặc `lemo_ref: <slug>` nếu chỉ dựng theo ngữ pháp. Lệnh cũng ghi `lemo_search:` (`jev` hoặc `keyword (<lý do>)`) và thêm một dòng ghi công LemoLab vào `assets/CREDITS.md`.
- Với phong cách có lớp canvas, `lemo.mjs add --project . --style <slug>` chép engine vào dự án và vẽ nó dưới composition HyperFrames. Chữ tiếng Việt vẫn nằm ở lớp HTML. Lớp này vẽ cho khổ 16:9; bản dọc cần scene riêng.

Hợp đồng của scene, giấy phép và số đo tốc độ render nằm ở [references/lemo-canvas.md](references/lemo-canvas.md).

## Motion Studio

[Motion Studio](https://github.com/abm-dungtq/motion-studio) là một ứng dụng web riêng, chạy trên máy bạn. Ở đó bạn tạo dự án, giao việc cho đạo diễn AI và duyệt bằng thẻ, sửa timeline, xuất MP4 hoặc bộ lớp dựng cho CapCut, Final Cut Pro, Premiere và DaVinci Resolve. opus-video là provider của Studio. Script `studio.mjs` trong plugin chỉ là lớp chuyển tiếp: nó tìm Studio qua `MOTION_STUDIO_HOME` rồi chạy:

```bash
node <opus-video>/scripts/studio.mjs start --background   # http://127.0.0.1:4317
node <opus-video>/scripts/studio.mjs status
node <opus-video>/scripts/studio.mjs stop
```

Studio chỉ gọi plugin qua `scripts/studio-api.mjs`, file này xuất `STUDIO_API = 4` và phiên bản plugin. Bảng tương thích nằm trong README của Motion Studio.

## Test và xử lý lỗi

```bash
node --test "<opus-video>/scripts/tests/*.test.mjs"
```

Giữ dấu nháy để Node tự mở rộng mẫu tên file. Vài test dùng một dự án thật; trỏ chúng sang dự án của bạn bằng `OPUS_VIDEO_SMOKE_DIR` và `OPUS_VIDEO_ABM_DIR`.

| Hiện tượng | Cách xử lý |
|---|---|
| `setup-check` báo thiếu skill | `npx hyperframes skills`, rồi mở phiên agent mới |
| viet-pro tự kiểm lỗi | Cài lại viet-pro |
| `eleven.mjs` trả exit 4 | Cổng kịch bản đang chặn: chạy `check-viet-pro.mjs --project .` và sửa các dòng FAIL |
| `render-final.mjs` trả exit 5 | Thiếu plan, animatic hoặc chưa duyệt: chạy `check-preflight.mjs --project . --stage final` |
| `lemo-pick.mjs` trả exit 4 | Chưa có thư viện phong cách: chạy `lemo.mjs fetch` |
| Windows không thấy `ffmpeg` sau khi cài | Mở cửa sổ terminal mới |

Gỡ cài đặt: xoá thư mục `opus-video` trong thư mục skill của từng agent, và xoá `~/.config/opus-video/` nếu không cần giữ key.

## Ghi công và giấy phép

opus-video dùng giấy phép MIT ([LICENSE](LICENSE)). Phần lấy từ bên thứ ba được liệt kê trong [NOTICE](NOTICE), giấy phép đi kèm nằm trong `third_party/`:

- `scripts/cut.mjs` phỏng theo ý tưởng của [open-edit](https://github.com/veedstudio/open-edit) (Apache-2.0, VEED LIMITED).
- Hồ sơ phong cách, khung composition, nguyên tắc chuyển động, thuật toán beat-grid, reframe và chọn phong cách, sắp nhạc, beat-fit, cues, phụ đề karaoke, đường bao giọng và vai đạo diễn, thợ dựng phỏng theo skill motion-video của AgentKit (MIT, BestAgentKits).
- Hai hồ sơ phong cách lemo và `templates/lemo/` phỏng theo [lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) của LemoLab (mã MIT, phim mẫu CC BY 4.0). `lemo.mjs` chép engine của nó và three.js (MIT) vào dự án của bạn kèm giấy phép, còn `lemo-pick.mjs` đọc file phong cách từ cache trên máy; repo này không phân phối lại cả hai.
- `third_party/hyperframes-skills/` là bản chép nguyên trạng một số file từ skill của HyperFrames v0.8.184 (Apache-2.0).
- Case tham khảo trong `data/` lấy từ hai danh sách giấy phép MIT. Prompt thuộc về tác giả gốc, mỗi dòng có link tới tác giả, video gốc không được phân phối lại. Nguồn và commit ghi ở [data/SOURCES.md](data/SOURCES.md).

## Đóng góp

Báo lỗi và pull request gửi tại [github.com/abm-dungtq/opus-video](https://github.com/abm-dungtq/opus-video/issues).

- Chạy toàn bộ test ở trên trước khi mở pull request, và thêm test cho hành vi đã đổi.
- Thêm một dòng dưới `## Unreleased` trong [CHANGELOG.md](CHANGELOG.md) cho thay đổi mà người dùng hay Motion Studio nhận thấy.
- Viết commit theo conventional commits (`feat:`, `fix:`, `docs:` ...).
- Script chỉ dùng thư viện có sẵn của Node, và CLI mới nào cũng phải có khối `--help`.
- Không sửa các skill `hyperframes*`, `media-use` hay `viet-pro` từ repo này; chúng được cập nhật từ upstream.
- Giữ [NOTICE](NOTICE) và `third_party/` khớp với mọi phần phỏng theo bên thứ ba.
- Không bao giờ commit key, file `.env` hay media đã render.
