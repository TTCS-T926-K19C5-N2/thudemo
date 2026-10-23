# DEMO_ACCOUNTS — tài khoản giả local

Tài khoản chỉ nằm trong profile cô lập tại `D:\Merge_2\Codegym-demo-proof-20261023T1530\.sprint1-demo\config.json` (file bị Git ignore). File này chứa mật khẩu và thông tin riêng của profile; không gửi file hoặc dán nội dung vào chat/repo. Email đều thuộc miền `.demo.invalid`, không nhận email Internet. Không dùng mật khẩu tài khoản thật.

| Vai trò | Tài khoản giả trong private profile | Trạng thái gần nhất |
|---|---|---|
| ADMIN | `admin@…demo.invalid` | Login/current-role/route smoke R71; thao tác admin đầy đủ chưa verified |
| ORGANIZER A | `organizer-a@…demo.invalid` | Route smoke và một số thao tác event; map/publication matrix chưa hoàn tất |
| ORGANIZER B | `organizer-b@…demo.invalid` | Route smoke; có cross-owner denial proof riêng |
| BUYER | `buyer@…demo.invalid` | Route smoke; seat/hold browser flows có evidence |
| STAFF | `staff@…demo.invalid` | Route smoke; authenticated scan/override/offline UI chưa đủ evidence |
| ACCOUNTANT | `accountant@…demo.invalid` | Route smoke; mock refund slices có evidence |
| Lock-test | `lock-test@…demo.invalid` | Chỉ dùng test khóa đăng nhập; không khóa tài khoản đang trình diễn |

Để đọc credentials **chỉ trên máy local**, mở PowerShell tại profile root và chạy; output chỉ xuất hiện trong terminal đó:

```powershell
$c = Get-Content -LiteralPath .\.sprint1-demo\config.json -Raw | ConvertFrom-Json
$c.accounts | Select-Object name, roles, email, password | Format-Table -AutoSize
```

Có thể lọc một vai trò bằng `Where-Object { $_.roles -contains 'ADMIN' }`. Trường `roles` trong private config là nguồn sự thật. Không chụp/chia sẻ màn hình có mật khẩu.

Recipient transfer, BUYER-C và STAFF thứ hai không nằm trong danh sách bền hiện tại; tạo qua UI/luồng hợp lệ và xác minh Mailpit trước khi dùng. Không đổi role của account dùng lại giữa cảnh để thay thế quyền thực.

**Profile R79 hiện READY:** source hiện tại đã được build/restart; database demo và 7 account được giữ lại. Kiểm tra bằng `scripts/sprint1-demo.ps1 -Action Status` từ prepared profile root. Nếu thay source và cần build lại, launcher yêu cầu RAM trống ≥2 GiB. URLs khi READY: web `http://localhost:3000`; Mailpit `http://127.0.0.1:24931`. Mailpit còn thư cũ ngoài miền giả; không đưa trang catcher cho người xem demo trước khi owner quyết định retention. Password reset và transfer-email chưa được xác minh có thư nhận.
