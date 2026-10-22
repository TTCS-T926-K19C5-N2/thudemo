# Kiểm tra backlog Sprint 4–8 — Codegym

Ngày: 21/10/2026. Nguồn: `D:\Bán vé sự kiện có sơ đồ ghế.xlsx - Backlog.csv`.
Đối tượng: `D:\Merge_2\Codegym`, HEAD `4fd945a`, nhánh `codex/integrate-thudemo-features` và working tree tại lúc kiểm tra.

## Phạm vi và cách đọc kết quả

- Mục tiêu người dùng đã chốt: đồ án local/sandbox; giao cho MỘT chatbot làm nối tiếp, có bản tiến triển trong vài giờ rồi hoàn thiện dần.
- 31 story, 99 SP gốc. Tất cả dòng CSV ghi Todo; đây là trạng thái nguồn, không phải kết luận mã hiện tại. Giữ nguyên Sprint, SP, Priority, AC, Deps; wave ở kế hoạch chỉ là thứ tự kỹ thuật đề xuất.
- “Có nền tảng” nghĩa là đã tìm được triển khai chính, KHÔNG đồng nghĩa Done. “Cần sửa/kiểm chứng” có khoảng trống hoặc test hiện tại lỗi. “Chưa có luồng” nghĩa chưa tìm được workflow end-to-end tương ứng trong module/schema/API được kiểm tra; enum, tài liệu hoặc giao diện đơn lẻ không đủ chứng minh.
- Đã đọc CSV, module, schema, service và UI liên quan; chạy lại unit API/web và root typecheck. Chưa chạy browser/camera, thử SMTP thật, load 2000 người, mạng4G thật, sandbox refund hoặc diễn tập restore trong lượt audit này. Không suy luận những phần đó đã đạt.
- Không chỉnh mã ứng dụng, .env, dữ liệu nghiệp vụ hay nguồn CSV trong lượt lập kế hoạch này. Hai test ticket đang sửa sẵn trong working tree được giữ nguyên.

## Kết quả kiểm tra mới

| Lệnh | Kết quả ngày21/10 | Bằng chứng |
|---|---|---|
| `pnpm --filter api test` | 348 đạt / 38 lỗi; 41 file đạt / 6 lỗi | `.cache/sprint4-8-audit/api-tests.log` |
| `pnpm --filter web test` | 118 đạt / 18 lỗi; 20 file đạt / 4 lỗi | `.cache/sprint4-8-audit/web-tests.log` |
| `pnpm typecheck` | API thất bại với20 diagnostic ở spec; root dừng trước web | `.cache/sprint4-8-audit/typecheck.log` |

Các lỗi bao gồm auth, holds, users, controller/scanner, offline queue/sync, redirect login. Một số spec gọi method đã bỏ hoặc thiếu argument mới; phải đối chiếu AC và contract rồi sửa đúng implementation/fixture. Không xoá test, nới authorization hoặc đổi logic đúng chỉ để có PASS. Không coi toàn bộ lỗi là test cũ khi chưa điều tra. Không dùng kết quả kiểm tra clone ngày20/10 thay kết quả hôm nay. Build/lint/e2e/browser chưa chạy trong lượt này.

## Tổng hợp theo sprint

| Sprint gốc | Story | SP gốc | Nhận định |
|---|---:|---:|---|
|4|8|20|QR, email, staff, scanner online, lịch sử đã có phần lớn; cần sửa/đo/kiểm end-to-end.|
|5|7|20|Có snapshot/IndexedDB/sync/conflict; nhiều test offline hiện lỗi, cần nghiệm thu bền vững trên browser.|
|6|5|20|Phòng chờ và limiter booking chưa có; cap có race cần xử lý; metrics và SSE cần nối/đo.|
|7|5|19|Thiếu huỷ/hoàn tiền/batch/retry; nhật ký còn rời rạc. Đây là khối xây mới có rủi ro dữ liệu lớn nhất.|
|8|6|20|Có báo cáo/consent/backup nền tảng; thiếu đối soát, xoá dữ liệu, tái đồng ý, throughput và vận hành backup hoàn chỉnh.|

## Ma trận đối chiếu 31 story

|ID|Sprint|SP|Ưu tiên|Kết luận triển khai|Wave đề xuất|
|---|---:|---:|---|---|---|
|S-25|4|3|Must|Có nền tảng|A|
|S-26|4|3|Must|Có nền tảng|A|
|S-27|4|2|Should|Có nền tảng|A|
|S-28|4|2|Must|Cần sửa/kiểm chứng|A|
|S-29|4|2|Should|Cần sửa/kiểm chứng|A|
|S-30|4|3|Must|Có nền tảng|A|
|S-31|4|3|Must|Có nền tảng|A|
|S-32|4|2|Should|Có nền tảng|A|
|S-33|5|3|Must|Cần sửa/kiểm chứng|B|
|S-34|5|5|Must|Cần sửa/kiểm chứng|B|
|S-35|5|3|Must|Cần sửa/kiểm chứng|B|
|S-36|5|3|Should|Cần sửa/kiểm chứng|B|
|S-37|5|2|Should|Cần sửa/kiểm chứng|B|
|S-38|5|2|Should|Có nền tảng|A|
|S-39|5|2|Should|Có nền tảng|A|
|S-40|6|8|Should|Chưa có luồng|D|
|S-41|6|3|Should|Chưa có luồng|C|
|S-42|6|3|Should|Cần sửa/kiểm chứng|C|
|S-43|6|3|Should|Cần nối hoàn chỉnh|C|
|S-44|6|3|Could|Cần sửa/kiểm chứng|C|
|S-45|7|5|Should|Chưa có luồng|E|
|S-46|7|3|Should|Chưa có luồng|E|
|S-47|7|5|Should|Chưa có luồng|E|
|S-48|7|3|Should|Chưa có luồng|E|
|S-49|7|3|Must|Có nhật ký rời rạc|C|
|S-50|8|3|Should|Có nền tảng|F|
|S-51|8|5|Should|Chưa có luồng|F|
|S-52|8|2|Should|Có báo cáo cơ bản|F|
|S-53|8|5|Must|Chưa có luồng|G|
|S-54|8|2|Must|Có consent lúc đăng ký|G|
|S-55|8|3|Must|Có backup thủ công|G|

