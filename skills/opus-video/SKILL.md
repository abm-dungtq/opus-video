---
name: opus-video
description: "Điểm vào của plugin opus-video: làm video với Claude Opus 5.5 từ brief, chủ đề hoặc kịch bản tiếng Việt (viết kịch bản qua viet-pro, giọng/SFX/nhạc ElevenLabs, dựng HyperFrames, render 16:9 và 9:16). Dùng đầu tiên khi người dùng muốn làm video, explainer, quảng cáo, motion graphics, music video, TikTok/Reels/YouTube hoặc sửa một video đã có: skill này chọn một trong bốn hướng vận hành (dao-dien, nhanh, tu-nhac, timeline) rồi gọi các skill ov-* theo thứ tự. Không dùng để làm một bước riêng lẻ: bước cụ thể nằm ở ov-setup, ov-brief, ov-direction, ov-cases, ov-script, ov-audio, ov-build, ov-footage, ov-deliver, ov-studio."
---

# opus-video

Skill điều phối: biến một ý tưởng thành MP4 hoàn chỉnh. Skill này **không** tự render. Nó nối các skill có sẵn (`viet-pro`, `hyperframes` và các workflow con, `media-use`, `ak-remotion`) với script ElevenLabs của riêng nó, và áp dụng các mẫu chắt lọc từ 813 video làm bằng Opus 5.5. Mỗi bước nằm trong một skill `ov-*` riêng; skill này chọn hướng vận hành và giữ các luật chung.

## Đường dẫn

`$OV` là thư mục gốc plugin opus-video, nơi có `scripts/` và `references/`: Claude Code `${CLAUDE_PLUGIN_ROOT}` (cài tại chỗ: `~/.claude/skills/opus-video`), Codex `~/.agents/skills/opus-video`, Antigravity `~/.gemini/config/skills/opus-video` (CLI: `~/.gemini/antigravity-cli/skills/opus-video`), hoặc `.claude/skills/opus-video` / `.agents/skills/opus-video` trong workspace. Đó luôn là thư mục chứa `skills/` và `scripts/` của plugin. Các skill phụ thuộc (`viet-pro`, `hyperframes*`, `media-use`…) được script tự tìm trong mọi thư mục đó. Lệnh chạy được trên macOS, Linux và Windows (PowerShell: thay `$OV` bằng đường dẫn đầy đủ).

## Bốn hướng vận hành

| Hướng | Người dùng nói | Chuỗi skill |
|---|---|---|
| `dao-dien` đạo diễn đầy đủ (mặc định) | "làm video", "explainer", "quảng cáo" | ov-setup → ov-brief → **gợi ý case** (`ov-cases`) → ov-direction → ov-script → ov-audio → ov-build → ov-deliver |
| `nhanh` theo mẫu | "làm nhanh", "theo mẫu", "giống video này" | ov-setup → ov-brief → **gợi ý case** → ov-cases (chọn một case) → ov-script → ov-audio → ov-build (vẫn giữ cổng animatic) → ov-deliver |
| `tu-nhac` từ nhạc hoặc footage | "từ bài nhạc", "theo beat", "clip quay sẵn" | ov-setup → ov-brief → **gợi ý case** → ov-audio (đo beat-grid trước) hoặc ov-footage → ov-direction → ov-script → ov-build (trước `make-demo --animatic`: `beat-fit.mjs --project . --tight`, xem bảng rồi `--apply`) → ov-deliver |
| `timeline` sửa dự án đã có | "sửa video", "mở studio", "đổi shot" | ov-studio (nhập dự án nếu chưa có `project.json`) → lệnh gateway → ov-audio (chỉ câu thoại đã đổi) → ov-deliver |

