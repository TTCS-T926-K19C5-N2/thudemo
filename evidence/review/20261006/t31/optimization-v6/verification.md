# Optimization-v6: structured hold outcomes with server rollback

06/10/2026, branch `test`, base `d9367b9`. Tiếp tục tối ưu trong phạm vi routine đã được duyệt và commit/push `test`, không merge main.

## Thay đổi

V5 CI giữ đủ correctness nhưng chưa đạt NFR: PR p95 **322,37ms**, push **588,62ms**. Cả hai build/lint/test/K-01 PASS; log push có1004 PostgreSQLERROR,998 `Hold seat conflict`, trong khi v4 PR chỉ3ERROR. RAISE thoát function cho conflict dự kiến tạo thêm error protocol/context và server-log I/O; không khẳng định đó là nguyên nhân duy nhất của runner variance. [Bằng chứng v5 CI](../optimization-v5/ci-d9367b9.md).

Migration mới `202610060003_hold_outcomes` tạo `claim_hold_v3` VOLATILE/SECURITY INVOKER, vẫn dùng claim/fresh-state SQL v1. Toàn bộ claim và validation nằm trong **PL/pgSQL exception subtransaction**. Nếu kết quả không hợp lệ, RAISE nội bộ khiến PostgreSQL rollback tất cả session/snapshot/seat writes trong block; handler chỉ sau rollback mới trả outcome H0001..H0006 + UUID bị từ chối, holdnull. Vì error được bắt nội bộ, conflict dự kiến không thoát ra driver hoặc gây1000 PostgreSQLERROR trong test. Không tắt logserver, không tắt cảnh báo conflictAPI, không suppress unexpected SQL failures.

Native unique error chỉ được xử lý nếu CONSTRAINT_NAME **đúng tuyệt đối** `seat_holds_seatId_showtimeId_key`; mọi constraint khác/null RAISE lại. Sau rollback, query mới kiểm live PostgreSQLclock/quyền sở hữu như fallbackAPI cũ; nếu ownership đã đổi không còn ghế từ chối thì trả HOLD_RETRY503, không báo conflict sai. API dịch outcome sang HTTP/messages/rejectedUUID hợp đồng cũ, không lộ rawDBdetails. UUID phải thuộc input, outcome lạ failclosed.

Bounded pipeline v5 giữ nguyên: await BEGIN+SET LOCAL thành công rồi mới gửi validated v3 + COMMIT, drain cả hai kết quả, timeout10giây, restoreclient.pipeline, acknowledgment/no reuse uncertain client. COMMIT của expected failure chỉ commit một outertransaction mà mọi business write đã rollback ở subtransaction. V1 vẫn bị chặn khỏi pipeline. Không dùng autocommit trong API; test trực tiếp autocommit chỉ để chứng minh tính nguyên tử độc lập với callbackAPI.

Không sửa migration đã áp dụng, schema/model data, giá đơn, thanh toán **600giây**, idempotency/retry, auth/session/roles/CSRF, poolcap16 hoặc JSON seat-map projection v5. Không sửa `ci.yml`, thresholds300ms/200ms, workload200request×10, warm-up hoặc bỏ firstburst. [PostgreSQL exception-block rollback](https://www.postgresql.org/docs/15/plpgsql-control-structures.html#PLPGSQL-ERROR-TRAPPING) và [VOLATILE fresh snapshots](https://www.postgresql.org/docs/15/xfunc-volatility.html) là cơ sở thiết kế; correctness đã kiểm DB thật.

## Local verification

- Whole workspace build/lint/typecheck PASS; **83/83unit** (API66 + web17), **3/3helper** PASS.
- **52/52E2E**,6files, suite S15/S16 **35/35**, không skip. Raw `final-regression/e2e-results.json`; mọi ca giá/snapshot, đủ ghế/idempotency,expiry sau lock wait,partial rollback,timeout khi COMMIT đãqueue,2.000ghế/live-seat/privacy vẫn PASS.
- E2E mới gọi v3 trực tiếp **autocommit** với một ghế bị người khác giữ và một ghế trống: trả H0004 đúng ghế tranh chấp; không tạo session/snapshot mới, không giữ ghế trống, original winner không đổi. Tức không dựa vào Node ném exception bên ngoài để rollback business writes. Unit thêm6outcome HTTP mapping gồm HOLD_RETRY.
- Seat-map2000ghế/30mẫu max **15,58ms**,p95 **14,87ms**, giữ gate200ms (`final-regression/integration-performance.json`).
- Health build mới port3001 trả **200/statusok**, `2026-10-06T03:18:36.785Z`; owned process đã dừng, không đụng app demo.
- Full HTTP `outcome-http`: **2000samples**,10vòng đều100success/100conflict/100rights, **45checks**, totalp95 **194,3251ms**,steadyp95 **147,5391ms**,nfrPass=true. Cache/workerrestart thật, toàn bộfirstburst giữ trongtotal. Windows local Node24.19, chưa phảiCI hoặc guarantee mọi runner.

## Deploy / trạng thái

Đã `prisma migrate deploy` migration mới vào hai DB test15432/15434; không reset/dbpush hoặc đụng DBdemo/remote. API mới cần deploy cả migrationv1/v2/v3 trước chạy; thiếu routine failclosed503. Các function trước giữ nguyên cho rollback app; nếu xóa function đãdeploy phải thêm migrationbù. Không thêm dependency hoặc runtime pool.

Snapshot local trước commit/push. Cần kiểm **đúng SHA mới** trên GitHub, giữ lại mọi FAIL cũ; không lấy một lượt rerun cùng code để chứng minh ổn định300ms. Chưa merge main; authdurability cache khôngpersistence là giới hạn ngoài hai task đã ghi từ trước.
