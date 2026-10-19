# Đối chiếu Requirements_2.docx

- Thời điểm chạy: 08:41:16 19/10/2026
- API unit: ĐẠT
- Web unit: ĐẠT
- API e2e: ĐẠT (9 file, 69 test)
- Ý nghĩa trạng thái: “ĐẠT một phần” nghĩa là test hiện có liên quan đã chạy đạt; chưa khẳng định mọi AC/NFR của dòng đó.

| ID | Chức năng | Test hiện có | Trạng thái kiểm tra | Lý do / phần chưa chứng minh |
|---|---|---|---|---|
| S-05 | Nhập sơ đồ ghế | apps/api/src/showtimes/showtimes.service.spec.ts<br>apps/api/src/showtimes/seat-map.spec.ts | ĐẠT MỘT PHẦN | Chưa có e2e cho thay sơ đồ khi ghế đã bán/đang giữ, rollback trên DB và thời gian nhập 2.000 ghế dưới 5 giây. |
| S-06 | Chẩn đoán sơ đồ không hợp lệ | apps/api/src/showtimes/seat-map.spec.ts | ĐẠT MỘT PHẦN | Chưa kiểm tra đầy đủ tập lỗi tổng hợp, vị trí ký tự JSON lỗi, preview trước import và giới hạn 5 MB. |
| S-07 | Mở/đóng bán vé | apps/api/src/showtimes/showtimes.service.spec.ts<br>apps/api/test/events.e2e-spec.ts | ĐẠT MỘT PHẦN | Chưa xác minh toàn bộ luồng quyền organizer, audit log, đóng/mở lại và xử lý lượt giữ/đơn đang tồn tại bằng e2e. |
| S-08 | Danh mục và chi tiết sự kiện công khai | apps/api/test/events.e2e-spec.ts | ĐẠT MỘT PHẦN | Chưa tìm thấy unit test ánh xạ trực tiếp cho catalog công khai; chưa kiểm thử phân trang, trạng thái draft/closed, cache 30 giây hoặc p95 dưới 500 ms với 200 suất. |
| S-09 | Sơ đồ ghế công khai | apps/api/src/showtimes/showtimes.service.spec.ts<br>apps/api/src/modules/seats/queries/seat-status-query.service.spec.ts<br>apps/web/src/features/seat-selection/server-countdown.spec.ts<br>apps/api/test/seat-hold-api.e2e-spec.ts | ĐẠT MỘT PHẦN | E2E seat-hold-api là HTTP fixture nghiên cứu, không khởi tạo AppModule; chưa xác minh trực quan/mobile và ngưỡng 2.000 ghế dưới 2 giây trên browser. |
| S-10 | Giữ ghế 10 phút | apps/api/src/holds/holds.service.spec.ts<br>apps/api/src/modules/seats/seat-hold.service.spec.ts<br>apps/web/src/features/seat-selection/server-countdown.spec.ts<br>apps/api/test/seat-hold-api.e2e-spec.ts | ĐẠT MỘT PHẦN | E2E seat-hold-api là HTTP fixture nghiên cứu, không khởi tạo AppModule; chưa đo p95 API dưới 300 ms hoặc xác minh đồng hồ lệch giờ qua luồng chạy thật. |
| S-11 | Bỏ giữ ghế | apps/api/src/holds/holds.service.spec.ts<br>apps/api/src/modules/seats/seat-hold.service.spec.ts<br>apps/api/test/seat-hold-api.e2e-spec.ts | ĐẠT MỘT PHẦN | E2E seat-hold-api là HTTP fixture nghiên cứu, không khởi tạo AppModule; chưa xác minh quyền sở hữu và thời hạn giữ còn lại trên PostgreSQL/Redis của sản phẩm. |
| S-12 | Tự giải phóng ghế hết hạn | apps/api/src/modules/seats/jobs/seat-expiry-job.service.spec.ts<br>apps/api/src/holds/hold-expiry.scheduler.spec.ts | ĐẠT MỘT PHẦN | Test hiện có chủ yếu mock scheduler; chưa xác minh query ghế thực tế trước cleanup và bootstrap trên DB. |
| S-13 | Xử lý tranh chấp giữ ghế nguyên tử | apps/api/src/holds/holds.service.spec.ts<br>apps/api/src/prisma/hold-transaction.spec.ts<br>apps/api/test/s15-s16-acceptance.e2e-spec.ts | ĐẠT MỘT PHẦN | Chưa chạy kiểm tra đồng thời 200 yêu cầu/100 ghế và rollback lô 5 ghế với PostgreSQL cô lập. |
| S-14 | Khôi phục lượt giữ sau tải lại | apps/api/src/holds/holds.service.spec.ts<br>apps/web/src/features/seat-selection/server-countdown.spec.ts<br>apps/api/test/seat-hold-api.e2e-spec.ts | ĐẠT MỘT PHẦN | E2E seat-hold-api là HTTP fixture nghiên cứu, không khởi tạo AppModule; chưa kiểm tra tải lại/trình duyệt mới trên phiên đăng nhập và storage thật. |
| S-15 | Giá theo hạng ghế | apps/api/src/showtimes/showtimes.service.spec.ts<br>apps/api/test/s15-s16-acceptance.e2e-spec.ts | ĐẠT MỘT PHẦN | E2E trên DB cô lập đã kiểm tra giá hạng và snapshot đơn; chưa kiểm tra đầy đủ luồng UI inline và định dạng VND trên browser. |
| S-16 | Tạo đơn từ ghế đang giữ | apps/api/src/orders/orders.service.spec.ts<br>apps/api/test/s15-s16-acceptance.e2e-spec.ts | ĐẠT MỘT PHẦN | E2E API/DB đã đạt cho đơn từ hold và double-click; chưa xác minh browser, TTL khác cấu hình fixture hoặc hành trình người dùng sau khi ghế mất. |
| S-17 | Chi tiết đơn hàng | apps/api/src/orders/orders.service.spec.ts<br>apps/web/src/features/order-review/order-review.spec.ts<br>apps/api/test/orders.e2e-spec.ts | ĐẠT MỘT PHẦN | API e2e đã kiểm tra dữ liệu đơn và quyền sở hữu; chưa kiểm tra UI/countdown trên browser sau khi tải lại. |
| S-18 | Thanh toán sandbox | apps/api/src/payments/payments.service.spec.ts<br>apps/api/test/payments.e2e-spec.ts | ĐẠT MỘT PHẦN | E2E callback/webhook và PAID/SOLD/hold đạt trên test gateway/DB ephemeral; chưa xác minh tài khoản hoặc callback sandbox MoMo thật. |
| S-19 | Cổng thanh toán giả lập | apps/api/src/payments/mock-gateway.service.spec.ts<br>apps/api/src/payments/gateways/mock.gateway.spec.ts<br>apps/web/src/features/mock-gateway/mock-gateway.spec.ts<br>apps/api/test/mock-gateway.e2e-spec.ts | ĐẠT MỘT PHẦN | E2E giả lập đã đạt; chưa xác minh cổng khi khởi động deployment production và UI thao tác trực tiếp trên browser. |
| S-20 | Webhook lặp và đồng thời | apps/api/src/payments/payments.service.spec.ts<br>apps/api/test/payments-idempotency.e2e-spec.ts | ĐẠT MỘT PHẦN | E2E API/DB cho webhook lặp và đồng thời đã đạt; chưa xác minh trạng thái ở browser trong môi trường staging. |
| S-21 | Xác minh chữ ký webhook | apps/api/src/payments/payments.service.spec.ts<br>apps/api/test/payments-signature-verification.e2e-spec.ts | ĐẠT MỘT PHẦN | E2E endpoint với chữ ký hợp lệ/không hợp lệ, HTTP status và bất biến DB đã đạt bằng khóa test; chưa xác minh cấu hình khóa của môi trường triển khai. |
| S-22 | Trang kết quả thanh toán | apps/web/src/features/payment-result/payment-result.spec.ts<br>apps/api/test/orders.e2e-spec.ts | ĐẠT MỘT PHẦN | Test logic polling có, nhưng chưa kiểm tra trang chạy trên browser và trạng thái thật qua hết mốc 60 giây. |
| S-23 | Hết hạn đơn và giải phóng ghế | apps/api/src/orders/order-expiry.spec.ts<br>apps/api/src/payments/payments.service.spec.ts<br>apps/api/test/orders.e2e-spec.ts | ĐẠT MỘT PHẦN | E2E hết hạn và giải phóng ghế đã đạt; cuộc đua webhook/expiry mới được kiểm tra bằng unit mock, chưa chạy đồng thời trên DB thật. |
| S-24 | Thanh toán thất bại và thử lại | apps/api/src/payments/payments.service.spec.ts<br>apps/web/src/features/order-review/order-review.spec.ts<br>apps/api/test/orders.e2e-spec.ts | ĐẠT MỘT PHẦN | API e2e cho retry đã đạt; chưa kiểm tra trạng thái UI, countdown và lịch sử lần thử trực tiếp trên browser. |
| S-25 | Vé điện tử QR | apps/api/src/tickets/tickets.service.spec.ts<br>apps/web/src/features/tickets/ticket-qr.spec.ts<br>apps/api/test/tickets.e2e-spec.ts | ĐẠT MỘT PHẦN | E2E đã xác minh cấp QR theo ghế trả phí, quyền chủ sở hữu và verify/tamper; chưa xác minh UI vé và trường hợp đơn chưa thanh toán trên browser. |

