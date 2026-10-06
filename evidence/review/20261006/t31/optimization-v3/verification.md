# T-31 / seat-map: readiness và bỏ overfetch, 06/10/2026

## Kết luận trước commit/push

Branch `test`, base `6a60b9b812633b5031c37699a1ea74cd99a55dbe`, chưa merge `main`. Người dùng đồng ý commit/push bản mới và kiểm tra CI; các số dưới đây là **local**, không thay cho CI của SHA mới.

- Hai lượt thường cuối: total p95 **214,11 / 195,38 ms**, steady **151,86 / 126,64 ms**, nfrPass=true, exit 0. Mỗi lượt đủ 2000 mẫu, 10 vòng, 45 correctness checks; mỗi vòng đúng 100 thắng/100 conflict/100 quyền riêng biệt, không lỗi khác.
- Sơ đồ 2000 ghế: 30 lần GET thật qua Nest/supertest, max **15,67 ms**, p95 **15,65 ms**, dưới gate max <200 ms. Không chỉ đo SQL hoặc loại lần tải đầu.
- **48/48 E2E PASS**, sáu suite; suite S-15/S-16 có 31 test = 28 AC cũ + một test driver timeout đã có + hai test seat-read mới. Không sửa kỳ vọng/skip của test cũ.
- Toàn workspace build/lint/typecheck PASS; API 46 + web 17 = **63 unit PASS**; ba helper profiling test PASS.
- Build mới tại port 3001: `/health` 200/status ok lúc **09:18:33 +07:00**. Process do lần kiểm tra này tạo (PID 7708) đã dừng sau kiểm tra; dùng DB integration riêng, không thay process demo.

## Lỗi CI thực tế ở base, không phải runner không cấp máy

- [Push run 37402142589](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/37402142589): build/lint/test/K-01 PASS; T-31 FAIL total p95 **363,07 ms**, steady **200,44 ms**, vòng đầu p95 **433,51 ms**; 45 correctness checks đạt. Không bỏ vòng đầu để làm xanh.
- [PR run 37402146525](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/37402146525): build/lint PASS; test FAIL vì `Math.max(...samples.queryMs)` **225,62 ms >=200 ms** tại `test/sprint2.e2e-spec.ts:350`. Đây là 30 lần tải sơ đồ ghế, khác gate p95 300 ms. 29 test suite S-15/S-16 đạt; K-01/T-31 bị skip do phụ thuộc test.
- Những run này thuộc `6a60b9b`, không dùng chúng để tuyên bố bản sửa mới PASS. Kết quả CI mới được kiểm sau push; không bypass branch protection hoặc merge theo số local.

## Thay đổi được giữ và tác động

1. API chuẩn bị **16 connection của pool hiện có** trong `onModuleInit`, trước khi listen/healthy, không thực thi SQL nghiệp vụ hoặc gửi HTTP warm-up. `max` vẫn 16; `min` nay 16 để giữ socket qua khoảng nhàn rỗi; kết nối mới có timeout 10 giây. Worker expiry riêng chỉ chuẩn bị/giữ tối thiểu **1** connection (`HOLD_EXPIRY_MODE=worker`), max vẫn 16. Không thêm pool, dependency hoặc datastore.
2. Helper trả mọi client sau readiness/failure, kể cả acquisition về muộn; không giữ connection đang borrow. Giới hạn reserve 1..16 để không tự gây deadlock bởi yêu cầu nhiều hơn cap. Unit kiểm số borrow/release, lỗi/late completion, worker và cấu hình không hợp lệ.
3. **Tradeoff thật:** API giữ tối thiểu 16 DB sockets thay vì pool lazy/idle eviction cũ. Hai API giữ 32 socket ngay khi rảnh; startup cần cấp được pool trước khi phục vụ. Giới hạn managed DB và số replica vẫn phải đối chiếu khi deploy; local/CI không chứng minh capacity staging. DB không sẵn sàng thì startup/đọc thất bại, không trả dữ liệu giả. Điều này thay đổi tài nguyên/startup, không thay quyền/TTL/nghiệp vụ.
4. GET public seats kiểm live `showtimes.status` bằng SELECT nhỏ thay vì gọi `detail()` tải event, categories và siblings không dùng. GET preview kiểm live event organizer bằng JOIN nhỏ thay vì tải cả show/category/seat count. Vẫn 404 cho show không tồn tại/nháp/đóng ở public; preview vẫn 401/403 qua guard/ownership; không đổi endpoint detail/manage khác.
5. SQL projection inventory **giữ nguyên** (đã so sánh chính xác): id/row/seatNumber/category/price/status, category cùng show, held theo PG clock, sort row/seatNumber. Chuyển riêng seat/session reads primitive qua driver pool đã có để tránh chuyển đổi 2000 rows qua Prisma runtime. Không cache giá/seat/owner/session/roles. Guard vẫn đọc phiên/verified/roles mỗi request.
6. Nhánh known native unique-conflict dùng cùng driver read để recheck sau rollback, giữ nguyên SQL, mã lỗi, requestId và log; không đổi claim/state transaction, lock order, server deadline hoặc constraint.

