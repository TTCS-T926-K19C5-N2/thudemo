# Bằng chứng sửa Stitch và code sản phẩm — 04/10/2026
> Cập nhật DEC-11 / 04-10-2026: Render Free, ngân sách 0; PO + review kỹ thuật tự động thực hiện review/chốt; chưa commit/push/PR/publish/upload/deploy. Quy định host/reviewer bên dưới là lịch sử. Xem [gói PO review hiện tại](SPRINT2_PO_REVIEW.md) và [runbook Render](RENDER_FREE_RUNBOOK.md). K-01 tạm thời vẫn chờ PO duyệt recommendation đã đo; không miễn staging/CI/NFR/DoD.

## Kết luận

**PARTIALLY DONE cho Sprint 2.** Phần refactor và các luồng không phụ thuộc giữ ghế đã được kiểm local. Không xác nhận Sprint Done, không cập nhật trạng thái task nguồn. T-22–T-24 và T-27–T-31 vẫn chưa triển khai; K-01 còn cần staging, reviewer độc lập và quyết định kho giữ ghế.

Run mới: `evidence/stitch-correction/20261004/`. Giữ nguyên bằng chứng lịch sử `evidence/sprint2/20261004-local/`; số đo ở tài liệu cũ thuộc lần chạy cũ.

- [Viewer nguồn / trước / sau / overlay](../evidence/stitch-correction/20261004/index.html).
- [Ledger riêng cho 29 màn hình](STITCH_FIDELITY_LEDGER.md).
- [Hướng dẫn chạy, rollback và bàn giao](STITCH_CORRECTION_HANDOFF.md).
- [Mapping trách nhiệm cũ → mới](STITCH_CORRECTION_PLAN.md).

## Nguồn thiết kế và điều kiện so sánh

Project Stitch `1184317708208520256`; dùng đúng 29 ID đã chỉ định, không chọn theo tên trùng. Đã đọc theme và export bằng MCP chỉ đọc. Mỗi màn hình có HTML đầy đủ, PNG gốc, ảnh nguồn chuẩn hóa và hash/config/classes trong `source-specs.json`.

Desktop CSS 1280 px, mobile CSS 390 px; PNG nguồn 2x được chuẩn hóa về CSS viewport. Ảnh ứng dụng chụp trực tiếp bản production, font Geist đã tải xong, scroll được chuẩn hóa. Không chỉnh sửa ảnh ứng dụng. Diff đệm trắng khi chiều cao khác; pixel L1 chỉ để tìm sai lệch, không phải phần trăm khớp.

Ledger có 23 màn hình có render local và 6 màn hình chưa kiểm tích hợp: giữ thành công, xung đột, hết hạn trên desktop/mobile. Loading/empty/network-error và loại trừ SOLD/HELD có fixture UI ghi rõ; không dùng chúng làm bằng chứng giữ ghế hoặc sự cố datastore thật.

Catalog trước/sau dùng cùng sáu sự kiện và asset cố định. Màn hình nguồn mobile có năm card, tổng 24 sự kiện và nhiều trang; ứng dụng hiển thị đúng sáu suất thật trong fixture, không tạo số liệu giả. Các workflow trước/sau không có dữ liệu và lịch sử hoàn toàn giống nhau; không suy luận mức cải thiện từ pixel L1. Lần kiểm browser tạo các suất riêng và đóng bán lại, vì vậy lịch sử suất đã đóng dài hơn hình minh họa; không xóa lịch sử để làm đẹp ảnh.

## Yêu cầu → bằng chứng

