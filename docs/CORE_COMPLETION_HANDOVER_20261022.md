# Bàn giao các chức năng cốt lõi — 22/10/2026

## Kết quả và phạm vi

Đã triển khai công bố/ẩn sự kiện, thông báo nhắc và đổi giờ có SMTP outbox, đổi lịch giữ nguyên QR, quên/đặt lại mật khẩu và màn hình ADMIN xử lý email lỗi. Không mở rộng tìm kiếm/lọc, thanh toán thật, backup ngoài máy hoặc viết lại thông báo riêng tư.

Baseline source: `9d450ee`. Working tree ban đầu sạch; không commit/push trong lượt triển khai. Database trước và sau migration: **40 sự kiện, 40 suất, 5.544 ghế, 9 người dùng**. Số người dùng9 là dữ liệu thực tế lúc bắt đầu đợt này, không phải số8 trong báo cáo cũ.

Backup trước thay đổi: `.cache/core-completion/before-core.dump`. Migration `202610220004_core_completion` bổ sung phiên bản lịch, lịch sử đổi giờ, notification outbox, token/outbox reset và lịch sử gửi lại; không reset/seed. `.env` và khoá QR không bị thay đổi. Main outbox thông báo/reset mới đều có0 bản ghi tại kiểm tra triển khai; bộ kiểm thử dùng DBclone và SMTP catcher.

## Chức năng và API

| API | Quyền / hành vi |
|---|---|
| `PATCH /events/:id/publication` | ORGANIZER sở hữu; body `status: PUBLISHED/DRAFT`. Công bố cần thông tin đầy đủ và suất tương lai ON_SALE, đủ ghế/giá, không phải demo tham khảo. Audit và catalog revision cùng transaction. |
| `POST /showtimes/:id/reschedule` | ORGANIZER sở hữu; `startTime` ISO có timezone, `reason`3–1000 ký tự, `requestId`UUID. Chặn đã bắt đầu, đã huỷ hoặc có admission. Giữ nguyên vé/QR/ghế, không kéo dài hạn thanh toán. Request trùng nội dung trả kết quả cũ, khác nội dung trả409. |
| `POST /auth/forgot-password` | Public, phản hồi202 chung. Ba yêu cầu/email và20/IP trong15phút. Chỉ tài khoản active+verified nhận token. IP từ socket hoặc chứng thực transport; bỏ qua forwarded header do client tự đặt. |
| `POST /auth/reset-password` | Public; body token+password. Token32byte ngẫu nhiên, hạn15phút, một lần. Mật khẩu8–1024ký tự, Argon2id; thu hồi phiên cũ và token còn lại. Không tự đăng nhập. Thêm giới hạn20 lần submit/IP/15phút trước Argon2. |
| `GET /operations/mail` | ADMIN; `page`, `kind=ALL/TICKET/REMINDER/RESCHEDULED`, `status=FAILED/QUEUED/SENDING/SENT/CANCELLED/ALL`.20 bản ghi/trang, có tổng và trạng thái worker. |
| `POST /operations/mail/retry` | ADMIN; `id`, `kind`, `requestId`. Chỉ FAILED còn người nhận/vé hợp lệ; tạo lượt mới, giữ lịch sử và audit. Replay trả trạng thái hiện tại của công việc đã tạo. |

Trang chỉnh sửa sự kiện có **Công bố sự kiện / Ẩn sự kiện**. Trang quản lý suất có **Đổi giờ diễn**. Đăng nhập có **Quên mật khẩu?**; hai trang `/forgot-password`, `/reset-password`. ADMIN mở `/operations` để xem **Email gửi lỗi**.

Ẩn sự kiện chặn cả trang chi tiết và sơ đồ ghế công khai qua URL trực tiếp; giữ đơn/vé/soát vé đã phân quyền. Đóng bán không đồng nghĩa huỷ: suất đóng bán nhưng chưa huỷ/vào cửa vẫn được đổi giờ nếu còn tương lai.

## Email, token và worker

