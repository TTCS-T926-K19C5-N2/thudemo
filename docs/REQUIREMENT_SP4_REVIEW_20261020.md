# Đối chiếu Requirement sp4 với Codegym ngày 20 tháng 10 năm 2026

**Kết luận: chưa đủ điều kiện nghiệm thu toàn bộ Requirement_sp4.docx.** Bảy chức năng S-25 đến S-31 đều có mã triển khai, nhưng gửi vé qua email chưa hoạt động trong cấu hình đang chạy, thông báo khi khóa tài khoản không khớp yêu cầu và còn thiếu bằng chứng nghiệm thu giao diện, thiết bị và hiệu năng.

Nguồn yêu cầu là [Requirement_sp4.docx](D:/Merge_2/Requirement_sp4.docx), đã đọc cả sáu cột ID, Title, Story, AC, Deps, NFR. Tài liệu có **7 story, 21 tiêu chí AC và các NFR đi kèm**. Không sử dụng báo cáo Requirements_2 ngày 19/10 để thay thế tài liệu này.

Đối tượng kiểm tra là `D:\Merge_2\Codegym`, nhánh `codex/integrate-thudemo-features`, web cổng 3000, API cổng 3001. Kết quả áp dụng cho mã và môi trường local hiện tại; không phải nghiệm thu production hoặc thanh toán MoMo thật.

SHA256 tài liệu gốc: `726d57db7bdfc7c1852e783a84716d526ff687592df6769ae84bcc24d8a5a135`.

## Tóm tắt từng chức năng

| ID | Chức năng đã có | Kết luận hiện tại |
|---|---|---|
| S-25 | Vé riêng từng ghế sau thanh toán, thông tin vé, QR khác nhau, chặn đơn chưa trả | **Đạt phần API đã kiểm tra**; cần kiểm tra trang đơn và ảnh QR trên thiết bị thực tế để nghiệm thu đầy đủ hành trình |
| S-26 | QR Ed25519, nhận diện phiên bản khóa, xác minh bằng khóa công khai, giữ vé cũ khi luân chuyển khóa | **Đạt kiểm tra logic chữ ký và API đã chạy**; trải nghiệm máy quét khi mất mạng hoàn toàn chưa được nghiệm thu |
| S-27 | Outbox gửi vé, PNG QR, gửi lại, retry và danh sách lỗi cho admin | **Chưa đạt trên website đang chạy**: worker gửi vé chưa bật, hai thư chưa có lần gửi nào dù thư cũ nhất chờ hơn 5 giờ |
| S-28 | API tạo nhân viên, đổi vai trò có hiệu lực ngay, vô hiệu hóa và audit | **Đạt một phần**: thiếu thông báo liên hệ quản trị khi tài khoản bị khóa; giao diện tài khoản STAFF còn nội dung cho người mua; môi trường hiện chưa có ADMIN |
| S-29 | Suất hôm nay, cửa theo phân công, chặn bật camera khi thiếu lựa chọn, lưu lựa chọn local | **Đạt phần API và trạng thái không có suất**; chưa nghiệm thu nhớ lựa chọn qua tải lại trên điện thoại. STAFF hiện chưa được phân công |
| S-30 | Nhận QR có chữ ký, trả kết quả soát, thông tin ghế, trạng thái chờ 3 giây | **Đạt phần API và bộ đếm chờ**; chưa đo thời gian từ quét đến hiển thị dưới 500 ms, chưa kiểm tra camera/màn hình dưới nắng |
| S-31 | Từ chối dùng lại, trả thời điểm/cửa cũ, chống đồng thời, cho vào có ghi chú theo quyền cửa | **Đạt các kịch bản API đã kiểm tra**, kể cả ngoại lệ có lý do và tên nhân viên; chưa nghiệm thu toàn bộ giao diện thao tác trên thiết bị |

## Bằng chứng kiểm tra thực tế

### Môi trường đang chạy

