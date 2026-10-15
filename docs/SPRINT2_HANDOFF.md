# Checkpoint DEC-12 — hiện hành

T-22/23/24/27/28/29/30/31 đã triển khai và kiểm correctness local theo phê duyệt PGauthority. NFR300ms lần cuối FAIL; tổng Sprint PARTIALLY DONE, không Done hoặc đổi task nguồn. Không còn chờ PO chọn kho giữ cho local. Xem [POreview](SPRINT2_PO_REVIEW.md) và [8task evidence](SEAT_HOLD_LOCAL_EVIDENCE.md) để chạy đúng API/web/worker, raw/ảnh29state, migration11history, risks và remotegates. Profilelocal3000/3001; image mới3200/3201,3100làlịch sử. Không commit/push/PR/publish/upload/deploy.

## Lịch sử trước DEC-12 — không dùng làm trạng thái hiện hành

# Sprint 2 — bàn giao local, 04/10/2026
> Cập nhật DEC-11 / 04-10-2026: Render Free, ngân sách 0; PO + review kỹ thuật tự động thực hiện review/chốt; chưa commit/push/PR/publish/upload/deploy. Quy định host/reviewer bên dưới là lịch sử. Xem [gói PO review hiện tại](SPRINT2_PO_REVIEW.md) và [runbook Render](RENDER_FREE_RUNBOOK.md). K-01 tạm thời vẫn chờ PO duyệt recommendation đã đo; không miễn staging/CI/NFR/DoD.

> Bổ sung cùng ngày: [handoff bản sửa Stitch/code](STITCH_CORRECTION_HANDOFF.md) mô tả đường dẫn runtime mới, DB `stitch_fidelity` và runner browser mới. Các hướng dẫn/số đo phía dưới là lịch sử trước refactor; `components/sprint2`, `sprint2.css`, `public/sprint2` đã chuyển sang module nghiệp vụ và `images/events`. Không dùng đường dẫn cũ để kiểm code hiện tại.

## Trạng thái

**PARTIALLY DONE**: T-11–T-21, T-34/35 đã triển khai và kiểm local, còn CI/staging/review. T-22–24,T-27–31 chưa triển khai vì K-01 chưa qua staging/review/chốt kho giữ. Không sửa trạng thái task nguồn; không commit/push/PR/deploy.

Chi tiết: SPRINT2_LOCAL_EVIDENCE.md, SPRINT2_IMPLEMENTATION_PLAN.md, K01_EVIDENCE.md; raw/screenshot trong evidence/sprint2/20261004-local.

## Chạy demo

Node24.21.0, pnpm10.15.1, Docker Desktop Linux Engine running. Chạy từ thudemo. Nếu chưa có .env, sao chép .env.example, chỉ điền cấu hình local theo README; không in secret. Runner override DB/Redis trong process rồi phục hồi môi trường khi thoát.

Hai container phiên này: sang-sprint2-postgres-20261004 và sang-sprint2-redis-20261004. Không sử dụng container/database5432/6379 có sẵn của người khác.

```powershell
$taskDocker = 'C:/Program Files/Docker/Docker/resources/bin/docker.exe'
& $taskDocker start sang-sprint2-postgres-20261004 sang-sprint2-redis-20261004
npx --yes pnpm@10.15.1 install --frozen-lockfile
./scripts/run-sprint2-local.ps1 -Mode Migrate
npx --yes pnpm@10.15.1 --filter api exec prisma generate
npx --yes pnpm@10.15.1 build
```

Máy mới chỉ chạy các lệnh tạo sau nếu tên/port chưa tồn tại. Đây là credential giả local, không dùng staging/production:

```powershell
& $taskDocker run -d --name sang-sprint2-postgres-20261004 -p 127.0.0.1:15432:5432 -e POSTGRES_USER=sprint2 -e POSTGRES_PASSWORD=local_fixture_only -e POSTGRES_DB=sprint2_local postgres:15-alpine
& $taskDocker run -d --name sang-sprint2-redis-20261004 -p 127.0.0.1:16379:6379 redis:7-alpine
& $taskDocker exec sang-sprint2-postgres-20261004 pg_isready -U sprint2
& $taskDocker exec sang-sprint2-postgres-20261004 createdb -U sprint2 sprint2_integration
& $taskDocker exec sang-sprint2-postgres-20261004 createdb -U sprint2 sprint2_cycle
```

Chờ DB ready. createdb chỉ chạy một lần; không drop/reset nếu đã tồn tại. sprint2_local là demo, sprint2_integration là test, sprint2_cycle là migration test. Root Compose không thay đổi; môi trường cô lập không phải staging/T-03.

Hai cửa sổ PowerShell riêng:

```powershell
# API3001
./scripts/run-sprint2-local.ps1 -Mode Api
# Web3000, production standalone + static/public assets
./scripts/run-sprint2-local.ps1 -Mode Web
```

Cửa sổ thứ ba nhập ẩn mật khẩu giả ít nhất12 ký tự rồi seed:

```powershell
$taskSecure = Read-Host 'Mật khẩu riêng cho tài khoản demo giả' -AsSecureString
$env:SPRINT2_DEMO_PASSWORD = [System.Net.NetworkCredential]::new('', $taskSecure).Password
./scripts/run-sprint2-local.ps1 -Mode Seed
# Nếu chạy lại kiểm browser, mở CLI browser trước:
npx --yes --package @playwright/cli playwright-cli -s=sang-sprint2 open http://localhost:3000 --browser chrome
./scripts/verify-sprint2-browser.ps1
Remove-Item Env:SPRINT2_DEMO_PASSWORD
```

Account giả: sprint2-organizer@demo.invalid và sprint2-buyer@demo.invalid, dùng mật khẩu vừa đặt. Seed hash Argon2, import/giá/mở bán qua API thật; seed lại cập nhật mật khẩu giả, không xóa event. Evidence chỉ có UUID/account, không password/cookie/token. Không gửi email/thu tiền/dữ liệu cá nhân thật.

## Luồng demo

Organizer: /login → /events → sự kiện demo → tạo suất tương lai → Quản lý suất → Nạp sơ đồ JSON. Tệp fixtures/seat-map-invalid.json báo nhiều lỗi, disabled xác nhận. seat-map-2000.json preview không ghi DB; xác nhận mới lưu2000ghế. Đặt giá từng hạng: integer>=0,0miễn phí; lưu thật và inspector cập nhật. Mở bán → public thấy; đóng → list/detail không bán; mở lại vẫn khóa cấu trúc. Xem sơ đồ read-only với pan/zoom/touch/keyboard.

Buyer: / → xem chi tiết → chọn ghế (2click). Login cookie server quay đúng suất. Chọn/bỏ chọn **nháp** và tổng tạm tính; giữ ghế disabled vì K01. Không countdown/payment/nhả hoặc khôi phục hold. Kiểm390/360/768; chỉ vùng canvas cuộn ngang.

## Tái kiểm, dừng và rollback

```powershell
# Dừng web bằng Ctrl+C trước build để tránh Windows EBUSY
./scripts/verify-sprint2-gates.ps1
./scripts/run-sprint2-local.ps1 -Mode Test
./scripts/verify-sprint2-migrations.ps1
./scripts/run-sprint2-local.ps1 -Mode Spike
& $taskDocker stop sang-sprint2-postgres-20261004 sang-sprint2-redis-20261004
```

Dừng API/web bằng Ctrl+C đúng cửa sổ. Không xóa container/volume/reset database. Fixture tests chỉ dọn records/namespace tự tạo; demo giữ lại để xem. Migration cycle đã có9history; chạy lại không pending không có nghĩa vừa làm lại cycle mới.

