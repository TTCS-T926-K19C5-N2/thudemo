# B1 A — Kiểm chứng migration và tải v6

Cập nhật 2026-10-22, branch `integration/candidate-1`. Điểm bắt đầu `799fc8828dc1db35979ac05c7035ef29e7a1b42f`; mã sản phẩm từ `ae40a3772210a9d7ec0febc810acff6a404c8046`. B0 giữ nguyên. Chỉ thực hiện phạm vi A người dùng đã chọn; **dừng trước Sprint 1–3**.

## Kết quả 1: chuỗi migration

| Đường kiểm chứng | Kết quả thực |
|---|---|
| DB trống `b1a_empty_20261022140815` | **46/46 PASS**, 0 failed |
| DB v4 tái dựng `b1a_v4_20261022140815` | **35→46 PASS**, 0 failed |
| Deploy lần hai ở cả hai DB | PASS, no pending migrations |
| Bảo toàn fixture | Hash trước/sau `6f4867c8c5a8ab7d33fbc443e8220fbf` giống nhau |
| Recovery v6 sau upgrade | Đăng nhập locator khác vẫn trả cùng hold id, token và deadline gốc |

35 migration lịch sử được lấy trực tiếp từ immutable SHA `34deec00c18ac987a7db56e9d1c61abac2222bca`; cùng nội dung SQL với prefix candidate sau chuẩn hóa LF/CRLF. Dựng bằng `prisma migrate deploy`, không tự chèn/bỏ qua metadata `_prisma_migrations`. Trước upgrade chỉ có v1–v4; sau có v1–v6, v6 vẫn return sáu trường. Fixture gồm user, event, showtime, category, seat, hold/session, pending order/item; so sánh dữ liệu cột cũ, cho phép cột `isDemo` mới được backfill false.

Đây là **DB v4 tái dựng từ migration lịch sử với dữ liệu tổng hợp**, không phải restore DB staging thực tế. Không đọc credentials/dữ liệu staging, không restart container staging. Bằng chứng không xác nhận DB đang dùng đã không có drift. Trước deploy thật vẫn phải đối chiếu read-only migration/checksum/routine trên đúng DB đích.

Evidence: [migration-results.json](../.integration-b1a/migration-results.json), [checks.json](../.integration-b1a/checks.json), [fresh log](../.integration-b1a/empty-candidate-deploy.log), [v4 log](../.integration-b1a/historical-v4-deploy.log), [upgrade log](../.integration-b1a/v4-to-candidate-deploy.log). `checks.json` giữ receipt cả lần 42 migration ban đầu và lần cuối 46; các log tên cố định hiện chứa lần cuối.

## Kết quả 2: 200 request / 100 ghế ×10

Harness sản phẩm gốc `apps/api/scripts/verify-holds-http.mjs`, không sửa assertion, dataset, worker/pool hoặc ngưỡng. Wrapper chỉ tạo khóa test tạm trong RAM và truyền cấu hình fixture. Hai Nest API thật trên 3301/3302, 10 kết nối/API; cookie/session DB thật, 200 BUYER, mỗi ghế hai người tranh chấp, 10 lô ghế tách biệt. HTTP end-to-end qua Node fetch loopback, gồm xác thực, rate guard, SQL/commit và parse JSON; không chỉ đo SQL. Showtime fixture unlimited để buyer thắng nhiều vòng không vi phạm quota; quota có hồi quy riêng trong E2E, không được suy chứng minh quota từ bài này.

Windows, Intel i5-13500H (12 core/16 logical), Node v24.21.0, PostgreSQL 15 Alpine Docker. Container PG riêng `thudemo-integration-b1a-pg` trên 15434; Redis riêng của integration trên 16382. Không áp tăng `BOOKING_*`, không tăng pool/worker, `GITHUB_ACTIONS` bỏ trống nên ngưỡng luôn **300 ms**, không dùng ngưỡng CI 800 ms. Không chạy build/test đồng thời với 10 burst cuối.

| Lần chạy (mỗi lần 2.000 mẫu) | p95 toàn bộ ms | p95 steady ms | p95 vòng cao nhất ms | Gate tổng của harness | Harness |
|---|---:|---:|---:|---|---|
| baseline-v6 | 339.77 | 266.46 | 451.63 | FAIL | 42/42; hoàn tất |
| diagnostic-v6 | 356.55 | 236.92 | 440.53 | FAIL | 42/42; hoàn tất |
| after-seat-lock | 386.21 | 256.21 | 531.13 | FAIL | 42/42; hoàn tất |
| after-lock-restore | 294.09 | 251.49 | 453.69 | PASS | 42/42; hoàn tất |
| after-lookup-index | 344.00 | 287.53 | 451.10 | FAIL | 42/42; hoàn tất |
| final-v6 | 347.26 | 266.96 | 472.66 | FAIL | 41/42; Restart worker drains new backlog |
| final-v6-verified | 297.88 | 236.47 | 381.36 | PASS | 42/42; hoàn tất |