- Database đúng là `codegym_local`, localhost:5432. Vẫn có 40 sự kiện.
- API health và catalog qua web cổng 3000 trả HTTP 200; catalog trả tổng 40.
- `.env` không cấu hình `TICKET_MAIL_WORKER=true`. Mã dịch vụ chỉ khởi chạy worker khi giá trị này là `true`.
- Bảng `ticket_mail_deliveries` có **2 bản ghi QUEUED, attempts=0**. Lúc kiểm tra 15:08 ngày 20/10/2026 theo giờ Việt Nam, thư cũ nhất đã chờ khoảng **18.139 giây**, hơn 5 giờ. Vì vậy tiêu chí gửi vé trong 1 phút chưa đạt, dù SMTP đăng ký đã được kiểm tra kết nối thành công trước đó.
- Database hiện có **0 tài khoản ADMIN**, 1 STAFF và 1 ORGANIZER. API quản trị có triển khai, nhưng chưa có tài khoản ADMIN để chủ dự án sử dụng giao diện đó.
- Tài khoản `soatve@codegym.local` đã được kiểm tra đăng nhập ở đợt kiểm tra soát vé; không có suất/cửa được phân công. Không tự phân công vào 40 sự kiện để tạo kết quả đạt.

### Database và SMTP kiểm tra riêng

Đã chạy **45 kịch bản tích hợp: 44 đạt, 1 không đạt**. Kịch bản không đạt xác nhận đúng sai khác của S-28: tài khoản bị vô hiệu hóa trả thông báo chung, không hướng dẫn liên hệ quản trị.

Các thao tác tạo tài khoản ADMIN/nhân viên, thay vai trò, khóa tài khoản, tạo đơn ba ghế, thanh toán giả lập, ghi nhận vào cửa, đổi cửa, cho vào theo ngoại lệ và tạo lỗi gửi thư chỉ chạy trong database bản sao. SMTP nhận thư chỉ lắng nghe trên localhost; không gửi thư kiểm tra tới Gmail thật hoặc người dùng khác. Database bản sao được dọn sau khi chạy.

Kiểm tra email trên bản sao có chủ động bật worker: nhận đủ ba ảnh PNG QR trong dưới 60 giây; gửi lại giữ nguyên ba QR và số vé; lỗi SMTP được thử ba lần tổng cộng, lịch chờ tăng từ khoảng 5 giây lên 15 giây rồi chuyển FAILED. Đã kiểm tra admin đọc được lỗi cuối cùng. Việc đẩy lịch retry tới hạn trong database bản sao chỉ để tăng tốc thử nghiệm, không thay chính sách của ứng dụng chính.

### Unit test và kiểm tra TypeScript

| Lần chạy phục vụ đối chiếu này | Tổng | Đạt | Không đạt |
|---|---:|---:|---:|
| Tích hợp HTTP, PostgreSQL, SMTP localhost | 45 | 44 | 1 |
| API: QR, khóa ký, vé, hợp đồng soát vé, đăng nhập | 72 | 63 | 9 |
| Web: đăng nhập, QR vé, API vé, xử lý quét/chờ, chọn suất | 31 | 30 | 1 |

`pnpm typecheck` **không đạt**, có 21 lỗi TypeScript tại phần API, chủ yếu là test chưa cập nhật theo dịch vụ/controller mới. Lệnh dừng ở API nên không được coi là đã kiểm tra web bằng lệnh tổng này. Lần kiểm tra TypeScript web riêng trước đó đã đạt; không suy kết quả trước đó thành việc toàn bộ dự án hiện đã đạt.

Không thay test để làm đẹp kết quả. Trong 9 lỗi API ở nhóm vừa chạy: 8 lỗi thuộc TicketsService có mock thiếu projection/`$executeRaw`, 1 lỗi đăng nhập do mock thiếu `$transaction`. Lỗi web đăng nhập mong STAFF quay về `/events/new`, trong khi mã hiện ưu tiên `/check-in`, phù hợp hướng phân quyền của S-28. Sai lệch giữa test và mã cần được xử lý trước khi có bộ regression đáng tin cậy; test lỗi không tự động chứng minh API tương ứng hỏng, nhưng cũng không thể được báo là đạt.

## Đối chiếu 21 tiêu chí nghiệm thu

