# KẾ HOẠCH KIỂM THỬ TOÀN BỘ DỰ ÁN CODEGYM BẰNG CHATBOT AI

Ngày lập: **22/10/2026**, giờ Việt Nam. Dự án: `D:\Merge_2\Codegym`.

**Đây là kế hoạch thực thi kiểm thử và đối chiếu yêu cầu. Chưa chạy các ca kiểm thử trong lượt lập kế hoạch này, chưa kết luận dự án đạt hay không đạt.**

## 1. Mục tiêu và bộ tài liệu

Mục tiêu là trả lời có bằng chứng: từng chức năng có tồn tại, có dùng được trọn luồng, có đáp ứng AC/NFR gốc, có bảo vệ đúng quyền và có giữ đúng dữ liệu khi lỗi/đồng thời hay không.

Ba tệp dùng cùng nhau:

1. `PLAN.md`: phạm vi, cách chuẩn bị, thứ tự chạy, tiêu chí nghiệm thu, phương pháp cho từng chức năng, ca tích hợp và checklist kỹ thuật.
2. `test-cases.json`: ma trận từng AC/NFR với ID, ô nguồn, dữ liệu, bước thử, kết quả mong đợi và trường ghi kết quả. Tất cả ban đầu là `NOT_RUN`.
3. `CHATBOT_PROMPT.md`: nội dung giao việc cho AI có quyền đọc mã, chạy ứng dụng, gọi API và thao tác trình duyệt.

Không dừng ở một checklist chung như “test đăng nhập, test mua vé”. Mỗi kết quả phải truy ngược được tới yêu cầu và bằng chứng. Khi một tiêu chí có nhiều mệnh đề, chatbot tách thành case con, ví dụ `S-10-NFR.01`, `.02`, giữ liên kết với tiêu chí gốc.

## 2. Nguồn yêu cầu, phạm vi và cách xử lý mâu thuẫn

### 2.1. Phạm vi đã đọc

Nguồn chính: `D:\BookSys\Bán vé sự kiện có sơ đồ ghế.xlsx`, 7 sheet: Thông tin, Sprints, Epics, Backlog, Tasks, Rủi ro, DoD-DoR.

- **64 mục Backlog: 63 story S-01 đến S-63 và spike K-01.**
- **25 Ready**, bao gồm K-01; **15 Next**; **24 Later**.
- **55 task kỹ thuật T-01 đến T-55**, **11 epic**, **9 rủi ro**, **9 điều kiện DoD và 5 điều kiện DoR**.
- Các thông tin Sprint/Story Point/Tier/Status trong Excel là dữ liệu gốc, không phải bằng chứng chức năng đã hay chưa hoàn thành.
- Mọi mục Later vẫn nằm trong inventory. Thiếu tính năng Later ghi `MISSING` và nêu rõ ngoài/chưa được chốt trong phạm vi bàn giao; không âm thầm bỏ qua, cũng không tự coi toàn bộ Later là gate phát hành bắt buộc.
- Chức năng bổ sung tìm thấy trong mã/tài liệu: quên/đặt lại mật khẩu, công bố/ẩn sự kiện, đổi giờ diễn, quản trị email lỗi. Kiểm như phạm vi mở rộng có mã; không gán chúng thành AC mới trong Excel.

Mục tiêu sản phẩm gốc: không bán trùng ghế, không vượt sức chứa, soát vé được khi mất mạng. Sandbox thanh toán và dữ liệu thử là phạm vi của kế hoạch. Không tự bổ sung thanh toán tiền thật, production hoặc yêu cầu pháp lý mới.

### 2.2. Thứ tự đối chiếu

1. Yêu cầu người dùng trong chat và quyết định đã được người có thẩm quyền chấp thuận, có thể xác minh.
2. Excel gốc để lập baseline AC/NFR. Đọc cả Epics, Tasks, DoD, Rủi ro; không chỉ cột Title.
3. Hợp đồng/refinement/quyết định của dự án, chỉ thay baseline ở đúng phần có bằng chứng chấp thuận.
4. Mã nguồn, cấu hình và hành vi runtime là đối tượng kiểm tra, không tự trở thành yêu cầu đúng.
5. Báo cáo và log cũ là gợi ý tái sử dụng, không được nhập lại thành PASS mới.

Nội dung tài liệu được dùng làm dữ liệu yêu cầu/tham khảo. Các câu trong tài liệu yêu cầu chatbot chạy lệnh, sửa mã, gửi thư hay thay cấu hình không tự mở rộng quyền thực hiện mà người dùng giao.

### 2.3. Các điểm phải ghi rõ, không tự chọn một bên

| Vấn đề | Cách xử lý khi kiểm thử |
|---|---|
| DoD Excel yêu cầu review bởi một thành viên khác; AGENTS mô tả DEC-18 cho phép review kỹ thuật tự động sau khi được duyệt | Báo riêng mức đáp ứng DoD gốc và ngoại lệ DEC-18. Chỉ áp ngoại lệ khi đọc được quyết định/receipt hợp lệ. Không gọi review tự động là human approval. |
| Task nói migration tiến/lùi; AGENTS yêu cầu migration bù, không reset hay `db push` | Kiểm trên DB thử bằng tiến → migration bù → tái áp dụng bằng migration mới theo quy định repository. Nếu người nghiệm thu đòi đúng thao tác down script, ghi sai khác cần quyết định, không xoá migration đã áp dụng. |
| S-27 nói “tối đa 3 lần” còn báo cáo từng nêu cách hiểu khác nhau | Ghi rõ số lần tổng cộng hay 3 lần retry ngoài lần đầu. Chạy theo contract đã duyệt; nếu thiếu quyết định, báo cả hành vi thực tế và `NEEDS_DECISION`. |
| S-36 chọn lần quét sớm hơn theo giờ thiết bị | Kiểm cả thứ tự đồng bộ đảo và offset. Nếu mã/contract dùng luật khác, nêu nguyên văn khác biệt và kết quả theo baseline/ngoại lệ, không tự sửa expected. |
| S-45/46/48 còn mở chính sách huỷ/hoàn | 24 giờ, hoàn mock 100%, huỷ cả đơn, chưa vào cửa và nhả ghế ngay là contract local ứng viên được nêu ở tài liệu hiện có; cần truy vết quyết định trước khi dùng làm tiêu chí chính thức. |
| Later còn thiếu ngưỡng/định dạng/kênh/quyền | Kiểm phần hành vi đã xác định và đã triển khai, liệt kê chính xác phần chưa chốt. Không phát minh ngưỡng để báo PASS. |
| AGENTS còn nhắc root `thudemo/` và `../docs`, `../tasks` | Root thực tế đang kiểm là Codegym. Các đường dẫn `D:\Merge_2\docs\product.md`, `architecture.md`, `D:\Merge_2\tasks` chưa tìm thấy tại lượt đọc này. Không tự lấy yêu cầu từ repository lân cận thay thế. |

Khi cần quyết định, ghi ID, hai nội dung mâu thuẫn, tác động và bằng chứng; tiếp tục các nhóm không phụ thuộc. Không cần dừng toàn bộ chương trình kiểm thử.

## 3. Snapshot mã nguồn và các rủi ro phải xác minh trước

Tại lúc đọc: nhánh `feature/sprint-4-8-complete`, HEAD `ce777bd13e472c089eef4a3c1ed4455e501ae3ba`. Working tree có thay đổi tracked và nhiều tệp untracked có sẵn. Không commit, reset, stash hoặc ghi đè các thay đổi này chỉ để kiểm thử. Không dùng HEAD đơn lẻ để nhận diện bản chạy; lưu fingerprint cả file chưa commit.

Các nhận xét sau là **quan sát tĩnh tại thời điểm lập kế hoạch**, chưa phải lỗi đã được tái hiện runtime:

| Mã | Quan sát | Phép kiểm bắt buộc |
|---|---|---|
| OBS-01 | Có `core-completion/core.module.ts`, nhưng chưa thấy `CoreCompletionModule` trong import graph của AppModule và các module được tìm kiếm | Fresh build; gọi các route core bằng đúng method/quyền. Đặc biệt không dùng file `dist` cũ để chứng minh source mới hoạt động. |
| OBS-02 | Handover nêu `PATCH /events/:id/publication`; controller events hiện đọc chưa khai báo route này | Kiểm endpoint và nút Công bố/Ẩn. HTTP 404 ở đây là dấu hiệu thiếu tích hợp, không phải PASS “ẩn sự kiện”. |
| OBS-03 | Có `PublicationControl`, `RescheduleForm`, `MailFailures`, nhưng tìm kiếm hiện chưa thấy chúng được dùng ngoài tệp định nghĩa/test | Đi bằng UI từ editor/workspace/operations; component test đạt không thay kiểm nút thực có trên trang. |
| OBS-04 | Handover core và test matrix cũ có số ca/source khác nhau | Mỗi báo cáo mới lưu source fingerprint, test command, exit code, số chạy/bỏ qua và môi trường; không cộng lại số test cũ. |
| OBS-05 | Có hai nhóm tuyến/triển khai giữ ghế, vé và scanner | Inventory phải phân biệt route đã mount, legacy/alias, public/private và tuyến UI thực gọi; kiểm hành vi nhất quán giữa proxy và API trực tiếp, không mặc định mọi file controller đều được mount. |
| OBS-06 | Chưa tìm thấy module chuyên biệt cho S-56/59/60/62/63 trong inventory ban đầu | Tìm lại code, UI, API, schema, feature flags khi chạy; thiếu thì `MISSING`, không thay waitlist S-59 bằng phòng chờ S-40 hoặc báo cáo HTML bằng CSV/PDF export. |
| OBS-07 | Handover ghi chưa nghiệm thu trực quan browser desktop/mobile do origin gate | Mở lại theo quyền hợp lệ; nếu còn bị chặn, ghi `BLOCKED` đúng các case UI. Không lấy HTTP smoke hay component test thay browser evidence. |

Kiến trúc quan sát: pnpm workspace, web Next.js/React, API NestJS, Prisma/PostgreSQL, Redis, SMTP/outbox và scheduler. Các câu trong README dùng `thudemo/` có dấu vết lịch sử; xác nhận lại đường dẫn/cổng thực.

## 4. Chuẩn bị môi trường và dữ liệu

### 4.1. Ba lớp môi trường

| Lớp | Dùng để làm gì | Cách ghi kết quả |
|---|---|---|
| TEST-LOCAL | DB/Redis/SMTP và tài khoản giả riêng; unit/integration/browser/load/fault injection | Chỉ kết luận local với cấu hình đã ghi. |
| STAGING | Xác nhận build đang deploy, HTTPS/proxy/session, AC quan trọng và smoke | Là điều kiện riêng của DoD gốc; local đạt chưa thành staging đạt. Không tự deploy hay merge để tạo bằng chứng. |
| DEVICE | Điện thoại/camera, 4G thật, ánh nắng và mất mạng | Ghi model/OS/browser/network; mô phỏng ghi rõ là mô phỏng. Thiếu thiết bị là `BLOCKED`, không PASS suy diễn. |

Kiểm Node và pnpm theo `package.json`/README hiện hành: Node 24.x, pnpm 10.15.1; ghi phiên bản thực cài. PostgreSQL/Redis theo compose/profile thực tế. Không tự nâng dependency trong đợt nghiệm thu.

Không đọc/in toàn bộ `.env`, mật khẩu, cookie, private key hoặc connection string vào chat/report. Có thể nạp cấu hình local theo quyền nhưng chỉ ghi host/cổng/tên DB đã che thông tin; mọi thao tác ghi phải xác nhận DB thử tách biệt. Clone DB có PII vẫn là dữ liệu nhạy cảm; ưu tiên dữ liệu tổng hợp và SMTP catcher, không đưa payload vào báo cáo công khai.

### 4.2. Bộ dữ liệu tối thiểu

| ID | Dữ liệu | Mục đích |
|---|---|---|
| F01 | 2 BUYER, 2 ORGANIZER, 2 STAFF, 1 ACCOUNTANT, 1 ADMIN; account inactive/unverified/erased phụ | Kiểm 5 vai trò, quyền sở hữu, thay role và thu hồi session; không khóa tài khoản chính. |
| F02 | Event draft/published/hidden; suất hôm nay, tương lai >48h, sát cutoff 24h, quá khứ, đóng bán, huỷ | Kiểm trạng thái, public URL và timezone. Tính giờ tương đối theo server, không hard-code ngày mẫu đã qua. |
| F03 | Map 6 ghế/3 hạng, map 2.000 ghế, tệp malformed/trùng/thiếu field/nhiều lỗi; tệp sát/vượt 5 MB | Import, preview, rollback, giới hạn dung lượng và hiệu năng. Lấy schema JSON từ code/fixture thật. |
| F04 | VIP=200000, STD=100000, ECO=50000 VND; dữ liệu giá thiếu/âm/chữ/decimal | Oracle tiền nguyên; order 1 VIP+1 STD có tổng 300000. |
| F05 | Hold còn hạn/hết hạn/thuộc người khác; order pending/paid/expired/cancelled/needs-review | Giữ ghế, gia hạn, thanh toán, race expiry và bảo mật. Ghi tên enum thực trong schema. |
| F06 | QR đúng, sửa 1 ký tự, thiếu signature, kid không biết, vé sai suất/huỷ/đã vào; K1/K2 thử | Chữ ký, xoay khóa, reject reason, offline. Không dùng khóa production để thử luân chuyển. |
| F07 | 2 cửa, 2 context thiết bị, 40 offline scans, 5.000 tickets snapshot | Chống dùng lại, lưu bền, sync lô, conflict và hiệu năng 4G. |
| F08 | CSV đối soát 4 nhóm; nhiều order và refund/transfer/audit | Báo cáo, đối soát, không cộng trùng. |
| F09 | 55 email đủ loại/trạng thái; catcher có chế độ lỗi; worker off/on | Phân trang 20 dòng, resend/retry/lease và thời hạn gửi mail. |
| F10 | Snapshot dữ liệu trước test, manifest checksum/counts và key fixture giữ riêng | So integrity sau lỗi và restore; đối chiếu số liệu hiện tại thay vì hard-code count lịch sử. |

Mỗi fixture có `run-id`, owner và danh sách ID để cleanup có chọn lọc. Không dùng reset DB, `down -v`, flush Redis dùng chung, sửa 40 sự kiện thật hoặc gửi email tới khách để tạo PASS. Chỉ dừng process/container thuộc profile thử. Thư catcher chứng minh gửi/nhận nội bộ, không chứng minh Inbox Internet.

### 4.3. Hướng dẫn lệnh và điều kiện dùng script sẵn có

Các lệnh dưới đây để chatbot thực hiện **khi được giao chạy kiểm thử**, chưa được chạy trong lượt lập kế hoạch. Chạy từ `D:\Merge_2\Codegym` nếu không ghi khác.

```powershell
git status --short
git rev-parse HEAD
node --version
pnpm --version
pnpm lint
pnpm typecheck
pnpm --filter api test
pnpm --filter web test
pnpm build
```

`pnpm test` ở root còn chạy các bài `deploy/*.spec.mjs`; phải kiểm nhóm này khi đánh giá toàn dự án. Suite dùng chung DB phải chạy tuần tự theo cấu hình repo, không tự tăng parallelism làm nhiễu kết quả. Không cài dependency lại nếu đã đủ; nếu cần cài, dùng lockfile và đúng phiên bản.

**Không chạy thẳng `pnpm --filter api run test:e2e` với `.env` trỏ DB chính.** File `test/integration-database.ts` đòi DB thử và opt-in rõ ràng. Script tiện ích `apps/api/scripts/run-isolated-e2e.mjs` tạo `codegym_e2e_<timestamp>`, dùng Redis DB15 và tắt worker thư, nhưng có hard-code container/cổng/output; đọc và kiểm trước khi dùng.

```powershell
# Chỉ sau khi kiểm container local, DB isolation, Redis DB15 chưa dùng, output đã bảo toàn.
Set-Location D:\Merge_2\Codegym\apps\api
node --env-file=../../.env scripts/run-isolated-e2e.mjs
```

| Script ứng viên | Điều kiện/phụ thuộc phải kiểm trước |
|---|---|
| `scripts/sprint1-demo.ps1` | Clone riêng; không ghi đè `.env` đang dùng. Dùng profile và cổng được launcher trả về, không mặc định cổng trống. |
| `apps/api/scripts/prepare-sprint-test-db.mjs` | Có backup `.cache/sprint4-8-evidence/20261022/before-sprint-implementation.dump`, container được hard-code phù hợp. Tạo DB thử nhưng ghi file env nhạy cảm, không công khai. Nếu backup thiếu, tạo fixture mới thay vì giả kết quả. |
| `apps/api/scripts/verify-sprint6-8.mjs` | Chỉ nhận DB `codegym_sprint_<timestamp>`, chạy API fixture 3392; kiểm Redis riêng và cổng trống trước. |
| `apps/api/scripts/verify-core-completion.mjs` | Có `.cache/core-completion/before-core.dump`; tạo `codegym_core_*`, Redis DB14, SMTP catcher; cần `dist` vừa build. Import class trực tiếp chỉ xác nhận phần class, vẫn phải test route thật. |
| `apps/api/scripts/start-sprint-browser-fixture.mjs` | DB `codegym_sprint_*`, web3393/API3392; tắt thư thật. Kiểm cách dừng process và cache build riêng. |
| `apps/api/scripts/start-core-browser-fixture.mjs` | DB `codegym_core_*`, web3400/API3401; worker mới tắt. Không coi fixture worker tắt là bằng chứng thư đã gửi. |
| `apps/api/scripts/verify-sse-load.mjs` | DB `codegym_sprint_*`, API3392 đang chạy đúng DB, tới 2.000 viewers. Script tìm fixture cụ thể; nếu không khớp phải chuẩn bị data trước. |
| `apps/api/scripts/verify-backup-drill.mjs` | Có count hard-code 40 event/40 suất/5544 ghế, cần paid order và key; chỉ chứng minh local restore, ghi `offhost:false`, key mã hoá drill không được giữ. Không dùng thay nghiệm thu nightly/off-host/key retention. |
| `verify-s30-signed-qr`, `verify-s31-http`, `verify-s31-storage`, `verify-s43`, script browser cũ | Đọc assert DB/port/cwd/worker/cleanup/output và fixture của từng script trước; tên “verify” không tự bảo đảm an toàn hay coverage. |

Một số script ghi đè thư mục bằng chứng có ngày cố định. Sao chép/bảo toàn log cũ trước và lưu output mới ở `evidence/ai-full-test/<run-id>/`; không retag log lịch sử thành lần chạy mới. Khởi động app thật từ build mới, ghi PID/cổng/fingerprint; file `dist` có sẵn có thể khác source.

## 5. Thứ tự kiểm thử và điểm kiểm soát

| Đợt | Việc phải làm | Điều kiện hoàn tất đợt |
|---|---|---|
| 0. Baseline | Hash workbook/source, lưu dirty tree, kiểm yêu cầu/decision; inventory mọi page/route/controller/job/test; xác nhận DB thử | Có danh mục scope và tệp manifest, không lộ secrets; tất cả case `NOT_RUN`. |
| 1. Khả năng chạy | Lint/typecheck/unit/build; khởi động build mới, health/web/proxy; module core/publication | Không dùng build cũ; lỗi boot/module/build được báo trước, các test độc lập vẫn tiếp tục. |
| 2. Nền nghiệp vụ | Auth/RBAC/registration; tạo event/suất, map, giá, mở đóng bán, catalog | UI+API+DB cho S-01–S-09, S-15 và quản trị; negative cases không đổi dữ liệu. |
| 3. Tiền và ghế | Hold/release/reload/expiry; order; mock/webhook/result/expiry; race | Toàn bộ invariant tiền/ghế, idempotency, kiểm đồng thời thực trên PostgreSQL. |
| 4. Vé và cửa | Vé/QR/key rotation/mail; staff assignment; scan/duplicate/override; history | Đi trọn INT-01/02/05, kiểm camera/QR thực và số đo nếu thiết bị có. |
| 5. Ngoại tuyến | Snapshot/delta/PII; offline reload; queue/sync/conflict/network | Queue bền qua đóng mở; lỗi 401/403/timeout không mất dữ liệu; INT-06/07. |
| 6. Vận hành mở rộng | Waiting room/quota/ticket limit/SSE/monitoring; huỷ/hoàn; báo cáo/đối soát/privacy/backup | Phân biệt Later đã có code, thiếu code và phần cần quyết định; INT-08–11/16/17. |
| 7. Core bổ sung | Publication/reschedule/reset/admin-mail/reminder; kiểm kết nối UI/API mới | INT-12 và EXT-* chạy qua app thật, không chỉ gọi class trực tiếp. Có thể đưa lên đợt1 để phát hiện mất route sớm. |
| 8. UI/NFR và staging | Mọi route, desktop/mobile, a11y cơ bản, latency/load, staging/thiết bị | Mỗi NFR có phép đo đúng workload; cái chưa thể kiểm ghi BLOCKED thay PASS. |
| 9. Tổng hợp | Requirement coverage, bug list, retest, báo cáo và đề xuất nghiệm thu | Không còn case rỗng; không đánh dấu toàn bộ dự án đạt khi còn AC/NFR bắt buộc chưa chứng minh. |

Ước lượng để sắp lịch, không phải cam kết runtime: chuẩn bị 0,5–1 ngày; nghiệp vụ/API 1–2 ngày; race/offline/NFR 1–2 ngày; UI/staging/thiết bị và báo cáo 1–2 ngày, cộng thời gian chờ quyết định/sandbox/thiết bị và sửa lỗi nếu được giao riêng. Thực hiện theo đợt để có kết quả sớm, không cắt case để khớp ước lượng.

## 6. Quy tắc cho AI và phạm vi tự động hoá

AI đọc mã, chuẩn bị fixture thử, chạy test/ứng dụng ở môi trường tách biệt, thao tác UI, gọi API, đối chiếu DB và viết báo cáo. Đợt nghiệm thu mặc định **không sửa mã sản phẩm, không đổi AC để làm test xanh**. Nếu được yêu cầu sửa sau đó, tách bản trước/sau, regression và retest theo fingerprint mới.

Một case có UI phải được thao tác trực tiếp trên trình duyệt; test bằng API bổ sung kiểm dữ liệu/quyền. Các case chỉ schema/constraint/job có thể không cần UI. Không khai đã dùng browser/camera/4G/SMTP Internet nếu chưa dùng đúng bề mặt đó.