Mọi lần đều đúng ghế **10/10 vòng**: tổng 1.000 HTTP200 +1.000 HTTP409, 0 lỗi khác; mỗi lô đúng 100 quyền còn hạn /100 seat id duy nhất. Không gộp hoặc bỏ mẫu để hạ p95. Percentile nearest-rank `ceil(n×0.95)` trên toàn bộ 2.000 mẫu; steady là 1.800 mẫu vòng 2–10, chỉ số phụ.

Lần xác nhận cuối: **p95 tổng 297.88 ms <300**, steady **236.47 ms**, harness hoàn tất 42/42 check và exit0. Tuy nhiên **2/10 vòng vượt 300 ms**, và các lần trước có fail; **chưa có bằng chứng NFR ổn định qua các lần chạy hoặc staging**. Không gọi đây là toàn bộ AC/DoD đã Done.

| Vòng cuối | HTTP200 | HTTP409 | Lỗi khác | Quyền/ghế duy nhất | p95 ms | So ngưỡng 300 |
|---|---:|---:|---:|---|---:|---|
| 1 | 100 | 100 | 0 | 100/100 | 381.36 | FAIL |
| 2 | 100 | 100 | 0 | 100/100 | 238.25 | PASS |
| 3 | 100 | 100 | 0 | 100/100 | 189.01 | PASS |
| 4 | 100 | 100 | 0 | 100/100 | 216.83 | PASS |
| 5 | 100 | 100 | 0 | 100/100 | 191.37 | PASS |
| 6 | 100 | 100 | 0 | 100/100 | 172.88 | PASS |
| 7 | 100 | 100 | 0 | 100/100 | 186.71 | PASS |
| 8 | 100 | 100 | 0 | 100/100 | 301.52 | FAIL |
| 9 | 100 | 100 | 0 | 100/100 | 224.67 | PASS |
| 10 | 100 | 100 | 0 | 100/100 | 245.72 | PASS |

Lần `final-v6` giữ lại nhưng không tính harness pass: build chạy quá sớm trong phần worker, xóa/rebuild `dist` khiến worker-restart thiếu module. 10 burst đã hoàn thành trước build, nhưng toàn bộ suite không hoàn tất; đã đo lại `final-v6-verified` sau E2E, không chạy build/test chồng. Cache restart cũng **NOT RUN**: harness hardcode tên container donor; không restart tài nguyên đó. Không gán bằng chứng local thành staging.

Raw đầy đủ 2.000 mẫu/lần: [baseline](../.integration-b1a/baseline-v6/http-concurrency.json), [profiling](../.integration-b1a/diagnostic-v6/http-concurrency.json), [khóa ghế](../.integration-b1a/after-seat-lock/http-concurrency.json), [bù khóa](../.integration-b1a/after-lock-restore/http-concurrency.json), [chỉ mục](../.integration-b1a/after-lookup-index/http-concurrency.json), [lần chồng build](../.integration-b1a/final-v6/http-concurrency.json), [xác nhận cuối](../.integration-b1a/final-v6-verified/http-concurrency.json). Hash và số đo trong [summary.json](../.integration-b1a/summary.json).

## Kết quả 3: hai thử nghiệm SQL forward

Baseline fail 339,77 ms. Profiling tách riêng ghi queue lấy connection p95 khoảng238–241 ms ở vòng1; routine p95 khoảng41–44 ms. `pg_stat_user_functions` thấy 2.012 lần gọi v6 (2.000 burst và các ca tiền kiểm), 1.412 lần gọi v1; ngoài các winner còn có đường race ghi rồi rollback. Đây là cơ sở thử serialize seat trước known-conflict read, không phải số đếm chính xác race riêng của burst. Không suy từ đó rằng DB là điểm nghẽn duy nhất; CPU Node/HTTP/cold plan cũng còn tác động.

| Migration mới | Thay đổi/đo lại | Quyết định |
|---|---|---|
| `202610220008_claim_seat_row_lock` | v4 khóa seat row theo id với NO KEY UPDATE sau show SHARE; giữ checks/return/API. p95 386,21 ms | Không giữ chiến lược: chậm hơn |
| `202610220009_restore_claim_lock_strategy` | Khôi phục định nghĩa/lock v4 gốc bằng migration bù, không sửa 008. p95 294,09 ms | Đo bù; vòng1 vẫn453,69 ms |
| `202610220010_account_round_lookup_index` | Index `(showtimeId,userId,expiresAt DESC,id DESC) INCLUDE(sessionHash)`. EXPLAIN bỏ Sort, dùng Index Only Scan; p95 HTTP344,00 ms | Không giữ index: không cải thiện workload đáng tin cậy |
| `202610220011_revert_account_round_lookup_index` | DROP đúng index mới qua migration bù, không sửa 010. Đo347,26 ms rồi xác nhận cuối 297.88 ms | SQL cuối về chiến lược gốc; gate độ ổn định còn mở |