## Đối chiếu chi tiết và phần còn thiếu

### S-25 — Nhận vé điện tử có mã QR sau khi thanh toán

Sprint 4 • 3 SP • Must • Tier Next • dependency CSV: S-20 • record CSV 30 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Có nền tảng.

**Bằng chứng mã:** `apps/api/src/tickets/tickets.service.ts`, `apps/api/src/tickets/ticket-code.ts`, `apps/api/src/orders/ticket-qr.service.ts`.

**AC nguyên văn từ CSV:**

> Giả sử đơn vừa chuyển sang đã trả, Khi tôi mở trang đơn, Thì mỗi ghế có một vé riêng với mã QR, tên sự kiện, suất, hạng và số ghế
> Giả sử đơn có 3 ghế, Khi xem vé, Thì ba mã QR khác nhau và mã của vé này không suy ra được mã vé khác
> Giả sử đơn chưa trả, Khi mở trang vé bằng đường dẫn, Thì không có vé nào

**NFR nguyên văn:** mã vé sinh ngẫu nhiên đủ dài, không dùng số thứ tự tăng dần. Ước lượng thô 3 SP — tier Next

**Công việc còn lại:** Kiểm tra mọi đường phát hành đều đi qua PAID transaction; rà đường legacy createTicketsForPaidOrder của scanner, chỉ giữ một nguồn QR chuẩn; không sinh lại mã khi retry.

**Nghiệm thu cần có:** Đơn 3 ghế trả tiền có đúng 3 QR riêng; đơn chưa trả không phát hành; webhook lặp không nhân vé.

### S-26 — Mã QR trên vé có chữ ký, không tạo giả được ngoài hệ thống

Sprint 4 • 3 SP • Must • Tier Next • dependency CSV: S-25 • record CSV 31 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Có nền tảng.

**Bằng chứng mã:** `apps/api/src/orders/ticket-qr.service.ts`, `apps/web/src/features/ticket-scanner/verify-ticket-qr.ts`.

**AC nguyên văn từ CSV:**

> Giả sử nội dung QR gồm mã vé, mã suất và chữ ký, Khi máy quét kiểm chữ ký bằng khoá công khai, Thì vé thật qua và mã sửa một ký tự bị từ chối
> Giả sử khoá ký bị đổi, Khi quét vé đã phát trước đó, Thì vé cũ vẫn hợp lệ nhờ phiên bản khoá ghi trong QR
> Giả sử một người tự tạo QR với mã vé hợp lệ nhưng không có chữ ký, Khi quét, Thì bị từ chối

**NFR nguyên văn:** khoá riêng chỉ nằm trên máy chủ; máy quét chỉ giữ khoá công khai. Ước lượng thô 3 SP — tier Next

**Công việc còn lại:** Thống nhất định dạng ET1 với scanner; kiểm nghiệm xoay khóa có key-id và giữ public key cũ; private key chỉ ở server, giữ khóa local hiện tại.

**Nghiệm thu cần có:** QR sửa một ký tự, sai khóa, thiếu chữ ký đều bị từ chối; QR ký bằng khóa cũ vẫn hợp lệ sau rotation.

### S-27 — Vé gửi qua email kèm mã QR

Sprint 4 • 2 SP • Should • Tier Next • dependency CSV: S-25, S-03 • record CSV 28 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Có nền tảng.

**Bằng chứng mã:** `apps/api/src/tickets/ticket-delivery.service.ts`, `deploy/ticket-mail.mjs`.

**AC nguyên văn từ CSV:**

> Giả sử đơn chuyển sang đã trả, Khi hệ thống xử lý xong, Thì một email có đủ vé kèm ảnh QR được gửi tới địa chỉ tài khoản trong vòng 1 phút
> Giả sử gửi email thất bại, Khi thử lại, Thì tối đa 3 lần cách nhau tăng dần, rồi ghi nhận lỗi để quản trị xử lý tay
> Giả sử người mua bấm "gửi lại vé", Khi xử lý, Thì gửi lại đúng vé đã có, không sinh vé mới

**NFR nguyên văn:** email không chứa thông tin thanh toán; dùng lớp gửi email ở T-08. Ước lượng thô 2 SP — tier Next

**Công việc còn lại:** Xác minh worker được bật và SMTP ready bằng trạng thái đã che secret; kiểm outbox/retry/lease; bổ sung màn hình lỗi cho ADMIN nếu thiếu; đo PAID→transport accepted, phân biệt với thư đã vào inbox.

**Nghiệm thu cần có:** 1 email đủ PNG cho 3 vé trong 60 giây ở mail catcher; lỗi tối đa 3 lần backoff; resend giữ mã, ownership403; Gmail thật chỉ thử theo địa chỉ người dùng cho phép.

### S-28 — Quản trị tạo tài khoản nhân viên và gán vai trò

Sprint 4 • 2 SP • Must • Tier Next • dependency CSV: S-02 • record CSV 27 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Cần sửa/kiểm chứng.

**Bằng chứng mã:** `apps/api/src/users`, `apps/api/src/auth`, `apps/web/src/components/login-form.tsx`.

**AC nguyên văn từ CSV:**

> Giả sử tôi tạo tài khoản với vai trò soát vé, Khi nhân viên đăng nhập, Thì chỉ thấy màn hình quét vé
> Giả sử tôi đổi vai trò một tài khoản đang đăng nhập, Khi họ gọi API tiếp theo, Thì quyền mới có hiệu lực ngay, không cần đăng xuất
> Giả sử tôi vô hiệu hoá một tài khoản, Khi họ đăng nhập, Thì bị từ chối kèm thông báo liên hệ quản trị

**NFR nguyên văn:** mọi thay đổi vai trò ghi nhật ký kèm người thao tác. Ước lượng thô 2 SP — tier Next

**Công việc còn lại:** Sửa thông báo disabled yêu cầu liên hệ quản trị; kiểm STAFF chỉ tới luồng scanner; cập nhật test lỗi theo API hiện tại, giữ live role lookup và nhật ký actor.

**Nghiệm thu cần có:** ADMIN tạo STAFF; STAFF bị403 ở quản trị; đổi role có hiệu lực ngay API kế tiếp; disable chặn cả session cũ và login mới, đúng thông báo.