Thông báo được nhóm theo đơn/người nhận hiện tại/phiên bản lịch. Không lưu email người nhận trong job; kiểm lại ownership và tài khoản trước SMTP. QR dùng cùng định dạng canonical của trang vé. Có trạng thái QUEUED/SENDING/SENT/FAILED/CANCELLED, lease60s, tối đa3attempt, backoff5s/15s. SENT chỉ sau khi SMTP chấp nhận; không chứng minh Gmail Inbox. Huỷ đơn, đổi lịch và ẩn danh vô hiệu hoá công việc không còn hợp lệ. Worker cũ chỉ ghi log đã được gỡ khỏi provider hoạt động.

Token reset lưu hash; token chờ gửi được AES-GCM mã hoá bằng cơ chế khoá activation hiện có, xoá ciphertext sau gửi/tiêu thụ/hết hạn. Link dùng fragment `#token=...`, không gửi token trong URL HTTP. Trang reset bỏ token khỏi thanh địa chỉ sau khi đọc, không lưu localStorage, có `Referrer-Policy: no-referrer` và `Cache-Control: no-store`.

| Biến | Mặc định / ghi chú |
|---|---|
| `NOTIFICATION_MAIL_WORKER` | **Tắt**, chỉ bật khi bằng `true`; áp dụng nhắc/đổi giờ. Đang giữ tắt trên main. |
| `PASSWORD_RESET_WORKER` | Chạy trừ khi bằng `false`; còn phụ thuộc `REGISTRATION_DELIVERY_MODE` không phải `off`. Chỉ gửi khi có yêu cầu mới, không quét người dùng để phát thư. |
| `TICKET_MAIL_WORKER` | Giữ cấu hình hiện hữu; không thay worker phát vé sau thanh toán. |
| `REGISTRATION_MAIL_KEY`, `REGISTRATION_PUBLIC_ORIGIN`, SMTP | Tái sử dụng cấu hình hiện hữu; không in hoặc lưu secret vào tài liệu. |

Muốn bật nhắc/đổi giờ: dừng API đang chạy, tại `apps/api` mở PowerShell và chạy:

```powershell
$env:NOTIFICATION_MAIL_WORKER='true'
node --env-file=../../.env dist/main.js
```

Biến môi trường tiến trình ưu tiên hơn file env; không cần sửa `.env`. Bật worker sẽ xử lý job QUEUED còn hợp lệ và xếp nhắc cho suất tương lai trong24h. Không phát lại thông báo của suất đã qua. Kiểm tra backlog và đúng SMTP trước khi bật. Muốn tắt, khởi động API với biến bằng `false`; không chạy hai API cùng cổng.

SMTP không cung cấp transaction chung với PostgreSQL: nếu tiến trình chết ngay sau SMTP nhận thư nhưng trước commit, có thể có thư lặp khi retry. Message-ID ổn định theo job, idempotency và lease giới hạn rủi ro, không được tuyên bố exactly-once ở hộp thư.

## Kiểm thử và bằng chứng

| Nhóm | Kết quả | Bằng chứng |
|---|---|---|
| Baseline API |414PASS | `.cache/core-baseline-api.log` |
| Baseline web |149PASS/1FAIL | `.cache/core-baseline-web.log` |
| API sau sửa |432PASS/54files | `.cache/core-api-tests.log` |
| Web sau sửa |156PASS/26files | `.cache/core-web-tests.log` |
| E2E hồi quy |139PASS/20files | `.cache/sprint4-8-evidence/20261022/full-e2e.log` |
| Core API+SMTP catcher |23PASS/0FAIL | `.cache/core-completion/results.json` |
| Typecheck/lint |PASS; cảnh báo lint hiện hữu | `.cache/core-typecheck-final.log`, `.cache/core-lint-final.log` |
| API/web build |PASS | `.cache/core-build.log`, `.cache/core-web-build.log` |
| Main smoke HTTP |APIok; catalog40; `/`, `/forgot-password`, `/reset-password`HTTP200 | terminal smoke sau restart |

Các ca core gồm owner/RBAC, điều kiện công bố, URL ẩn404, QR giữ nguyên, email đủ3PNG, retry3lần, pagination55email, token cũ/hết hạn/đồng thời, thu hồi phiên, disabled không được phục hồi, quota/peer giả, privacy erasure và lease gián đoạn.

