# Sprint 2 — bằng chứng local, 04/10/2026

> Bổ sung: [bằng chứng sửa Stitch/code](STITCH_CORRECTION_EVIDENCE.md) và [ledger từng màn hình](STITCH_FIDELITY_LEDGER.md) thuộc run mới `stitch-correction/20261004`. Nội dung phía dưới giữ nguyên kết quả lịch sử; số test, đường dẫn runtime và số đo mới xem tài liệu bổ sung. Tám task giữ ghế vẫn chưa triển khai.

## Kết luận và phạm vi

**PARTIALLY DONE**. 13 task độc lập đã triển khai và kiểm local: T-11–T-21, T-34, T-35. Chưa task nào được xác nhận Done theo toàn bộ AC + DoD; staging, CI của patch này và reviewer độc lập chưa có. 8 task T-22–T-24, T-27–T-31 chưa triển khai vì gate K-01. Không cập nhật task Markdown, SP, workbook hay quyết định nguồn.

Nguồn: prompt PROMPT_COMPLETE_SPRINT_2_STITCH.md, TECH-01/02, DEC-02/03/09/10, tasks Sprint 2, docs UI và 29 screen Stitch được chỉ định. Ma trận chi tiết nằm trong SPRINT2_IMPLEMENTATION_PLAN.md.

## Môi trường và lệnh

Node 24.21.0; pnpm dự án 10.15.1 (global 11.24.0 nên chạy `npx --yes pnpm@10.15.1`). Docker29.5.3, Compose5.1.4; PostgreSQL15/Redis7 qua Docker Desktop Linux. Windows, i5-13500H,16 logical CPU, RAM khoảng15.64GiB. API3001, web3000.

Chủ động dùng container/database test cô lập tại127.0.0.1:15432/16379, không đụng database có sẵn tại5432/6379. `sprint2_local` chứa demo giả; `sprint2_integration` chỉ fixture tự tạo/tự dọn; `sprint2_cycle` dành migration. Không reset/xóa database hoặc sửa migration đã áp dụng.

| Lệnh từ thudemo | Kết quả / bằng chứng |
|---|---|
| `npx --yes pnpm@10.15.1 install --frozen-lockfile` | PASS; không đổi package.json/workspace/lockfile |
| `npx --yes pnpm@10.15.1 --filter api exec prisma generate` | PASS |
| `./scripts/run-sprint2-local.ps1 -Mode Migrate` | PASS, 7 migration chuỗi ứng dụng |
| `./scripts/verify-sprint2-migrations.ps1` | PASS apply → migration bù mới → tái áp dụng mới; giữ đủ9 lịch sử, migration-history.json |
| `./scripts/verify-sprint2-gates.ps1` | lint/typecheck/unit/build; local-gates.json và gate-*.log |
| `./scripts/run-sprint2-local.ps1 -Mode Test` | PASS 10 integration test; gate-integration.log |
| `./scripts/run-sprint2-local.ps1 -Mode Spike` | PASS các thử nghiệm local K-01; k01-spike.json; chưa đạt gate staging/review |
| `./scripts/verify-sprint2-browser.ps1` | Luồng thật + fixture UI có đánh dấu; browser-report.json và PNG |
| `npx --yes pnpm@10.15.1 --filter api exec prettier --check src/showtimes test/sprint2.e2e-spec.ts ../../apps/web/src/components/sprint2 ../../apps/web/src/app/sprint2.css ../../apps/web/src/app/shows ../../apps/web/src/app/showtimes ../../apps/web/src/app/login/page.tsx` | Kiểm format phạm vi mới |

Các bằng chứng tại `evidence/sprint2/20261004-local/`. Lần build đầu cuối bị EBUSY vì server standalone đang chạy, sau dừng đúng tiến trình tự mở đã build lại; local-gates.before-stop.json giữ kết quả lỗi. Lint có14 warning baseline từ WIP, không tắt rule. Unit6 test. Không có test bị skip để báo xanh.

## AC → chứng minh

