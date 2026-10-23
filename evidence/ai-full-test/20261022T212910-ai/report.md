# Báo cáo kiểm thử Codegym

Run-id: `20261022T212910-ai`  
Thời gian: 22/10/2026, giờ Asia/Saigon  
Source: branch `feature/sprint-4-8-complete`, HEAD `ce777bd13e472c089eef4a3c1ed4455e501ae3ba`; working tree có thay đổi tracked/untracked được bảo toàn. Fingerprint 369 tệp dưới `apps/api/src`, `apps/web/src`, `apps/api/prisma`: `2732cf4d3d8da46a515f99cfd7ab0baabe0a7812d29d50bfd528123591267ebb`.  
Workbook SHA-256: `7fa009f53a82d23786e95ce9bd0ecd5aed0c6968bdbb6358a36ee14a10dd9c18`.  
Môi trường: Windows local. Web source build thành công và được chạy riêng trên `127.0.0.1:3410`; API build không thành công, API 3001 không lắng nghe. Không xác nhận DB/Redis/SMTP thử riêng; không có staging/device run.

## Kết luận

**Chưa đủ điều kiện nghiệm thu.** Không có AC/NFR nào được đánh dấu PASS hoặc FAIL sau khi chạy đầy đủ với đúng fixture/oracle. Đã thực hiện source/build/test/browser probes; đa số trường hợp vẫn `NOT_RUN`, các thiếu tính năng được đánh dấu `MISSING`, và prerequisite không có được đánh dấu `BLOCKED`. Unit test xanh không được tính thành chức năng PASS.

## Inventory và coverage

Workbook có 7 sheet: 63 story + spike K-01 (64 mục Backlog), 55 task, 11 epic, 8 Sprint/Product Goal, 9 rủi ro, 9 DoD và 5 DoR. Mọi Later vẫn trong inventory. Nguồn/ô gốc được lưu trong `workbook-baseline-summary.json`; ma trận mới bắt đầu từ 404 case gốc trong `test-cases.json`, không ghi đè baseline.

| Nhóm/Tier | Tổng case | PASS | FAIL | BLOCKED | MISSING | NEEDS_DECISION | NOT_RUN |
|---|---:|---:|---:|---:|---:|---:|---:|
| Ready | 133 | 0 | 0 | 2 | 0 | 0 | 131 |
| Next | 60 | 0 | 0 | 0 | 0 | 0 | 60 |
| Later | 56 | 0 | 0 | 0 | 10 | 0 | 46 |
| Technical tasks (55 × AC/NFR) | 110 | 0 | 0 | 0 | 0 | 0 | 110 |
| Governance | 23 | 0 | 0 | 4 | 0 | 0 | 19 |
| Implemented/Proposed + hành trình tích hợp | 22 | 0 | 0 | 1 | 6 | 0 | 15 |


Tổng theo status trên 404 case: **381 NOT_RUN, 7 BLOCKED, 16 MISSING, 0 NEEDS_DECISION, 0 PASS, 0 FAIL**. Số case có trạng thái thực thi khác NOT_RUN là 23/404; theo định nghĩa của kế hoạch, tỷ lệ PASS+FAIL trên case phải chạy hiện là 0%. Không loại blocker hay missing khỏi mẫu số.

Workbook gốc (không phải số case): Ready 25 (bao gồm K-01), Next 15, Later 24; Must 32, Should 23, Could 9. Trong 55 task, 11 epic, 8 sprint goals, 9 risk, 9 DoD và 5 DoR (14 case governance), kiểm kê đã lưu; test thực thi các nhóm này chưa chạy, ngoại trừ các finding source ghi rõ dưới đây. Epic AC/NFR được tính trong hàng Ready; sprint/product goal nằm trong nhóm Governance. Tất cả case giữ trạng thái trong `results.json`.

| Priority gốc theo case | Tổng | BLOCKED | MISSING | NOT_RUN |
|---|---:|---:|---:|---:|
| Must | 159 | 2 | 0 | 157 |
| Should | 73 | 0 | 0 | 73 |
| Could | 18 | 0 | 10 | 8 |
| Nhãn khác của bộ kế hoạch (P0/P1, governance, technical) | 154 | 5 | 6 | 143 |

Coverage theo các nhóm backlog cho thấy Tài khoản, Sự kiện, Sơ đồ/giá, Giữ ghế, Đơn hàng, Thanh toán, Vé, Soát vé, Ngoại tuyến, Huỷ/hoàn, Vận hành, Báo cáo/dữ liệu, Riêng tư và Hạ tầng vẫn chủ yếu `NOT_RUN`; bảng group đầy đủ nằm trong `coverage-summary.json`.