Không gửi thư thật, thông báo tới người khác, merge/push/deploy, bật worker ở hệ thống chính, mua dịch vụ hoặc thay chính sách. Kiểm bằng catcher/mock/profile thử là cách mặc định. Nếu phải chờ dữ liệu/quyền/thiết bị, báo mục cụ thể và tiếp tục phần độc lập, không lặp yêu cầu xác nhận cho việc đã được giao.

Các kiểm tra xuyên suốt gắn vào INT-13/15 và nhóm S-02, không được bỏ qua chỉ vì không có story riêng:

- Logout ở UI/API phải kết thúc session phía server; Back/refresh hoặc tab khác không xem lại dữ liệu riêng qua cache. Login returnTo không đưa ra website ngoài hoặc đưa STAFF vào màn quản lý không được cấp quyền.
- Cookie phiên có HttpOnly và thuộc tính Secure/SameSite phù hợp môi trường HTTPS; test hết hạn phía server và thu hồi nhiều session. Đối chiếu hợp đồng session, không tự đổi sang JWT.
- Với API thay đổi dữ liệu, thử origin lạ, yêu cầu thiếu chứng thực nguồn/CSRF theo cơ chế app và header IP giả; từ chối không đổi DB. Không áp CSRF browser cho webhook provider theo cách làm hỏng hợp đồng chữ ký riêng.
- UUID sai, body null/array/thừa field, enum lạ, chuỗi dài, ký tự Unicode/HTML trong form và JSON map: thông báo rõ, không 500, không thực thi HTML/script khi hiển thị và không lộ stack/SQL. Chạy payload an toàn trong profile thử, không quét hệ thống khác.
- Kiểm header cache cho tài khoản/đơn/vé, phân trang filter sai, direct URL không qua menu, double-click và refresh giữa request. Kiểm `/payment/result` cùng biến thể có orderId, `/scanner`, `/check-in` và các alias/legacy còn mount để không bỏ sót bề mặt thực dùng.

## 7. Ma trận quyền tối thiểu

| Bề mặt | Ẩn danh | BUYER | ORGANIZER | STAFF | ACCOUNTANT | ADMIN |
|---|---|---|---|---|---|---|
| Catalog/chi tiết đang bán | Public | Public | Public | Public theo UI role | Public theo UI role | Public theo UI role |
| Register/activate/login/forgot/reset | Chỉ endpoint public opt-in | Theo chức năng | Theo chức năng | Theo chức năng | Theo chức năng | Theo chức năng |
| Tạo/sửa event, map, giá, trạng thái/clone/publication/reschedule | Từ chối | Từ chối | Đúng chủ | Từ chối | Từ chối | Không mặc định có quyền nếu route không cấp |
| Hold/order/pay/history/tickets/resend/transfer | Từ chối | Chỉ của mình | Không suy quyền BUYER | Từ chối | Từ chối | Theo route thực và quyết định được duyệt |
| Check-in/snapshot/keys/attendance | Từ chối, trừ public key được public có chủ đích | Từ chối | Theo phạm vi sự kiện | Theo suất/cửa phân công | Từ chối | Theo route/phạm vi |
| Offline sync | Từ chối | Từ chối | Theo route chốt | STAFF và scope hợp lệ | Từ chối | Không suy quyền nếu chỉ route STAFF |
| Users/role/status/assignment | Từ chối | Từ chối | Từ chối | Từ chối | Từ chối | ADMIN |
| Financial/attendance owner report | Từ chối | Từ chối | Đúng chủ | Theo route riêng nếu có | Theo quyết định, không tự cấp | Theo route |
| Refund operations/reconciliation | Từ chối | Từ chối | Theo route riêng nếu có | Từ chối | Cho phép | Cho phép |
| Mail failures/retry, erasure approve | Từ chối | Từ chối | Từ chối | Từ chối | Từ chối nếu không cấp rõ | ADMIN |
| Consent/erasure request | Từ chối | Chính mình | Chính mình | Chính mình | Chính mình | Chính mình |

Đây là hướng dẫn tạo case từ yêu cầu và decorator đã đọc, không phải tự thiết kế lại quyền. Lập bảng từng METHOD+path theo route runtime; nơi Excel và implementation khác nhau phải ghi discrepancy. Mỗi route private chạy tối thiểu anonymous, đúng role, sai role, đúng chủ và khác chủ khi có owner. Đọc public key không chứa private key; route public key có thể public có chủ đích.

## 8. Oracle dữ liệu và bất biến phải kiểm sau mỗi luồng quan trọng

1. **Không trùng ghế:** mỗi seat của một showtime có tối đa một quyền giữ/đặt/bán còn hiệu lực theo state model; hold quá hạn không chặn ghế. Thử vi phạm DB trực tiếp, không chỉ đọc câu `if` ở service.
2. **Không vượt sức chứa:** số ghế SOLD + ghế HELD/PENDING còn hiệu lực + ghế FREE = tổng ghế bán được; tập ID không giao nhau. Không cộng hold đã chuyển thành order hai lần.
3. **Đúng tiền:** tổng order bằng tổng unitPrice snapshot của items bằng số tiền gateway khi ghi nhận; giá integer VND. Sửa total phía client không có tác dụng. Thay bảng giá không sửa order cũ.
4. **Nguyên tử:** tạo order/gia hạn hold; paid/sold/xoá hold; expired/nhả ghế là các cụm chuyển cùng giao dịch. Chèn lỗi giữa bước trong DB thử để kiểm rollback.
5. **Idempotency:** webhook/scan/refund/cancel/retry/worker replay không tạo thêm nghiệp vụ hiệu lực. Đếm theo transactionId/requestId/scanId/dedupeKey và kiểm constraint, không chỉ đếm HTTP 200.
6. **Đúng vé:** mỗi ghế paid có một vé hiệu lực của người sở hữu hiện tại, QR đúng showtime và public key; unpaid/cancelled không lộ QR hợp lệ. Transfer/reschedule không làm nhân ghế/tiền.
7. **Đúng admission:** một lượt NORMAL hiệu lực theo contract, duplicate và EXCEPTION tách biệt, có lý do/actor; conflict offline giữ đủ nguồn để kiểm tra.
8. **Queue bền:** chỉ gỡ scan khỏi local queue sau ack server bền tương ứng; crash/timeout/login change không làm mất bản ghi chưa xác nhận.
9. **Đúng báo cáo:** doanh thu/tồn/admission từ oracle tập ID/order items độc lập, không so dashboard với endpoint dùng cùng query rồi tự coi là kiểm độc lập.
10. **Không lộ dữ liệu:** rejected request không đổi DB; người B không xem A; log/bundle/cache/mail/snapshot không có secrets hoặc PII ngoài hợp đồng. Erasure giữ nguyên transaction totals.

Tên bảng/cột và enum thực phải lấy từ Prisma schema/migration tại lần chạy, không viết SQL dựa vào tên trong Excel nếu code dùng khác. Ghi query oracle đã che thông tin, chỉ đọc đối với DB dữ liệu chính.

## 9. Ma trận hiệu năng và độ tin cậy

| Yêu cầu | Cách đo | Điều kiện đạt gốc |
|---|---|---|
| S-05/T-12 import | Tệp thật 2.000 ghế, từ nhận yêu cầu đến transaction commit; nhiều lượt fixture độc lập | Dưới 5 giây; không nạp một phần |
| S-09/T-19 query | Query trạng thái 2.000 ghế, query trace/count | Dưới 200 ms và một truy vấn theo nhiệm vụ |
| S-09/T-21 render | Browser từ mở trang tới đầy đủ 2.000 ghế tương tác được | Dưới 2 giây; kiểm cả desktop/mobile |
| S-10 hold | Workload giữ ghế bình thường và contention tách riêng; latency raw mỗi request | p95 dưới 300 ms |
| S-11 release | Đo request bỏ chọn và trạng thái đối tác nhận được | Response dưới 300 ms theo NFR gốc |
| S-08/T-17 catalog | Dữ liệu 200 suất, nhiều trang, cache nóng/lạnh tách riêng | p95 dưới 500 ms; TTL cache 30 giây |
| T-50 order-status | Endpoint đúng owner, no-store | Dưới 100 ms |
| S-27 mail | PAID commit đến catcher nhận email đủ ảnh QR | Trong 60 giây; ghi rõ chỉ catcher hay Internet |
| S-30 scan | Camera decode → server confirm → UI feedback, tách API timing | Dưới 500 ms; trên 3 giây có trạng thái chờ |
| S-33 snapshot | 5.000 vé; 4G thật và profile mô phỏng ghi riêng | Dưới 10 giây; không PII |
| S-44 realtime | 2.000 viewer kết nối, thay trạng thái và đo mỗi viewer nhận/áp dụng | Trong 2 giây theo AC; chỉ p95 đẹp chưa đủ nếu có viewer vượt 2 giây |
| S-50 report | Mutation có timestamp → report phản ánh | Không trễ quá 1 phút |
| T-02/T-03 | Receipt CI và deploy đúng revision; lỗi pipeline/image có thử riêng | CI dưới 5 phút; staging mới trong 10 phút; bản cũ sống khi triển khai lỗi |
| S-55 backup | Scheduler, off-host receipt, retention, restore và key recovery | Mỗi đêm, ngoài máy chủ app, giữ 14 bản, app chạy được sau phục hồi |

Phương pháp đo đề xuất cho endpoint p95: tối thiểu 200 mẫu sau warm-up, ghi cỡ tải/concurrency, tỷ lệ lỗi, p50/p95/max, cold/warm và cấu hình máy. Đây là thiết kế phép thử, không thêm SLA mới. p95 dùng phương pháp nearest-rank trên mẫu hợp lệ đã định nghĩa; không bỏ request chậm/lỗi khỏi số liệu. Load test chỉ chạy trên profile được cấp phép, không làm quá tải staging dùng chung.

## 10. Cách ghi kết quả và điều kiện nghiệm thu

### 10.1. Trạng thái từng case

| Status | Ý nghĩa |
|---|---|
| NOT_RUN | Có trong kế hoạch nhưng chưa thực hiện. Tất cả case giao lần này ở trạng thái này. |
| PASS | Đã chạy đầy đủ mệnh đề, đúng oracle và có bằng chứng đúng source/môi trường. |
| FAIL | Đã chạy và quan sát hành vi trái expected, kèm bước tái hiện. |
| BLOCKED | Có prerequisite thiếu như app không boot, quyền browser, sandbox hay thiết bị; ghi chính xác blocker và case bị ảnh hưởng. |
| MISSING | Chưa có chức năng sau khi kiểm code/route/UI/schema; không dùng khi app chỉ đang không boot. |
| NEEDS_DECISION | Có mâu thuẫn hoặc tham số/nghiệp vụ chưa được chốt; vẫn ghi phần hành vi đã đo. |
| NOT_APPLICABLE | Chỉ khi có lý do/phạm vi được xác nhận. Không dùng để giấu Later thiếu hoặc test khó. |

Phân biệt lỗi sản phẩm, test lỗi thời, fixture lỗi và môi trường lỗi. Một unit test fail không tự chứng minh màn hình tương ứng hỏng; đồng thời không được báo suite đạt. Nếu test fail do môi trường thì ghi `BLOCKED` cho nghiệm thu hành vi và giữ log suite thất bại; không sửa test expected chỉ để xanh.

### 10.2. Bằng chứng bắt buộc cho mỗi lần chạy

`run-id`, thời gian UTC + giờ Việt Nam, HEAD/branch/fingerprint dirty tree, workbook hash, source requirements, URL/cổng/environment, DB thử đã che URL, browser/device/network, seed/fixture, command hoặc thao tác, actual/expected, exit code, kết quả và file evidence.

Đặt tại `evidence/ai-full-test/<run-id>/` khi chạy, gồm:

- `run-manifest.json`: phiên bản và môi trường, không secret.
- `results.json`: case ID/status/actual/evidence, giữ nguyên ô yêu cầu gốc và override riêng.
- `bugs.md`: severity, requirement/case, expected/actual, bước tái hiện, ảnh/log và điều kiện môi trường.
- `report.md`: kết luận theo nhóm, backlog/tier, UI/API/DB/NFR/local/staging/device và các giới hạn.
- Log, ảnh/video, HTTP đã che thông tin và số đo thô trong thư mục theo case/nhóm.

Không paste full cookie, token kích hoạt/reset, QR có quyền sử dụng thật, private key, tên/email thật vào bằng chứng. Báo cáo gắn PII canary giả nếu cần kiểm erasure.

### 10.3. Coverage và lỗi

Tính coverage theo **yêu cầu**, không lấy tổng unit test làm số chức năng đạt:

- Tổng AC/NFR trong baseline, số đã có case, số đã chạy, PASS/FAIL/BLOCKED/MISSING/NEEDS_DECISION/NOT_RUN.
- Báo riêng Ready, Next, Later; Must/Should/Could; 55 task kỹ thuật; epic; DoD/DoR; nhóm EXT.
- Yêu cầu có nhiều case chỉ đạt khi mọi case bắt buộc đạt; một NFR còn chưa đo thì story chưa đạt đầy đủ.
- Tỷ lệ thực thi = (PASS + FAIL) / số case thuộc phạm vi phải chạy. Công bố cả blocked/missing/needs-decision; không loại chúng khỏi mẫu số để làm đẹp số liệu. Tỷ lệ đạt = PASS / tổng case trong phạm vi, N/A chỉ trừ khi đã có lý do chấp thuận.
- Tách “đủ mapping” khỏi “đã thực thi” và “đã nghiệm thu”. Case bổ sung có thể overlap AC, không cộng ra số story mới.

Severity đề xuất: P0 = bán trùng/vượt sức chứa, ghi nhận tiền/hoàn/soát trùng, mất queue, lộ dữ liệu nghiêm trọng; P1 = gãy luồng chính hoặc sai quyền; P2 = thiếu tiêu chí/hiệu năng/trải nghiệm có cách đi tiếp; P3 = chi tiết hiển thị không phá AC/NFR. Severity lỗi khác Must/Should/Could của yêu cầu.

### 10.4. Kết luận cuối cùng

Chỉ ghi “Đạt phạm vi nghiệm thu đã chốt” khi mọi AC/NFR/task/gate bắt buộc trong scope đó đã được kiểm và đạt, không còn P0/P1 và lỗi khác vi phạm AC/NFR. Hoàn tất local với mock không thành sandbox provider thật/staging/device PASS. Không ghi “tất cả chức năng đạt” khi còn thiếu evidence camera, 4G, off-host backup hoặc route chưa được kiểm.

Nếu chưa đủ điều kiện, báo rõ “Chưa đủ điều kiện nghiệm thu”, liệt kê chức năng lỗi/thiếu/bị chặn/cần quyết định và phần đã chứng minh. Không cần kết luận toàn dự án thất bại chỉ vì một Later chưa vào scope, nhưng phải đưa nó vào danh sách gap.

## 11. Checklist rủi ro và quyết định nghiệp vụ

| Nguồn | Điều phải đối chiếu |
|---|---|
| R-01/K-01 | Có kết quả hai candidate và quyết định; ngoại lệ timebox/mentor có bằng chứng, benchmark mới không bù lịch sử. |
| R-02 | Phân biệt provider sandbox có tài khoản với gateway mock; thiếu sandbox ghi rõ blocker, không nhận mock là chứng minh tích hợp provider. |
| R-03 | Test DB concurrency cho hold, payment và admission; kiểm 10 vòng T-31 và crash/race. |
| R-04 | Hồ sơ review/CI chính xác, không giả human approval. Không tự quản lý Sprint/owner/SP trong đợt test. |
| R-05 | Map 2.000 ghế render/zoom có phép đo thực; không chỉ endpoint trả nhanh. |
| R-06 | CI/deploy lỗi giữ app cũ và backup/restore đã kiểm riêng; không phá môi trường dùng chung để thử. |
| R-07 | Erasure có phạm vi do người có thẩm quyền quyết định, giữ giao dịch theo hợp đồng; đây không phải chứng nhận tuân thủ pháp luật. |
| R-08 | Scanner web offline, IndexedDB và full reload; không tự đổi thành app mobile riêng. |
| R-09 | Later/Next chưa refine không tự trở thành Ready hoặc tự đổi Story Point; báo thiếu quyết định và phạm vi release. |

Các quyết định còn cần truy vết: queue capacity/TTL, rate limit và NAT, ticket limit/pending/cancelled, cutoff/refund/reopen seat, refund unknown/manual SLA, audit retention, doanh thu gộp/ròng, định dạng sao kê, attendance refresh, consent nghiệp vụ/marketing, erasure scope, off-host destination/encryption/key retention, coupon stacking, waitlist giữ riêng, transfer toggle và trường PII trong CSV.

## 12. Danh mục chức năng và hướng dẫn thực hiện theo yêu cầu gốc

Mỗi mục bên dưới có bề mặt, dữ liệu, cách thử và các AC gốc được đặt ID. Các NFR được giữ riêng trong `test-cases.json`. “Code/test ứng viên” là điểm bắt đầu tìm kiếm, không phải kết quả đạt; tên file chỉ ghi tên phải được resolve đúng trong repo trước khi chạy.


### S-01 — Khung ứng dụng chạy được trên staging

- Nguồn: `Backlog!A2:O2`; **Ready / Must**, Sprint 1; dependency: không .
- Bề mặt: `/`.
- Code ứng viên: `scripts/sprint1-demo.ps1; deploy/; .github/workflows/ci.yml`.
- Dữ liệu: Clone/checkout kiểm thử riêng; profile DB/Redis riêng; môi trường staging được phép kiểm tra.
- Cách thử: Khởi động bằng README; ghi URL và source thực chạy. Trên nhánh/CI thử riêng, gây lỗi lint/test và lỗi image, kiểm pipeline dừng và phiên bản cũ vẫn healthy. Đo CI dưới 5 phút và merge tới healthy dưới 10 phút theo T-02/T-03.
- Test tái sử dụng sau khi kiểm fixture: `deploy/*.spec.mjs; apps/api/test/app.e2e-spec.ts`.

**S-01-AC01** — Giả sử máy chủ staging đã sẵn sàng, Khi merge vào nhánh chính, Thì pipeline build, chạy test và triển khai tự động, và trang chủ trả về HTTP 200

**S-01-AC02** — Giả sử một bài test thất bại, Khi pipeline chạy, Thì dừng lại và không triển khai

**S-01-AC03** — Giả sử thành viên mới lấy mã nguồn về, Khi chạy lệnh khởi động đã ghi trong README, Thì ứng dụng, PostgreSQL và Redis chạy được trên máy cá nhân

**S-01-AC04** — Giả sử lần triển khai mới thất bại giữa chừng, Khi kiểm tra staging, Thì phiên bản cũ vẫn đang chạy

**S-01-NFR** — bí mật nạp từ biến môi trường; log không in chuỗi kết nối cơ sở dữ liệu

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-02 — Đăng nhập và phân quyền theo vai trò

- Nguồn: `Backlog!A3:O3`; **Ready / Must**, Sprint 1; dependency: S-01 .
- Bề mặt: `/login; /auth/login; /auth/me`.
- Code ứng viên: `apps/api/src/auth/; apps/web/src/components/login-form.tsx`.
- Dữ liệu: BUYER A/B, ORGANIZER A/B, STAFF, ACCOUNTANT, ADMIN; session còn hạn/hết hạn.
- Cách thử: Mỗi vai trò đăng nhập và gọi trực tiếp API được phép/cấm. Sai mật khẩu 5 lần, thử lần 6; kiểm khoá 15 phút qua restart trên fixture. Đổi IP hoặc tài khoản để kiểm hai chiều quota; dùng route fixture chưa khai báo quyền để kiểm mặc định đóng.
- Test tái sử dụng sau khi kiểm fixture: `auth-roles.e2e-spec.ts; auth-input-regression.e2e-spec.ts; sprint1-ip.e2e-spec.ts`.

**S-02-AC01** — Giả sử tài khoản có vai trò ban tổ chức, Khi đăng nhập, Thì thấy mục quản lý sự kiện và không thấy mục đối soát kế toán

**S-02-AC02** — Giả sử tài khoản có vai trò người mua vé, Khi gọi thẳng API tạo sự kiện bằng công cụ dòng lệnh, Thì máy chủ trả về 403 và ghi nhật ký lần thử đó

**S-02-AC03** — Giả sử nhập sai mật khẩu 5 lần liên tiếp, Khi thử lần thứ 6, Thì khoá đăng nhập 15 phút và thông báo thời gian còn lại

**S-02-AC04** — Giả sử phiên đăng nhập đã hết hạn, Khi gọi API bất kỳ, Thì trả về 401 và chuyển về trang đăng nhập

**S-02-AC05** — Giả sử một route mới chưa khai báo quyền, Khi có người gọi tới, Thì bị từ chối — mặc định là đóng, không phải mở

**S-02-NFR** — mật khẩu hash bằng argon2id; chống dò mật khẩu theo cả IP và theo tài khoản

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-03 — Người mua tự đăng ký tài khoản bằng email

- Nguồn: `Backlog!A4:O4`; **Ready / Must**, Sprint 1; dependency: S-02 .
- Bề mặt: `/register; /activate; /resend-activation; /users/register`.
- Code ứng viên: `apps/api/src/users/registration.service.ts; apps/api/src/users/activation-delivery.service.ts`.
- Dữ liệu: Email mới/trùng, mật khẩu 7/8 ký tự, token mới/đã dùng/24 giờ, SMTP catcher.
- Cách thử: Đăng ký ở UI và API; so phản hồi email có/không tồn tại; bắt email local, kích hoạt một lần rồi replay. Dùng fake time cho 24 giờ; gửi lại lần 5 và 6 trong một giờ; kiểm tài khoản chưa kích hoạt không đăng nhập được.
- Test tái sử dụng sau khi kiểm fixture: `registration.e2e-spec.ts; registration-admission.e2e-spec.ts; registration.service.spec.ts`.

**S-03-AC01** — Giả sử email chưa có trong hệ thống, Khi gửi form đăng ký hợp lệ, Thì tài khoản được tạo ở trạng thái chờ xác nhận và một email chứa liên kết kích hoạt được gửi đi

**S-03-AC02** — Giả sử email đã tồn tại, Khi gửi form, Thì thông báo chung "nếu email hợp lệ, bạn sẽ nhận được hướng dẫn" — không tiết lộ email đã có tài khoản

**S-03-AC03** — Giả sử mật khẩu dưới 8 ký tự, Khi gửi form, Thì bị chặn ở cả trình duyệt lẫn máy chủ

**S-03-AC04** — Giả sử liên kết kích hoạt đã quá 24 giờ, Khi bấm vào, Thì báo hết hạn và cho gửi lại liên kết mới