“Đạt API” dưới đây chỉ nói đến hành vi máy chủ đã chạy thực tế. Các tiêu chí có màn hình, camera hoặc điện thoại được ghi riêng phần chưa kiểm chứng.

| ID | Tiêu chí trong tài liệu | Kết quả và giới hạn |
|---|---|---|
| S-25 AC1 | Sau PAID, mỗi ghế có vé, QR, tên sự kiện, suất, hạng và số ghế | **Đạt API**: đơn ba ghế trả đúng ba vé với các trường này. Mã UI hiển thị danh sách vé có sẵn; chưa nghiệm thu hình ảnh trang đơn trên điện thoại |
| S-25 AC2 | Ba ghế có ba QR khác nhau, không suy ra mã khác | **Đạt kiểm tra**: ba payload và ba ID khác nhau; ID vé trình bày là UUID v4, mã vé trong bảng tickets có 128 bit ngẫu nhiên |
| S-25 AC3 | Đơn chưa trả không có vé dù truy cập URL | **Đạt API**: endpoint vé trả 409 và không có bản ghi vé cho đơn đang chờ |
| S-26 AC1 | QR gồm vé, suất, chữ ký; sửa một ký tự bị từ chối | **Đạt**: API từ chối QR giả; unit test kiểm tra payload/signature và Web Crypto xác minh bằng SPKI công khai |
| S-26 AC2 | Đổi khóa ký vẫn nhận vé cũ nhờ phiên bản khóa | **Đạt unit test**: key ring giữ k1 khi chuyển sang k2, nhận vé cũ và ký vé mới bằng k2. Chưa diễn tập luân chuyển khóa trên môi trường triển khai |
| S-26 AC3 | QR tự tạo không có chữ ký bị từ chối | **Đạt unit test và hợp đồng API**: mã trần/thiếu chữ ký không được chấp nhận |
| S-27 AC1 | Tự gửi đủ ảnh QR tới email tài khoản trong 1 phút | **Không đạt runtime**: worker tắt, hai thư đang chờ. **Đạt trên bản sao có bật worker và SMTP localhost** |
| S-27 AC2 | Gửi lỗi có retry tăng dần, tối đa ba lần rồi lưu lỗi | **Đạt kịch bản ba lần tổng cộng trên bản sao**, có FAILED/RETRY_EXHAUSTED và bản ghi cho admin. Cần thống nhất nếu “ba lần thử lại” được hiểu là thêm ba lần ngoài lần gửi đầu, vì mã hiện dùng ba lần tổng cộng |
| S-27 AC3 | Gửi lại đúng vé cũ, không sinh vé mới | **Đạt trên bản sao**: QR và số vé giữ nguyên. **Chưa dùng được với cấu hình hiện tại** vì endpoint yêu cầu worker bật và trả TICKET_MAIL_UNAVAILABLE khi worker tắt |
| S-28 AC1 | Admin tạo STAFF; đăng nhập chỉ thấy màn hình quét | **Một phần**: API admin tạo STAFF thành công; login chuyển STAFF tới `/check-in`. Trang `/account` còn nội dung “Khám phá sự kiện, chọn và giữ ghế” cho mọi vai trò không phải ORGANIZER. Chưa có ADMIN trong database hiện tại |
| S-28 AC2 | Đổi vai trò có hiệu lực ngay ở API kế tiếp | **Đạt API**: đổi STAFF sang ACCOUNTANT, giữ phiên đang có, `/auth/me` trả vai trò mới và API scanner bị từ chối 403 |
| S-28 AC3 | Vô hiệu hóa thì không đăng nhập được và có hướng dẫn liên hệ admin | **Chưa đạt đầy đủ**: đăng nhập bị từ chối 401 và phiên bị thu hồi đúng; thông báo chỉ là “Email hoặc mật khẩu không đúng.”, thiếu phần liên hệ quản trị |
| S-29 AC1 | Điện thoại phải chọn suất hôm nay và cửa trước khi bật camera | **Đạt API và có điều kiện khóa nút trong mã UI**: lọc suất theo ngày Việt Nam, chỉ cửa được phân công. Chưa nghiệm thu camera trên điện thoại |
| S-29 AC2 | Đổi cửa thì các lần quét sau ghi cửa mới | **Đạt API**: tạo cửa B trong bản sao, vé tiếp theo ghi đúng tên cửa B |
| S-29 AC3 | Không có suất hôm nay phải hiện thông báo | **Đã có và đã quan sát ở kiểm tra giao diện**: “Không có suất diễn nào hôm nay được phân công cho bạn.”; nút quét bị khóa |
| S-30 AC1 | Vé hợp lệ hiện xanh, hạng/số ghế; lưu cửa/thời điểm | **Đạt API**: SUCCESS có ghế, cửa và thời điểm; dữ liệu đã vào được lưu. Mã UI có trạng thái thành công màu xanh; chưa nghiệm thu thao tác camera và màn hình thật |
| S-30 AC2 | Mã ngoài hệ thống hiện đỏ, báo không hợp lệ | **Đạt API từ chối QR giả**; mã UI có trạng thái INVALID màu đỏ. Chưa kiểm tra bằng ảnh QR ngoài hệ thống qua camera |
| S-30 AC3 | Quá 3 giây phải báo đang chờ | **Đạt unit test với fake timer**: trước 3 giây chưa báo, đúng 3 giây báo WAITING; phản hồi nhanh/hủy yêu cầu dọn timer |
| S-31 AC1 | Quét lại ở cửa khác bị từ chối kèm cửa/thời gian lần đầu | **Đạt API**: 409, đúng firstAdmission.gateName và checkedInAt |
| S-31 AC2 | Hai máy cùng quét chỉ một lượt hợp lệ | **Đạt kịch bản đồng thời trên PostgreSQL**: hai yêu cầu nhận một 200 và một 409 |
| S-31 AC3 | Cho vào có ghi chú lưu thêm lần vào, lý do và nhân viên | **Đạt API khi được cấp quyền theo cửa**: EXCEPTION_RECORDED lưu reason, staffId, staffName và gateName; thiếu lý do bị từ chối; STAFF không có canOverride không được dùng ngoại lệ |

