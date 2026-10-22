# Kịch bản kiểm thử sprint 4–8 — 22/10/2026

Dự án: `D:\Merge_2\Codegym`. Phạm vi 31 story, 99 SP từ CSV gốc. Mục tiêu: đồ án local/sandbox. Các bài ghi dữ liệu chạy trong DB bản sao, SMTP catcher hoặc worker tắt; không seed/reset dữ liệu chính.

## Quy tắc nghiệm thu

- Huỷ toàn đơn trước giờ diễn ít nhất 24 giờ, hoàn mock 100%, chưa soát vé; mở bán lại ghế ngay.
- PASS tự động chỉ xác nhận phạm vi được mô tả. Camera/ánh sáng/4G thật và off-host daily còn cần nghiệm thu riêng.
- Gmail SMTP thật đã xác thực thành công; worker vé đã bật theo chấp thuận, outbox có 3 SENT. SMTP chấp nhận không chứng minh vào Inbox.

## Kết quả và bằng chứng

| Nhóm | Kết quả | Bằng chứng |
|---|---|---|
| API unit | 419 PASS / 51 files | `.cache/sprint4-8-evidence/20261022/api-unit-final.log` |
| Web unit | 148 PASS / 24 files | `.cache/sprint4-8-evidence/20261022/web-unit-final.log` |
| Sprint 4–5 | 45 PASS | `.cache/local-booking/sprint4-5-verification-20261022.json` |
| Sprint 6–8 | 42 PASS | `.cache/sprint4-8-evidence/20261022/sprint6-8-results.json` |
| 2.000 SSE | 2.000/2.000 <2s, p95 1593ms, max1622ms | `.cache/sprint4-8-evidence/20261022/sse-load-results.json` |
| Backup restore | 4 PASS; local drill | `.cache/sprint4-8-evidence/20261022/backup-drill-results.json` |
| Full E2E | 102 PASS / 17 files; không gộp với 87 ca sprint | `.cache/sprint4-8-evidence/20261022/full-e2e.log` |

## S-25 · Sprint 4 · 3 SP — Nhận vé điện tử có mã QR sau khi thanh toán

### Yêu cầu CSV

- Giả sử đơn vừa chuyển sang đã trả, Khi tôi mở trang đơn, Thì mỗi ghế có một vé riêng với mã QR, tên sự kiện, suất, hạng và số ghế
- Giả sử đơn có 3 ghế, Khi xem vé, Thì ba mã QR khác nhau và mã của vé này không suy ra được mã vé khác
- Giả sử đơn chưa trả, Khi mở trang vé bằng đường dẫn, Thì không có vé nào

**NFR:** mã vé sinh ngẫu nhiên đủ dài, không dùng số thứ tự tăng dần. Ước lượng thô 3 SP — tier Next

### Thực hiện và kết quả mong đợi

Người mua giữ 3 ghế, tạo đơn và thanh toán mock; gọi webhook lặp. Đối chiếu đúng 3 vé khác nhau, đủ suất/ghế, không thêm vé khi lặp; đơn chưa trả không có QR.

### Bằng chứng thực thi

- PASS: S25 AC3 unpaid order exposes no tickets
- PASS: S25 AC1 paid order has one complete signed ticket for each seat
- PASS: S25 AC2 and NFR distinct unpredictable ticket IDs and QR payloads

## S-26 · Sprint 4 · 3 SP — Mã QR trên vé có chữ ký, không tạo giả được ngoài hệ thống

### Yêu cầu CSV

- Giả sử nội dung QR gồm mã vé, mã suất và chữ ký, Khi máy quét kiểm chữ ký bằng khoá công khai, Thì vé thật qua và mã sửa một ký tự bị từ chối
- Giả sử khoá ký bị đổi, Khi quét vé đã phát trước đó, Thì vé cũ vẫn hợp lệ nhờ phiên bản khoá ghi trong QR
- Giả sử một người tự tạo QR với mã vé hợp lệ nhưng không có chữ ký, Khi quét, Thì bị từ chối

**NFR:** khoá riêng chỉ nằm trên máy chủ; máy quét chỉ giữ khoá công khai. Ước lượng thô 3 SP — tier Next

### Thực hiện và kết quả mong đợi

Lấy QR hợp lệ; đổi một ký tự, bỏ chữ ký, dùng sai khóa và kiểm lại bằng khóa cũ sau khởi động. Chỉ chữ ký đúng với khóa được giữ mới hợp lệ.

### Bằng chứng thực thi

- Xem bộ 45 ca vé/soát vé và các unit trong nhóm chức năng tương ứng; không có phép đo thiết bị thật cho NFR phần cứng.

## S-27 · Sprint 4 · 2 SP — Vé gửi qua email kèm mã QR

### Yêu cầu CSV

