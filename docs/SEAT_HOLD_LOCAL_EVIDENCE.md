# Nghiệm thu local quyền giữ ghế — DEC-12, 04/10/2026

**Kết luận: PARTIALLY DONE.** Tám task đã có implementation và bằng chứng local về correctness. NFR p95 dưới300ms **chưa đạt ổn định**; lần cuối script trả exit1 đúng gate. CI mới, staging, worker liên tục, PO acceptance và DoD chưa PASS. Không commit/push/PR/publish image/upload source/deploy. Không thay task/SP/Sprint/Owner/AC.

## 1. Quyết định và phạm vi

PO xác nhận trực tiếp PostgreSQL authoritative qua DEC-12; nguyên văn ở ../../docs/decision-log.md. Đây là mở gate **local**, không kết luận K-01 PASS staging. Giữ lịch sử spike trong [K-01](K01_EVIDENCE.md). Redis/Valkey cache/counter, không ownership. Migration additive202610040005; nguyên bản sau apply không sửa. Không có order/payment/S-11/full S-14 trong phạm vi.

## 2. Bảng nghiệm thu từng AC

| Task / AC | Thay đổi | Bằng chứng local | Kết quả hiện tại |
|---|---|---|---|
| T-22: owner/UTC expiry/index/T19 | hold_sessions+seat_holds, hash login session, timestamp UTC, expiry index, public JOIN cùng authority | migration005; HTTP+projection/check DB; migration cycle11history | AC local PASS; K01 staging/DoD Pending |
| T-23: empty200/deadline, closed409, thêm ghế cùng hạn/all-or-none | transaction SHARE showtime→session→ordered seats, rollback cả tập | real POST; same/retry/concurrent-session deadline; sequential và overlapping batch conflict | AC local PASS; NFR300ms FAIL lần cuối |
| T-24: clock drift/0 tự refresh | server time + monotonic performance.now, reload/reconnect; pending/confirmed/409/expired/network riêng | browser24checks, +1hour client clock, reload exact deadline,3expirychecks;6exact-ID Stitch captures | AC local PASS; staging/PO Pending |
| T-27: mỗi phút, repeat/count log, backlog/shutdown | worker entrypoint thật,60sec, bounded batches1000×10, no overlapping tick; logs safe | worker.log/worker-restart.log; minute fixture, repeat sweep, IPC graceful shutdown, restart backlog | AC local PASS; Free continuous worker **chưa đạt** |
| T-28: expiry trống dù job chưa chạy, DBclock | seat read/claim compares clock_timestamp, no browser/server wall clock authority | expired rows retained; API/map AVAILABLE before worker; test fixture only | AC local PASS |
| T-29: unique active owner, expired reclaim | PK seatId + conditional upsert, shared datastore not RAM lock | two actual API processes; all10 rounds100unique seats, oldexpiry reclaim, concurrent stale cleanup | AC local PASS; staging Pending |
| T-30: 409/list/log, no500 on constraint conflict | known secondary23505 translated after rollback, safe requestId/count log, unexpected503 | exact rejected list, no owner leak, every round100409/zeroother; earlier failure preserved | AC local PASS |
| T-31: authenticated200HTTP/100seats×10, CI gate | two independent fake buyers per seat, raw2000samples, assertion per round and NFR; separate CI job after test | [raw](../evidence/holds/20261004/http-concurrency.json);45invariant checks,100success+100conflict EACH round | Correctness local PASS; NFR FAIL; CI/staging AC Pending |

## 3. Hiệu năng trước/sau và giới hạn đo

Không xóa lượt chậm, không đổi threshold; raw p50/p95/p99/status của mọi request, chia success/conflict từng lượt. Nearest-rank;200 concurrency, Node fetch loopback cùng máy,2Nest processes, pool16/API, PG15 thật, synthetic buyer DB sessions được cookie guard kiểm mỗi request. Không Supertest/call service làm T31. Invariant/cleanup dùng DB kiểm kết quả, không thay HTTP claim.

| Lượt | Total p95 ms | Steady p95 ms | Kết luận |
|---|---:|---:|---|
| Trước tối ưu auth |352,54|307,04|FAIL; raw http-concurrency-pre-auth-optimization.json |
| Sau auth một SQL/pool16 |270,25|236,29|Một lượt PASS local; không chứng minh ổn định |
| Lượt cuối đủ restart/authlock/worker |750.96|549.57|FAIL; giữ gate đỏ |