**Chưa nghiệm thu trực quan desktop/mobile bằng browser:** origin gate từ chối `localhost:3400`; sau người dùng cấp lại quyền, thiết lập quyền đã lưu vẫn chặn. Không dùng công cụ khác để vượt chặn. Component test và HTTP smoke không thay thế kiểm tra trực quan. Cần người dùng gỡ chặn hoặc nghiệm thu thủ công theo hướng dẫn dưới đây.

Các lỗi nền đã sửa trong phạm vi hồi quy: schema/contract thiếu `isDemo`, STAFF bị returnTo đưa tới trang tổ chức, `SeatEventsService` thiếu provider chung khiến API mới không khởi động. Fixture public được đặt PUBLISHED và guard test mới dùng opt-in DBclone có bảo vệ thay vì bỏ kiểm tra database. Cache CSS dev đã tạo lại sau khi loại artifact `.next-core-*` khỏi Git/Tailwind/lint.

Chạy lại:

```powershell
# Thư mục gốc Codegym
pnpm --filter api build
pnpm --filter api test -- --maxWorkers=1
pnpm --filter web test -- --maxWorkers=1
pnpm typecheck
pnpm lint
node --env-file=.env apps/api/scripts/verify-core-completion.mjs

# Tại apps/api
node --env-file=../../.env scripts/run-isolated-e2e.mjs
```

Script core yêu cầu backup `.cache/core-completion/before-core.dump`, tạo DB `codegym_core_*`, RedisDB14 và SMTP catcher. Script E2E tạo DB `codegym_e2e_*`, RedisDB15; worker thư tắt. Không trỏ bài ghi dữ liệu vào main. Database kiểm thử giữ lại để đối chiếu; không tự drop dữ liệu người dùng.

## Một lượt nghiệm thu thủ công

1. Dùng tài khoản ORGANIZER, vào `/events`, tạo sự kiện thử và suất tương lai; nạp sơ đồ, đặt giá và mở bán. Bấm Công bố khi thiếu điều kiện phải báo lỗi; đủ điều kiện thì xuất hiện ngoài trang chủ.
2. BUYER mua3ghế, thanh toán mock và lưu QR. Đơn PAID có3vé, email vé dùng worker cũ hiện hữu.
3. Trong môi trường catcher bật worker thông báo; dùng suất còn trong24h để kiểm thư nhắc đủ3QR. Không chỉnh giờ40suất thật chỉ để thử scheduler.
4. ORGANIZER mở quản lý suất, nhập giờ Việt Nam mới, lý do và xác nhận. Kết quả phải là cập nhật lịch + QUEUED; QR cũ giữ nguyên. Worker tắt phải có thông báo thư chưa gửi.
5. Bấm Ẩn sự kiện sau khi xác nhận. Trang công khai/URL sơ đồ bị404, nhưng đơn/vé người mua còn nguyên; công bố lại để tiếp tục.
6. Ở trang đăng nhập chọn Quên mật khẩu, nhập email đã kích hoạt. Mở link nhận được, nhập mật khẩu mới và xác nhận. Link dùng lần hai phải lỗi; phiên cũ hết hiệu lực, mật khẩu cũ không đăng nhập được.
7. ADMIN mở `/operations`, lọc FAILED theo loại, đi trang tiếp theo; chọn thư, xác nhận Thử gửi lại. Job mới có trạng thái QUEUED/SENT theo worker, job lỗi cũ vẫn còn.
8. Kiểm tra desktop và mobile: không tràn ngang toàn trang, bảng cuộn riêng, focus/label/keyboard, loading/empty/error/success và console. Chỉ ghi PASS khi trực tiếp kiểm tra được.

## Quay lui

Tắt worker thông báo mới trước; có thể tắt reset worker bằng `PASSWORD_RESET_WORKER=false`. Không xoá outbox/lịch sử hoặc reset database. Migration bổ sung tương thích với dữ liệu cũ nên giữ bảng/cột khi quay lui code; kiểm tra bản ứng dụng dự định khôi phục ở cổng riêng và health trước khi chuyển. Baseline source có lỗi dependency đã ghi trên, không nên checkout rồi đưa thẳng vào chạy. Phục hồi DB chỉ theo quy trình có backup đã diễn tập, không tự ghi đè `codegym_local`.
