# T-31: tối ưu shared-pool SQL, 06/10/2026

## Kết luận và phạm vi

Branch `test`, base `bd620118e4f2f0a56bf75e04da803e832bbb2dca`. Đây là bản ghi kiểm chứng **trước commit/push**, chưa merge. Người dùng đã yêu cầu commit/push để chạy CI mới; trạng thái gửi lên GitHub được xác nhận sau khi commit, không suy ra từ báo cáo này. Bản cuối đạt ngưỡng **local**, chưa được xác nhận trên GitHub Actions, staging hoặc production khi ghi báo cáo.

- Hai lượt cuối không profiling: total p95 **209,23 / 204,10 ms**, steady **133,28 / 120,75 ms**; mỗi lượt 2000 samples, 10 vòng, đủ 45 correctness checks, nfrPass=true, process exit 0.
- Toàn workspace: build, lint, typecheck PASS; 48 unit PASS (API 31, web 17), 3 helper profiling tests PASS.
- Hồi quy E2E: **46/46 PASS**, gồm 28 test AC S-15/S-16 và một test driver timeout mới trong suite 29 test. Sáu suite đều PASS. Raw cuối: [e2e-results.json](regression-final/e2e-results.json), [integration-performance.json](regression-final/integration-performance.json).
- `/health` của build mới tại port 3001 trả 200/status ok lúc 08:56:43 giờ Việt Nam. Process kiểm tra được dừng sau khi đọc health.
- Run [37372305889, attempt 2](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/37372305889/attempts/2) của **base**, không phải bản này: T-31 FAIL, total p95 483,30 ms/steady 273,27 ms. Các job build/lint/test/K-01 PASS không thay thế kết quả T-31. Cần CI trên commit mới trước khi kết luận đạt trên runner.

## Cách tối ưu và ảnh hưởng

Profile trước sửa cho thấy chi phí `$queryRawInternal`/Prisma runtime và hàng đợi pool đáng kể. Đây là dấu hiệu để chọn thử nghiệm, không chứng minh một nguyên nhân duy nhất của latency CI.

1. `PrismaService` lấy **pool hiện có** từ public API `underlyingDriver()` của `@prisma/adapter-pg` đang cài, không thêm datastore, dependency hoặc pool thứ hai. Prisma model operations và tạo đơn vẫn dùng Prisma như cũ. Production pool vẫn max 16/API, hai API tối đa 32 client slots; không nới pool để vượt bài test.
2. Riêng SQL claim/state trong một transaction giữ ghế chạy qua driver của pool đó. Vẫn một connection, BEGIN → claim → state riêng với snapshot/clock mới → COMMIT; lỗi hoàn tác bằng ROLLBACK. Các câu SQL nghiệp vụ không đổi; đã đối chiếu AST của hai template claim/state và template đọc phiên với HEAD.
3. Giữ maxWait/transaction deadline 10 giây. Timeout/connection failure loại connection khỏi pool, không đưa SQL đang chạy cho người khác dùng. Thêm `SET LOCAL statement_timeout` 10 giây trong cùng round trip BEGIN để server cũng ngắt SQL/lock wait; LOCAL không rò sang borrower kế tiếp. Late acquisition được trả lại, rollback lỗi sẽ hủy connection.
4. Session guard dùng cùng pool cho **nguyên câu SELECT hiện có**. Vẫn đọc DB ở từng request: hash phiên, expiry theo DB clock, verified user, roles hiện tại. Không cache kết quả xác thực, không bỏ CSRF hoặc kiểm tra quyền. Đây là phần dùng chung có ảnh hưởng đến các route cần đăng nhập; đã kiểm unit và toàn bộ E2E auth/roles/events/sprint2, không chỉ giữ ghế.
5. Driver trả native SQL error, nên chỉ đúng `23505`/`seat_holds_seatId_showtimeId_key` được chuyển thành conflict sau rollback. Vẫn log an toàn requestId/count; lỗi khác fail closed, không lộ SQL/owner/token.

Quy tắc S-15/S-16 giữ nguyên: giá theo hạng, missing-price guard, snapshot giá cũ của đơn, all-or-none, snapshot đủ ghế, retry/double-click không tạo đơn trùng, hạn thanh toán 600 giây. Không sửa UI, schema, migration, cấu hình CI, threshold, dữ liệu demo hoặc durability. Thay đổi có rủi ro ở đường SQL/transaction dùng chung, không được coi là hoàn toàn không ảnh hưởng; regression và CI là điều kiện kiểm chứng.

