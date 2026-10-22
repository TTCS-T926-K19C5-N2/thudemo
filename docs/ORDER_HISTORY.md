# Lịch sử đơn hàng S32

Người mua mở **Tài khoản → Đơn hàng của tôi** hoặc `/orders?page=1`. Danh sách hiển thị mới nhất trước, gồm trạng thái, sự kiện/suất diễn, số ghế và tổng tiền đã ghi nhận khi đặt. Trang chi tiết giữ giao diện V1, hành động thanh toán và vé hiện có; liên kết quay lại giữ số trang. Đơn đã hủy/hết hạn vẫn được tra cứu và không có nút thanh toán.

`GET /orders/me?page=1&pageSize=10` lấy chủ đơn từ session, không nhận owner từ query. Mặc định10, tối đa50 đơn/trang; sắp xếp `createdAt DESC, id DESC` để ổn định khi trùng thời điểm. Count và trang đọc trong transaction RepeatableRead; đây là phân trang theo số trang, không phải snapshot giữ nguyên xuyên nhiều request khi đơn mới được tạo. Truy vấn SQL có LIMIT/OFFSET và số lượt đọc cố định theo kích thước trang.

Route `/orders/me` được khai báo trước `/:id`. Detail/status kiểm quyền trước khi đọc nội dung; đơn của người khác trả403 theo S32AC02, UUID không tồn tại404, UUID sai định dạng400, không có phiên401. Các GET trả `Cache-Control: private, no-store` và `Vary: Cookie`. GET không đổi status/hold: trạng thái hết hạn được tính theo đồng hồ PostgreSQL, job chịu trách nhiệm chuyển trạng thái lưu trữ. Giữ nguyên deadline gốc đã sửa ở MIP006 và snapshot giá; không dùng giá hạng hiện tại để ghi lại đơn.

Danh sách riêng tư không lưu vào localStorage/shared cache. Reader hủy request cũ khi thay trang, tải lại khi phiên/focus/network thay đổi và dọn listener/timer khi unmount. Đăng xuất tải document mới và phát tín hiệu thay phiên cho các tab. Login chỉ tiếp tục các URL nội bộ được allowlist; vẫn giữ URL tạo/quản trị sự kiện hiện hành và quy tắc STAFF vào check-in.

Nguồn tái sử dụng: semantic history implementation trên main `81d1dd9d8f453b32ed0c6956399e5600f71a32d6`. Không gộp main, không lấy thay đổi payment/ticket/scanner không liên quan. UI V1 dùng PublicLayout, Button, Alert, Table, Skeleton, Badge có sẵn; không thêm thư viện/component primitive.

Kiểm thử riêng: `order-history.e2e-spec.ts`, `order-pagination.spec.ts`, web `order-history.spec.ts`, hồi quy orders/S15-S16 và browser history→detail→quay lại→reload. Fixture chỉ chấp nhận PostgreSQL loopback `sprint2_integration` port15432(CI) hoặc15449(profile riêng), `S32_ISOLATED_TEST=true`, worker off. Cleanup theo UUID fixture; không dùng staging cho suite cleanup. `S32_EVIDENCE_DIR` tùy chọn nhận SQL tham số hóa, không ghi giá trị bind/cookie.

Nghiệm thu staging và gate DoD vẫn cần evidence đúng SHA tích hợp; test local hoặc dữ liệu giả không chứng minh provider/thiết bị/production.