Tối ưu thực hiện: session guard từ nhiều relation queries thành1SQL có index; vẫn kiểm verified/revoked/DBexpiry/role mỗi request. Pool10→16 có giới hạn rõ; không cache quyền auth, không bỏ validation/log/error. First burst lần cuối p95893.11ms; có invariant calls trước nên **không cold process**. API startup tới health2077.02ms; first valid hold41.90ms đã có preceding calls. Chưa đo cold request Render/sleep. Toàn lượt80s bao gồm minute worker; không là timing pipeline GitHub.

Lượt cuối chậm cả success/conflict; backlog/pool/transaction vòng HTTP200 request có hàng đợi, cùng máy Windows+Docker còn chạy app/browser. Chưa có trace/CPU/IO đồng bộ tại thời điểm tải nên **không gán nguyên nhân chắc chắn cho host**. Docker PG riêng không CPU/memory cap; max_connections100. Số đo sau tối ưu biến động mạnh, cần môi trường đo kiểm soát và trace query/pool/HTTP trước khi kết luận NFR. Không tăng thêm pool vô hạn hoặc đổi durability/fsync/transaction để tạo PASS. Không gọi kết quả local dưới300 là RenderFree đạtNFR.

## 4. Restart, worker và security review

- Restart API thật giữ đúng owner/deadline. Hai API chia cùng DB, unique owner cưỡng chế tại PG. New token không bị hai stale cleanup đồng thời xóa. Worker60sec có log count, startup/restart drain, repeat idempotent, graceful IPC stop exit0; shutdown hooks cho SIGTERM/SIGINT. Render API scheduler chỉ chạy khi thức; Free không có continuous worker. Không dùng ping giả worker.
- Valkey8 không persistence restart thật: representative counter mất; **khóa đăng nhập thật sau5failure cũng mất**, login đúng password sau restart200. PostgreSQL quyền giữ còn nguyên. Đây là rủi ro anti-abuse có evidence, không tự coi DEC12 miễn yêu cầu này. Cache unavailable vẫn failclosed theo auth contract hiện có. Chưa kiểm managed Render hoặc DB provider restart của migration này; spike PG restart là bằng chứng research riêng.
- Review thủ công code/diff: parameterized SQL; server owner/session; default-deny BUYER; cross-origin403; login/logout/revoked401 trên image; strict unknown input/UUID normalization; atomic rollback; no owner/token/hash leak in responses; safe count/requestId logs. Không claim formal scan bảo mật hoặc review độc lập.
- MUST FIX đã sửa: secondary unique race500→409; case-equivalent UUID duplicate; stale GET trong POST không ghi đè confirmation; successful response mất được reconcile bằng GET; gần expiry không200null; mobile summary/overflow không che map. Test harness expectation authlock403 sai contract429 đã sửa harness, không sửa API né test. All historical failure files giữ nguyên.
- OPTIONAL không thực hiện: tracing sâu/pool instrumentation, independent performance host, order linkage/release/recovery/payment, lifetime hold_session retention policy, cleanup retention không có phê duyệt. NFR đang FAIL là remaining required gate; không xếp nó thành optional.

## 5. Regression, migration và profile

- Frozen lockfile; pnpm lint/typecheck/test/build PASS, unit API6+web14=20. 14lint warnings baseline; Vitest config/plugin warning baseline không tắt. Integration PG/Redis thật4files/10tests PASS cuối. Không dependency upgrade trong DEC12.
- Browser regression106checks/33captures/0JSerrors; warm2k rendering30navigations p95152,9ms. Hold flow24checks/8captures và expiry3checks/3captures/0JSerrors. Expiry seam chỉ cập nhật quyền fixture của run; TTL sản phẩm600000ms giữ nguyên. Lost-response fixture abort sau real upstream POST, GET xác nhận3quyền thật; không mocksuccess. Sau kiểm dọn chỉ run IDs, bảo toàn dữ liệu giả khác.
- [Ledger29](STITCH_FIDELITY_LEDGER.md):43live screens,29exact IDs/HTML/rawPNG/CSS render;6state mới được xem source/app theo cặp. [Gallery](../evidence/holds/20261004/index.html) là artifact review, không UI sản phẩm. 2k canvas/rowR00 khác illustration; mobile summary flow thay fixed overlay, còn sai khác đã ghi, không pixel-identical.
- Original9migrations applied; cycle trên DB local mới sang_holds_migration_cycle:9apply→006compensate→007reapply,11history còn nguyên. Không reset/dropdatabase/dbpush. Compensation SQL từ chối nếu hold tables có dữ liệu, không chạy trên appDB đang dùng. Original005 đã applied là immutable. WIP/migration hash review cuối riêng.
- Render schema guards+5negative PASS offline; actionlint1.7.11 PASS. New image Docker targetrender build frozen PASS; chạy nonroot node, API/web512MiB+0,5CPU tại3201/3200. [Smoke8checks](../evidence/holds/20261004/render-image-smoke.json) actualproxy/auth/hold/deadline/origin/logout/revocation PASS. Đây là Docker local, không Render/TLS/rollout/latency proof.

