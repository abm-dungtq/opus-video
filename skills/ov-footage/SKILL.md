---
name: ov-footage
description: "Nhánh footage thật của opus-video: cắt gọn clip quay thật (talking-head, phỏng vấn, UGC) bằng cut.mjs và EDL, hoặc dùng clip làm trục với nền dựng mới (PiP trên bản đồ/phối cảnh, phụ đề từ bản chép lời, voice_source: clip). Dùng khi người dùng đưa clip quay sẵn, hoặc ở hướng tu-nhac bắt đầu từ footage. Không dùng cho video dựng mới hoàn toàn (ov-build), cho lời đọc TTS (ov-audio) hay để duyệt chữ tiếng Việt (ov-script vẫn bắt buộc)."
---

# ov-footage: footage thật và clip làm trục

`$OV` là thư mục gốc plugin opus-video, nơi có `scripts/` và `references/`: Claude Code `${CLAUDE_PLUGIN_ROOT}` (cài tại chỗ: `~/.claude/skills/opus-video`), Codex `~/.agents/skills/opus-video`, Antigravity `~/.gemini/config/skills/opus-video` (CLI: `~/.gemini/antigravity-cli/skills/opus-video`); tức thư mục chứa `skills/` và `scripts/` của plugin. Mọi lệnh là `node $OV/scripts/<x>.mjs` (PowerShell: thay `$OV` bằng đường dẫn đầy đủ).

## Nhánh footage thật (beta)

Người dùng đưa clip quay thật cần cắt gọn (talking-head, phỏng vấn, UGC): làm theo `references/footage-lane.md` (`$OV/references/footage-lane.md`, `scripts/cut.mjs` tìm điểm cắt và ghép), rồi quay lại bước 4b (PLAN.md) và 6–9 ở `ov-build` và `ov-deliver` (lời đọc hay chữ tiếng Việt mới thêm vẫn phải qua cổng viet-pro ở bước 2, `ov-script`; plan và demo vẫn bắt buộc). Video dựng mới hoàn toàn thì đi thẳng quy trình 9 bước.

```bash
node $OV/scripts/cut.mjs probe --in <clip> --out probe.json
node $OV/scripts/cut.mjs apply-edl --edl <edl.json> --out <cut.mp4>
```

(Cú pháp đầy đủ ở `--help`.) Clip thô đặt ở `footage/raw/`, clip đã cắt ở `footage/cut/` theo quy ước của workspace.

## Clip làm trục + nền dựng mới

**Clip làm trục + nền dựng mới** (clip đi thực địa, giới thiệu nhà đất, địa điểm đặt trong khung PiP trên bản đồ hoặc phối cảnh, hiệu ứng bám lời người nói): làm theo `$OV/references/clip-master-canvas.md`. BRIEF đặt `voice_source: clip`; khi đó cổng viet-pro lint `script/captions.txt` (sinh bằng `scripts/captions-from-transcript.mjs` từ bảng sửa lời người dùng đã duyệt) và `script/on-screen.txt` thay cho kịch bản TTS. PLAN.md viết ngay sau bản chép lời.

## Bước 1b với footage

Dự án footage chỉ cắt gọn, không dựng hình mới: ghi `creative_override: <lý do ≥10 ký tự>` vào BRIEF thay cho bước 1b. Clip làm trục + nền dựng mới vẫn nên qua bước 1b (`ov-direction`; hướng A8 hợp với bản đồ/PiP).

Lời người nói trong clip là nội dung thật của người dùng: không gắn nhãn rào đón lên hình (luật chung ở skill `opus-video`).

## Tham chiếu

| File | Dùng khi |
|---|---|
| `$OV/references/footage-lane.md` | Nhánh footage thật (beta): transcribe, probe, EDL, ghép |
| `$OV/scripts/cut.mjs` | `probe` (khoảng lặng an toàn), `apply-edl` (ghép theo danh sách cắt) |
| `$OV/references/clip-master-canvas.md` | Clip người dùng làm trục + PiP trên bản đồ/phối cảnh; `voice_source: clip`; bố cục 9:16 và bẫy đã gặp |
| `$OV/scripts/captions-from-transcript.mjs` | Phụ đề từ `transcript.json` + `captions.fixes.json` (sửa lời, đoạn chưa rõ, chia cụm); ra `captions.js`, `script/captions.txt`, `captions.review.md` |
| `$OV/scripts/poi-fetch.mjs` | Video BĐS/địa điểm: tiện ích quanh địa chỉ từ OpenStreetMap (chi tiết ở `ov-script`) |
