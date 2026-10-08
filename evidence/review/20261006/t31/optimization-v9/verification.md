# Optimization-v9: connection reuse across request lifecycle and fast-path conflict dispatch

06/10/2026, branch `test`.

## 1. Phân tích điểm nghẽn (Bottlenecks Identified)

Từ kết quả profiling và phân tích luồng xử lý:
1. **Hai lần acquire pool connection riêng biệt cho mỗi request:**
   - Mỗi HTTP request đến `POST /showtimes/:id/holds` đều phải qua `SessionAuthGuard` (gọi `sessionQuery`) và sau đó qua `HoldsService.claim` (gọi `commitHoldRoutine`).
   - Cả hai thao tác đều gọi `pool.connect()` độc lập vào pool có kích thước `max: 4` per instance.
   - Khi có 100 request đồng thời đến mỗi instance, mỗi request phải xếp hàng chờ acquire connection 2 lần riêng biệt (tổng cộng 200 lượt acquire). Thời gian chờ hàng đợi (`pool-acquire`) chiếm từ 70ms đến 150ms trên mỗi request.
2. **Khởi tạo và tính toán SHA-256 lặp lại:**
   - `SessionAuthGuard` băm `token` bằng `hashSessionToken(token)` để query database.
   - `HoldsController.claim` và `current` lại gọi `hashSessionToken(req.sessionToken)` thêm một lần nữa, gây lãng phí CPU trên Event Loop.
3. **Overhead tuần tự hóa JSON stringify/parse khi xử lý kết quả xung đột ghế:**
   - Khi `claim_hold_v3` trả về `failure: 'H0004'`, code cũ bọc lại vào `throw { code: result.failure, detail: JSON.stringify(result.rejectedSeatIds) }`, sau đó catch lại và `JSON.parse(caught.detail)`.
4. **Ghi log cảnh báo đồng bộ làm block Event Loop:**
   - Khi 100/200 request bị conflict (409 `SEAT_CONFLICT`), `this.logger.warn` ghi đồng bộ ra file log `api-1.log` / `api-2.log` trên main thread, gây stall Event Loop khi tải cao.

## 2. Giải pháp tối ưu đã thực hiện

1. **Lifecycle Connection Reuse:**
   - Trong `SessionAuthGuard`, kết nối từ pool được giữ và gán vào `request.holdClient`.
   - `claim` tái sử dụng trực tiếp kết nối này qua `limits.client` trong `holdTransaction`, loại bỏ hoàn toàn lần acquire thứ hai.
   - Kết nối được bọc `release` an toàn (idempotent), trả ngay về pool ngay khi `holdTransaction` hoàn thành (hoặc khi response finish/close nếu có lỗi trước đó).
   - Các route khác (như GET) không giữ client để tránh cạn kiệt pool.
2. **Tái sử dụng precomputed session hash:**
   - `request.sessionHash` được lưu từ guard và truyền thẳng vào `HoldsService`.
3. **Direct exception mapping:**
   - Bỏ bước `JSON.stringify` / `JSON.parse` trung gian trong `HoldsService.claim`. Ánh xạ trực tiếp `result.failure` sang Exception tương ứng.
4. **Loại bỏ log warn trên luồng xung đột ghế thông thường:**
   - Không ghi log synchronous warn đối với lỗi nghiệp vụ xung đột ghế dự kiến (`SEAT_CONFLICT`), tránh tắc nghẽn I/O trên main thread.

## 3. Kết quả kiểm thử trên nhánh `test`

- **Unit tests:** 83/83 passed (66 API + 17 Web).
- **E2E tests:** 53/53 passed across all 6 test suites (`pnpm --filter api test:e2e`).
- **Typecheck & Lint:** 0 warnings, 0 errors.
- **Tải thực tế HTTP (`verify-holds-http.mjs` - 2000 requests, 10 rounds x 200 concurrent):**
  - **Checks:** 45/45 PASS.
  - **Total p95:** **162.61 ms** (ngưỡng yêu cầu < 300 ms).
  - **Steady p95:** **150.88 ms** (ngưỡng yêu cầu < 300 ms).
  - **First burst p95:** **210.28 ms**.
  - **p50:** 100.41 ms.
  - **p99:** 204.53 ms.
  - **Max:** 217.53 ms.
  - **`nfrPass`:** **true** (Exit code: 0).