## 6. Lệnh tái hiện

Từ thudemo, Node24.21.0/pnpm10.15.1/Docker Desktop Linux đang chạy. DB/API fixtures không production. Mật khẩu demo từ nơi riêng trên máy, không chat/evidence.

```powershell
npx --yes pnpm@10.15.1 install --frozen-lockfile
./scripts/verify-stitch-correction.ps1 -Run holds/20261004
$env:SPRINT2_EVIDENCE_DIR='../../evidence/holds/20261004'
./scripts/run-sprint2-local.ps1 -Mode Test
./scripts/run-sprint2-local.ps1 -Mode Migrate -Database stitch_fidelity
# Ba cửa sổ local: Api, Web và Worker
./scripts/run-sprint2-local.ps1 -Mode Api -Database stitch_fidelity
./scripts/run-sprint2-local.ps1 -Mode Web -Database stitch_fidelity
./scripts/run-sprint2-local.ps1 -Mode Worker -Database stitch_fidelity
```

Benchmark cần DB sang_holds_local mới/riêng tại15434 và owned Valkey container sang-holds-cache-20261004 tại16382, migrations deployed trước. Đặt DATABASE_URL qua env với credential test local riêng, REDIS_URL=redis://127.0.0.1:16382, HOLDS_DOCKER đường dẫn DockerCLI; chạy `node apps/api/scripts/verify-holds-http.mjs`. Script hardguard target, exit1 khi correctness/NFRfail; không dùng URL production. Không chạy đồng thời nhiều instance script chung cổng3301/3302. Lệnh migration cycle `./scripts/verify-hold-migrations.ps1` dùng DB riêng đã tạo; lần đầu cycle11history, chạy lại chỉ up-to-date, không giả freshcycle. Browser CLI helpers dùng private fixture descriptor .git; full commands/checkpoints ở logs.

## 7. Rollback và gói GitHub (chỉ đề xuất)

Rollback code chọn lọc so với `.git/hold-local-wip-20261004/{before.patch,files,manifest.json}`, parentdecision/architecture snapshots; giữ WIP trước phiên. Không reset/clean/delete.env/database/migration. Schema additive có thể giữ khi rollback app; tắtscheduler bằng HOLD_EXPIRY_MODE=off và dừng đúng worker do phiên này tạo. Không phục hồi code cũ rồi tuyên bố vẫn có hold. Schema bù chỉ mới sau backup/đánh giá khi thực sự cần; template verified chỉ trên rỗng. Không chỉnh/xóa005 đã áp dụng.

- Branch đề xuất: `task/sprint2-postgres-seat-holds`; branch WIP hiện tại không đổi.
- Commit: `feat(holds): implement PostgreSQL seat ownership and local acceptance evidence`.
- PR title: `Implement atomic seat holds, server countdown and local expiry worker`.
- PR description: DEC12 local temporary PGauthority; atomic batches/409/originalTTL, APIauth1SQL, worker/stalecleanup,6Stitchstates, realHTTP200/100×10, separateCIjob and Freeprofile. Local20unit/10integration/browser/migration/imagegates pass. **Latest NFR FAIL750,96ms; staging/CI/continuousworker pending. Do not merge as SprintDone.** Preserve priorWIP, no secrets, no remote writes.
- AC checklist: owner/expiry/T19 [x]local; atomic/deadline/closed409[x]; clock/reload/reconnect/expiry6states[x]; workerrepeat/log/backlog/shutdown[x]; T31counts10[x]; NFRstable300[ ]; CInew[ ]; stagingT31[ ]; continuousworker[ ]; POacceptance[ ]. Reviewer focus: session revocation/SQLscope, all-or-none/constraints, stale token, near-expiry, nofakeUI, authlockrestart risk, negativeconfigguards, migration/WIP.
- Merge order only after review/authorization: additive schema+backend/query+worker → product UI/contracts → CI/profile/tests/evidence. Keep compatible migration deploy before updated API; no external actions performed.

## 8. Remaining gates

