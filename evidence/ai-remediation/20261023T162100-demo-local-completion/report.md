# Báo cáo bàn giao demo Codegym — R79

**Kết luận: DEMO_PARTIAL.** Bản local đã hoạt động sau build/restart mới; chưa đủ bằng chứng để gọi DEMO_READY. Không commit, push, merge hay deploy. Dirty tree có sẵn được giữ nguyên.

## 1. Phạm vi và source

- Repository: `D:\Merge_2\Codegym`; branch `feature/sprint-4-8-complete`; HEAD `ce777bd13e472c089eef4a3c1ed4455e501ae3ba`.
- Profile: `D:\Merge_2\Codegym-demo-proof-20261023T1530`; prepared state fingerprint khớp tree đã chạy. Fingerprint parity độc lập xác nhận 793 file source/asset được chọn có cùng nội dung giữa canonical và prepared; prepared chỉ có thêm hai file build-generated (`tsbuildinfo`, `next-env.d.ts`). Không có source/asset content mismatch. API/Web đã build từ tree này, không dựa vào bundle runtime cũ.
- R79 đọc plan/checkpoint, giữ nguyên yêu cầu gốc và quyết định D01, D02, D04, D12, D16, D17; không thay expected để làm xanh.
- Không chạy DB chính, không reset/restore/seed lại profile bền, không gọi provider tính phí hoặc email Internet.

## 2. Thay đổi và kiểm tra sau thay đổi

R78 phát hiện scheduler reminder/reschedule chỉ chọn ticket có order PAID. Vé chuyển chủ hợp lệ có `orderId=null`, nên bị bỏ qua. Sửa hai sweep để chọn thêm vé có audit `ISSUED_FROM_TRANSFER`, gửi đến email của chủ vé hiện tại trước khi xét email của order. Không tạo order/payment giả và không mở quyền xem order của người gửi. Scheduler spec 1 file/8 test PASS; API typecheck và focused oxlint exit 0. Chi tiết: [bug register](bugs.md), [R78 logs](r78-transferred-ticket-reminders.log).

Để bảo vệ DB demo, R79 sửa launcher: profile đã đạt READY sẽ không chạy lại user/catalog seed hoặc tạo suất fixture khi restart. Chạy official Restart đã build source, gọi migration deploy (43 migrations, không có pending migration), bỏ qua reseed/fixture, chạy health/smoke và trả READY. DB oracle chỉ đọc sau restart: 40 events, 44 showtimes, 5 PAID orders, 5 tickets, 5.904 seats, 0 hold còn hạn. Profile/status: [r79-runtime-check.json](r79-runtime-check.json), [oracle](r79-demo-db-oracle.json), [launcher status](r79-demo-status.log).

## 3. Coverage và kết quả

| Tập kết quả | Số ca | PASS | NOT_RUN | BLOCKED | NEEDS_DECISION | MISSING |
|---|---:|---:|---:|---:|---:|---:|
| Source inventory | 500 | 162 | 327 | 5 | 5 | 1 |
| Supplemental/demo | 23 | 20 | 0 | 3 | 0 | 0 |
| **Tổng** | **523** | **182** | **327** | **8** | **5** | **1** |

`FAIL=0` là không có ca nào mang nhãn FAIL trong bộ kết quả hiện tại; không có nghĩa mọi chức năng PASS. Có **90 assertion Ready/Must chưa PASS**. `NOT_RUN` vẫn bao gồm các chức năng nguồn bắt buộc chưa được kiểm; external-only không bị nâng thành PASS.

Coverage theo tier gốc: Ready 68 PASS/100 NOT_RUN/2 BLOCKED/1 NEEDS_DECISION; Next 28/42/1; Later 37/39/1 BLOCKED/4 NEEDS_DECISION/1 MISSING. Later vẫn được giữ trong inventory, không tự thành release gate. Theo priority: Must 74 PASS/118 NOT_RUN/3 BLOCKED/1 NEEDS_DECISION; Should 27/57/1 BLOCKED/2 NEEDS_DECISION; Could 32/7/2 NEEDS_DECISION/1 MISSING. Các nhóm còn mỏng nhất gồm Thanh toán (11 PASS, 57 NOT_RUN), Sơ đồ & giá (4 PASS, 38 NOT_RUN), Giữ ghế (8 PASS, 39 NOT_RUN, 2 BLOCKED), Quản trị (4 NOT_RUN), Soát vé (6 PASS, 10 NOT_RUN), Báo cáo/dữ liệu (8 NOT_RUN) và Riêng tư (4 NOT_RUN). Chi tiết theo case giữ nguyên tại [results.json](results.json), kèm [counts](r79-result-counts.json).

