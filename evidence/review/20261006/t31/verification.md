# T-31: profiling và thử prepared statements

## Cập nhật mới nhất: optimization-v4 (06/10/2026)

Đã triển khai routine PostgreSQL claim/state theo phê duyệt, migration mới không sửa lịch sử. Giữ transaction bounded/rollback/fresh clock và thanh toán 600 giây. Local **50/50 E2E, 64/64 unit, 3 helper**, build/lint/typecheck/health PASS; hai lượt HTTP đầy đủ p95 **187,32 / 191,43 ms**, 45 checks/lượt. Đây là snapshot trước push, **chưa xác nhận CI SHA mới hoặc merge main**. Chi tiết, raw và các lượt lỗi đã giữ: [optimization-v4/verification.md](optimization-v4/verification.md). Các cập nhật v3/v2 bên dưới là lịch sử.

## Cập nhật mới nhất: optimization-v3 (06/10/2026)

**CI follow-up của 48afbf1:** PR 37404313213 PASS cả 5 job, T-31 total p95 298,57 ms; push 37404309847 vẫn FAIL T-31 463,35 ms. Cùng code ứng dụng có kết quả dao động, nên **chưa coi NFR 300 ms ổn định**, chưa merge main. Test chức năng S-15/S-16 và lỗi seat-map đã PASS. Chi tiết/diagnostic/phương án cần chốt: [ci-48afbf1.md](optimization-v3/ci-48afbf1.md). Phần follow-up này được cập nhật local sau push, chưa nằm trong 48afbf1.

Bản chuẩn bị commit trên `test`, base `6a60b9b`: hai lượt benchmark thường local đạt total p95 **214,11 / 195,38 ms**, đủ 45 checks/lượt; sơ đồ 2000 ghế max **15,67 ms** qua 30 GET. **48/48 E2E, 63 unit, 3 helper PASS**; build/lint/typecheck và health port 3001 PASS. Chuẩn bị pool API trước listen (max vẫn 16, min nay 16; worker reserve 1), bỏ overfetch ở GET seats và dùng scoped shared-driver read. Không đổi chức năng S-15/S-16, TTL 600 giây, schema/migration/UI/CI hoặc ngưỡng 200/300 ms.

CI của base `6a60b9b` thực sự FAIL: push T-31 p95 363,07 ms; PR seat-map max 225,62 ms. Bản mới chỉ được xác nhận **local** khi ghi báo cáo; người dùng đã đồng ý commit/push để kiểm CI, chưa merge main. Xem toàn bộ lượt PASS/FAIL, tradeoff tăng idle sockets và phạm vi: [optimization-v3/verification.md](optimization-v3/verification.md).

## Bản ghi optimization-v2 (lịch sử, 06/10/2026)

Bản ghi kiểm chứng trước commit/push của tối ưu shared-pool SQL trên nhánh `test`, base `bd62011`, **chưa merge**. Người dùng đã yêu cầu gửi bản này lên `test` để chạy CI mới; xem commit/Actions để xác nhận trạng thái push sau khi báo cáo được ghi. Hai lượt cuối local đạt total p95 **209,23 / 204,10 ms**, steady **133,28 / 120,75 ms**; mỗi lượt đủ 45 checks, nfrPass=true, exit 0. Toàn workspace build/lint/typecheck PASS, 48 unit PASS, 3 helper PASS, 46/46 E2E PASS (28 AC cũ + một test driver mới trong suite 29 test), health port 3001 trả 200.

Không đổi giá/hạn thanh toán 10 phút hoặc ngưỡng 300 ms. Session guard vẫn đọc DB ở từng request; transaction giữ ghế dùng lại pool Prisma và giữ SQL/lock/fresh-state/rollback. Vì có thay đổi đường SQL dùng chung, vẫn cần CI xác nhận trên SHA mới; không suy ra CI PASS từ local. Run attempt 2 của base `bd62011` đã FAIL T-31 với total p95 483,30 ms; đó không phải kết quả bản tối ưu này.

Chi tiết, phạm vi ảnh hưởng, mọi lượt đo và rủi ro: [optimization-v2/verification.md](optimization-v2/verification.md). Các mục phía dưới là **bản ghi lịch sử trước commit bd62011**, không phải trạng thái mới nhất.

## Bản ghi chuẩn bị prepared statements (lịch sử)

Ngày local: 06/10/2026. Branch `test`, base `7653170`. Trạng thái khi chuẩn bị commit: các thay đổi chưa commit/push; `main` không đổi. Các kết quả CI dưới đây thuộc base, không phải bằng chứng của commit prepared statements sắp push.

