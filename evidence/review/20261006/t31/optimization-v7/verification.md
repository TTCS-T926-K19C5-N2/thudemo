# Optimization-v7: bounded shared-pool concurrency

06/10/2026, branch `test`, base `773a18e`. Người dùng cho phép tối ưu hợp lý, commit/push test và kiểm CI; không merge main.

## Phạm vi / tradeoff

V6 CI cả PR và push giữ đầy đủ correctness nhưng total p95 616.51 / 533.52 ms vẫn FAIL. Conflict dự kiến không còn PostgreSQL ERROR, nên không thể coi server-log overhead là nguyên nhân duy nhất. [CI v6](../optimization-v6/ci-773a18e.md).

Chỉ thay giới hạn shared Prisma/PostgreSQL pool: API max/min/readiness 4 thay 16; expiry worker max/min/readiness 1. Hai API dùng tối đa 8 kết nối thay 32. Tải vẫn **200 HTTP request đồng thời**, 10 vòng, 2000 mẫu; pool xếp hàng các DB operation, không bỏ request hoặc giảm số buyer. Giảm planning contexts/lock contenders có thể tiết kiệm tài nguyên ở runner ít CPU, nhưng cũng có thể giảm throughput ở máy mạnh. Không khẳng định cấu hình này tối ưu mọi môi trường.

Không thay SQL routine/rollback/pipeline, schema/migration, UI, auth/roles/CSRF, giá/snapshot đơn, idempotency, hạn thanh toán **600 giây**. Không đổi `ci.yml`, ngưỡng 300/200 ms, warm-up hoặc loại first burst. Metadata `apiPoolPerInstance` của benchmark đổi 16→4 để mô tả đúng cấu hình, không đổi phép đo/gate.

## Local verification

- Build/lint/typecheck toàn workspace PASS; **83/83 unit** (API66 + web17), **3/3 helper** PASS.
- **52/52 E2E**, 6 files, suite S-15/S-16 **35/35**, không skip. Giá theo hạng/missing-price/old-price snapshot, đủ ghế/hết hạn/chống tạo đơn trùng, timeout rollback, lock-wait fresh clock, autocommit routine rollback, 2000 ghế và live-seat privacy đều PASS. Raw `final-regression/e2e-results.json`.
- GET 2000 ghế / 30 mẫu: max **17.9501 ms**, p95 **15.6821 ms**, giữ gate 200 ms. Raw `final-regression/integration-performance.json`.
- Build health port3001 **200/status=ok**, timestamp `2026-10-06T03:30:33.753Z`. Dừng đúng process do kiểm thử khởi chạy, không dừng app demo.
- Full HTTP `pool4-http`: **45 checks**, 2000 mẫu, mỗi vòng 100 success/100 conflict/100 rights; total p95 **198.9969 ms**, steady **189.9982 ms**, first burst **212.9355 ms**, nfrPass=true, exit0. Metadata số pool trong raw lượt này còn hard-code16 từ script cũ; **pool thực tế là4** (source đã đổi trước build/launch). Giữ nguyên raw, không chỉnh thời gian/requests; chạy thêm lượt `pool4-http-metadata` sau sửa metadata.
- So với v6 cùng máy (total194.33/steady147.54/first249.80 ms), first burst giảm nhưng steady chậm hơn; local không chứng minh CI hoặc production capacity.
- Lượt xác nhận metadata `pool4-http-metadata`: apiPoolPerInstance=4, **45 checks**, đủ2000mẫu/10vòng100success/100conflict/100rights, totalp95 **169.4885 ms**,steady **154.5441 ms**,first **223.7144 ms**,nfrPass=true,exit0. Giữ cả hai lượt local, không chọn một lượt thay cho CI.

## Trạng thái

Snapshot trước commit/push. Cần CI **đúng SHA mới** với workload/gate cũ; chưa xác nhận NFR CI <300 ms. Mọi FAIL lịch sử được giữ, không lấy local thay CI, không merge main. Không đụng DB demo hoặc migration đã áp dụng; chỉ dùng DB test15432/15434 và cache test16382.
