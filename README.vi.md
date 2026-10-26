# opus-video

[English](README.md) · **Tiếng Việt**

**Xưởng làm video AI gói gọn trong một skill cho agent.** Bạn tả video mình cần. opus-video cùng bạn chọn hướng hình ảnh, viết kịch bản, tạo giọng đọc, dựng chuyển động, soát từng khung rồi xuất file MP4 sẵn để giao, khổ 16:9, 9:16 hoặc 1:1. Bạn duyệt hình trước khi dựng và duyệt chuyển động trước khi ra bản cuối.

[![Release](https://img.shields.io/badge/release-v2.7.1-orange.svg)](https://github.com/abm-dungtq/opus-video/releases/tag/v2.7.1)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node ≥ 22](https://img.shields.io/badge/node-%E2%89%A5%2022-339933.svg)
![Agents](https://img.shields.io/badge/agents-Claude%20Code%20%C2%B7%20Codex%20%C2%B7%20Antigravity-6f42c1.svg)
![OS](https://img.shields.io/badge/OS-macOS%20%C2%B7%20Linux%20%C2%B7%20WSL%20%C2%B7%20Windows-555.svg)
![Tests](https://img.shields.io/badge/tests-671%20passing-brightgreen.svg)

[Xem video mẫu](#xem-video-mẫu) · [Vì sao chọn opus-video](#vì-sao-chọn-opus-video) · [Cách hoạt động](#cách-hoạt-động) · [Bắt đầu nhanh](#bắt-đầu-nhanh) · [Motion Studio](#trình-dựng-trực-quan-motion-studio) · [Tra cứu](#tra-cứu) · [Hợp tác](#hợp-tác)

---

## Xem video mẫu

Toàn bộ video dưới đây do opus-video làm từ đầu tới cuối. Bấm vào ảnh để mở file MP4 trong [bản release `demo-videos`](https://github.com/abm-dungtq/opus-video/releases/tag/demo-videos).

<table>
  <tr>
    <td align="center" valign="top" width="33%">
      <a href="https://github.com/abm-dungtq/opus-video/releases/download/demo-videos/gemini-argon-9x16.mp4"><img src="docs/demo/gemini-argon-9x16.jpg" height="300" alt="Gemini 4 Argon, 9:16"></a><br>
      <b>Ra mắt sản phẩm</b><br>9:16 · 15 giây<br>
      <sub>Chọn 1 trong 3 styleframe, duyệt chuyển động qua hai vòng animatic.</sub>
    </td>
    <td align="center" valign="top" width="33%">
      <a href="https://github.com/abm-dungtq/opus-video/releases/download/demo-videos/abm-intro-9x16.mp4"><img src="docs/demo/abm-intro-9x16.jpg" height="300" alt="ABM, 9:16"></a><br>
      <b>Giới thiệu doanh nghiệp</b><br>9:16 · 30 giây<br>
      <sub>Bản dọc dựng song song với bản 16:9 trong cùng một dự án.</sub>
    </td>
    <td align="center" valign="top" width="33%">
      <a href="https://github.com/abm-dungtq/opus-video/releases/download/demo-videos/bds-lo-72m2-9x16.mp4"><img src="docs/demo/bds-lo-72m2-9x16.jpg" height="300" alt="Lô đất 72 m², 9:16"></a><br>
      <b>Tin đăng bất động sản</b><br>9:16 · 60 giây · bản Zalo 720p<br>
      <sub>Clip người bán tự quay chạy trong khung nhỏ trên nền bản đồ, phụ đề bám từng chữ.</sub>
    </td>
  </tr>
  <tr>
    <td align="center" valign="top" colspan="2">
      <a href="https://github.com/abm-dungtq/opus-video/releases/download/demo-videos/viet-pro-intro-16x9.mp4"><img src="docs/demo/viet-pro-intro-16x9.jpg" width="420" alt="Viết Pro, 16:9"></a><br>
      <b>Video giải thích</b><br>16:9 · 60 giây<br>
      <sub>Giới thiệu skill viết <a href="https://github.com/abm-dungtq/viet-pro-codex">viet-pro</a> cho người mới.</sub>
    </td>
    <td align="center" valign="top">
      <a href="https://github.com/abm-dungtq/opus-video/releases/download/demo-videos/abm-intro-16x9.mp4"><img src="docs/demo/abm-intro-16x9.jpg" width="300" alt="ABM, 16:9"></a><br>
      <b>Giới thiệu doanh nghiệp</b><br>16:9 · 30 giây
    </td>
  </tr>
</table>

## Vì sao chọn opus-video

Agent lập trình đã viết được hoạt hình bằng HTML. Nhưng nếu để nó tự làm, kết quả thường là một bài trình chiếu: vài thẻ tiêu đề trượt lên rồi mờ đi, giọng đọc lệch khỏi hình, chữ biến mất trước khi người xem kịp đọc. opus-video biến agent thành một ê-kíp sản xuất làm theo quy trình thật và không bỏ qua được bước nào.

- **Chọn hình bằng mắt, không đoán qua prompt.** Agent dựng ba styleframe dài khoảng 3 giây từ chính chủ đề của bạn, theo ba hướng khác hẳn nhau. Bạn chọn một; styleframe đó thành cảnh mở đầu. Kịch bản viết sau, không vượt số chữ mà hướng đó cho phép.
- **Không bản cuối nào ra đời khi bạn chưa xem nó chuyển động.** Agent render clip nháp 540p để bạn duyệt. Sửa file dựng sau khi đã duyệt thì bản cuối bị chặn cho tới khi bạn duyệt lại.
- **Bước nào cũng đo bằng số.** Tiếng động được so với hình theo cửa sổ đồng bộ của ITU-R BT.1359-1. Chữ trên hình được so với lúc giọng đọc nói tới. Nhạc nền nằm dưới giọng 4–7 dB. Video đứng yên như bài trình chiếu thì trượt bài kiểm chuyển động và không được render.
- **Lời tiếng Việt viết như người làm nghề.** Mọi câu đọc, chữ trên hình và caption đều qua cổng biên tập [viet-pro](https://github.com/abm-dungtq/viet-pro-codex). Kịch bản chưa qua cổng thì không tạo được giọng.
- **Dữ liệu thật, không có số bịa.** Tiện ích quanh một địa chỉ lấy từ OpenStreetMap kèm số phút đi bộ. Bài báo, PDF và trang arXiv được lưu nguyên văn, nên con số nào trên hình cũng truy được về nguồn.
- **Một dự án, đủ mọi khổ.** 16:9, 9:16 và 1:1 sinh từ cùng một composition. Mỗi khổ được dàn lại bố cục riêng chứ không cắt xén, lại chừa sẵn vùng giao diện của từng nền tảng.

## Bạn nhận được gì

| | |
|---|---|
| **Hướng sáng tạo** | 8 hướng đạo diễn, 64 phong cách hình ảnh phối được theo từng cảnh, hai phong cách vẽ bằng code từ [lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) (thuỷ màu và sản phẩm thuỷ tinh 3D), cùng chỉ mục 1.003 video mẫu làm bằng Claude Opus 5.5 |
| **Kịch bản** | Lượt biên tập viet-pro đầy đủ, kiểm chứng số liệu với nguồn đã lưu, giới hạn số chữ theo hướng, caption cho Facebook và TikTok |
| **Âm thanh** | Giọng đọc ElevenLabs có mốc thời gian từng từ, tiếng động và nhạc nền. Nhạc soạn được theo dàn ý từng đoạn rồi ghép lại theo ô nhịp cho khớp timeline, lệch không quá 2 ms. Giọng thu thật cũng có mốc từng từ nhờ forced alignment |
| **Hình ảnh** | Đồ hoạ chuyển động [HyperFrames](https://hyperframes.dev) (HTML + GSAP), điểm cắt rơi đúng phách, tiếng động gắn vào chữ được đọc, karaoke tiếng Việt và hình nhún theo giọng. Dùng Remotion hoặc Canvas khi dự án cần |
| **Footage thật** | Cắt clip quay sẵn ở khoảng lặng an toàn (beta), lấy clip của người nói làm trục video, phụ đề từ bản chép lời Whisper do bạn duyệt |
| **Cổng chất lượng** | Cổng plan, duyệt animatic, kiểm chuyển động, đồng bộ tiếng động và chữ, cân nhạc với giọng, vùng an toàn 9:16, lint video, Gemini chấm (tuỳ chọn), cùng một đường render duy nhất, không chạy khi còn cổng chưa qua |
| **Sửa video** | Dự án nào cũng có thể có timeline `project.json`. Mọi thay đổi đi qua một cổng lệnh, nên mỗi lần sửa là một phiên bản, hoàn tác và làm lại được |
| **Agent** | 11 skill, hai agent đạo diễn và thi công, một MCP server để mọi phiên Claude Code đọc và sửa được dự án |

## Cách hoạt động

```
Brief ─▶ 3 styleframe ─▶ Kịch bản (viet-pro) ─▶ PLAN.md ─▶ Giọng, nhạc, tiếng động
  ─▶ Dựng ─▶ Animatic ─▶ bạn duyệt ─▶ Render bản cuối ─▶ QA ─▶ Caption và giao
```

Mỗi mũi tên là một cổng. Cổng plan chặn dự án chưa chọn hướng. Lệnh tạo giọng thoát mã 4 khi cổng kịch bản còn FAIL. `render-final.mjs` là đường duy nhất ra file giao. Lệnh này thoát mã 5 khi thiếu plan, thiếu animatic hay chưa có lời duyệt của bạn.

### Bốn hướng làm việc

| Hướng | Khi bạn nói | Các bước |
|---|---|---|
| `dao-dien` (mặc định) | "làm video", "explainer", "quảng cáo" | brief → styleframe → kịch bản → âm thanh → dựng → giao |
| `nhanh` | "làm nhanh", "giống video này" | brief → case mẫu → kịch bản → âm thanh → dựng → giao |
| `tu-nhac` | "từ bài nhạc này", "theo beat", "từ clip của tôi" | brief → nhạc hoặc footage trước → chọn hướng → kịch bản → dựng → giao |
| `timeline` | "sửa video", "mở studio", "đổi shot" | sửa timeline → lồng tiếng lại câu đã đổi → giao |

Hướng nào cũng giữ cổng viet-pro, PLAN.md, animatic đã duyệt và đường render duy nhất.

## Bắt đầu nhanh

### 1. Cài đặt

macOS, Linux, WSL hoặc Git Bash:

```bash
curl -fsSL https://raw.githubusercontent.com/abm-dungtq/opus-video/main/install.sh | bash
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/abm-dungtq/opus-video/main/install.ps1 | iex
```

Installer cài mọi thứ skill cần cho từng agent nó tìm thấy trên máy: opus-video, viet-pro v5.6.1, HyperFrames CLI cùng bộ skill, kèm một file key mẫu. Bản cũ được chuyển vào `~/.opus-video-backups/` chứ không bị xoá, còn git checkout thì để nguyên. Cuối cùng installer chạy `setup-check` và in `READY`, hoặc in đúng lệnh sửa cho từng mục còn thiếu.

Máy cần có Node.js 22 trở lên, git, ffmpeg và ffprobe. `agy` (Google Antigravity) là tuỳ chọn, dùng để Gemini xem và chấm video.

### 2. Điền key

Mở `~/.config/opus-video/.env` (Windows: `%USERPROFILE%\.config\opus-video\.env`) và điền:

```
ELEVENLABS_API_KEY=...
OPUS_VIDEO_VOICE_ID=...
# tuỳ chọn: TypeSafe Jev xếp hạng case mẫu và rà kịch bản
TYPESAFE_API_KEY=...
```

Chỉ để mình bạn đọc được file này (`chmod 600`). Các script tự đọc file và không bao giờ in key ra.

### 3. Kiểm tra máy

```bash
node ~/.claude/skills/opus-video/scripts/setup-check.mjs
node ~/.claude/skills/opus-video/scripts/eleven.mjs doctor
```

### 4. Làm video đầu tiên

Mở một phiên agent mới rồi gõ:

| Agent | Gõ |
|---|---|
| Claude Code | `/opus-video làm video 30 giây giới thiệu <sản phẩm>, cả 16:9 và 9:16` |
| OpenAI Codex | `$opus-video làm video 30 giây giới thiệu <sản phẩm>, cả 16:9 và 9:16` |
| Google Antigravity | `/opus-video …` hoặc "dùng skill opus-video để …" |
| Agent khác | "Đọc `<thư mục opus-video>/skills/opus-video/SKILL.md` và làm đúng quy trình trong đó để …" |

Khi xong, thư mục dự án có tờ pitch, `BRIEF.md`, bảng kịch bản, `PLAN.md`, animatic kèm lời duyệt, các file MP4 bản cuối, `QA.md` và `CAPTIONS.md`. opus-video không tự đăng gì lên mạng xã hội.

## Trình dựng trực quan Motion Studio

[Motion Studio](https://github.com/abm-dungtq/motion-studio) là ứng dụng web đi kèm, chạy ngay trên máy bạn. Ở đó bạn tạo dự án, trò chuyện và giao việc cho đạo diễn AI, bấm duyệt trên thẻ, sửa timeline kiểu CapCut, rồi xuất MP4 hoặc bộ lớp dựng cho Final Cut Pro, Premiere và DaVinci Resolve. opus-video là provider mặc định của Studio.

```bash
node ~/.claude/skills/opus-video/scripts/studio.mjs start --background   # http://127.0.0.1:4317
```

Plugin công bố cho Studio một hợp đồng có đánh số phiên bản trong `scripts/studio-api.mjs` (`STUDIO_API = 4`). Motion Studio 2.0 chạy với opus-video từ 2.3.0 tới dưới 3.0.

## Có gì mới ở v2.7

- **Nhạc ghép theo ô nhịp.** Soạn nhạc theo dàn ý từng đoạn, ghép các ô nhịp của bản nhạc thô vào lưới đích, rồi đo từng đoạn so với nguồn.
- **Cắt cảnh theo phách, tiếng động theo chữ.** `beat-fit.mjs` dời mỗi điểm cắt về phách gần nhất mà không cắt ngang lời, còn `cues.mjs` gắn một tiếng động vào đúng chữ được đọc.
- **Karaoke tiếng Việt** và hình nhún theo giọng, thêm phần mascot và bộ đếm HUD.
- **Agent đạo diễn và thi công.** Đạo diễn duyệt gu trước khi xuất, kèm chế độ một phiên tiết kiệm hơn.
- **v2.7.1** sửa nhạc theo dàn ý để dùng đúng model `music_v1`, đồng thời sửa lỗi chữ karaoke kẹt trên hình.

Lịch sử đầy đủ ở [CHANGELOG.md](CHANGELOG.md).

## Tra cứu

<details>
<summary><b>Tuỳ chọn cài đặt</b></summary>

Chỉ cài cho một số agent (ghép được nhiều cờ):

```bash
curl -fsSL https://raw.githubusercontent.com/abm-dungtq/opus-video/main/install.sh | bash -s -- --codex --agy
```

| Cờ | Agent | Thư mục cài |
|---|---|---|
| `--claude` | Claude Code | `~/.claude/skills/opus-video` |
| `--codex` | OpenAI Codex | `~/.agents/skills/opus-video` |
| `--agy` | Google Antigravity app/IDE | `~/.gemini/config/skills/opus-video` |
| `--agy-cli` | Google Antigravity CLI | `~/.gemini/antigravity-cli/skills/opus-video` |
| `--workspace` / `-w` | chỉ dự án hiện tại (mọi agent) | `./.claude/skills/` và `./.agents/skills/` |
| (không cờ) | mọi agent có thư mục cấu hình trên máy; không thấy agent nào thì Claude Code | |

Cờ khác: `--ref <tag|branch>` (mặc định `main`), `--with-remotion` (thêm skill Remotion, chỉ cần khi `engine: remotion`), `--skip-deps` (chỉ cài opus-video). PowerShell nhận `-Hosts claude,codex,agy,agy-cli`, `-Ref`, `-WithRemotion` và `-SkipDeps`; trên Windows viet-pro được cài bằng `git clone`.

Claude Code nạp thư mục `~/.claude/skills/opus-video` tại chỗ thành plugin `opus-video@skills-dir`, nên đừng chạy thêm `claude plugin install` trên máy đó. Gọi skill bằng `/opus-video:opus-video`, `/opus-video:ov-brief`… Nếu opus-video nằm chỗ khác, chạy `claude plugin marketplace add <đường dẫn>` rồi `claude plugin install opus-video@opus-video-private`.

Cài thủ công:

```bash
git clone https://github.com/abm-dungtq/opus-video ~/.claude/skills/opus-video
curl -fsSL https://raw.githubusercontent.com/abm-dungtq/viet-pro-codex/v5.6.1/install.sh | bash -s -- --claude
npx --yes hyperframes skills
node ~/.claude/skills/opus-video/scripts/setup-check.mjs
```

Với Codex và Antigravity, sau khi clone tay thì chép `skills/opus-video/SKILL.md` thành `opus-video/SKILL.md` và link từng `skills/ov-*` vào thư mục skill của agent; installer làm sẵn việc này. Cập nhật bằng cách chạy lại lệnh cài, hoặc `git -C <thư mục> pull` nếu là git checkout.

</details>

<details>
<summary><b>Công cụ hệ thống</b></summary>

| Công cụ | macOS | Debian/Ubuntu | Windows |
|---|---|---|---|
| Node.js ≥ 22 | `brew install node@22` | `nvm install 22` | `winget install OpenJS.NodeJS.LTS` |
| git | `xcode-select --install` | `sudo apt install git` | `winget install Git.Git` |
| ffmpeg + ffprobe | `brew install ffmpeg` | `sudo apt install ffmpeg` | `winget install Gyan.FFmpeg` |
| agy (tuỳ chọn) | [antigravity.google](https://antigravity.google) | như macOS | như macOS |

`setup-check` tìm skill trong thư mục của mọi agent và đòi Node ≥ 22, git, ffmpeg, ffprobe, CLI `hyperframes` ≥ 0.8.192, viet-pro (chạy cả self-test), sáu skill HyperFrames, bộ token hướng đạo diễn đi kèm, `ELEVENLABS_API_KEY` và `OPUS_VIDEO_VOICE_ID`. `agy`, `TYPESAFE_API_KEY` và Remotion chỉ báo WARN khi thiếu. Thêm `--json` để lấy kết quả dạng máy đọc.

</details>

<details>
<summary><b>11 skill</b></summary>

| Skill | Việc |
|---|---|
| `opus-video` | Điểm vào: chọn hướng, bốn cổng, bố cục thư mục dự án |
| `ov-setup` | Bước 0: `setup-check`, `eleven.mjs doctor`, key |
| `ov-brief` | Bước 1: `BRIEF.md`, brand kit |
| `ov-direction` | Bước 1b: ba styleframe, chọn hướng và phong cách |
| `ov-cases` | Tra case mẫu (Jev hoặc `find-cases`), hướng nhanh theo mẫu |
| `ov-script` | Bước 2: cổng viet-pro đầy đủ, kiểm chứng nguồn |
| `ov-audio` | Bước 5: giọng, tiếng động, nhạc, mốc thời gian, mix |
| `ov-build` | Bước 3–7: storyboard, `PLAN.md`, dựng, animatic, render nháp |
| `ov-footage` | Footage thật, clip người nói làm trục |
| `ov-deliver` | Bước 7–9: render bản giao, QA, caption, xuất |
| `ov-studio` | `project.json`, cổng lệnh, nhập dự án cũ, MCP server, Motion Studio |

Hai agent `ov-director` (duyệt gu, `Review <n>: revise|ship`) và `ov-executor` nằm trong `agents/`.

</details>

<details>
<summary><b>Các lệnh chính</b></summary>

Script nào cũng có `--help` và chỉ dùng thư viện có sẵn của Node.

| Nhóm | Script |
|---|---|
| Cài đặt | `setup-check.mjs`, `skill-paths.mjs` |
| Chọn hướng | `make-pitch.mjs` (init, render, choose), `directions.mjs`, `styles.mjs`, `lemo.mjs`, `brand.mjs` |
| Kịch bản và nguồn | `check-viet-pro.mjs`, `voice-gate.mjs`, `source-ingest.mjs`, `poi-fetch.mjs`, `find-cases.mjs`, `rerank-cases.mjs`, `case-template.mjs` |
| Âm thanh | `eleven.mjs` (doctor, tts, sfx, music, align, audio-meta), `beat-grid.mjs`, `arrange-music.mjs`, `verify-arrangement.mjs`, `audio-mix.mjs`, `mix-balance.mjs` |
| Dựng | `composition.mjs`, `timing.mjs`, `recipe-pack.mjs`, `beat-fit.mjs`, `cues.mjs`, `reframe.mjs` |
| Cổng và QA | `check-preflight.mjs`, `make-demo.mjs`, `sfx-sync.mjs`, `word-sync.mjs`, `qc-mp4.mjs`, `video-lint.mjs`, `judge.mjs` |
| Giao | `render-final.mjs`, `captions-from-transcript.mjs`, `export.mjs` |
| Timeline | `gateway.mjs` (patch, undo, redo, log, show, derive), `manifest-import.mjs`, `studio.mjs` |
| Footage | `cut.mjs` (probe, apply-edl) |

Đọc sâu hơn: [giới thiệu opus-video](docs/gioi-thieu.md), [cài đặt cho từng agent](docs/cai-dat-agent.md), [hướng dẫn chuyên sâu về tính năng](docs/huong-dan-chuyen-sau.md) và [thư viện prompt mẫu](docs/thu-vien-prompt/README.md).

</details>

<details>
<summary><b>Test và xử lý sự cố</b></summary>

```bash
node --test "$HOME/.claude/skills/opus-video/scripts/tests/*.test.mjs"
```

Giữ dấu ngoặc kép để Node tự mở glob. Test cần dự án thật sẽ tự bỏ qua; trỏ tới dự án của bạn bằng `OPUS_VIDEO_SMOKE_DIR` và `OPUS_VIDEO_ABM_DIR`.

| Triệu chứng | Cách xử lý |
|---|---|
| `setup-check` báo thiếu skill | `npx hyperframes skills`, rồi mở phiên agent mới |
| viet-pro self-test lỗi | Cài lại viet-pro |
| `eleven.mjs` thoát mã 4 | Cổng kịch bản còn FAIL: chạy `check-viet-pro.mjs --project .` và sửa các dòng FAIL |
| `render-final.mjs` thoát mã 5 | Thiếu plan, animatic hoặc lời duyệt: chạy `check-preflight.mjs --project . --stage final` |
| Windows không thấy `ffmpeg` sau khi cài | Mở terminal mới |

Muốn gỡ thì xoá thư mục `opus-video` trong thư mục skill của từng agent. Xoá thêm `~/.config/opus-video/` nếu không cần key nữa.

</details>

## Hợp tác

opus-video miễn phí và mã nguồn mở theo giấy phép MIT. Nếu bạn cần đặt làm video cho thương hiệu, cần một quy trình chỉnh theo phong cách và kênh đăng của đội mình, hoặc cần hỗ trợ khi đưa vào sản xuất thật, hãy [mở issue](https://github.com/abm-dungtq/opus-video/issues) hoặc liên hệ qua [@abm-dungtq](https://github.com/abm-dungtq) trên GitHub.

## Giấy phép

Mã nguồn và tài liệu dùng giấy phép MIT (xem `LICENSE`). Phần lấy từ bên thứ ba được ghi công trong `NOTICE` và `third_party/`:

- Corpus case mẫu trong `data/` lấy từ hai repo giấy phép MIT. Prompt thuộc về tác giả gốc, dòng nào cũng ghi tác giả kèm link. Repo không phân phối lại video gốc.
- Hồ sơ phong cách, skeleton composition, nguyên tắc chuyển động, thuật toán phách và reframe, ghép nhạc, beat-fit, cues, karaoke và vai đạo diễn/thi công phỏng theo skill motion-video của AgentKit (MIT, © 2026 BestAgentKits).
- Hai phong cách lemo phỏng theo [lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) (MIT). `lemo.mjs` chép engine của nó và three.js (MIT) vào dự án của bạn kèm giấy phép; repo này không phân phối lại chúng.
- `third_party/hyperframes-skills/` là bản sao nguyên vẹn bộ skill của HyperFrames v0.8.184 (Apache-2.0).
- `scripts/cut.mjs` phỏng theo ý tưởng của [open-edit](https://github.com/veedstudio/open-edit) (Apache-2.0, © VEED LIMITED).