## Đối chiếu các yêu cầu phi chức năng

| ID | NFR | Đánh giá |
|---|---|---|
| S-25 | Mã ngẫu nhiên đủ dài, không tăng dần | Có `randomBytes(16)` tạo mã 128 bit; UUID vé dùng ngẫu nhiên. Đã kiểm tra bộ ba vé khác nhau. Không áp một độ dài ký tự tùy ý ngoài yêu cầu |
| S-26 | Khóa riêng chỉ trên server, máy quét chỉ giữ khóa công khai | Cấu hình ký đọc ở API; phản hồi scanner chỉ có public key. Unit test kiểm tra không chứa PRIVATE và verifier-only không thể ký. Không đưa khóa bí mật vào báo cáo |
| S-27 | Không chứa thông tin thanh toán; dùng lớp T-08 | Ticket mail dùng MailService chung; email mẫu nhận qua SMTP localhost có ba ảnh QR, không có các trường payment/gateway. Nội dung sinh thư không đưa số tiền/thông tin cổng vào email |
| S-28 | Thay đổi vai trò ghi nhật ký kèm người thao tác | CREATE_EMPLOYEE và CHANGE_ROLE đã kiểm tra actor/target trong database; mã TOGGLE_STATUS cũng ghi audit. Việc tạo tài khoản local bằng công cụ thiết lập không thay thế nghiệm thu luồng admin trên giao diện |
| S-29 | Nhớ lựa chọn trên thiết bị tới khi đổi | Có localStorage cho suất/cửa và cấu hình đã cấp. Chưa chạy nghiệm thu reload/đổi cửa trên điện thoại thật nên chưa kết luận đạt hoàn toàn |
| S-30 | Phản hồi sau quét dưới 500 ms | Chưa benchmark thời gian toàn trình từ camera nhận mã đến UI hiển thị. Không suy hiệu năng từ việc unit test chạy nhanh |
| S-30 | Màn hình đọc được dưới nắng | Chưa kiểm tra thiết bị thật/ngoài trời; chưa có bằng chứng nghiệm thu |
| S-31 | Chống quét trùng bằng ràng buộc database | Có partial unique index `ticket_admissions_one_normal` trên ticketId với kind=NORMAL; kịch bản quét đồng thời xác nhận chỉ một lượt thường được ghi nhận |

