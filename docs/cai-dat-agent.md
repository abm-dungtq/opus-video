# Hướng dẫn cài đặt opus-video cho từng agent

Tài liệu này dành cho người cài opus-video lên một agent bất kỳ, hoặc cho chính agent đọc để tự cài. Bản tóm tắt nằm trong [README.md](../README.md). Ở đây giải thích kỹ cơ chế tìm skill, những gì phải có trên máy, cách cài từng agent, cách kiểm tra và cách gỡ lỗi.

## 1. opus-video cần gì từ agent

opus-video là một plugin gồm 11 skill trong `skills/` (điểm vào là `skills/opus-video/SKILL.md`), cùng `references/`, `scripts/` và `data/` dùng chung. Agent đọc skill rồi chạy các script Node trong `scripts/`. Vì vậy agent chỉ cần bốn năng lực:

| Năng lực | Dùng vào |
|---|---|
| Đọc và ghi file trong thư mục dự án | brief, kịch bản, `PLAN.md`, composition, `DEMO.md`, `QA.md` |
| Chạy lệnh shell (`node`, `npx`, `ffmpeg`, `git`) | mọi script và CLI `hyperframes` |
| Truy cập mạng | ElevenLabs, `npx` tải `hyperframes`, TypeSafe Jev nếu có key |
| Xem ảnh PNG | tự soát khung hình demo và khung hình QA |

Agent không có quyền chạy shell vẫn đọc được `SKILL.md`, nhưng không vượt qua được các cổng kiểm tra, nên không làm ra video.

## 2. Cơ chế tìm skill

Mỗi agent nạp skill từ một thư mục riêng. opus-video được cài vào đúng thư mục đó. Các script của nó tìm skill phụ thuộc (`viet-pro`, `hyperframes*`, `media-use`, các workflow HyperFrames) theo thứ tự sau, dừng ở chỗ tìm thấy đầu tiên:

1. Thư mục cùng cấp với opus-video
2. `~/.claude/skills` (Claude Code)
3. `~/.agents/skills` (OpenAI Codex)
4. `~/.codex/skills` (Codex, vị trí cũ)
5. `~/.gemini/config/skills` (Antigravity app/IDE)
6. `~/.gemini/antigravity-cli/skills` (Antigravity CLI)
7. `./.claude/skills` và `./.agents/skills` trong thư mục đang làm việc

Nhờ vậy opus-video có thể nằm ở một agent trong khi viet-pro nằm ở agent khác mà vẫn chạy được. Muốn chỉ định viet-pro ở một nơi cụ thể, đặt biến môi trường `VIET_PRO_DIR` hoặc truyền `--vp <thư mục>` cho `check-viet-pro.mjs`.

Trong mọi skill, `$OV` là thư mục gốc plugin opus-video, tức thư mục chứa `skills/` và `scripts/`. Agent tự thay `$OV` bằng đường dẫn thật khi chạy lệnh; trên PowerShell, viết đầy đủ đường dẫn.

## 3. Chuẩn bị máy

Bắt buộc có Node.js 22 trở lên, git, ffmpeg và ffprobe. Kiểm nhanh:

```bash
node -v
git --version
ffmpeg -version
```

| Công cụ | macOS | Linux (Debian/Ubuntu) | Windows |
|---|---|---|---|
| Node.js ≥ 22 | `brew install node@22` | `nvm install 22` | `winget install OpenJS.NodeJS.LTS` |
| git | `xcode-select --install` | `sudo apt install git` | `winget install Git.Git` |
| ffmpeg + ffprobe | `brew install ffmpeg` | `sudo apt install ffmpeg` | `winget install Gyan.FFmpeg` |

Fedora dùng `dnf`, Arch dùng `pacman`. Trên Windows, mở terminal mới sau khi cài để PATH cập nhật. `agy` (Antigravity CLI đã đăng nhập Google) là tuỳ chọn, chỉ dùng cho bước Gemini chấm video; thiếu nó, QA chuyển sang soát ảnh tĩnh.

## 4. Cài cho từng agent