| Yêu cầu | Thay đổi | Bằng chứng | Kết quả |
|---|---|---|---|
| Tổ chức runtime theo nghiệp vụ | Layout, catalog, selection, management, import và pricing tách trách nhiệm; API/contracts/formatting độc lập renderer | `path-map.json`, `changed-files.json`, source mới trong `features/`, `lib/`, `components/layout/` | PASS local |
| Không dùng asset theo thứ tự trang | Event có poster/mobile poster/banner/category nullable; asset có tên ổn định; seed chỉ các ID sở hữu | Migration `202610040004_event_presentation`; integration và poster snapshots trong browser report | PASS local |
| API thật, lỗi có contract | Runtime decoder; giữ status/code/details; auth cookie thật, return URL giới hạn; input VND integer | 8 web unit test; 10 API integration test; browser kiểm login, BUYER 403, import, pricing, open/close | PASS local |
| Không lộ demo/sprint/gate trên bề mặt sửa | Xóa preset login, copy nội bộ và fake success; giữ ghế disabled với thông tin khả dụng trung thực | `runtime-name-scan.json`: 0; browser kiểm text ở từng capture | PASS trong phạm vi sửa |
| Fidelity từng màn hình | HTML/token/asset, header/sidebar, hero, density, forms, errors, mobile và skeleton | 29 hàng ledger; 23 after + diff; source/before giữ nguyên | Đã review local, có sai khác ghi rõ |
| Hồi quy nghiệp vụ | Preview không ghi DB, confirm lưu 2.000 ghế; giá 0 hợp lệ; mở/đóng cập nhật cache; khóa cấu trúc sau lần mở đầu | `browser-report.json`, `gate-integration.log` | PASS local |
| Migration và dữ liệu an toàn | Migration additive mới; không sửa migration đã áp dụng, không reset/drop/db push | `migration-history-integrity.json`: 8 checksum khớp; cycle 9→10 lịch sử, dữ liệu rỗng giữ nguyên | PASS local |
| Bảo toàn WIP và secret | Snapshot trước sửa, kiểm các file ngoài refactor và patch API; không track `.env` | `wip-preservation.json`, `secret-hygiene.json`, snapshot `.git/stitch-correction-20261004/` | PASS trong phạm vi kiểm |
| Các task giữ ghế | Không giả lập kết quả để vượt dependency | `holdIntegrated: false`, `staging: false`; [K-01](K01_EVIDENCE.md) | BLOCKED |

## Kiểm thử và số đo

Node 24.21.0, pnpm 10.15.1; Docker Linux Engine 29.5.3, Compose 5.1.4, PostgreSQL 15, Redis 7. Windows local; API 3001, web 3000. DB riêng `stitch_fidelity` và `sprint2_integration`, cổng 15432/16379; không dùng credential production.

| Lệnh / kiểm tra | Kết quả | Artifact |
|---|---|---|
| `npx --yes pnpm@10.15.1 install --frozen-lockfile` | PASS | `frozen-install.log` |
| `./scripts/verify-stitch-correction.ps1` | lint/typecheck/test/build PASS | `local-gates.json`, `gate-*.log` |
| `pnpm test` qua runner đúng phiên bản | 14 unit test: API 6 + web 8 | `gate-test.log` |
| `./scripts/run-sprint2-local.ps1 -Mode Test` | 10 integration test PASS trên DB/Redis thật | `gate-integration.log` |
| `./scripts/verify-stitch-browser.ps1 -Session sang-fidelity` | 106 kiểm tra, 33 capture, 0 lỗi JS | `browser-report.json` |
| Prettier phạm vi thay đổi | PASS | `format-check.log` |
| `git diff --check` | PASS | `git-diff-check.log` |
| Health / PostgreSQL query / Redis read-write | PASS | `health.json`, `postgres-query.txt`, `redis-read-write.txt` |

Số đo integration: import 2.000 ghế p95 **683,0 ms** (10 mẫu); query 2.000 ghế **49,3 ms** (30 mẫu); catalog 200 suất **20,8 ms cold / 14,2 ms warm** (30 mẫu mỗi loại). Raw: `integration-performance.json`. Đây là Nest HTTP test harness với PostgreSQL/Redis thật, không phải HTTP giữ ghế.

Số đo render cuối **p95 135,5 ms**, lấy trực tiếp trường `renderP95` trong `browser-report.json`, gồm 30 navigation → painted frame trên browser warm, bản production. Không dùng fixture mock cho số đo render 2.000 ghế. Local không thay thế staging, nhiều instance hoặc thiết bị mobile vật lý.

Thời lượng gate cuối: lint 9,70 s; typecheck 7,58 s; test 4,96 s; build 10,83 s. Đây là thời lượng local, không phải thời lượng GitHub Actions.

### File theo trách nhiệm

