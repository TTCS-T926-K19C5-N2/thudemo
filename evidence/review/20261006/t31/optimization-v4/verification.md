# T-31 optimization-v4: PostgreSQL claim/state routine

Ngày 06/10/2026, nhánh `test`, base `48afbf1`. Người dùng đã duyệt routine PostgreSQL/migration mới và commit/push `test` để kiểm CI; không duyệt merge main trong lượt này.

## Thay đổi và bảo toàn nghiệp vụ

Migration mới `202610060001_claim_hold_function` tạo `public.claim_hold_v1` (`VOLATILE`, `SECURITY INVOKER`, bảng được schema-qualify). Không sửa 11 migration đã áp dụng trước đó. SQL claim và đọc state vẫn là **hai command riêng trong function**, để đọc snapshot/clock mới sau chờ khóa ([PostgreSQL](https://www.postgresql.org/docs/15/xfunc-volatility.html)). Không dùng snapshot CTE cũ để xác nhận quyền giữ.

API gọi một prepared query có sáu bind primitives; UUID array được tạo chỉ sau validation 1..2000 UUID không trùng, sắp xếp khóa. Thay số lượng parameter theo số ghế bằng một UUID-array parameter; không nối dữ liệu vào SQL text. Tổng số lượt API↔DB trong transaction thành công giảm từ 4 xuống 3 (BEGIN+SET LOCAL, routine claim/state, COMMIT). Function không chạy autocommit: API vẫn kiểm status, số ghế claim, state còn hạn trước COMMIT. Lỗi/claim một phần/HOLD_EXPIRED rollback cả snapshot và quyền ghế. Timeout acquisition/transaction/statement 10 giây và dịch lỗi constraint sau rollback giữ nguyên.

Không đổi S-15 (giá hạng, validation, chặn mở bán thiếu giá, snapshot giá đơn cũ) hoặc S-16 (đủ tất cả ghế còn hạn, một đơn pending, chống tạo trùng, **600 giây thanh toán**, không gia hạn khi retry). Không cache auth/giá/quyền giữ, không đổi pool cap 16, không sửa `ci.yml`, workload, ngưỡng 300 ms, bỏ mẫu đầu hoặc skip test.

## Kiểm thử local trước push

- Toàn workspace build/lint/typecheck PASS; unit **64/64** (API 47 + web 17); helper profiling **3/3** PASS.
- E2E cuối **50/50**, 6 file; suite S-15/S-16 **33/33** (31 cũ + hai ca routine mới). Raw: `regression-final3/e2e-results.json`.
- Hai ca mới: metadata VOLATILE/invoker và mảng rỗng/trùng/null không ghi dữ liệu; giữ đủ **2000 ghế**, đảo thứ tự retry vẫn cùng snapshot/deadline. Unit bổ sung missing-function 42883 phải fail closed, không tiết lộ chi tiết DB.
- TC-S16-21 vẫn bắt buộc quan sát lock wait thật, chờ quá hạn, nhận 409 HOLD_EXPIRED, snapshot/deadline không đổi; chỉ cập nhật matcher pg_stat_activity từ SQL INSERT cũ sang tên routine.
- Health build mới `http://127.0.0.1:3001/health` trả **200**, status=ok lúc `2026-10-06T02:48:05.930Z`; process do kiểm thử tạo đã dừng, không đụng process khác.
- Seat-map 2000 ghế, 30 mẫu: max **18,41 ms**, p95 **17,01 ms** (`regression-final3/integration-performance.json`).

| Lượt HTTP đầy đủ | Samples | Correctness | Total p95 | Steady p95 | Kết quả |
|---|---:|---:|---:|---:|---|
| function-normal1 | 2000 | 45 | 187,32 ms | 121,02 ms | PASS, exit 0 |
| function-normal2 | 2000 | 45 | 191,43 ms | 111,08 ms | PASS, exit 0 |

Mỗi lượt 10 vòng, 200 request/vòng trên hai API, 100 success + 100 conflict + 100 unique rights/vòng, gồm restart cache và worker thật. Toàn bộ mẫu đầu được giữ trong total. Đây là kết quả Windows local Node24.19, **không phải bằng chứng CI/production hoặc cam kết ổn định mọi runner**.

## Lượt chưa đạt được giữ lại

`regression-final`: 47/48, TC-S16-21 chưa nhận diện SQL function trong pg_stat_activity (matcher cũ). Sửa observer, không đổi assertions expiry/rollback. `regression-final2`: suite riêng 31/31 PASS, nhưng suite events lỗi kết nối `ETIMEDOUT 127.0.0.1:15432` khi khởi tạo pool local, 47 PASS/1 chưa chạy. Không gọi hai lượt này là PASS hoặc xóa raw; lượt cuối đầy đủ `regression-final3` đạt 50/50.

Base `48afbf1` cùng code ứng dụng với `75edc2a`: PR CI p95 298,57 PASS nhưng push 463,35 FAIL, chưa ổn định. Xem [CI follow-up](../optimization-v3/ci-48afbf1.md). Local routine mới cải thiện nhưng cần kiểm **đúng SHA mới** trên CI trước quyết định merge.

## Triển khai / rủi ro

Phải `pnpm --filter api exec prisma migrate deploy` **trước** chạy build API mới; đã áp dụng lên hai DB test cô lập 15432/15434, không reset hoặc đụng DB demo/remote. App mới mà thiếu migration trả HOLD_UNAVAILABLE (503), không chạy fallback không nguyên tử. Rollback ứng dụng về bản trước vẫn dùng SQL cũ được; nếu muốn xóa function đã áp dụng phải thêm migration bù, không chỉnh migration này.

Đường giữ ghế chuyển một phần SQL vào DB, nên bản API mới phụ thuộc function. Phân quyền route vẫn đọc phiên/role hiện tại và CSRF như cũ; function invoker không cấp thêm quyền. Không mở rộng thanh toán, ticket, auth durability hoặc UI của thành viên khác. Hạn chế mất auth-lock khi cache không persistence restart là vấn đề đã ghi trước, không kết luận đã sửa.

Trạng thái tài liệu này: snapshot local trước commit/push. Chưa merge `main`; CI SHA mới phải được ghi follow-up riêng sau khi thực tế kết thúc, không suy PASS từ local.