Giữ cả bốn file đã áp dụng để không rewrite lịch sử DB thử. Không chỉnh bất kỳ migration gốc nào hoặc source/caller/API. Sau hai thử nghiệm không tiếp tục mở rộng thay đổi. [So sánh schema](../.integration-b1a/schema-equivalence.json) bằng `pg_dump --schema-only --no-owner --no-privileges` trên DB42 và DB46 cho kết quả giống nhau sau chuẩn hóa newline và sentinel ngẫu nhiên của pg_dump: SHA256 `c6a852c62e89e2d1c8bf4395bcc0f6158d379ccbcfad5a4a06dd95e97d4465ab`. Bằng chứng plan [trước](../.integration-b1a/plan-before-index.json) / [sau](../.integration-b1a/plan-after-index.json). Hai plan là diagnostic riêng, không được thay cho số đo HTTP.

### Migration cũ bị loại khỏi tập nhập

| Đường dẫn tương đối từ `apps/api/prisma/migrations/` | Lý do |
|---|---|
| `202610190002_account_hold_recovery/migration.sql` | v5 recovery 19/10 đụng v5 quota/demo/audit 22/10 |
| `202610190003_atomic_account_quota/migration.sql` | v6 quota chín trường đụng v6 recovery sáu trường; phụ thuộc v5 donor |
| `202610190004_configurable_hold_ttl/migration.sql` | v7 phụ thuộc họ v6 donor, thay v1; TTL cấu hình chưa được tích hợp theo A |

Ba file vốn không có trong candidate; loại nghĩa không nhập, không phải xóa. Không xóa/sửa file ở 27 thư mục nguồn. Không tự nâng cấp DB đã dùng họ donor19/10; nếu gặp lineage đó phải dừng hòa giải riêng.

## Hồi quy và giới hạn nghiệm thu

| Gate cuối | Kết quả |
|---|---|
| `pnpm build` | PASS |
| `pnpm lint` | PASS, còn warning có sẵn |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS: 420 API +157 web +27 deployment =604, không worker flags |
| `pnpm --filter api run test:e2e` | PASS: 24 file /151 test, không worker flags |
| Harness load cuối | 42/42 check, exit0; p95 tổng pass sát ngưỡng, 2 vòng fail ngưỡng riêng |

E2E lần đầu trên Redis DB0 có 133 pass/9 fail/9 skipped do khóa đăng nhập IP từ các lần benchmark. Rerun dùng DB14 của chính Redis integration, xác nhận trống trước chạy; **151/151 pass**. Không flush dữ liệu/cache cũ, không đổi security limits hoặc bỏ test. [Lỗi đầu](../.integration-b1a/e2e.log), [rerun](../.integration-b1a/e2e-clean-cache.log), [build](../.integration-b1a/build.log), [lint](../.integration-b1a/lint.log), [typecheck](../.integration-b1a/typecheck.log), [unit](../.integration-b1a/test.log).

Kiểm an toàn: [safety-results.json](../.integration-b1a/safety-results.json) xác nhận 27 source dirs,1.202 implementation files và hai nguồn yêu cầu không đổi; mã API/web không đổi, migration gốc giữ nguyên. Không push/main/develop/reset/force, không cài thư viện hoặc in secret/.env. Người dùng phải review độc lập và xác nhận/nghiệm thu staging theo DoD; agent không tự đóng gate đó.

## Chạy lại

Chạy từ root integration với Python đã có; `run.py` dùng đúng Node/pnpm đã cache, không cài gì. Container PG15434 và Redis16382 của integration phải đang chạy; không dùng DB staging. Không chạy các lệnh bên dưới song song.

```powershell
docker start thudemo-integration-b1a-pg thudemo-integration-c1-redis
& 'C:\Users\Admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' .integration-b1a/run.py migrations
& 'C:\Users\Admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' .integration-b1a/run.py load rerun-UNIQUE
```

Mỗi load label phải mới để giữ raw cũ. Migration harness tạo DB mới theo timestamp, không drop/reset DB; v4 historical file chỉ được xuất trong scratch integration. Bài load tự dọn đúng fixture của lượt đó, giữ migration history. Quyết định được ghi tại [PLANS.md](../PLANS.md), mục “Quyết định đã chốt”, và [STATUS](STATUS.md).

Raw/log lớn được giữ tại workspace integration; summary và hash được commit cùng báo cáo. Không coi checkout chỉ có Git là đã bao gồm toàn bộ raw local. Các container chỉ của integration được dừng sau kiểm chứng, dữ liệu DB được giữ nguyên để đối chiếu.

**Điểm dừng: chưa tích hợp Sprint 1–3; chờ người dùng xác nhận.**
