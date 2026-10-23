# Bàn giao demo Codegym — Hoàn thiện chức năng & Sẵn sàng sử dụng

## 1. Địa chỉ truy cập & Cách lấy tài khoản

- **Web Frontend:** [http://localhost:3000](http://localhost:3000)
- **API Backend Health:** [http://localhost:3001/health](http://localhost:3001/health) (proxy qua web: [http://localhost:3000/api/health](http://localhost:3000/api/health))
- **Mail Catcher (Mailpit Local):** [http://127.0.0.1:24931](http://127.0.0.1:24931) (SMTP port 24930)
- **Profile đang chạy:** `D:\Merge_2\Codegym-demo-proof-20261023T1530`
- **Tài khoản đăng nhập demo:** Lấy từ file private `.sprint1-demo/config.json` (hoặc [DEMO_ACCOUNTS.md](DEMO_ACCOUNTS.md)).
  - **ADMIN:** `admin@s1demo-384da3d43b41.demo.invalid`
  - **ORGANIZER:** `organizer-a@s1demo-384da3d43b41.demo.invalid`
  - **BUYER:** `buyer@s1demo-384da3d43b41.demo.invalid`
  - **STAFF:** `staff@s1demo-384da3d43b41.demo.invalid`
  - **ACCOUNTANT:** `accountant@s1demo-384da3d43b41.demo.invalid`
  *(Mật khẩu bảo mật sinh tự động theo từng profile được lưu tại `.sprint1-demo/config.json`).*

## 2. Cách khởi động, dừng và kiểm tra dịch vụ

- **Kiểm tra trạng thái:** `node scripts/sprint1-onboarding.mjs Status`
- **Khởi động lại (giữ nguyên dữ liệu):** `node scripts/sprint1-onboarding.mjs Restart --skip-build`
- **Dừng dịch vụ (bảo toàn DB/Volume):** `node scripts/sprint1-onboarding.mjs Stop`
- **Kiểm tra nhanh một lượt:** `node scripts/quick-smoke.mjs`
*(Lưu ý: Không chạy `docker compose down -v`, không xóa volume để bảo vệ dữ liệu demo bền vững).*

## 3. Các chức năng đã nối và hoạt động tốt

1. **Email & Workers:**
   - Đã cấu hình và bật đầy đủ các worker trong runtime: `NOTIFICATION_MAIL_WORKER`, `WAITLIST_MAIL_WORKER`, `PASSWORD_RESET_WORKER`, `TICKET_MAIL_WORKER`, `LIFECYCLE_WORKER`.
   - Mail transport trỏ trực tiếp Mailpit local. Tránh chạy hai scheduler gửi kép; `CoreWorker` đảm nhiệm gửi thông báo chính thức.
2. **Sở hữu vé sau Transfer:**
   - Vé chuyển nhượng (`orderId = null`) được truy vấn nguồn gốc qua bảng log `ticket_logs` (`ISSUED_FROM_TRANSFER`) và `t.ownerEmail`.
   - Người nhận thấy vé mới trong danh sách vé của mình kèm mã QR hợp lệ (`issueQr`); QR cũ bị thu hồi; order và tổng tiền của người gửi không bị nhân đôi.
3. **Expiry Scheduler:**
   - Kích hoạt `HOLD_EXPIRY_MODE=api` và `ORDER_EXPIRY_MODE=api` để tự động giải phóng ghế giữ hết hạn (TTL) và hủy đơn hàng quá thời hạn thanh toán.
4. **Giao diện & Điều hướng các vai trò:**
   - **Khách / BUYER:** Xem catalog 40 sự kiện, tìm kiếm, lọc, chọn ghế, hold ghế, tạo order, thanh toán mock, xem vé tại `/account` với nút bấm trực tiếp "Vé của tôi" (`/account/tickets`).
   - **ADMIN:** Đăng nhập, mở `/admin/users`, quản lý tài khoản nội bộ và phân công vai trò.
   - **ORGANIZER:** Quản lý sự kiện, xem suất diễn, bấm nút tải trực tiếp "Xuất điểm danh CSV" tại `/showtimes/:id/manage` (endpoint `/api/showtimes/:id/attendance-conflicts.csv`).
   - **STAFF:** Đăng nhập, nút "Soát vé" tại `/account` dẫn thẳng tới `/scanner`, tải snapshot vé và thực hiện quét vé.
   - **ACCOUNTANT:** Truy cập `/operations`, xem danh sách hoàn tiền lỗi cần xử lý thủ công và lịch sử đối soát quyết toán (`/api/operations/reconciliation`).
5. **Dữ liệu demo bền vững:**
   - Toàn bộ 40 sự kiện, 44 suất diễn, 5 đơn PAID, 5 vé đã phát hành và 5.904 trạng thái ghế được bảo toàn nguyên vẹn sau khi restart.

## 4. Phạm vi ngoài môi trường demo local

- Cổng thanh toán thật (VNPAY/Momo thật), gửi thư Internet Inbox thực tế (dùng Mailpit local catcher thay thế).
- Thiết bị camera quét 4G ngoài hiện trường (STAFF sử dụng giao diện web scanner local).
- Backup off-host và hạ tầng production/staging.

## 5. Tài liệu đính kèm
- Kịch bản thao tác từng vai trò: [DEMO_WALKTHROUGH.md](DEMO_WALKTHROUGH.md)
- Ma trận tính năng theo vai trò: [demo-role-feature-matrix.json](demo-role-feature-matrix.json)