## 4. Chức năng, vai trò và giao diện

Tài khoản 7 mẫu cho ADMIN, ORGANIZER-A/B, BUYER, STAFF, ACCOUNTANT và lock-test nằm trong private ignored `profile/.sprint1-demo/config.json`; cách lấy cục bộ tại [DEMO_ACCOUNTS.md](../../../DEMO_ACCOUNTS.md). Ma trận role hiện có 33 mục ở [demo-role-feature-matrix.json](../../../demo-role-feature-matrix.json); walkthrough đủ 8 cảnh ở [DEMO_WALKTHROUGH.md](../../../DEMO_WALKTHROUGH.md). `VERIFIED_DEMO` chỉ gắn cho lát cắt có evidence; nhiều hành động vai trò vẫn `IMPLEMENTED_NOT_VERIFIED`.

R79 browser desktop ghi nhận catalog 43 chương trình, trang đầu tải 12 kết quả; trang Bệnh sĩ có suất mô phỏng 07/12/2026 và ba hạng giá; mở đường dẫn ghế khi chưa đăng nhập chuyển đến login với `returnTo` đúng. Evidence chi tiết: [browser observation](r79-public-catalog-browser.json). Đây không phải proof đặt/giữ ghế, thanh toán hay mobile. Lịch và ảnh catalog lấy từ nội dung demo hiện hành; không thay bằng bộ mẫu mới.

## 5. Transfer, email và giới hạn môi trường

- `S-57-AC01` và assertion hẹp `INT-16.03` còn PASS từ browser desktop/mobile + DB oracle đã lưu: replacement ticket/QR thuộc người nhận, QR cũ bị vô hiệu, order sender riêng, amount/OrderItem không nhân đôi, audit và outbox có.
- `INT-16.01` composite vẫn NOT_RUN vì chưa có receipt email. `INT-16.04` được chuyển từ BLOCKED sang NOT_RUN: profile đã READY, nhưng R79 chưa thực hiện dispatch của ticket chuyển và catcher không có thư transfer/reminder. `INT-16.02` vẫn NOT_RUN cho reschedule/cancel/erasure/scanner.
- R78 sửa filter scheduler nhưng chỉ được unit-test; không tuyên bố email nhận/SENT. SMTP catcher, không phải Internet Inbox. Payment/refund chỉ mock; provider thật/staging/camera/4G/backup off-host là external-only.
- Mailpit hiện lưu 8 thư cũ; 3 thư có recipient domain ngoài miền `.invalid`. R79 chỉ kiểm metadata aggregate, không đọc body/địa chỉ, không xóa hay xuất thư. Không mở catcher khi trình diễn cho người khác trước khi owner quyết retention.

## 6. Full regression và clean-package proof

Full API/Web/deploy regression gần nhất là R70/R71 trước R78. Sau R78 chỉ chạy suite liên quan, typecheck, lint và build profile. RAM trống sau build còn 0,74GiB; không chạy full regression tiếp để tránh làm ngừng demo. Clean package proof từ đúng tập file dirty/untracked hiện tại chưa chạy. Vì vậy chưa xác minh clone sạch có đủ source/assets/dataset/lockfile và tái lập đủ 5 vai trò.

## 7. Chạy lại và bàn giao

Mở `http://localhost:3000`; API `http://localhost:3001`; Mailpit `http://127.0.0.1:24931`. Dùng launcher ở profile root để `Status`, `Start`, `Stop` hoặc `Restart`; Start/Restart giữ volume. Credentials chỉ đọc từ private ignored config, không chép vào repo/chat. Không dùng `down -v`, seed thủ công hoặc reset.

Kết luận có giới hạn: local demo đang chạy và có catalog/suất mô phỏng; một số lát cắt nghiệp vụ đã được kiểm local. Chưa chứng minh toàn bộ giao diện/logic/workflow, không có clean-clone proof/full regression hiện hành, và còn blocker email-retention. Bàn giao hiện tại là **DEMO_PARTIAL**, không phải DEMO_READY hoặc nghiệm thu production.
