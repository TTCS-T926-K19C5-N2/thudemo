# Snapshot kiểm tra trước commit/push S-15/S-16

Ngày 06/10/2026, branch nguồn `feature/S-15-S-16-pricing-orders`; target được người dùng duyệt là `test`, chưa merge `main`. Người dùng yêu cầu báo lỗi trước khi sửa. Không thay source ứng dụng trong bước đóng gói/bàn giao này.

- Base tại lúc fetch: `main`, `test` và HEAD cùng `bae27719e0af98063eee96507a236f3bacc08fc7`.
- `pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd build`: PASS.
- `pnpm.cmd test`: 23/23 PASS.
- E2E trên DB cô lập `sprint2_integration` port 15432: 37/37 PASS, 6 file. JSON lượt chạy reporter cuối ở `e2e-results.json`, performance ở `integration-performance.json`.
- GET local API `/health`: 200, status=ok.
- `node --check scripts/testing/order-response-fault-proxy.mjs`: PASS.
- `git diff --check`: PASS, chỉ cảnh báo LF/CRLF; `.env`, `apps/api/.env`, `apps/web/.env.local` đều ignored và không nằm trong commit dự kiến.
- Kiểm browser trước đó: con trỏ chuột, giữ/tạo đơn, nhánh mất ghế, deadline và mất phản hồi sau commit server đều PASS; chi tiết ở `../fixed/verification.md` và `../fixed/browser-final-results.json`.

Lưu ý trong bước kiểm bằng chứng: lần E2E mặc định PASS nhưng không xuất file JSON; thao tác đọc đường dẫn JSON vì vậy báo không có file. Đã báo người dùng trước khi chạy lại với reporter JSON, không đổi code/kỳ vọng test. Cảnh báo Vite/tsconfig-paths không làm gate thất bại; không chỉnh toolchain ngoài hai task.

Snapshot này được ghi trước commit/push nên không xác nhận CI GitHub đã xanh hoặc remote đã cập nhật. Trạng thái commit, push và CI phải đối chiếu Git/GitHub. Các báo cáo review cũ có câu “chưa commit/push” mô tả thời điểm ghi báo cáo, không phải bằng chứng trạng thái Git hiện tại.

Kết nối GitHub connector trả quyền chỉ đọc cho danh tính của connector. Git trên máy đã fetch và push dry-run thành công; chỉ dùng thông tin đăng nhập Git đã cấu hình, không đổi tài khoản/quyền, không force push hoặc sửa main.