### S-29 — Nhân viên soát vé chọn suất diễn và cửa trước khi quét

Sprint 4 • 2 SP • Should • Tier Next • dependency CSV: S-28 • record CSV 32 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Cần sửa/kiểm chứng.

**Bằng chứng mã:** `apps/api/src/check-in`, `apps/web/src/features/scanner/scanner-showtime-selector.tsx`.

**AC nguyên văn từ CSV:**

> Giả sử tôi đăng nhập trên điện thoại, Khi mở màn hình quét, Thì phải chọn suất diễn đang diễn ra hôm nay và tên cửa trước khi máy ảnh bật
> Giả sử tôi đổi sang cửa khác, Khi chọn lại, Thì các lần quét sau ghi cửa mới
> Giả sử không có suất nào hôm nay, Khi mở màn hình, Thì thấy thông báo thay vì danh sách rỗng

**NFR nguyên văn:** lựa chọn được nhớ trên thiết bị tới khi đổi. Ước lượng thô 2 SP — tier Next

**Công việc còn lại:** Kiểm chọn suất hôm nay theo Asia/Ho_Chi_Minh, cửa được phân quyền, lưu lựa chọn theo người dùng; không mở camera trước lựa chọn hợp lệ; sửa fixture test.

**Nghiệm thu cần có:** Không có suất hôm nay có empty state; đổi cửa lượt sau ghi cửa mới; người không được phân công403; refresh giữ lựa chọn hợp lệ.

### S-30 — Soát vé bằng cách quét QR tại cửa

Sprint 4 • 3 SP • Must • Tier Next • dependency CSV: S-26, S-29 • record CSV 33 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Có nền tảng.

**Bằng chứng mã:** `apps/api/src/check-in/ticket-check-in.service.ts`, `apps/web/src/features/ticket-scanner/ticket-scanner.tsx`.

**AC nguyên văn từ CSV:**

> Giả sử quét vé hợp lệ của đúng suất, Khi máy chủ xác nhận, Thì màn hình xanh hiện hạng ghế và số ghế, vé được đánh dấu đã vào kèm cửa và thời điểm
> Giả sử quét mã không phải vé của hệ thống, Khi xử lý, Thì màn hình đỏ báo mã không hợp lệ
> Giả sử mạng chậm, Khi quá 3 giây chưa có trả lời, Thì màn hình báo đang chờ thay vì đứng im

**NFR nguyên văn:** phản hồi sau khi quét dưới 500ms để không tạo hàng chờ; màn hình đọc được dưới nắng. Ước lượng thô 3 SP — tier Next

**Công việc còn lại:** Nghiệm thu camera trên điện thoại, trạng thái xanh/đỏ/3 giây; đo end-to-end riêng với thời gian API; kiểm permission denied và nhập mã thủ công nếu đã có.

**Nghiệm thu cần có:** QR hợp lệ hiện ghế/cửa/thời gian; mã sai đỏ; quay lại chờ sau3s; báo số đo mục tiêu<500ms, thử ánh sáng thật, không suy từ unit test.

### S-31 — Vé đã soát không dùng lại được lần hai

Sprint 4 • 3 SP • Must • Tier Next • dependency CSV: S-30 • record CSV 34 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Có nền tảng.

**Bằng chứng mã:** `apps/api/src/check-in/ticket-check-in.service.ts`, `apps/api/prisma/migrations`, `apps/web/src/features/ticket-scanner/admission-override.tsx`.

**AC nguyên văn từ CSV:**

> Giả sử vé đã vào lúc 19:02 ở cửa A, Khi quét lại ở cửa B, Thì bị từ chối kèm thời điểm và cửa đã vào lần trước
> Giả sử hai máy quét cùng một vé trong cùng khoảnh khắc, Khi cả hai tới máy chủ, Thì chỉ một máy báo hợp lệ — cùng nguyên tắc chống trùng như giữ chỗ ở S-13
> Giả sử nhân viên xác nhận khách bị từ chối là chủ vé thật, Khi bấm "cho vào có ghi chú", Thì vé được ghi thêm một lần vào kèm lý do và tên nhân viên

**NFR nguyên văn:** đánh dấu đã vào chống được hai lần quét đồng thời bằng ràng buộc ở cơ sở dữ liệu. Ước lượng thô 3 SP — tier Next

**Công việc còn lại:** Giữ unique normal admission; kiểm concurrent hai cửa; ngoại lệ cần canOverride và lý do, có actor, không phá bản ghi lượt đầu.

**Nghiệm thu cần có:** Hai request đồng thời chỉ1 NORMAL; duplicate hiện cửa/thời gian đầu; STAFF thường không override; người được cấp quyền ghi EXCEPTION có lý do.

### S-32 — Xem lịch sử đơn hàng của tôi

Sprint 4 • 2 SP • Should • Tier Next • dependency CSV: S-16 • record CSV 29 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Có nền tảng.

**Bằng chứng mã:** `apps/api/src/orders/order-history.service.ts`, `apps/web/src/features/orders/order-history.tsx`.

**AC nguyên văn từ CSV:**

> Giả sử tôi có nhiều đơn, Khi mở lịch sử, Thì thấy danh sách mới nhất trước với trạng thái, sự kiện, số ghế và tổng tiền, phân trang
> Giả sử tôi gọi API với mã đơn của người khác, Khi xử lý, Thì bị từ chối 403
> Giả sử đơn đã hết hạn hoặc đã huỷ, Khi xem, Thì vẫn thấy trong lịch sử với trạng thái tương ứng

**NFR nguyên văn:** phân trang, không tải toàn bộ lịch sử một lần. Ước lượng thô 2 SP — tier Next

**Công việc còn lại:** Nghiệm thu phân trang/sort và expired/cancelled; giữ code403 khi truy cập đơn người khác; tránh tải toàn bộ hoặc giấu đơn bị huỷ.

**Nghiệm thu cần có:** Nhiều trang mới→cũ ổn định; đủ trạng thái/sự kiện/số ghế/tổng tiền; đơn người khác403; expired và cancelled vẫn xuất hiện.

### S-33 — Tải trước danh sách vé của suất diễn xuống máy quét

