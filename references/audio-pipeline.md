# Pipeline âm thanh

Script: `node $OV/scripts/eleven.mjs <cmd>`. Script tự đọc key từ `~/.config/opus-video/.env`. **Không** source, cat hay echo file đó trong shell.

Thứ tự làm: **voice trước** (để có thời lượng thật), sau đó chỉnh storyboard cho khớp, rồi mới làm SFX, nhạc nền và mix.

## 1. Voice (ElevenLabs, `eleven_v4`)

Chia lời theo cảnh, mỗi cảnh một file. Như vậy dễ sửa từng câu và timing không bị trôi.

```bash
node $OV/scripts/eleven.mjs tts --text-file script/01.txt --out assets/voice/01.mp3
```

- **Cổng viet-pro** (dự án tiếng Việt theo `BRIEF.md` `language:`): lệnh chạy `check-viet-pro` trước khi gọi API và exit **4** nếu chưa PASS. File lời đọc phải là `<project>/script/NN.txt` (thư mục dự án = cha của `script/`, hoặc `--project`); `--text` bị từ chối. Bỏ cổng: `--skip-viet-pro-gate` kèm `viet_pro_override: <lý do>` trong frontmatter `BRIEF.md` (không hợp lệ ở bước giao). Mỗi mp3 có `NN.mp3.gate.json`; đừng xoá hay chép mp3 từ chỗ khác vào `assets/voice/`, vì bước giao sẽ chặn. Dự án không phải tiếng Việt phải truyền `--lang <mã>`.
- Mặc định: model `eleven_v4`, voice `eGSd0uV8dNQnZuEEX9lu` (Adam, do người dùng chọn; nhãn ElevenLabs là tiếng Anh, giọng Mỹ), `--lang vi`. Vì giọng không gắn nhãn tiếng Việt, luôn đưa file cho người dùng nghe trước khi giao bản cuối. Thứ tự ưu tiên khi `tts` và `audio-meta` chọn giọng: `--voice`/`--model`, rồi `voice_id`/`tts_model` trong frontmatter `BRIEF.md` của dự án (ví dụ giọng của brand do `make-pitch choose` ghi; giá trị trùng giọng hoặc model mặc định được xem là của mẫu BRIEF, như chưa đặt), rồi `OPUS_VIDEO_VOICE_ID` / `OPUS_VIDEO_TTS_MODEL` của máy (biến môi trường hoặc file env), cuối cùng là mặc định. Mỗi lần chạy, `eleven.mjs` in giọng được chọn và nguồn của nó.
- Đầu ra gồm `01.mp3` và `01.mp3.words.json` (`[{text,start,end}]`, giây). Dùng file json này cho phụ đề và để canh beat.
- `--speed 0.9–1.1` để chỉnh nhịp. Tiếng Việt khoảng 2,5–3 từ/giây.
- Route A là `/v1/text-to-speech/{voice}/with-timestamps`, tối đa 10.000 ký tự. Nếu bị 400/422, script tự chuyển sang Route B (`text-to-dialogue`, tối đa 2.000 ký tự, không có `speed`).
- **Không** dùng TTS của `media-use` cho tiếng Việt, vì nó ghim cứng `eleven_multilingual_v2`, model không có tiếng Việt.
- So sánh giọng hoặc model: `eleven.mjs probe-models --text-file x.txt --models eleven_v4,eleven_v3` (không qua cổng; file luôn ghi vào `$TMPDIR/ov-probe/`, không dùng làm voice thật), rồi đưa file cho người dùng nghe. Agent không tự chấm chất lượng giọng.

## 1b. Cầu nối HyperFrames (`audio-meta`)

Bước audio (`audio.mjs generate`) của các workflow HyperFrames ghim cứng `eleven_multilingual_v2`, model không có tiếng Việt. Vì vậy **bỏ qua** bước đó và chạy:

```bash
node $OV/scripts/eleven.mjs audio-meta --script SCRIPT.md --hyperframes . [--bgm assets/bgm/bgm.mp3 --bgm-volume 0.2] [--reuse]
```