**S-03-AC05** — Giả sử tài khoản chưa kích hoạt, Khi đăng nhập, Thì bị từ chối kèm hướng dẫn kích hoạt

**S-03-NFR** — mã kích hoạt sinh ngẫu nhiên đủ dài và chỉ dùng được một lần; giới hạn 5 lần gửi lại mỗi giờ cho một email

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-04 — Tạo sự kiện và suất diễn

- Nguồn: `Backlog!A5:O5`; **Ready / Must**, Sprint 1; dependency: S-02 .
- Bề mặt: `/events; /events/new; /events/:id; POST /events/:id/showtimes`.
- Code ứng viên: `apps/api/src/events/; apps/web/src/components/event-editor.tsx`.
- Dữ liệu: Hai organizer khác chủ; sự kiện nháp; giờ quá khứ/tương lai/trùng, ISO timezone.
- Cách thử: Organizer A tạo/sửa sự kiện, thêm suất; B truy cập URL và API manage của A. Kiểm draft không công khai, quá khứ bị chặn, trùng giờ cảnh báo nhưng lưu được. So UTC trong DB và giờ Asia/Ho_Chi_Minh trên UI, kể cả gần nửa đêm.
- Test tái sử dụng sau khi kiểm fixture: `events.e2e-spec.ts; events.service.spec.ts`.

**S-04-AC01** — Giả sử đã đăng nhập bằng vai trò ban tổ chức, Khi tạo sự kiện với tên, mô tả và địa điểm hợp lệ, Thì sự kiện được lưu ở trạng thái nháp và chưa hiện với người mua

**S-04-AC02** — Giả sử sự kiện đã tồn tại, Khi thêm một suất diễn có thời điểm bắt đầu trong tương lai, Thì suất diễn được lưu và gắn với sự kiện

**S-04-AC03** — Giả sử nhập thời điểm bắt đầu ở quá khứ, Khi lưu suất diễn, Thì bị chặn kèm thông báo rõ lý do

**S-04-AC04** — Giả sử hai suất diễn cùng sự kiện trùng hoàn toàn thời gian, Khi lưu suất thứ hai, Thì cảnh báo nhưng vẫn cho lưu — một sự kiện có thể diễn song song ở hai phòng

**S-04-AC05** — Giả sử tài khoản ban tổ chức khác, Khi mở sự kiện không phải của mình, Thì bị từ chối

**S-04-NFR** — thời gian lưu ở UTC, hiển thị theo múi giờ Việt Nam

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### K-01 — Chọn cơ chế giữ chỗ có thời hạn

- Nguồn: `Backlog!A6:O6`; **Ready / Must**, Sprint 1; dependency: S-01 .
- Bề mặt: `Không có màn hình; spike và quyết định kiến trúc`.
- Code ứng viên: `apps/api/scripts/k01/; apps/api/scripts/k01-spike.mjs; docs/k01-seat-holding-report.md`.
- Dữ liệu: Hai candidate Redis/PostgreSQL trên profile thử; 200 yêu cầu cùng ghế.
- Cách thử: Đọc quyết định và số đo gốc của cả hai phương án. Kiểm timebox/mentor và ngoại lệ được duyệt; benchmark lại chỉ chứng minh kỹ thuật hiện tại, không tạo lại bằng chứng lịch sử đã thiếu.
- Test tái sử dụng sau khi kiểm fixture: `scripts/verify-k01-candidates.ps1; apps/api/test/k01-benchmark.ts`.

**K-01-AC01** — Đầu ra là một quyết định có nêu cơ chế đã chọn, con số đo được của cả hai phương án, và lý do loại phương án kia

**K-01-NFR** — không viết mã sản phẩm trong spike; kết quả là kiến thức và một đoạn mã thử vứt đi được

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-05 — Nạp sơ đồ ghế từ tệp JSON đúng định dạng

- Nguồn: `Backlog!A7:O7`; **Ready / Must**, Sprint 2; dependency: S-04 .
- Bề mặt: `POST /showtimes/:id/seat-map`.
- Code ứng viên: `apps/api/src/showtimes/seat-map.ts; apps/api/src/showtimes/showtimes.service.ts`.
- Dữ liệu: JSON 6 ghế và 2.000 ghế; suất chưa bán/đang giữ/đã bán.
- Cách thử: Nạp qua UI/API; đếm ghế/hạng sau import. Thay map khi chưa có giao dịch; thử thay khi có giữ hoặc vé. Trong DB thử, chèn lỗi ở ghế 1.500 và cuối tệp; xác minh rollback toàn bộ và map cũ còn nguyên.
- Test tái sử dụng sau khi kiểm fixture: `sprint2.e2e-spec.ts; showtimes.service.spec.ts`.

**S-05-AC01** — Giả sử tệp JSON đúng định dạng, Khi tải lên cho một suất diễn, Thì toàn bộ ghế được tạo kèm hàng, số ghế và hạng, và các hạng ghế chưa có được tạo theo tên trong tệp

**S-05-AC02** — Giả sử suất diễn đã có sơ đồ nhưng chưa bán vé nào, Khi tải sơ đồ mới, Thì sơ đồ cũ được thay toàn bộ

**S-05-AC03** — Giả sử suất diễn đã bán vé hoặc đang có người giữ ghế, Khi tải sơ đồ mới đè lên, Thì bị chặn kèm lý do

**S-05-AC04** — Giả sử việc ghi gặp lỗi ở ghế thứ 1500, Khi giao dịch kết thúc, Thì không có ghế nào được lưu — không nạp một nửa

**S-05-NFR** — tệp 2000 ghế nạp xong dưới 5 giây; toàn bộ việc nạp nằm trong một giao dịch

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-06 — Tệp sơ đồ sai bị từ chối toàn bộ và chỉ rõ chỗ sai

- Nguồn: `Backlog!A8:O8`; **Ready / Must**, Sprint 2; dependency: S-05 .
- Bề mặt: `POST /showtimes/validate-map; màn import/xem trước`.
- Code ứng viên: `apps/api/src/showtimes/seat-map.ts; apps/web/src/features/seat-map-import/`.
- Dữ liệu: JSON malformed, thiếu field, trùng hàng/số, nhiều lỗi, tệp sát/vượt 5 MB.
- Cách thử: Upload từng tệp; kiểm danh sách vị trí lỗi và nút xác nhận. Preview tệp đúng rồi huỷ, so count/checksum DB không đổi. Kiểm lỗi cú pháp có vị trí, API không 500; giới hạn dung lượng phải kiểm cả client lẫn server.
- Test tái sử dụng sau khi kiểm fixture: `seat-map.spec.ts; sprint2.e2e-spec.ts`.

**S-06-AC01** — Giả sử tệp thiếu trường bắt buộc ở một ghế, Khi tải lên, Thì từ chối toàn bộ tệp và chỉ rõ ghế nào thiếu trường nào

**S-06-AC02** — Giả sử tệp có hai ghế trùng hàng và số, Khi tải lên, Thì từ chối và chỉ ra cặp trùng

**S-06-AC03** — Giả sử tệp có nhiều lỗi, Khi tải lên, Thì thấy đủ danh sách lỗi trong một lần, không phải sửa từng lỗi rồi thử lại

**S-06-AC04** — Giả sử tệp không phải JSON hợp lệ, Khi tải lên, Thì báo lỗi định dạng kèm vị trí ký tự, không hiện lỗi 500

**S-06-AC05** — Giả sử tệp hợp lệ, Khi xem trước, Thì thấy lưới ghế đúng số hàng, số ghế, màu theo hạng trước khi bấm xác nhận nạp

**S-06-NFR** — kiểm tra chạy trước giao dịch ghi, không ghi rồi mới phát hiện sai; giới hạn kích thước tệp 5 MB

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-09 — Xem sơ đồ ghế còn trống của một suất diễn

- Nguồn: `Backlog!A9:O9`; **Ready / Must**, Sprint 2; dependency: S-05 .
- Bề mặt: `/shows/:id/seats; GET /showtimes/:id/seats`.
- Code ứng viên: `apps/api/src/showtimes/seat-status.sql.ts; apps/web/src/features/seat-selection/`.
- Dữ liệu: Suất 2.000 ghế, có FREE/HELD/SOLD; desktop và điện thoại.
- Cách thử: Mở map, so toàn bộ trạng thái với DB; người B giữ rồi A refresh. Thử suất chưa có map; zoom/pan/chọn chính xác trên điện thoại; ghế bán không chọn được. Đo truy vấn dưới 200 ms và render đầy đủ dưới 2 giây; theo dõi query count để phát hiện N+1.
- Test tái sử dụng sau khi kiểm fixture: `seat-availability.query.spec.ts; sprint2.e2e-spec.ts`.

**S-09-AC01** — Giả sử suất diễn đã có sơ đồ ghế, Khi mở trang chọn ghế, Thì thấy toàn bộ ghế với ba trạng thái phân biệt được bằng màu và ký hiệu: trống, đang có người giữ, đã bán

**S-09-AC02** — Giả sử một ghế vừa bị người khác giữ, Khi tôi tải lại trang, Thì ghế đó chuyển sang trạng thái đang có người giữ

**S-09-AC03** — Giả sử suất diễn chưa nạp sơ đồ ghế, Khi mở trang chọn ghế, Thì hiện thông báo suất diễn chưa mở bán, không hiện lưới rỗng

**S-09-AC04** — Giả sử suất diễn có 2000 ghế, Khi mở trang, Thì sơ đồ hiện đầy đủ dưới 2 giây

**S-09-AC05** — Giả sử mở trên điện thoại, Khi xem sơ đồ, Thì phóng to thu nhỏ được và vẫn bấm trúng ghế

**S-09-NFR** — trạng thái ghế lấy trong một truy vấn, không gọi một lần cho mỗi ghế

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-10 — Chọn ghế và hệ thống giữ chỗ trong 10 phút

- Nguồn: `Backlog!A10:O10`; **Ready / Must**, Sprint 2; dependency: S-09, K-01 .
- Bề mặt: `POST /showtimes/:id/holds; màn chọn ghế`.
- Code ứng viên: `apps/api/src/holds/; apps/web/src/features/seat-selection/server-countdown.ts`.
- Dữ liệu: BUYER A/B; 3 ghế trống; cấu hình hold mặc định 10 phút, client lệch ±5 phút.
- Cách thử: A chọn ghế theo các thời điểm khác nhau, so expiresAt dùng chung từ lần đầu. B tranh ghế; đóng suất rồi giữ mới. Dùng context browser mô phỏng lệch đồng hồ; đổi cấu hình ở profile thử để chứng minh không hard-code TTL.
- Test tái sử dụng sau khi kiểm fixture: `seat-hold-api.e2e-spec.ts; server-countdown.spec.ts`.

**S-10-AC01** — Giả sử ghế đang trống, Khi tôi bấm chọn, Thì ghế chuyển sang trạng thái tôi đang giữ và màn hình hiện đồng hồ đếm ngược 10 phút

**S-10-AC02** — Giả sử ghế đang có người khác giữ, Khi tôi bấm chọn, Thì bị từ chối kèm thông báo "ghế vừa có người chọn" và sơ đồ tự cập nhật

**S-10-AC03** — Giả sử tôi chọn 3 ghế cách nhau vài giây, Khi xem đồng hồ, Thì cả ba ghế dùng chung một thời hạn tính từ ghế đầu tiên — không có ba đồng hồ khác nhau

**S-10-AC04** — Giả sử suất diễn đã đóng bán, Khi tôi bấm chọn, Thì bị từ chối kèm thông báo suất không còn mở bán

**S-10-AC05** — Giả sử đồng hồ máy tôi lệch 5 phút so với máy chủ, Khi xem đồng hồ đếm ngược, Thì thời gian còn lại vẫn đúng theo máy chủ

**S-10-NFR** — thời hạn giữ chỗ là tham số cấu hình, không ghi cứng trong mã; API giữ ghế trả lời dưới 300ms ở p95

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-11 — Bỏ chọn ghế đang giữ để trả lại ngay cho người khác

- Nguồn: `Backlog!A11:O11`; **Ready / Should**, Sprint 2; dependency: S-10 .
- Bề mặt: `DELETE /showtimes/:id/hold-seats hoặc route được UI sử dụng`.
- Code ứng viên: `apps/api/src/modules/seats/seat-hold.controller.ts; apps/web/src/features/seat-selection/`.
- Dữ liệu: A giữ 3 ghế; B có session riêng.
- Cách thử: A bỏ một ghế, B giữ ngay ghế vừa nhả; hai ghế còn nguyên hạn. B xoá hold của A phải 403; xoá ghế không giữ theo hợp đồng T-25 trả 404. Bỏ ghế cuối làm đồng hồ biến mất; đếm một request thao tác.
- Test tái sử dụng sau khi kiểm fixture: `seat-hold.controller.spec.ts; seat-hold-api.e2e-spec.ts`.

**S-11-AC01** — Giả sử tôi đang giữ 3 ghế, Khi tôi bỏ chọn một ghế, Thì ghế đó trở lại trạng thái trống ngay lập tức cho người khác chọn và hai ghế còn lại giữ nguyên thời hạn

**S-11-AC02** — Giả sử tôi bỏ chọn ghế cuối cùng, Khi không còn ghế nào, Thì đồng hồ đếm ngược biến mất

**S-11-AC03** — Giả sử tôi gọi API bỏ chọn với ghế của người khác đang giữ, Khi xử lý, Thì bị từ chối 403 và ghế người kia không đổi

**S-11-NFR** — bỏ chọn phản hồi dưới 300ms; chỉ chủ giữ chỗ mới huỷ được

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-12 — Ghế được nhả tự động khi hết hạn giữ chỗ

- Nguồn: `Backlog!A12:O12`; **Ready / Must**, Sprint 2; dependency: S-10 .
- Bề mặt: `Worker hết hạn và GET ghế`.
- Code ứng viên: `apps/api/src/holds/hold-expiry.scheduler.ts; apps/api/src/hold-expiry-worker.ts`.
- Dữ liệu: Hold hết hạn, còn hạn và đã chuyển sang order; worker off/on.
- Cách thử: Khi worker tắt, hold quá hạn vẫn được truy vấn như trống. Chạy job hai lần, restart job sau backlog; chỉ dọn hết hạn, không dọn bảo lưu đơn đang chờ. Dùng fake clock/DB fixture, không chỉnh giờ hệ điều hành.
- Test tái sử dụng sau khi kiểm fixture: `hold-expiry.scheduler.spec.ts; seat-expiry-job.service.spec.ts`.

**S-12-AC01** — Giả sử một giữ chỗ đã quá hạn, Khi job nền chạy, Thì giữ chỗ bị huỷ và ghế trở lại trạng thái trống

**S-12-AC02** — Giả sử giữ chỗ vừa hết hạn nhưng job chưa chạy tới, Khi người khác truy vấn ghế trống, Thì ghế đó vẫn được tính là trống — truy vấn lọc theo thời điểm hết hạn chứ không chờ job

**S-12-AC03** — Giả sử tiến trình nền vừa khởi động lại sau sự cố, Khi chạy lần đầu, Thì dọn hết mọi giữ chỗ quá hạn tồn đọng

**S-12-AC04** — Giả sử một giữ chỗ đã chuyển thành đơn hàng đang chờ thanh toán, Khi job dọn chạy, Thì không đụng tới ghế đó

**S-12-NFR** — job dọn chạy được nhiều lần trên cùng dữ liệu mà kết quả không đổi

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-13 — Ghế đã có người giữ thì không ai khác chọn được, kể cả khi bấm cùng lúc

- Nguồn: `Backlog!A13:O13`; **Ready / Must**, Sprint 2; dependency: S-10 .
- Bề mặt: `API hold và ràng buộc PostgreSQL`.
- Code ứng viên: `apps/api/src/prisma/hold-transaction.ts; apps/api/prisma/migrations/`.
- Dữ liệu: 100 ghế; 200 request, đúng 2 người/request cạnh tranh mỗi ghế, quota đủ cao.
- Cách thử: Đồng bộ barrier cho 200 request tranh 100 ghế, đúng 100 thành công và 100 conflict, lặp 10 vòng với dữ liệu mới. Thử 5 ghế có ghế thứ 3 bận phải rollback cả 5; thử hold cũ hết hạn và chèn SQL cạnh tranh để chứng minh DB bảo vệ.
- Test tái sử dụng sau khi kiểm fixture: `apps/api/test/k01-benchmark.ts; seat-hold-api.e2e-spec.ts`.

**S-13-AC01** — Giả sử 200 yêu cầu giữ chỗ được bắn đồng thời vào 100 ghế, Khi tất cả xử lý xong, Thì đúng 100 giữ chỗ thành công và 100 yêu cầu nhận lỗi trùng

**S-13-AC02** — Giả sử hai người bấm chọn cùng một ghế trong cùng một khoảnh khắc, Khi cả hai yêu cầu tới máy chủ, Thì đúng một người giữ được và người kia thấy thông báo "ghế vừa có người chọn"

**S-13-AC03** — Giả sử yêu cầu giữ 5 ghế mà ghế thứ 3 đã có người giữ, Khi xử lý, Thì không ghế nào bị giữ và trả về danh sách ghế bị từ chối

**S-13-AC04** — Giả sử giữ chỗ bị từ chối, Khi giao diện nhận lỗi, Thì sơ đồ tự làm mới để hiện trạng thái đúng

**S-13-AC05** — Giả sử một giữ chỗ cũ trên ghế đó đã hết hạn, Khi người mới giữ, Thì thành công — ràng buộc chỉ tính giữ chỗ còn hiệu lực

**S-13-NFR** — bảo đảm chống trùng nằm ở tầng cơ sở dữ liệu, không dựa vào kiểm tra ở tầng ứng dụng — kiểm tra rồi ghi là sai vì có khoảng trống giữa hai bước

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-14 — Giữ chỗ còn nguyên khi người mua tải lại trang hoặc mở lại trình duyệt

- Nguồn: `Backlog!A14:O14`; **Ready / Should**, Sprint 2; dependency: S-10 .
- Bề mặt: `GET /showtimes/:id/holds; trang chọn ghế`.
- Code ứng viên: `apps/api/src/holds/; apps/web/src/features/seat-selection/`.
- Dữ liệu: A giữ 2 ghế, đã trôi 4 phút; context browser thứ hai đăng nhập cùng tài khoản.
- Cách thử: Refresh rồi đóng/mở lại browser và đăng nhập thiết bị thứ hai; danh sách và hạn lấy từ server, không bắt đầu lại 10 phút. Làm hết hạn ở fixture rồi mở lại, không phục hồi ghế cũ; B không đọc được hold A.
- Test tái sử dụng sau khi kiểm fixture: `useSeatHoldTimer.test.ts; seat-hold-api.e2e-spec.ts`.

**S-14-AC01** — Giả sử tôi đang giữ 2 ghế còn 6 phút, Khi tải lại trang, Thì thấy đúng 2 ghế đó ở trạng thái đang giữ và đồng hồ còn 6 phút

**S-14-AC02** — Giả sử tôi đóng trình duyệt rồi mở lại trong thời hạn trên máy khác, Khi đăng nhập và vào lại suất đó, Thì vẫn thấy ghế đang giữ

**S-14-AC03** — Giả sử giữ chỗ đã hết hạn trong lúc tôi vắng, Khi mở lại trang, Thì ghế hiện trống và không có đồng hồ

**S-14-NFR** — trạng thái giữ chỗ lấy từ máy chủ, không lưu ở bộ nhớ trình duyệt

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-07 — Ban tổ chức mở bán và đóng bán một suất diễn

- Nguồn: `Backlog!A15:O15`; **Ready / Must**, Sprint 2; dependency: S-04 .
- Bề mặt: `PATCH /showtimes/:id/status`.
- Code ứng viên: `apps/api/src/showtimes/; apps/web/src/features/showtime-management/sale-status-control.tsx`.
- Dữ liệu: Suất nháp thiếu map/giá; suất đủ điều kiện; hold và order đang chờ.
- Cách thử: Thử mọi cặp trạng thái DRAFT/ON_SALE/CLOSED. Đóng bán ngăn giữ mới, giữ/đơn cũ vẫn tiếp tục đúng hạn; mở lại và đối chiếu audit actor. Phân biệt đóng bán và huỷ suất.
- Test tái sử dụng sau khi kiểm fixture: `showtimes.service.spec.ts; sprint2.e2e-spec.ts`.

**S-07-AC01** — Giả sử suất diễn đang ở trạng thái nháp và đã có sơ đồ ghế, Khi bấm mở bán, Thì suất chuyển sang đang bán và xuất hiện trên trang công khai

**S-07-AC02** — Giả sử suất diễn chưa có sơ đồ ghế, Khi bấm mở bán, Thì bị chặn kèm lý do

**S-07-AC03** — Giả sử suất đang bán, Khi bấm đóng bán, Thì người mua không chọn ghế mới được nữa nhưng giữ chỗ và đơn đang chờ vẫn được xử lý tới hết hạn

**S-07-AC04** — Giả sử suất đã đóng bán, Khi mở lại, Thì trở về đang bán — trạng thái đổi qua lại được, không phải một chiều

**S-07-NFR** — đổi trạng thái ghi nhật ký kèm người thao tác

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-08 — Người mua xem danh sách sự kiện đang mở bán và chi tiết suất diễn

- Nguồn: `Backlog!A16:O16`; **Ready / Must**, Sprint 2; dependency: S-07 .
- Bề mặt: `/; /shows/:id; GET /showtimes`.
- Code ứng viên: `apps/api/src/showtimes/; apps/web/src/features/event-catalog/`.
- Dữ liệu: Ẩn danh; 21+ sự kiện và bộ 200 suất; draft/closed/on-sale; cache nóng/lạnh.
- Cách thử: Đi từ trang chủ tới chọn ghế tối đa hai lần bấm. Lật hết các trang, đối chiếu tập ID không trùng/sót và thứ tự ngày. Gọi URL draft/closed trực tiếp; kiểm khoảng giá và thông tin. Đo p95 và TTL cache 30 giây, quan sát cache invalidation khi đổi trạng thái.
- Test tái sử dụng sau khi kiểm fixture: `sprint2.e2e-spec.ts; apps/web/src/lib/contracts/`.

**S-08-AC01** — Giả sử có suất diễn đang bán, Khi mở trang chủ mà chưa đăng nhập, Thì thấy danh sách sự kiện kèm suất gần nhất, sắp theo ngày diễn

