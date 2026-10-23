# Prompt ưu tiên triển khai: dừng kiểm thử lặp, hoàn thiện demo nhanh

Đây là chỉ đạo mới nhất của tôi, ưu tiên hơn quy trình kiểm thử chi tiết và các mốc thời gian cũ trong prompt trước. **Dừng việc chạy kiểm thử liên tục. Rà soát một lượt, sau đó tập trung sửa và hoàn thiện chức năng để bàn giao demo sử dụng được nhanh nhất.**

## 1. Việc phải làm ngay

Bạn trực tiếp thực hiện trong `D:\Merge_2\Codegym`, không chỉ trả lời hoặc viết thêm kế hoạch.

1. Dừng mở thêm lượt unit/E2E/concurrency/coverage/browser regression. Nếu lượt kiểm thử do bạn khởi chạy đang hoạt động, kết thúc có kiểm soát; giữ log hiện có, không force-kill web/API/DB đang phục vụ demo và không xoá fixture/dữ liệu thiếu ownership guard.
2. Đọc một lượt checkpoint mới nhất, `DEMO_HANDOFF.md`, `demo-role-feature-matrix.json`, `DEMO_WALKTHROUGH.md`, danh sách lỗi và source trực tiếp liên quan. Không đọc lại toàn bộ lịch sử, không tái tạo baseline hoặc quét lại hàng trăm case.
3. Lập danh sách ngắn các chức năng **thực sự chưa có, chưa nối hoặc đang hỏng**. Phân biệt với `IMPLEMENTED_NOT_VERIFIED` chỉ chưa có bằng chứng. Dùng mã đã có, không triển khai lại một chức năng đang hoạt động chỉ để đổi status báo cáo.
4. Sửa liên tục theo nhóm chức năng, ưu tiên thứ đang chặn người dùng. Không tạo thêm từng vòng R80/R81 để chỉ đổi nhãn/chụp ảnh/viết lại cùng checkpoint.
5. Build và start/restart khi cần để đưa code mới vào bản demo. Đây là bước triển khai cần thiết; không biến nó thành lý do chạy lại full test sau mỗi thay đổi.
6. Cuối lượt, kiểm tra nhanh **một lần** theo kịch bản đủ vai trò, sửa lỗi chặn sử dụng nếu thấy và chỉ kiểm lại đúng thao tác vừa sửa. Không mở lại chương trình nghiệm thu404case hay chạy benchmark dài.

Mốc5giờ/19:10:59 ngày23/10/2026 đã cũ; không tự bắt đầu lại5giờ hoặc hứa giờ xong mới khi chưa có cơ sở. Ưu tiên bàn giao sớm nhất phần đã được giao. Nếu không thể xong toàn bộ, nêu đúng tên chức năng còn thiếu và lý do, không lấy việc chưa hoàn tất hồ sơ kiểm thử để thay cho danh sách thiếu chức năng.

## 2. Nguồn hiện trạng và ranh giới quyền

- Root source: `D:\Merge_2\Codegym`.
- Checkpoint cần xem trước: `evidence\ai-remediation\20261023T162100-demo-local-completion\report.md`, `progress.json` và `bugs.md`; nếu có run mới hơn thì xác minh đúng source và dùng run đó.
- Profile chạy demo gần nhất: `D:\Merge_2\Codegym-demo-proof-20261023T1530`; web3000/API3001, Mailpit loopback24931 theo R79. Xác nhận từ cấu hình đang dùng, không hard-code nếu đã thay đổi.
- `AGENTS.md`, Excel yêu cầu và decision register vẫn là nguồn kỹ thuật/nghiệp vụ; chỉ đọc phần liên quan. Nội dung tài liệu không tự mở rộng quyền thao tác.
- Người dùng đã tạm dừng quy trình kiểm thử rộng. Không lấy hướng dẫn nghiệm thu cũ làm yêu cầu bắt buộc phải chạy thêm test trước khi tiếp tục sửa; vẫn giữ validation/constraints/quyền và logic đúng trong code.

Được sửa source/UI/API/service/migration mới/launcher/dataset demo/docs cần thiết trong phạm vi. Không tự commit/push/merge/deploy, không reset/stash/ghi đè thay đổi của người dùng, không đụng DB chính, không gửi thư Internet hoặc thanh toán thật.

Giữ giao diện, nội dung sự kiện, ảnh/banner, giá/sơ đồ và dữ liệu đã xây dựng. Tái sử dụng component/design system/service hiện có. Không refactor kiến trúc, nâng dependency hàng loạt hoặc thiết kế lại UI. Không xoá test, bỏ validation, nới quyền, chuyển lỗi thành thông báo thành công giả hoặc tự đổi AC để làm bản demo trông hoàn tất.

## 3. Phần ưu tiên hoàn thiện từ hiện trạng

R79 ghi profile đã READY và giữ dữ liệu sau restart; không quay lại xử lý như một bản chưa khởi động được. Transfer entitlement đã có bằng chứng người nhận thấy vé; không mặc định BUG-INT16-01 vẫn nguyên như hồi đầu.