- Giả sử đơn chuyển sang đã trả, Khi hệ thống xử lý xong, Thì một email có đủ vé kèm ảnh QR được gửi tới địa chỉ tài khoản trong vòng 1 phút
- Giả sử gửi email thất bại, Khi thử lại, Thì tối đa 3 lần cách nhau tăng dần, rồi ghi nhận lỗi để quản trị xử lý tay
- Giả sử người mua bấm "gửi lại vé", Khi xử lý, Thì gửi lại đúng vé đã có, không sinh vé mới

**NFR:** email không chứa thông tin thanh toán; dùng lớp gửi email ở T-08. Ước lượng thô 2 SP — tier Next

### Thực hiện và kết quả mong đợi

Thanh toán mock với SMTP catcher; kiểm tra email đủ QR trong 60 giây. Cho SMTP lỗi, kiểm tra tối đa 3 lần/backoff; gửi lại không tạo vé mới. Ở hệ thống thật chỉ kiểm tra SMTP/outbox theo quyền đã cho phép.

### Bằng chứng thực thi

- PASS: S27 AC1 local SMTP receives all 3 QR images within 60 seconds
- PASS: S27 NFR mail contains no gateway/payment fields
- PASS: S27 AC3 resend uses the same existing QR tickets
- PASS: S27 AC2 exactly 3 attempts with increasing scheduled backoff then FAILED
- PASS: S27 admin can list terminal email failures

## S-28 · Sprint 4 · 2 SP — Quản trị tạo tài khoản nhân viên và gán vai trò

### Yêu cầu CSV

- Giả sử tôi tạo tài khoản với vai trò soát vé, Khi nhân viên đăng nhập, Thì chỉ thấy màn hình quét vé
- Giả sử tôi đổi vai trò một tài khoản đang đăng nhập, Khi họ gọi API tiếp theo, Thì quyền mới có hiệu lực ngay, không cần đăng xuất
- Giả sử tôi vô hiệu hoá một tài khoản, Khi họ đăng nhập, Thì bị từ chối kèm thông báo liên hệ quản trị

**NFR:** mọi thay đổi vai trò ghi nhật ký kèm người thao tác. Ước lượng thô 2 SP — tier Next

### Thực hiện và kết quả mong đợi

ADMIN tạo STAFF rồi đổi vai trò/vô hiệu hóa; kiểm tra quyền ở yêu cầu kế tiếp. BUYER thử API quản trị phải bị từ chối; kiểm tra nhật ký người thao tác.

### Bằng chứng thực thi

- PASS: S28 admin creates STAFF ACCOUNTANT ORGANIZER with audit actor
- PASS: S28 unprivileged user cannot create internal accounts
- PASS: S28 AC2 role change affects the next request without logout
- PASS: S28 AC3 disabling rejects login and revokes sessions
- PASS: S28 AC3 disabled login explicitly advises contacting admin

## S-29 · Sprint 4 · 2 SP — Nhân viên soát vé chọn suất diễn và cửa trước khi quét

### Yêu cầu CSV

- Giả sử tôi đăng nhập trên điện thoại, Khi mở màn hình quét, Thì phải chọn suất diễn đang diễn ra hôm nay và tên cửa trước khi máy ảnh bật
- Giả sử tôi đổi sang cửa khác, Khi chọn lại, Thì các lần quét sau ghi cửa mới
- Giả sử không có suất nào hôm nay, Khi mở màn hình, Thì thấy thông báo thay vì danh sách rỗng

**NFR:** lựa chọn được nhớ trên thiết bị tới khi đổi. Ước lượng thô 2 SP — tier Next

### Thực hiện và kết quả mong đợi

STAFF chọn suất và cửa được gán; thử thiếu cửa, cửa suất khác và thu hồi quyền. Không cho quét/tải danh sách khi thiếu quyền.

### Bằng chứng thực thi

- PASS: S29 AC2 changing the gate records the newly selected gate

## S-30 · Sprint 4 · 3 SP — Soát vé bằng cách quét QR tại cửa

### Yêu cầu CSV

- Giả sử quét vé hợp lệ của đúng suất, Khi máy chủ xác nhận, Thì màn hình xanh hiện hạng ghế và số ghế, vé được đánh dấu đã vào kèm cửa và thời điểm
- Giả sử quét mã không phải vé của hệ thống, Khi xử lý, Thì màn hình đỏ báo mã không hợp lệ
- Giả sử mạng chậm, Khi quá 3 giây chưa có trả lời, Thì màn hình báo đang chờ thay vì đứng im

**NFR:** phản hồi sau khi quét dưới 500ms để không tạo hàng chờ; màn hình đọc được dưới nắng. Ước lượng thô 3 SP — tier Next

### Thực hiện và kết quả mong đợi

Quét QR vé đã trả tại cửa đúng; đối chiếu phản hồi và nhật ký. Thử tài khoản thường, thiếu phiên và vé sai chữ ký đều bị từ chối.

### Bằng chứng thực thi

- Xem bộ 45 ca vé/soát vé và các unit trong nhóm chức năng tương ứng; không có phép đo thiết bị thật cho NFR phần cứng.