Sprint 5 • 3 SP • Must • Tier Next • dependency CSV: S-30 • record CSV 35 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Cần sửa/kiểm chứng.

**Bằng chứng mã:** `apps/api/src/scanner/scanner-snapshot.service.ts`, `apps/web/src/features/scanner/scanner-sync.ts`.

**AC nguyên văn từ CSV:**

> Giả sử tôi đã chọn suất ở S-29 và đang có mạng, Khi bấm "tải danh sách", Thì toàn bộ mã vé hợp lệ và trạng thái đã vào của suất được lưu trên thiết bị kèm thời điểm tải
> Giả sử danh sách đã tải quá 30 phút, Khi còn mạng, Thì máy tự tải lại phần thay đổi
> Giả sử suất có 5000 vé, Khi tải, Thì xong dưới 10 giây trên mạng 4G

**NFR nguyên văn:** dữ liệu trên thiết bị chỉ có mã vé và trạng thái, không có tên hay email khách. Ước lượng thô 3 SP — tier Next

**Công việc còn lại:** Kiểm full/delta, cursor hết hạn hoặc đổi user, atomic IndexedDB; không PII; đo 5000 vé trên mạng4G mô phỏng được ghi cấu hình.

**Nghiệm thu cần có:** 5000 vé tải<10s trong điều kiện đo; sau30phút refreshdelta; snapshot không email/họ tên; lỗi tải không xoá snapshot tốt cũ.

### S-34 — Soát vé ngoại tuyến bằng danh sách đã tải

Sprint 5 • 5 SP • Must • Tier Next • dependency CSV: S-33, S-26 • record CSV 36 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Cần sửa/kiểm chứng.

**Bằng chứng mã:** `apps/web/src/features/scanner/offline-scanner.ts`, `apps/web/src/features/scanner/scanner-db.ts`, `apps/web/public/scanner-worker.js`.

**AC nguyên văn từ CSV:**

> Giả sử máy mất mạng và đã có danh sách ở S-33, Khi quét vé hợp lệ, Thì máy kiểm chữ ký QR bằng khoá công khai, tra mã trong danh sách, báo xanh và ghi lần quét vào hàng đợi cục bộ
> Giả sử vé đã được đánh dấu đã vào trong danh sách tải về, Khi quét ngoại tuyến, Thì báo đỏ như khi có mạng
> Giả sử cùng máy quét một vé hai lần khi mất mạng, Khi quét lần hai, Thì bị từ chối nhờ hàng đợi cục bộ
> Giả sử máy chưa tải danh sách, Khi mất mạng, Thì màn hình báo không soát được và hướng dẫn tải khi có mạng

**NFR nguyên văn:** hàng đợi cục bộ sống qua việc đóng và mở lại ứng dụng. Ước lượng thô 5 SP — tier Next, cần chẻ khi lên Ready

**Công việc còn lại:** Sửa 8 test offline đang lỗi bằng đối chiếu contract; chuẩn hoá duy nhất queue; persist snapshot/khóa/queue; bootstrap scanner khi mất mạng, không bỏ điều kiện staff/device/gate.

**Nghiệm thu cần có:** Tải trước→offline→quét→đóng/mở→queue còn; vé đã vào, huỷ, sai chữ ký, lặp trên máy bị chặn; không snapshot hiện hướng dẫn; thử browser thật.

### S-35 — Đồng bộ các lần quét ngoại tuyến lên máy chủ khi có mạng lại

Sprint 5 • 3 SP • Must • Tier Next • dependency CSV: S-34 • record CSV 37 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Cần sửa/kiểm chứng.

**Bằng chứng mã:** `apps/web/src/features/ticket-scanner/sync-manager.ts`, `apps/api/src/scanner/offline-admissions.service.ts`.

**AC nguyên văn từ CSV:**

> Giả sử máy có 40 lần quét trong hàng đợi, Khi có mạng lại, Thì tự đẩy lên theo lô và hàng đợi về 0
> Giả sử đẩy lên bị ngắt giữa chừng, Khi có mạng lại lần nữa, Thì gửi tiếp phần còn lại và máy chủ không ghi trùng lần đã nhận — mỗi lần quét có mã duy nhất sinh trên thiết bị
> Giả sử máy chủ nhận lần quét cho vé đã vào trước đó ở cửa khác, Khi xử lý, Thì ghi nhận là xung đột để S-36 xử lý, không ghi đè

**NFR nguyên văn:** xử lý một lần quét nhiều lần cho kết quả giống xử lý một lần. Ước lượng thô 3 SP — tier Next

**Công việc còn lại:** Đồng nhất requestId/scanId/id và ACKv2; sửa fixtures test; retry cùng UUID/payload, không mất hàng đợi khi 4xx/5xx/ACK thiếu; tách mục lỗi cần xử lý, không âm thầm xoá.

**Nghiệm thu cần có:** 40 lượt chia batch→queue0 chỉ sau ACK; ngắt giữa batch rồi retry không thêm admission; conflict giữ lượt đầu, có receipt; đổi user không gửi queue người khác.

### S-36 — Xung đột soát vé ở hai cửa được phát hiện khi đồng bộ

Sprint 5 • 3 SP • Should • Tier Next • dependency CSV: S-35 • record CSV 38 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Cần sửa/kiểm chứng.

**Bằng chứng mã:** `apps/api/src/scanner/offline-admissions.service.ts`, `apps/web/src/features/scanner/conflict-report.tsx`.

**AC nguyên văn từ CSV:**

> Giả sử vé được quét ở cửa A và cửa B trong lúc cả hai mất mạng, Khi hai máy đồng bộ, Thì lần quét sớm hơn theo giờ thiết bị được tính là lần vào, lần kia thành xung đột
> Giả sử có xung đột, Khi ban tổ chức mở báo cáo suất, Thì thấy danh sách vé, hai cửa, hai thời điểm

**NFR nguyên văn:** giờ thiết bị lệch được ghi lại lúc đồng bộ để đọc báo cáo đúng. Ước lượng thô 3 SP — tier Next

**Công việc còn lại:** Kiểm 2 thiết bị offline, thứ tự nhận ngược, timestamp bằng nhau/clock lệch, offset; giữ raw log và canonical winner; chốt tie-break cho demo bằng cấu hình có tài liệu.

