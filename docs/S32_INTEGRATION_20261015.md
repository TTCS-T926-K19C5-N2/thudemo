# S-32 — tích hợp ngày15/10/2026

PR #60, branch `task/orders-integration-ready`. Revision gốc `a471d5a6cd72ad9e33536df38418362e222d81d9`; main đồng bộ `f5b7293`. Không đổi Owner/Sprint/SP/AC.

## Hòa giải main

- Giữ creator S-16 có khóa và deadline gốc, reader S-32 owner-scoped/403/server pagination; giữ scheduler S-23.
- S-24: giữ payment retry/logging; reader trả `paymentAttempts` và `attemptNo` đã lưu bằng truy vấn bounded, không tải toàn bộ payment/log. Detail giữ thông báo giao dịch lỗi/đang chờ và hành động thanh toán lại.
- S-26/S-30/S-31/S-33: giữ module, API, migration và component SignedTickets hiện có. Đơn PAID vẫn xem QR, không dựng QR hoặc ticket riêng cho S-32. Route detail giữ key theo id và page lịch sử.
- CI S-32 bổ sung browser desktop/mobile với PostgreSQL/Redis thật ở job riêng; chạy cả truy cập chéo tài khoản, pagination, lifecycle session, states và mở mock payment. Các check hiện có giữ nguyên.

## Dọn tài liệu và evidence

Loại tên công cụ khỏi ghi chú bàn giao, chuẩn hóa đường dẫn runtime local thành placeholder và bỏ patch lặp lại trong evidence. Kết quả/assertion/timestamp cũ giữ nguyên; bản raw được bảo toàn ngoài repository. Không viết lại lịch sử commit hoặc đổi người đã code/review. Review GitHub cũ là review tự động, không được mô tả thành independent human approval.

## Kiểm chứng

Local: install frozen, Prisma generate, typecheck, lint và build PASS; unit **235 PASS (API181/web54)**. Lint giữ4baseline warnings.

Docker ban đầu chưa khởi động; sau khi engine sẵn sàng, tạo mới hai container chỉ dành cho S-32 ngày15/10 tại15432/16381, không dùng lại DB checkout đang chạy. Áp migration theo deploy, không reset/db push.

- API integration: **108/108 PASS**, gồm24 S-32,35 S-15/S-16,9 Orders/S-24/S-23 và4 check-in. S-24 attempt1 thất bại → retry attempt2 giữ nguyên order/holds, history reader trả đúng attempt metadata.
- Browser history: **33/33 PASS** tại1280×900 và390×844; payment continuation **2/2 PASS**, including retry button sau INITIATED và amount snapshot500k khi live price900k.
- Browser đầu32/33 vì QR503: môi trường mới thiếu khóa ký của dependency đã merge. Cấu hình keygen hiện có với private fixture ngoài repository và bổ sung tương tự vào jobCI; lượt sau console/runtime check PASS. Không đổi production key hoặc đưa private key vào Git.
- Snapshot trước/sau GET xác nhận không sửa order/hold/deadline. Query-shape proof vẫn6 SQL cố định cho page size1/10/50. Ảnh V1 mới trong evidence/s32/20261015/browser; snapshot08/10 giữ riêng.
- Browser plugin không khả dụng; dùng Playwright đã có trong dependency hiện tại, không cài/nâng stack để thay giao diện.

CI được cập nhật theo kết quả thực tế ở PR. Snapshot08/10 không thay bằng bằng chứng của revision mới.

Merge chỉ thực hiện khi revision PR đã được kiểm, không còn conflict và required checks PASS; không bypass protection. Staging/shared DB/deploy chưa thuộc bước này.