**S-08-AC02** — Giả sử suất diễn ở trạng thái nháp hoặc đã đóng, Khi mở trang chi tiết bằng đường dẫn trực tiếp, Thì thấy thông báo không mở bán, không thấy sơ đồ

**S-08-AC03** — Giả sử mở trang chi tiết suất đang bán, Khi trang tải xong, Thì thấy tên sự kiện, thời gian, địa điểm, khoảng giá và nút vào chọn ghế

**S-08-AC04** — Giả sử có hơn 20 sự kiện, Khi cuộn xuống cuối, Thì tải thêm trang tiếp theo

**S-08-NFR** — trang danh sách phản hồi dưới 500ms ở p95 khi có 200 suất diễn; cache 30 giây

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-15 — Đặt giá vé cho từng hạng ghế của suất diễn

- Nguồn: `Backlog!A17:O17`; **Ready / Must**, Sprint 3; dependency: S-05 .
- Bề mặt: `PATCH /showtimes/:id/prices`.
- Code ứng viên: `apps/api/src/showtimes/; apps/web/src/features/seat-pricing/`.
- Dữ liệu: 3 hạng VIP/STD/ECO; giá 200000/100000/50000; đơn pending giá cũ.
- Cách thử: Nhập/lưu giá, hover/click ghế. Thử âm, chữ, số thập phân và thiếu giá; kiểm phía server. Đổi giá sau khi có order: order cũ không đổi, order tạo sau dùng giá mới. Kiểm schema integer VND, hiển thị 200.000.
- Test tái sử dụng sau khi kiểm fixture: `s15-s16-acceptance.e2e-spec.ts; showtimes.service.spec.ts`.

**S-15-AC01** — Giả sử suất diễn đã có sơ đồ với ba hạng ghế, Khi tôi nhập giá cho từng hạng và lưu, Thì trang chọn ghế hiện đúng giá khi trỏ vào ghế

**S-15-AC02** — Giả sử một hạng ghế chưa có giá, Khi bấm mở bán, Thì bị chặn kèm tên hạng còn thiếu giá

**S-15-AC03** — Giả sử suất đã có đơn hàng đang chờ, Khi đổi giá, Thì đơn đang chờ giữ nguyên giá cũ, chỉ đơn tạo sau mới dùng giá mới

**S-15-AC04** — Giả sử nhập giá âm hoặc không phải số, Khi lưu, Thì bị chặn ngay tại ô

**S-15-NFR** — giá lưu bằng số nguyên đơn vị đồng, không dùng số thực

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-16 — Tạo đơn hàng từ các ghế đang giữ

- Nguồn: `Backlog!A18:O18`; **Ready / Must**, Sprint 3; dependency: S-13, S-15 .
- Bề mặt: `POST /showtimes/:id/orders; POST /orders`.
- Code ứng viên: `apps/api/src/orders/orders.service.ts; apps/api/src/orders/orders.controller.ts`.
- Dữ liệu: A giữ 2 ghế còn hạn; biến thể một hold hết hạn, ghế do B giữ.
- Cách thử: Tạo order từ hold server; gửi thêm seatIds/total giả phải không thay tập ghế hợp lệ. Gửi hai request đồng thời và retry: một order, đúng items/giá, gia hạn giữ cùng transaction; lỗi giữa chừng không để order hoặc gia hạn một nửa.
- Test tái sử dụng sau khi kiểm fixture: `orders.e2e-spec.ts; s15-s16-acceptance.e2e-spec.ts`.

**S-16-AC01** — Giả sử tôi đang giữ 2 ghế còn hiệu lực, Khi bấm "đặt vé", Thì một đơn ở trạng thái chờ thanh toán được tạo với đúng 2 ghế và tổng tiền theo giá hạng, và thời hạn giữ chỗ được gia hạn bằng thời hạn thanh toán

**S-16-AC02** — Giả sử một trong các giữ chỗ đã hết hạn, Khi bấm "đặt vé", Thì không tạo đơn và báo ghế nào đã mất

**S-16-AC03** — Giả sử tôi đã có một đơn đang chờ cho suất này, Khi bấm "đặt vé" lần nữa, Thì được đưa về đơn đang chờ đó thay vì tạo đơn thứ hai

**S-16-AC04** — Giả sử tôi bấm "đặt vé" hai lần liên tiếp, Khi xử lý, Thì chỉ có một đơn được tạo

**S-16-NFR** — tạo đơn và gia hạn giữ chỗ là một giao dịch; thời hạn thanh toán là tham số cấu hình

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-17 — Xem lại chi tiết đơn trước khi thanh toán

- Nguồn: `Backlog!A19:O19`; **Ready / Should**, Sprint 3; dependency: S-16 .
- Bề mặt: `/orders/:id; GET /orders/:id`.
- Code ứng viên: `apps/web/src/features/order-review/; apps/api/src/orders/`.
- Dữ liệu: Order A pending/expired; B đăng nhập; hai hạng giá khác nhau.
- Cách thử: UI hiển thị từng dòng, tổng và thời gian; so SUM(unitPrice) với server. Gửi giá/tổng sửa bằng API; B đọc ID của A phải 403. Hết hạn thì nút trả tiền ẩn và API cũng từ chối.
- Test tái sử dụng sau khi kiểm fixture: `orders.e2e-spec.ts; order-review.spec.ts`.

**S-17-AC01** — Giả sử đơn vừa được tạo, Khi mở trang đơn, Thì thấy tên sự kiện, suất, từng ghế kèm hạng và đơn giá, tổng tiền và thời gian còn lại để thanh toán

**S-17-AC02** — Giả sử tôi sửa tổng tiền trong yêu cầu gửi lên, Khi máy chủ xử lý, Thì tổng vẫn được tính lại từ giá hạng ghế, số sửa bị bỏ qua

**S-17-AC03** — Giả sử thời hạn thanh toán đã hết, Khi mở trang đơn, Thì thấy đơn đã hết hạn và nút thanh toán bị ẩn

**S-17-NFR** — trang đơn chỉ chủ đơn xem được

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-18 — Thanh toán đơn hàng qua cổng sandbox

- Nguồn: `Backlog!A20:O20`; **Ready / Must**, Sprint 3; dependency: S-16 .
- Bề mặt: `POST /orders/:id/pay; POST /payments/webhook`.
- Code ứng viên: `apps/api/src/payments/; apps/api/src/payments/gateways/momo.gateway.ts`.
- Dữ liệu: Đơn pending; mock và tài khoản sandbox riêng nếu có; webhook đúng/sai tiền.
- Cách thử: Kiểm amount/orderId redirect; thanh toán và đóng browser trước callback. Webhook hợp lệ phải đổi order/ghế/hold trong một transaction. Số tiền khác phải cần kiểm tra, không phát vé và báo kế toán; quan sát DB và lỗi giữa transaction.
- Test tái sử dụng sau khi kiểm fixture: `payments.e2e-spec.ts; payments.service.spec.ts`.

**S-18-AC01** — Giả sử đơn đang chờ và còn hạn, Khi bấm thanh toán, Thì được chuyển sang trang cổng sandbox với đúng số tiền và mã đơn

**S-18-AC02** — Giả sử thanh toán thành công ở cổng, Khi hệ thống nhận kết quả, Thì đơn chuyển sang đã trả, ghế chuyển sang đã bán, giữ chỗ được xoá — cả ba trong một giao dịch

**S-18-AC03** — Giả sử người dùng tắt trình duyệt sau khi trả tiền ở cổng, Khi webhook tới, Thì đơn vẫn chuyển sang đã trả không cần người dùng quay lại

**S-18-AC04** — Giả sử cổng trả về số tiền khác tổng đơn, Khi hệ thống nhận kết quả, Thì không ghi nhận, đánh dấu đơn cần kiểm tra và báo cho kế toán

**S-18-NFR** — không lưu số thẻ; chỉ lưu mã giao dịch từ cổng; cổng nằm sau một interface riêng

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-19 — Cổng thanh toán giả lập để chạy khi chưa có sandbox

- Nguồn: `Backlog!A21:O21`; **Ready / Should**, Sprint 3; dependency: S-18 .
- Bề mặt: `/mock-gateway/pay; /mock-gateway/submit`.
- Code ứng viên: `apps/api/src/payments/gateways/mock.gateway.ts; apps/web/src/features/mock-gateway/`.
- Dữ liệu: Profile mock riêng và profile APP_ENV production biệt lập.
- Cách thử: Chọn success/failure trên gateway; kiểm webhook có chữ ký qua cùng luồng nghiệp vụ. Thay cấu hình provider không sửa nghiệp vụ; production bật mock phải fail startup, route mock không được dùng trong bản production.
- Test tái sử dụng sau khi kiểm fixture: `mock-gateway.e2e-spec.ts; payments-config.validator.spec.ts`.

**S-19-AC01** — Giả sử biến môi trường chọn cổng giả lập, Khi bấm thanh toán, Thì tới một trang nội bộ có hai nút thanh toán thành công và thất bại

**S-19-AC02** — Giả sử bấm thành công trên trang giả lập, Khi quay về, Thì một webhook giả có chữ ký hợp lệ được gửi vào hệ thống và đơn chuyển sang đã trả như cổng thật

**S-19-AC03** — Giả sử môi trường là production, Khi khởi động với cổng giả lập, Thì ứng dụng từ chối khởi động

**S-19-NFR** — cổng giả lập nằm sau cùng interface ở T-40, không có nhánh `if` trong mã nghiệp vụ

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-20 — Webhook thanh toán gửi lại nhiều lần chỉ ghi nhận một

- Nguồn: `Backlog!A22:O22`; **Ready / Must**, Sprint 3; dependency: S-18 .
- Bề mặt: `POST /payments/webhook`.
- Code ứng viên: `apps/api/src/payments/payments.service.ts; apps/api/prisma/migrations/`.
- Dữ liệu: Một payload ký hợp lệ; transactionId cố định; pending và expired.
- Cách thử: Gửi 5 lần tuần tự rồi các bản đồng thời trên order khác; đếm payment/event, order transition, ticket và outbox trước/sau. Webhook trùng trả 200 theo T-46; expired không thành paid, có dấu cần kiểm tra/hoàn; không 500.
- Test tái sử dụng sau khi kiểm fixture: `payments-idempotency.e2e-spec.ts`.

**S-20-AC01** — Giả sử cổng gửi lại cùng một webhook 5 lần, Khi xử lý xong, Thì chỉ có một bản ghi thanh toán, đơn đổi trạng thái một lần và vé chỉ sinh một bộ

**S-20-AC02** — Giả sử hai bản sao của cùng webhook tới đồng thời, Khi xử lý song song, Thì đúng một bản được xử lý, bản kia bị bỏ qua — không có lỗi 500

**S-20-AC03** — Giả sử webhook tới cho đơn đã bị huỷ vì hết hạn, Khi xử lý, Thì không đổi đơn thành đã trả mà đánh dấu cần kiểm tra để hoàn tiền

**S-20-AC04** — Giả sử webhook tới trước khi người dùng quay lại trang kết quả, Khi người dùng quay lại, Thì thấy đơn đã trả

**S-20-NFR** — khoá theo mã giao dịch để chống xử lý song song; xử lý một webhook nhiều lần cho kết quả giống xử lý một lần

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-21 — Webhook có chữ ký sai bị từ chối

- Nguồn: `Backlog!A23:O23`; **Ready / Must**, Sprint 3; dependency: S-20 .
- Bề mặt: `POST /payments/webhook`.
- Code ứng viên: `apps/api/src/payments/webhook-security.filter.ts; apps/api/src/payments/gateways/`.
- Dữ liệu: Payload đúng, sửa 1 byte, thiếu chữ ký, JSON hỏng và chữ ký sai, order không có.
- Cách thử: Gửi raw body bảo toàn byte; sai chữ ký trả 401 trước parse/nghiệp vụ và không thay DB. Hợp lệ nhưng order không tồn tại trả 404. Kiểm structured log có nguồn và mã lỗi, không payload thanh toán; review so sánh constant-time.
- Test tái sử dụng sau khi kiểm fixture: `payments-signature-verification.e2e-spec.ts; momo-signature.spec.ts`.

**S-21-AC01** — Giả sử webhook có chữ ký không khớp khoá của cổng, Khi nhận, Thì trả 401, không đọc nội dung, không đổi đơn, và ghi log kèm địa chỉ nguồn

**S-21-AC02** — Giả sử webhook đúng chữ ký nhưng mã đơn không tồn tại, Khi nhận, Thì trả 404 và ghi log

**S-21-NFR** — kiểm chữ ký trước khi phân tích nội dung; khoá ký đọc từ biến môi trường

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-22 — Trang kết quả thanh toán chờ xác nhận từ máy chủ, không tự kết luận

- Nguồn: `Backlog!A24:O24`; **Ready / Must**, Sprint 3; dependency: S-20 .
- Bề mặt: `/payment/result/:orderId; GET /orders/:id/status`.
- Code ứng viên: `apps/web/src/features/payment-result/; apps/api/src/orders/orders.controller.ts`.
- Dữ liệu: Webhook trễ 5 giây/>60 giây; query return bị giả; response status bị trì hoãn.
- Cách thử: Về trang trước webhook, xem đang xác nhận; đếm polling mỗi 2 giây, PAID chỉ theo API. Chờ 60 giây không kết luận thất bại; rời trang phải dừng polling. Đo status API dưới 100 ms và no-store.
- Test tái sử dụng sau khi kiểm fixture: `payment-result.spec.ts; orders.e2e-spec.ts`.

**S-22-AC01** — Giả sử tôi quay về từ cổng trước khi webhook tới, Khi trang kết quả mở, Thì thấy "đang xác nhận thanh toán" và trang tự hỏi lại máy chủ mỗi 2 giây

**S-22-AC02** — Giả sử webhook tới sau đó, Khi trang hỏi lại, Thì chuyển sang "đã thanh toán" kèm liên kết tới vé

**S-22-AC03** — Giả sử sau 60 giây vẫn chưa có xác nhận, Khi hết thời gian chờ, Thì hiện hướng dẫn kiểm tra lại trong lịch sử đơn thay vì kết luận thất bại

**S-22-AC04** — Giả sử tham số trên đường dẫn quay về bị sửa thành "thành công", Khi trang mở, Thì vẫn hiện trạng thái thật từ máy chủ

**S-22-NFR** — trang kết quả không dùng tham số trên đường dẫn quay về để quyết định trạng thái

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-23 — Đơn hàng quá hạn thanh toán thì nhả ghế

- Nguồn: `Backlog!A25:O25`; **Ready / Must**, Sprint 3; dependency: S-16 .
- Bề mặt: `Worker order-expiry`.
- Code ứng viên: `apps/api/src/orders/order-expiry.scheduler.ts; apps/api/src/orders/order-expiration.ts`.
- Dữ liệu: Order pending quá hạn, paid và pending sát ranh; webhook đúng ký.
- Cách thử: Chạy job lặp, chỉ pending quá hạn nhả ghế nguyên tử. Cho job và webhook tranh cùng order tại barrier, lặp nhiều lần; cuối cùng PAID+SOLD hoặc EXPIRED+nhả ghế+cần hoàn, không trạng thái lửng.
- Test tái sử dụng sau khi kiểm fixture: `order-expiry.spec.ts; payments-idempotency.e2e-spec.ts`.

**S-23-AC01** — Giả sử đơn ở trạng thái chờ quá thời hạn thanh toán, Khi job chạy, Thì đơn chuyển sang hết hạn và ghế trở lại trống trong cùng một giao dịch

**S-23-AC02** — Giả sử đơn đã thanh toán, Khi job chạy nhiều lần, Thì đơn và ghế không bị đụng tới

**S-23-AC03** — Giả sử webhook thành công tới đúng lúc job đang huỷ đơn đó, Khi cả hai xong, Thì chỉ một bên thắng: hoặc đơn đã trả và ghế đã bán, hoặc đơn hết hạn và được đánh dấu cần hoàn tiền — không có trạng thái lửng

**S-23-NFR** — huỷ đơn và nhả ghế nằm trong một giao dịch; job chạy lặp lại được

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-24 — Thanh toán thất bại thì đơn vẫn chờ và ghế còn giữ tới hết hạn

- Nguồn: `Backlog!A26:O26`; **Ready / Should**, Sprint 3; dependency: S-18 .
- Bề mặt: `/orders/:id; POST /orders/:id/pay`.
- Code ứng viên: `apps/api/src/payments/; apps/web/src/features/order-review/`.
- Dữ liệu: Order pending còn hạn; gateway mock fail rồi success, biến thể đã quá hạn.
- Cách thử: Chọn thất bại: order/hold/TTL không đổi, có log lần thử. Thanh toán lại dùng cùng orderId; double click không tạo hai attempt đang xử lý. Quá hạn thì cả UI/API chặn retry.
- Test tái sử dụng sau khi kiểm fixture: `mock-gateway.e2e-spec.ts; payments.e2e-spec.ts`.

**S-24-AC01** — Giả sử cổng trả về thất bại, Khi hệ thống nhận kết quả, Thì đơn vẫn ở trạng thái chờ, ghế vẫn được giữ tới hết thời hạn thanh toán, và trang đơn hiện nút thanh toán lại

**S-24-AC02** — Giả sử tôi bấm thanh toán lại, Khi tới cổng, Thì cùng mã đơn được dùng, không tạo đơn mới

**S-24-AC03** — Giả sử thời hạn đã hết, Khi bấm thanh toán lại, Thì bị từ chối và S-23 xử lý đơn như thường

**S-24-NFR** — số lần thử lại ghi vào nhật ký đơn

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-28 — Quản trị tạo tài khoản nhân viên và gán vai trò

- Nguồn: `Backlog!A27:O27`; **Next / Must**, Sprint 4; dependency: S-02 .
- Bề mặt: `/admin/users; /admin/users/:id/role; /status`.
- Code ứng viên: `apps/api/src/users/admin-users.controller.ts; apps/web/src/app/admin/users/`.
- Dữ liệu: ADMIN, STAFF, ACCOUNTANT; session STAFF còn hoạt động; tài khoản phụ để khóa.
- Cách thử: Tạo nhân viên từng vai trò, kiểm STAFF chỉ thấy việc soát vé. Đổi role rồi gọi request kế tiếp bằng session cũ; disable thu hồi session và chặn login kèm liên hệ quản trị. BUYER thử API admin; kiểm audit actor.
- Test tái sử dụng sau khi kiểm fixture: `users.service.spec.ts; auth-roles.e2e-spec.ts`.

**S-28-AC01** — Giả sử tôi tạo tài khoản với vai trò soát vé, Khi nhân viên đăng nhập, Thì chỉ thấy màn hình quét vé

**S-28-AC02** — Giả sử tôi đổi vai trò một tài khoản đang đăng nhập, Khi họ gọi API tiếp theo, Thì quyền mới có hiệu lực ngay, không cần đăng xuất

**S-28-AC03** — Giả sử tôi vô hiệu hoá một tài khoản, Khi họ đăng nhập, Thì bị từ chối kèm thông báo liên hệ quản trị

**S-28-NFR** — mọi thay đổi vai trò ghi nhật ký kèm người thao tác. Ước lượng thô 2 SP — tier Next

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-27 — Vé gửi qua email kèm mã QR

- Nguồn: `Backlog!A28:O28`; **Next / Should**, Sprint 4; dependency: S-25, S-03 .
- Bề mặt: `POST /orders/:id/tickets/resend; SMTP/outbox`.
- Code ứng viên: `apps/api/src/tickets/ticket-delivery.service.ts; apps/api/src/mail/`.
- Dữ liệu: SMTP catcher local thành công/lỗi; worker off/on; order 3 vé.
- Cách thử: Bật worker trong fixture, trả tiền và đo từ PAID đến catcher nhận đủ 3 PNG dưới 60 giây. Làm SMTP lỗi và kiểm backoff/FAILED theo số lần được chốt. Gửi lại phải cùng QR; worker off phải báo chưa gửi, không coi QUEUED là SENT.
- Test tái sử dụng sau khi kiểm fixture: `ticket-delivery.service.spec.ts; docs/SPRINT45_TICKET_DELIVERY.md`.

**S-27-AC01** — Giả sử đơn chuyển sang đã trả, Khi hệ thống xử lý xong, Thì một email có đủ vé kèm ảnh QR được gửi tới địa chỉ tài khoản trong vòng 1 phút

**S-27-AC02** — Giả sử gửi email thất bại, Khi thử lại, Thì tối đa 3 lần cách nhau tăng dần, rồi ghi nhận lỗi để quản trị xử lý tay

**S-27-AC03** — Giả sử người mua bấm "gửi lại vé", Khi xử lý, Thì gửi lại đúng vé đã có, không sinh vé mới

**S-27-NFR** — email không chứa thông tin thanh toán; dùng lớp gửi email ở T-08. Ước lượng thô 2 SP — tier Next

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-32 — Xem lịch sử đơn hàng của tôi

- Nguồn: `Backlog!A29:O29`; **Next / Should**, Sprint 4; dependency: S-16 .
- Bề mặt: `/orders; GET /orders/me`.
- Code ứng viên: `apps/api/src/orders/order-history.service.ts; apps/web/src/features/orders/order-history.tsx`.
- Dữ liệu: A có hơn 20 order đủ trạng thái; B có order riêng.
- Cách thử: Duyệt phân trang mới nhất trước, kiểm status/event/số ghế/tổng; expired/cancelled vẫn xuất hiện. Không trùng/sót; B đọc chi tiết/status/tickets của A phải 403; lịch sử không chứa order B.
- Test tái sử dụng sau khi kiểm fixture: `orders.e2e-spec.ts; docs/ORDER_HISTORY.md`.

**S-32-AC01** — Giả sử tôi có nhiều đơn, Khi mở lịch sử, Thì thấy danh sách mới nhất trước với trạng thái, sự kiện, số ghế và tổng tiền, phân trang

**S-32-AC02** — Giả sử tôi gọi API với mã đơn của người khác, Khi xử lý, Thì bị từ chối 403

**S-32-AC03** — Giả sử đơn đã hết hạn hoặc đã huỷ, Khi xem, Thì vẫn thấy trong lịch sử với trạng thái tương ứng

**S-32-NFR** — phân trang, không tải toàn bộ lịch sử một lần. Ước lượng thô 2 SP — tier Next

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-25 — Nhận vé điện tử có mã QR sau khi thanh toán