**Nghiệm thu cần có:** Một vé hai cửa offline→winner theo original device time của AC, loser conflict; báo đủ2cửa/2thời gian; retry ổn định; clockOffset được lưu khi sync.

### S-37 — Máy quét hiện rõ trạng thái mạng và số lần quét chưa đồng bộ

Sprint 5 • 2 SP • Should • Tier Next • dependency CSV: S-34 • record CSV 39 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Cần sửa/kiểm chứng.

**Bằng chứng mã:** `apps/web/src/features/ticket-scanner/network-status.ts`, `apps/web/src/features/ticket-scanner/offline-banner.tsx`, `apps/web/src/features/ticket-scanner/offline-sync.spec.ts`.

**AC nguyên văn từ CSV:**

> Giả sử mất mạng, Khi màn hình quét đang mở, Thì có dải cảnh báo ngoại tuyến và bộ đếm lần quét chưa đồng bộ
> Giả sử có mạng lại và đẩy xong, Khi bộ đếm về 0, Thì dải cảnh báo biến mất

**NFR nguyên văn:** trạng thái mạng đo bằng lần gọi máy chủ gần nhất, không chỉ dựa vào cờ của trình duyệt. Ước lượng thô 2 SP — tier Next

**Công việc còn lại:** Sửa test sync/banner theo ACK thực; xác định online bằng server call có auth/timeouts, không navigator.onLine đơn lẻ; counter đọc durable queue.

**Nghiệm thu cần có:** WiFi có nhưng API chết vẫn offline; đang gửi counter không giảm; chỉ online+queue0 mới hết cảnh báo; reload vẫn đúng số.

### S-38 — Xem vé của tôi trong tài khoản và tải lại mã QR

Sprint 5 • 2 SP • Should • Tier Next • dependency CSV: S-25 • record CSV 40 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Có nền tảng.

**Bằng chứng mã:** `apps/api/src/orders/ticket-qr.service.ts`, `apps/web/src/features/tickets/my-tickets.tsx`.

**AC nguyên văn từ CSV:**

> Giả sử tôi có vé cho suất sắp tới, Khi mở mục "vé của tôi", Thì thấy vé sắp diễn lên trước, vé đã qua xếp sau
> Giả sử tôi mở một vé, Khi trang hiện, Thì QR đủ lớn để quét từ màn hình điện thoại và có nút tải ảnh

**NFR nguyên văn:** vé đã huỷ hiện mờ và không có QR. Ước lượng thô 2 SP — tier Next

**Công việc còn lại:** Nghiệm thu thứ tự tương lai/quá khứ và tải ảnh phone; kiểm lọc PAID không làm biến mất vé huỷ khi bổ sung refund; không phát QR của vé cancelled.

**Nghiệm thu cần có:** Vé sắp tới trước; QR lớn và PNG tải được; vé huỷ vẫn thấy nhưng mờ/không QR; người khác không xem/tải được.

### S-39 — Quét vé sai suất diễn, vé đã huỷ hay mã lạ thì báo rõ lý do

Sprint 5 • 2 SP • Should • Tier Next • dependency CSV: S-30 • record CSV 41 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Có nền tảng.

**Bằng chứng mã:** `apps/api/src/check-in/ticket-check-in.service.ts`, `apps/web/src/features/ticket-scanner/admission-response.ts`.

**AC nguyên văn từ CSV:**

> Giả sử quét vé của suất khác, Khi từ chối, Thì hiện "vé của suất X lúc Y" để khách biết mình nhầm giờ
> Giả sử quét vé đã huỷ và hoàn tiền, Khi từ chối, Thì hiện "vé đã huỷ ngày Z"
> Giả sử quét mã lạ, Khi từ chối, Thì hiện "không phải vé của hệ thống"

**NFR nguyên văn:** mỗi lý do từ chối là một mã riêng trong log để đếm được. Ước lượng thô 2 SP — tier Next

**Công việc còn lại:** Nghiệm thu nội dung từng reasonCode và log, đồng bộ online/offline; dùng fixture cancelled trên DB test, không giả là đã có flow hoàn tiền.

**Nghiệm thu cần có:** Sai suất hiện tên/ngày đúng; cancelled có ngày; mã lạ có lý do riêng; log phân biệt wrong_show/cancelled/unknown và không ghi QR raw.

### S-40 — Hàng đợi phòng chờ khi lượng truy cập vượt ngưỡng

Sprint 6 • 8 SP • Should • Tier Later • dependency CSV: S-13 • record CSV 44 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Chưa có luồng.

**Bằng chứng mã:** `apps/api/src/app.module.ts`, `apps/api/src/redis`.

**AC nguyên văn từ CSV:**

> Vượt ngưỡng người đang chọn ghế thì người mới vào phòng chờ theo thứ tự đến, thấy vị trí của mình, tới lượt thì được vào trang chọn ghế với một lượt có thời hạn; hết lượt không thao tác thì mất chỗ. Chưa refine chi tiết — tier Later, ước lượng thô 8 SP, cần chẻ ít nhất ba story khi lên Next

**NFR nguyên văn:** chưa refine — cần chốt ngưỡng, thời gian giữ lượt, và hàng đợi đặt ở Redis hay ở tầng trước ứng dụng

**Công việc còn lại:** Tách40A cấu hình/ngưỡng+FIFO Redis,40B admission lease kiểm server trước giữ ghế,40C UI vị trí/hết lượt/rejoin; heartbeat TTL, Lua atomic, prefix môi trường; backpressure và recovery.

**Nghiệm thu cần có:** Nhiều client vượt ngưỡng vàoFIFO; slot không vượtcapacity; lease hết hạn mất chỗ; refresh không nhân phiên; không bypass bằng gọi API giữ ghế trực tiếp.

### S-41 — Giới hạn tần suất yêu cầu theo tài khoản và theo IP

Sprint 6 • 3 SP • Should • Tier Later • dependency CSV: S-02 • record CSV 45 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Chưa có luồng.

**Bằng chứng mã:** `apps/api/src/holds/holds.service.ts`, `apps/api/src/orders`, `apps/api/src/redis`.

**AC nguyên văn từ CSV:**