## S-31 · Sprint 4 · 3 SP — Vé đã soát không dùng lại được lần hai

### Yêu cầu CSV

- Giả sử vé đã vào lúc 19:02 ở cửa A, Khi quét lại ở cửa B, Thì bị từ chối kèm thời điểm và cửa đã vào lần trước
- Giả sử hai máy quét cùng một vé trong cùng khoảnh khắc, Khi cả hai tới máy chủ, Thì chỉ một máy báo hợp lệ — cùng nguyên tắc chống trùng như giữ chỗ ở S-13
- Giả sử nhân viên xác nhận khách bị từ chối là chủ vé thật, Khi bấm "cho vào có ghi chú", Thì vé được ghi thêm một lần vào kèm lý do và tên nhân viên

**NFR:** đánh dấu đã vào chống được hai lần quét đồng thời bằng ràng buộc ở cơ sở dữ liệu. Ước lượng thô 3 SP — tier Next

### Thực hiện và kết quả mong đợi

Hai yêu cầu soát cùng vé đồng thời và gửi lại cùng requestId. Chỉ một lượt vào NORMAL, lần hai báo đã dùng; retry không nhân nhật ký.

### Bằng chứng thực thi

- PASS: S31 AC1 duplicate at a different gate shows first gate and time
- PASS: S31 AC3 scoped override records reason staff name and an additional entry
- PASS: S31 override without a reason is rejected

## S-32 · Sprint 4 · 2 SP — Xem lịch sử đơn hàng của tôi

### Yêu cầu CSV

- Giả sử tôi có nhiều đơn, Khi mở lịch sử, Thì thấy danh sách mới nhất trước với trạng thái, sự kiện, số ghế và tổng tiền, phân trang
- Giả sử tôi gọi API với mã đơn của người khác, Khi xử lý, Thì bị từ chối 403
- Giả sử đơn đã hết hạn hoặc đã huỷ, Khi xem, Thì vẫn thấy trong lịch sử với trạng thái tương ứng

**NFR:** phân trang, không tải toàn bộ lịch sử một lần. Ước lượng thô 2 SP — tier Next

### Thực hiện và kết quả mong đợi

BUYER xem danh sách/chi tiết đơn của mình; thử UUID của người khác trả 403. Kiểm tra trạng thái/số tiền/ghế và no-store.

### Bằng chứng thực thi

- Xem bộ 45 ca vé/soát vé và các unit trong nhóm chức năng tương ứng; không có phép đo thiết bị thật cho NFR phần cứng.

## S-33 · Sprint 5 · 3 SP — Tải trước danh sách vé của suất diễn xuống máy quét

### Yêu cầu CSV

- Giả sử tôi đã chọn suất ở S-29 và đang có mạng, Khi bấm "tải danh sách", Thì toàn bộ mã vé hợp lệ và trạng thái đã vào của suất được lưu trên thiết bị kèm thời điểm tải
- Giả sử danh sách đã tải quá 30 phút, Khi còn mạng, Thì máy tự tải lại phần thay đổi
- Giả sử suất có 5000 vé, Khi tải, Thì xong dưới 10 giây trên mạng 4G

**NFR:** dữ liệu trên thiết bị chỉ có mã vé và trạng thái, không có tên hay email khách. Ước lượng thô 3 SP — tier Next

### Thực hiện và kết quả mong đợi

STAFF tải snapshot 5.000 vé rồi delta sau một thay đổi; không có PII, cursor không đúng quyền phải tải full. Mốc dưới 10 giây được đo với mô hình 10Mbps/80ms, cần nghiệm thu thêm trên 4G thật.

### Bằng chứng thực thi

- PASS: S33 measured profile
- PASS: S33 snapshot5000tickets under10s on simulated10Mbps/80ms4G profile, without PII
- PASS: S33 delta contains only changed checked-in ticket; wrong staff cursor falls back to full

## S-34 · Sprint 5 · 5 SP — Soát vé ngoại tuyến bằng danh sách đã tải

### Yêu cầu CSV

- Giả sử máy mất mạng và đã có danh sách ở S-33, Khi quét vé hợp lệ, Thì máy kiểm chữ ký QR bằng khoá công khai, tra mã trong danh sách, báo xanh và ghi lần quét vào hàng đợi cục bộ
- Giả sử vé đã được đánh dấu đã vào trong danh sách tải về, Khi quét ngoại tuyến, Thì báo đỏ như khi có mạng
- Giả sử cùng máy quét một vé hai lần khi mất mạng, Khi quét lần hai, Thì bị từ chối nhờ hàng đợi cục bộ
- Giả sử máy chưa tải danh sách, Khi mất mạng, Thì màn hình báo không soát được và hướng dẫn tải khi có mạng

**NFR:** hàng đợi cục bộ sống qua việc đóng và mở lại ứng dụng. Ước lượng thô 5 SP — tier Next, cần chẻ khi lên Ready

