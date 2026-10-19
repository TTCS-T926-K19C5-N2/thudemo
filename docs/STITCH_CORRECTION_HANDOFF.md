# Bàn giao sửa Stitch và code sản phẩm — 04/10/2026
> Cập nhật DEC-11 / 04-10-2026: Render Free, ngân sách 0; PO + review kỹ thuật tự động thực hiện review/chốt; chưa commit/push/PR/publish/upload/deploy. Quy định host/reviewer bên dưới là lịch sử. Xem [gói PO review hiện tại](SPRINT2_PO_REVIEW.md) và [runbook Render](RENDER_FREE_RUNBOOK.md). K-01 tạm thời vẫn chờ PO duyệt recommendation đã đo; không miễn staging/CI/NFR/DoD.

## Trạng thái và vị trí

Phần có thể chạy local đã được refactor và kiểm hồi quy. Sprint 2 **PARTIALLY DONE**: tám task giữ ghế và nghiệm thu CI/staging/reviewer chưa hoàn thành. Xem [evidence](STITCH_CORRECTION_EVIDENCE.md), [29 màn hình](STITCH_FIDELITY_LEDGER.md) và [viewer](../evidence/stitch-correction/20261004/index.html).

Code root `thudemo/`. Browser dùng **http://localhost:3000**, API **http://localhost:3001**. Origin ghi API phải là localhost; không đổi sang 127.0.0.1 cho thao tác ghi.

## Chuẩn bị và chạy

Node 24.21.0, pnpm 10.15.1, Docker Desktop Linux Engine running. Dùng container local sở hữu `sang-sprint2-postgres-20261004` (15432) và `sang-sprint2-redis-20261004` (16379). Không dừng hoặc thay cấu hình container của dự án khác.

```powershell
# Chạy từ thudemo. Các container này đã tồn tại trên máy phiên này.
$taskDocker = 'C:/Program Files/Docker/Docker/resources/bin/docker.exe'
& $taskDocker start sang-sprint2-postgres-20261004 sang-sprint2-redis-20261004
npx --yes pnpm@10.15.1 install --frozen-lockfile
./scripts/run-sprint2-local.ps1 -Mode Migrate -Database stitch_fidelity
npx --yes pnpm@10.15.1 --filter api exec prisma generate
npx --yes pnpm@10.15.1 build
```

Nếu chạy trên máy mới, dùng lệnh tạo container trong [handoff cũ](SPRINT2_HANDOFF.md), chờ `pg_isready`, rồi tạo DB bổ sung **một lần**:

```powershell
& $taskDocker exec sang-sprint2-postgres-20261004 createdb -U sprint2 stitch_fidelity
```

Nếu DB đã tồn tại, giữ nguyên; không drop/reset. Chỉ sao chép `.env.example` sang `.env` nếu chưa có, điền cấu hình local và giữ `.env` ngoài Git. Runner đặt DATABASE_URL/Redis/port cho process rồi phục hồi khi kết thúc.

Hai cửa sổ PowerShell riêng:

```powershell
# Cửa sổ API
./scripts/run-sprint2-local.ps1 -Mode Api -Database stitch_fidelity
```

```powershell
# Cửa sổ web, dùng build production standalone
./scripts/run-sprint2-local.ps1 -Mode Web -Database stitch_fidelity
```

Cửa sổ thứ ba nhập mật khẩu **giả local** riêng, tối thiểu 12 ký tự:

```powershell
$taskSecure = Read-Host 'Mật khẩu riêng cho tài khoản thử nghiệm' -AsSecureString
$env:SPRINT2_DEMO_PASSWORD = [System.Net.NetworkCredential]::new('', $taskSecure).Password
./scripts/run-sprint2-local.ps1 -Mode Seed -Database stitch_fidelity
./scripts/verify-stitch-browser.ps1 -Session sang-fidelity
Remove-Item Env:SPRINT2_DEMO_PASSWORD
```

Tài khoản: `design-organizer@example.invalid` và `design-buyer@example.invalid`, dùng mật khẩu vừa nhập. Seed chỉ dataset giả có ID cố định thuộc fixture; cập nhật mật khẩu hash, không gửi email hoặc thu thập dữ liệu thật. Không đưa password/token/cookie vào báo cáo hoặc chat.

## Luồng kiểm trực tiếp

1. `/`: sáu suất đang bán, poster gắn event ổn định; chi tiết có giá từng hạng và các suất đã đóng.
2. Chưa đăng nhập → chọn ghế → login → trở lại đúng suất. Sai mật khẩu báo lỗi; BUYER không được đổi giá của organizer.
3. Organizer → `/events` → sự kiện → quản lý suất. Tạo suất tương lai; nạp `fixtures/seat-map-invalid.json`: đủ lỗi, không thể xác nhận.
4. Nạp `fixtures/seat-map-2000.json`: preview không ghi DB. Xác nhận mới lưu 2.000 ghế; bỏ file trong lúc validate và chọn file >5 MB đều không thể ghi dữ liệu.
5. Giá: blank/negative không thể lưu, 0 hợp lệ; giá VND lưu đúng integer. Inspector phản ánh giá vừa lưu.
6. Mở bán → catalog/chi tiết cập nhật; đóng → không bán; cấu trúc vẫn khóa sau lần mở đầu.
7. Xem map read-only, zoom/Fit, keyboard; mobile 390/360 và tablet 768 không tràn toàn trang. Buyer chọn ghế chỉ là nháp, nút giữ ghế không khả dụng, không có reservation/countdown giả.