- **Cổng viet-pro:** trước khi tạo giọng, lệnh chạy `check-viet-pro` cho dự án (`--project`, mặc định `--hyperframes`) và so từng frame với `script/NN.txt` (bỏ qua khác biệt khoảng trắng). Thiếu file hoặc lệch chữ thì exit 4. `script/` được phép có file thừa. Bỏ cổng như mục 1 (`--skip-viet-pro-gate`).
- Đọc `SCRIPT.md` (`## Line N — … (Frame N)`, lời đọc thụt 4 dấu cách), tạo giọng `eleven_v4` cho từng frame vào `assets/voice/NN.mp3`. `--reuse` dùng lại file đã có, không tốn credit.
- Ghi **hai** file:
  - `audio_meta.json`: theo frame, gồm voices, words `w0…`, và bgm `source: "host"`.
  - `audio_engine_meta.json`: sidecar theo id `"01"`. `fetch-sfx` merge từ sidecar này rồi ghi đè `audio_meta.json`, nên **thiếu sidecar là mất hết giọng**. Không được xoá nó.
- Sau đó chạy tiếp như bình thường: `audio.mjs sync-durations` → `audio.mjs fetch-sfx` → `captions.mjs build`. `fetch-sfx` không cần HeyGen: nó lấy từ thư viện bundled, và bỏ qua frame đã có SFX `source: "host"`.
- Đã kiểm bằng `node --test $OV/scripts/tests/`. Test round-trip xác nhận voices và bgm giữ nguyên sau `fetch-sfx`.

## 2. SFX

1. Thử catalog trước:
   ```bash
   hyperframes media-use resolve --type sfx --intent "soft ui click" --project .
   ```
   Lệnh này lấy từ bộ 19 file bundled, hoặc từ catalog HeyGen nếu đã đăng nhập. Kiểm chứng ngày 2026-10-08: heygen CLI đang cài không có lệnh `audio`, nên resolve chỉ trả file bundled (vd. một whoosh dài 5,5 giây). Nghe thử và kiểm tra độ dài trước khi dùng.
2. Nếu thiếu hoặc không hợp, sinh mới (mô tả bằng tiếng Anh, ngắn và cụ thể):
   ```bash
   node $OV/scripts/eleven.mjs sfx --text "airy whoosh, short, modern UI" --seconds 0.8 --out assets/sfx/whoosh.mp3
   ```
   Model `eleven_text_to_sound_v2`, dài 0,5–30 giây, `--influence 0.3` (tăng lên nếu muốn bám mô tả hơn).
3. Mỗi video ngắn dùng 2–6 SFX. Mỗi cue gắn với một hành động hình ảnh, không rắc SFX cho có.

### Khớp SFX với hình

Nhiều file SFX có một đoạn im lặng ở đầu, nên đặt `data-start` đúng lúc hình chuyển vẫn có thể làm tiếng vang trễ. Dự án có `direction:` ghi mỗi khoảnh khắc trên hình có gắn tiếng vào bảng `## Sự kiện` của `PLAN.md` (mẫu ở `references/plan-demo.md`). Sau khi đặt SFX vào composition, chạy:

```bash
node $OV/scripts/sfx-sync.mjs --project . --fix
```

Script đo đoạn im lặng đầu mỗi file và so lúc tiếng thật sự vang với thời điểm sự kiện theo ngưỡng ITU-R BT.1359-1 (tiếng sớm tối đa 45 ms, trễ tối đa 125 ms thì PASS). Dòng chưa PASS kèm đề xuất `data-start`; script không sửa HTML. Cổng final của `check-preflight.mjs` chạy cùng phép đo này và chặn dòng FAIL. Cách đọc bảng và công thức ở `references/plan-demo.md`.

## 3. Nhạc nền

```bash
node $OV/scripts/eleven.mjs music --prompt "calm curious ambient, 100 BPM, light piano and soft pads" --seconds 15 --out assets/bgm/bgm.mp3
```

- Model `music_v2_5`, `force_instrumental: true`. Độ dài bằng đúng thời lượng video (hoặc dư 1–2 giây để fade).
- Đã kiểm chứng chạy được trên gói Creator. Gói này cho tối đa 2 luồng song song, nên không gọi music song song.
- Nếu script exit 3 và in `MUSIC_UNAVAILABLE`, chuyển sang:
  `hyperframes media-use resolve --type bgm --intent "<mood>" --project .`
- Ghi BPM vào prompt để storyboard bám beat được, rồi đo nhịp thật của file (mục 3b).

## 3b. Đo nhịp nhạc (`beat-grid.mjs`)

BPM ghi trong prompt chỉ là ý muốn, file nhạc sinh ra có thể lệch. Với hướng `don-dap` hoặc nhóm `story-music`, đo nhịp thật trước khi cắt hình theo phách:

```bash
node $OV/scripts/beat-grid.mjs assets/bgm/bgm.mp3 --write
node $OV/scripts/timing.mjs --project .
```

- Lệnh in `BPM`, `BEAT0` (giây của phách đầu), `stability` (ms) và bảng ô nhịp có phách kick (`K`). `--write` ghi `bgm.mp3.beats.json`, `timing.mjs` đọc file này để `B(n)` trong composition rơi đúng phách thứ n. Lệnh chỉ đo, không cắt ghép nhạc.
- `stability` là độ lệch chuẩn giữa lưới phách và onset dải trầm. Trên 45 ms thì lệnh in `UNSTABLE`, exit 1 và không ghi file: nhạc trôi tempo hoặc không đọc được nhịp, không dùng `B()` cho bài này. Ngưỡng 45 ms đo trên 6 bản nhạc thật trong workspace (16–40 ms, cả 6 đọc đúng tempo); một chuỗi kick trôi từ 100 lên 140 BPM cho khoảng 100 ms.
- Nhạc chậm mà lệnh đọc ra gấp đôi tempo nghe được: chạy lại với `--max-bpm 100`.
- Dự án có nhiều file `*.beats.json` trong `assets/bgm/` thì `timing.mjs` cần `--music <file>`.

## 4. Mix

| Lớp | Mức mục tiêu |
|---|---|
| Voice | khoảng −16 LUFS |
| Nhạc nền khi có giọng | thấp hơn giọng 4–7 dB, đo bằng `mix-balance.mjs` |
| Nhạc nền khi không có giọng | khoảng −20 LUFS |
| SFX | khoảng −20 LUFS, đỉnh không quá −3 dBTP |
| Bản master giao cho mạng xã hội | khoảng −14 LUFS integrated, −1,5 dBTP (`audio-mix --loudnorm`) |

### Nhạc dưới giọng 4–7 dB

```bash
node $OV/scripts/mix-balance.mjs --project . [--write-qa]
```

- Lệnh dựng lại tiếng bằng `audio-mix.mjs`, tách hai stem giọng và nhạc, rồi so RMS của hai stem trong những đoạn đang có lời (lấy từ `words.json`). Kết quả là một dòng, ví dụ `PASS BALANCE nhạc dưới giọng 6.1 dB (lúc có lời), nhạc lúc không lời −22.3 dBFS`.
- Ngưỡng: 4–7 dB là PASS, 2–4 hoặc 7–10 dB là WARN, ngoài khoảng đó là FAIL. Dự án cũ chỉ nhận WARN. Cổng `check-preflight --stage final` chạy phép đo này với dự án có `index.html`.
- Lý do chọn khoảng này: theo `audio-and-beat-sync.md` của motion-video (AgentKit), khi nhạc thấp hơn giọng khoảng 10 dB, người xem báo là "không có nhạc". Dưới 4 dB thì nhạc dễ lấn lời.
- Vai trò track: giọng là id `vo-*`, `data-audio-group="voiceover"` hoặc nguồn của một carve; nhạc nền là track có carve, group `music` hoặc file nằm trong `bgm/`. Track giọng đặt tên khác (ví dụ `el-01-…-voice` do `assemble-index` của faceless-explainer sinh) chưa được nhận, lệnh sẽ in `PASS BALANCE không có giọng đọc`. Gặp dòng này ở dự án có lời thì đo trên bản sao HTML đã đổi id giọng thành `vo-…` (`--html`).

### Giảm nhạc theo giọng (`data-fx-carve`)

`audio-mix.mjs` đọc `data-audio-group` và `data-fx-carve` rồi đổi thành sidechain ffmpeg: nhạc nền có carve được giảm khi track nguồn của carve có tiếng. Không cần sửa HTML của dự án cũ.

- Độ giảm có đích: `4 + 2,5 × strength` dB nhạc dưới giọng (strength 0,8 cho 6 dB). Lệnh trộn thử một bản không giảm để đo mức tự nhiên, rồi tìm ngưỡng compressor bằng cách đo lại sau mỗi lần thử (tối đa 6 lần), không dùng hằng số cố định. stderr in một dòng `duck #music: natural … target … wanted … got …`.
- Đây là xấp xỉ phần mức của carve trong HyperFrames, không tái tạo EQ nhiều dải. Trên bản render HyperFrames thật của dự án Gemini, carve không có `data-fx-chain` không làm nhạc nhỏ đi khi có lời.
- `--loudnorm` chuẩn hoá hai lượt về −14 LUFS, đỉnh −1,5 dBTP. `--stems <dir>` ghi `voice.wav` và `music.wav` (mức trước loudnorm). `render-final.mjs` luôn gọi `--loudnorm`.