### Thực hiện và kết quả mong đợi

Tải danh sách và khóa, ngắt mạng; thử vé đúng, sai chữ ký, sai suất, không có danh sách, đã dùng và đã huỷ. Chỉ báo xanh sau khi bản ghi đã được lưu IndexedDB thành công.

### Bằng chứng thực thi

- Xem bộ 45 ca vé/soát vé và các unit trong nhóm chức năng tương ứng; không có phép đo thiết bị thật cho NFR phần cứng.

## S-35 · Sprint 5 · 3 SP — Đồng bộ các lần quét ngoại tuyến lên máy chủ khi có mạng lại

### Yêu cầu CSV

- Giả sử máy có 40 lần quét trong hàng đợi, Khi có mạng lại, Thì tự đẩy lên theo lô và hàng đợi về 0
- Giả sử đẩy lên bị ngắt giữa chừng, Khi có mạng lại lần nữa, Thì gửi tiếp phần còn lại và máy chủ không ghi trùng lần đã nhận — mỗi lần quét có mã duy nhất sinh trên thiết bị
- Giả sử máy chủ nhận lần quét cho vé đã vào trước đó ở cửa khác, Khi xử lý, Thì ghi nhận là xung đột để S-36 xử lý, không ghi đè

**NFR:** xử lý một lần quét nhiều lần cho kết quả giống xử lý một lần. Ước lượng thô 3 SP — tier Next

### Thực hiện và kết quả mong đợi

Tạo hàng đợi quét offline; kết nối lại và gửi lô tối đa 40. Chỉ xoá bản ghi có ACK v2 đã commit và đúng localId/requestId; giữ queue khi lỗi 401/403/429/5xx hoặc ACK thiếu.

### Bằng chứng thực thi

- PASS: S35/S36 two offline gates sync in reverse time order; earliest device time wins without deleting logs

## S-36 · Sprint 5 · 3 SP — Xung đột soát vé ở hai cửa được phát hiện khi đồng bộ

### Yêu cầu CSV

- Giả sử vé được quét ở cửa A và cửa B trong lúc cả hai mất mạng, Khi hai máy đồng bộ, Thì lần quét sớm hơn theo giờ thiết bị được tính là lần vào, lần kia thành xung đột
- Giả sử có xung đột, Khi ban tổ chức mở báo cáo suất, Thì thấy danh sách vé, hai cửa, hai thời điểm

**NFR:** giờ thiết bị lệch được ghi lại lúc đồng bộ để đọc báo cáo đúng. Ước lượng thô 3 SP — tier Next

### Thực hiện và kết quả mong đợi

Hai thiết bị quét cùng vé khi offline; đồng bộ thiết bị có thời điểm muộn trước. Đối chiếu thời điểm gốc quyết định NORMAL, giữ log EXCEPTION và không đếm khách hai lần.

### Bằng chứng thực thi

- PASS: S35/S36 two offline gates sync in reverse time order; earliest device time wins without deleting logs

## S-37 · Sprint 5 · 2 SP — Máy quét hiện rõ trạng thái mạng và số lần quét chưa đồng bộ

### Yêu cầu CSV

- Giả sử mất mạng, Khi màn hình quét đang mở, Thì có dải cảnh báo ngoại tuyến và bộ đếm lần quét chưa đồng bộ
- Giả sử có mạng lại và đẩy xong, Khi bộ đếm về 0, Thì dải cảnh báo biến mất

**NFR:** trạng thái mạng đo bằng lần gọi máy chủ gần nhất, không chỉ dựa vào cờ của trình duyệt. Ước lượng thô 2 SP — tier Next

### Thực hiện và kết quả mong đợi

Chuyển trạng thái mạng/server không tới được; kiểm tra nhãn online/offline và bộ đếm hàng đợi tồn tại sau tải lại, giảm chỉ sau ACK.

### Bằng chứng thực thi

- Xem bộ 45 ca vé/soát vé và các unit trong nhóm chức năng tương ứng; không có phép đo thiết bị thật cho NFR phần cứng.

## S-38 · Sprint 5 · 2 SP — Xem vé của tôi trong tài khoản và tải lại mã QR

### Yêu cầu CSV

- Giả sử tôi có vé cho suất sắp tới, Khi mở mục "vé của tôi", Thì thấy vé sắp diễn lên trước, vé đã qua xếp sau
- Giả sử tôi mở một vé, Khi trang hiện, Thì QR đủ lớn để quét từ màn hình điện thoại và có nút tải ảnh

**NFR:** vé đã huỷ hiện mờ và không có QR. Ước lượng thô 2 SP — tier Next

### Thực hiện và kết quả mong đợi

Người mua mở Vé của tôi, xem QR và tải PNG; vé huỷ vẫn thấy trạng thái nhưng không hiện QR dùng vào cửa. Không xem được vé người khác.

### Bằng chứng thực thi

- PASS: S38 cancelled tickets remain visible in MyTickets without QR

