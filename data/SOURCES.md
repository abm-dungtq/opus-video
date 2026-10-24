# Nguồn dữ liệu

| Nguồn | Commit | License | Dùng cho |
|---|---|---|---|
| https://github.com/yihui-dev/awesome-opus5-5-videos | 92aee2f | MIT | 703 hiện có + 105 upstream_removed (`id` bắt đầu bằng `y:`) |
| https://github.com/chuspeeism/awesome-opus-5-5-videos | 028bc52 | MIT | 300 case (`id` bắt đầu bằng `c:`) |
| https://github.com/abm-dungtq/viet-pro-codex | 2902c19 (v5.6.1) | MIT (Humanizer: xem THIRD_PARTY_NOTICES) | quy trình kịch bản (`references/script-workflow.md`) |

Ngày lấy: 2026-10-16. Case `upstream_removed: true` là case có ở bản 7562902 nhưng upstream đã gỡ (không làm từ một prompt Opus 5.5 đơn thuần); giữ lại với dữ liệu cũ, `find-cases` và `rerank-cases` ẩn chúng trừ khi thêm `--include-removed`. Prompt thuộc về tác giả gốc (`author`, `url` trong từng dòng). Video gốc chỉ đặt link, không phân phối lại.

Rebuild `cases.jsonl`: clone hai repo vào một thư mục trống, checkout đúng commit, không chạy gì bên trong bản clone. Chạy thử ra file tạm, đọc dòng `ADDED · KEPT · REMOVED · TOTAL`, đúng thì mới chép đè:

```bash
rm -rf /tmp/ov-corpus && mkdir /tmp/ov-corpus && cd /tmp/ov-corpus
git clone -q https://github.com/yihui-dev/awesome-opus5-5-videos y && git -C y checkout -q 92aee2f
git clone -q https://github.com/chuspeeism/awesome-opus-5-5-videos c && git -C c checkout -q 028bc52
cp ~/.claude/skills/opus-video/data/cases.jsonl previous.jsonl
node ~/.claude/skills/opus-video/scripts/build-case-index.mjs y/data/videos.json c/data/cases.json out.jsonl \
  --yihui-commit 92aee2f --chus-commit 028bc52 --previous previous.jsonl
cp out.jsonl ~/.claude/skills/opus-video/data/cases.jsonl
```

Sau khi rebuild `cases.jsonl`, cập nhật cache nhãn cho bước tra case bằng Jev (cần `TYPESAFE_API_KEY`; resumable, chỉ gắn nhãn dòng mới hoặc đã đổi):

```bash
node ~/.claude/skills/opus-video/scripts/case-features.mjs --stats
```