- Khi không rõ, hỏi đúng một câu: người dùng muốn hướng nào trong bốn hướng trên.
- Người dùng muốn làm trên giao diện web ("làm trong studio", "không dùng terminal"): mở Motion Studio (`ov-studio`). Ở đó họ bấm Dự án mới, nạp footage, giao việc cho đạo diễn AI; đạo diễn vẫn đi theo một trong bốn hướng trên và hỏi chọn hướng, duyệt animatic bằng thẻ `studio_ask`.
- Ở mọi hướng, chữ tiếng Việt (lời đọc, chữ trên hình, caption) vẫn qua `ov-script`, và `render-final.mjs` vẫn giữ mọi cổng của nó.
- Hướng `nhanh` chỉ tiết kiệm phần chọn hướng (một case thay cho 3 styleframe) và phải ghi `creative_override: nhanh theo case <id>` vào `BRIEF.md` (xem `ov-cases`).
- **Gợi ý case** (mọi hướng làm video mới, ngay sau brief, trước khi chọn hướng): viết `BRIEF.case-query.json` rồi chạy `rerank-cases.mjs --suggest --project .` (chi tiết ở `ov-cases`). Jev phân tích brief, chọn 2–3 case trong thư viện mẫu Opus 5.5; script in sẵn một khối tiếng Việt (link, một dòng, vì sao) và ghi `CASES.md`. **Gửi nguyên khối đó cho người dùng**, kể cả dòng `⚠ Jev không chạy` nếu có, rồi mới sang bước sau. Bước storyboard (`ov-build`) dùng lại `CASES.md`, không tra lại. Đây là cổng: brief `brief_version: 3` chưa gợi ý case thì `make-pitch init` (exit 6) và `check-preflight` dừng. Người dùng chọn một case thì chạy `case-template.mjs` (hướng `nhanh` không cờ, hướng khác `--reference`), viết lý do và prompt chuyển thể, rồi gửi khối `--show` (prompt, lý do, video demo); chi tiết ở `ov-cases`.

## Vai trò và chế độ tiết kiệm

- Hướng `dao-dien` và `tu-nhac` mặc định chia vai:
  - `ov-director` (Opus, chỉ đọc) viết hướng dựng theo từng cảnh sau khi lời đã qua viet-pro, và duyệt gu trên contact sheet của animatic (`Review <n>: revise | ship`);
  - `ov-executor` (Sonnet) chạy âm thanh, dựng và animatic theo `build/DIRECTION.md`;
  - phiên chính ghi `build/DIRECTION.md`, `build/REVIEW-<n>.md` và kiểm kết quả.
- `--poor` hoặc "tiết kiệm": một phiên làm hết, không subagent, hướng ngắn mỗi cảnh một dòng, một vòng duyệt. Không bỏ cổng nào.
- Chi tiết: `$OV/references/dao-dien-va-thi-cong.md`. Đạo diễn của Motion Studio là đường riêng, không đổi.

## Bốn cổng

**Bốn cổng không được bỏ:** **hướng đạo diễn người dùng chọn bằng mắt** (bước 1b, `ov-direction`) → kịch bản viet-pro (bước 2, `ov-script`) → **PLAN.md** (bước 4b, `ov-build`) → **clip nháp (animatic) đã duyệt** (bước 6b, `ov-build`). Bản giao cuối chỉ được render bằng `render-final.mjs`, script này chặn (exit 5) khi thiếu plan, thiếu demo, demo chưa được duyệt, hoặc (dự án có `direction:`) thiếu animatic, animatic đứng yên kiểu slideshow, thiếu `build/RECIPES.md`. Dự án cũ (BRIEF không có `direction:` và `brief_version: 2`) chỉ nhận một dòng WARN và đi theo cổng cũ.

**Vì sao có bước 1b:** người dùng không chuyên không tự nghĩ ra được từ vựng motion design, còn agent khi phải tự điền phong cách sẽ chọn kiểu an toàn nhất (nền tối + thẻ chữ trượt lên/mờ dần, mỗi câu một thẻ). Vì vậy phong cách do người dùng **chọn bằng mắt** trên 3 styleframe dựng bằng chính nội dung của họ, kịch bản viết **sau** khi đã có hướng (hình dẫn, lời theo), và các cổng máy chặn kiểu slideshow ở PLAN, ở code dựng và ở video render.