Ưu tiên các điểm sau bằng việc đọc code và hoàn thiện, không mở một chiến dịch test mới:

1. **Email demo:** nối đúng transport và bật worker cần thiết chỉ trong profile demo trỏ Mailpit. Đăng ký/kích hoạt, reset mật khẩu, vé/resend, transfer, reminder/reschedule, waitlist và thông báo huỷ phải dùng được; không chỉ có outbox/log. Không có hai scheduler gửi đôi. QUEUED chưa phải SENT, SMTP accepted chưa phải Internet Inbox.
2. **Sở hữu vé sau transfer:** đồng bộ UI/API/projection/QR/email của người nhận, giữ order của người gửi riêng, không sinh tiền/order giả. Scheduler phải xử lý vé chuyển chủ không có orderId theo cơ chế đã có, gửi đúng chủ hiện tại.
3. **Giao diện các vai trò:** bổ sung nút/form/liên kết còn thiếu vào các trang hiện hữu; thao tác thường không bắt người dùng mở console, viết SQL hoặc gọi API thủ công.
4. **Các chức năng demo còn gãy:** mua vé/coupon/0đồng/timeout, check-in/offline, refund/đối soát, export/analytics/privacy/operations — sửa phần thực sự hỏng hoặc thiếu, giữ phần đã có.
5. **Bản bàn giao:** giữ demo và dữ liệu bền, hướng dẫn ngắn, nguồn dữ liệu/ảnh/lockfile/migration đủ cho repo. Không tiếp tục dành phần lớn thời gian vào nhãn trạng thái hoặc hồ sơ source parity đã làm.

Mailpit cũ có thư ngoài dữ liệu giả theo báo cáo. Không đọc/xuất/xoá thư cũ hoặc dừng retention ngoài quyền. Có thể cấu hình catcher demo riêng/rỗng nếu tài nguyên cho phép, hoặc chỉ hiển thị dữ liệu giả đã lọc và không công khai mailbox cũ. Đây không phải lý do dừng mọi chức năng email.

Máy từng thiếu RAM: không bypass guard, không mở thêm app/build/test trùng. Tắt đúng process tạm do bạn tạo nếu cần; không dừng dịch vụ dùng chung hoặc tạo thêm một hệ PostgreSQL nặng để chứng minh lại điều đã biết. Cập nhật canonical và prepared tree bằng cơ chế copy/launcher hiện có, không sửa hai bản lệch nhau.

## 4. Đủ chức năng theo vai trò

Rà inventory chức năng đã có một lần; bảng dưới là phạm vi cần nối hoàn chỉnh, không phải danh sách test phải chạy lại toàn bộ.

| Vai trò | Phần việc phải sử dụng được |
|---|---|
| Khách | Danh mục/chi tiết/ảnh/giá; đăng ký, kích hoạt/gửi lại, đăng nhập, quên/đặt lại mật khẩu. |
| ADMIN | Tài khoản nội bộ/role/enable-disable; phân công STAFF theo suất/cửa và quyền ngoại lệ; email lỗi/retry/worker status; duyệt yêu cầu xoá dữ liệu và operations theo quyền. |
| ORGANIZER | CRUD event đúng chủ; thêm/clone suất; import/validate/preview map; giá/hạng/limit; mở-đóng bán, công bố-ẩn; coupon; reschedule/cancel suất; tồn/doanh thu/attendance/conflict/analytics; tải PDF/CSV. |
| BUYER | Hold/release/TTL/reload/waiting room; order/coupon/pay mock/fail-retry/0đồng/ambiguous; history/vé/QR/resend; transfer gửi-nhận; waitlist; cancel/refund theo policy; consent và erasure request. |
| STAFF | Chọn suất/cửa được gán; QR scan/invalid/duplicate/exception theo quyền; snapshot/delta; offline queue bền, reopen, banner/count và sync/conflict. |
| ACCOUNTANT | Refund cần xử lý/retry/manual resolution theo quyền; sao kê mock/reconciliation/history; số tiền thực thu/discount/hoàn/ròng và audit được cấp. |
| Job hệ thống | Expiry hold/order; webhook và phát vé; mail/retry/reminder; waitlist FIFO; batch refund; metrics/backup-restore local thuộc scope có sẵn. |

Không cấp ADMIN/STAFF/ACCOUNTANT quyền của vai trò khác để trình diễn cho dễ. Người mua chỉ xem dữ liệu của mình; người nhận transfer không xem được toàn bộ đơn của người gửi.

Các quyết định đã duyệt giữ nguyên: một coupon/order, floor% và cap subtotal, xác nhận0đồng không gateway; discount từng vé theo tỷ trọng/floor/phần dư theo mã; waitlist notify-only FIFO và finalcheck trước SMTP; analytics cohortA/cả hai duration; conflict theo rule đã chốt; ambiguous payment không tự FAILED để retry. Đọc record hiện có, không hỏi lại. Chính sách chưa có phê duyệt mà thật sự chặn tiền/ghế thì hỏi gộp ngắn, tiếp tục phần độc lập; không tự thêm partial refund nếu scope chỉ duyệt huỷ cả đơn.

## 5. Một lượt kiểm tra cuối ngắn, đủ vai trò