> Vượt ngưỡng số yêu cầu mỗi phút trên API giữ ghế và tạo đơn thì bị từ chối tạm thời kèm thời gian chờ; ngưỡng tính riêng theo tài khoản và theo IP. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**NFR nguyên văn:** chưa refine — cần chốt ngưỡng, tránh chặn nhầm người dùng chung mạng ký túc xá hay công ty

**Công việc còn lại:** Thêm limiter Redis atomic theo account VÀ IP cho hold/create order, TTL và Retry-After; trust proxy rõ ràng; ngưỡng local cấu hình, không tái dùng limit login làm bằng chứng.

**Nghiệm thu cần có:** Account đổiIP vẫn bị giới hạn; nhiều account cùngIP đạt ngưỡngIP; trả429+thời gian chờ; hết cửa sổ gọi lại được; kiểm sharedNAT, Redis lỗi theo policy.

### S-42 — Giới hạn số vé mỗi tài khoản được mua trong một suất

Sprint 6 • 3 SP • Should • Tier Later • dependency CSV: S-16 • record CSV 46 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Cần sửa/kiểm chứng.

**Bằng chứng mã:** `apps/api/src/holds/holds.service.ts`, `apps/web/src/features/showtime-management/ticket-limit-control.tsx`.

**AC nguyên văn từ CSV:**

> Ban tổ chức đặt giới hạn theo suất; tổng ghế đang giữ cộng đã mua của một tài khoản vượt giới hạn thì không giữ thêm được. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**NFR nguyên văn:** chưa refine — cần chốt giới hạn tính theo tài khoản hay theo số điện thoại đã xác minh

**Công việc còn lại:** Đếm held+PAID hiện có nhưng check trước claim chưa bảo đảm cùng-account race; chuyển invariant vào transaction/lock theo user+showtime; rà pending-order gap và release/expiry.

**Nghiệm thu cần có:** Cùng account đồng thời 2 nhómghế không vượt cap; held+paid cộng chung; huỷ/hết hạn trừ đúng; ORGANIZER đúng owner mới đổi cap; không double-count chuyển held→paid.

### S-43 — Giám sát và cảnh báo khi hệ thống quá tải

Sprint 6 • 3 SP • Should • Tier Later • dependency CSV: S-01 • record CSV 42 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Cần nối hoàn chỉnh.

**Bằng chứng mã:** `apps/api/src/monitoring/metrics.ts`, `monitoring/compose.yaml`, `monitoring/build-config.mjs`.

**AC nguyên văn từ CSV:**

> Có bảng theo dõi số yêu cầu, tỉ lệ lỗi, thời gian phản hồi p95, số tranh chấp ghế và số webhook bị từ chối; vượt ngưỡng thì gửi cảnh báo. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**NFR nguyên văn:** chưa refine — cần chốt kênh nhận cảnh báo và công cụ thu thập số liệu

**Công việc còn lại:** Nối producer rejected-webhook thực tế và worker; dashboard unavailable phải Unknown; cấu hình local alert receiver; chỉ thu thập labels hữu hạn, không PII.

**Nghiệm thu cần có:** Tạo request/error/holdconflict/rejectedwebhook thấy metrics thật; p95 tính đúng; gây ngưỡng có alert rồi resolved; worker tắt hiển thị unavailable.

### S-44 — Sơ đồ ghế tự cập nhật trạng thái mà không cần tải lại trang

Sprint 6 • 3 SP • Could • Tier Later • dependency CSV: S-09 • record CSV 43 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Cần sửa/kiểm chứng.

**Bằng chứng mã:** `apps/api/src/showtimes/seat-events.service.ts`, `apps/api/src/holds/hold-expiry.scheduler.ts`, `apps/web/src/features/seat-selection`.

**AC nguyên văn từ CSV:**

> Ghế đổi trạng thái thì mọi người đang mở sơ đồ suất đó thấy thay đổi trong vòng 2 giây mà không tải lại. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**NFR nguyên văn:** chưa refine — cần chốt đẩy từ máy chủ hay hỏi lại định kỳ, và mức tải chấp nhận được với 2000 người cùng xem

**Công việc còn lại:** Có SSE process-local; kiểm after-commit và reconnect snapshot, expiry60s gây trễ; thiết kế thông báo hếtTTL đúng hạn. Nếu chạy đaAPI thêm Redis PubSub; DB vẫn nguồn thật.

**Nghiệm thu cần có:** Hai browser thấy hold/pay/release/expiry trong≤2s; mất SSE rồi reconnect không stale; benchmark2000 viewers riêng; báo rõ chưa đạt nếu không đủ máy đo.

### S-45 — Khách huỷ vé trước hạn và được hoàn tiền theo chính sách

Sprint 7 • 5 SP • Should • Tier Later • dependency CSV: S-25 • record CSV 47 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Chưa có luồng.

**Bằng chứng mã:** `apps/api/src/payments/gateways/payment-gateway.interface.ts`, `apps/api/prisma/schema.prisma`.

**AC nguyên văn từ CSV:**

> Huỷ trước mốc quy định thì vé chuyển sang đã huỷ, lệnh hoàn theo tỉ lệ chính sách được gửi tới cổng và khách thấy số tiền sẽ nhận; huỷ sau mốc thì bị từ chối kèm lý do. Chưa refine chi tiết — tier Later, ước lượng thô 5 SP

**NFR nguyên văn:** chưa refine — cần chốt mốc thời gian, tỉ lệ hoàn, và cổng sandbox có hỗ trợ hoàn tiền không

**Công việc còn lại:** Thêm CancellationPolicy/Request/Refund/RefundAttempt và service state machine, kiểm owner/cutoff/rate; adapter refund mock idempotent, giao dịch/audit/outbox; chốt tiền integer VND và thời điểm invalid QR.

**Nghiệm thu cần có:** Trước hạn đúng tiền, sau hạn từ chối rõ; double click/webhook lặp không hoàn quá paid; lỗi provider không ghi refunded; demo mock gắn nhãn, sandbox thật chỉ khi provider hỗ trợ.

### S-46 — Ghế của vé đã huỷ quay lại kho bán

Sprint 7 • 3 SP • Should • Tier Later • dependency CSV: S-45 • record CSV 48 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Chưa có luồng.

