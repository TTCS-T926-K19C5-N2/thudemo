# CI follow-up: 48afbf1, 06/10/2026

Code ứng dụng giống 75edc2a; commit này chỉ thêm chẩn đoán và cập nhật báo cáo. Không dùng rerun cùng code để tuyên bố NFR đã ổn định.

| Run | Kết quả | T-31 total / steady p95 |
|---|---|---|
| [PR 37404313213](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/37404313213) | Cả 5 job acceptance PASS | 298,57 / 163,00 ms |
| [Push 37404309847](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/37404309847) | Build/lint/test/K-01 PASS; T-31 FAIL | 463,35 / 270,57 ms |
| [Diagnostic 37404309913](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/37404309913) | Profile có overhead, không thay acceptance; FAIL NFR | 533,33 ms total |

Hai run acceptance đều đủ 45 correctness checks, 10 vòng đúng 100 winner/100 conflict/100 unique rights, không lỗi khác. Các run 75edc2a trước đó vẫn FAIL 367,94 / 472,38 ms, không giấu hoặc bỏ khỏi báo cáo. Test chức năng S-15/S-16 và sơ đồ 2000 ghế PASS; hiệu năng 300 ms trên CI **chưa ổn định**, PR lần này chỉ còn khoảng 1,43 ms margin.

Diagnostic first burst: hai API đã có đủ 16 idle connections trước burst; pool acquire p95 334,82 / 321,37 ms, auth 98,79 / 145,17 ms, claim 113,49 / 144,09 ms. CPU profile tổng 10 vòng có `writev` 304/285 samples và `writeBuffer` 167/166, lớn hơn các JavaScript frame riêng lẻ. Dữ liệu cho thấy chi phí truyền dữ liệu và chờ pool đáng kể; không chứng minh duy nhất PostgreSQL, API hoặc runner là nguyên nhân. Vì không có A/B cùng hardware, không khẳng định readiness đã giúp CI từ một lượt xanh.

`main` chưa merge, không sửa `ci.yml`/ngưỡng hoặc skip case. Workflow diagnostic chỉ trigger khi chính file workflow thay đổi trên `test`; không tự chạy trên mọi commit hoặc trên `main`. Báo cáo follow-up này được ghi local sau khi đọc CI, chưa nằm trong commit 48afbf1.

## Cần chốt trước bước sâu hơn

Một phương án là gom claim và đọc state vào một hàm PostgreSQL có transaction/rollback và snapshot/clock đúng, giảm trao đổi API↔DB. Đây là **đề xuất**, chưa triển khai; cần thêm migration mới và chuyển một phần logic giữ ghế vào DB, không chỉ sửa transport. Phải kiểm đủ all-or-none, chờ khóa qua hạn, snapshot đầy đủ, giá/đơn/TTL 600 giây và đo lại trên CI, không cam kết trước rằng sẽ dưới 300 ms.

Nguồn thiết kế cần giữ đúng: [VOLATILE lấy snapshot mới cho từng query trong function](https://www.postgresql.org/docs/15/xfunc-volatility.html), [PL/pgSQL error/rollback](https://www.postgresql.org/docs/15/plpgsql-control-structures.html#PLPGSQL-ERROR-TRAPPING). Không dùng function STABLE/IMMUTABLE cho claim/state có biến động, không đưa COMMIT lên trước kiểm tra kết quả hoặc dựa vào snapshot trước lock wait. Chờ người dùng xác nhận thay đổi triển khai sâu này trước khi thêm migration.