- Nguồn: `Backlog!A30:O30`; **Next / Must**, Sprint 4; dependency: S-20 .
- Bề mặt: `GET /orders/:id/tickets; /orders/:id`.
- Code ứng viên: `apps/api/src/orders/ticket-qr.service.ts; apps/api/src/tickets/`.
- Dữ liệu: Order pending và paid 3 ghế; B không sở hữu.
- Cách thử: Trước trả tiền không có vé; sau webhook có đúng 3 vé, QR khác nhau, đủ event/suất/hạng/ghế. Replay không sinh thêm vé; so identity giữa projection orders và tickets, không chỉ đếm một bảng.
- Test tái sử dụng sau khi kiểm fixture: `tickets.e2e-spec.ts; ticket-qr.spec.ts`.

**S-25-AC01** — Giả sử đơn vừa chuyển sang đã trả, Khi tôi mở trang đơn, Thì mỗi ghế có một vé riêng với mã QR, tên sự kiện, suất, hạng và số ghế

**S-25-AC02** — Giả sử đơn có 3 ghế, Khi xem vé, Thì ba mã QR khác nhau và mã của vé này không suy ra được mã vé khác

**S-25-AC03** — Giả sử đơn chưa trả, Khi mở trang vé bằng đường dẫn, Thì không có vé nào

**S-25-NFR** — mã vé sinh ngẫu nhiên đủ dài, không dùng số thứ tự tăng dần. Ước lượng thô 3 SP — tier Next

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-26 — Mã QR trên vé có chữ ký, không tạo giả được ngoài hệ thống

- Nguồn: `Backlog!A31:O31`; **Next / Must**, Sprint 4; dependency: S-25 .
- Bề mặt: `QR trên vé; public keys; máy quét`.
- Code ứng viên: `apps/api/src/tickets/ticket-signing.service.ts; apps/api/src/scanner/scanner-crypto.service.ts`.
- Dữ liệu: K1/K2 key ring chỉ dùng thử; QR gốc, sửa, thiếu chữ ký, kid lạ.
- Cách thử: Ký bằng K1, xoay K2 nhưng giữ K1 public rồi restart; vé cũ vẫn xác minh được online/offline. Sửa một ký tự và bỏ chữ ký phải bị từ chối; kiểm browser bundle/API/cache chỉ chứa public keys.
- Test tái sử dụng sau khi kiểm fixture: `ticket-signing-keys.spec.ts; scanner-crypto.service.spec.ts`.

**S-26-AC01** — Giả sử nội dung QR gồm mã vé, mã suất và chữ ký, Khi máy quét kiểm chữ ký bằng khoá công khai, Thì vé thật qua và mã sửa một ký tự bị từ chối

**S-26-AC02** — Giả sử khoá ký bị đổi, Khi quét vé đã phát trước đó, Thì vé cũ vẫn hợp lệ nhờ phiên bản khoá ghi trong QR

**S-26-AC03** — Giả sử một người tự tạo QR với mã vé hợp lệ nhưng không có chữ ký, Khi quét, Thì bị từ chối

**S-26-NFR** — khoá riêng chỉ nằm trên máy chủ; máy quét chỉ giữ khoá công khai. Ước lượng thô 3 SP — tier Next

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-29 — Nhân viên soát vé chọn suất diễn và cửa trước khi quét

- Nguồn: `Backlog!A32:O32`; **Next / Should**, Sprint 4; dependency: S-28 .
- Bề mặt: `/check-in; GET /check-in/today`.
- Code ứng viên: `apps/api/src/check-in/; apps/web/src/features/check-in/`.
- Dữ liệu: STAFF có/không có assignment; suất hôm nay/ngày mai, cửa A/B.
- Cách thử: Thiếu suất hoặc cửa thì camera chưa được bật. Chọn cửa A, refresh/đóng mở vẫn nhớ; đổi B thì admission sau ghi B. Không có suất hôm nay hiện lời giải thích. Thu hồi assignment khi session còn sống phải chặn request tiếp theo.
- Test tái sử dụng sau khi kiểm fixture: `check-in-s29.spec.ts; check-in.spec.ts`.

**S-29-AC01** — Giả sử tôi đăng nhập trên điện thoại, Khi mở màn hình quét, Thì phải chọn suất diễn đang diễn ra hôm nay và tên cửa trước khi máy ảnh bật

**S-29-AC02** — Giả sử tôi đổi sang cửa khác, Khi chọn lại, Thì các lần quét sau ghi cửa mới

**S-29-AC03** — Giả sử không có suất nào hôm nay, Khi mở màn hình, Thì thấy thông báo thay vì danh sách rỗng

**S-29-NFR** — lựa chọn được nhớ trên thiết bị tới khi đổi. Ước lượng thô 2 SP — tier Next

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-30 — Soát vé bằng cách quét QR tại cửa

- Nguồn: `Backlog!A33:O33`; **Next / Must**, Sprint 4; dependency: S-26, S-29 .
- Bề mặt: `POST /showtimes/:id/check-in; camera web`.
- Code ứng viên: `apps/api/src/orders/ticket-check-in.service.ts; apps/web/src/features/ticket-scanner/`.
- Dữ liệu: Vé hợp lệ, QR lạ, mạng response >3 giây; điện thoại camera thật.
- Cách thử: Quét bằng camera và API; hợp lệ hiện xanh đủ ghế/hạng, DB có giờ/cửa. QR lạ hiện đỏ; trễ hơn 3 giây phải hiện đang chờ. Đo quét tới hiển thị dưới 500 ms riêng với API duration, kiểm ánh nắng trên thiết bị thật.
- Test tái sử dụng sau khi kiểm fixture: `ticket-check-in.e2e-spec.ts; check-in-request.spec.ts`.

**S-30-AC01** — Giả sử quét vé hợp lệ của đúng suất, Khi máy chủ xác nhận, Thì màn hình xanh hiện hạng ghế và số ghế, vé được đánh dấu đã vào kèm cửa và thời điểm

**S-30-AC02** — Giả sử quét mã không phải vé của hệ thống, Khi xử lý, Thì màn hình đỏ báo mã không hợp lệ

**S-30-AC03** — Giả sử mạng chậm, Khi quá 3 giây chưa có trả lời, Thì màn hình báo đang chờ thay vì đứng im

**S-30-NFR** — phản hồi sau khi quét dưới 500ms để không tạo hàng chờ; màn hình đọc được dưới nắng. Ước lượng thô 3 SP — tier Next

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-31 — Vé đã soát không dùng lại được lần hai

- Nguồn: `Backlog!A34:O34`; **Next / Must**, Sprint 4; dependency: S-30 .
- Bề mặt: `POST /showtimes/:id/check-in và /check-in/exception`.
- Code ứng viên: `apps/api/src/orders/ticket-check-in.service.ts; apps/api/prisma/migrations/`.
- Dữ liệu: 2 STAFF/2 cửa; một vé; canOverride bật/tắt.
- Cách thử: Hai máy quét cùng vé đồng thời: đúng 1 NORMAL, lần sau báo cửa/giờ đầu. RequestId replay không tăng admission. Ngoại lệ cần quyền cửa và lý do; thêm EXCEPTION giữ lịch sử cũ kèm tên nhân viên.
- Test tái sử dụng sau khi kiểm fixture: `ticket-check-in.e2e-spec.ts; apps/api/scripts/verify-s31-storage.mjs`.

**S-31-AC01** — Giả sử vé đã vào lúc 19:02 ở cửa A, Khi quét lại ở cửa B, Thì bị từ chối kèm thời điểm và cửa đã vào lần trước

**S-31-AC02** — Giả sử hai máy quét cùng một vé trong cùng khoảnh khắc, Khi cả hai tới máy chủ, Thì chỉ một máy báo hợp lệ — cùng nguyên tắc chống trùng như giữ chỗ ở S-13

**S-31-AC03** — Giả sử nhân viên xác nhận khách bị từ chối là chủ vé thật, Khi bấm "cho vào có ghi chú", Thì vé được ghi thêm một lần vào kèm lý do và tên nhân viên

**S-31-NFR** — đánh dấu đã vào chống được hai lần quét đồng thời bằng ràng buộc ở cơ sở dữ liệu. Ước lượng thô 3 SP — tier Next

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-33 — Tải trước danh sách vé của suất diễn xuống máy quét

- Nguồn: `Backlog!A35:O35`; **Next / Must**, Sprint 5; dependency: S-30 .
- Bề mặt: `/scanner/snapshot; GET /scanner/showtimes/:id/tickets`.
- Code ứng viên: `apps/api/src/scanner/scanner-snapshot.service.ts; apps/web/src/features/scanner/scanner-db.ts`.
- Dữ liệu: 5.000 vé; snapshot mới/cũ 30 phút; đổi trạng thái sau tải; 4G thật và mô phỏng.
- Cách thử: Tải full, kiểm count/checksum và cache không tên/email. Qua 30 phút phải delta; cursor người/suất khác không lộ dữ liệu. Đo dưới 10 giây, ghi rõ mô hình 4G và phân biệt phép đo trên 4G thật.
- Test tái sử dụng sau khi kiểm fixture: `scanner.service.spec.ts; scanner.spec.ts`.

**S-33-AC01** — Giả sử tôi đã chọn suất ở S-29 và đang có mạng, Khi bấm "tải danh sách", Thì toàn bộ mã vé hợp lệ và trạng thái đã vào của suất được lưu trên thiết bị kèm thời điểm tải

**S-33-AC02** — Giả sử danh sách đã tải quá 30 phút, Khi còn mạng, Thì máy tự tải lại phần thay đổi

**S-33-AC03** — Giả sử suất có 5000 vé, Khi tải, Thì xong dưới 10 giây trên mạng 4G

**S-33-NFR** — dữ liệu trên thiết bị chỉ có mã vé và trạng thái, không có tên hay email khách. Ước lượng thô 3 SP — tier Next

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-34 — Soát vé ngoại tuyến bằng danh sách đã tải

- Nguồn: `Backlog!A36:O36`; **Next / Must**, Sprint 5; dependency: S-33, S-26 .
- Bề mặt: `/scanner; IndexedDB; offline shell`.
- Code ứng viên: `apps/web/src/features/scanner/offline-scanner.ts; apps/web/src/features/ticket-scanner/offline-queue.ts`.
- Dữ liệu: Thiết bị đã tải/chưa tải snapshot và public key; 2 context; IndexedDB từ chối ghi.
- Cách thử: Ngắt mạng thật trong context, quét vé: verify signature và membership, ghi bền rồi mới xanh. Quét lần hai đỏ; đóng/mở browser còn queue. Không snapshot/key phải chặn. Full reload khi offline và lỗi lưu IndexedDB không được báo vào thành công.
- Test tái sử dụng sau khi kiểm fixture: `offline-scanner.spec.ts; offline-sync.spec.ts`.

**S-34-AC01** — Giả sử máy mất mạng và đã có danh sách ở S-33, Khi quét vé hợp lệ, Thì máy kiểm chữ ký QR bằng khoá công khai, tra mã trong danh sách, báo xanh và ghi lần quét vào hàng đợi cục bộ

**S-34-AC02** — Giả sử vé đã được đánh dấu đã vào trong danh sách tải về, Khi quét ngoại tuyến, Thì báo đỏ như khi có mạng

**S-34-AC03** — Giả sử cùng máy quét một vé hai lần khi mất mạng, Khi quét lần hai, Thì bị từ chối nhờ hàng đợi cục bộ

**S-34-AC04** — Giả sử máy chưa tải danh sách, Khi mất mạng, Thì màn hình báo không soát được và hướng dẫn tải khi có mạng

**S-34-NFR** — hàng đợi cục bộ sống qua việc đóng và mở lại ứng dụng. Ước lượng thô 5 SP — tier Next, cần chẻ khi lên Ready

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-35 — Đồng bộ các lần quét ngoại tuyến lên máy chủ khi có mạng lại

- Nguồn: `Backlog!A37:O37`; **Next / Must**, Sprint 5; dependency: S-34 .
- Bề mặt: `POST /scanner/sync-scans`.
- Code ứng viên: `apps/api/src/scanner/offline-admissions.service.ts; apps/web/src/features/ticket-scanner/sync-manager.ts`.
- Dữ liệu: 40 scan duy nhất; timeout sau server commit; response một phần, 401/403/409/5xx.
- Cách thử: Sync lô 40, ngắt giữa chừng rồi nối lại; mỗi scanId được nhận một lần. Chỉ xoá queue khi server xác nhận bền từng mục; lỗi HTTP không làm mất scan. Đổi account không trộn queue người cũ; conflict được lưu chứ không ghi đè.
- Test tái sử dụng sau khi kiểm fixture: `offline-sync.spec.ts; scanner.service.spec.ts`.

**S-35-AC01** — Giả sử máy có 40 lần quét trong hàng đợi, Khi có mạng lại, Thì tự đẩy lên theo lô và hàng đợi về 0

**S-35-AC02** — Giả sử đẩy lên bị ngắt giữa chừng, Khi có mạng lại lần nữa, Thì gửi tiếp phần còn lại và máy chủ không ghi trùng lần đã nhận — mỗi lần quét có mã duy nhất sinh trên thiết bị

**S-35-AC03** — Giả sử máy chủ nhận lần quét cho vé đã vào trước đó ở cửa khác, Khi xử lý, Thì ghi nhận là xung đột để S-36 xử lý, không ghi đè

**S-35-NFR** — xử lý một lần quét nhiều lần cho kết quả giống xử lý một lần. Ước lượng thô 3 SP — tier Next

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-36 — Xung đột soát vé ở hai cửa được phát hiện khi đồng bộ

- Nguồn: `Backlog!A38:O38`; **Next / Should**, Sprint 5; dependency: S-35 .
- Bề mặt: `/scanner/reports/:showtimeId; /scanner/showtimes/:id/conflicts`.
- Code ứng viên: `apps/api/src/scanner/; apps/web/src/features/scanner/conflict-report.tsx`.
- Dữ liệu: Hai máy offline quét cùng vé lúc T1<T2; upload theo thứ tự đảo; giờ thiết bị lệch.
- Cách thử: Cho scan muộn đồng bộ trước, scan sớm sau; kiểm kết quả theo giờ thiết bị như AC gốc, giữ cả cửa/thời điểm và offset. Nếu hợp đồng đã duyệt dùng luật khác, báo hai kết quả, không âm thầm đổi tiêu chí.
- Test tái sử dụng sau khi kiểm fixture: `scanner-attendance.spec.ts; offline-sync.spec.ts`.

**S-36-AC01** — Giả sử vé được quét ở cửa A và cửa B trong lúc cả hai mất mạng, Khi hai máy đồng bộ, Thì lần quét sớm hơn theo giờ thiết bị được tính là lần vào, lần kia thành xung đột

**S-36-AC02** — Giả sử có xung đột, Khi ban tổ chức mở báo cáo suất, Thì thấy danh sách vé, hai cửa, hai thời điểm

**S-36-NFR** — giờ thiết bị lệch được ghi lại lúc đồng bộ để đọc báo cáo đúng. Ước lượng thô 3 SP — tier Next

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-37 — Máy quét hiện rõ trạng thái mạng và số lần quét chưa đồng bộ

- Nguồn: `Backlog!A39:O39`; **Next / Should**, Sprint 5; dependency: S-34 .
- Bề mặt: `/scanner; dải mạng và số chưa sync`.
- Code ứng viên: `apps/web/src/features/ticket-scanner/network-status.ts; offline-banner.tsx`.
- Dữ liệu: navigator online nhưng API không tới được; queue 0/40; sync lỗi/thành công.
- Cách thử: Chặn API trong khi browser báo online: banner phải dựa vào lần gọi server thực. Kiểm counter tăng khi ghi queue và giảm sau ack, không biến mất chỉ vì navigator.onLine=true; hiển thị lại đúng sau refresh.
- Test tái sử dụng sau khi kiểm fixture: `offline-banner.spec.ts; offline-sync.spec.ts`.

**S-37-AC01** — Giả sử mất mạng, Khi màn hình quét đang mở, Thì có dải cảnh báo ngoại tuyến và bộ đếm lần quét chưa đồng bộ

**S-37-AC02** — Giả sử có mạng lại và đẩy xong, Khi bộ đếm về 0, Thì dải cảnh báo biến mất

**S-37-NFR** — trạng thái mạng đo bằng lần gọi máy chủ gần nhất, không chỉ dựa vào cờ của trình duyệt. Ước lượng thô 2 SP — tier Next

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-38 — Xem vé của tôi trong tài khoản và tải lại mã QR

- Nguồn: `Backlog!A40:O40`; **Next / Should**, Sprint 5; dependency: S-25 .
- Bề mặt: `/account/tickets; GET /tickets/me`.
- Code ứng viên: `apps/web/src/features/tickets/my-tickets.tsx; apps/api/src/tickets/`.
- Dữ liệu: Vé tương lai/quá khứ/huỷ/chuyển nhượng; QR có thể tải.
- Cách thử: Kiểm thứ tự sắp diễn trước, đã qua sau; tải ảnh QR và quét lại từ điện thoại. Vé huỷ phải mờ không QR; người B không lấy ảnh/QR vé A qua URL trực tiếp hoặc cache browser.
- Test tái sử dụng sau khi kiểm fixture: `tickets.e2e-spec.ts; ticket-qr-image.tsx`.

**S-38-AC01** — Giả sử tôi có vé cho suất sắp tới, Khi mở mục "vé của tôi", Thì thấy vé sắp diễn lên trước, vé đã qua xếp sau

**S-38-AC02** — Giả sử tôi mở một vé, Khi trang hiện, Thì QR đủ lớn để quét từ màn hình điện thoại và có nút tải ảnh

**S-38-NFR** — vé đã huỷ hiện mờ và không có QR. Ước lượng thô 2 SP — tier Next

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-39 — Quét vé sai suất diễn, vé đã huỷ hay mã lạ thì báo rõ lý do

- Nguồn: `Backlog!A41:O41`; **Next / Should**, Sprint 5; dependency: S-30 .
- Bề mặt: `/check-in; /scanner`.
- Code ứng viên: `apps/api/src/orders/ticket-check-in.service.ts; apps/web/src/features/ticket-scanner/admission-response.ts`.
- Dữ liệu: Vé sai suất, huỷ có ngày, QR lạ/sai chữ ký.
- Cách thử: Quét từng mẫu online và offline; kiểm message suất X/giờ Y, ngày huỷ và mã ngoài hệ thống, màu/biểu tượng. Mỗi từ chối có reason code riêng trong log, không lộ PII ngoài quyền.
- Test tái sử dụng sau khi kiểm fixture: `admission-response.spec.ts; ticket-check-in.e2e-spec.ts`.

**S-39-AC01** — Giả sử quét vé của suất khác, Khi từ chối, Thì hiện "vé của suất X lúc Y" để khách biết mình nhầm giờ

**S-39-AC02** — Giả sử quét vé đã huỷ và hoàn tiền, Khi từ chối, Thì hiện "vé đã huỷ ngày Z"

**S-39-AC03** — Giả sử quét mã lạ, Khi từ chối, Thì hiện "không phải vé của hệ thống"

**S-39-NFR** — mỗi lý do từ chối là một mã riêng trong log để đếm được. Ước lượng thô 2 SP — tier Next

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-43 — Giám sát và cảnh báo khi hệ thống quá tải

- Nguồn: `Backlog!A42:O42`; **Later / Should**, Sprint 6; dependency: S-01 .
- Bề mặt: `Metrics/dashboards và cảnh báo local`.
- Code ứng viên: `apps/api/src/monitoring/; monitoring/`.
- Dữ liệu: Sinh request, lỗi 4xx/5xx, tranh ghế và bad webhook; receiver thử riêng.
- Cách thử: Đối chiếu counter/p95 với request thật; vượt ngưỡng rule thử phải có alert nhận được và resolve. Metrics bảo vệ token/loopback, không label PII/high-cardinality; dashboard có dữ liệu và coverage khi producer chưa bật.
- Test tái sử dụng sau khi kiểm fixture: `metrics.spec.ts; monitoring/rule-tests.json; verify-s43.mjs`.

**S-43-AC01** — Có bảng theo dõi số yêu cầu, tỉ lệ lỗi, thời gian phản hồi p95, số tranh chấp ghế và số webhook bị từ chối; vượt ngưỡng thì gửi cảnh báo. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**S-43-NFR** — chưa refine — cần chốt kênh nhận cảnh báo và công cụ thu thập số liệu

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-44 — Sơ đồ ghế tự cập nhật trạng thái mà không cần tải lại trang

- Nguồn: `Backlog!A43:O43`; **Later / Could**, Sprint 6; dependency: S-09 .
- Bề mặt: `GET /showtimes/:id/seats/stream`.
- Code ứng viên: `apps/api/src/showtimes/seat-events.service.ts; apps/web/src/features/seat-selection/`.
- Dữ liệu: 2 browser và 2.000 kết nối SSE; FREE→HELD→SOLD/nhả; reconnect.
- Cách thử: Giữ/nhả/bán/huỷ từ context B, A tự cập nhật không refresh trong 2 giây. Mở đủ 2.000 viewer, đo mỗi viewer nhận/áp dụng event, ghi p95/max và số vượt; reconnect không mất/trùng state, không leak khi route đổi.
- Test tái sử dụng sau khi kiểm fixture: `seat-events.service.spec.ts; verify-sse-load.mjs`.

**S-44-AC01** — Ghế đổi trạng thái thì mọi người đang mở sơ đồ suất đó thấy thay đổi trong vòng 2 giây mà không tải lại. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**S-44-NFR** — chưa refine — cần chốt đẩy từ máy chủ hay hỏi lại định kỳ, và mức tải chấp nhận được với 2000 người cùng xem

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-40 — Hàng đợi phòng chờ khi lượng truy cập vượt ngưỡng

- Nguồn: `Backlog!A44:O44`; **Later / Should**, Sprint 6; dependency: S-13 .
- Bề mặt: `Phòng chờ trước giữ ghế/đặt đơn`.
- Code ứng viên: `apps/api/src/booking-access/; apps/web/src/features/lifecycle/waiting-room-notice.tsx`.
- Dữ liệu: Capacity thử=1; A đang active, B/C chờ theo thứ tự; TTL theo cấu hình.
- Cách thử: Cho A vào rồi B/C xếp hàng; vị trí FIFO đúng. A hết lượt/thoát thì B được vào có hạn, C còn chờ; gọi thẳng hold/order không bypass admission. Quota/ngưỡng là giá trị cần quyết định được duyệt.
- Test tái sử dụng sau khi kiểm fixture: `booking-access.guard.spec.ts; verify-sprint6-8.mjs`.