Kiểm loading/empty/error bằng harness có fixture UI được đánh dấu, không cần ngắt DB thật. Viewer giúp xem từng source/before/after; sáu màn hình hold không có ảnh tích hợp sau sửa.

## Tái kiểm và dừng

Dừng web bằng Ctrl+C trong cửa sổ sở hữu trước build để tránh Windows EBUSY. API có thể giữ chạy cho browser, không chạy integration vào DB fidelity.

```powershell
./scripts/verify-stitch-correction.ps1
./scripts/run-sprint2-local.ps1 -Mode Test
# Sau khi mở lại API/web: nhập mật khẩu giả như trên rồi chạy browser.
git diff --check
```

Runner Test chỉ dùng `sprint2_integration`. Không dùng `db push`. Dừng API/web bằng Ctrl+C. Nếu muốn dừng dependency, chỉ dừng hai container sở hữu; giữ container/volume/database để bảo toàn dữ liệu.

## Rollback

Snapshot WIP trước refactor: `.git/stitch-correction-20261004/before.patch` và `files/`. Snapshot này là local, không nằm trong PR. Kiểm WIP của từng file rồi khôi phục chọn lọc phần sửa mới; không reset/checkout toàn repository, không xóa `.env`, migrations hoặc artifacts lịch sử.

Migration `202610040004_event_presentation` đã áp dụng. Giữ nguyên file và checksum. Có thể rollback app cũ trước trong khi giữ bốn cột nullable và dữ liệu; không drop cột để giả lập rollback. Muốn hoàn tác schema phải có backup, kiểm dữ liệu và migration bù **mới** được review. Chuỗi cycle cũ cùng migration additive giữ đủ 10 lịch sử trên DB cycle; không gọi việc không có migration pending là chuỗi apply/compensate/reapply mới.

## Chuẩn bị GitHub, chưa thực hiện

- Branch đề xuất: `task/stitch-product-fidelity` (branch hiện tại và WIP vẫn được giữ).
- Commit đề xuất: `refactor(web): align Stitch layouts and organize event workflows`.
- PR title: `Align Stitch frontend and refactor event workflows with regression evidence`.
- Reviewer dự kiến: `thuytrang158`; cần review độc lập source, migration additive và các sai khác trong ledger.
- Thứ tự tích hợp: xác nhận snapshot/WIP → review schema/API contract và migration → review frontend cùng contract → CI/browsers → nghiệm thu staging. Không tách deploy frontend lệch contract backend.

### PR description đề xuất

> Refactor giao diện suất diễn theo nghiệp vụ: shared layouts, API/contracts/formatting, catalog, selection, management, map import và pricing. Sửa token/layout/mobile/error/loading theo 29 nguồn Stitch; dùng asset gắn event ổn định qua migration additive. Loại nhãn demo/internal và login preset khỏi bề mặt sản phẩm, giữ thao tác API thật.
>
> Local: frozen install, lint/typecheck, 14 unit, 10 integration, production build và 106 browser checks PASS. Có 33 captures, ledger nguồn/trước/sau/diff cho 23 màn hình; 6 màn hình hold chưa tích hợp. Xem docs/STITCH_CORRECTION_EVIDENCE.md và docs/STITCH_FIDELITY_LEDGER.md.
>
> Không triển khai giữ ghế/payment, không tuyên bố Sprint Done. K-01 còn staging/reviewer/quyết định store. Migration đã áp dụng phải giữ nguyên, rollback app tương thích schema additive; schema rollback cần migration bù mới.

### Reviewer checklist

- [ ] Review đúng phần thay đổi mới, bảo toàn WIP và `.env`.
- [ ] Migration additive, checksum/history giữ nguyên, không sửa migration đã áp dụng.
- [ ] Auth/ownership/price/import/cache/public publication contract không hồi quy.
- [ ] Kiểm từng screen trong ledger; chấp nhận hoặc ghi cụ thể sai lệch cần sửa.
- [ ] CI thật chạy lint/typecheck/test/build; không coi log local là GitHub check.
- [ ] Kiểm staging/rollback và benchmark riêng trước xác nhận DoD.
- [ ] Không coi UI fixture hoặc local spike là bằng chứng hold API/production.

## Gate cần Lead xử lý

1. Cung cấp staging theo kiến trúc đã duyệt và quyền chạy dữ liệu giả; lưu secret ở nơi được duyệt, không gửi trong chat.
2. Reviewer độc lập đánh giá K-01 trên staging, crash/restart, all-or-none và durability; Lead ghi quyết định store vào nguồn sự thật.
3. Sau gate, triển khai T-22–T-24 và T-27–T-31 theo dependency; chạy HTTP load/CI/staging đúng AC. Không cần lựa chọn sản phẩm mới để tiếp tục phần refactor local đã bàn giao.