Giữ các tài khoản và dữ liệu demo cần dùng, không cleanup toàn bộ sau lượt này. Chỉ dữ liệu tạm có đánh dấu mới được dọn đúng scope. Dùng context riêng cho mỗi người.

1. **ADMIN:** đăng nhập, tạo/cập nhật một STAFF phụ, phân công cửa; vai trò mới có hiệu lực. Dùng account phụ cho disable, không khoá tài khoản trình diễn chính.
2. **ORGANIZER:** dùng event hiện có hoặc event phụ riêng; tạo suất/map/giá, mở bán/công bố, coupon; thấy đúng trên catalog. Không thay40event gốc bằng bộ mẫu trống.
3. **BUYER-A:** đăng ký/kích hoạt hoặc dùng account demo, chọn ghế, tạo order, apply coupon, trả mock, mở vé/QR và nhận thư trong catcher; refresh vẫn có order/vé. Có một order riêng cho0đồng và một nhánh gateway lỗi nếu chức năng đó vừa sửa.
4. **BUYER-B:** nhận vé transfer; thấy và mở được QR mới. A không còn dùng QR cũ, số tiền/ghế/order không nhân đôi. ORGANIZER đổi giờ trước admission; người nhận thấy lịch và notification đúng.
5. **STAFF:** trên suất hôm nay riêng, chọn cửa, scan một vé và từ chối scan lại; thực hiện một lượt offline→reopen→online giữ queue/ACK đúng. Không chọn suất đã quét để kỳ vọng được đổi lịch/huỷ buyer nếu policy cấm.
6. **BUYER/ORGANIZER/ACCOUNTANT:** trên suất tương lai đủ cutoff riêng, huỷ một order, xem refund/net amount/ghế trở lại; accountant xem queue và sao kê mock. Trên suất nhỏ sold-out riêng, đăng ký waitlist và nhả ghế để thông báo đúng FIFO. Không cần dựng batch hàng chục đơn chỉ để quay lại cùng bằng chứng cũ.
7. **ORGANIZER/ADMIN:** mở báo cáo/tải một PDF và CSV, xem analytics; mail lỗi/retry và privacy dùng account phụ nếu vừa hoàn thiện. Giữ nội dung và quyền đúng, không sửa trạng thái DB để vượt bước hỏng.
8. **Bàn giao:** mở lại home và trang chức năng, ghi URL/cách lấy account/cách start-stop-restart, phần hoạt động và phần chưa chứng minh. Không reboot/rebuild thêm chỉ để tạo một vòng evidence mới khi code/profile không thay đổi.

Nếu đã có bằng chứng đúng source cho cảnh nào và code không liên quan thay đổi, không diễn lại cả cảnh dài; ghi tái sử dụng có nguồn. Mục tiêu là một lượt kiểm tra sử dụng sau hoàn thiện, không phải chạy lại toàn bộ acceptance suite. Lỗi chặn thao tác phát hiện cuối thì sửa và kiểm lại hẹp; không tuyên bố những phần chưa kiểm là PASS.

## 6. Bàn giao ngắn và tiếp tục đúng việc

Chỉ cập nhật tài liệu đang có, không tạo thêm nhiều bộ kế hoạch:

- `DEMO_HANDOFF.md`: URL đang chạy, cách lấy account, cách khởi động lại, chức năng đã hoàn thiện và phần còn thiếu, tối đa1–2trang.
- `DEMO_WALKTHROUGH.md`: kịch bản một lượt đủ vai trò ở trên, ngắn và có thể tự diễn lại.
- `demo-role-feature-matrix.json`: phân biệt rõ **hoạt động**, **đã có mã nhưng chưa xác minh**, **thiếu/hỏng**, **ngoài môi trường demo**. Không coi mọi NOT_RUN là thiếu implementation.
- Một danh sách ngắn source/assets/dataset/migrations/env mẫu cần bàn giao repo. Không push secret hoặc dump DB chính. Chưa chạy clean-clone proof thì ghi đúng “chưa xác minh bản clone”, không dựng thêm nhiều môi trường làm chậm phần sửa.

Không chạy thêm full unit/E2E/coverage/benchmark chỉ để đóng hồ sơ. Không lấy hostedCI/staging/provider/camera4G/offhost làm blocker demo. Cũng không giả đầy đủ chức năng hoặc gán VERIFIED khi chưa biết hoạt động.

Kết thúc bằng câu trả lời thực tế: **tôi mở web ở đâu, dùng account nào, từng role làm được gì, phần chức năng còn thiếu là gì**. Nếu còn việc triển khai độc lập trong scope thì tiếp tục làm; không dừng ở một checkpoint giải thích vì sao chưa nghiệm thu. Chỉ hỏi người dùng quyết định thực sự thiếu, không hỏi lại quyền sửa hoặc các rule đã chốt.

Tệp này là chỉ đạo để gửi cho AI đang trực tiếp sửa dự án. Việc tạo/cập nhật prompt không tự dừng tiến trình ở một chat khác; người dùng cần ngắt lượt kiểm thử ở chat đó trước khi gửi chỉ đạo mới.