**S-40-AC01** — Vượt ngưỡng người đang chọn ghế thì người mới vào phòng chờ theo thứ tự đến, thấy vị trí của mình, tới lượt thì được vào trang chọn ghế với một lượt có thời hạn; hết lượt không thao tác thì mất chỗ. Chưa refine chi tiết — tier Later, ước lượng thô 8 SP, cần chẻ ít nhất ba story khi lên Next

**S-40-NFR** — chưa refine — cần chốt ngưỡng, thời gian giữ lượt, và hàng đợi đặt ở Redis hay ở tầng trước ứng dụng

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-41 — Giới hạn tần suất yêu cầu theo tài khoản và theo IP

- Nguồn: `Backlog!A45:O45`; **Later / Should**, Sprint 6; dependency: S-02 .
- Bề mặt: `Hold/order API rate limiting`.
- Code ứng viên: `apps/api/src/booking-access/booking-access.service.ts`.
- Dữ liệu: N tài khoản/2 IP; một tài khoản/2 IP; quota thử được ghi rõ.
- Cách thử: Gửi tới ngưỡng-1/ngưỡng/ngưỡng+1 cho hold và order; kiểm từ chối tạm thời và Retry-After. Kiểm account và IP độc lập, NAT dùng chung và header IP giả; hết cửa sổ được phục hồi.
- Test tái sử dụng sau khi kiểm fixture: `booking-access.guard.spec.ts; verify-sprint6-8.mjs`.

**S-41-AC01** — Vượt ngưỡng số yêu cầu mỗi phút trên API giữ ghế và tạo đơn thì bị từ chối tạm thời kèm thời gian chờ; ngưỡng tính riêng theo tài khoản và theo IP. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**S-41-NFR** — chưa refine — cần chốt ngưỡng, tránh chặn nhầm người dùng chung mạng ký túc xá hay công ty

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-42 — Giới hạn số vé mỗi tài khoản được mua trong một suất

- Nguồn: `Backlog!A46:O46`; **Later / Should**, Sprint 6; dependency: S-16 .
- Bề mặt: `PATCH /showtimes/:id/ticket-limit`.
- Code ứng viên: `apps/api/src/showtimes/; apps/api/src/holds/; apps/web/src/features/showtime-management/ticket-limit-control.tsx`.
- Dữ liệu: Giới hạn thử 4; account có 2 paid+2 hold; hai request song song.
- Cách thử: Giữ thêm ghế thứ 5 phải bị chặn kể cả race hai request. Nhả/hết hạn/huỷ ảnh hưởng quota đúng; pending được tính theo hợp đồng chốt, không cộng trùng hold của order. B khác tài khoản vẫn mua được.
- Test tái sử dụng sau khi kiểm fixture: `verify-sprint6-8.mjs; docs/S42_RUNBOOK.md`.

**S-42-AC01** — Ban tổ chức đặt giới hạn theo suất; tổng ghế đang giữ cộng đã mua của một tài khoản vượt giới hạn thì không giữ thêm được. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**S-42-NFR** — chưa refine — cần chốt giới hạn tính theo tài khoản hay theo số điện thoại đã xác minh

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-45 — Khách huỷ vé trước hạn và được hoàn tiền theo chính sách

- Nguồn: `Backlog!A47:O47`; **Later / Should**, Sprint 7; dependency: S-25 .
- Bề mặt: `GET /orders/:id/cancellation; POST /orders/:id/cancel`.
- Code ứng viên: `apps/api/src/lifecycle/cancellations.service.ts; apps/web/src/features/lifecycle/order-cancellation.tsx`.
- Dữ liệu: Paid chưa check-in; đúng trước/đúng/sau cutoff 24h; policy mock 100% là contract ứng viên.
- Cách thử: Preview rồi cancel; kiểm số tiền hoàn/vé/order/audit và quyền chủ. Kiểm biên cutoff, đã check-in, replay và 2 cancel đồng thời. Tách kiểm theo AC gốc với chính sách còn mở và theo hợp đồng local đã có bằng chứng phê duyệt.
- Test tái sử dụng sau khi kiểm fixture: `lifecycle.spec.ts; verify-sprint6-8.mjs`.

**S-45-AC01** — Huỷ trước mốc quy định thì vé chuyển sang đã huỷ, lệnh hoàn theo tỉ lệ chính sách được gửi tới cổng và khách thấy số tiền sẽ nhận; huỷ sau mốc thì bị từ chối kèm lý do. Chưa refine chi tiết — tier Later, ước lượng thô 5 SP

**S-45-NFR** — chưa refine — cần chốt mốc thời gian, tỉ lệ hoàn, và cổng sandbox có hỗ trợ hoàn tiền không

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-46 — Ghế của vé đã huỷ quay lại kho bán

- Nguồn: `Backlog!A48:O48`; **Later / Should**, Sprint 7; dependency: S-45 .
- Bề mặt: `Map sau huỷ/hoàn và API holds`.
- Code ứng viên: `apps/api/src/lifecycle/cancellations.service.ts; apps/api/src/showtimes/`.
- Dữ liệu: Vé huỷ hợp lệ; buyer B; retry refund thất bại.
- Cách thử: Sau điểm chuyển trạng thái đã chốt, B thấy ghế trống và giữ/mua lại được; QR cũ không vào cửa được. Cho cancel và B giữ race; không có hai chủ ghế còn hiệu lực, retry hoàn không thu hồi ghế đã bán lại.
- Test tái sử dụng sau khi kiểm fixture: `lifecycle.spec.ts; verify-sprint6-8.mjs`.

**S-46-AC01** — Vé huỷ xong thì ghế trở lại trạng thái trống trên sơ đồ và giữ được như ghế thường. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**S-46-NFR** — chưa refine — cần chốt mở bán lại tự động hay chờ ban tổ chức duyệt

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-47 — Ban tổ chức huỷ suất diễn và hoàn tiền hàng loạt

- Nguồn: `Backlog!A49:O49`; **Later / Should**, Sprint 7; dependency: S-45 .
- Bề mặt: `POST /showtimes/:id/cancel; /cancellation`.
- Code ứng viên: `apps/api/src/lifecycle/lifecycle.module.ts; cancellations.service.ts`.
- Dữ liệu: Suất nhiều paid/pending orders; một lỗi giữa batch; SMTP catcher.
- Cách thử: Huỷ suất, kiểm đóng bán ngay, vé vô hiệu, mỗi paid order một refund 100%, pending xử lý theo contract. Restart giữa batch, retry không nhân hoàn và không bỏ đơn; email tới catcher và lỗi từng phần được nhìn thấy.
- Test tái sử dụng sau khi kiểm fixture: `lifecycle.spec.ts; verify-sprint6-8.mjs`.

**S-47-AC01** — Huỷ suất thì suất đóng bán, mọi vé chuyển sang đã huỷ, một lệnh hoàn 100% được tạo cho từng đơn và chạy nền theo lô, khách nhận email thông báo. Chưa refine chi tiết — tier Later, ước lượng thô 5 SP

**S-47-NFR** — chưa refine — cần chốt cách xử lý khi một lệnh hoàn trong lô thất bại và giới hạn tốc độ gọi cổng

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-48 — Lệnh hoàn tiền thất bại được thử lại và báo cho kế toán

- Nguồn: `Backlog!A50:O50`; **Later / Should**, Sprint 7; dependency: S-45 .
- Bề mặt: `/operations/refunds; POST /operations/refunds/:id/resolve-mock`.
- Code ứng viên: `apps/api/src/lifecycle/mock-refund.gateway.ts; cancellations.service.ts`.
- Dữ liệu: Gateway fail lần 1/2/3; timeout sau nhận lệnh; ACCOUNTANT/BUYER.
- Cách thử: Kiểm đúng số lần thử/backoff/FAILED và báo kế toán, phân biệt UNKNOWN không tự trả tiền lần hai. Chỉ kế toán/admin xử lý; retry trùng không sinh refund mới, log giữ provider reason đã che dữ liệu.
- Test tái sử dụng sau khi kiểm fixture: `lifecycle.spec.ts; verify-sprint6-8.mjs`.

**S-48-AC01** — Lệnh hoàn thất bại được thử lại tối đa 3 lần cách nhau tăng dần; vẫn thất bại thì vào danh sách cần xử lý tay của kế toán kèm lý do từ cổng. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**S-48-NFR** — chưa refine — cần chốt kênh báo và thời hạn xử lý tay

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-49 — Nhật ký thao tác trên đơn hàng và vé

- Nguồn: `Backlog!A51:O51`; **Later / Must**, Sprint 7; dependency: S-16 .
- Bề mặt: `GET /orders/:id/audit`.
- Code ứng viên: `apps/api/src/lifecycle/reports.service.ts; domain_audit/order_logs`.
- Dữ liệu: Một hành trình hold→order→paid→ticket→check-in→cancel hợp lệ, cả người và job.
- Cách thử: Ở mỗi chuyển trạng thái đối chiếu audit có actor, giờ, trước/sau; lịch sử đọc theo order và không mất do retry. Buyer chỉ xem order mình; kiểm retention quyết định còn mở, không coi một bảng có audit là đủ mọi chuyển.
- Test tái sử dụng sau khi kiểm fixture: `lifecycle.spec.ts; verify-sprint6-8.mjs`.

**S-49-AC01** — Mọi thay đổi trạng thái đơn, vé, giữ chỗ do người hay do job đều có bản ghi kèm tác nhân, thời điểm, trạng thái trước và sau; xem được theo đơn. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**S-49-NFR** — chưa refine — cần chốt thời gian lưu nhật ký và bảng riêng hay dùng chung với `payment_events`

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-55 — Sao lưu cơ sở dữ liệu hằng ngày và diễn tập khôi phục

- Nguồn: `Backlog!A52:O52`; **Later / Must**, Sprint 8; dependency: S-01 .
- Bề mặt: `Job backup và restore drill`.
- Code ứng viên: `apps/api/scripts/sprint-backup.mjs; deploy/install-daily-backup.ps1`.
- Dữ liệu: DB thử có dữ liệu nhận diện; 16 backup giả; kho ngoài host và key thử được bảo vệ.
- Cách thử: Kiểm lịch nightly, upload off-host và retention đúng 14 bản; một backup lỗi không xoá bản tốt. Restore sang DB mới, mở app/đơn/vé/QR kiểm integrity. Giữ key giải mã qua restart; local drill không chứng minh off-host hoặc lịch chạy mỗi đêm.
- Test tái sử dụng sau khi kiểm fixture: `sprint-backup.spec.mjs; verify-backup-drill.mjs`.

**S-55-AC01** — Job sao lưu chạy mỗi đêm, bản sao lưu đẩy ra ngoài máy chủ ứng dụng, giữ 14 bản gần nhất; đã khôi phục thử lên môi trường tạm và ứng dụng chạy được với dữ liệu đó; quy trình khôi phục ghi trong README. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**S-55-NFR** — chưa refine — cần chốt nơi lưu bản sao lưu và mã hoá

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-53 — Khách yêu cầu xoá dữ liệu cá nhân của mình

- Nguồn: `Backlog!A53:O53`; **Later / Must**, Sprint 8; dependency: S-49 .
- Bề mặt: `/account/privacy; /privacy/erasure; /privacy/erasure/:id/approve`.
- Code ứng viên: `apps/api/src/lifecycle/privacy.service.ts; apps/web/src/app/account/privacy/`.
- Dữ liệu: Tài khoản giả có orders/payments/tickets/outbox; ADMIN và người không có quyền.
- Cách thử: Yêu cầu xoá chưa tự xoá trước duyệt. Admin duyệt, tìm toàn bộ bản sao tên/email/điện thoại, session/token/cache/outbox và quyền đăng nhập; tổng giao dịch/doanh thu giữ nguyên. Chốt phạm vi giữ/xoá với người quyết sản phẩm, không tự kết luận tuân thủ pháp luật.
- Test tái sử dụng sau khi kiểm fixture: `lifecycle.spec.ts; verify-sprint6-8.mjs`.

**S-53-AC01** — Sau khi yêu cầu được duyệt, họ tên, email, số điện thoại bị thay bằng giá trị ẩn danh trong mọi bảng, tài khoản không đăng nhập được nữa, nhưng đơn hàng, giao dịch và số liệu doanh thu vẫn nguyên để phục vụ kế toán. Chưa refine chi tiết — tier Later, ước lượng thô 5 SP

**S-53-NFR** — chưa refine — cần người có thẩm quyền xác nhận phạm vi dữ liệu phải xoá và dữ liệu phải giữ theo luật kế toán. **Skill không đưa tư vấn pháp lý**

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-54 — Người dùng đồng ý điều khoản và chính sách riêng tư, thu hồi được

- Nguồn: `Backlog!A54:O54`; **Later / Must**, Sprint 8; dependency: S-03 .
- Bề mặt: `/register; /privacy; /account/privacy; /privacy/consent`.
- Code ứng viên: `apps/api/src/lifecycle/privacy.service.ts; apps/api/src/users/registration.service.ts`.
- Dữ liệu: Checkbox chưa chọn/đã chọn, policy V1→V2 trong profile thử; có/không marketing consent.
- Cách thử: UI/API đăng ký thiếu đồng ý phải bị chặn; lưu version/time. Tăng version rồi login, phải xác nhận lại, không bypass bằng direct API. Thu hồi marketing consent phải dừng marketing; email nghiệp vụ được kiểm theo quyết định riêng đã chốt.
- Test tái sử dụng sau khi kiểm fixture: `registration-admission.e2e-spec.ts; lifecycle.spec.ts`.

**S-54-AC01** — Khi đăng ký phải tích đồng ý, hệ thống lưu phiên bản và thời điểm; đổi phiên bản chính sách thì lần đăng nhập sau phải đồng ý lại; người dùng thu hồi được và khi đó không nhận email tiếp thị nữa. Chưa refine chi tiết — tier Later, ước lượng thô 2 SP

**S-54-NFR** — chưa refine — nội dung điều khoản do người có thẩm quyền cung cấp, không phải dev soạn

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-50 — Xem doanh thu và tồn vé theo suất diễn

- Nguồn: `Backlog!A55:O55`; **Later / Should**, Sprint 8; dependency: S-20 .
- Bề mặt: `GET /showtimes/:id/manage/sales; /financial-report`.
- Code ứng viên: `apps/api/src/lifecycle/reports.service.ts; apps/web/src/features/showtime-management/showtime-sales-report.tsx`.
- Dữ liệu: Giá 3 hạng; free/hold/pending/paid/refunded; oracle độc lập.
- Cách thử: Đối chiếu sold/held/free và doanh thu từng hạng với tập ID/order item, không cộng trùng join; đổi một trạng thái rồi đo cập nhật ≤60 giây. Organizer khác không xem được; nêu rõ doanh thu gộp/ròng theo quyết định.
- Test tái sử dụng sau khi kiểm fixture: `lifecycle.spec.ts; verify-sprint6-8.mjs`.

**S-50-AC01** — Bảng theo suất diễn có số vé đã bán, số ghế đang giữ, số ghế còn, doanh thu theo hạng, cập nhật không trễ quá 1 phút. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**S-50-NFR** — chưa refine — cần chốt tính thời gian thực hay tổng hợp theo lô

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-51 — Đối soát giao dịch hệ thống với sao kê cổng thanh toán

- Nguồn: `Backlog!A56:O56`; **Later / Should**, Sprint 8; dependency: S-20 .
- Bề mặt: `POST/GET /operations/reconciliation`.
- Code ứng viên: `apps/api/src/lifecycle/reports.service.ts; /operations UI`.
- Dữ liệu: CSV fixture có MATCH, SYSTEM_ONLY, GATEWAY_ONLY, AMOUNT_MISMATCH, duplicate.
- Cách thử: Nạp sao kê đúng và sai định dạng; kiểm từng nhóm bằng oracle giao dịch độc lập. Reimport cùng file không nhân run/kết quả theo contract; BUYER/STAFF bị cấm; không biến parser CSV demo thành bằng chứng đối soát provider thật.
- Test tái sử dụng sau khi kiểm fixture: `lifecycle.spec.ts; verify-sprint6-8.mjs`.

**S-51-AC01** — Nạp tệp sao kê của cổng theo kỳ, hệ thống ghép theo mã giao dịch với `payment_events` và chỉ ra ba nhóm: khớp, có ở hệ thống mà không có ở cổng, có ở cổng mà không có ở hệ thống; lệch số tiền cũng thành một dòng. Chưa refine chi tiết — tier Later, ước lượng thô 5 SP

**S-51-NFR** — chưa refine — cần chốt định dạng sao kê của cổng đã chọn

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-52 — Ban tổ chức xem số khách đã vào cửa theo thời gian thực

- Nguồn: `Backlog!A57:O57`; **Later / Should**, Sprint 8; dependency: S-31 .
- Bề mặt: `/scanner/reports/:id; /showtimes/:id/attendance-report`.
- Code ứng viên: `apps/api/src/lifecycle/reports.service.ts; apps/api/src/scanner/`.
- Dữ liệu: Admission online/offline/conflict/exception tại 2 cửa, nhiều mốc phút.
- Cách thử: Kiểm số khách vào/chưa vào/tốc độ theo phút và cửa trước/sau sync. Không đếm retry/conflict/exception thành thêm khách duy nhất trừ quy tắc đã chốt; đối chiếu từng bucket và quyền chủ.
- Test tái sử dụng sau khi kiểm fixture: `scanner-attendance.spec.ts; lifecycle.spec.ts`.

**S-52-AC01** — Màn hình theo suất hiện số đã vào, số chưa vào, tốc độ vào theo phút và theo từng cửa, kể cả số liệu từ máy đang ngoại tuyến sau khi đồng bộ. Chưa refine chi tiết — tier Later, ước lượng thô 2 SP

**S-52-NFR** — chưa refine — cần chốt tần suất cập nhật

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-58 — Nhân bản suất diễn kèm sơ đồ và bảng giá

- Nguồn: `Backlog!A58:O58`; **Later / Could**, Sprint chưa xếp; dependency: S-15 .
- Bề mặt: `POST /showtimes/:id/clone`.
- Code ứng viên: `apps/api/src/showtimes/showtimes.service.ts; apps/web/src/features/showtime-management/clone-showtime-form.tsx`.
- Dữ liệu: Suất nguồn có sơ đồ, giá và ghế đã bán/giữ.
- Cách thử: Nhân bản giờ tương lai, so layout/category/prices nhưng ID khác và tất cả ghế mới trống, trạng thái DRAFT. Không mang hold/order/admission từ nguồn; sửa clone không đổi nguồn; kiểm chủ sở hữu.
- Test tái sử dụng sau khi kiểm fixture: `showtimes.service.spec.ts; sprint2.e2e-spec.ts`.

**S-58-AC01** — Chọn "nhân bản" thì suất mới ở trạng thái nháp có cùng sơ đồ và giá, chỉ khác thời gian; ghế của suất mới đều trống. Chưa refine chi tiết — tier Later, ước lượng thô 2 SP. Phần đệm, chưa xếp sprint

**S-58-NFR** — chưa refine

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-59 — Danh sách chờ khi suất diễn hết vé

- Nguồn: `Backlog!A59:O59`; **Later / Could**, Sprint chưa xếp; dependency: S-08 .
- Bề mặt: `Danh sách chờ khi hết vé; khác phòng chờ S-40`.
- Code ứng viên: `Chưa tìm thấy module waitlist trong inventory hiện tại`.
- Dữ liệu: Suất hết ghế, A/B đăng ký chờ theo thứ tự; SMTP catcher; quy tắc giữ riêng cần chốt.
- Cách thử: Tìm UI/API/schema; nếu chưa có ghi MISSING, không dùng S-40 thay thế. Khi ghế được nhả do huỷ/hết hạn, email lần lượt đúng FIFO và không spam retry; chốt ghế có được dành riêng hay không.
- Test tái sử dụng sau khi kiểm fixture: `Chưa xác định suite chuyên biệt`.

**S-59-AC01** — Suất hết ghế thì hiện nút đăng ký chờ; khi có ghế về kho do huỷ hay hết hạn, người chờ nhận email theo thứ tự đăng ký. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP. Phần đệm, chưa xếp sprint

**S-59-NFR** — chưa refine — cần chốt có giữ ghế riêng cho người được báo trong một khoảng ngắn không

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-61 — Nhắc người mua trước giờ diễn qua email

- Nguồn: `Backlog!A60:O60`; **Later / Could**, Sprint chưa xếp; dependency: S-27 .
- Bề mặt: `Scheduler reminder và email đổi lịch`.
- Code ứng viên: `apps/api/src/tickets/ticket-reminder.scheduler.ts; apps/api/src/core-completion/`.
- Dữ liệu: Suất T+24h, T+24h±1s, đã huỷ/quá khứ; SMTP catcher; worker off/on.
- Cách thử: Kiểm lịch nhắc quanh 24h, đủ QR/địa điểm, retry không nhân job. Đổi giờ gửi cập nhật đúng lịch mới và QR cũ còn hiệu lực; nhiều scheduler không gửi trùng job. Kiểm entrypoint/provider thực nối vào ứng dụng và quyết định thư nghiệp vụ sau thu hồi consent.
- Test tái sử dụng sau khi kiểm fixture: `ticket-reminder.scheduler.spec.ts; core.spec.ts; verify-core-completion.mjs`.

**S-61-AC01** — Email nhắc gửi 24 giờ trước suất kèm vé và chỉ dẫn địa điểm; đổi giờ diễn thì gửi email cập nhật. Chưa refine chi tiết — tier Later, ước lượng thô 2 SP. Phần đệm, chưa xếp sprint

**S-61-NFR** — chưa refine — người đã thu hồi đồng ý ở S-54 vẫn nhận email nghiệp vụ này vì nó không phải tiếp thị; cần xác nhận

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-56 — Mã giảm giá theo sự kiện

- Nguồn: `Backlog!A61:O61`; **Later / Could**, Sprint chưa xếp; dependency: S-17 .
- Bề mặt: `Mã giảm giá tại checkout; route cần tìm lại khi chạy`.
- Code ứng viên: `Chưa tìm thấy module coupon/discount trong inventory hiện tại`.
- Dữ liệu: Mã phần trăm/cố định, hết hạn/hết lượt, 2 người tranh lượt cuối; quy tắc cộng dồn cần chốt.
- Cách thử: Tìm UI/API/schema trước; không có thì MISSING với nguồn tìm kiếm. Khi có: kiểm số tiền giảm không âm tổng, giới hạn và race lượt cuối, retry order không trừ lượt hai lần; chỉ nghiệm thu sau khi chốt cộng dồn.
- Test tái sử dụng sau khi kiểm fixture: `Chưa xác định suite chuyên biệt`.

