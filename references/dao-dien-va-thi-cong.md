# Đạo diễn và thi công, hoặc chế độ tiết kiệm

Gu và sức lao động cần hai loại model khác nhau. Hướng sáng tạo (ý tưởng hình, nhịp, nhận xét "làm cho có gu hơn") là việc phán đoán, nên chạy ở model mạnh nhất. Viết `index.html` và chạy pipeline là việc dài và máy móc, nên chạy ở model nhanh, rẻ hơn, bám theo một bản hướng đã viết sẵn.

| Chế độ | Ai làm gì | Dùng khi |
|---|---|---|
| Mặc định | Phiên chính (controller) chốt outcome, ghi file và kiểm kết quả. `ov-director` (Opus) viết hướng và duyệt contact sheet. `ov-executor` (Sonnet) chạy pipeline và dựng. | mọi video mới hay đổi phong cách trong hướng `dao-dien` và `tu-nhac`, và yêu cầu "làm cho có gu hơn" trên video đã có |
| `--poor` | Một phiên làm hết, không subagent, đọc tài liệu theo nhu cầu, một vòng duyệt | người dùng muốn tốn ít token nhất ("tiết kiệm") |

Việc làm lại không đổi hình (nhạc mới, mix lại, render lại, xuất theo nơi đăng, `reframe --quick`) bỏ qua đạo diễn ở cả hai chế độ.

## Vai trò và file

- **Phiên chính (controller):**
  - sở hữu `BRIEF.md`, `SCRIPT.md`, `script/`, `build/DIRECTION.md`, `build/REVIEW-<n>.md`;
  - chạy pitch (`ov-direction`) và cổng viet-pro (`ov-script`);
  - kiểm kết quả cuối bằng số đo và bằng mắt.
  - Phiên chính không tự viết `index.html` khi đã giao cho executor.
- **`ov-director`** (`agents/ov-director.md`):
  - chỉ đọc (`Read`, `Glob`, `Grep`), không có `Write`, `Edit` hay `Bash`, vì luật `Write(path)` của agent không đáng tin và một script node lách được luật Edit;
  - trả văn bản, phiên chính ghi lại;
  - không xem mã `index.html`, chỉ chấm brief, lời và hình.
- **`ov-executor`** (`agents/ov-executor.md`):
  - sở hữu mọi thứ còn lại trong dự án: âm thanh, timeline, `index.html`, `demo/`, `renders/`, bản dọc;
  - báo chỗ làm khác hướng thay vì tự đổi hướng.

## Luồng

1. **Pitch đã chọn.** `ov-direction` ghi hướng, energy, palette, style profile vào `BRIEF.md`. Lời đọc đã qua viet-pro (`check-viet-pro.mjs` PASS).
2. **Đạo diễn viết hướng** (trước khi có giọng). Phiên chính gọi `ov-director` với đường dẫn `BRIEF.md`, lời đọc, bảng style theo cảnh (`styles.mjs resolve`). Mốc theo từ `W(sid, "từ")` và theo drop, không theo giây.
   - Nếu đạo diễn đề xuất sửa lời: phiên chính chỉ nhận câu giữ đúng sự thật, rồi cho lời mới qua lại cổng viet-pro.
3. **Phiên chính ghi `build/DIRECTION.md`** đúng nguyên văn bản hướng.
4. **Executor dựng.** Gọi `ov-executor` với đường dẫn dự án và plugin:
   - âm thanh (`ov-audio`): giọng, `timing.mjs`, `beat-fit.mjs` nếu có lưới beat, `cues.mjs place`;
   - dựng (`ov-build`): `index.html` theo `build/DIRECTION.md` và `references/motion-craft.md`;
   - `make-demo.mjs --animatic`, trả `demo/contact-sheet.jpg`, `demo/scenes/sheet-s<#>.jpg`, kết quả kiểm và danh sách lệch hướng.
5. **Đạo diễn duyệt.** Phiên chính gọi lại `ov-director` với `build/DIRECTION.md`, các sheet và danh sách lệch hướng. Câu trả lời mở bằng `Review <n>: revise` hoặc `Review <n>: ship`, sau đó tối đa 8 ghi chú có id cảnh.
6. **Phiên chính ghi `build/REVIEW-<n>.md`** đúng nguyên văn.
   - `revise`: executor sửa đúng các cảnh trong ghi chú, dựng lại animatic, quay lại bước 5. Tối đa 3 vòng; hết 3 vòng mà chưa `ship` thì phiên chính báo người dùng những ghi chú còn lại.
   - `ship`: sang bước 7.
7. **Người dùng duyệt animatic** như cũ (`DEMO.md`, `check-preflight --stage final`). Đạo diễn không thay người dùng.