Rollback code chọn lọc theo .git/sprint2-wip-20261004/before.patch và bản sao WIP; không reset toàn repo. Migration001 đã áp dụng không sửa/xóa. Compensation template **chỉ DB test rỗng**, có guard, không dùng trên DB có ghế. DB chung cần backup, xem dữ liệu, migration bù mới được duyệt. Có thể rollback app tương thích schema additive trước, giữ dữ liệu/lịch sử.

Rollout staging sau cấp quyền: backup/history → build đúng commit → migrate quản lý → health/DB/Redis/ownership/browser → benchmark staging. Chưa có host/credential, chưa tự chọn nhà cung cấp/deploy.

## File theo task và WIP

- T11/T34: schema.prisma, migration001 mới, verification/sprint2-compensate.sql, verify-sprint2-migrations.ps1.
- T12/T13/T15/T17/T19: API src/showtimes/*, app.module/main, test/sprint2.e2e-spec.ts.
- T14/T16/T18/T20/T35: components/sprint2/*, app/shows/*, app/showtimes/*, home/login/layout, sprint2.css; shadcn alert/badge/field/separator/skeleton.
- T18/integrity: lib/api, login-form, event-editor, events/page bỏ fake fallback, giữ WIP layout.
- T21: fixtures/generator/browser scripts/evidence/README/docs; public/sprint2 assets và29design references.
- K01: scripts/k01-spike.mjs và rawreport, không nối app.
- Tooling: .gitignore exclude .playwright-cli, local runners/seed/gates.

Giữ WIP account/events/new/eventdetail/globals, UIbutton/input/label/textarea, workspaceheader/brandmark/utils/AGENTS và tài liệu phân công ban đầu. Diff Git gồm WIP; reviewer cần tách theo snapshot, không stage tất cả mù quáng. Không đổi package/lock/.env/CI/tasks/workbook.

## Chuẩn bị GitHub

Branch đề xuất: task/Sprint2-stitch-integration; hiện vẫn task/T-03-docker-packaging.

Commit: `feat(sprint2): integrate showtime seats pricing and Stitch UI`

PR title: `Sprint 2: sơ đồ 2.000 ghế, giá vé và luồng Stitch kết nối API`

PR description: triển khai13task độc lập T11–21,T34/35; migration additive, transaction/validation/ownership, status/cursor/Redis cache, canvas/keyboard/fixture. Bỏ auth/mutation success giả. Giữ WIP bằng snapshot. Local lint/typecheck/unit6/integration10/build/browser/rawperformance đã kiểm; CI/staging/review chưa xác nhận. Không triển khai8holdtask trước K01.

Reviewer checklist:

- [ ] Tách WIP và review diff/migration/data rollback.
- [ ] CI T-02 / build-and-typecheck, T-02 / lint, T-02 / test chạy thật.
- [ ] Session/role/owner/CSRF/cache và validation.
- [ ] Desktop/mobile, keyboard, lỗi thật và performance staging.
- [ ] K01 reviewer độc lập và quyết định nguồn trước hold; T31 có CI/staging10lượt riêng.

Reviewer đề nghị thuytrang158 hoặc người độc lập Lead chỉ định, chưa xác nhận phiên này. Thứ tự: review dependencySprint1 → patch13localtask → gateK01riêng →8holdtask → stagingT31. Owner cấu hình/kiểm branch protection3checks còn thiếu từ Sprint1; không báo đã chặn merge. Guard integration nhận đúng CI service ci_test_db, nhưng workflow patch chưa chạy từ xa. Không tạo job concurrency giả.

## Việc Lead/user cần thực hiện

1. Cấp staging theo kiến trúc và secret qua kênh bảo mật.
2. ReviewerK01 chạy/đánh giá staging, chốt kho giữ bằng quyết định duyệt.
3. Review patch13task và dependencySprint1 còn thiếu.
4. Cho phép push/CI và deploy theo từng gate khi sẵn sàng; owner kiểm branch protection.

Không cần quyết định frontend/runtime mới. Chỉ kết luận Sprint Done khi đủ21task+AC/NFR/DoD.