## Giới hạn chung

- Unit test không thay thế kiểm thử UI trực tiếp, trạng thái bàn phím/focus, responsive, console/runtime và hành trình người dùng trên browser.
- Các NFR hiệu năng (2.000 ghế, 200 suất, 200 yêu cầu đồng thời, p95) cần benchmark riêng; không được suy ra từ test logic.
- E2E tạo/xóa fixture. Chỉ dùng với PostgreSQL cô lập `sprint2_integration` cổng 15432 và Redis cô lập cổng 16379; script từ chối chạy nếu URL không đúng.

## Cách chạy

```powershell
node scripts/verify-requirements-2.mjs
# E2E cần DB/Redis test cô lập; không dùng cổng 5432/6379 của app dev:
docker run --detach --rm --name req2-pg --env POSTGRES_USER=codex_test --env POSTGRES_PASSWORD=codex_test_only --env POSTGRES_DB=sprint2_integration --publish 127.0.0.1:15432:5432 --tmpfs /var/lib/postgresql/data:rw,size=1g postgres:15-alpine
docker run --detach --rm --name req2-redis --publish 127.0.0.1:16379:6379 redis:7-alpine
$env:DATABASE_URL = 'postgresql://codex_test:codex_test_only@127.0.0.1:15432/sprint2_integration?schema=public'
$env:REDIS_URL = 'redis://127.0.0.1:16379'
pnpm --filter api exec prisma migrate deploy
node scripts/verify-requirements-2.mjs --with-e2e
docker stop req2-pg req2-redis
```