## Đợt thực hiện 0–9

- **0 Baseline:** đã đọc `AGENTS.md`, toàn bộ PLAN theo mục/nhóm story/task/integration, và JSON theo 404 case; snapshot dirty tree/HEAD/hash; đọc đủ 7 sheet workbook và lưu row/source-cell mapping. Các thay đổi có sẵn không bị sửa, reset, stash hay ghi đè.
- **1 Khả năng chạy:** `pnpm build` exit 1: web build thành công, API TypeScript lỗi `decryptActivation` không export. `pnpm typecheck` exit 2 với cùng lỗi và các lỗi `EventsService.publication` không tồn tại. `pnpm lint` exit 0 (có warnings). `pnpm --filter web test`: 25 files / 154 tests PASS. `pnpm test` chạy API: 49/53 files pass; 425/437 tests pass, 12 fail; root dừng trước web/deploy nên web test và deploy specs được chạy riêng. `node --test deploy/...`: 20/20 pass. Không tính test suites thành AC PASS.
- **2 Nền nghiệp vụ:** source candidates được kiểm; user/event/map/price/auth flows chưa thể chạy UI+API+DB do không có API fresh build và profile test. Không ghi mutation DB.
- **3 Tiền và ghế:** INT-03 yêu cầu 200 request đồng thời/100 ghế × 10 vòng, barrier PostgreSQL; sample thực tế 0. INT-04, webhook/expiry/idempotency cũng chưa chạy.
- **4 Vé và cửa:** unit tests riêng không thay end-to-end. SMTP catcher, payment sandbox, camera/QR thật chưa có; INT-01/02/05 chưa chạy.
- **5 Ngoại tuyến:** không chạy browser IndexedDB/network-fault sync; INT-06/07 `NOT_RUN`, device/4G thật chưa có.
- **6 Vận hành mở rộng:** Later vẫn được kiểm kê. Mã S-56/S-59/S-60/S-62/S-63 không tìm thấy trong source scope đã quét; static `MISSING`, không tự biến thành release gate. Các flow khác/backup off-host chưa chạy.
- **7 Core bổ sung:** `CoreCompletionModule` không nằm trong import graph AppModule; route publication không có trong EventsController; PublicationControl/RescheduleForm/MailFailures không được nối vào page. Các API bổ sung hiện chỉ nằm trong module chưa mount. `INT-12`, EXT-* tương ứng được đánh dấu MISSING theo static evidence; fresh API route behavior không thể gọi do build fail.
- **8 UI/NFR/staging:** fresh web-only server trên `127.0.0.1:3410` trả trang chủ HTTP 200; browser thấy loading chuyển sang `Không tải được danh sách / Dịch vụ chưa sẵn sàng`. Đây là backend unavailable state, không phải PASS catalog. `/forgot-password` wrapper hiển thị trên browser; không submit form. Browser trên fresh web build (viewport thực tế 602×764, không phải target 1440×900 hay mobile) có ảnh inline trong lịch sử chat; tool browser không cho lưu bytes thành file trong thư mục evidence. Viewport tùy chỉnh 1440×900/390×844/360×800 không khả dụng; mobile/camera/4G/staging BLOCKED. NFR workload/sample/latency: 0 mẫu hợp lệ, không có raw latency/p95/max để báo.
- **9 Tổng hợp:** cập nhật `results.json`, `bugs.md`, `run-manifest.json`, report và coverage; không thay mã sản phẩm, không commit/push/merge/deploy.

## Lỗi và thiếu tính năng

| Mã | Mức | Case/AC | Actual | Expected | Evidence |
|---|---|---|---|---|---|
| BUG-01 | P1 | INT-12; build/typecheck | API fresh build dừng tại `src/core-completion/core.service.ts` vì import `decryptActivation` không export. | Fresh API build/typecheck hoàn tất để có thể chạy source hiện tại. | `build.log`, `typecheck.log` |
| BUG-02 | P1 | INT-12; EXT-PUBLISH-01 | `CoreCompletionModule` không được mount; mounted EventsController không có `PATCH /events/:id/publication`; component UI chưa nối vào page. | Publication API và thao tác UI thực có, chạy qua app module. | `source-findings.md`, `apps/api/src/app.module.ts`, `apps/api/src/events/events.controller.ts` |
| GAP-56 | P2 (Later/Could) | S-56 | Không tìm thấy coupon/discount route/component/schema trong source scope. | Coupon per event theo baseline. | `source-findings.md` |
| GAP-59 | P2 (Later/Could) | S-59 | Không tìm thấy waitlist riêng; phòng chờ S-40 không thay thế waitlist. | Waitlist FIFO theo AC. | `source-findings.md` |
| GAP-60 | P2 (Later/Could) | S-60 | Không tìm thấy sold-seat PDF route/component. | PDF một trang theo snapshot. | `source-findings.md` |
| GAP-62 | P2 (Later/Could) | S-62 | Không tìm thấy attendance export CSV route/UI. | CSV theo AC và quyết định PII. | `source-findings.md` |
| GAP-63 | P2 (Later/Could) | S-63 | Không tìm thấy abandoned-cart/hold-duration report. | Report theo suất với count/mean/p90. | `source-findings.md` |