## S-39 · Sprint 5 · 2 SP — Quét vé sai suất diễn, vé đã huỷ hay mã lạ thì báo rõ lý do

### Yêu cầu CSV

- Giả sử quét vé của suất khác, Khi từ chối, Thì hiện "vé của suất X lúc Y" để khách biết mình nhầm giờ
- Giả sử quét vé đã huỷ và hoàn tiền, Khi từ chối, Thì hiện "vé đã huỷ ngày Z"
- Giả sử quét mã lạ, Khi từ chối, Thì hiện "không phải vé của hệ thống"

**NFR:** mỗi lý do từ chối là một mã riêng trong log để đếm được. Ước lượng thô 2 SP — tier Next

### Thực hiện và kết quả mong đợi

Quét vé sai suất, mã không có, QR hỏng, vé huỷ và vé đã dùng; kiểm tra từng mã lỗi và thông báo tương ứng.

### Bằng chứng thực thi

- Xem bộ 45 ca vé/soát vé và các unit trong nhóm chức năng tương ứng; không có phép đo thiết bị thật cho NFR phần cứng.

## S-40 · Sprint 6 · 8 SP — Hàng đợi phòng chờ khi lượng truy cập vượt ngưỡng

### Yêu cầu CSV

- Vượt ngưỡng người đang chọn ghế thì người mới vào phòng chờ theo thứ tự đến, thấy vị trí của mình, tới lượt thì được vào trang chọn ghế với một lượt có thời hạn; hết lượt không thao tác thì mất chỗ. Chưa refine chi tiết — tier Later, ước lượng thô 8 SP, cần chẻ ít nhất ba story khi lên Next

**NFR:** chưa refine — cần chốt ngưỡng, thời gian giữ lượt, và hàng đợi đặt ở Redis hay ở tầng trước ứng dụng

### Thực hiện và kết quả mong đợi

Đặt capacity=1 trong bản sao: A được vào, B/C xếp FIFO; refresh không nhân thành viên/kéo dài lease; hết lease chuyển lượt; POST holds trực tiếp không vượt phòng chờ.

### Bằng chứng thực thi

- PASS: S40 direct hold API cannot bypass waiting room
- PASS: S40 first actor admitted; second queued in FIFO order
- PASS: S40 refresh does not duplicate member or extend active lease
- PASS: S40 expired lease loses slot and next waiting actor is promoted

## S-41 · Sprint 6 · 3 SP — Giới hạn tần suất yêu cầu theo tài khoản và theo IP

### Yêu cầu CSV

- Vượt ngưỡng số yêu cầu mỗi phút trên API giữ ghế và tạo đơn thì bị từ chối tạm thời kèm thời gian chờ; ngưỡng tính riêng theo tài khoản và theo IP. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**NFR:** chưa refine — cần chốt ngưỡng, tránh chặn nhầm người dùng chung mạng ký túc xá hay công ty

### Thực hiện và kết quả mong đợi

Chạm ngưỡng tài khoản rồi dùng IP khác, đổi tài khoản cùng IP và giả x-forwarded-for. Kiểm tra 429/Retry-After, cửa sổ hồi phục và peer được ký bởi transport; cả đường dẫn hoa/thừa slash/mã hóa đều được bảo vệ.

### Bằng chứng thực thi

- PASS: S41 account budget is independent of IP and returns positive wait
- PASS: S41 IP budget applies across accounts

## S-42 · Sprint 6 · 3 SP — Giới hạn số vé mỗi tài khoản được mua trong một suất

### Yêu cầu CSV

- Ban tổ chức đặt giới hạn theo suất; tổng ghế đang giữ cộng đã mua của một tài khoản vượt giới hạn thì không giữ thêm được. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**NFR:** chưa refine — cần chốt giới hạn tính theo tài khoản hay theo số điện thoại đã xác minh

### Thực hiện và kết quả mong đợi

Đặt quota suất thấp; giữ ghế và tạo đơn đồng thời từ cùng tài khoản. Tổng DISTINCT ghế đang giữ/đơn còn hiệu lực/đã trả không vượt quota; suất khác/tài khoản khác độc lập.

### Bằng chứng thực thi

- PASS: S42 concurrent same-account distinct-seat claims cannot exceed cap
- PASS: S42 repeated same held seat does not double-count quota

## S-43 · Sprint 6 · 3 SP — Giám sát và cảnh báo khi hệ thống quá tải

### Yêu cầu CSV

- Có bảng theo dõi số yêu cầu, tỉ lệ lỗi, thời gian phản hồi p95, số tranh chấp ghế và số webhook bị từ chối; vượt ngưỡng thì gửi cảnh báo. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**NFR:** chưa refine — cần chốt kênh nhận cảnh báo và công cụ thu thập số liệu

### Thực hiện và kết quả mong đợi

ADMIN mở Vận hành và báo cáo; kích hoạt ngưỡng lỗi/latency/conflict/webhook trong môi trường kiểm thử. Kiểm tra metric producer thật, endpoint token nội bộ, RBAC và lịch sử cảnh báo trong ứng dụng.

