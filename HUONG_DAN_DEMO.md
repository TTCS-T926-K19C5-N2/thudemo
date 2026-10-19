# Kịch bản demo Sprint4–5 (5–10 phút)

Khởi động theo README từ **develop**. Web mặc định http://localhost:3488; Mailpit http://localhost:8138. Mật khẩu chung ban đầu là `DEMO_PASSWORD` do bạn đặt trong `.env`, không có password thật trong Git.

| Vai trò | Email demo | Điểm vào |
|---|---|---|
| BuyerA | buyera@demo.invalid | /orders, /account/tickets |
| BuyerB | buyerb@demo.invalid | /orders (ban đầu trống, kiểm ownership) |
| Organizer | organizer@demo.invalid | báo cáo /scanner/reports/<showtimeId> |
| Admin | admin@demo.invalid | /admin/users |
| Staff cửa A (có quyền ngoại lệ) | staffa@demo.invalid | /scanner |
| Staff cửa B | staffb@demo.invalid | /scanner |

Mỗi vai trò dùng browser profile/incognito riêng. Hai cửa cần **hai profile thiết bị riêng**, không chỉ hai tab dùng chung IndexedDB. Ngày diễn lấy hôm nay tại lần seed đầu hoặc `DEMO_DATE`. Tên sự kiện `Demo Sprint4-5 <ngày> #<batch>`. Có55vé hôm nay,3vé ngày mai; mỗi suất có1vé đã dùng,1vé hủy. Các đơn PAID là fixture giả, không chứng minh thanh toán thật/refund.

1. **BuyerA**: lịch sử đơn → đơn PAID → chọn vé/QR. Mở Vé của tôi, tải ảnh QR512px, gửi lại vé. Mở Mailpit và chọn thư mới, xem đủ ảnh QR (worker SMTP thực trong Compose). BuyerB không lấy được vé BuyerA. Lưu payload để dự phòng nhập tay: mở DevTools Network GET `/api/orders/<id>/tickets`, lấy `qrPayload` của vé VALID; không lấy code UUID thay ET1. Chỉ dùng dữ liệu demo.
2. **StaffA**: đăng nhập → suất hôm nay → tải cửa được phân công → chọn Cửa A → bật camera và cấp quyền, hoặc nhập ET1 làm fallback. Quét vé chưa dùng → xanh; quét lại → từ chối kèm cửa/thời điểm. Thử mã lạ, vé ngày mai và vé hủy (QR cũ trước khi hủy dùng fixture kiểm riêng; UI cố ý không cấp QR vé hủy). Với vé đã dùng, mở “Cho vào có ghi chú”, nhập lý do và xác nhận chủ vé; lịch sử thường vẫn được giữ.
3. **Offline**: /scanner/snapshot → chọn đúng suất → tải danh sách. Quay máy quét, ngắt mạng bằng DevTools Offline (chỉ ngắt browser, không tắt Docker). Quét vé mới → counter tăng; quét lại cùng máy bị từ chối. Đóng/mở lại **cùng profile** khi offline: shell và queue còn. Nối mạng → tự sync/counter0. Không xóa site data/incognito profile trước khi sync.
4. **Hai cửa**: StaffA/B trên hai profile tải cùng snapshot trước khi mất mạng. Quét cùng vé VALID ởB trước rồiA; nối mạngA trước,B sau. Organizer mở `/scanner/reports/<showtimeId>`: lượt sớm hơn theo giờ thiết bị thắng, lượt kia là xung đột, đủ hai cửa/thời điểm/độ lệch đồng hồ. Không hứa ngăn trùng tức thì khi hai máy hoàn toàn offline. Lấy showtimeId từ chọn suất/API hoặc URL snapshot.
5. **Admin**: /admin/users tạo staff giả mới, gán suất/cửa, đổi role khi session còn đăng nhập, kiểm request kế tiếp; disable và kiểm session cũ bị từ chối. Đừng disable6tài khoản chuẩn trước phần trình diễn còn lại.

Muốn thêm vé không phá dữ liệu: đổi `DEMO_BATCH` sang giá trị mới rồi chạy lại một lệnh README. Chuẩn bị ngày mai: đặt DEMO_DATE theo ngày diễn; không sửa giờ hệ thống. Muốn xem manifest fixture (không có password/key): `docker compose --env-file .env -f compose.demo.yml exec api cat /demo-state/fixture.json`.

Lỗi thường gặp: port bận → đổi WEB_PORT/PUBLIC_URL và MAIL_UI_PORT; migration lỗi → xem logs prepare, không reset DB; init báo password khác → dùng lại .env gốc; không có suất hôm nay → ngày seed/batch sai; camera không bật → kiểm HTTPS/localhost và quyền camera; QR không hợp lệ → nhập toàn bộ ET1, đúng suất, không dùng UUID hoặc QR legacy; offline không tải shell → mở scanner online trước, chờ sẵn sàng offline và tải snapshot. Mailpit receipt là email trong catcher, không delivery Internet. Không cấp secrets cho frontend hoặc chụp credentials vào slide.