**S-56-AC01** — Ban tổ chức tạo mã có tỉ lệ hoặc số tiền giảm, số lượt và hạn dùng; người mua nhập mã ở trang đơn, tổng tiền giảm đúng và số lượt trừ đúng kể cả khi nhiều người dùng cùng lúc. Chưa refine chi tiết — tier Later, ước lượng thô 5 SP. Phần đệm, chưa xếp sprint

**S-56-NFR** — chưa refine — cần chốt có cộng dồn nhiều mã không

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-57 — Chuyển nhượng vé cho người khác

- Nguồn: `Backlog!A62:O62`; **Later / Could**, Sprint chưa xếp; dependency: S-25 .
- Bề mặt: `POST /orders/:id/tickets/:ticketId/transfer`.
- Code ứng viên: `apps/api/src/tickets/tickets.service.ts; tickets.controller.ts`.
- Dữ liệu: Chủ vé, email người nhận mới/có sẵn, vé huỷ/đã soát; key ring thử.
- Cách thử: Chuyển vé, kiểm người cũ không còn quyền và QR cũ vô hiệu, người nhận có QR mới và audit. Quét lại ở snapshot cũ/offline rồi sync để kiểm chính sách thu hồi; không tự chốt tính năng tắt theo sự kiện.
- Test tái sử dụng sau khi kiểm fixture: `tickets.service.spec.ts; tickets.e2e-spec.ts`.

**S-57-AC01** — Chủ vé nhập email người nhận, vé cũ bị vô hiệu và vé mới với mã QR mới được phát cho người nhận, nhật ký ghi lại. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP. Phần đệm, chưa xếp sprint

**S-57-NFR** — chưa refine — cần chốt ban tổ chức có được tắt chuyển nhượng theo sự kiện không

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-60 — Xuất sơ đồ ghế đã bán dạng PDF

- Nguồn: `Backlog!A63:O63`; **Later / Could**, Sprint chưa xếp; dependency: S-09 .
- Bề mặt: `Xuất sơ đồ ghế PDF`.
- Code ứng viên: `Chưa tìm thấy tuyến xuất PDF sơ đồ trong inventory hiện tại`.
- Dữ liệu: Map có 3 trạng thái và chú giải; snapshot lúc xuất.
- Cách thử: Nếu có chức năng, xuất PDF và mở/render: đúng một trang, đủ ghế/chú giải/trạng thái theo snapshot; không bị cắt. So số ghế và quyền organizer; không có route/UI thì MISSING.
- Test tái sử dụng sau khi kiểm fixture: `Chưa xác định suite chuyên biệt`.

**S-60-AC01** — Xuất tệp PDF một trang có sơ đồ tô màu theo trạng thái và chú giải, đúng với dữ liệu tại thời điểm xuất. Chưa refine chi tiết — tier Later, ước lượng thô 2 SP. Phần đệm, chưa xếp sprint

**S-60-NFR** — chưa refine

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-62 — Xuất danh sách khách vào cửa theo suất diễn

- Nguồn: `Backlog!A64:O64`; **Later / Could**, Sprint chưa xếp; dependency: S-31 .
- Bề mặt: `Xuất CSV khách đã vào cửa`.
- Code ứng viên: `Chưa tìm thấy tuyến export attendance CSV trong inventory hiện tại`.
- Dữ liệu: Admissions 2 cửa, thời gian khác, conflict; quyết định trường PII cần chốt.
- Cách thử: Nếu có, tải và parse CSV: ticket/seat/entry-time/gate/conflict đúng snapshot; quoting Unicode và dữ liệu bắt đầu =,+,-,@ an toàn khi mở bảng tính. Người khác không xuất được; chốt mức PII trước nghiệm thu.
- Test tái sử dụng sau khi kiểm fixture: `Chưa xác định suite chuyên biệt`.

**S-62-AC01** — Xuất tệp CSV có mã vé, ghế, giờ vào, cửa vào, cờ xung đột nếu có. Chưa refine chi tiết — tier Later, ước lượng thô 2 SP. Phần đệm, chưa xếp sprint

**S-62-NFR** — chưa refine — cần chốt tệp có chứa thông tin cá nhân tới mức nào

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

### S-63 — Báo cáo tỉ lệ bỏ giỏ và thời gian giữ chỗ thực tế

- Nguồn: `Backlog!A65:O65`; **Later / Could**, Sprint chưa xếp; dependency: S-12 .
- Bề mặt: `Báo cáo bỏ giỏ/giữ chỗ`.
- Code ứng viên: `Chưa tìm thấy báo cáo abandonment trong inventory hiện tại`.
- Dữ liệu: 10 hold sessions: thành đơn, hết hạn và đang giữ; oracle thời gian trung bình/p90.
- Cách thử: Tìm route/UI; nếu có đối chiếu số lượt giữ/thành đơn/hết hạn bằng session ID, không đếm số ghế thay lượt. Chốt mẫu số và cách tính p90; test cửa sổ thời gian, một lượt nhiều ghế và retry.
- Test tái sử dụng sau khi kiểm fixture: `Chưa xác định suite chuyên biệt`.

**S-63-AC01** — Báo cáo theo suất: số lượt giữ, số thành đơn, số hết hạn, thời gian trung bình và p90 từ giữ tới trả. Chưa refine chi tiết — tier Later, ước lượng thô 2 SP. Phần đệm, chưa xếp sprint

**S-63-NFR** — chưa refine

Kết quả ban đầu: `NOT_RUN`. Chỉ chuyển PASS khi đủ các mệnh đề và bằng chứng; ghi riêng UI/API/DB/NFR, local/staging/device.

## 13. Checklist 55 task kỹ thuật

Mỗi dòng có hai case `T-xx-AC` và `T-xx-NFR` trong JSON. Thực hiện cùng story cha nhưng lưu kết quả riêng; không coi story PASS là mọi task PASS.

| Task | Story | Điều kiện AC gốc | NFR gốc |
|---|---|---|---|
| T-01 — Dựng khung dự án và kết nối cơ sở dữ liệu | S-01 | Chạy `docker compose up` rồi khởi động ứng dụng thì kết nối được cơ sở dữ liệu, migration chạy sạch cả tiến lẫn lùi | chuỗi kết nối đọc từ biến môi trường, không ghi thẳng trong mã |
| T-02 — Pipeline CI chạy build, lint, test | S-01 | Push một commit cố ý sai lint thì pipeline đỏ và chặn merge | pipeline chạy xong dưới 5 phút để không làm chậm nhịp sprint 1 tuần |
| T-03 — Triển khai tự động lên staging bằng Docker | S-01 | Merge vào nhánh chính thì staging chạy phiên bản mới trong vòng 10 phút, không cần thao tác tay; image lỗi thì container cũ vẫn chạy | triển khai thất bại thì giữ nguyên phiên bản cũ, không để staging chết |
| T-04 — Bảng `users` và `roles` kèm migration | S-02 | Migration chạy tiến và lùi được; `users.email` có ràng buộc unique; seed sẵn năm vai trò và hai tài khoản demo | cột mật khẩu đủ dài cho hash argon2id |
| T-05 — Đăng nhập bằng email và mật khẩu | S-02 | Đăng nhập đúng thì vào được trang chính; sai 5 lần thì lần thứ 6 bị khoá 15 phút; khởi động lại ứng dụng thì khoá vẫn còn | thông báo lỗi không tiết lộ email có tồn tại hay không |
| T-06 — Chặn truy cập theo vai trò ở tầng middleware | S-02 | Gọi API không đúng vai trò bằng curl thì nhận 403, kể cả khi giao diện đã ẩn nút; route chưa khai báo quyền trả về 403 | mặc định là từ chối — route mới không khai báo quyền thì bị chặn, không phải được mở |
| T-07 — API và form đăng ký kèm kiểm tra dữ liệu | S-03 | Đăng ký hợp lệ thì có bản ghi mới với vai trò người mua; email trùng hoặc mật khẩu ngắn thì bị chặn với thông báo đúng | thông báo lỗi không phân biệt email đã tồn tại hay chưa |
| T-08 — Gửi email xác nhận và kích hoạt tài khoản | S-03 | Đăng ký xong thì trong log dev thấy email kèm liên kết; bấm liên kết thì tài khoản chuyển sang đã kích hoạt; bấm lần hai thì báo đã dùng | không log mã kích hoạt ở môi trường staging trở lên |
| T-09 — Bảng `events` và `showtimes` kèm migration | S-04 | Migration chạy tiến và lùi được; xoá sự kiện thì suất diễn con bị chặn hoặc xoá theo, có chủ đích rõ ràng | cột thời gian dùng kiểu có múi giờ, không dùng kiểu không múi giờ |
| T-10 — Màn hình tạo và sửa sự kiện | S-04 | Tạo, sửa, xem danh sách sự kiện đều chạy; lỗi nhập liệu hiện ngay tại ô sai; mở sự kiện của người khác bằng đường dẫn thì bị 403 | form gửi đi phải chặn bấm hai lần liên tiếp |
| T-11 — Bảng `seats` và `seat_categories` kèm migration | S-05 | Migration tiến và lùi được; có ràng buộc unique trên bộ ba suất diễn, hàng, số ghế; có chỉ mục trên khoá ngoại suất diễn | có chỉ mục trên khoá ngoại suất diễn vì mọi truy vấn ghế đều lọc theo nó |
| T-12 — Nạp tệp JSON thành ghế và hạng ghế trong một giao dịch | S-05 | Tệp mẫu 2000 ghế nạp xong dưới 5 giây; cố ý làm hỏng ghế cuối thì bảng `seats` không có dòng nào của suất đó | chèn theo lô, không chèn từng dòng |
| T-13 — Bộ kiểm tra cấu trúc tệp trả về đủ danh sách lỗi kèm vị trí | S-06 | Tệp hỏng nhiều chỗ trả về đủ danh sách lỗi; tệp đúng trả về danh sách rỗng; có unit test cho từng loại lỗi | hàm thuần, không đụng cơ sở dữ liệu, để unit test chạy nhanh |
| T-14 — Màn hình tải lên hiện lỗi và xem trước lưới ghế | S-06 | Tải tệp hỏng thì thấy danh sách lỗi và nút xác nhận bị vô hiệu hoá; tệp đúng thì thấy lưới ghế và nạp được | xem trước không ghi gì vào cơ sở dữ liệu |
| T-15 — Cột trạng thái suất diễn kèm migration và luật chuyển trạng thái | S-07 | Chuyển nháp sang đang bán khi chưa có ghế thì hàm từ chối; test phủ mọi cặp chuyển hợp lệ và không hợp lệ | giá trị trạng thái là kiểu liệt kê ở cơ sở dữ liệu, không phải chuỗi tự do |
| T-16 — Nút mở bán và đóng bán trên màn hình suất diễn | S-07 | Bấm mở bán khi đủ điều kiện thì nhãn đổi ngay; khi chưa có sơ đồ thì nút mờ và hiện lý do | thao tác đổi trạng thái yêu cầu vai trò ban tổ chức sở hữu sự kiện |
| T-17 — Truy vấn suất diễn đang mở bán có phân trang | S-08 | Chỉ trả về suất đang bán; trang thứ hai không lặp và không sót so với trang đầu; đo dưới 500ms với 200 suất | không lộ trường nội bộ như chủ sở hữu hay ghi chú |
| T-18 — Trang danh sách sự kiện và trang chi tiết suất diễn | S-08 | Vào từ trang chủ tới trang chọn ghế không quá 2 lần bấm; suất không mở bán hiện thông báo thay vì lỗi | trang chi tiết có thẻ mô tả để chia sẻ được đường dẫn trên mạng xã hội |
| T-19 — Truy vấn trạng thái ghế theo suất diễn trong một lần gọi | S-09 | Trả về đúng ba trạng thái; chạy dưới 200ms với 2000 ghế | không dùng vòng lặp gọi truy vấn con cho từng ghế |
| T-20 — Vẽ sơ đồ ghế trên trình duyệt kèm màu và ký hiệu trạng thái | S-09 | Sơ đồ 2000 ghế cuộn và phóng mượt trên máy tính lẫn điện thoại; bấm vào ghế đã bán thì không có tác dụng | phân biệt trạng thái không chỉ bằng màu, thêm ký hiệu để người mù màu vẫn dùng được |
| T-21 — Tệp mẫu 2000 ghế và phép đo thời gian hiển thị | S-09 | Tệp mẫu nạp được bằng S-05; con số đo dưới 2 giây và có trong README | script sinh tệp chạy lại được với số ghế tuỳ chọn |
| T-22 — Bảng `seat_holds` có thời điểm hết hạn kèm migration | S-10 | Migration tiến và lùi được; có chỉ mục trên thời điểm hết hạn để job dọn quét nhanh; T-19 hiện đúng ghế đang giữ | thời điểm hết hạn lưu ở UTC |
| T-23 — API giữ ghế trả về thời điểm hết hạn | S-10 | Giữ ghế trống thì thành công kèm thời điểm hết hạn; suất đã đóng thì trả 409; ghế thứ hai trả về cùng thời hạn với ghế đầu | giữ nhiều ghế là một giao dịch — hoặc giữ hết, hoặc không giữ ghế nào |
| T-24 — Đồng hồ đếm ngược trên giao diện chọn ghế | S-10 | Đồng hồ khớp với máy chủ kể cả khi chỉnh sai giờ máy người dùng; về 0 thì sơ đồ tự cập nhật và ghế mất trạng thái đang giữ | không tin đồng hồ máy khách — lệch giờ máy người dùng không được làm sai kết quả |
| T-25 — API huỷ giữ chỗ của chính mình | S-11 | Huỷ ghế mình giữ thì bản ghi biến mất; huỷ ghế người khác thì 403; huỷ ghế không ai giữ thì 404 | kiểm quyền sở hữu trong cùng câu lệnh xoá, không kiểm rồi mới xoá |
| T-26 — Nút bỏ chọn trên sơ đồ và cập nhật trạng thái tại chỗ | S-11 | Bỏ chọn xong thì ghế đổi màu tại chỗ và tổng tiền tạm tính cập nhật | thao tác chỉ gọi một yêu cầu mạng |
| T-27 — Job nền quét và nhả ghế quá hạn, chạy lặp lại được | S-12 | Tạo giữ chỗ quá hạn thủ công rồi chạy job thì ghế trở lại trống; chạy job hai lần liên tiếp không gây lỗi; log ghi số bản ghi đã dọn | job ghi log số bản ghi đã dọn mỗi lần chạy để theo dõi được |
| T-28 — Truy vấn ghế trống loại trừ giữ chỗ đã hết hạn dù job chưa chạy | S-12 | Giữ chỗ quá hạn nhưng chưa bị job dọn thì ghế vẫn hiện là trống; test dùng thời điểm giả để không phải chờ thật | so sánh thời gian thực hiện ở máy chủ cơ sở dữ liệu, không ở tầng ứng dụng |
| T-29 — Ràng buộc ở tầng cơ sở dữ liệu chặn hai giữ chỗ cùng ghế còn hiệu lực | S-13 | Chèn thủ công hai bản ghi giữ chỗ cùng ghế bằng SQL thì bản thứ hai bị từ chối; bản cũ đã hết hạn thì bản mới chèn được | ràng buộc phải đúng cả khi giữ chỗ cũ đã hết hạn — hết hạn thì không tính là còn hiệu lực |
| T-30 — Đổi lỗi vi phạm ràng buộc thành phản hồi 409 kèm danh sách ghế bị từ chối | S-13 | Giữ ghế đã có người thì nhận 409 kèm danh sách ghế bị từ chối, không phải 500; log ghi mỗi lần tranh chấp | không nuốt lỗi — mọi lần từ chối đều ghi log để đếm được tần suất tranh chấp |
| T-31 — Kịch bản kiểm thử bắn 200 yêu cầu đồng thời vào 100 ghế | S-13 | Chạy kịch bản trên staging cho ra đúng 100 thành công; chạy lại 10 lần vẫn ra 100; CI đỏ nếu ra số khác | kịch bản chạy được trong CI để lần sau sửa mã còn biết có phá vỡ bảo đảm không |
| T-32 — API trả về giữ chỗ còn hiệu lực của người dùng trong một suất diễn | S-14 | Trả về đúng ghế đang giữ và thời hạn; giữ chỗ đã hết hạn không xuất hiện | chỉ trả về giữ chỗ của chính người gọi |
| T-33 — Trang chọn ghế khôi phục ghế đang giữ và đồng hồ khi mở lại | S-14 | Tải lại trang giữa chừng thì ghế và đồng hồ đúng như trước khi tải lại | không lưu danh sách ghế đã chọn ở bộ nhớ trình duyệt |
| T-34 — Cột giá trên `seat_categories` kèm migration | S-15 | Migration tiến và lùi được; mở bán khi còn hạng chưa có giá thì hàm ở T-15 từ chối kèm tên hạng | không dùng kiểu số thực cho tiền |
| T-35 — Màn hình đặt giá và hiện giá trên sơ đồ ghế | S-15 | Lưu giá xong thì sơ đồ hiện đúng giá; giá âm bị chặn tại ô | định dạng tiền theo kiểu Việt Nam, có dấu chấm ngăn hàng nghìn |
| T-36 — Bảng `orders` và `order_items` kèm migration | S-16 | Migration tiến và lùi được; mỗi ghế chỉ được nằm trong một đơn chưa huỷ của cùng suất diễn — có ràng buộc | giá trên dòng đơn là bản sao tại thời điểm đặt, không tham chiếu giá hiện tại |
| T-37 — API tạo đơn từ giữ chỗ và gia hạn giữ chỗ theo thời hạn thanh toán | S-16 | Tạo đơn thành công với đúng ghế và tổng; gọi hai lần liền thì lần hai trả về đơn đã có; giữ chỗ hết hạn thì 409 kèm ghế đã mất | không nhận danh sách ghế từ trình duyệt — đọc từ giữ chỗ trong cơ sở dữ liệu |
| T-38 — Tính tổng tiền ở máy chủ từ giá hạng ghế, không tin số từ trình duyệt | S-17 | Tổng luôn bằng tổng giá dòng đơn; gửi tổng giả lên API thì bị bỏ qua | hàm thuần, không đụng cơ sở dữ liệu |
| T-39 — Trang tóm tắt đơn: ghế, hạng, đơn giá, tổng tiền, thời gian còn lại | S-17 | Thấy đủ thông tin; hết hạn thì nút thanh toán ẩn; mở đơn người khác thì 403 | không hiện thông tin thanh toán nhạy cảm |
| T-40 — Bọc cổng thanh toán sau một interface để đổi nhà cung cấp được | S-18 | Đổi cấu hình sang một bản cài khác thì mã nghiệp vụ không phải sửa dòng nào; có test giả lập interface | khoá và bí mật của cổng đọc từ biến môi trường |
| T-41 — Tạo yêu cầu thanh toán và chuyển hướng sang cổng sandbox | S-18 | Bấm thanh toán thì tới trang cổng với đúng số tiền; đơn hết hạn thì 409 | mỗi lần bấm thanh toán lại dùng cùng mã đơn để cổng không tạo hai giao dịch |
| T-42 — Nhận kết quả trả về, đổi trạng thái đơn và ghế trong một giao dịch | S-18 | Kết quả thành công thì đơn, ghế, giữ chỗ đổi cùng lúc; số tiền lệch thì đơn sang trạng thái cần kiểm tra và không có vé | không tin trang quay về — trạng thái cuối chỉ đổi khi có xác nhận từ máy chủ cổng |
| T-43 — Trang giả lập cổng có nút thanh toán thành công và thất bại | S-19 | Luồng đặt vé chạy đầu-cuối bằng cổng giả lập; nút thất bại cho ra đúng hành vi của S-24 | trang giả lập chỉ tồn tại khi cấu hình bật, không có trong bản production |
| T-44 — Chọn cổng thật hay giả lập bằng biến môi trường | S-19 | Đổi biến rồi khởi động lại là đổi cổng; production cấu hình sai thì không khởi động được | giá trị mặc định ở staging là giả lập cho tới khi có sandbox |
| T-45 — Bảng `payment_events` lưu mã giao dịch với ràng buộc unique | S-20 | Chèn hai bản ghi cùng mã giao dịch thì bản thứ hai bị từ chối | nội dung thô lưu nguyên để đối soát, nhưng không chứa số thẻ |
| T-46 — Xử lý webhook: bỏ qua mã đã có, khoá theo mã giao dịch khi xử lý song song | S-20 | Gửi lại 5 lần chỉ một lần chạy T-42; hai bản sao đồng thời không gây 500; webhook cho đơn đã hết hạn đánh dấu đơn cần kiểm tra | trả 200 cho webhook trùng để cổng ngừng gửi lại |
| T-47 — Kịch bản gửi lại cùng một webhook 5 lần và đếm số vé sinh ra | S-20 | Cả hai kiểu gửi đều cho một bản ghi và một bộ vé; CI đỏ nếu khác | test dùng cổng giả lập ở T-43 để ký webhook |
| T-48 — Kiểm chữ ký webhook trước khi đọc nội dung | S-21 | Webhook sửa một ký tự nội dung thì bị 401; webhook đúng thì đi tiếp | so sánh chữ ký bằng hàm so sánh thời gian không đổi |
| T-49 — Ghi log lần từ chối kèm địa chỉ nguồn | S-21 | Gửi webhook giả thì thấy dòng log tương ứng; log không chứa nội dung thanh toán | log có cấu trúc để lọc được theo mã lỗi |
| T-50 — API trạng thái đơn để trình duyệt hỏi lại định kỳ | S-22 | Trả về trạng thái hiện tại; đơn người khác thì 403; phản hồi dưới 100ms | không cache để trạng thái luôn mới |
| T-51 — Trang kết quả hiện "đang xác nhận" cho tới khi có kết quả thật | S-22 | Ba trạng thái hiện đúng: đang xác nhận, đã trả, hết thời gian chờ; sửa tham số đường dẫn không đổi kết quả | dừng hỏi lại khi người dùng rời trang |
| T-52 — Job huỷ đơn quá hạn và nhả ghế trong một giao dịch | S-23 | Đơn quá hạn được huỷ và ghế trống; chạy hai lần không lỗi; log ghi số đơn đã huỷ | khoá dòng đơn khi xử lý để không đua với webhook |
| T-53 — Test chứng minh đơn đã thanh toán không bị job đụng tới | S-23 | Ba đơn cho kết quả đúng; ca đua luôn kết thúc ở một trong hai trạng thái hợp lệ | test dùng thời điểm giả, không chờ thật |
| T-54 — Nhận kết quả thất bại từ cổng và giữ nguyên trạng thái chờ | S-24 | Kết quả thất bại thì đơn vẫn chờ, giữ chỗ còn nguyên; test với cổng giả lập ở T-43 | không đổi bất kỳ trạng thái nào ngoài ghi nhận sự kiện |
| T-55 — Nút thanh toán lại trên trang đơn hàng | S-24 | Thất bại rồi bấm lại thì tới cổng với cùng mã đơn; hết hạn thì nút ẩn | không tạo yêu cầu thanh toán mới khi yêu cầu cũ còn đang xử lý |

