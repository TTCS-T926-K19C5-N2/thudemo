# Tối ưu tiếp sau CI ad6fcdc

06/10/2026, branch `test`. Base `ad6fcdc`. Không thay main, frontend, auth, pool, migration hoặc ngưỡng test.

## Vì sao cần tiếp tục

CI ad6fcdc vẫn FAIL NFR: [run 37359608345](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/37359608345), total p95 375.21 ms, steady p95 267.33 ms; 45 correctness checks PASS. Đã báo người dùng trước khi tiếp tục sửa.

Đối chiếu baseline `bae2771` trước S-15/S-16: [run 37328641398](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/37328641398) cũng FAIL cùng assertion; total p95 594.45 ms, steady 438.08 ms. Không gán toàn bộ lỗi cho thay đổi S-16 hoặc suy ra causal effect từ các runner khác nhau.

## Implementation

- Gộp validation/SHARE-lock showtime, upsert hold session/snapshot và ordered seat claim thành một SQL CTE với dependency qua RETURNING. Phiên chỉ được ghi khi suất ON_SALE và tất cả ghế có giá/thuộc suất. Các constraint, lock order và rollback cả batch giữ nguyên.
- Giữ riêng câu lệnh `state()` sau CTE hoàn tất: đọc snapshot mới và clock DB sau mọi lock wait. Không đọc trực tiếp các table mới sửa trong cùng snapshot CTE rồi trả trạng thái cũ. Tham chiếu semantics: [PostgreSQL 15 data-modifying WITH](https://www.postgresql.org/docs/15/queries-with.html#QUERIES-WITH-MODIFYING).
- So với code 240ae2d: 5 lượt SQL trong callback giữ ghế thành công -> 2 (CTE + fresh state). Đây là giảm round-trip; vẫn BEGIN/COMMIT transaction, kiểm auth mỗi request và giữ đầy đủ validation.
- Không chuyển ownership sang cache/RAM, không tăng pool, không giảm durability, không đổi 10 phút hoặc bỏ lượt đầu để làm xanh gate.

## Regression và lỗi test vừa phát hiện

Lượt E2E trước sửa kỳ vọng: 44/45 PASS; một test trong sprint2 sai vì mặc định request A luôn thắng race tạo đơn. Khi B thắng, A tái sử dụng đơn với serverTime muộn hơn 16 ms nên còn 599984 ms là đúng. Đã báo người dùng trước sửa. Raw failure giữ tại `regression/e2e-failure-before-test-fix.json`.

Sửa test chọn đúng phản hồi created=true để kiểm chính xác 600000 ms; đồng thời kiểm response reused có cùng deadline và thời gian còn lại >0, <=600000. Không thay OrdersService hoặc nới kiểm 10 phút của creator. Các assertion một đơn, đúng giá, đầy đủ ghế giữ nguyên.

Thêm TC-S16-20 (3 input/state cases không ghi side effect), TC-S16-21 (lock wait thật quan sát qua pg_stat_activity; clock mới sau chờ phải từ chối expired hold). Kiểm song song snapshot/session và trả trạng thái đầy đủ vẫn trong suite.

Kết quả regression cuối local: 45/45 E2E (6 files), suite S-15/S-16 28/28; unit 23/23; lint/typecheck/build PASS. Health API local 200 ok. JSON `regression/e2e-results.json` và `regression/integration-performance.json`.

## Hai lượt đo sau CTE

Cùng hai container test tại 15434/16382, hai API Nest, mỗi lượt 2000 requests/10 rounds, 45 correctness checks. Fixture được dọn theo UUID run. Dữ liệu demo không bị thay đổi.

| Lượt | Total p95 ms | Steady p95 ms | Checks | NFR |
|---|---:|---:|---:|---|
| after-1 | 272.60 | 241.40 | 45/45 | PASS |
| after-2 | 253.26 | 198.57 | 45/45 | PASS |

Không loại sample outlier: round 10 của after-1 p95 376.27 ms vẫn trong total/steady. Threshold gốc kiểm total và steady <300 ms, không kiểm p95 từng round. Cả hai lượt exit0, đủ 100 winners/100 conflicts/100 unique claims mỗi vòng; worker startup/cadence/restart và cache restart thật PASS.

Giới hạn: Node fetch loopback cùng máy Windows + Docker, không phải staging/production. Số đo có nhiễu; CI commit mới phải đối chiếu riêng. Tại lúc tạo báo cáo, chưa xác nhận CI cho bản CTE.