**Nội dung của người dùng là nội dung thật:** không gắn lên hình các nhãn rào đón như "minh họa", "không đúng tỉ lệ", "theo người đăng", "theo lời người nói", "video độc lập", "~" trước số. Số liệu vẫn chỉ lấy từ clip hoặc brief, nguồn ghi trong file dữ liệu. `video-lint` báo `HEDGE_LABEL`.

## Quy trình 9 bước và skill sở hữu

| Bước | Skill |
|---|---|
| 0 kiểm tra cài đặt, thiết lập key | `ov-setup` |
| 1 brief tối thiểu | `ov-brief` |
| 1b gợi ý phong cách lemo-opuscar (Jev), pitch 3 styleframe, chọn hướng và style | `ov-direction` |
| 2 kịch bản qua cổng viet-pro | `ov-script` |
| 3 storyboard (tra case ở `ov-cases`), 4 engine, 4b PLAN.md, 6 dựng, 6b animatic, 7 render nháp | `ov-build` |
| 5 giọng, SFX, nhạc, TIMING, mix | `ov-audio` |
| 7 render bản giao, 8 QA, 9 caption, giao và xuất | `ov-deliver` |
| Nhánh footage thật, clip làm trục | `ov-footage` |
| `project.json`, gateway, Motion Studio | `ov-studio` |

Thứ tự trong hướng đạo diễn: 0 → 1 → 1b → 2 → 3 → 4 → 4b → 5 → 6 → 6b → 7 → 8 → 9.

## Thư mục dự án

Mỗi dự án có một thư mục riêng:

```
<project>/
  BRIEF.md  STORYBOARD.md  script-table.md  PLAN.md  DEMO.md  QA.md  CAPTIONS.md
  script/01.txt …          # lời đọc theo cảnh
  demo/  demo/9x16/        # khung hình demo (make-demo.mjs)
  assets/voice/ assets/sfx/ assets/bgm/ assets/CREDITS.md
  renders/
  project.json  .opus/     # khi dự án đã có manifest (ov-studio)
```

## Ranh giới

- Không sửa file trong các skill `hyperframes*`, `media-use`, `viet-pro`. Các skill đó được cập nhật từ upstream.
- Không tự đăng video lên mạng xã hội hay publish. Chỉ làm khi người dùng yêu cầu rõ.
- Tôn trọng bản quyền: chỉ dùng tài sản người dùng cấp, audio sinh từ ElevenLabs, hoặc catalog có license. Ghi nguồn vào `assets/CREDITS.md`.
- `judge.mjs` gửi video 540p lên Gemini qua agy (đã được đồng ý 2026-10-08).
- `scripts/cut.mjs` phỏng theo ý tưởng của open-edit (Apache-2.0); giữ `NOTICE` và `third_party/open-edit/LICENSE` khi phân phối.
- `data/styles/`, skeleton composition và thuật toán beat-grid, reframe, resolve style phỏng theo motion-video của AgentKit (MIT); giữ `NOTICE` và `third_party/agentkit-motion-video/LICENSE`.
- Phong cách lemo-opuscar (`lemo.mjs`, `lemo-pick.mjs`, `references/lemo-canvas.md`) là của LemoLab: mã MIT, phim mẫu CC BY 4.0. Giữ `NOTICE` và `third_party/lemo-opuscar/LICENSE`; mỗi dự án dùng phong cách đó có một dòng ghi công trong `assets/CREDITS.md` (`lemo-pick.mjs choose` tự thêm). Chỉ học ngữ pháp hình, không chép câu chuyện, cảnh hay chữ ký của phim mẫu.
- Prompt trong corpus (`data/`) thuộc về tác giả gốc. Chỉ dùng để học cấu trúc, và luôn kèm link khi trích.
