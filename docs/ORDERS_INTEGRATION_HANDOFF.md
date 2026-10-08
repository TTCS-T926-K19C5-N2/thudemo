# Orders — bản sẵn sàng review sau S-32

Ngày 08/10/2026, giờ Việt Nam. Đã làm việc theo thứ tự dependency → contract/module → S-32 → regression. Đây là **bằng chứng local trước commit**, từ main mới. Người dùng đã cho phép commit/push/tạo PR; trạng thái Git/CI tiếp theo được ghi trong PR. Owner, Sprint, SP và AC của S-32 không thay đổi.

## Checkout và trạng thái đã xác minh

- Branch: `task/orders-integration-ready`; HEAD/base main **`de610b58ab065a22342ab18a49970626134197fd`**.
- Worktree: `D:\Development\03_Academic\Bán vé sự kiện có sơ đồ ghế\thudemo-orders-ready-20261008`.
- PR #47 đã **MERGED**, revision nguồn `dc47c016c081c1c84534ac8d2d3957e5cd59d434`. Không còn cần phát triển S-32 trên branch `test` chưa merge.
- PR #51 vẫn **OPEN**, revision mới `4cd96aaef2aed8099f777371dd3446adca76cebe`. Diff riêng so với main chỉ còn 2 file web; phần schema/API S-17 đã vào main qua các PR tích hợp khác. Không nhập lại schema/migration/Orders từ PR #51.
- Main hiện có S-19/20/21/22/23; giữ nguyên scheduler và luồng kết quả thanh toán của main khi hòa giải. Chưa gọi bản local này là code đã tích hợp vào main.
- Hai worktree S-32 cũ và checkout `thudemo` nhiều WIP không bị sửa. Checkpoint patch + SHA-256 nằm ngoài repo ở `../.codex-tmp/orders-priority-20261008/`; không đưa `.env`/secret vào checkpoint hoặc Git.

## 1. S-16 — sửa hạn gốc DEC-10

`createFromHold` vẫn là đường tạo đơn có khóa người mua, suất diễn, hold session và ghế trong transaction. Cả `POST /showtimes/:id/orders` và `POST /orders` dùng đường này.

- `paymentExpiresAt` và `expiresAt` lấy từ hold session đã khóa; bỏ `now + 10 minutes` và các UPDATE gia hạn hold/seat holds.
- Các ghế phải còn hợp lệ và cùng deadline với session; không nhận owner/price/deadline từ client.
- `seatIds` tùy chọn của route S-17 phải khớp đầy đủ tập ghế đã xác nhận; không tạo một đơn thứ hai hoặc một đường tạo bỏ khóa/idempotency.
- Retry trả lại đơn đang chờ, không đổi giá/deadline. Giá item/categoryName/tierName được snapshot khi tạo.
- Regression: `TC-S16-01`, `TC-S16-13`, retry và cạnh tranh trong 35 test S-15/S-16; API S-32 tạo đơn thật qua holds rồi đọc/pay/callback sau thay giá.

## 2. S-17/#51 — thống nhất Orders và xử lý CI

- Một model Orders, một transaction creator; `OrdersService.createOrder` validate input rồi gọi `createFromHold`.
- `getOrderById` và `current` cùng gọi `OrderHistoryService.current`, chỉ đọc và kiểm quyền trước dữ liệu. Route status dùng reader nhẹ riêng trong cùng service, không tải ghế/event/all payment attempts.
- Chi tiết giữ shape phẳng của S-17 và shape `order` của S-16/S-32; giữ event/showtime/items/serverTime/remainingSeconds/isExpired. `latestPayment` chỉ gồm id/status/attemptNo để tương thích S-22; không trả payload, token hoặc thông tin giao dịch nhạy cảm.
- `OrderReview` trở thành wrapper của `OrderDetail` V1; giữ callback `onPay` và hành động thanh toán thực sự đã có trên main, chỉ hiện khi PENDING/PENDING_PAYMENT còn hạn.
- CI #51 run `37619912035` đỏ do TS2367: so `PENDING_PAYMENT` với kiểu decoder đã normalize về PENDING. Bản local dùng cùng contract V1 hỗ trợ hai trạng thái. Run test của #51 cũng có catalog fixture ordering fail; suite local chạy tuần tự theo convention hiện có và PASS. Đây là chẩn đoán CI cũ, **không tuyên bố CI #51 hoặc CI của diff mới đã xanh**.
- Không push vào branch của tác giả #51, không đóng/merge PR hoặc gán review cho người khác. Lead/tác giả cần chọn cập nhật/rebase/đóng PR redundant sau review thực sự.

## 3. Tương thích luồng thanh toán hiện có