Unit test failures được lưu log và không tự nâng thành bug nghiệp vụ: 5 publication tests gọi method không tồn tại (phù hợp finding BUG-02); 3 reset-path checks và 1 reminder expectation fail trong `core.spec.ts`; một app controller setup hook timeout; 2 retry-backoff tests vượt upper bound khoảng 472ms và 640ms (có thể nhiễu timing, cần tái chạy trước khi kết luận flaky/product). Chúng không bị bỏ khỏi số liệu.

## Blocker và quyết định

- **DB/Redis/SMTP thử riêng chưa xác nhận.** Container `thudemo-postgres-1` đang chứa `thudemo`, `codegym_local` và các DB test hiện có. E2E launcher tạo DB mới trong container dùng chung, chọn Redis DB 15 mà không kiểm tra trống và ghi đè log ở thư mục ngày cố định. Tôi đã đọc script, không chạy; không có integration/seed/reset/flush/DB chính mutation.
- Không có payment provider sandbox/catcher đã xác nhận, staging mới, camera/điện thoại hay 4G thật. Mock/unit không được coi là provider thật.
- DEC-18 có record chấp thuận trong repo; trạng thái GitHub current required checks/branch-protection chưa đọc lại được. DoD `GOV-01` vì vậy BLOCKED, không tuyên bố human approval hay áp ngoại lệ khi chưa xác minh enforcement.
- K-01 benchmark/decision artifacts cũ được nhận diện nhưng không được dùng làm PASS mới. Decision record ghi DEC17 chấp nhận deviation timebox/mentor, nhưng không nhận tuân thủ hồi tố; DoD review độc lập vẫn cần phân biệt. K-01 fresh run chưa chạy.
- Cần chốt trước khi kiểm phần liên quan: S-27 retry count (tổng hay retry thêm), luật conflict offline S-36 nếu contract khác AC gốc, refund/cutoff/cancel scope S-45/46/48, queue/rate-limit/ticket-limit thresholds, refund UNKNOWN/manual SLA, retention, gross/net accounting, consent/erasure scope, S-61 email sau consent withdrawal, backup destination/encryption/key retention, CSV PII, coupon stacking, transfer toggle và waitlist seat reservation. Hiện không tự áp policy nào; các case liên quan giữ `NOT_RUN` trừ khi thiếu code đã được đánh dấu `MISSING`.

## Đối chiếu toàn vẹn và số đo

Không tạo fixture ghi DB nên không có order/seat/ticket/payment/admission/outbox integrity sample. NFR performance: sample count 0; raw latency, p95, max, throughput, lỗi theo workload không có. INT-03 200 concurrent/100 ghế/10 vòng chưa chạy. Không có claim local/staging/device PASS.

## Mức chứng minh

- **Local:** lint, web build, web unit suite, deploy script unit suite đạt; API build/typecheck và API unit suite chưa đạt; web-only runtime render được wrapper nhưng backend catalog lỗi. Đây không phải nghiệm thu chức năng toàn ứng dụng.
- **Staging:** chưa kiểm.
- **Device/camera/4G/offline:** chưa kiểm; BLOCKED.
- **Sandbox provider / email Inbox / off-host backup:** chưa chứng minh. SMTP catcher chưa xác nhận; kể cả catcher nhận thư cũng không chứng minh Inbox.

## Tái kiểm

Không sửa source sản phẩm nên không có retest sau sửa. Re-run độc lập được lưu: web unit 154/154 PASS; deploy tests 20/20 PASS. API 425/437 PASS, 12 fail và build/typecheck errors vẫn giữ nguyên, không đổi expected hoặc bỏ skip/xfail/flaky. Khi source/profile thay đổi, phải tạo run-id mới và giữ run này làm baseline.



