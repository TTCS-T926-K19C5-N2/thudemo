# Chạy demo tự động trên Windows

Từ thư mục `thudemo/`, chạy:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\demo.ps1
```

Script kiểm Node 24.x, Docker Desktop Linux, chạy đúng PostgreSQL 15432/Redis 16379, chờ dependency trước `prisma migrate deploy`, khởi động API 3001/web 3000/worker riêng và mở trình duyệt. Dùng lại build hiện có; chưa có build thì tự install frozen lockfile/generate/build. Không dùng Compose gốc 5432/6379. Docker Desktop phải được mở trước. pnpm được chọn đúng bản 10.15.1 bằng npx.

## Các lệnh khác

```powershell
# Kiểm trạng thái, không khởi động dịch vụ
.\scripts\demo.ps1 -Action Status

# Dừng tiến trình API/web/worker do script tạo
.\scripts\demo.ps1 -Action Stop

# Build lại sau khi sửa code (phải dừng các tiến trình app trước)
.\scripts\demo.ps1 -Build

# Cài dependency bằng frozen lockfile rồi build
.\scripts\demo.ps1 -Install -Build

# Lần đầu trên database local mới: tạo dữ liệu/tài khoản giả
.\scripts\demo.ps1 -Seed

# Chạy mà không mở trình duyệt
.\scripts\demo.ps1 -NoBrowser
```

`-Seed` là thao tác cập nhật fixture có chủ đích: có thể cập nhật mật khẩu và metadata các sự kiện giả. Không dùng khi muốn giữ nguyên các chỉnh sửa trên fixture. Nếu file mật khẩu riêng chưa có, script tạo mật khẩu ngẫu nhiên trong `.git/stitch-correction-password`; không in mật khẩu. Mặc định không seed/reset/xóa dữ liệu.

API/web đang chạy được kiểm tra và tái sử dụng, không bị dừng bởi `-Action Stop`. Muốn build/seed, dừng chúng bằng Ctrl+C tại cửa sổ đã mở. Script không tự tắt tiến trình lạ chiếm cổng, không dừng Docker và không xóa volume. Nếu một expiry worker không do script quản lý đang chạy, script báo lỗi để tránh chạy trùng.

PID, thời điểm tạo tiến trình và log nằm trong `.git/demo-local/`. Khi dừng, script xác minh launcher đúng checkout và thời điểm tạo trước khi dừng cây tiến trình đó. Chạy lại không tạo thêm worker do script quản lý. Nếu khởi động thất bại, chỉ tiến trình mới do lượt đó tạo được dừng; Docker/dữ liệu giữ nguyên.

## Đăng nhập và thao tác

- Người mua: `design-buyer@example.invalid` — xem sự kiện, chọn và giữ ghế.
- Người tổ chức: `design-organizer@example.invalid` — quản lý sự kiện/suất diễn/giá.
- Mật khẩu: `notepad .git/stitch-correction-password` (chỉ mở trên máy, không gửi chat/Git).

Mở `http://localhost:3000`, chọn sự kiện → chọn ghế → đăng nhập người mua → chọn ghế → **Giữ ghế**. Đồng hồ bắt đầu khi server xác nhận, reload không gia hạn. Quyền giữ nằm ở PostgreSQL; Redis chỉ cache/counter có thể mất khi restart. Worker local quét hết hạn theo cấu hình hiện hành; việc khởi động worker không phải bằng chứng uptime staging hoặc NFR T-31.

Chi tiết kiểm thử, giới hạn và xử lý lỗi: [LOCAL_USER_GUIDE](LOCAL_USER_GUIDE.md). Script không commit/push/deploy.

## Bằng chứng kiểm tra local — 04/10/2026

| Kiểm tra | Kết quả |
|---|---|
| Parser PowerShell | Không có lỗi cú pháp |
| `-NoBrowser` khi API/web có sẵn | Health `ok`, frontend HTTP 200, tạo worker riêng |
| Chạy lại `-NoBrowser` | Tái sử dụng worker, không tạo worker trùng |
| `-Action Stop` khi API/web có sẵn | Chỉ dừng worker thuộc script; API/web vẫn nghe cổng |
| Khởi động mới API/web/worker | Cả ba launcher được quản lý; health `ok`, frontend HTTP 200 |
| `-Build` khi app đang chạy | Từ chối với exit 1 như dự kiến, không build trên output đang dùng |
| Dừng cả ba dịch vụ do script tạo | Không còn listener 3000/3001, giữ nguyên container/dữ liệu |
| Khởi động lại sau khi dừng | Cả ba dịch vụ chạy; 9 migration được giữ nguyên, không có migration pending |

Không chạy lại install/build/seed trong lượt kiểm này: dùng build và fixture hiện có. Các nhánh tạo container mới và tự build khi thiếu output chưa được nghiệm thu trên máy sạch. Log khởi động nằm trong `.git/demo-local/`; không đưa log riêng hoặc mật khẩu lên Git.
