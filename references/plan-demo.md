# PLAN.md và khung hình demo (bắt buộc trước video cuối)

Không render bản giao cuối khi chưa có **plan** đã viết và **khung hình demo** đã được duyệt. Hai cổng:

| Cổng | Lệnh | Khi nào |
|---|---|---|
| Plan | `node $OV/scripts/check-preflight.mjs --project . --stage plan` | Bước 4b, sau Engine, **trước** khi tạo voice (bước 5) và dựng (bước 6) |
| Demo + duyệt | `node $OV/scripts/check-preflight.mjs --project . --stage final` | Bước 6b, trước bản giao. `render-final.mjs` tự chạy cổng này, chặn thì exit **5** |

`$OV` là thư mục chứa `SKILL.md` của opus-video trên agent đang chạy (Claude Code `~/.claude/skills/opus-video`, Codex `~/.agents/skills/opus-video`, Antigravity `~/.gemini/config/skills/opus-video`…).

## 1. Mẫu PLAN.md

Viết sau `STORYBOARD.md` và lựa chọn engine. Mỗi mục `##` phải có nội dung thật (`…`, `TODO`, `TBD`, `<…>`, `pending` bị coi là trống). Tiêu đề khớp cả khi không dấu (`## Canh` = `## Cảnh`).

```markdown
# PLAN: <tên video>

## Mục tiêu
Người xem là ai, xem xong làm gì. Thời lượng, khổ hình (16:9 / 9:16 / both), kênh đăng.

## Ý đồ sáng tạo
- Hướng: A2 — Gõ lệnh, máy bung kết quả tức thì (người dùng chọn phương án 1)
- Style: Data Drift (hoặc preset), tông màu
- Hình chủ đạo: một khung lệnh duy nhất (prompt-type-submit-generate)
- Hiệu ứng: discrete-text-sequence, agent-progress-theater
- Chuyển cảnh: zoom-through, card-morph-anchor
- SFX: crisp mechanical keycap click, clean glass UI confirmation pop
- Luật chống slideshow: mọi beat mọc ra từ khung lệnh; camera đẩy vào kết quả thay vì đổi thẻ
- Style nền: Sản phẩm tối chính xác (`precision-dark-product`)
- Mọi chiều lấy từ style nền ở mọi cảnh.
- Ràng buộc còn hiệu lực (cùng lớp bất biến trong references/style-system.md):
  - [precision-dark-product · mọi cảnh] …

## Cảnh
| # | Thời điểm | Loại | Lời đọc | Hình / hiệu ứng | Blueprint/Rule | Nối sang beat sau | Âm thanh |
|---|---|---|---|---|---|---|---|
| 1 | 0–2s | hook | — | Khung lệnh gõ yêu cầu (styleframe đã duyệt) | prompt-type-submit-generate | card-morph-anchor | keycap click |
| 2 | 2–9s | ui-demo | "…" | Khung giãn thành bảng tiến trình | agent-progress-theater | zoom-through vào bước cuối | soft pop |
| 3 | 9–15s | outro | "…" | Logo khoá giữa khung | cta-morph-press | — | glass pop |

## Nhịp
- Hook: 0.3s
- Cao trào: cảnh 3
- Giữ cuối: 1.0s

## Âm thanh
Giọng (voice id/model), nhạc nền (prompt, âm lượng), SFX theo beat, ngôn ngữ.

## Sự kiện
| Thời điểm | Sự kiện | Âm thanh |
|---|---|---|
| 2.0s | Nút gửi lún xuống | assets/sfx/send.mp3 |
| 5.8 | chữ: "kiểm thử" | — |
| 6.5s | Kết quả bung ra | assets/sfx/pop.mp3 |
| 13.5s | Nhạc lắng, logo đứng yên | — |

## Engine
HyperFrames <workflow> (hoặc Remotion/Canvas) và lý do; composition nào cho khổ nào; dựng từ build/RECIPES.md.

## Khung hình demo
- 1 — khung lệnh đang gõ, chữ không tràn, đủ dấu
- 4 — bảng tiến trình
- 14 — logo nằm ngoài vùng UI
(ít nhất một mốc mỗi cảnh; mốc tính bằng giây trên timeline bản 16:9 / bản chính)

## Khung hình demo 9:16
- 3 — logo nằm trong vùng an toàn
(chỉ bắt buộc khi BRIEF.md `aspect: both`)

## QA
Lệnh sẽ chạy ở bước 8 (lint, check, video-lint, qc-mp4 MOTION, judge) và tiêu chí đạt.
```