PO review implementation/gallery/raw failures. Engineering: trace/reproduce NFR in controlled load environment and fix within scope until stable<300, not waive. Before staging, provide authorized Free Dashboard env with secrets entered privately, verify available DB connections/cache/TLS/worker limits. Only after new explicit remote authorization commit/push/PR/upload/deploy. Then run real CI, red negativecheck, requiredcheck/protection ifpermission, stagingT31×10, health/login/rollback/timing/cold-start/continuousworker evidence. Free sleep prevents claiming continuous worker; deployment choice/AC change remains explicit PO decision, not an exception silently added. K01 staging and Sprint100% remain pending.


## 9. Công cụ và kiểm tra WIP cuối

| Công cụ/skill | Mục đích | Bằng chứng/giới hạn |
|---|---|---|
| supabase:supabase-postgres-best-practices | Lock order, transaction và index PostgreSQL | Self-hosted PostgreSQL local; không Supabase MCP write |
| vercel:nextjs; build-web-apps:shadcn; frontend-app-builder | Domain UI/contracts, compose component đã có, giữ source Stitch | Không thêm dependency/component trùng hoặc đổi design |
| vercel:react-best-practices | Review TSX, effect cleanup, request races, derived state | Review thủ công sau sửa; không claim audit bên ngoài |
| vercel:agent-browser-verify; playwright-cli; CUA | Quick browser check và automated real API workflow, keyboard/mobile/network/expiry | Captures và browser JSON; không staging proof |
| Stitch MCP get_project/get_screen/list_screens | Đọc exact source ID/HTML/render và inventory43screens | Chỉ đọc; không tạo/sửa/upload project |
| Docker/Prisma/pnpm/actionlint/Python | Build/runtime, migration, test/CI syntax, schema validation và WIP hash | Local; không publish/CI từ xa |
| Web official PostgreSQL/Render docs | Kiểm semantics ON CONFLICT và Free profile | Không provisioning/dashboard write |

Không cần Stripe, Figma, Sentry hoặc ghi GitHub/Vercel/Render/Supabase cho phạm vi này. Review security là code/test thủ công; không gọi đó là một scan công cụ quét bảo mật đã hoàn tất.

Snapshot160file:136giữ nguyên hash,24file sửa có chủ đích;0WIP bị mất; pnpm-lock.yaml giữ nguyên hash so với đầu DEC12. Chín migration ứng dụng có checksum đúng lịch sử DB, cycle11history retained. .env đang được ignore và không có file .env được tracked. Evidence không chứa password demo riêng hoặc raw cookie/token kết nối. Danh sách từng file cũ/mới và parentdocs ở [changed-files.json](../evidence/holds/20261004/changed-files.json). Không coi Dockerfile/lockfile và toàn bộ dirty worktree trước phiên là thay đổi mới của DEC12.


## 10. File theo task (so với WIP đầu DEC-12)

| Task | File/module chính |
|---|---|
| T-22, T-29 | apps/api/prisma/schema.prisma; migrations/202610040005_seat_holds/migration.sql; src/holds/holds.service.ts; src/holds/holds.module.ts; src/app.module.ts |
| T-23, T-30 | src/holds/holds.controller.ts và holds.service.ts; src/auth/guards/session-auth.guard.ts; src/prisma/prisma.service.ts |
| T-27, T-28 | src/hold-expiry-worker.ts; src/holds/hold-expiry.scheduler.ts; src/showtimes/showtimes.service.ts; scripts/run-sprint2-local.ps1; apps/api/package.json |
| T-24 | apps/web/src/features/seat-selection/{seat-selection.tsx,server-countdown.ts,server-countdown.spec.ts}; lib/contracts/holds.ts; components/seat-map/seat-map.tsx; app/product.css; copy trong login-form/event-catalog |
| T-31 | apps/api/scripts/verify-holds-http.mjs; .github/workflows/ci.yml; browser flow/fixture helpers; scripts/verify-hold-migrations.ps1; prisma/verification/holds-compensate.sql |
| Profile/bằng chứng của tám task | render.yaml; scripts/verify-render-profile.py; verify-hold-render-local.mjs; regression runner; README; K01/POreview/handoff/ledger/runbook; parent decision-log/architecture; evidence/holds/20261004 |

Các module src trên thuộc apps/api; không thêm implementation song song. File đã có trước phiên giữ nguyên phần WIP không liên quan; chi tiết hash/file mới ở changed-files.json. Dockerfile/.dockerignore/lockfile/package web thuộc WIP trước, không thay thêm trong DEC12. Raw logs được giữ local dù *.log đang ignore; khi review remote sau này cần chọn artifact phù hợp, không upload .git/private password/dump/.env.