### Bằng chứng thực thi

- PASS: S43 real rejected-webhook producer appears in protected metrics

## S-44 · Sprint 6 · 3 SP — Sơ đồ ghế tự cập nhật trạng thái mà không cần tải lại trang

### Yêu cầu CSV

- Ghế đổi trạng thái thì mọi người đang mở sơ đồ suất đó thấy thay đổi trong vòng 2 giây mà không tải lại. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**NFR:** chưa refine — cần chốt đẩy từ máy chủ hay hỏi lại định kỳ, và mức tải chấp nhận được với 2000 người cùng xem

### Thực hiện và kết quả mong đợi

Mở hai client; thay đổi giữ/bán/giá/hết TTL, kiểm tra trạng thái tự cập nhật. Bài tải 2.000 SSE client đọc snapshot và kiểm ghế mới dưới 2 giây; không phải 2.000 trình duyệt render/camera.

### Bằng chứng thực thi

- PASS: S44 observed TTL expiry latency
- PASS: S44 two SSE clients observe TTL expiry within2seconds without cleanup sweep

## S-45 · Sprint 7 · 5 SP — Khách huỷ vé trước hạn và được hoàn tiền theo chính sách

### Yêu cầu CSV

- Huỷ trước mốc quy định thì vé chuyển sang đã huỷ, lệnh hoàn theo tỉ lệ chính sách được gửi tới cổng và khách thấy số tiền sẽ nhận; huỷ sau mốc thì bị từ chối kèm lý do. Chưa refine chi tiết — tier Later, ước lượng thô 5 SP

**NFR:** chưa refine — cần chốt mốc thời gian, tỉ lệ hoàn, và cổng sandbox có hỗ trợ hoàn tiền không

### Thực hiện và kết quả mong đợi

Đơn đã trả, chưa soát, trước giờ diễn ít nhất 24h: xem preview, xác nhận huỷ toàn đơn, hoàn mock 100%. Thử đơn người khác, thiếu xác nhận, sát giờ và đã soát phải bị chặn.

### Bằng chứng thực thi

- PASS: S45 preview contains approved24h/100percent policy
- PASS: S45 another buyer cannot preview or cancel order
- PASS: S45 cancellation is concurrent-idempotent and creates one refund
- PASS: S45 after-cutoff cancellation fails without refund or state mutation
- PASS: S45 checked-in order cannot be buyer-cancelled

## S-46 · Sprint 7 · 3 SP — Ghế của vé đã huỷ quay lại kho bán

### Yêu cầu CSV

- Vé huỷ xong thì ghế trở lại trạng thái trống trên sơ đồ và giữ được như ghế thường. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**NFR:** chưa refine — cần chốt mở bán lại tự động hay chờ ban tổ chức duyệt

### Thực hiện và kết quả mong đợi

Sau huỷ, vé bị thu hồi và ghế mở bán ngay trong cùng transaction. Người khác giữ/mua lại; callback thanh toán cũ không làm sống lại đơn đã huỷ.

### Bằng chứng thực thi

- PASS: S46 releases all seats, invalidates QR and emits refresh
- PASS: S46 retry old cancellation cannot release seat sold to new order

## S-47 · Sprint 7 · 5 SP — Ban tổ chức huỷ suất diễn và hoàn tiền hàng loạt

### Yêu cầu CSV

- Huỷ suất thì suất đóng bán, mọi vé chuyển sang đã huỷ, một lệnh hoàn 100% được tạo cho từng đơn và chạy nền theo lô, khách nhận email thông báo. Chưa refine chi tiết — tier Later, ước lượng thô 5 SP

**NFR:** chưa refine — cần chốt cách xử lý khi một lệnh hoàn trong lô thất bại và giới hạn tốc độ gọi cổng

### Thực hiện và kết quả mong đợi

ORGANIZER chủ sở hữu nhập lý do và xác nhận huỷ suất; đóng bán/giữ mới, xử lý từng lô đơn paid, gửi thông báo outbox. Gọi lặp/khởi chạy tiếp không nhân refund; tổ chức khác bị 403.

### Bằng chứng thực thi

- PASS: S47 only organizer owner can cancel show; job is idempotent and closes hold API
- PASS: S47 batch resumes until all paid orders revoked with full refunds
- PASS: S47 cancellation notification outbox sends once and skips erased/disabled recipient

## S-48 · Sprint 7 · 3 SP — Lệnh hoàn tiền thất bại được thử lại và báo cho kế toán

### Yêu cầu CSV

- Lệnh hoàn thất bại được thử lại tối đa 3 lần cách nhau tăng dần; vẫn thất bại thì vào danh sách cần xử lý tay của kế toán kèm lý do từ cổng. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**NFR:** chưa refine — cần chốt kênh báo và thời hạn xử lý tay

### Thực hiện và kết quả mong đợi

