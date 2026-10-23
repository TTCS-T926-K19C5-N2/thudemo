# Walkthrough demo Codegym — Kịch bản một lượt đủ vai trò

Profile đang hoạt động: `D:\Merge_2\Codegym-demo-proof-20261023T1530`.
- Web: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:3001](http://localhost:3001)
- Mailpit: [http://127.0.0.1:24931](http://127.0.0.1:24931)
- Lấy mật khẩu các tài khoản tại `.sprint1-demo/config.json`.

---

### Bước 1: Khách & BUYER — Mua vé & Xem vé
1. Mở trang chủ [http://localhost:3000](http://localhost:3000): Duyệt 40 sự kiện gốc, tìm kiếm, lọc theo địa điểm và sắp xếp theo giá vé.
2. Chọn một sự kiện (ví dụ: *Bệnh sĩ*), chọn suất diễn, chọn ghế trên sơ đồ.
3. Đăng nhập tài khoản BUYER (`buyer@...`) hoặc tạo đơn hàng, thanh toán qua mock payment gateway.
4. Mở menu tài khoản [http://localhost:3000/account](http://localhost:3000/account) → Bấm nút **"Vé của tôi"** để xem danh sách vé đã mua, thông tin ghế và mã QR vé.
5. Mở Mailpit [http://127.0.0.1:24931](http://127.0.0.1:24931) để thấy email xác nhận vé gửi tới hòm thư local.

---

### Bước 2: Chuyển nhượng vé (Transfer) — BUYER A sang BUYER B
1. Từ danh sách vé của BUYER A, thực hiện chuyển nhượng vé cho email người nhận BUYER B.
2. Đăng nhập bằng tài khoản BUYER B, mở `/account` → **"Vé của tôi"**:
   - Thấy vé đã được chuyển giao thành công với mã QR mới.
   - Vé cũ của BUYER A bị thu hồi mã QR cũ.
   - Đơn hàng và số tiền gốc của BUYER A không bị nhân đôi.
3. Mail notification gửi thông báo tới email của người nhận trong Mailpit catcher.

---

### Bước 3: STAFF — Soát vé & Offline Queue
1. Đăng nhập tài khoản STAFF (`staff@...`).
2. Mở `/account` → Bấm nút **"Soát vé"** (hoặc truy cập thẳng [http://localhost:3000/scanner](http://localhost:3000/scanner)).
3. Chọn suất diễn và cửa được phân công (Cửa demo). Tải snapshot vé về bộ nhớ trình duyệt.
4. Quét mã QR của vé hợp lệ: hệ thống báo **Hợp lệ (Admitted)**. Quét lại lần 2: báo **Trùng lặp (Duplicate)**.
5. Thử nghiệm ngắt kết nối mạng (hoặc offline mode): vé được đưa vào hàng đợi offline cục bộ; khi kết nối lại, hệ thống tự động đồng bộ lên máy chủ.

---

### Bước 4: ORGANIZER — Quản trị suất diễn & Xuất báo cáo
1. Đăng nhập tài khoản ORGANIZER (`organizer-a@...`).
2. Mở danh sách sự kiện [http://localhost:3000/events](http://localhost:3000/events): Quản lý sự kiện thuộc quyền sở hữu của mình (cách ly quyền với organizer-b).
3. Mở trang quản trị suất diễn `/showtimes/{id}/manage`:
   - Bấm nút **"Xuất điểm danh CSV"** để tải file CSV báo cáo điểm danh và xung đột điểm danh trực tiếp về máy.
   - Xem báo cáo tài chính và chuyển đổi ghế giữ.

---

### Bước 5: ADMIN — Quản trị hệ thống & Phân công
1. Đăng nhập tài khoản ADMIN (`admin@...`).
2. Mở [http://localhost:3000/admin/users](http://localhost:3000/admin/users): Quản lý danh sách nhân sự, phân công vai trò STAFF cho các cửa soát vé.
3. Mở [http://localhost:3000/operations](http://localhost:3000/operations): Theo dõi trạng thái hệ thống, hàng đợi email lỗi và các hoạt động vận hành.

---

### Bước 6: ACCOUNTANT — Hoàn tiền & Đối soát quyết toán
1. Đăng nhập tài khoản ACCOUNTANT (`accountant@...`).
2. Mở [http://localhost:3000/operations](http://localhost:3000/operations):
   - Xem hàng đợi hoàn tiền (`/api/operations/refunds`) và xử lý thủ công các khoản hoàn tiền lỗi/nghi vấn.
   - Xem lịch sử các đợt đối soát quyết toán (`/api/operations/reconciliation`).