Cột `Loại` là tuỳ chọn: một loại cảnh trong `references/style-system.md` (`cover`, `hook`, `ui-demo`, `diagram`, `outro`…) hoặc `—`. Lớp trong `## style_layers` của BRIEF chọn cảnh theo cột này hoặc theo id `s<#>`. Các dòng từ `- Style nền:` trở xuống trong `## Ý đồ sáng tạo` là khối in bởi `node $OV/scripts/styles.mjs resolve --markdown` (chạy trong thư mục dự án); dán nguyên khối, có lớp mượn thì khối có thêm bảng cảnh × chiều.

Mục `## Nhịp` là quy ước nhịp, preflight chỉ cảnh báo: **Hook** là giây có chuyển động hoặc chữ đầu tiên (nên ≤ 0,5 s, không mở bằng khung trống); **Cao trào** là số `#` của cảnh đắt nhất, nên bắt đầu trong khoảng 55–78 % thời lượng; **Giữ cuối** là số giây khung kết đứng lại với chuyển động nhỏ (nên 0,8–1,2 s). Ngưỡng lấy từ phim motion 10 giây, chưa hiệu chỉnh cho video 30–90 giây.

Cổng plan kiểm: đủ 6 mục, bảng Cảnh có ít nhất một dòng, số mốc demo ≥ số cảnh, và có mục 9:16 khi `aspect: both`. Chữ trên hình là chuỗi trong ngoặc kép ở cột Hình; cổng WARN khi beat ngắn hơn `số từ / 2,5 + 0,5 s` (tối thiểu 1 s). Chữ còn ở lại qua beat sau thì ghi `(giữ đến 15s)` hoặc `(giữ đến hết)` trong ô Hình, tính bằng giây trên timeline gốc. Sửa plan sau khi đã chụp demo thì phải chụp lại (frame cũ hơn `PLAN.md` bị chặn).

**Bảng `## Sự kiện`** ghi mỗi khoảnh khắc trên hình có gắn tiếng:

- `Thời điểm` là số giây trên timeline gốc (`6.5`, `6.5s` hoặc `6,5s`), không phải giây trong composition con.
- **Nhãn nguồn của mốc:** mốc lấy từ `audio_meta.json` hoặc đo trên file là mốc **đo được**; mốc chọn theo cảm nhận là mốc **đề xuất**. Khi cần phân biệt thì ghi `(đo)` hoặc `(đề xuất)` sau thời điểm, ví dụ `6.5s (đề xuất)`. Mốc đề xuất phải được kiểm bằng `hyperframes snapshot . --at <t>` trước khi đặt tiếng vào.
- Hàng `chữ: "<cụm>"` (cột Âm thanh `—`) là lúc chữ chốt hiện trên hình. `scripts/word-sync.mjs --project .` so thời điểm đó với lúc giọng đọc nói cụm từ trong `words.json`: lệch ≤ 150 ms là PASS, ≤ 250 ms là WARN, hơn nữa hoặc cụm không có trong lời là FAIL. Stage final chạy lệnh này cùng `sfx-sync`. Cụm mở bằng dấu ngoặc kép thì chỉ lấy phần trong ngoặc, nên `chữ: "kiểm thử" bay vào` đo cụm `kiểm thử`; không có ngoặc thì lấy hết phần sau dấu hai chấm.
- `Âm thanh` ghi đúng `src` trong `index.html`; `—` khi sự kiện không có tiếng. Video không có SFX gắn sự kiện thì thay bảng bằng một dòng `không có SFX gắn sự kiện` (chỉ in WARN).
- `scripts/sfx-sync.mjs --project .` đo đoạn im lặng đầu mỗi file SFX (ngưỡng = đỉnh của file − 20 dB, cache theo sha256 ở `assets/sfx-onsets.json`) rồi cộng vào `data-start` để ra lúc tiếng thật sự vang: `data-start + max(0, im lặng − data-media-start) / data-playback-rate`. Đổi cách đo đoạn im lặng thì xoá `assets/sfx-onsets.json` để đo lại.
- Lệch = lúc tiếng vang − thời điểm sự kiện; số dương là tiếng trễ hơn hình. Ngưỡng theo ITU-R BT.1359-1:

  | Mức | Tiếng sớm | Tiếng trễ |
  |---|---|---|
  | PASS | đến 45 ms | đến 125 ms |
  | WARN | đến 90 ms | đến 185 ms |
  | FAIL | hơn 90 ms | hơn 185 ms |