**Bằng chứng mã:** `apps/api/src/holds`, `apps/api/src/orders`, `apps/api/prisma/schema.prisma`.

**AC nguyên văn từ CSV:**

> Vé huỷ xong thì ghế trở lại trạng thái trống trên sơ đồ và giữ được như ghế thường. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**NFR nguyên văn:** chưa refine — cần chốt mở bán lại tự động hay chờ ban tổ chức duyệt

**Công việc còn lại:** Chốt release tự động hay duyệt; gắn release vào bước cancel đã định nghĩa, không dựa mỗi trạng thái refund; lock tồn kho, publish SSE và giữ vé cũ revoked qua lần bán mới.

**Nghiệm thu cần có:** Huỷ hợp lệ→ghế chọn/mua lại được; QR cũ không vào; retry không release ghế của đơn mua sau; không double sale; giữ lịch sử đơn cũ.

### S-47 — Ban tổ chức huỷ suất diễn và hoàn tiền hàng loạt

Sprint 7 • 5 SP • Should • Tier Later • dependency CSV: S-45 • record CSV 49 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Chưa có luồng.

**Bằng chứng mã:** `apps/api/src/showtimes`, `apps/api/src/payments`, `apps/api/src/tickets`.

**AC nguyên văn từ CSV:**

> Huỷ suất thì suất đóng bán, mọi vé chuyển sang đã huỷ, một lệnh hoàn 100% được tạo cho từng đơn và chạy nền theo lô, khách nhận email thông báo. Chưa refine chi tiết — tier Later, ước lượng thô 5 SP

**NFR nguyên văn:** chưa refine — cần chốt cách xử lý khi một lệnh hoàn trong lô thất bại và giới hạn tốc độ gọi cổng

**Công việc còn lại:** Đóng bán nguyên tử và chặn hold/order mới; batch cursor bền vững huỷ toàn vé/hoàn100% mỗi đơn; tái dùng45/48, outbox email; checkpoint resume và progress organizer.

**Nghiệm thu cần có:** Bấm huỷ suất2lần không nhân refund/email; gián đoạn restart tiếp tục; đủ100% từng đơn; ghế suất đã huỷ không bán lại; vé không còn hợp lệ.

### S-48 — Lệnh hoàn tiền thất bại được thử lại và báo cho kế toán

Sprint 7 • 3 SP • Should • Tier Later • dependency CSV: S-45 • record CSV 50 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Chưa có luồng.

**Bằng chứng mã:** `apps/api/src/payments`, `apps/api/prisma/schema.prisma`.

**AC nguyên văn từ CSV:**

> Lệnh hoàn thất bại được thử lại tối đa 3 lần cách nhau tăng dần; vẫn thất bại thì vào danh sách cần xử lý tay của kế toán kèm lý do từ cổng. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**NFR nguyên văn:** chưa refine — cần chốt kênh báo và thời hạn xử lý tay

**Công việc còn lại:** Worker refund lease/fencing max3 exponentialbackoff; phân biệt timeout UNKNOWN cần query provider với FAILED; hàng đợi kế toán và manual retry có quyền/audit.

**Nghiệm thu cần có:** Giả lập fail→3attempt rồi manual list có providerreason; hai worker không double refund; manual query trước retry khi chưa rõ kết quả; xử lý success webhook đến muộn.

### S-49 — Nhật ký thao tác trên đơn hàng và vé

Sprint 7 • 3 SP • Must • Tier Later • dependency CSV: S-16 • record CSV 51 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Có nhật ký rời rạc.

**Bằng chứng mã:** `apps/api/prisma/schema.prisma`, `apps/api/src/orders`, `apps/api/src/check-in`.

**AC nguyên văn từ CSV:**

> Mọi thay đổi trạng thái đơn, vé, giữ chỗ do người hay do job đều có bản ghi kèm tác nhân, thời điểm, trạng thái trước và sau; xem được theo đơn. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**NFR nguyên văn:** chưa refine — cần chốt thời gian lưu nhật ký và bảng riêng hay dùng chung với `payment_events`

**Công việc còn lại:** Bổ sung domain audit actor USER/JOB/SYSTEM, before/after hợp lệ, entity/orderId/correlationId; ghi cùng transaction tất cả chuyển trạng thái hold/order/ticket; UI order timeline có quyền.

**Nghiệm thu cần có:** Hold→order→paid→ticket→scan→cancel đều tra theo order có actor/time/before/after; rollback không để log thành công; API người khác403; không lưu secrets/QR/PII thừa.

### S-50 — Xem doanh thu và tồn vé theo suất diễn

Sprint 8 • 3 SP • Should • Tier Later • dependency CSV: S-20 • record CSV 55 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Có nền tảng.

**Bằng chứng mã:** `apps/api/src/showtimes/showtimes.service.ts`, `apps/web/src/features/showtime-management/showtime-sales-report.tsx`.

**AC nguyên văn từ CSV:**

> Bảng theo suất diễn có số vé đã bán, số ghế đang giữ, số ghế còn, doanh thu theo hạng, cập nhật không trễ quá 1 phút. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**NFR nguyên văn:** chưa refine — cần chốt tính thời gian thực hay tổng hợp theo lô

**Công việc còn lại:** Báo cáo tồn/doanh thu có poll30s; nghiệm thu owner/category/số tiền snapshot, xác định gross/refund/net khi E triển khai; hiển thị asOf và lỗi refresh.

**Nghiệm thu cần có:** Hold/pay/expiry cập nhật≤60s; tổng từng hạng khớp DB; tiền theo giá mua snapshot; người không owner403; refund không làm báo cáo sai hoặc đếm bán2lần.

### S-51 — Đối soát giao dịch hệ thống với sao kê cổng thanh toán

Sprint 8 • 5 SP • Should • Tier Later • dependency CSV: S-20 • record CSV 56 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Chưa có luồng.

**Bằng chứng mã:** `apps/api/src/payments`, `apps/api/prisma/schema.prisma`.

**AC nguyên văn từ CSV:**

> Nạp tệp sao kê của cổng theo kỳ, hệ thống ghép theo mã giao dịch với `payment_events` và chỉ ra ba nhóm: khớp, có ở hệ thống mà không có ở cổng, có ở cổng mà không có ở hệ thống; lệch số tiền cũng thành một dòng. Chưa refine chi tiết — tier Later, ước lượng thô 5 SP