### Kết quả hiệu chỉnh (2026-10-15, bản sao trong `/tmp`)

| Dự án | BALANCE | Ghi chú |
|---|---|---|
| `gemini-argon-dot2-9x16` (có carve, strength 0,8) | PASS 6,1 dB | nhạc tự nhiên 3,7 dB dưới giọng, duck thêm 2,4 dB; bản mix −14,0 LUFS, đỉnh −1,5 dBFS |
| `claude-code-ceo-sme` (dự án cũ, nhạc `data-volume` 0,2, không carve) | WARN 8,4 dB khi đổi id giọng thành `vo-…`; HTML gốc cho `PASS … không có giọng đọc` | ngoài khoảng 4–7 dB; ngưỡng giữ nguyên, chờ người dùng nghe |

- Trong HyperFrames, đặt volume theo `hyperframes-audio`. Ducking dùng `data-fx-carve` trên track nhạc (mục trên); bản giao do `audio-mix.mjs` thực hiện.
- Chỉnh mức bằng lệnh thay vì thử tay: `hyperframes normalize-audio --lufs=-16 --target <id> --write` cho từng track voice; đặt limiter ở bus master theo `hyperframes-audio` để đạt −1 dBTP. Sau đó đo lại trên file render.
- Đo loudness và true peak: `node $OV/scripts/qc-mp4.mjs renders/x.mp4 --project ./` (dòng `LOUDNESS` và `TRUE_PEAK`).
- Bản giao do `render-final.mjs` dựng lại tiếng bằng `audio-mix.mjs` (ffmpeg) từ các thuộc tính audio tĩnh trong composition. Đo trên một video 9:16 dài 60 giây, loudness của hai cách mix chỉ lệch 0,1 LU.

## 5. Đổi tiếng không render lại

Chỉ đổi nhạc nền, SFX hay mức âm (`data-volume`) thì giữ hình của bản final cũ và chỉ mix lại tiếng:

```bash
node $OV/scripts/render-final.mjs --project . --audio-only renders/<cũ>.mp4 -- --output renders/<mới>.mp4
```

- Bản 9:16 thêm `-c compositions/main-9x16.html` sau `--`. Sau `--` chỉ nhận `-c` và `--output`; `--output` bắt buộc và phải khác file cũ.
- Đo trên video 9:16 dài 60 giây: render đầy đủ mất khoảng 108–111 giây, `--audio-only` khoảng 1 giây.
- File âm thanh mới đặt trong `assets/voice/`, `assets/sfx/` hoặc `assets/bgm/`. File mới ở chỗ khác trong `assets/` bị tính là đổi hình.
- **Tiếng động** (giữ bản mix của HyperFrames, không đổi tiếng riêng được): `data-automation`, `data-fx-chain`, tween GSAP trên volume hoặc script gán `.volume`, `<audio>` hay `<video>` không `muted` trong cảnh con (`data-composition-src`).
- **Sidecar** `<file>.mp4.render.json` do `render-final` ghi sau mỗi lần chạy: `composition`, `visual_hash`, `audio_hash`, `mode` (`full` hoặc `audio-only`), `mixer` (`audio-mix` hoặc `hyperframes`), `source`, `source_sha256`, `created`. `source_sha256` là sha256 của chính file MP4, nên file đã nén hay sửa sau khi render không còn khớp.
- Tiếng không đổi so với sidecar thì lệnh báo và thoát 0, không ghi file mới.
- **Exit 6** khi không đổi tiếng được: file cũ không có sidecar, sidecar không khớp file (sha256 khác), file cũ render từ composition khác, hình đã đổi, có tiếng động, hoặc thiếu file được tham chiếu. Khi đó render đầy đủ bằng `render-final.mjs`.

## Bản quyền

- Audio sinh từ ElevenLabs trên gói trả phí (Creator) được dùng thương mại theo điều khoản của ElevenLabs.
- Audio từ catalog HeyGen hoặc bộ bundled theo license của nguồn đó. Ghi nguồn vào `assets/CREDITS.md`.
- Không dùng nhạc có bản quyền do người dùng không sở hữu.