Mock refund lỗi hai lần rồi thành công và lỗi đủ ba lần. Đối chiếu số attempt/backoff/trạng thái; ACCOUNTANT xử lý tay giả lập có lý do; BUYER bị chặn.

### Bằng chứng thực thi

- PASS: S48 concurrent refund workers complete each refund once with fenced receipt
- PASS: S48 three failures use increasing backoff then appear in accountant list
- PASS: S48 buyer cannot resolve refund; accountant manual mock resolution works

## S-49 · Sprint 7 · 3 SP — Nhật ký thao tác trên đơn hàng và vé

### Yêu cầu CSV

- Mọi thay đổi trạng thái đơn, vé, giữ chỗ do người hay do job đều có bản ghi kèm tác nhân, thời điểm, trạng thái trước và sau; xem được theo đơn. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**NFR:** chưa refine — cần chốt thời gian lưu nhật ký và bảng riêng hay dùng chung với `payment_events`

### Thực hiện và kết quả mong đợi

Giữ ghế → tạo đơn → thanh toán → quét/huỷ/hoàn; xem timeline đúng chủ sở hữu và actor/thời điểm/trạng thái. Transaction rollback không tạo audit thành công; không cho sửa/xoá domain_audit.

### Bằng chứng thực thi

- PASS: S49 audit has before/after and human actor, other buyer403
- PASS: S49 rolled-back state change leaves no audit success record

## S-50 · Sprint 8 · 3 SP — Xem doanh thu và tồn vé theo suất diễn

### Yêu cầu CSV

- Bảng theo suất diễn có số vé đã bán, số ghế đang giữ, số ghế còn, doanh thu theo hạng, cập nhật không trễ quá 1 phút. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**NFR:** chưa refine — cần chốt tính thời gian thực hay tổng hợp theo lô

### Thực hiện và kết quả mong đợi

So sánh báo cáo suất theo hạng vé với snapshot unitPrice đơn và refund; kiểm tra thu/hoàn/net, đã bán/đang giữ/còn trống, owner RBAC. UI refresh 15 giây.

### Bằng chứng thực thi

- PASS: S50 report separates gross/refunded/net and excludes released seats from sold
- PASS: S50/S52 reports deny unrelated organizer

## S-51 · Sprint 8 · 5 SP — Đối soát giao dịch hệ thống với sao kê cổng thanh toán

### Yêu cầu CSV

- Nạp tệp sao kê của cổng theo kỳ, hệ thống ghép theo mã giao dịch với `payment_events` và chỉ ra ba nhóm: khớp, có ở hệ thống mà không có ở cổng, có ở cổng mà không có ở hệ thống; lệch số tiền cũng thành một dòng. Chưa refine chi tiết — tier Later, ước lượng thô 5 SP

**NFR:** chưa refine — cần chốt định dạng sao kê của cổng đã chọn

### Thực hiện và kết quả mong đợi

Nhập CSV mock transactionId,amount theo kỳ UTC; dry-run rồi lưu và nạp lặp. Đủ 4 nhóm, hash chống trùng; từ chối dòng lỗi, duplicate ID, formula injection, file quá 1MB và sai quyền.

### Bằng chứng thực thi

- PASS: S51 dryrun returns4groups and does not save or mutate payments
- PASS: S51 repeated statement is deduplicated; malformed and buyer import rejected

## S-52 · Sprint 8 · 2 SP — Ban tổ chức xem số khách đã vào cửa theo thời gian thực

### Yêu cầu CSV

- Màn hình theo suất hiện số đã vào, số chưa vào, tốc độ vào theo phút và theo từng cửa, kể cả số liệu từ máy đang ngoại tuyến sau khi đồng bộ. Chưa refine chi tiết — tier Later, ước lượng thô 2 SP

**NFR:** chưa refine — cần chốt tần suất cập nhật

### Thực hiện và kết quả mong đợi

Quét online và sync offline lệch thứ tự; báo cáo theo phút/cửa, đếm NORMAL một lần, không đếm EXCEPTION trùng. Huỷ vé loại khỏi thống kê; UI refresh 15 giây.

### Bằng chứng thực thi

- PASS: S50/S52 reports deny unrelated organizer
- PASS: S52 per-minute/per-gate attendance includes offline original time; EXCEPTION does not count twice
- PASS: S52 cancelled tickets are excluded from attendance

## S-53 · Sprint 8 · 5 SP — Khách yêu cầu xoá dữ liệu cá nhân của mình

### Yêu cầu CSV

- Sau khi yêu cầu được duyệt, họ tên, email, số điện thoại bị thay bằng giá trị ẩn danh trong mọi bảng, tài khoản không đăng nhập được nữa, nhưng đơn hàng, giao dịch và số liệu doanh thu vẫn nguyên để phục vụ kế toán. Chưa refine chi tiết — tier Later, ước lượng thô 5 SP

