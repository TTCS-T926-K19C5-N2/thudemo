# CI fae4379: chưa đạt NFR

Commit `fae4379db3739d493771301aa86314790b6d1dc4`, 06/10/2026. Migration routine v1 đã chạy được trên CI, không phải lỗi runner-acquisition cũ.

- [Push 37406052403](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/37406052403): build/lint PASS, test FAIL 49/50 E2E; max GET 2000 ghế **215,210344 ms**, ngưỡng vẫn 200 ms. Suite S-15/S-16 33/33 PASS; T-31/K-01 skipped do dependency test, không được tính PASS.
- [PR 37406056682](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/37406056682): build/lint/test/K-01 PASS; T-31 FAIL. Đủ **45 correctness checks**, 2000 mẫu, 10 vòng mỗi vòng 100 success/100 conflict. Total p95 **347,06848 ms**, steady **190,903927 ms**, first burst p95 **413,194654 ms**; không bỏ mẫu đầu hoặc lấy steady thay total.

Kết quả xác nhận routine v1 chưa đủ đạt 300 ms trên CI dù local PASS. Không rerun cùng code để tìm một lượt xanh, không đổi `ci.yml`, không merge main. Sau báo lỗi cho người dùng, triển khai tiếp routine v2 validation trước COMMIT và giảm round-trip JSON projection live của sơ đồ; bằng chứng v5 phải tách khỏi kết quả commit này.

Seat-JSON local trước v2: `seat-json-regression` 50/50 E2E, max GET 18,36 ms; `seat-json-final` 50/50, max17,91 ms. Benchmark `seat-json-http` total/steady 189,66/128,42 ms; `seat-json-final-http` 208,67/110,75 ms, mỗi lượt 45 checks. Đây là thử nghiệm local, không thuộc code fae4379 và không phải CI PASS.