| Task | Thay đổi / bằng chứng | Local | Giới hạn nghiệm thu |
|---|---|---|---|
| T-11 | Seat/Category FK composite, unique(showtime,row,seat), indexes; migration-history; DB integration kiểm duplicate/FK/transaction | PASS | Staging/review chưa có |
| T-12 | import batch 2000 dưới5s; lỗi cuối giữ dữ liệu cũ; transaction conflict rollback; integration-performance.json | PASS | Import khi có hold/ticket thật chờ model gated |
| T-13 | validator hàm thuần thu đủ lỗi vị trí/field; seat-map.spec.ts | PASS | Không đồng nhất syntax JSON và schema lỗi |
| T-14 | browser preview DB0 → xác nhận DB2000; JSON lỗi disable, success/error thật | PASS | UI tham chiếu theo nội dung fixture |
| T-15 | status enum; đủ map/giá mới mở, free0, đóng/mở lại; permanent structure lock | PASS | Chặn hold sau đóng thuộc nhánh K-01 |
| T-16 | session/role/owner; chuyển trạng thái thật qua UI, thiếu map có lý do | PASS | Review độc lập chưa có |
| T-17 | 200 suất cùng giờ, cursor toàn bộ không lặp/sót; giá0; cache30s/revision đổi giá/mở/đóng; public projection sạch | PASS | Snapshot tĩnh; không hứa snapshot giữa nhiều thay đổi đồng thời |
| T-18 | public home/detail, metadata thật; 2click; login cookie quay đúng suất; UUID return nội bộ; closed404 | PASS | Search/filter/Vé của tôi trong design nằm ngoài contract chưa làm |
| T-19 | one SQL join2000; shared CASE dùng DB clock kiểm fixture4state; public không lộ danh tính | PASS phần được phép | Production tất cả AVAILABLE; chưa join quyền hold/ticket vì chưa model |
| T-20 | một canvas2000; zoom/scroll/touch/keyboard/inspector; màu+kí hiệu; organizer read-only | PASS | SOLD/HELD unselectable là UI fixture; không phải tồn kho đã bán/giữ thật |
| T-21 | generator tùy1–2000, fixture nhập API thật, 30 navigation-to-full-frame production samples, README | PASS local | Warm browser trên máy này; không physical mobile/staging |
| T-34 | nullable Int VND, price CHECK>=0, migration cycle; null khác0 | PASS | Shared DB rollback cần xem xét dữ liệu |
| T-35 | giá từng hạng, âm/lẻ/overflow reject, save thật cập nhật inspector,4viewport | PASS | Staging/review chưa có |
| T-22/23/24/27/28/29/30/31 | Chưa triển khai; K01 chưa đóng gate | BLOCKED | Không hold giả, không countdown giả, không ghi T31 PASS |

Integration test kiểm401/403/ownership, preview không mutation, malformed replacement giữ IDs, exception trong transaction không để lại category, cache sau thay đổi không chờ TTL. Session lấy server; không tự cấp role/localStorage khi offline. API validation và cấu trúc immutable sau lần mở đầu tiên.

## Phương pháp đo

Raw: integration-performance.json, browser-report.json, k01-spike.json. p95 nearest-rank: sort rồi lấy index ceil(n×0.95)-1. Integration HTTP qua Nest/supertest TS test harness, DB/Redis thật; **không gọi đây là production backend benchmark**. Import10 lượt thay map fixture hợp lệ, query30 lượt đầy đủ2000, catalog200 suất/30cold+30warm; tuần tự, concurrency1. Cold là cache page miss (revision thay đổi), không phải cold boot máy/DB. Đo trước HTTP đến sau nhận response200/body; assertions chặn sample sai.

Browser web production Next standalone + Nest compiled:30 lượt navigation có phiên buyer thật, warm assets. timeOrigin navigation → performance mark sau hai animation frame, canvas dataset rendered=2000; includes auth/API/paint. Không tính request thất bại. Chrome viewport emulation1280/390/360/768; không điện thoại thật. Báo cáo số đo mới nhất đọc trực tiếp JSON, không thay ngưỡng.

S-10 hold p95<300ms và T31 HTTP200requests/100ghế ×10 **CHƯA ĐO**. Single-seat datastore spike K01 không thay thế hai phép đo này.

## Fidelity ledger

Stitch project1184317708208520256, 29 PNG+HTML được lưu nguyên trong design/. Mapping ID ở source README và implementation plan. Đã đọc ảnh nguồn và ảnh ứng dụng bằng view_image, thao tác thực trên ứng dụng.