**NFR:** chưa refine — cần người có thẩm quyền xác nhận phạm vi dữ liệu phải xoá và dữ liệu phải giữ theo luật kế toán. **Skill không đưa tư vấn pháp lý**

### Thực hiện và kết quả mong đợi

Người dùng gửi yêu cầu; ADMIN xem xét và phê duyệt. Kiểm tra ẩn danh PII, vô hiệu hóa phiên, dừng outbox không gửi tới người đã xóa; giữ FK/đơn/tiền; phê duyệt lặp idempotent.

### Bằng chứng thực thi

- PASS: S53 erasure requires owner request and ADMIN approval
- PASS: S53 approved erasure is idempotent; disables sessions and preserves orders/money

## S-54 · Sprint 8 · 2 SP — Người dùng đồng ý điều khoản và chính sách riêng tư, thu hồi được

### Yêu cầu CSV

- Khi đăng ký phải tích đồng ý, hệ thống lưu phiên bản và thời điểm; đổi phiên bản chính sách thì lần đăng nhập sau phải đồng ý lại; người dùng thu hồi được và khi đó không nhận email tiếp thị nữa. Chưa refine chi tiết — tier Later, ước lượng thô 2 SP

**NFR:** chưa refine — nội dung điều khoản do người có thẩm quyền cung cấp, không phải dev soạn

### Thực hiện và kết quả mong đợi

Đăng ký ghi version/mục đích/timestamp. Đổi version buộc chấp nhận bản mới khi cấu hình bật; bản cũ bị từ chối. Rút tiếp thị không tắt thư giao dịch; mặc định không cấp mục đích tiếp thị mà thông báo hiện hành chưa cho phép.

### Bằng chứng thực thi

- PASS: S54 signup persists consent version and timestamp via registration API
- PASS: S54 marketing opt-out preserves transactional session and version history
- PASS: S54 policy version change requires explicit acceptance, old version rejected

## S-55 · Sprint 8 · 3 SP — Sao lưu cơ sở dữ liệu hằng ngày và diễn tập khôi phục

### Yêu cầu CSV

- Job sao lưu chạy mỗi đêm, bản sao lưu đẩy ra ngoài máy chủ ứng dụng, giữ 14 bản gần nhất; đã khôi phục thử lên môi trường tạm và ứng dụng chạy được với dữ liệu đó; quy trình khôi phục ghi trong README. Chưa refine chi tiết — tier Later, ước lượng thô 3 SP

**NFR:** chưa refine — cần chốt nơi lưu bản sao lưu và mã hoá

### Thực hiện và kết quả mong đợi

Chạy backup AES-GCM và SHA256 manifest; restore vào DB codegym_restore_* mới, khởi động API, đối chiếu 40/40/5544 và vé/khóa lịch sử. Kiểm tra integrity/retention bằng unit. Lịch daily và off-host cần đích UNC thật do người vận hành cung cấp.

### Bằng chứng thực thi

- Xem bộ 45 ca vé/soát vé và các unit trong nhóm chức năng tương ứng; không có phép đo thiết bị thật cho NFR phần cứng.

## Cách chạy lại

Chạy tại thư mục gốc, Docker đang hoạt động.

```powershell
pnpm --filter api build
pnpm --filter api test -- --maxWorkers=1
pnpm --filter web test -- --maxWorkers=1
pnpm typecheck
pnpm lint
node .cache/verify-sprint4-5-20261022.mjs
```

Tại `apps/api`:

```powershell
node --env-file=../../.env scripts/run-isolated-e2e.mjs
node --env-file=../../.env --env-file=../../.cache/sprint4-8-evidence/20261022/test-database.env scripts/verify-sprint6-8.mjs
node --test scripts/sprint-backup.spec.mjs
node --env-file=../../.env scripts/verify-backup-drill.mjs
```

`verify-sprint6-8` yêu cầu DB `codegym_sprint_*` được chuẩn bị bởi `prepare-sprint-test-db.mjs`; không trỏ thẳng main. Không chạy các bài đo latency cùng build/bài tải khác. Các script fixture/catcher trong `.cache` là bằng chứng local, không được commit.

## Nghiệm thu thủ công còn lại

1. Điện thoại có camera thật: QR trên màn hình/giấy, ánh sáng ngoài trời, xoay màn hình, từ chối camera và mất quyền camera.
2. Thiết bị thật ngắt Wi-Fi/4G, tải lại scanner khi offline, đóng/mở trình duyệt, quota IndexedDB và đồng bộ hai máy.
3. 4G thật với 5.000 vé; đo tốc độ tải/khả năng quét liên tục và thời gian render của nhiều trình duyệt.
4. Cấu hình UNC/off-host, giữ khóa backup trong kho an toàn, đăng ký Task Scheduler rồi theo dõi ít nhất một lần daily và phục hồi từ chính bản off-host.
5. Người mua kiểm tra Gmail Inbox/Spam; dùng gửi lại vé của chính đơn nếu cần, không sửa trạng thái SENT để phát tán lại hàng loạt.
