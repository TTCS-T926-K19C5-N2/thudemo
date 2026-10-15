# Optimization-v5: validated routine / bounded pipeline / live seat JSON

06/10/2026, branch `test`, base `fae4379`. Tiếp tục theo phê duyệt tối ưu/commit/push của người dùng; không merge main.

## Vì sao sửa tiếp

CI v4 thực sự chưa đạt: [PR 37406056682](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/37406056682) T-31 total p95 **347,07 ms**, steady190,90 ms, 45 correctness checks; [push 37406052403](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/37406052403) 49/50 E2E, một mẫu GET2000 ghế **215,21 ms** vượt200 ms. Không gọi lỗi này là runner acquisition, không bỏ mẫu/rerun cùng code để tìm xanh. Chi tiết [ci-fae4379.md](../optimization-v4/ci-fae4379.md).

## Triển khai và an toàn

- Migration mới `202610060002_validated_hold_routine` tạo v2 invoker/volatile, gọi v1 claim/fresh-state và **RAISE trước COMMIT** khi thiếu suất, đóng bán, ghế sai/thiếu giá, claim một phần hoặc hết hạn sau chờ khóa. RAISE abort toàn bộ transaction, kể cả snapshot/session/partial seat đã ghi trong v1. Không sửa migration đã áp dụng. SQLSTATE H0001..H0005 được API dịch sang hợp đồng HTTP cũ; error DETAIL chỉ dùng UUID bị từ chối, được Node kiểm thuộc input; JSON lỗi/mã lạ/thiếu function fail closed không lộ DB detail.
- Cùng pool Prisma, checkout exclusive; **await BEGIN + SET LOCAL statement_timeout thành công trước** khi bật public `pg.Client.pipeline` cho riêng client này. Sau đó gửi SELECT v2 và COMMIT liên tiếp, không đợi mạng giữa hai bước. Không pipeline BEGIN cùng claim; không dùng đường này cho SQL v1/SQL chưa validation. `commitHoldRoutine` chỉ trả sau khi đã nhận cả query và COMMIT; trả setting pipeline về giá trị trước checkout.
- Query rejection làm transaction aborted nên COMMIT sau nó trả command `ROLLBACK`. Chỉ bỏ query ROLLBACK thừa khi command acknowledgment COMMIT/ROLLBACK đã nhận; trạng thái chưa rõ vẫn rollback, rollback lỗi hủy client. Giữ maxWait/transaction/statement bound **10 giây**, SET LOCAL không leak. Deadline hủy client, không trả query đang chạy cho người dùng pool kế tiếp. Default `holdTransaction` cho Prisma/test khác vẫn tuần tự như trước.
- Public seat-map đọc **một snapshot live** cho ON_SALE và inventory, aggregate JSON sáu fields id/row/seatNumber/category/price/status; giữ row/seatNumber order, null khác0, PostgreSQL clock kiểm HELD/AVAILABLE, seam SOLD cũ. Không cache kết quả. Preview vẫn xác minh organizer sở hữu event, anonymous/buyer/owner khác vẫn bị chặn. Prepared names chỉ cache SQL shape, cap32, không bind/auth/giá/state.
- Không đổi code order/price nghiệp vụ, thanh toán **600 giây**, idempotency/retry không gia hạn, atomic all-or-none, auth/CSRF/session revocation. Poolcap16/workerreserve1 như v3; không tạo pool ứng dụng thứ hai hoặc thay dependency. Không sửa `ci.yml`, ngưỡng300ms/200ms, workload hoặc warm-up giả.

Nguồn thiết kế: [PostgreSQL VOLATILE / fresh snapshot](https://www.postgresql.org/docs/15/xfunc-volatility.html), [RAISE abort transaction](https://www.postgresql.org/docs/15/plpgsql-errors-and-messages.html), [pg pipelining/error boundaries](https://node-postgres.com/features/pipelining). Chỉ bật sau BEGIN được xác nhận; validation phụ thuộc kết quả đã chuyển vào server, không commit trước validation.

## Kiểm thử local

- Whole workspace **build/lint/typecheck PASS**, **77/77 unit** (API60 + web17), **3/3 helper** PASS.
- E2E cuối `drained-final`: **51/51**, 6files, suite S15/S16 **34/34**, không skip. Trước đó pipeline-regression50/50 và final-regression51/51; raw giữ nguyên.
- Unit mới: chờ BEGIN thật rồi mới submit; BEGINfail không gửi claim/commit; không cho v1 vào pipeline; drain COMMIT trước reuse; chỉ skip rollback thừa sau ackROLLBACK; native reject bảo toàn; SQLSTATEHTTP và bad error detail failclosed.
- E2E mới với PostgreSQL thật: khóa phiên, routine timeout100ms trong khi COMMIT đã queue; ghế thêm không tồn tại, snapshot/token/deadline không đổi; client sau đó pipeline=false, SHOW statement_timeout=0, SELECT1 chạy được. Các test cũ tranh nhiều ghế/partial rollback/chờ quá hạn/giá đơn cũ/600giây/double-click đầy đủ vẫn PASS.
- Routine metadata VOLATILE/invoker và invalidarrays; claim/retry đủ2000ghế; quyền preview, live price/expiry/public visibility/no owner-token fields PASS.
- Final seat-map2000 ghế30samples: max **14,3033 ms**, p95 **12,9066 ms** (`drained-final/integration-performance.json`); gate200ms không đổi.
- Health build v2 port3001 **200**, statusok, `2026-10-06T03:03:38.297Z`; temporary owned API stopped. Giữ log local (ignored), không đụng app demo.

| Full HTTP local | Total p95 | Steady p95 | Checks | Kết quả |
|---|---:|---:|---:|---|
| pipeline-normal1 (trước tối ưu ack rollback) |190,02ms|126,28ms|45|PASS,exit0|
| pipeline-normal2 (trước tối ưu ack rollback) |185,83ms|119,38ms|45|PASS,exit0|
| drained-http (build cuối) |185,25ms|122,72ms|45|PASS,exit0|

Lượt final `drained-http` đã đủ45checks,2000samples,nfrPass=true,exit0. Các lượt đều giữ toàn bộ2000samples/10vòng/200request (100success100conflict100rights), cache+workerrestart thật, firstburst tính vào total, p95strictbelow300ms; không cộng45checks vào51E2E hoặc77unit. Windows Node24.19 local không phải CI/prod guarantee.

## Handoff

Áp dụng migration **trước** API mới: `pnpm --filter api exec prisma migrate deploy`. Hai database test15432/15434 đã deploy cảv1/v2, không reset/databasepush, không sửa demo/remote. Thiếu migration app failsclosed503. App cũ vẫn dùng v1/SQL cũ được; xóa function đã deploy cần migration bù. Rủi ro là API mới phụ thuộc routine contract và pg public pipeline của version khóa, đã kiểm bằng DB thật; auth durability khi cache không persistence vẫn là giới hạn ngoài hai task.

Đây là snapshot trước commit/push: cần CI **đúng SHA mới**, không suy CI xanh/ổn định300ms từ local. Báo cáo sau CI phải ghi run/SHA, số mẫu và totalp95 thật. `main` chưa đổi.