S-15/S-16 giữ nguyên: giá theo hạng, null khác 0, input validation, thiếu giá chặn mở bán, đơn cũ giữ snapshot/total, đơn mới dùng giá mới, giữ ghế all-or-none, xác nhận đủ ghế bằng snapshot mới sau chờ lock, retry/double-click không tạo trùng, payment hold **600 giây**. Không đổi order code, UI, schema, migration, CI hay threshold 200/300 ms.

Pool semantics/parameter binding đối chiếu [node-postgres pool](https://node-postgres.com/apis/pool), [parameterized queries](https://node-postgres.com/features/queries) và API thực tế của adapter đang cài. `min` không tự tạo connection: helper readiness mới thực hiện connect/release trong ứng dụng thật.

## Tất cả lượt đo trong đợt này

Node **v24.19.0 Windows**, PG15 15434/database `sang_holds_local`, Valkey8 16382, hai Nest process thật + cookie guard + worker. CI trước dùng Node v24.21.0 Linux; không suy ra runner đạt 300 ms từ local. Workload/verifier/percentile/gates giữ nguyên, không exclude samples hoặc gọi thêm request warm-up; các invariant requests sẵn có trước burst được giữ.

| Raw directory | Cấu hình readiness | Profiling | Total / steady p95 ms | Checks / exit / gate |
|---|---|---|---|---|
| reserve-8-profile | Thử 8/API, chưa tách worker | CPU + metrics | 310,85 / 197,77 | 45 / 1 / FAIL |
| reserve-16-normal-1 | 16/API, 1/worker | Tắt | 214,11 / 151,86 | 45 / 0 / PASS |
| reserve-16-profile | 16/API, 1/worker | CPU + metrics | 252,48 / 177,44 | 45 / 0 / PASS |
| reserve-16-normal-2 | Bản cuối, có guard reserve 1..16 | Tắt | 195,38 / 126,64 | 45 / 0 / PASS |

Không giấu lượt FAIL 8-connection. Profile vòng đầu: pool-acquire p95 giảm từ **208/199 ms** (hai API thử 8) xuống **84,50/83,81 ms** (16). Đây là bằng chứng chẩn đoán trên shared local host, không benchmark A/B cô lập hoặc cam kết latency mọi máy. Profiling có overhead nên hai lượt thường mới là kiểm chứng local bổ sung. Số lượt cố định, không rerun đến khi may mắn xanh.

Raw final E2E/performance ở [regression-final/e2e-results.json](regression-final/e2e-results.json), [regression-final/integration-performance.json](regression-final/integration-performance.json). Lượt intermediate 46 E2E/8-reserve giữ ở `regression-1/`. Các JSON HTTP giữ mọi sample, profile chỉ ghi timing/category/call frames, không parameters/cookies. Cache restart/worker/stale-token checks đạt; giới hạn auth-lock mất sau cache restart không persistence vẫn được ghi trong raw, không được sửa hoặc coi là nghiệm thu auth durability.

## Files

- `apps/api/src/prisma/prisma.service.ts`: scoped driver reads, reserve/min/connection timeout và readiness.
- `apps/api/src/prisma/prepare-hold-pool.ts` + spec: prepare/release/bounds/failure/worker.
- `apps/api/src/showtimes/showtimes.service.ts` + spec: bỏ detail/owned overfetch chỉ ở seat endpoints, giữ visibility/owner/live query/projection.
- `apps/api/src/holds/holds.service.ts` + spec: đổi transport conflict read, không đổi SQL/business logic.
- `apps/api/test/s15-s16-acceptance.e2e-spec.ts`: thêm hai test live data/expiry/visibility/privacy/ownership, không sửa 29 test cũ.
- Báo cáo/raw trong thư mục này, parent verification và docs test cases. Bằng chứng lịch sử không ghi đè.

## Tiếp theo

Người dùng đã cho phép commit/push `test` và kiểm CI. Chỉ kết luận đạt CI khi job của SHA mới thực sự PASS; không tự merge `main`, hạ threshold hoặc bỏ case chậm. Nếu còn lỗi, báo cụ thể số đo và giữ bằng chứng trước khi tiếp tục xử lý.