`check-preflight --stage final` in WARN `đạo diễn chưa kết luận ship (build/REVIEW-<n>.md)` khi dự án có `build/DIRECTION.md` mà review mới nhất chưa phải `ship` hoặc chưa có review nào. Đây là WARN, không phải FAIL, vì người dùng vẫn là người duyệt cuối.

## Gói giao việc

Đưa cho subagent đường dẫn, không đưa cả hội thoại. Agent của plugin gọi bằng tên có tiền tố plugin: `subagent_type: "opus-video:ov-director"` và `"opus-video:ov-executor"`. Plugin cài từ marketplace cần cập nhật hoặc cài lại mới thấy hai agent này; không thấy thì làm như mục "Khi runtime không chọn được model" bên dưới.

- Đạo diễn: "Bạn là `ov-director`. Plugin `<OV>`, dự án `<dự án>`. Đọc `<OV>/references/motion-craft.md`, `<dự án>/BRIEF.md`, `<dự án>/SCRIPT.md`. Bảng style: <dán>. Outcome: <khán giả, thời lượng, kết>. Trả bản hướng theo khung trong agent, không ghi file."
- Executor: "Bạn là `ov-executor`. Dựng video ở `<dự án>` bằng plugin `<OV>`. Hướng ở `<dự án>/build/DIRECTION.md`. Làm từ bước âm thanh tới `make-demo --animatic`. Trả đường dẫn sheet, kết quả kiểm và danh sách lệch hướng."
- Vòng duyệt dùng lại gói đạo diễn, thay lời đọc bằng sheet và danh sách lệch hướng. Vòng sửa dùng lại gói executor, kèm `build/REVIEW-<n>.md` và các cảnh cần dựng lại.

## Khi runtime không chọn được model

- Runtime gán được model theo agent: đạo diễn chạy Opus, executor chạy Sonnet như frontmatter.
- Subagent chạy được nhưng cùng một model: giữ vai trò và file như trên. Báo người dùng một câu rằng hướng và thi công chạy cùng model.
- Không gọi được subagent: phiên chính lần lượt đóng hai vai. Vẫn ghi `build/DIRECTION.md` trước khi dựng và vẫn duyệt sheet theo nó.

Kết quả của model rẻ hơn được kiểm, không được tin sẵn: phiên chính đọc số đo executor báo và tự xem sheet; mỗi cảnh được đạo diễn duyệt ít nhất một lần.

## Chế độ tiết kiệm (`--poor`)

Bật bằng cờ `--poor` hoặc khi người dùng nói "tiết kiệm", "ít token". Một phiên, không gọi `ov-director` hay `ov-executor`. Model là model của phiên; skill không đổi model.

- **Hướng:** phiên chính tự viết bản hướng ngắn vào `build/DIRECTION.md`: dòng ý tưởng, luật gu, và mỗi cảnh một dòng (khoảnh khắc chính, cách ra cảnh). Bỏ khung đầy đủ từng cảnh.
- **Đọc:** style profile, phần của `motion-craft.md` đang dùng. Đọc `index.html` theo khoảng dòng hay tìm kiếm, không đọc cả file.
- **Dựng:** dùng lại hàm của skeleton và part có sẵn (`composition.mjs add-part`) thay vì tự viết mới.
- **Duyệt:** một animatic, một contact sheet, một vòng sửa. Phiên chính tự duyệt theo khung review của `ov-director` một lần và ghi `build/REVIEW-1.md`. Nếu kết luận là `revise`, sửa xong thì xem lại sheet và ghi `build/REVIEW-2.md` (`Review 2: ship` hoặc `revise`); không ghi thì preflight final giữ WARN.
- **Nhạc:** một lần tạo nhạc; drop lệch thì ghép ô nhịp (`arrange-music.mjs`), không tạo lại.
- **Bản dọc:** bản sẽ đăng thì vẫn `reframe.mjs <project> --ratio`; chỉ xem thử thì `reframe.mjs --quick`, và nói rõ đã dùng cách nào.

`--poor` không bỏ cổng nào: viet-pro, `check-preflight --stage plan|final`, duyệt animatic của người dùng, `npm run check`, QA bản render vẫn chạy đủ.

## Quan hệ với đạo diễn của Motion Studio

Đạo diễn trong Motion Studio (`claude -p` chạy từ Studio, xem `ov-studio`) là đường riêng và không đổi. Nó không gọi `ov-director` hay `ov-executor`, và vẫn bị `director-guard.mjs` giới hạn như trước.

## Nguồn

Chuyển thể từ `references/orchestration.md` của skill motion-video, AgentKit v1.3.0 (MIT): vai trò đạo diễn và executor, khung brief và review, cách giảm cấp khi thiếu model, chế độ `--poor`. Phần ở đây viết lại cho file, cổng và skill `ov-*` của opus-video.