Installer làm cùng một việc cho mọi agent: chép opus-video vào thư mục skill, cài viet-pro v5.3.0 cho cùng các agent đó, chạy `npx hyperframes skills` để cài CLI cùng toàn bộ skill HyperFrames, tạo file key mẫu, rồi chạy `setup-check`. Bản cũ được chuyển vào `~/.opus-video-backups/<thời điểm>/`; thư mục là git checkout thì installer để nguyên.

### Claude Code

```bash
curl -fsSL https://raw.githubusercontent.com/abm-dungtq/opus-video/main/install.sh | bash -s -- --claude
```

Skill nằm ở `~/.claude/skills/opus-video`. Mở phiên Claude Code mới rồi gọi `/opus-video <yêu cầu>`. Claude Code cũng tự chọn skill khi bạn nói muốn làm video.

### OpenAI Codex

```bash
curl -fsSL https://raw.githubusercontent.com/abm-dungtq/opus-video/main/install.sh | bash -s -- --codex
```

Skill nằm ở `~/.agents/skills/opus-video`. Mở phiên Codex mới rồi gọi `$opus-video <yêu cầu>`. Codex cần được phép chạy lệnh và truy cập mạng: chế độ sandbox chặn mạng sẽ làm `npx hyperframes` và ElevenLabs thất bại, khi đó cấp quyền mạng cho phiên làm video.

### Google Antigravity (app/IDE và CLI)

```bash
curl -fsSL https://raw.githubusercontent.com/abm-dungtq/opus-video/main/install.sh | bash -s -- --agy
curl -fsSL https://raw.githubusercontent.com/abm-dungtq/opus-video/main/install.sh | bash -s -- --agy-cli
```

App/IDE đọc `~/.gemini/config/skills/opus-video`, CLI đọc `~/.gemini/antigravity-cli/skills/opus-video`. Dùng cả hai thì ghép cờ: `--agy --agy-cli`. Gọi `/opus-video <yêu cầu>` hoặc nói "dùng skill opus-video để …".

### Nhiều agent cùng lúc

Không truyền cờ nào, installer cài cho mọi agent có thư mục cấu hình trên máy (`~/.claude`, `~/.agents` hoặc `~/.codex`, `~/.gemini`). Không thấy agent nào thì mặc định là Claude Code. Có thể ghép cờ tuỳ ý, ví dụ `--claude --codex --agy`.

### Cài theo dự án cho cả nhóm

```bash
cd <thư mục dự án>
curl -fsSL https://raw.githubusercontent.com/abm-dungtq/opus-video/main/install.sh | bash -s -- --workspace
```

Skill được chép vào `./.claude/skills/` và `./.agents/skills/` của dự án, nên Claude Code và Codex của mọi người mở dự án đều thấy. Có thể commit hai thư mục này để cả nhóm dùng chung một phiên bản. Mỗi người vẫn phải tự có file key riêng.

### Agent khác

Agent nào đọc được file và chạy được shell đều dùng được opus-video, kể cả agent không có khái niệm "skill". Cài vào một thư mục bất kỳ (ví dụ cài cho Claude Code như trên, hoặc `git clone`), rồi bảo agent:

```
Đọc <đường dẫn>/opus-video/skills/opus-video/SKILL.md và làm đúng quy trình trong đó để làm video 30 giây giới thiệu <sản phẩm>.
```

Nếu agent hỗ trợ file hướng dẫn cố định cho dự án (như `AGENTS.md`), thêm một dòng trỏ tới `SKILL.md` để agent tự đọc mỗi khi được yêu cầu làm video.

### Windows

PowerShell, cài cho mọi agent tìm thấy:

```powershell
irm https://raw.githubusercontent.com/abm-dungtq/opus-video/main/install.ps1 | iex
```