| Chiều đối chiếu | Nguồn → ứng dụng / sửa | Sai lệch / lý do |
|---|---|---|
| Copy | 01/M01 headline;04/M04 quản lý;06/M06 giá;07/M07 read-only;08 login | Tên/ngày/giá lấy DB giả; lời giải thích gate giữ thay timer/success chưa có |
| Layout | Desktop sidebar240 + danh sách suất/detail; thẻ điều kiện; mobile stacked | Header quản trị thu gọn, bỏ brand lặp; các bảng quy tắc phụ chưa có hành vi backend không thêm |
| Typography | Geist đang có trong dự án, hierarchy23–30/17/14/12px | Font Stitch tham chiếu không hoàn toàn giống Geist; giữ font hiện hành docs/component, không thêm dependency |
| Palette/radius | Nền sáng#faf8ff, trắng, primary#175cd3, border#dedce7; sửa controls radius6px/input trắng | Ghế3màu+hình trạng thái; không thay dark WIP global |
| Asset/icon | Poster từ HTML Stitch lưu local; Lucide Ticket/Calendar/Armchair/Zoom | Poster là artwork demo, chưa có upload/banner model; số dòng list theo DB, không fake6 sự kiện |
| Form | M06 thẻ từng hạng, lưu/validation thật;M09 nhiều lỗi;M10 âm không submit | Input số native hiển thị số chưa phân nhóm khi sửa, inspector VND có phân nhóm |
| Responsive/touch | Desktop1280,390,360,768; map nội bộ pan, zoom; mobile summary sticky | 2000ghế thực cần pan thay bản ảnh ít ghế; không scale toàn bộ thành mục tiêu quá nhỏ để chạm |
| States | 09/10/11 + M09/10/11 thật; M14/15/16 kiểm UI fixture riêng | 03/M03 hold-success,12/M12 conflict,13/M13 expiry chưa kiểm tích hợp do K01 |

Không tuyên bố pixel-perfect toàn bộ29 screen. Những screen giữ chưa có nghiệp vụ phải chờ gate, không dựng ảnh success để hoàn tất mapping.

## Review và còn thiếu

MUST FIX đã xử lý: fake login/mutation fallback, express indirect dependency, stale upload/route result, UUID cursor/return, cache namespace giữa DB fixture/demo, canvas keyboard theo hàng, canceled paint marker, CI test guard nhận đúng service DB hiện có. Không còn MUST FIX được phát hiện trong phần local đã triển khai. CI chưa chạy patch; guard chỉ nhận local DB cô lập hoặc CI=true+localhost5432/ci_test_db, không mở tùy ý credential.

OPTIONAL: snapshot pagination ổn định xuyên mutation, đổi asset theo từng event khi có model, thêm tooling a11y tự động ngoài keyboard/manual. Không thực hiện để tránh mở rộng scope. Chưa reviewer độc lập, không đổi DoD.

## Kết quả checkpoint cuối

Lint0errors/14baselinewarnings; typecheckPASS; unit6/6; integration10/10; buildAPI+webPASS; formatPASS. Browser35checksPASS, runtimeerrors0, viewport1280/390/360/768. p95 import715.8ms; query36.4ms; catalogcachemiss19.7ms/cachehit11.9ms; render177.3ms (30mẫu). Bản web cuối sau recovery-message sửa nhỏ: gate-web-final.log. Kịch bản fixture mới đã sửa locator alert riêng và dọn interception test cũ trước mỗi run; file browser-fixture-retry-error.txt giữ lỗi bộ kiểm trước sửa, không che lỗi.

Health200, PostgreSQL SELECT thật (postgres-query.json), Redis SET/GET/DEL key riêng đạt (environment.json). Git diff --check không có whitespaceerror; .env không tracked; quét evidence không có passworddemo/tokenhash/cookie. CI/staging/reviewer vẫn CHƯA kiểm.

Công cụ: StitchMCP read-only lấy đúng29screen; shadcnMCP tra registry; frontend-app-builder/nextjs/shadcn/react-best-practices/browser-verify/frontend-testing-debugging; IAB và PlaywrightCLI cho kiểm lặp/đo/screenshot. Git/Node/pnpm/Docker/Prisma local. Không Supabase/Stripe/Figma/GitHubremote/deploy/Imagegen. WIP giữ theo snapshot; danh sáchfile theo task trong HANDOFF.
