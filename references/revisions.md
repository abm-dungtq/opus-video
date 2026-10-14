# REVISIONS.md: vòng sửa khoanh vùng

Tài liệu này là mẫu và luật để agent làm theo khi người dùng xin sửa video. Mục đích là sửa đúng chỗ, kiểm từng chỗ bằng ảnh chụp mà không render lại cả video, và giữ lại ghi chép đã sửa gì qua từng vòng.

## 1. Khi nào dùng

Dùng sau khi người dùng xem animatic (`make-demo.mjs --animatic`) hoặc bản final và xin sửa. Mỗi lần người dùng gửi một loạt yêu cầu sửa thì mở một vòng mới trong `REVISIONS.md` ở thư mục dự án. Không xoá các vòng cũ, vì chúng là lịch sử sửa của dự án.

## 2. Mẫu

Chép đúng khung này. Mỗi mục `### R<số>` cần đủ các dòng `Vị trí:`, `Lỗi thấy:`, `Đổi:` và `Giữ nguyên:`; dòng `Kiểm:` ghi lệnh dùng để kiểm mục đó.

```markdown
# REVISIONS

## Vòng 1 (2026-10-14 15:00) — lời người dùng: "<chép nguyên văn>"

### R1
- Vị trí: 6.5s (khung 195 ở 30 fps), cảnh 2
- Lỗi thấy: con trỏ đè lên nhãn kết quả
- Đổi: con trỏ rời nút trong 6.8–7.0s, dừng cách nhãn 24 px
- Giữ nguyên: lúc nhấn 6.5s, lúc hiện kết quả 7.0s, chữ, tiếng
- Kiểm: snapshot --at 6.4,6.5,7.0,7.4 · check --at-transitions
```

Dòng tiêu đề vòng chép **nguyên văn** lời người dùng, không tóm tắt lại. Khi một câu của người dùng chứa nhiều lỗi thì tách thành nhiều mục `### R`.

## 3. Luật

- Mỗi vòng có tối đa 5 mục `### R`. Nếu người dùng xin nhiều hơn, hỏi người dùng mục nào để sang vòng sau rồi mới sửa.
- Sửa theo thứ tự: chữ đọc được và thông tin thiếu trước, rồi đến nhịp và thời điểm, cuối cùng là chi tiết hình.
- `Vị trí` ghi giây trên **timeline gốc**. Thời điểm bên trong một composition con phải đổi ra giây gốc bằng cách lấy thời điểm bắt đầu composition cộng thời điểm bên trong.
- `Giữ nguyên` liệt kê các mốc và thành phần không được đổi khi sửa mục đó. Sau khi sửa, kiểm lại cả những mốc này chứ không chỉ chỗ vừa đổi.
- `check-preflight.mjs --stage final` in WARN khi một vòng có hơn 5 mục hoặc một mục thiếu trường. Cảnh báo này không chặn render, nhưng phải sửa ghi chép trước khi giao.

## 4. Kiểm từng mục

Sau khi sửa một mục, kiểm ngay bằng ảnh chụp trên composition hiện tại. Hai lệnh dưới đây không cần render:

```bash
# Chụp hình hiện tại quanh mốc t (ví dụ t = 6.5s): ngay trước, đúng lúc, và sau đó
npx hyperframes snapshot . --at <t-0.3>,<t>,<t+0.5> --no-end

# Tìm chữ đè nhau hoặc tràn ở chỗ nối cảnh
npx hyperframes check --at-transitions
```

- Thêm vào `--at` các mốc ghi ở `Giữ nguyên` để chắc rằng chúng không bị đổi.
- Lệnh `npx hyperframes` không ghim phiên bản có thể chạy bản cài toàn cục trên máy. Dự án ghim `hyperframes@0.8.144` trong `package.json`, nên khi cần đúng bản đó thì gọi `npx --yes hyperframes@0.8.144 snapshot . --at …`. Các cờ dùng ở đây (`--at`, `--no-end`, `--at-transitions`) có trong bản 0.8.144.
- Bản 0.8.144 không có cờ `--range` cho `snapshot` hay `check`, nên không dùng cờ đó.

## 5. Cho người dùng xem "trước" một đoạn

Trước khi chạy lại `make-demo`, cắt đoạn có lỗi từ animatic cũ để người dùng so trước và sau:

```bash
ffmpeg -ss <a> -to <b> -i demo/animatic.mp4 -c:v libx264 -an demo/truoc-R1.mp4
```

Phải cắt trước, vì `make-demo --animatic` sẽ ghi đè `demo/animatic.mp4`.

## 6. Hết vòng

- Khi mọi mục trong vòng đã sửa và kiểm xong, chạy **một lần** `make-demo.mjs --animatic`.
- Người dùng xem animatic mới và duyệt, rồi ghi `approval:` vào `DEMO.md`.
- Đoạn cắt "trước" và ảnh chụp từ `snapshot` không được tính là duyệt. Chỉ animatic mới của cả video mới được tính.
- `hyperframes render` không có cờ render một khoảng thời gian, nên không có bản render một đoạn để duyệt riêng.