- `--fix` chỉ in `đề xuất: data-start="…"` cho từng dòng chưa PASS; không ghi vào HTML. `--write-qa` ghi các dòng vào `QA.md`.
- Chỉ đọc `index.html` (hoặc `--html`): SFX nằm trong composition con báo FAIL "không có trong".

**Cổng sáng tạo** (khi BRIEF có `direction:`; dự án chỉ cắt footage đặt `creative_override: <lý do ≥10 ký tự>`):

- Có `## Ý đồ sáng tạo` với các dòng `Hướng:`, `Chuyển cảnh:`, `Luật chống slideshow:`.
- Bảng `## Cảnh` có cột **Blueprint/Rule** và **Nối sang beat sau**. Mỗi hàng nêu ít nhất một blueprint/rule có thật trong `hyperframes-animation` (tên bịa bị chặn); toàn bảng có ít nhất 2 token khác nhau.
- Mọi hàng trừ hàng cuối nêu seam trong từ vựng ở `references/creative-directions.md`. `fade`, `crossfade`, `cut`, "hiện", "mờ dần"… bị chặn; seam mềm (`focus-pull`, `blur-crossfade`, `cross-warp-morph`…) chỉ dùng được với hướng có `allow_soft` (A7, A8).
- Các hàng có Lời đọc `—`, `(nhạc)` hoặc `không lời` cộng lại ≥ `music_only_s` của BRIEF (hình dẫn, lời theo).
- Có `## Sự kiện` (bảng `Thời điểm | Sự kiện | Âm thanh`, hoặc dòng `không có SFX gắn sự kiện`); thiếu thì stage plan chặn. Mục để trống, chỉ có tiêu đề bảng hay chỉ có `TODO` cũng chặn; dòng `không có SFX gắn sự kiện` chỉ có nghĩa khi bảng không có hàng. Stage final chạy `sfx-sync`: dòng FAIL chặn, dòng WARN chỉ cảnh báo, thiếu mục này chỉ WARN.
- BRIEF có `style_profile:` thì style phải resolve được cùng `## style_layers` và cột `Loại` (`styles.mjs resolve`); sai thì chặn. Thiếu `style_profile:` chỉ WARN. Dự án cũ chỉ nhận WARN.
- Stage final thêm: `DEMO.md` có `animatic:` (make-demo `--animatic`) mới hơn PLAN và không bị qc-mp4 MOTION chấm FAIL; `build/RECIPES.md` (recipe-pack) mới hơn PLAN.

## 2. Chụp khung hình demo

Sau khi dựng xong (bước 6), **trước** bản giao cuối:

```bash
node $OV/scripts/make-demo.mjs --project . --animatic                              # dự án sáng tạo (BRIEF direction): clip nháp toàn bộ + khung + contact sheet
node $OV/scripts/make-demo.mjs --project .                                          # bản chính → demo/ (chỉ ảnh tĩnh, dự án creative_override)
node $OV/scripts/make-demo.mjs --project . --aspect 9x16 --composition compositions/main-9x16.html [--animatic]   # 9:16 cùng project → demo/9x16/
node $OV/scripts/make-demo.mjs --project . --aspect 9x16 --hyperframes ../<project-9x16> [--animatic]             # 9:16 là project riêng
```

- `--animatic` render toàn bộ composition ở `--quality draft` thành `demo/animatic.mp4`, cắt các khung trong PLAN.md từ chính clip đó và ghép `demo/contact-sheet.jpg`. `DEMO.md` ghi `animatic: demo/animatic.mp4`. **Gửi clip này cho người dùng** (không chỉ ảnh tĩnh): lỗi "lật slide" chỉ thấy được khi xem chuyển động.

- Mặc định dùng `npx hyperframes snapshot` tại đúng các mốc trong PLAN.md.
- `--composition` render bản nháp (`--quality draft`) rồi cắt PNG bằng ffmpeg, vì snapshot không chọn được composition.
- Mỗi lần chụp, script xoá `frame-*.png` cũ và ghi lại `DEMO.md` với `approval: pending`.

## 3. Duyệt demo

1. Gửi các PNG trong `demo/` (và `demo/9x16/`) cho người dùng xem. Agent cũng tự xem từng khung: chữ đủ dấu, không tràn, đúng vùng an toàn, đúng nội dung cảnh.
2. Người dùng góp ý thì sửa composition và chụp lại (approval quay về `pending`).
3. Người dùng đồng ý thì ghi vào `DEMO.md`:

```markdown
approval: <ai>, <ngày giờ>, "<lời đồng ý>"
```

Ví dụ: `approval: người dùng, 2026-10-12 14:05, "ok, render bản cuối"`.

Chỉ khi người dùng đã nói rõ là chạy liền không dừng hỏi, agent được tự duyệt, và phải ghi lý do:

```markdown
approval: auto — người dùng yêu cầu chạy không dừng (2026-10-12 "làm hết luôn"); agent đã tự xem 8/8 khung
```

`approval` trống, `pending` hoặc ngắn hơn 6 ký tự đều bị chặn.

### Hash hình và tiếng của animatic

`make-demo.mjs --animatic` của bản chính (không `--aspect`, `--composition` hay `--hyperframes`) ghi thêm hai dòng vào `DEMO.md`: `visual_hash:` (hàm `pictureHash` của `render-final.mjs`: `index.html` bỏ thẻ `<audio>` và bỏ phần giữa `/* TIMING:BEGIN */` và `/* TIMING:END */`, mọi file trong `scenes/`, `compositions/` không phải html, `assets/` trừ thư mục và file âm thanh và trừ `assets/gen/`, nơi chứa đợt vẽ, ảnh gốc, ảnh tách nền và ảnh xem trước rig; file trong đó chỉ được tính khi composition tham chiếu thẳng tới nó) và `audio_hash:` (hàm `audioHash`). Chạy lại make-demo giữ hai dòng này và dòng `audio_review:`, không nhân đôi.

Có `visual_hash:` thì cổng final so hash thay cho ngày sửa `index.html`, `compositions/*.html`:

- Hash hình khác: FAIL "hình đã đổi sau animatic được duyệt" (kèm tên vài file sửa sau animatic nếu có), chạy lại `make-demo.mjs --animatic` và xin duyệt lại. Sửa `scenes/*.mjs` rơi vào đây.
- Hash tiếng khác `audio_hash:`: chỉ WARN "tiếng đã đổi sau animatic". Lồng lại một câu rơi vào đây: `timing.mjs` viết lại khối TIMING nhưng hình vẫn là hình đã duyệt. Nghe lại, chạy `mix-balance.mjs` và QC âm thanh, rồi ghi lần nghe bằng `node $OV/scripts/make-demo.mjs --project . --record-audio-review <ai>` (Studio gọi lệnh này khi bấm "Nghe rồi, được"; đạo diễn do Studio chạy không ghi được dòng này, lệnh thoát mã 2). Lệnh ghi `audio_review: <ai> <thời điểm ISO> <audioHash hiện tại>` phía trên `## Frames`, không đụng `approval:`; khi hash trong dòng đó bằng hash tiếng hiện tại thì hết WARN.
- `PLAN.md` mới hơn animatic vẫn FAIL như cũ. Câu lồng lại dài hơn có thể đổi nhịp hình mà hash không thấy (TIMING đứng ngoài hash), nên WARN nghe lại là bước bắt buộc xem lại, không phải lời nhắc suông.
- Dự án cũ không có `visual_hash:` và bản 9:16 vẫn so ngày sửa file như trước. Cờ `--legacy-mtime` của `check-preflight.mjs` và `render-final.mjs` ép đường so ngày, in một dòng WARN; cờ này bỏ sau 2026-10-31.

## 4. Render bản cuối

```bash
node $OV/scripts/render-final.mjs --project . -- --output renders/<name>-16x9.mp4
node $OV/scripts/render-final.mjs --project . -- -c compositions/main-9x16.html --output renders/<name>-9x16.mp4
```

- Luôn render `--quality delivery`; truyền `--quality`/`-q` sẽ bị từ chối (exit 2).
- Cổng chặn thì exit **5** và in lý do; sửa rồi chạy lại. Không gọi thẳng `hyperframes render --quality delivery` để né cổng.
- Bản nháp và bản QA (`--quality draft|looks`) vẫn chạy `hyperframes render` như cũ.
- Composition sửa sau lần chụp demo cuối chỉ là WARN: nếu thay đổi nhìn thấy được, chụp lại demo và xin duyệt lại.
- Thumbnail của bản giao không chụp riêng: `node $OV/scripts/export.mjs --project ./ --input renders/<name>.mp4 --target <…>` lấy một khung trong mục `## Frames` của `DEMO.md` đã duyệt (`--thumb-frame <n>` để chọn khung khác khung đầu).