Chọn agent:

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/abm-dungtq/opus-video/main/install.ps1))) -Hosts claude,codex
```

`-Hosts` nhận `claude`, `codex`, `agy`, `agy-cli`. Thư mục tương ứng: `%USERPROFILE%\.claude\skills`, `%USERPROFILE%\.agents\skills`, `%USERPROFILE%\.gemini\config\skills`, `%USERPROFILE%\.gemini\antigravity-cli\skills`. viet-pro được cài bằng `git clone` thẻ `v5.3.0` vì chưa có installer PowerShell. Bản PowerShell chưa được chạy thử trên máy Windows thật; nếu gặp lỗi, dùng cách cài thủ công ở mục 5.

Dùng WSL thì chạy lệnh bash bên trong WSL; agent cũng phải chạy trong WSL. Skill cài ở phía Windows không nhìn thấy được từ WSL. Chiều ngược lại cũng vậy.

## 5. Cài thủ công

Dùng khi không chạy được installer, ví dụ máy không có `curl` hoặc mạng chặn `raw.githubusercontent.com`. Thay `<SKILLS>` bằng thư mục skill của agent ở mục 2.

```bash
git clone https://github.com/abm-dungtq/opus-video <SKILLS>/opus-video
```

Cài viet-pro trên macOS, Linux hoặc WSL:

```bash
curl -fsSL https://raw.githubusercontent.com/abm-dungtq/viet-pro-codex/v5.3.0/install.sh | bash -s -- --claude
```

Trên Windows, hoặc khi muốn tự chép:

```bash
git clone --depth 1 --branch v5.3.0 https://github.com/abm-dungtq/viet-pro-codex.git
```

rồi chép thư mục `skills/viet-pro` vào `<SKILLS>/viet-pro`.

Cài HyperFrames CLI và toàn bộ skill của nó cho mọi agent được hỗ trợ:

```bash
npx --yes hyperframes skills
```

Lệnh trên lỗi thì dùng:

```bash
npx --yes skills add heygen-com/hyperframes --all
```

Remotion là tuỳ chọn, chỉ cần khi brief chọn `engine: remotion`:

```bash
npx --yes skills add remotion-dev/skills
```

## 6. File key

Key nằm ở `~/.config/opus-video/.env` (Windows: `%USERPROFILE%\.config\opus-video\.env`). Installer tạo sẵn file với các dòng trống:

```
ELEVENLABS_API_KEY=
OPUS_VIDEO_VOICE_ID=
TYPESAFE_API_KEY=
```

Tự mở file bằng trình soạn thảo và điền. `ELEVENLABS_API_KEY` và `OPUS_VIDEO_VOICE_ID` là bắt buộc; `TYPESAFE_API_KEY` bật bước Jev xếp hạng case và rà kịch bản. Trên macOS và Linux, giữ quyền `chmod 600`.

Ba quy tắc an toàn áp dụng cho mọi agent. Không dán key vào khung chat. Không để agent `cat`, `echo` hay `source` file này. Không commit file này vào git. Các script tự đọc file và chỉ báo key có hay không, không in giá trị.

## 7. Kiểm tra sau khi cài

Chạy `setup-check` từ thư mục skill của agent vừa cài:

```bash
node ~/.claude/skills/opus-video/scripts/setup-check.mjs
```

Kết quả phải là `READY` (exit 0). Mỗi dòng `MISSING` đi kèm dòng `fix:` là lệnh sửa đúng hệ điều hành; sửa xong chạy lại. Dòng `WARN` (agy, `TYPESAFE_API_KEY`, Remotion) không chặn. Cờ `--json` in kết quả dạng máy đọc, kèm danh sách thư mục skill đã quét.

`setup-check` kiểm các mục sau:

- Node ≥ 22, git, ffmpeg, ffprobe
- CLI `hyperframes` ≥ 0.8.144
- viet-pro, kèm hai self-test của nó
- 10 skill lõi: `hyperframes`, `hyperframes-core`, `hyperframes-animation`, `hyperframes-keyframes`, `hyperframes-creative`, `hyperframes-audio`, `hyperframes-cli`, `hyperframes-registry`, `hyperframes-studio`, `media-use`
- 10 workflow: `general-video`, `faceless-explainer`, `product-launch-video`, `pr-to-video`, `motion-graphics`, `music-to-video`, `slideshow`, `embedded-captions`, `talking-head-recut`, `remotion-to-hyperframes`
- `ELEVENLABS_API_KEY` và `OPUS_VIDEO_VOICE_ID` (chỉ kiểm có hay không)

Sau đó kiểm kết nối ElevenLabs:

```bash
node ~/.claude/skills/opus-video/scripts/eleven.mjs doctor
```

Lệnh đạt khi exit 0 và in `tier`, `tts model`, `voice`. Cuối cùng, mở phiên agent mới để agent nạp skill vừa cài. `SKILL.md` yêu cầu agent tự chạy `setup-check` ở bước 0, nên máy thiếu gì agent sẽ dừng và báo trước khi làm video.

Muốn chắc chắn bộ script chạy đúng trên máy mới, chạy test:

```bash
node --test ~/.claude/skills/opus-video/scripts/tests/
```

## 8. Các cổng agent phải qua

Cài xong, agent làm video theo chín bước trong `SKILL.md`. Có năm chốt chặn bằng script, agent không tự bỏ qua được:

| Chốt | Lệnh | Khi chặn |
|---|---|---|
| Cài đặt | `setup-check.mjs` | exit 1, chưa làm bước 1 |
| Kịch bản viet-pro | `check-viet-pro.mjs --project .` | exit 1; `eleven.mjs` từ chối tạo giọng với exit 4 |
| Plan | `check-preflight.mjs --stage plan` | exit 1, chưa tạo giọng và dựng |
| Demo đã duyệt | `check-preflight.mjs --stage final` | exit 1; `render-final.mjs` exit 5 |
| Giao | `check-viet-pro.mjs --stage delivery` | exit 1, chưa gửi link video |

Bước demo cần người dùng xem khung hình và đồng ý. Agent chạy không giám sát (CI, tác vụ nền) chỉ được tự duyệt khi người dùng đã nói rõ là chạy không dừng. Khi đó agent phải ghi lý do vào `DEMO.md`.

## 9. Cập nhật và gỡ

Cập nhật bằng cách chạy lại lệnh cài; bản cũ được chuyển vào `~/.opus-video-backups/`. Cài bằng git thì `git -C <SKILLS>/opus-video pull`. Skill HyperFrames cập nhật bằng `npx hyperframes skills`.

Gỡ bằng cách xoá thư mục `opus-video` trong thư mục skill của từng agent. Xoá thêm `~/.config/opus-video/` nếu không còn cần key. viet-pro và HyperFrames là skill độc lập, gỡ theo hướng dẫn của chúng.

## 10. Gỡ lỗi

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Agent không nhận lệnh `/opus-video` hay `$opus-video` | Phiên agent mở trước khi cài | Mở phiên mới; kiểm skill nằm đúng thư mục ở mục 2 |
| `skill … not installed` | Skill HyperFrames chưa cài cho agent này | `npx hyperframes skills`, rồi mở phiên mới |
| `skill viet-pro … self-test failed` | Bản viet-pro hỏng hoặc sai phiên bản | Cài lại viet-pro v5.3.0 (mục 5) |
| `hyperframes CLI: npx hyperframes did not run` | Mạng chặn npm, hoặc sandbox của agent chặn mạng | Cấp quyền mạng cho agent, chạy lại |
| `ELEVENLABS_API_KEY: absent` | File key chưa điền hoặc sai đường dẫn | Điền file ở mục 6 |
| `eleven.mjs` exit 4 | Kịch bản chưa qua cổng viet-pro | `check-viet-pro.mjs --project .`, sửa các dòng FAIL |
| `render-final.mjs` exit 5 | Thiếu `PLAN.md`, khung hình demo hoặc lời duyệt | `check-preflight.mjs --project . --stage final` |
| Windows: không tìm thấy `ffmpeg` sau khi cài | PATH chưa cập nhật | Mở terminal mới |
| WSL không thấy skill đã cài | Skill cài phía Windows | Cài lại bên trong WSL |