## Kết luận

S-15/S-16 không hồi quy: 45/45 E2E, trong đó 28 test nghiệm thu riêng, PASS. Lint, typecheck, build toàn workspace, 25 unit (API 8 + web 17) và 3 test helper profiling PASS. Health local port 3001 trả 200; health của hai API dùng build mới được benchmark kiểm riêng.

Bốn lượt local sau prepared statements đạt ngưỡng total/steady p95 <300 ms. Lượt người dùng chạy đầy đủ tại `prepared-full-manual/http-concurrency.json` đạt 45 checks, gồm restart cache thật; kết thúc lúc 03:12:18 ngày 06/10/2026 (giờ Việt Nam). Chưa xác nhận CI của bản mới, chưa merge `main`. Không kết luận NFR staging/production hoặc ổn định trên CI từ các lượt local.

CI gần nhất của base vẫn FAIL: [run 37361180867](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/37361180867), total p95 434.35 ms, steady 310.61 ms; 45 correctness checks PASS. Baseline trước S-15/S-16 cũng trượt gate; xem báo cáo `../performance/cte/verification.md`. Không quy toàn bộ lỗi cho S-16 hoặc runner.

## Đo và quyết định

Instrumentation chỉ bật khi `HOLDS_PROFILE=1`, NODE_ENV=test, DB loopback cô lập và có IPC parent. Ghi CPU/event loop, thời gian chờ pool và nhóm query; không ghi SQL, bind values, cookie, hash hay token. CPU profile ghi call frames, không ghi giá trị tham số. Helper không được import trong ứng dụng; mode benchmark thông thường không bật instrumentation.

Hai profile trước thay đổi cho thấy thời gian chờ pool đáng kể, ELU cao trong burst và Prisma runtime là module JavaScript có nhiều CPU samples nhất. Đây là dấu hiệu để thử tối ưu, không chứng minh một nguyên nhân duy nhất. Raw: `profile-before/`, `cpu-before/`.

Thử `errorFormat: minimal` nhằm giảm tạo callsite không đạt mục tiêu: total p95 305.49 ms, exit1 đúng assertion. Đã bỏ cấu hình này; giữ nguyên evidence `minimal-after/`, không loại lượt FAIL khỏi báo cáo.