## Các việc cần xử lý trước khi nghiệm thu

1. Cấu hình worker gửi vé, xác minh riêng luồng gửi vé thật qua Gmail và gửi lại. Bật worker có thể gửi các thư đang chờ, vì vậy đợt đối chiếu này chỉ ghi nhận vấn đề và không tự gửi thư thật.
2. Điều chỉnh thông báo tài khoản bị vô hiệu hóa theo S-28, sau khi xác minh mật khẩu hợp lệ; đồng bộ nội dung/menu của STAFF và thiết lập tài khoản ADMIN theo phân quyền đã duyệt.
3. Cập nhật test cũ theo các dịch vụ mới và xử lý 21 lỗi TypeScript; chạy lại regression trước khi ghi đạt.
4. Tạo phân công và dữ liệu nghiệm thu riêng cho suất diễn trong ngày; kiểm tra trang đơn/vé, lưu lựa chọn, camera, đổi cửa, màu kết quả và quy trình ngoại lệ trên điện thoại.
5. Đo ngưỡng 500 ms và kiểm tra màn hình ngoài trời. Làm rõ ý nghĩa “tối đa ba lần” trong yêu cầu retry.
6. Hoàn tất kiểm tra khả năng mở lại trang scanner khi mất mạng. Kiểm tra trước đã thấy cảnh báo chuẩn bị giao diện ngoại tuyến thất bại; API đồng bộ offline đã qua nhưng không thay thế việc nghiệm thu cả trình duyệt ngoại tuyến.

## Mã nguồn và bằng chứng để kiểm tra lại

- `apps/api/src/tickets/ticket-delivery.service.ts`: bật worker ở dòng 48–54; gửi lại ở dòng 63 trở đi; giới hạn attempts ở dòng 145; backoff ở dòng 240.
- `apps/api/src/tickets/tickets.service.ts`, `ticket-code.ts`: phát vé nguyên tử theo PAID, mã ngẫu nhiên, outbox trong cùng transaction.
- `apps/api/src/orders/ticket-qr.service.ts`: dữ liệu vé cho chủ đơn, chặn đơn chưa thanh toán.
- `apps/api/src/scanner/scanner-crypto.service.ts` và `.spec.ts`: ET1/Ed25519, key ring, từ chối giả mạo, luân chuyển khóa và Web Crypto.
- `apps/api/src/users/users.service.ts`: createEmployee/changeRole/setActive và audit; `apps/api/src/auth/auth.service.ts`: thông báo khóa tài khoản hiện gộp với thông báo sai mật khẩu.
- `apps/web/src/components/login-form.tsx`, `apps/web/src/app/account/page.tsx`: chuyển hướng STAFF và nội dung tài khoản.
- `apps/web/src/features/ticket-scanner/ticket-scanner.tsx`, `check-in-request.ts`: chọn suất/cửa, lưu lựa chọn, camera, WAITING và kết quả.
- `apps/api/src/orders/ticket-check-in.service.ts`, `admission-policy.ts`: chống trùng và ngoại lệ theo quyền cửa.
- `apps/api/prisma/migrations/202610080003_s31_admission_ledger/migration.sql`: unique index của lần vào thường.
- `.cache/verify-requirement-sp4.mjs`: kịch bản kiểm tra bản sao và SMTP localhost.
- `.cache/local-booking/requirement-sp4-verification.json`: đủ 45 kết quả, gồm tiêu chí không đạt.
- `.cache/local-booking/sp4-runtime-audit.json`: hàng đợi và trạng thái cấu hình runtime, không chứa bí mật.
- `.cache/local-booking/sp4-typecheck.log`, `sp4-unit-failures.log`: lỗi kiểm tra thực tế.

Đợt này chỉ đọc mã/cấu hình, chạy kiểm tra trên bản sao và ghi báo cáo. Không sửa logic sản phẩm, không bật gửi thư thật, không đổi quyền tài khoản hoặc dữ liệu sự kiện của database chính; không commit/push.