- Initiation **và webhook amount validation** dùng `orders.totalAmount` đã lưu, tránh thu/đối chiếu giá category hiện tại sau khi đổi giá. Giữ nguyên atomic status/deadline guard và nhánh hết hạn S-23 của main.
- GET history/detail/status không khởi tạo payment, không chuyển trạng thái, không gia hạn hoặc nhả giữ chỗ. S-23 scheduler chỉ hoạt động theo cấu hình riêng, không bị loại khỏi module/worker.
- Lỗi phát hiện bằng browser: trang `/mock-gateway/pay` bỏ qua `API_INTERNAL_URL`, fetch cổng 3001 nên 404 ở cổng riêng. Đã ưu tiên biến server này và dùng `upstreamUrl` hiện có để validate origin; không đưa credentials server vào biến public.
- E2E mở cổng mock xác nhận amount 500k dù giá live 900k, payment INITIATED và order/hold không đổi. API callback ký bằng key synthetic local xác nhận đơn 320k thành PAID dù giá live 999999, deadline không đổi.
- Không gọi provider thật/thu tiền thật. Không dùng proof mock làm bằng chứng sandbox, vé/QR, staging hoặc production.

## 4. S-32 trên main mới

Ba AC và NFR vẫn giữ nguyên. API list áp owner where/orderBy/take/skip trong PostgreSQL; default10/max50, stable createdAt/id DESC. Detail/status của buyer khác trả 403, không content. Trạng thái PENDING legacy và PENDING_PAYMENT dùng `isOrderExpired` chung; giữ CANCELLED/EXPIRED/NEEDS_REVIEW trong lịch sử, tổng lấy dữ liệu đơn.

V1 giữ PublicLayout, token primary/background, Geist, UI primitives, formatter chung. Có history URL page, detail/back/login continuation, desktop table/mobile cards, loading/error/retry/empty, keyboard/focus, abort/revalidate khi đổi phiên/cross-tab. Không dùng Afterglow V2.

Migration mới: `202610080001_order_history_index`, index `(userId,createdAt DESC,id DESC)`. Chỉ migration này thuộc bản trên main mới; không đưa index `202610070002_order_history_index` từ worktree cũ vào cùng PR. Không sửa migration đã áp dụng hoặc db push/reset. 18 migration đã deploy trên PostgreSQL riêng15434; shared/staging migration cần gate riêng và review lock/write impact.

## 5. Verification và phạm vi còn lại

Chi tiết AC/test/log/ảnh: [S32_EVIDENCE.md](S32_EVIDENCE.md). Kết quả cuối: 180 unit, 102 integration, 33 browser history + 2 payment continuation; format/lint/typecheck/build PASS. Warnings và failed attempts được giữ, không tắt check/test.

- **Local**: VERIFIED cho bản trên base main nêu trên.
- **Git main**: S-16/dependency đã có; bản sửa và S-32 ở worktree local chưa tích hợp.
- **CI diff mới**: chưa có, vì chưa commit/push.
- Job CI test khai báo `S32_ISOLATED_TEST=true`, `HOLD_EXPIRY_MODE=off`, `ORDER_EXPIRY_MODE=off` cho database riêng `15432/sprint2_integration`, giống guard và cấu hình đã kiểm local. Không bỏ test hoặc sửa guard để chạy trên shared database.
- **Review độc lập**: chưa có; phần review hiện tại do Codex thực hiện, không phải approval của thành viên nhóm.
- **Staging/shared DB/load/production**: chưa kiểm/deploy. Không tự sửa database đang dùng hoặc môi trường remote.

## Gói review và PR đề xuất

`evidence/orders-integration/20261008/source-files.txt` ghi file mới/sửa/xóa thuộc bản này; `review.patch` là snapshot source + tài liệu trước commit, kể cả file chưa theo dõi. Logs/screenshots/JSON nằm riêng cùng thư mục evidence; các `.log` trong gói này được chọn rõ khi stage, không thay ignore rule toàn dự án. `final-summary.json` ghi kết quả tại thời điểm trước commit, không phải trạng thái Git/CI sau khi mở PR.

PR title đề xuất: **`fix(orders): preserve hold deadline and integrate buyer history with V1`**.

PR body đề xuất:

> Tạo đơn hiện gia hạn giữ chỗ và tồn tại hai đường tạo/read Orders từ S-16/S-17. Bản sửa dùng transaction creator chung, giữ deadline gốc DEC-10 và amount snapshot qua payment initiation/webhook; thêm lịch sử riêng phân trang server, detail/status trả đúng 403 cho buyer khác và giữ đơn hủy/hết hạn. UI giữ V1 và luồng payment đã có; sửa mock gateway page lấy đúng API origin.
>
> Validation trên base main de610b58: format/lint/typecheck/build; 180 unit, 102 integration (24 S-32,35 S-15/S-16 và regressions S-17/S-19–23),33 browser history +2 mở mock gateway desktop/mobile. Migration chỉ thêm index lịch sử. Evidence: docs/S32_EVIDENCE.md. Chưa có CI/staging của diff mới, không có sandbox/tiền thật.

Reviewer đề xuất, chưa request: maintainer S-16/Orders kiểm transaction/deadline/schema; reviewer độc lập auth/payment kiểm owner/cache/snapshot; Lead/PO kiểm scope/V1 và chọn cách xử lý #51. Owner S-32 vẫn chưa phân.

Thứ tự tiếp theo khi được phép thao tác Git: review diff cụ thể → commit đúng scope → push branch riêng và tạo PR → CI đúng SHA → review độc lập → merge thông thường → kiểm lại trên main → migration/staging/deploy theo gate riêng. Không force-push, quay tài khoản hoặc tự dựng approval của người khác.
