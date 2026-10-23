# Kiểm tra tài khoản soát vé — 20/10/2026

Ứng dụng: `D:\Merge_2\Codegym`, web cổng 3000/API cổng 3001. Tài khoản local: `soatve@codegym.local`, vai trò STAFF.

## Kết quả

| Nhóm | Qua | Lỗi |
|---|---:|---:|
| Kịch bản HTTP thực tế trên database bản sao | 28 | 0 |
| Unit test API scanner/check-in/crypto/attendance | 29 | 10 |
| Unit test giao diện, yêu cầu quét, phản hồi và trạng thái mạng | 27 | 0 |
| Unit test offline-scanner và offline-sync | 10 | 16 |

Không kết luận toàn bộ chức năng đã đạt. Các API nghiệp vụ đã được kiểm tra trực tiếp; bộ regression cũ và việc chuẩn bị giao diện ngoại tuyến còn vấn đề.

## 28 kịch bản API đã qua

- Đăng nhập STAFF, nhận diện phiên, từ chối chưa đăng nhập và tài khoản BUYER.
- Chưa được phân công: danh sách suất rỗng, từ chối tải vé của suất khác.
- Sau khi phân công trong database kiểm tra: thấy đúng suất/cửa, có suất trong bộ chọn hôm nay, không có quyền override.
- Tải danh sách đầy đủ có khóa xác minh QR và không có email người mua; tải phần thay đổi sau check-in.
- Từ chối QR giả, danh tính nhân viên do client giả mạo và cửa không được phân công.
- Vé đã thanh toán được vào cửa; retry cùng request không tạo lần vào thứ hai; quét lại bằng request mới bị từ chối.
- STAFF thường không thể cho vào theo ngoại lệ hoặc xem báo cáo xung đột dành cho ban tổ chức.
- Thống kê lượt vào tăng sau check-in.
- Đồng bộ lượt quét offline trả ACK đã commit, gửi lại không tạo lần vào trùng, thay nội dung với cùng scan ID bị từ chối, lượt offline trùng vé đã vào online được ghi nhận xung đột.
- Hai lượt quét đồng thời chỉ một lượt được nhận; vé hủy bị từ chối.
- Thu hồi quyền cửa chặn quét và tải danh sách; đăng xuất vô hiệu hóa phiên.

Database kiểm tra được phục hồi từ backup local và xóa sau khi chạy. Việc đặt vé, thanh toán giả lập, đổi ngày suất, phân công cửa và check-in chỉ diễn ra trong bản sao. Không đổi lịch 40 sự kiện, phân công hoặc trạng thái vé của database chính. Đã kiểm tra không còn database `codegym_verify_*`.

## Vấn đề còn tồn tại

1. **Tài khoản hiện tại chưa có phân công suất/cửa.** Đã kiểm tra đăng nhập trực tiếp thành công; `/scanner/showtimes` và `/check-in/today` đều trả danh sách rỗng. Vì vậy nút bật camera/nhập QR trên trang hiện tại bị khóa đúng theo quyền. Việc phân công và đổi ngày chỉ được tạo trong bản sao để kiểm tra, không cấp quyền rộng hơn cho tài khoản thật.
2. **Giao diện báo chưa chuẩn bị được chế độ ngoại tuyến.** Đã quan sát trực tiếp tại `/scanner`. File service worker, trang shell và 17 tài nguyên Next đều trả HTTP 200. Chưa xác định nguyên nhân chuẩn bị service worker thất bại trong trình duyệt này; chưa nghiệm thu mở lại trang và quét khi mất mạng hoàn toàn.
3. **10 test API cũ bị lệch cấu trúc.** `scanner.service.spec.ts` còn gọi `getShowtimeTickets`/`syncOfflineScans` trên ScannerService dù chức năng đã chuyển sang ScannerSnapshotService/OfflineAdmissionsService; `scanner.controller.spec.ts` thiếu hai dependency mới; một test check-in gọi controller mà không truyền request có user.
4. **16 test web offline còn lỗi.** Fixture quét thiếu cấu hình cửa/nhân viên/thiết bị hiện bắt buộc; fixture đồng bộ còn dùng hợp đồng cũ, chưa đáp ứng phiên STAFF, QR đã ký và ACK v2. Không thay đổi test để tạo kết quả đạt giả.
5. **Chưa kiểm tra camera vật lý.** Chưa xin quyền camera hoặc dùng camera của máy. Xác minh chữ ký QR và nhập payload qua API đã qua; khả năng nhận diện ảnh qua camera chưa được xác nhận.

## Bằng chứng local

- `.cache/verify-staff-scanner.mjs`: kịch bản tích hợp chạy trên bản sao và tự dọn database.
- `.cache/local-booking/staff-verification.json`: kết quả từng kịch bản.
- `.cache/local-booking/verify-staff-api.log`: log API bản sao.
- `.cache/local-booking/current-staff-status.json`: kết quả đăng nhập và số phân công của tài khoản hiện tại, không chứa mật khẩu/token.
- `.cache/local-booking/offline-unit.log`: lỗi bộ test web offline.

Không commit hoặc push; không sửa mã nghiệp vụ hay quyền của tài khoản thật trong đợt kiểm tra này.
