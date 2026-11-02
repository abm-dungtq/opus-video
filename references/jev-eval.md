# Đo chất lượng Jev (`jev-eval.mjs`)

Một lệnh đo model `jev-latest` ở mọi chỗ opus-video gọi Jev, cộng gợi ý hướng của Motion Studio, rồi so với mốc đã lưu. Lệnh chỉ báo cáo. Nó không tự ghim model, không tự chuyển sang phương án không-Jev; tụt thì người dùng quyết.

```bash
node $OV/scripts/jev-eval.mjs --estimate     # chỉ in chi phí ước tính, không gọi Jev
node $OV/scripts/jev-eval.mjs                # đo và so với mốc
node $OV/scripts/jev-eval.mjs --baseline     # đo và ghi lượt này làm mốc mới
```

Cần `TYPESAFE_API_KEY` (biến môi trường, hoặc `~/.config/opus-video/.env`). Một lượt đủ năm bộ đo tốn khoảng 0,10 USD và chạy trong khoảng 30 giây. Lệnh in chi phí ước tính trước khi gọi Jev và dừng nếu tổng vượt `--max-usd` (mặc định 0,5).

## Năm bộ đo

| Bộ đo | Chỗ gọi Jev | Bộ vàng | Chỉ số | Cột không-Jev |
|---|---|---|---|---|
| `audit` | `jev-audit.mjs` | `data/jev-audit-eval.jsonl`, 24 câu | F1 gộp theo cặp (câu, mẫu) | không có |
| `rerank-single` | `rerank-cases.mjs --mode single` | `data/jev-eval/rerank-gold.jsonl`, 16 brief | hit@5: tỉ lệ brief có ít nhất một case đúng trong 5 case đầu | thứ tự `find-cases` |
| `rerank-composite` | `rerank-cases.mjs --mode composite` | cùng bộ trên, cùng pool 40 case | hit@5 | thứ tự `find-cases` |
| `lemo` | `lemo-pick.mjs rank` | `data/jev-eval/lemo-gold.jsonl`, 20 brief | recall@3: số phong cách đúng trong 3 gợi ý đầu chia min(3, số phong cách đúng) | thứ tự từ khoá |
| `suggest` | `lib/suggest.mjs` của Motion Studio, qua `scripts/suggest-eval.mjs` | tập gold của Studio | hit@3 (0–1) | phía tất định |

- Bộ vàng rerank ghi id bài X (`relevant_posts`), vì một video có thể nằm trong corpus dưới nhiều id case. Mỗi brief kèm `category` và `keywords` để dựng đúng pool 40 case như `ov-cases`; mọi brief đều có ít nhất một case đúng trong pool.
- `lemo` dùng recall@3 vì hit@3 đã bão hoà: cả Jev lẫn thứ tự từ khoá đều trúng mọi brief.
- `suggest` tìm Studio ở `--studio`, rồi `$MOTION_STUDIO_HOME`, rồi `/Volumes/2/Motion-Studio`. Không thấy thì dòng đó ghi "bỏ qua".
- `lemo` cần thư viện lemo-opuscar trong cache (`node $OV/scripts/lemo.mjs fetch`), hoặc `--library <dir>`.

## Đọc bảng

```
bộ đo | chỉ số | mốc | nay | không-Jev | trạng thái
rerank-composite | hit@5 n=16 | 0.88 | 0.88 | 0.56 | ổn
```

Trạng thái: `ổn` (lệch không quá ngưỡng), `tụt` (mốc − nay vượt ngưỡng), `tăng`, `chưa có mốc`, `lỗi` (Jev hỏng giữa chừng, thiếu thư viện…), `bỏ qua`.

Ngưỡng mặc định tính riêng cho từng bộ đo: max(0,03; 1/n), với n là số mục của bộ vàng. Với n mục, một mục đổi kết quả đã làm chỉ số lệch 1/n, nên ngưỡng này cho phép đúng một mục đổi mà không báo tụt; hai mục cùng trượt thì báo tụt. Hiện tại: rerank 16 brief → 0,0625; lemo 20 brief → 0,05; suggest 21 mục → 0,048; audit 24 câu → 0,042. Ngưỡng cộng thêm 0,001 vì suggest-eval làm tròn điểm tới 0,1 %. `--threshold <số>` đặt một ngưỡng chung cho mọi bộ đo. Báo cáo JSON ghi ngưỡng đã dùng ở `thresholds`.

Mỗi lượt ghi một báo cáo JSON vào `data/jev-eval/reports/jev-eval-<YYYYMMDD-HHMMSS>.json` (không commit), gồm top từng brief để xem brief nào trượt. `--baseline` ghi `data/jev-eval/baseline.json` và chỉ ghi khi không bộ đo nào lỗi. Dùng `--only` để đo một phần; mốc của các bộ không đo được giữ nguyên.

Mã thoát: 0 không tụt · 1 có bộ đo tụt · 2 sai đối số hoặc ước tính vượt trần · 3 không có key · 4 có bộ đo lỗi.

**Nhiễu.** Jev không cho kết quả y hệt giữa hai lượt: hai lượt liên tiếp cho rerank-single 0,69 rồi 0,75, tức một brief đổi kết quả. Ngưỡng mặc định đã chừa đúng một mục như vậy. Khi một bộ đo báo tụt, chạy lại bộ đó (`--only rerank-single`) và xem `items` trong báo cáo trước khi kết luận model tụt.

## Cổng test offline bằng `ak`

`.agentkit/test-impact.json` khai báo hai nhóm test cho `ak test optimize`:

- `jev-offline`: test của `jev-audit`, `jev-client`, `jev-eval`, `rerank-cases`, `rerank-composite` và `lemo-pick`, với Jev giả lập, không gọi mạng. Nhóm này được chọn khi đổi `scripts/jev-*.mjs`, `scripts/rerank-*.mjs`, `scripts/lemo-pick*.mjs`, test của chúng, `data/jev-eval/**` hoặc `data/jev-audit-eval.jsonl`.
- `all`: toàn bộ `scripts/tests/*.test.mjs`. Nhóm này chạy khi đổi `scripts/jev-client.mjs` (nhiều script khác dùng nó), đổi chính manifest, hoặc đổi bất kỳ đường dẫn nào chưa có nhóm sở hữu.

Manifest khai báo `coverage_complete: true`; thiếu khai báo này thì `ak` luôn chạy cả bộ. Khai báo này không làm mất phần an toàn: đường dẫn chưa có nhóm sở hữu vẫn kéo cả bộ test. Khi thêm một script mới dùng `jev-client.mjs`, giữ nó ngoài `jev-offline` hoặc thêm test của nó vào nhóm đó.

```bash
ak test optimize --base origin/main          # xem nhóm nào được chọn và vì sao
ak test optimize --base origin/main --run    # chạy các nhóm đó
```

Cổng này chỉ chạy test offline. Chất lượng model thật chỉ đo bằng `jev-eval.mjs`.