| Phạm vi | File/module sửa |
|---|---|
| Nền tảng giao diện | `components/layout/product-layout.tsx`, `app/product.css`, `app/layout.tsx`, các route `shows/`, `showtimes/`, home/login |
| Catalog và detail | `features/event-catalog/*`, `public/images/events/*` |
| Workflow organizer | `features/showtime-management/*`, `features/seat-map-import/*`, `features/seat-pricing/*` |
| Canvas và lựa chọn | `components/seat-map/*`, `features/seat-selection/*`, `lib/presentation/seat-category.ts` |
| Contract và auth client | `lib/api/*`, `lib/contracts/*`, `lib/formatting/*`, `components/login-form.tsx`, `lib/api.ts` |
| Schema/API | `prisma/schema.prisma`, migration `202610040004_event_presentation`, `showtimes.service.ts`, integration spec, seed fidelity và seed local |
| Tooling | web `package.json`, `vitest.config.ts`, `pnpm-lock.yaml`, runner local, browser/gate/capture scripts, fixture event |
| Copy legacy trong phạm vi | `app/account/page.tsx`, `app/events/page.tsx` |
| Bàn giao | README, bốn tài liệu Sprint/K-01 bổ sung, plan/evidence/handoff/ledger correction và run evidence mới |

Danh sách máy đọc và hash: `changed-files.json`. Di chuyển module cũ → mới: `path-map.json`. Không coi toàn bộ `git status` là các file mới sửa trong lượt này; nhiều file là WIP của phần triển khai trước.

## Review và sửa hồi quy

MUST FIX đã xử lý: bỏ coupling utility vào renderer; asset ổn định; không lộ DRAFT sibling public; decode response thay generic cast; giá/category color theo danh tính thay thứ tự API; preview stale/file bỏ chọn không giữ loading; tệp trên 5 MB không thể xác nhận; native JSON lỗi thu đủ field; cache namespace/revision cho contract mới; mobile hero/CTA/errors và skeleton theo source; khóa cấu trúc giữ nguyên sau đóng/mở.

React review: request có AbortController/cleanup; render không tạo implementation song song; workflow dùng state riêng; input validate trước mutation; server kiểm ownership/role; không dùng localStorage mock auth. Bảo mật trong phạm vi: query parameterized, migration additive, path ảnh local được validate, safe return URL và session server giữ nguyên. Không coi đây là deep security audit toàn repository.

Lỗi baseline: lint còn **14 warning WIP có trước**, không tắt rule. Build từng gặp Windows EBUSY khi server đang giữ file; đã dừng đúng process sở hữu rồi build lại. Browser harness từng lỗi gỡ route đang chạy; log `browser-harness-failure.log` giữ lại, đã chờ handler hoàn tất rồi chạy lại. Đây không phải lỗi API hoặc phép bỏ qua test.

OPTIONAL IMPROVEMENT không thực hiện: filter/search/location có backend contract; nội dung pháp lý/điều khoản thực; CMS/upload ảnh; telemetry và tối ưu sau đo staging. Không thêm ngoài phạm vi.

## Giới hạn còn lại

- Không khẳng định pixel-identical hoặc đạt 100%. Ledger nêu cụ thể khác biệt theo dữ liệu và browser; typography/icon rendering có thể khác Material Symbols nguồn.
- Sơ đồ dùng toàn bộ tọa độ thật 40×50 và giá thật; nguồn minh họa A–H, SOLD/HELD và ghế chọn khác. Không thay dữ liệu bằng sơ đồ giả để khớp ảnh.
- Không bịa duration/check-in/tax/floor/description hoặc giá trong JSON khi contract không có. Control ngoài contract giữ trạng thái không khả dụng.
- Chưa kiểm patch trên CI/staging/reviewer độc lập. Không commit, push, mở PR hoặc deploy trong lượt này.
- IAB chặn URL `file://`, nên chưa xác minh thao tác viewer trong IAB. Các file/ảnh/liên kết viewer đã được kiểm local; ứng dụng HTTP localhost đã hiển thị trong IAB. Có thể mở file HTML bằng trình duyệt thông thường từ máy người dùng.
- T-22–T-24, T-27–T-31 cần gate K-01. Việc refactor và sửa giao diện không hoàn thành tám task này.

## Công cụ đã dùng

Stitch MCP đọc project/screen; shadcn MCP tra registry; frontend-app-builder, shadcn, frontend-design, Next.js, React best practices, agent-browser-verify, frontend-testing-debugging và Playwright. Local PowerShell/Git, pnpm, Prisma, Docker, Chrome, Pillow cho diff. Không gọi GitHub/Vercel/Supabase write, Stripe, Imagegen hoặc tạo concept mới. Dependencies Python phục vụ so ảnh nằm trong `.git/stitch-correction-tools`, không thêm dependency ứng dụng.
