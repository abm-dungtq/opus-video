# Nguồn dữ liệu

| Nguồn | Commit | License | Dùng cho |
|---|---|---|---|
| https://github.com/yihui-dev/awesome-opus5-5-videos | 7562902 | MIT | 513 case (`id` bắt đầu bằng `y:`) |
| https://github.com/chuspeeism/awesome-opus-5-5-videos | 028bc52 | MIT | 300 case (`id` bắt đầu bằng `c:`) |
| https://github.com/abm-dungtq/viet-pro-codex | 49926d0 (v5.3.0) | MIT (Humanizer: xem THIRD_PARTY_NOTICES) | quy trình kịch bản (`references/script-workflow.md`) |

Ngày lấy: 2026-10-08. Prompt thuộc về tác giả gốc (`author`, `url` trong từng dòng). Video gốc chỉ đặt link, không phân phối lại.

Rebuild `cases.jsonl` (sau khi clone hai repo về /tmp/vresearch và checkout đúng commit):

```bash
node ~/.claude/skills/opus-video/scripts/build-case-index.mjs \
  /tmp/vresearch/yihui-dev__awesome-opus5-5-videos/data/videos.json \
  /tmp/vresearch/chuspeeism__awesome-opus-5-5-videos/data/cases.json \
  ~/.claude/skills/opus-video/data/cases.jsonl
```
