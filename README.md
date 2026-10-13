# opus-video

Agent skill biến một brief hoặc chủ đề tiếng Việt thành video MP4 hoàn chỉnh, xuất 16:9, 9:16 hoặc cả hai. Chạy được trên **Claude Code, OpenAI Codex, Google Antigravity (app và CLI)** và mọi agent đọc được thư mục skill có `SKILL.md`, trên **macOS, Linux, WSL và Windows**.

Skill này là phần điều phối và không tự render. Nó nối các bước sau:

1. **Kịch bản:** viết bằng [viet-pro](https://github.com/abm-dungtq/viet-pro-codex) ở mức đầy đủ (đọc hết review/editorial, lượt Humanizer có ghi chép, lint), có kiểm chứng dữ kiện. `check-viet-pro.mjs` chặn khi chưa đạt; `eleven.mjs` tự chạy lại cổng và không tạo giọng (exit 4) khi chưa đạt.
2. **Plan:** `PLAN.md` (mục tiêu, bảng cảnh, âm thanh, engine, mốc khung hình demo, QA) phải qua `check-preflight.mjs --stage plan` trước khi tạo giọng và dựng.
3. **Âm thanh:** ElevenLabs. Giọng `eleven_v4` có timestamp từng từ, SFX `eleven_text_to_sound_v2`, nhạc nền `music_v2_5`.
4. **Dựng:** [HyperFrames](https://hyperframes.dev) là mặc định. Remotion hoặc Canvas khi dự án cần.
5. **Khung hình demo:** `make-demo.mjs` chụp đúng các mốc trong plan; người dùng duyệt (`DEMO.md`) rồi mới được render bản cuối. `render-final.mjs` là đường duy nhất ra bản giao (`--quality delivery`) và chặn (exit 5) khi thiếu plan, demo hoặc duyệt.
6. **QA:** lint, check, vùng an toàn 9:16, Gemini (qua `agy`) xem video và chấm, tối đa 3 vòng. Kèm caption Facebook + TikTok qua viet-pro.
7. **Footage thật (beta):** `cut.mjs` tìm khoảng lặng và ghép clip theo danh sách cắt.
8. **Clip người dùng làm trục + nền dựng mới:** clip có sẵn lời nói chạy trong khung PiP trên nền bản đồ hay phối cảnh, hiệu ứng bám từng chữ. BRIEF ghi `voice_source: clip`: cổng viet-pro lint phụ đề và chữ trên hình thay cho kịch bản TTS. Phụ đề sinh từ bản chép lời Whisper cùng bảng sửa lỗi nghe máy người dùng duyệt. Nội dung là của người dùng nên không gắn nhãn rào đón ("minh họa", "theo lời người nói"…) lên hình; `video-lint` báo lỗi khi gặp. Xem `references/clip-master-canvas.md`.

Mẫu dựng được chắt lọc từ 813 video làm bằng Opus 5.5 (xem `data/SOURCES.md`).

Đọc thêm: [giới thiệu opus-video](docs/gioi-thieu.md) · [hướng dẫn cài đặt chuyên sâu cho từng agent](docs/cai-dat-agent.md).
Dùng sâu: [hướng dẫn chuyên sâu về các tính năng](docs/huong-dan-chuyen-sau.md) · [thư viện prompt mẫu](docs/thu-vien-prompt/README.md).

---

## 1. Cài đặt nhanh (khuyên dùng)

Installer cài **toàn bộ** những gì skill cần, cho mọi agent tìm thấy trên máy:

- opus-video vào thư mục skill của từng agent (bản cũ được chuyển vào `~/.opus-video-backups/`, không xoá; thư mục là git checkout thì để nguyên);
- `viet-pro` v5.3.0 (bằng installer của chính nó, cùng các agent);
- CLI `hyperframes` và **mọi** skill HyperFrames (`hyperframes`, `hyperframes-core/-animation/-keyframes/-creative/-audio/-cli/-registry/-studio`, `media-use` và mọi workflow: `general-video`, `faceless-explainer`, `product-launch-video`, `pr-to-video`, `motion-graphics`, `music-to-video`, `slideshow`, `embedded-captions`, `talking-head-recut`, `remotion-to-hyperframes`) qua `npx hyperframes skills`;
- file key mẫu `~/.config/opus-video/.env` (quyền chỉ chủ sở hữu đọc được);
- cuối cùng chạy `scripts/setup-check.mjs` và báo `READY` hoặc liệt kê mục còn thiếu kèm lệnh sửa.

### macOS, Linux, WSL, Git Bash

```bash
curl -fsSL https://raw.githubusercontent.com/abm-dungtq/opus-video/main/install.sh | bash
```

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

Cờ khác: `--ref <tag|branch>` (mặc định `main`), `--with-remotion` (thêm skill Remotion, chỉ cần khi `engine: remotion`), `--skip-deps` (chỉ cài opus-video).

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/abm-dungtq/opus-video/main/install.ps1 | iex
```

Chọn agent:

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/abm-dungtq/opus-video/main/install.ps1))) -Hosts claude,codex
```

`-Hosts` nhận `claude`, `codex`, `agy`, `agy-cli`. Cờ khác: `-Ref`, `-WithRemotion`, `-SkipDeps`. Trên Windows, viet-pro được cài bằng `git clone` (viet-pro chưa có installer PowerShell). Nếu dùng WSL thì chạy lệnh bash ở trên bên trong WSL; khi đó agent cũng phải chạy trong WSL.

## 2. Công cụ hệ thống cần có trước

| Công cụ | macOS | Linux (Debian/Ubuntu) | Windows |
|---|---|---|---|
| Node.js ≥ 22 | `brew install node@22` | `nvm install 22` | `winget install OpenJS.NodeJS.LTS` |
| git | `xcode-select --install` | `sudo apt install git` | `winget install Git.Git` |
| ffmpeg + ffprobe | `brew install ffmpeg` | `sudo apt install ffmpeg` | `winget install Gyan.FFmpeg` |
| agy (tuỳ chọn, giám khảo video) | [antigravity.google](https://antigravity.google) | như macOS | như macOS |

Distro khác dùng `dnf`/`pacman` tương ứng. Cài xong mở terminal mới để PATH cập nhật.

## 3. Key

Installer đã tạo `~/.config/opus-video/.env` (Windows: `%USERPROFILE%\.config\opus-video\.env`). Mở bằng trình soạn thảo và điền:

```
ELEVENLABS_API_KEY=...
OPUS_VIDEO_VOICE_ID=...
# tuỳ chọn: TypeSafe Jev xếp hạng case + rà kịch bản
TYPESAFE_API_KEY=...
```

- Giữ quyền chỉ mình bạn đọc được (macOS/Linux: `chmod 600`). Không commit, không dán key vào khung chat với agent.
- Các script tự đọc file này và không bao giờ in giá trị key.

## 4. Kiểm tra cài đặt (bắt buộc)

```bash
node ~/.claude/skills/opus-video/scripts/setup-check.mjs
```

Đổi đường dẫn theo agent (ví dụ `~/.agents/skills/opus-video/...` cho Codex; Windows: `node $HOME\.claude\skills\opus-video\scripts\setup-check.mjs`). Kết quả phải là `READY` (exit 0). Mỗi mục `MISSING` có dòng `fix:` đúng hệ điều hành; sửa xong chạy lại. Thêm `--json` để lấy kết quả dạng máy đọc.

`setup-check` tìm skill trong **mọi** thư mục agent: `~/.claude/skills`, `~/.agents/skills`, `~/.codex/skills`, `~/.gemini/config/skills`, `~/.gemini/antigravity-cli/skills`, `./.claude/skills`, `./.agents/skills`, và thư mục cùng cấp với opus-video. Nó kiểm:

- **Bắt buộc:** Node ≥ 22, git, ffmpeg, ffprobe, CLI `hyperframes` ≥ 0.8.144, `viet-pro` (chạy cả self-test), đủ 20 skill HyperFrames kể trên, `ELEVENLABS_API_KEY`, `OPUS_VIDEO_VOICE_ID` (chỉ kiểm có/không).
- **Tuỳ chọn (WARN):** `agy`, `TYPESAFE_API_KEY`, skill Remotion.

Sau đó kiểm kết nối ElevenLabs:

```bash
node ~/.claude/skills/opus-video/scripts/eleven.mjs doctor
```

Mở **phiên agent mới** sau khi cài để agent nạp skill.

## 5. Cài thủ công (khi không chạy được installer)

```bash
# 1. opus-video: clone vào thư mục skill của agent (đổi đích theo bảng ở mục 1)
git clone https://github.com/abm-dungtq/opus-video ~/.claude/skills/opus-video

# 2. viet-pro (macOS/Linux/WSL; cờ agent giống bảng ở mục 1)
curl -fsSL https://raw.githubusercontent.com/abm-dungtq/viet-pro-codex/v5.3.0/install.sh | bash -s -- --claude

# 3. HyperFrames CLI + toàn bộ skill, cho mọi agent được hỗ trợ
npx --yes hyperframes skills
# nếu lệnh trên lỗi:
npx --yes skills add heygen-com/hyperframes --all

# 4. (tuỳ chọn) Remotion
npx --yes skills add remotion-dev/skills

# 5. kiểm tra
node ~/.claude/skills/opus-video/scripts/setup-check.mjs
```

Windows không có `curl | bash` cho viet-pro: `git clone --depth 1 --branch v5.3.0 https://github.com/abm-dungtq/viet-pro-codex.git`, rồi copy thư mục `skills\viet-pro` vào thư mục skill của agent (ví dụ `%USERPROFILE%\.claude\skills\viet-pro`).

Cài opus-video bằng `git clone` thì cập nhật bằng `git -C <thư mục> pull`; installer không ghi đè git checkout.

## 6. Dùng

| Agent | Gọi skill |
|---|---|
| Claude Code | `/opus-video làm video 30 giây giới thiệu <sản phẩm>, cả 16:9 và 9:16` |
| OpenAI Codex | `$opus-video làm video 30 giây giới thiệu <sản phẩm>, cả 16:9 và 9:16` |
| Google Antigravity (app/CLI) | `/opus-video …` hoặc nói "dùng skill opus-video để …" |
| Agent khác | "Đọc `<thư mục skill>/opus-video/SKILL.md` và làm đúng quy trình trong đó để …" |

Agent nào cũng có thể chọn skill tự động khi bạn nói muốn làm video.

### Quy trình (chi tiết trong `SKILL.md`)

| Bước | Việc | Cổng |
|---|---|---|
| 0 | Kiểm tra cài đặt | `setup-check.mjs` → `READY` |
| 1 | `BRIEF.md` | |
| 2 | Kịch bản viet-pro đầy đủ | `check-viet-pro.mjs` → `PASS` (bắt buộc với tiếng Việt) |
| 3 | Storyboard, tra case mẫu | |
| 4 | Chọn engine | |
| **4b** | **`PLAN.md`** (mẫu ở `references/plan-demo.md`) | `check-preflight.mjs --stage plan` → `PASS` |
| 5 | Giọng, SFX, nhạc nền | `eleven.mjs` exit 4 nếu cổng viet-pro chặn |
| 6 | Dựng | |
| **6b** | **Khung hình demo** (`make-demo.mjs`) → người dùng duyệt → `DEMO.md` `approval:` | `check-preflight.mjs --stage final` → `PASS` |
| 7 | Render nháp (`hyperframes render --quality looks`); **bản cuối chỉ bằng `render-final.mjs`** | exit 5 nếu thiếu plan/demo/duyệt |
| 8 | QA (tối đa 3 vòng) | `QA.md` |
| 9 | Caption Facebook + TikTok | `check-viet-pro.mjs --stage delivery` → `PASS` |

Kết quả nằm trong thư mục dự án: `BRIEF.md`, `script-table.md`, `STORYBOARD.md`, `PLAN.md`, `demo/*.png`, `DEMO.md`, `renders/*.mp4`, `QA.md`, `CAPTIONS.md`.

Agent không tự đăng video hay caption lên mạng xã hội.

## 7. Script

Mọi script đều có `--help` / `-h` (in phần mô tả đầu file, thoát mã 0, không làm gì khác) và chỉ dùng Node built-in.

| Script | Việc |
|---|---|
| `scripts/setup-check.mjs` | Kiểm đủ công cụ, skill, key; in lệnh sửa theo hệ điều hành |
| `scripts/skill-paths.mjs` | Tìm skill trong thư mục của mọi agent (dùng chung cho các script khác) |
| `scripts/check-preflight.mjs` | Cổng plan (`--stage plan`) và demo + duyệt (`--stage final`) |
| `scripts/make-demo.mjs` | Chụp khung hình demo theo `PLAN.md` (`hyperframes snapshot`, hoặc render nháp + ffmpeg cho composition 9:16), ghi `DEMO.md`; `--from-video <mp4>` cắt khung từ bản nháp người dùng đã xem |
| `scripts/render-final.mjs` | Render bản giao `--quality delivery` sau khi cổng final PASS (exit 5 nếu chặn) |
| `scripts/replace-in-file.mjs` | Thay chuỗi bằng regex, thay cho `sed -i` (khác nhau giữa macOS và Linux) |
| `scripts/eleven.mjs` | `doctor`, `tts`, `sfx`, `music`, `audio-meta` (cầu nối sang workflow HyperFrames) |
| `scripts/check-viet-pro.mjs` | Cổng viet-pro: biên bản `## viet_pro`, `script-table.v1.md` + compare, lint từng file lời đọc và `SCRIPT.md`, `CAPTIONS.md` khi giao; dự án `voice_source: clip` lint `script/captions.txt` và `script/on-screen.txt` thay cho bảng kịch bản; `--jev-audit` (tuỳ chọn) chỉ in WARN |
| `scripts/voice-gate.mjs` | Cổng mà `eleven.mjs tts`/`audio-meta` gọi trước khi tạo giọng (exit 4) |
| `scripts/find-cases.mjs` | Tra 813 case mẫu theo nhóm và từ khoá |
| `scripts/rerank-cases.mjs` | (Tuỳ chọn, cần `TYPESAFE_API_KEY`) Jev xếp hạng ~740 case theo brief; thiếu key hoặc lỗi API thì trả kết quả như `find-cases` |
| `scripts/case-features.mjs` | Gắn nhãn một lần cho mọi case vào `data/case-features.jsonl`; chạy lại khi `data/cases.jsonl` đổi |
| `scripts/jev-audit.mjs`, `scripts/jev-audit-eval.mjs` | (Tuỳ chọn) Jev rà lời đọc; đo precision theo pattern |
| `scripts/video-lint.mjs` | Bắt chữ bị ép thường, chữ quá nhỏ, nội dung lấn vùng UI ở khổ 9:16, nhãn rào đón trên hình (`HEDGE_LABEL`: ERROR khi `voice_source: clip`, còn lại WARN) |
| `scripts/captions-from-transcript.mjs` | Phụ đề từ `transcript.json` (Whisper) + `captions.fixes.json` (`fix`, `unclear`, `ranges`): ghi `assets/fx/captions.js`, `script/captions.txt` và `captions.review.md` để người dùng duyệt |
| `scripts/judge.mjs` | Gemini chấm một video (`check`) hoặc so hai phiên bản (`pair`) |
| `scripts/cut.mjs` | `probe` tìm khoảng lặng an toàn; `apply-edl` ghép footage theo danh sách cắt JSON |

## 8. Cập nhật và gỡ

- **Cập nhật:** chạy lại lệnh cài ở mục 1 (bản cũ được chuyển vào `~/.opus-video-backups/<thời điểm>/`). Cài bằng git thì `git -C <thư mục> pull`. Skill HyperFrames: `npx hyperframes skills`.
- **Gỡ:** xoá thư mục `opus-video` trong thư mục skill của từng agent (và `~/.config/opus-video/` nếu không cần key nữa). viet-pro và HyperFrames là skill riêng, gỡ theo hướng dẫn của chúng.

## 9. Test

```bash
node --test ~/.claude/skills/opus-video/scripts/tests/
```

Test cần project thật sẽ tự bỏ qua khi không tìm thấy project đó. Có thể trỏ tới project của bạn bằng `OPUS_VIDEO_SMOKE_DIR` và `OPUS_VIDEO_ABM_DIR`.

## 10. Xử lý sự cố

| Triệu chứng | Cách xử lý |
|---|---|
| `setup-check` báo `skill … not installed` | `npx hyperframes skills` rồi mở phiên agent mới |
| `skill viet-pro … self-test failed` | Cài lại viet-pro (mục 5) |
| `eleven.mjs` exit 4 | Cổng viet-pro chặn: chạy `check-viet-pro.mjs --project .` và sửa các dòng FAIL |
| `render-final.mjs` exit 5 | Thiếu `PLAN.md`, demo hoặc `approval:` trong `DEMO.md`: chạy `check-preflight.mjs --project . --stage final` |
| `npx` chậm hoặc lỗi mạng lần đầu | Chạy lại; `npx` cần tải `hyperframes` một lần |
| Windows: `ffmpeg` không tìm thấy sau khi cài | Mở terminal mới |

## Giấy phép

Mã nguồn và tài liệu dùng giấy phép MIT (xem `LICENSE`). Corpus trong `data/` lấy từ hai repo có giấy phép MIT. Prompt trong corpus thuộc về tác giả gốc, và mỗi dòng đều ghi tác giả cùng link. Repo không phân phối lại video gốc. `scripts/cut.mjs` phỏng theo ý tưởng của [open-edit](https://github.com/veedstudio/open-edit) (Apache-2.0, © VEED LIMITED); xem `NOTICE`.