Giải pháp giữ lại để kiểm tiếp: dùng `statementNameGenerator` được adapter-pg đang cài hỗ trợ, đặt tên theo SQL shape cho ba nhóm auth/hold-claim/hold-state. Bound 32 shapes mỗi adapter; query ngoài phạm vi hoặc shape vượt giới hạn dùng unnamed statement. Tên không chứa dữ liệu phiên/tham số; không cache kết quả auth. [node-postgres mô tả named prepared statements và cache theo connection](https://node-postgres.com/features/queries); khai báo API thực tế nằm ở `apps/api/node_modules/@prisma/adapter-pg/dist/index.d.ts`.

Không thay SQL nghiệp vụ, không đổi pool 16/API, transaction/timeout/lock order/rollback/fresh-state query/constraint. Vẫn kiểm session, verified status, role và expiry tại DB ở từng request. TTL giữ ghế và hạn thanh toán vẫn 600 giây; retry/thêm ghế không gia hạn ngoài quy tắc hiện có. Không sửa migration, frontend, durability, auth cache hay threshold.

## Toàn bộ lượt đo trong đợt này

Mỗi lượt: hai process Nest thật, cookie guard thật, PostgreSQL 15 local tại 15434, Valkey tại 16382; 200 request/100 ghế ×10. Mọi vòng có 100 success/100 conflict/100 unique rights. Không loại sample hay thêm warm-up giả. `steady` tách lượt đầu để phân tích, nhưng gate vẫn kiểm cả `total` 2000 request và `steady` 1800 request.

| Lượt / thư mục raw | Profiling | Total p95 ms | Steady p95 ms | Checks | Exit / NFR |
|---|---|---:|---:|---:|---|
| profile-before | Metrics | 267.69 | 209.39 | 42 | 0 / PASS |
| cpu-before | Metrics + CPU | 274.78 | 222.26 | 42 | 0 / PASS |
| minimal-after (đã bỏ) | Metrics | 305.49 | 215.66 | 42 | 1 / FAIL |
| prepared-after | Metrics | 256.66 | 177.99 | 42 | 0 / PASS |
| prepared-normal-1 | Tắt | 258.58 | 175.62 | 42 | 0 / PASS |
| prepared-normal-2 | Tắt | 273.28 | 184.60 | 42 | 0 / PASS |
| prepared-full-manual (người dùng chạy) | Tắt | 266.10 | 170.49 | 45 | — / PASS |

Lượt manual đã đối chiếu JSON gốc với ảnh terminal người dùng gửi: 2000 requests, 10 rounds, nfrPass=true, có finish timestamp; mỗi vòng 100 success/100 conflict. Không thu riêng `$LASTEXITCODE` của terminal người dùng, nên không gán exit code cho lượt này. Không sửa raw JSON.

Lượt đầu prepared-normal-1/2 vẫn có p95 318.67/338.25 ms và được giữ đầy đủ. Gate hiện tại không kiểm p95 từng vòng mà kiểm total + steady. Đây là Node fetch loopback cùng máy Windows/Docker, không đại diện latency Render hay cold request production; invariant calls đã chạy trước burst nên không gọi đây là cold process.

Sáu lượt đầu chỉ có 42 checks, chưa chạy ba kiểm cache restart vì công cụ điều khiển Docker cần approval bị chặn bởi hạn mức reviewer. Các report đó giữ nguyên `cacheRestart.tested=false`; không dùng đường gọi khác để lách approval. Người dùng sau đó tự chạy lượt đầy đủ: 45 checks, quyền giữ ghế PostgreSQL được bảo toàn qua restart Valkey. API restart, worker startup, nhịp quét thật 60 giây, graceful shutdown và restart backlog cũng PASS.

Lượt đầy đủ vẫn xác nhận giới hạn bảo mật đã biết: cache không persistence nên counter/khóa đăng nhập bị mất khi restart (`actualAuthLockLost=true`). Check hiện tại ghi nhận giới hạn đó, không chứng minh khóa đăng nhập bền vững hoặc mọi task khác hoàn tất. Không sửa auth lock trong phạm vi S-15/S-16.

Regression raw: `prepared-regression/e2e-results.json`, `prepared-regression/integration-performance.json`. Test mới kiểm tên ổn định, giới hạn shape và fallback unnamed; helper kiểm promise/callback metrics, từ chối DB/env không cô lập, không đưa canary SQL/parameters vào IPC và ghi xong CPU profile trước final acknowledgement. Diff check PASS; warning Vite hiện có không bị ẩn hoặc đổi cấu hình để bỏ cảnh báo.

## Phần cần chạy tiếp

Cache restart local đã kiểm xong bằng lượt người dùng chạy. Bước tiếp theo: commit/push branch `test` theo workflow đã thống nhất và đối chiếu CI mới. Không rerun đến khi may mắn xanh, không hạ ngưỡng hoặc bypass required checks; nếu CI vẫn FAIL cần báo trước và kiểm profile tiếp. Không merge `main` từ các kết quả local hiện tại.

Lệnh người dùng đã chạy từ root `thudemo` trong PowerShell, giữ để tái lập (credentials bên dưới chỉ là fixture local công khai; khi tái chạy chọn HOLDS_EVIDENCE_DIR mới để không ghi đè bằng chứng):

```powershell
$env:DATABASE_URL = 'postgresql://ci_test_user:ci_test_password@127.0.0.1:15434/sang_holds_local'
$env:REDIS_URL = 'redis://127.0.0.1:16382'
$env:HOLDS_DOCKER = 'C:\Users\admin\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe'
$env:HOLDS_EVIDENCE_DIR = 'evidence/review/20261006/t31/prepared-full-manual'
Remove-Item Env:HOLDS_PROFILE, Env:HOLDS_CPU_PROFILE -ErrorAction SilentlyContinue
node apps/api/scripts/verify-holds-http.mjs
```

Lệnh chỉ restart container cache kiểm thử `sang-holds-cache-20261004`; không restart DB, không reset/xóa dữ liệu demo. Benchmark dọn fixture của chính lượt chạy. Không chạy song song với benchmark khác vì dùng port 3301/3302.

## Files thay đổi

- `apps/api/src/prisma/prisma.service.ts`: nối generator vào adapter, không tăng pool.
- `apps/api/src/prisma/hold-statement-names.ts` + spec: cache tên bounded theo SQL shape, 2 unit test.
- `apps/api/scripts/verify-holds-http.mjs`: profiling opt-in, giữ nguyên tải/assertion trong normal mode.
- `apps/api/scripts/profile-holds-preload.mjs` + spec: metrics/CPU diagnostic cô lập, 3 helper tests.
- Báo cáo, raw results và trạng thái mới trong `docs/testing/S15-S16-test-cases.md`.