## 14. Các hành trình tích hợp và chức năng bổ sung

Các case này kiểm tương tác giữa module, bổ sung cho AC gốc. Nhãn P0/P1 ở đây là ưu tiên chạy do kế hoạch đề xuất, không thay Must/Should/Could trong Excel.

### INT-01 — Mua vé đầu-cuối từ khách mới

Dữ liệu: F01–F05; SMTP catcher

1. Organizer A tạo event draft, suất tương lai, import 6 ghế/3 hạng, đặt giá và mở bán; công bố nếu ứng dụng yêu cầu.
2. Ẩn danh tìm suất ở catalog, xem chi tiết; đăng ký tài khoản mới, kích hoạt từ catcher và đăng nhập.
3. Chọn VIP A1 và STD A2, kiểm TTL; tạo order, so tổng 300.000 đồng; chọn mock thành công.
4. Chờ server PAID; mở 2 vé, tải QR và xem email; STAFF được gán cửa A quét một vé.
5. Mở lịch sử, vé và báo cáo organizer; đối chiếu toàn bộ ID và số liệu.

Mong đợi:

- Đúng 1 order, 2 dòng/2 vé riêng, tổng 300000 VND, ghế SOLD, không còn hold của order, email đúng QR, 1 admission NORMAL.
- Không phải tạo/sửa dữ liệu bằng SQL để vượt bước UI bị hỏng.

Liên quan: S-03, S-04, S-05, S-07, S-08, S-10, S-16, S-18, S-25, S-27, S-30, S-32, S-50. Trạng thái ban đầu: `NOT_RUN`.

### INT-02 — Thất bại, retry và webhook đến sau browser

Dữ liệu: Order 2 ghế; catcher

1. Bấm mock thất bại, kiểm pending/hold/TTL không đổi.
2. Retry cùng order, tắt tab sau trả tiền; webhook tới khi browser đóng.
3. Mở lại lịch sử; gửi lại webhook 5 lần và 2 bản đồng thời.

Mong đợi:

- Một payment thành công hiệu lực và một bộ vé; không order mới, không nhân email job do webhook replay.

Liên quan: S-18, S-20, S-24, S-25. Trạng thái ban đầu: `NOT_RUN`.

### INT-03 — 200 request tranh 100 ghế, 10 vòng

Dữ liệu: 100 ghế/vòng mới, 200 buyer hoặc session theo luật, quota không gây nhiễu

1. Tạo đúng hai contender/ghế, barrier cùng thời điểm, phát 200 request; không dùng 200 lần await tuần tự.
2. Lưu status/body/latency từng request, đếm DB hold còn hiệu lực và audit conflict.
3. Lặp 10 vòng độc lập; kiểm ràng buộc SQL trực tiếp trong DB thử.

Mong đợi:

- Mỗi vòng chính xác 100 thắng/100 conflict, không 500 và không ghế có hai chủ.
- Nếu gặp 429/admission rejection, fixture không hợp lệ cho phép đo này; báo và chạy lại sau cấu hình thử, không tính là conflict ghế.

Liên quan: S-13, T-29, T-30, T-31. Trạng thái ban đầu: `NOT_RUN`.

### INT-04 — Webhook đua hết hạn đơn

Dữ liệu: Order sát deadline, clock/server barrier

1. Cho expiry worker và webhook hợp lệ bắt đầu cùng barrier trên cùng order.
2. Lặp 50 lần như mẫu kiểm kỹ thuật đề xuất, tách fixture mỗi lần; ghi tất cả outcome.
3. Sau mỗi vòng kiểm order/payment/ticket/seat/hold và dấu cần hoàn.

Mong đợi:

- Mỗi vòng rơi vào một trạng thái hợp lệ theo S-23; không PAID mà ghế FREE, không EXPIRED mà vé hợp lệ.
- 50 vòng là cỡ mẫu đề xuất của kế hoạch, không sửa AC gốc.

Liên quan: S-20, S-23. Trạng thái ban đầu: `NOT_RUN`.

### INT-05 — Hai máy quét online cùng vé

Dữ liệu: 2 context STAFF/cửa, 1 QR paid

1. Hai context quét tại barrier bằng requestId khác nhau.
2. Lặp request thắng với cùng requestId; quét lại ở cửa kia.
3. Thử override thiếu lý do/thiếu quyền rồi override hợp lệ.

Mong đợi:

- Một NORMAL; duplicate có first gate/time; replay không thêm admission; ngoại lệ có reason/staff riêng.

Liên quan: S-30, S-31. Trạng thái ban đầu: `NOT_RUN`.

### INT-06 — Hai cửa ngoại tuyến và đồng bộ đảo thứ tự

Dữ liệu: 2 context/IndexedDB riêng, cùng snapshot, T1<T2

1. Ngắt mạng cả hai, A quét T1 và B quét T2; đóng/mở browser A.
2. B online sync trước, A sync sau; so giờ/offset thiết bị.
3. Mở conflict/attendance report và kiểm bản ghi gốc không mất.

Mong đợi:

- Áp đúng luật AC S-36 hoặc báo sai khác với contract được duyệt; đầy đủ 2 cửa/2 thời điểm/offset và một khách duy nhất.

Liên quan: S-33, S-34, S-35, S-36, S-52. Trạng thái ban đầu: `NOT_RUN`.

### INT-07 — Queue sync không mất khi lỗi phản hồi

Dữ liệu: 40 scan, network fault injection

1. Lần lượt gây timeout sau commit server, offline giữa batch, 401, 403, 409 và 5xx.
2. Reload/đóng mở app rồi sync lại; đếm scanId ở IndexedDB và server.
3. Đổi account và quay lại account cũ, xác minh phạm vi queue.

Mong đợi:

- Chỉ xoá mục có ack bền; dữ liệu chưa ack còn phục hồi/retry được; server không ghi đôi và không trộn tài khoản.

Liên quan: S-34, S-35, S-37. Trạng thái ban đầu: `NOT_RUN`.

### INT-08 — Huỷ, hoàn, bán lại và QR cũ

Dữ liệu: Paid chưa check-in, suất >24h theo policy ứng viên; A/B

1. A xem preview, huỷ toàn order, worker hoàn mock; bắn hai cancel đồng thời.
2. B giữ và mua lại đúng ghế vừa nhả.
3. Quét QR cũ online/offline với cache cũ rồi sync; xem QR mới và báo cáo.

Mong đợi:

- Một refund hiệu lực theo policy; một chủ ghế hiện tại; QR cũ bị vô hiệu theo contract thu hồi; doanh thu gộp/ròng và audit đối soát được.

Liên quan: S-45, S-46, S-48, S-49, S-50. Trạng thái ban đầu: `NOT_RUN`.

### INT-09 — Huỷ suất theo lô và restart worker

Dữ liệu: N đơn paid/pending, 2 batch trở lên, 1 refund gây lỗi

1. Organizer huỷ suất; kiểm mua mới bị chặn ngay.
2. Dừng worker riêng sau một batch, restart rồi retry lô lỗi.
3. So tập order cần hoàn, số refund và email catcher; mở operations kế toán.

Mong đợi:

- Không bỏ/nhân refund, lỗi từng phần lộ rõ; mọi vé huỷ; thư không gửi tới khách thật.

Liên quan: S-47, S-48. Trạng thái ban đầu: `NOT_RUN`.

### INT-10 — Khóa/đổi vai trò khi session còn sống

Dữ liệu: Account phụ STAFF/BUYER có session trên 2 context

1. Admin đổi role và gọi API ngay trên hai session cũ.
2. Admin disable; gọi API/đăng nhập lại; thử queue offline sync.
3. Kiểm audit và sự cách ly queue thiết bị.

Mong đợi:

- Quyền cập nhật ở request tiếp theo; disabled không còn session hợp lệ; scan chưa sync không bị xoá âm thầm do 401/403.

Liên quan: S-02, S-28, S-35. Trạng thái ban đầu: `NOT_RUN`.

### INT-11 — Xoá dữ liệu nhưng giữ sổ giao dịch

Dữ liệu: Tài khoản giả có đơn/hoàn/email/token/reset/transfer

1. Lưu oracle số order, tiền, refund; gửi yêu cầu erasure rồi duyệt bằng ADMIN.
2. Tìm PII canary trên tất cả bảng/outbox/log/cached snapshot thuộc phạm vi đã chốt.
3. Thử session/token cũ và đối chiếu lại báo cáo tài chính.

Mong đợi:

- Không đăng nhập được, định danh đã ẩn danh ở phạm vi chốt; order/payment/totals giữ nguyên, không phát email tới định danh đã xoá.

Liên quan: S-53, S-54, S-49. Trạng thái ban đầu: `NOT_RUN`.

### INT-12 — Khởi động đúng source mới và nối module core

Dữ liệu: Fresh build từ working tree, profile thử

1. Lưu fingerprint trước build; khởi động dist vừa build, ghi PID/port/source.
2. Gọi forgot/reset/reschedule/operations-mail và publication bằng đúng method/role.
3. Đi từ login, event editor, showtime workspace và operations bằng nút nhìn thấy.

Mong đợi:

- Endpoint phải có thật và thực thi nghiệp vụ; route trả 404 hoặc nút không có được ghi lỗi tích hợp.
- HTTP 200 cho trang wrapper hoặc file component tồn tại không chứng minh chức năng đã nối.

Liên quan: EXT-RESET, EXT-PUBLISH, EXT-RESCHEDULE, EXT-MAIL, S-61. Trạng thái ban đầu: `NOT_RUN`.

### EXT-RESET-01 — Quên mật khẩu đúng luồng UI/API

Dữ liệu: Active+verified email; inactive/unverified/unknown; SMTP catcher

1. Từ login đi tới forgot; gửi email mới/đã có, kiểm phản hồi 202 chung.
2. Mở link reset mới, đặt mật khẩu 8 ký tự; login bằng mật khẩu mới.
3. Thử mật khẩu cũ, session cũ, token dùng lần hai, token hết 15 phút và token khác trước reset.

Mong đợi:

- Không dò được email; token một lần, hết hạn theo contract ứng viên; thu hồi session/token cũ; không tự login sau reset.

Liên quan: Chức năng bổ sung theo docs/CORE_COMPLETION_HANDOVER_20261022.md. Trạng thái ban đầu: `NOT_RUN`.

### EXT-RESET-02 — Biên và race reset mật khẩu

Dữ liệu: Token fixture, 2 requests cùng token, header IP giả

1. Thử password 7/8/1024/1025 ký tự; đồng thời reset cùng token.
2. Thử quota 3/email, 20/IP/15 phút và reset submit 20/IP/15 phút theo contract ứng viên.
3. Giả forwarded header; kiểm token chỉ lưu hash, log không có token/password; disable/erasure trước reset.

Mong đợi:

- Một reset thắng; inactive/erased không phục hồi; IP lấy từ transport được tin cậy; quota trước Argon2.

Liên quan: EXT-RESET. Trạng thái ban đầu: `NOT_RUN`.

### EXT-PUBLISH-01 — Công bố/ẩn có điều kiện và quyền sở hữu

Dữ liệu: Organizer A/B; event thiếu thông tin/map/giá, demo và hợp lệ

1. Thử công bố từng trường hợp thiếu điều kiện và bằng chủ khác.
2. Công bố hợp lệ; xem catalog/chi tiết/map bằng ẩn danh.
3. Ẩn event rồi gọi URL chi tiết/map/SSE trực tiếp; kiểm order/ticket/scanner vẫn theo quyền; replay publication.

Mong đợi:

- Chặn thiếu điều kiện; catalog phản ánh trong hợp đồng cache; event ẩn không lộ public; vé/đơn đã mua giữ nguyên; audit không nhân vì replay.

Liên quan: S-04, S-07, S-08, Chức năng publication mô tả trong handover. Trạng thái ban đầu: `NOT_RUN`.

### EXT-RESCHEDULE-01 — Đổi giờ giữ nguyên QR và hạn thanh toán

Dữ liệu: Suất tương lai có paid/pending, bản sao QR trước đổi, catcher

1. Organizer đổi startTime có timezone, reason 3–1000 ký tự, requestId UUID.
2. So showtime, schedule version/audit, order TTL, ghế và hash payload QR trước/sau.
3. Cùng requestId+cùng body retry rồi cùng ID+khác body; thử người khác, suất đã bắt đầu/huỷ/có admission.

Mong đợi:

- Giữ nguyên QR/ghế/TTL, email lịch mới; replay trả cũ, khác nội dung 409; các trạng thái cấm bị chặn.

Liên quan: S-61, EXT-RESCHEDULE. Trạng thái ban đầu: `NOT_RUN`.

### EXT-MAIL-01 — Admin xử lý mail lỗi và worker tắt

Dữ liệu: 55 mail hỗn hợp trạng thái/loại; ADMIN và BUYER; catcher

1. Mở operations/mail, lọc ALL/TICKET/REMINDER/RESCHEDULED và trạng thái; kiểm 20 dòng/trang, total, không trùng/sót.
2. Retry FAILED với requestId; replay; retry SENT/CANCELLED/đối tượng không còn hợp lệ.
3. Worker off phải báo queued/chưa gửi; bật worker fixture và gây crash quanh lease, retry SMTP; đối chiếu audit/lịch sử.

Mong đợi:

- Chỉ ADMIN; giữ job cũ và tạo lượt mới đúng contract; không nhận QUEUED là SENT; SMTP có thể gửi lặp trong crash window, không tuyên bố exactly-once inbox.

Liên quan: S-27, S-61, EXT-MAIL. Trạng thái ban đầu: `NOT_RUN`.

### INT-13 — Phân quyền mọi endpoint và mọi chủ sở hữu

Dữ liệu: Inventory runtime; ẩn danh+5 role; resource A/B

1. Mỗi METHOD+path chạy với anonymous, role đúng, role sai, chủ đúng và chủ khác.
2. Thử URL trực tiếp, web proxy /api và API direct; không dùng việc ẩn menu thay API guard.
3. Đối chiếu route public opt-in; thêm route test-only không có khai báo quyền trong app fixture.

Mong đợi:

- 401/403/404 theo hợp đồng đã chốt; no mutation khi bị từ chối; public chỉ đúng dữ liệu công khai; role thay đổi có hiệu lực tức thời.

Liên quan: S-02, S-04, S-17, S-28, S-32. Trạng thái ban đầu: `NOT_RUN`.

### INT-14 — Lỗi hạ tầng và phục hồi không làm hỏng tiền/ghế

Dữ liệu: DB/Redis/SMTP/gateway của profile thử riêng

1. Ngắt từng dependency trong lúc hold/order/payment/scan; timeout sau commit và restart app.
2. Retry cùng idempotency key; đọc lại state từ server.
3. Đối chiếu health, log redaction và job backlog phục hồi; chỉ dừng process/container của profile thử.

Mong đợi:

- Không ghi nửa giao dịch, không double-charge/double-ticket/double-admission; UI có lỗi/thử lại đúng, dữ liệu đã lưu không mất.

Liên quan: S-01, S-12, S-20, S-23, S-35. Trạng thái ban đầu: `NOT_RUN`.

### INT-15 — UI đầy đủ trạng thái trên desktop và mobile

Dữ liệu: 1440×900, 390×844, 360×800; route inventory; dữ liệu loading/empty/error/success

1. Đi lần lượt mọi trang theo từng role; kiểm hành động chính bằng bàn phím và chuột/chạm.
2. Giả response chậm/lỗi/rỗng; kiểm double-submit, focus/labels, menu, scroll bảng, zoom map, QR/camera.
3. Ghi screenshot/video và console/network error cho mỗi route/state quan trọng; browser bị chặn thì ghi BLOCKED.

Mong đợi:

- Không tràn ngang toàn trang/cắt nút, các trạng thái hiểu được, phân biệt màu+kí hiệu, focus dùng được; mỗi hành động có backend effect đúng.

Liên quan: T-10, T-14, T-18, T-20, T-24, T-35, S-30, S-38. Trạng thái ban đầu: `NOT_RUN`.

### INT-16 — Chuyển nhượng rồi đổi lịch/huỷ/erasure

Dữ liệu: Vé chuyển từ A sang B; QR cũ/mới; catcher

1. Chuyển nhượng A→B, sau đó đổi giờ hoặc huỷ suất.
2. Đối chiếu vé/người nhận hiện tại trong mail/reminder/reschedule, tài khoản và scanner.
3. Erasure A không làm lộ mail A hoặc xoá quyền B ngoài phạm vi chốt.

Mong đợi:

- Email và quyền vé đi theo người nhận hiện tại, QR cũ vô hiệu; số vé và tổng tiền không tăng do transfer/reschedule.

Liên quan: S-57, S-61, S-47, S-53. Trạng thái ban đầu: `NOT_RUN`.

### INT-17 — Bằng chứng restore đủ cả dữ liệu và khóa

Dữ liệu: Backup thử + key retained, app source rõ; kho ngoài host nếu có

1. Restore bản sao vào DB mới và cấu hình app cổng riêng.
2. Đăng nhập, đọc order lịch sử, tải vé và xác minh QR đã phát trước backup bằng public key lưu giữ.
3. Kiểm lịch chạy/retention/upload qua receiver ngoài máy; nếu chỉ local drill thì tách outcome.

Mong đợi:

- Khôi phục dữ liệu và xác minh vé cũ; thiếu encryption/signing key không được PASS; local restore không tự chứng minh backup off-host hàng ngày.

Liên quan: S-55, S-26. Trạng thái ban đầu: `NOT_RUN`.

## 15. Inventory trang cần duyệt trực tiếp

Inventory dưới đây lấy từ `apps/web/src/app/**/page.tsx`, chỉ là tuyến source. Kiểm runtime route thực và cả tuyến API proxy; dynamic params phải dùng ID fixture hợp lệ. Mỗi trang có kiểm vai trò, loading/empty/error/success, console và hành động chính theo INT-15.

- `/account` — `apps/web/src/app/account/page.tsx`
- `/account/privacy` — `apps/web/src/app/account/privacy/page.tsx`
- `/account/tickets` — `apps/web/src/app/account/tickets/page.tsx`
- `/activate` — `apps/web/src/app/activate/page.tsx`
- `/admin/users` — `apps/web/src/app/admin/users/page.tsx`
- `/check-in` — `apps/web/src/app/check-in/page.tsx`
- `/events/[id]` — `apps/web/src/app/events/[id]/page.tsx`
- `/events/new` — `apps/web/src/app/events/new/page.tsx`
- `/events` — `apps/web/src/app/events/page.tsx`
- `/forgot-password` — `apps/web/src/app/forgot-password/page.tsx`
- `/login` — `apps/web/src/app/login/page.tsx`
- `/mock-gateway/pay` — `apps/web/src/app/mock-gateway/pay/page.tsx`
- `/operations` — `apps/web/src/app/operations/page.tsx`
- `/orders/[id]` — `apps/web/src/app/orders/[id]/page.tsx`
- `/orders` — `apps/web/src/app/orders/page.tsx`
- `/` — `apps/web/src/app/page.tsx`
- `/payment/result/[orderId]` — `apps/web/src/app/payment/result/[orderId]/page.tsx`
- `/payment/result` — `apps/web/src/app/payment/result/page.tsx`
- `/privacy` — `apps/web/src/app/privacy/page.tsx`
- `/register` — `apps/web/src/app/register/page.tsx`
- `/resend-activation` — `apps/web/src/app/resend-activation/page.tsx`
- `/reset-password` — `apps/web/src/app/reset-password/page.tsx`
- `/scanner` — `apps/web/src/app/scanner/page.tsx`
- `/scanner/reports/[showtimeId]` — `apps/web/src/app/scanner/reports/[showtimeId]/page.tsx`
- `/scanner/snapshot` — `apps/web/src/app/scanner/snapshot/page.tsx`
- `/shows/[id]` — `apps/web/src/app/shows/[id]/page.tsx`
- `/shows/[id]/seats` — `apps/web/src/app/shows/[id]/seats/page.tsx`
- `/showtimes/[id]/[mode]` — `apps/web/src/app/showtimes/[id]/[mode]/page.tsx`

## 16. Mẫu báo cáo chatbot phải trả

```markdown
# Báo cáo kiểm thử Codegym
Run-id / thời gian / source fingerprint / workbook hash / môi trường:
Kết luận: Đạt phạm vi ... / Chưa đủ điều kiện nghiệm thu ...

| Nhóm/Tier | Tổng yêu cầu | Đã chạy | PASS | FAIL | BLOCKED | MISSING | NEEDS_DECISION | NOT_RUN |
|---|---:|---:|---:|---:|---:|---:|---:|---:|

## Lỗi cần xử lý
| Bug | Mức độ | Case/AC | Actual và bước tái hiện | Expected | Bằng chứng |
|---|---|---|---|---|---|

## Điều chưa thể kết luận
Nêu rõ sandbox provider / staging / thiết bị / camera / 4G / off-host / quyết định còn thiếu.

## Đối chiếu toàn vẹn và số đo
Ghế / tiền / vé / admission / queue; workload và số đo raw.

## Tái kiểm
Case fail nào được thử lại, source trước/sau, kết quả và regression.
```

Không có yêu cầu sửa mã trong lượt lập kế hoạch này. Bộ test tạo ra để giao chatbot chạy sau; mọi kết quả hiện là `NOT_RUN`.

## 17. Thông tin kiểm tra bộ kế hoạch

- Workbook SHA256: `7fa009f53a82d23786e95ce9bd0ecd5aed0c6968bdbb6358a36ee14a10dd9c18`.
- Source fingerprint tham chiếu: `e5af4cafc2b0d8bdd9b07a67e2bc46f17d69ff8448e4055340019b5c638f677a`; danh sách hash file trong JSON.
- Tổng **404 case** gồm AC/NFR backlog, task, epic, governance, sprint/product goal và hành trình bổ sung. Đây là số case thiết kế, không phải số test đã chạy hoặc số chức năng đã đạt.
- Mỗi ô AC/NFR không trống của Backlog, Tasks và Epics đã có mapping. Các tiêu chí nhiều mệnh đề cần tách thêm case con khi thực thi.
