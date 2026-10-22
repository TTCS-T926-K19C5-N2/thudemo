# Kết quả triển khai sprint 4–8 — 22/10/2026

## Phạm vi và dữ liệu

Đối chiếu 31 story S-25–S-55, tổng 99 SP trong CSV đã gửi. Mục tiêu được chốt là đồ án chạy local/sandbox, thanh toán và hoàn tiền giả lập. Giao diện sự kiện, bộ 40 sự kiện, sơ đồ ghế và luồng đăng nhập/đăng ký được giữ trong dự án `D:\Merge_2\Codegym`.

Dữ liệu chính sau thay đổi: **40 sự kiện, 40 suất, 5.544 ghế, 8 người dùng**. Đã tạo backup trước triển khai; không reset, không seed thay dữ liệu. Các migration mới chỉ bổ sung cấu trúc và ràng buộc. Kiểm thử ghi dữ liệu dùng bản sao, không dùng tài khoản thật để thử huỷ/xoá.

## Các chức năng bổ sung và sửa

| Nhóm | Thực hiện |
|---|---|
| Vé và gửi thư | Outbox phát vé có QR, retry hữu hạn, gửi lại đúng vé; worker Gmail thật bật theo chấp thuận. SMTP verify thành công, 3 delivery SENT. |
| Soát vé offline | Giữ batch protocol, thời điểm quét gốc, ACK đúng localId/requestId. Không bỏ queue vì HTTP4xx. Lượt NORMAL/EXCEPTION được giữ để xử lý trùng hai cửa. |
| Phòng chờ và quota | Redis Lua FIFO, lease, chống vượt API trực tiếp; hạn chế theo tài khoản và IP có chứng thực transport; quota ghế kiểm tra nguyên tử trong DB với khóa người dùng. |
| Đồng bộ ghế | Snapshot công khai có revision được đẩy chung qua SSE; theo dõi TTL hết hạn. Không cache kho ghế, không buộc 2.000 client cùng gọi lại API lấy bản đồ. |
| Huỷ và hoàn | Huỷ toàn đơn trước giờ diễn ít nhất 24h, chưa soát, mock 100%; thu hồi vé và mở ghế trong transaction. Huỷ suất chạy theo lô, retry refund tối đa 3 lần, kế toán xử lý lỗi giả lập. |
| Nhật ký | Domain audit trong transaction, actor, trạng thái trước/sau; append-only, rollback không để lại thao tác thành công giả. Chủ đơn xem timeline. |
| Báo cáo | Doanh thu/hoàn/net/tồn theo hạng, vào cửa theo phút/cửa; chủ tổ chức được phân quyền; UI refresh15s. |
| Đối soát | CSV mock transactionId,amount; dry-run, bốn nhóm, chống trùng bản nhập, kiểm định dạng/kích thước/formula injection. |
| Quyền riêng tư | Lịch sử consent/version, rút tiếp thị, yêu cầu xoá và ADMIN duyệt; ẩn danh PII, thu hồi phiên và ngăn outbox gửi tới tài khoản đã xoá, giữ đơn và số tiền. Mục đích tiếp thị mặc định không được bật. |
| Giám sát | ADMIN xem request/error/p95/conflict/webhook và cảnh báo local trong ứng dụng. Exporter token trên loopback; không tự triển khai dịch vụ bên ngoài. |
| Backup | Công cụ AES-GCM, SHA256 manifest, retention, yêu cầu off-host UNC cho vận hành; script Task Scheduler và local restore drill đã có. |

Các điểm sửa quan trọng: bỏ kiểm quota dựa vào cache trước transaction; ngăn callback cũ chuyển đơn CANCELLED thành PAID; bảo vệ đường dẫn đặt vé tương đương hoa/slash/encoding; khôi phục việc chỉ xoá scan offline sau ACK đã commit.

## Bằng chứng

Xem [kịch bản chi tiết cho từng story](SPRINT_4_8_TEST_SCENARIOS_20261022.md) và [ma trận kiểm thử](SPRINT_4_8_TEST_MATRIX.md). Bằng chứng máy nằm trong `.cache/sprint4-8-evidence/20261022` và `.cache/local-booking`, không chứa trong Git. Không đồng nhất tổng unit với số AC đã nghiệm thu.

Đã đạt 419 API unit, 148 web unit, 102 E2E, 45 ca sprint4–5, 42 ca sprint6–8, 23 bài tooling (gồm 3 backup unit) và 4 ca restore drill. Typecheck, API build, web production build và lint đều thành công; lint còn cảnh báo hiện hữu. 2.000 kết nối SSE đều nhận/giải mã trạng thái ghế trong 2 giây (p95 1.593ms, lớn nhất 1.622ms). Đây là phép đo client HTTP/SSE, không chứng minh 2.000 trình duyệt đã render.

Đã kiểm tra giao diện đăng nhập, trang tài khoản, báo cáo desktop và viewport390px, thông báo riêng tư trên bản sao. Ảnh bằng chứng `operations-desktop.png` và `operations-mobile.png` trong thư mục evidence; không phát hiện lỗi console ở trang riêng tư. Đối soát CSV được nghiệm thu qua API; chưa ghi nhận PASS cho thao tác nhập ngày bằng automation trên trình duyệt.

Snapshot 5.000 vé được đo dưới 10 giây với mô hình 10Mbps/80ms; không coi là phép đo mạng 4G thật. Gmail SENT có nghĩa SMTP chấp nhận, không xác nhận Gmail Inbox của người mua.

## Phần cần nghiệm thu tiếp

- S-30/S-34/S-37: camera thật, ánh sáng ngoài trời, IndexedDB và offline trên nhiều điện thoại; tự động chỉ kiểm logic và hàng đợi.
- S-33/S-44: 4G thật và thời gian render/paint trên thiết bị thực.
- S-43: cảnh báo local đã có; nếu cần kênh ngoài ứng dụng phải cấu hình kênh vận hành cụ thể.
- S-55: chưa có đích off-host/UNC và khóa vận hành được giao nên **chưa đăng ký lịch backup thật**; local restore drill đã thành công. Chưa thể đánh dấu hoàn tất vận hành backup hằng ngày.
- S-54: ứng dụng giữ thông báo hiện hành. Nội dung/mục đích tiếp thị không được tự xem là đã phê duyệt cho production.

## Chạy và bàn giao

Web: `http://localhost:3000`; API health: `http://localhost:3001/health`. Người mua dùng Đơn hàng/Vé của tôi; STAFF dùng `/scanner`; ORGANIZER/ACCOUNTANT/ADMIN dùng `/operations` theo vai trò; `/account/privacy` dành cho yêu cầu riêng tư. Không cấp quyền nội bộ cho người mua.

Đọc [runbook local](LOCAL_DEMO_RUNBOOK.md). Chưa commit/push các thay đổi. Rollback cần khôi phục source và backup được kiểm soát; không dùng reset database hoặc seed để sửa lỗi.