Tài liệu kỹ thuật đã đối chiếu: [Prisma PostgreSQL driver adapter](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql), [node-postgres transaction trên cùng client](https://node-postgres.com/features/transactions); API/type thực tế ở `apps/api/node_modules/@prisma/adapter-pg/dist/index.d.ts`.

## Tất cả lượt đo, không loại lượt chậm

Windows local, Node v24.19.0, PostgreSQL 15 cổng 15434/database `sang_holds_local`, Valkey 8 cổng 16382, hai process Nest/cookie guard thật, 200 request/100 ghế × 10 vòng. Mọi vòng đều 100 success/100 conflict/0 lỗi khác/100 unique rights. Giữ cả lượt đầu trong total và cả success/conflict trong percentile; không fake warm-up hoặc thay tiêu chí. Những invariant request trước burst vẫn có như script ban đầu: không gọi lượt đầu là cold process production.

| Thư mục raw | Bản đo | Profiling | Total p95 ms | Steady p95 ms | Checks / exit / NFR |
|---|---|---|---:|---:|---|
| before-profile | Base bd62011 | Metrics + CPU | 256,39 | 178,02 | 45 / 0 / PASS |
| after-profile | Chỉ driver transaction; session còn Prisma | Metrics + CPU | 265,19 | 142,64 | 45 / 0 / PASS |
| after-session-profile | Thêm đọc phiên từ shared pool | Metrics + CPU | 215,87 | 137,05 | 45 / 0 / PASS |
| normal-1 | Bản trước SET LOCAL | Tắt | 212,69 | 124,13 | 45 / 0 / PASS |
| normal-2 | Bản trước SET LOCAL | Tắt | 222,69 | 124,94 | 45 / 0 / PASS |
| final-1 | Bản cuối, có SET LOCAL | Tắt | 209,23 | 133,28 | 45 / 0 / PASS |
| final-2 | Bản cuối, có SET LOCAL | Tắt | 204,10 | 120,75 | 45 / 0 / PASS |

Mỗi thư mục chứa `http-concurrency.json` đầy đủ samples và logs; các lượt profile có CPU profiles, không ghi SQL/parameters/cookies vào IPC. Thử đầu chỉ cải thiện steady nhưng total tăng; giữ nguyên bằng chứng, không chọn riêng lượt đẹp. Hai cặp normal/final là số lượt cố định, không rerun đến khi may mắn xanh. Percentiles cuối đã tính lại từ 2000 raw samples, khớp report.

Fixture/worker parent của verifier nay dùng `PrismaService` để các invariant trực tiếp cũng kiểm đúng driver path sản phẩm, thay vì một `PrismaClient` riêng không có method mới. Pool của parent là 16 (trước đó default adapter 10); parent không phục vụ 200 HTTP requests, cấu hình hai API và số requests không đổi. Node local v24.19.0 khác Node v24.21.0 của CI, nên không suy ra p95 của runner từ các số này.

Cache restart và worker cadence 60 giây/restart/stale-token checks đều PASS. Giới hạn đã biết vẫn được ghi thật: Valkey không persistence làm mất login counter/lock khi restart (`actualAuthLockLost=true`), còn quyền giữ ghế PostgreSQL được bảo toàn. Không sửa auth durability trong phạm vi này.

## Kiểm tra an toàn bổ sung

- Unit driver: parameter binding/name, giữ kiểu rows, commit, rollback partial write, native error, rollback failure, bounded acquire/late release, deadline, closed transaction, connection error, unsupported parameter types và invalid limits.
- Unit guard: expiry/verified/role SQL giữ nguyên, roles/phiên được đọc lại, malformed cookie, cross-origin, public route và DB failure fail closed.
- Unit conflict: chỉ known constraint thành 409; constraint/code khác không bị che thành conflict; không lộ DB details; mất quyền trong lúc recheck yêu cầu retry.
- E2E mới: trong DB integration cô lập, UPDATE token rồi `pg_sleep(2)` với deadline 100 ms phải thất bại; khóa được trả, token vẫn cũ, setting statement_timeout không rò, và đặt vé tiếp vẫn thành công.
- Không đổi test AC cũ hoặc expectation để làm xanh. Thêm một test driver; 28 AC cũ vẫn PASS. Không dùng số benchmark checks làm số E2E.
- Cảnh báo Vite/config đã có vẫn xuất hiện; không tắt cảnh báo hoặc mở rộng sửa frontend.

## Files thay đổi

- `apps/api/src/prisma/hold-transaction.ts` và spec: driver transaction giới hạn thời gian, rollback và quản lý client.
- `apps/api/src/prisma/prisma.service.ts`: dùng lại pool adapter, shared-pool session read.
- `apps/api/src/holds/holds.service.ts` và spec: gọi transaction mới, giữ SQL/nghiệp vụ/log và chuyển đúng native constraint error.
- `apps/api/src/auth/guards/session-auth.guard.ts` và spec: đổi transport SELECT, không đổi SQL hoặc quyền.
- `apps/api/test/s15-s16-acceptance.e2e-spec.ts`: thêm test server timeout/rollback/setting leak.
- `apps/api/scripts/verify-holds-http.mjs`: fixture dùng service thật, workload/gate không đổi.
- `apps/api/scripts/profile-holds-preload.mjs` và spec: nhận diện BEGIN có nhiều statements trong diagnostic; canary/redaction và ba helper tests PASS.
- Báo cáo này, raw evidence mới, parent `verification.md`, `docs/testing/S15-S16-test-cases.md`.

Bằng chứng integration lịch sử ở `evidence/sprint2/20261004-local/integration-performance.json` được giữ nguyên bytes; kết quả mới nằm trong `regression/` và `regression-final/`, không ghi đè dữ liệu lịch sử để làm nghiệm thu.

## Bước tiếp theo

Người dùng đã yêu cầu commit/push `test`. Review diff, gửi commit mới và đọc CI của đúng SHA, gồm T-31. Chỉ xác nhận đạt NFR trên CI sau khi actual run PASS; không hạ 300 ms, bỏ lượt đầu, bypass protection hay merge `main` từ kết quả local này.