**NFR nguyên văn:** chưa refine — cần chốt định dạng sao kê của cổng đã chọn

**Công việc còn lại:** Chốt CSV fixture sandbox có transactionId/amount/status/time; chuẩn hoá PaymentEvent thay vì giả định có payment_events; import validation/dedupe+ReconciliationRun/Row, dryrun, report ACCOUNTANT.

**Nghiệm thu cần có:** Fixture có4nhóm matched/systemonly/provideronly/amountmismatch; trùngfile không nhân dữ liệu; lỗi dòng chỉ rõ; providerID không khớp orderID; tiền integer, truy cập có quyền.

### S-52 — Ban tổ chức xem số khách đã vào cửa theo thời gian thực

Sprint 8 • 2 SP • Should • Tier Later • dependency CSV: S-31 • record CSV 57 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Có báo cáo cơ bản.

**Bằng chứng mã:** `apps/api/src/scanner/scanner.service.ts`, `apps/web/src/app/scanner/reports`.

**AC nguyên văn từ CSV:**

> Màn hình theo suất hiện số đã vào, số chưa vào, tốc độ vào theo phút và theo từng cửa, kể cả số liệu từ máy đang ngoại tuyến sau khi đồng bộ. Chưa refine chi tiết — tier Later, ước lượng thô 2 SP

**NFR nguyên văn:** chưa refine — cần chốt tần suất cập nhật

**Công việc còn lại:** Đã có total/checked-in, thiếu timeseries/cửa; tổng hợp NORMAL admission tránh tính EXCEPTION là khách mới, original scannedAt cho offline và receivedAt cho freshness; timezoneVN, poll có asOf.

**Nghiệm thu cần có:** Số vào/chưa vào khớp vé hợp lệ; biểu đồ phút/cửa không doublecount duplicate; offline sync vào đúng bucket; tổng phù hợp mọi cửa và chỉ organizer được quyền.

### S-53 — Khách yêu cầu xoá dữ liệu cá nhân của mình

Sprint 8 • 5 SP • Must • Tier Later • dependency CSV: S-49 • record CSV 53 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Chưa có luồng.

**Bằng chứng mã:** `apps/api/prisma/schema.prisma`, `apps/api/src/users`, `apps/api/src/auth`.

**AC nguyên văn từ CSV:**

> Sau khi yêu cầu được duyệt, họ tên, email, số điện thoại bị thay bằng giá trị ẩn danh trong mọi bảng, tài khoản không đăng nhập được nữa, nhưng đơn hàng, giao dịch và số liệu doanh thu vẫn nguyên để phục vụ kế toán. Chưa refine chi tiết — tier Later, ước lượng thô 5 SP

**NFR nguyên văn:** chưa refine — cần người có thẩm quyền xác nhận phạm vi dữ liệu phải xoá và dữ liệu phải giữ theo luật kế toán. **Skill không đưa tư vấn pháp lý**

**Công việc còn lại:** PII inventory mọi bảng/cache/mail/exports; request→approve→anonymize idempotent, disable/revoke sessions; giữ FK/order/payment/doanhthu; bảng consent/audit chỉ dữ liệu cần giữ, không xoá bằng cascade.

**Nghiệm thu cần có:** Sau approve không login, profile/outbox/địa chỉ liên quan được xử lý theo inventory; tổng tiền/lịch sử kế toán không đổi; chạy lại không lỗi; có báo cáo scope còn backup retention.

### S-54 — Người dùng đồng ý điều khoản và chính sách riêng tư, thu hồi được

Sprint 8 • 2 SP • Must • Tier Later • dependency CSV: S-03 • record CSV 54 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Có consent lúc đăng ký.

**Bằng chứng mã:** `apps/api/src/auth`, `apps/api/prisma/schema.prisma`, `apps/web/src/components`.

**AC nguyên văn từ CSV:**

> Khi đăng ký phải tích đồng ý, hệ thống lưu phiên bản và thời điểm; đổi phiên bản chính sách thì lần đăng nhập sau phải đồng ý lại; người dùng thu hồi được và khi đó không nhận email tiếp thị nữa. Chưa refine chi tiết — tier Later, ước lượng thô 2 SP

**NFR nguyên văn:** chưa refine — nội dung điều khoản do người có thẩm quyền cung cấp, không phải dev soạn

**Công việc còn lại:** Bổ sung consent history version/time và policyversion kiểm ở lần login sau, UI reconfirm; marketing optin riêng, withdraw endpoint; nội dung demo rõ phạm vi, không biến checkbox thành cớ bật marketing.

**Nghiệm thu cần có:** Signup lưu version/time; đổi policy→login cần reconfirm; rút marketing có thời gian/audit, không chặn mail kích hoạt/vé; account cũ được xử lý theo migration.

### S-55 — Sao lưu cơ sở dữ liệu hằng ngày và diễn tập khôi phục

Sprint 8 • 3 SP • Must • Tier Later • dependency CSV: S-01 • record CSV 52 (số bản ghi logic, không phải dòng vật lý).

**Kết luận:** Có backup thủ công.

**Bằng chứng mã:** `scripts/enable-local-booking.mjs`, `.cache/local-booking`.

**AC nguyên văn từ CSV:**

> Job sao lưu chạy mỗi đêm, bản sao lưu đẩy ra ngoài máy chủ ứng dụng, giữ 14 bản gần nhất; đã khôi phục thử lên môi trường tạm và ứng dụng chạy được với dữ liệu đó; quy trình khôi phục ghi trong README. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**NFR nguyên văn:** chưa refine — cần chốt nơi lưu bản sao lưu và mã hoá

**Công việc còn lại:** Job daily pg_dump mã hoá→đích KHÁC máy app và retention14; local-demo dùng đích test ghi rõ chưa đạt offhost nếu cùng máy; checksum/log/restore isolated DB, runbook RPO/RTO đề xuất.

**Nghiệm thu cần có:** Có14 bản sau mô phỏng retention; restore vào DB tạm rồi health/catalog/order/QR public verification chạy; không thay DB gốc; offhost thực cần đích được cấp.
