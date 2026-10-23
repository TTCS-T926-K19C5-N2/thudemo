# [CẦN CHỐT] Dự thảo thông báo quyền riêng tư cho đăng ký tài khoản thật

> **Trạng thái:** Bản đề xuất để Product Owner và người có chuyên môn pháp lý xem xét. Chưa được phê duyệt, chưa có hiệu lực và không được dùng làm nội dung đồng ý trên website. Không thay thế `PRIVACY-NOTICE-R0-v1.0`, vốn chỉ áp dụng cho dữ liệu giả trên staging.

## 1. Đơn vị chịu trách nhiệm

- **Đơn vị/cá nhân kiểm soát dữ liệu:** [CẦN CHỐT: tên pháp lý, địa chỉ và vai trò].
- **Đầu mối quyền riêng tư:** [CẦN CHỐT: email và/hoặc kênh liên hệ].
- **Ngày hiệu lực và phiên bản:** [CẦN CHỐT sau khi được duyệt].

## 2. Dữ liệu và mục đích dự kiến

Khi bạn tự đăng ký hoặc sử dụng tài khoản, chúng tôi dự kiến xử lý:

- Họ tên và địa chỉ email để tạo tài khoản, gửi liên kết kích hoạt, xác nhận trạng thái tài khoản và hỗ trợ yêu cầu liên quan đến tài khoản.
- Mật khẩu để xác thực. Hệ thống dự kiến lưu bản băm Argon2id thay vì lưu mật khẩu dạng đọc được.
- Mã kích hoạt và thông tin gửi thư cần thiết để phát hành liên kết kích hoạt. Mã dùng để xác thực được lưu dưới dạng băm; bản trong hàng đợi gửi thư được mã hóa.
- Thông tin phiên đăng nhập và dữ liệu bảo vệ dịch vụ, có thể gồm địa chỉ IP và thời điểm yêu cầu khi áp dụng giới hạn đăng nhập/đăng ký. [CẦN CHỐT: chính xác trường được ghi, nơi lưu và thời hạn lưu].
- Phiên bản thông báo và bằng chứng đồng ý khi bạn đăng ký. [CẦN CHỐT: các trường và thời hạn lưu theo cấu hình thực tế].

Các mục đích dự kiến giới hạn ở tạo và bảo vệ tài khoản, xác minh email, duy trì phiên đăng nhập, hỗ trợ người dùng và gửi thông báo thiết yếu về tài khoản. Không dùng cho quảng cáo, bán dữ liệu hoặc tiếp thị nếu chưa có căn cứ và lựa chọn đồng ý riêng phù hợp.

## 3. Dịch vụ nhận dữ liệu và bên được truy cập

- Email kích hoạt dự kiến được chuyển qua **Google Gmail SMTP** nếu chủ vận hành cấu hình tài khoản gửi Gmail. [CẦN CHỐT: pháp nhân nhà cung cấp, tài khoản/workspace sử dụng, khu vực xử lý và thông tin chuyển dữ liệu xuyên biên giới cần công bố].
- Nhà cung cấp máy chủ, cơ sở dữ liệu, lưu trữ bản sao lưu, giám sát và các nhà cung cấp kỹ thuật khác: [CẦN CHỐT: liệt kê tên pháp nhân, vai trò, loại dữ liệu truy cập và vị trí/khu vực xử lý].
- Nhân sự được phân công có thể truy cập dữ liệu ở mức cần thiết để vận hành, bảo mật và hỗ trợ tài khoản. [CẦN CHỐT: nhóm/vai trò, kiểm soát quyền và nhật ký truy cập].
- Không khẳng định nhà cung cấp, nơi lưu trữ hoặc phạm vi chuyển dữ liệu cho đến khi được chủ vận hành xác minh.

## 4. Thời hạn lưu và xóa

- Tài khoản đang hoạt động: [CẦN CHỐT thời hạn lưu và tiêu chí bắt đầu tính].
- Tài khoản chưa kích hoạt: [CẦN CHỐT thời điểm dọn tài khoản và dữ liệu liên quan sau khi liên kết hết hạn].
- Dữ liệu phiên, giới hạn tốc độ và nhật ký bảo mật: [CẦN CHỐT từng loại dữ liệu và thời hạn tự xóa].
- Bản sao lưu: [CẦN CHỐT chu kỳ tạo, thời hạn hết hạn và quy trình xóa/khôi phục].
- Yêu cầu xóa hoặc rút lại đồng ý: [CẦN CHỐT phạm vi xóa, trường hợp phải lưu theo nghĩa vụ pháp lý và thời gian hoàn thành].

Không thay các mục trên bằng thời hạn lưu của dữ liệu giả trên staging. Cần xác minh chính sách lưu thực tế của cơ sở dữ liệu, hàng đợi email, log và bản sao lưu trước khi công bố.

## 5. Lựa chọn và quyền của bạn

Bạn có thể gửi yêu cầu truy cập, chỉnh sửa, xóa, hạn chế xử lý hoặc rút lại đồng ý (nếu đồng ý là căn cứ áp dụng) qua [CẦN CHỐT: kênh liên hệ, thông tin cần cung cấp để xác minh, thời hạn phản hồi và xử lý]. Việc rút lại đồng ý không ảnh hưởng đến xử lý đã thực hiện hợp lệ trước thời điểm rút lại. Một số dữ liệu có thể cần được giữ lại nếu có nghĩa vụ pháp lý; trường hợp và thời hạn cụ thể phải được xác minh trước khi công bố.

## 6. Bảo vệ tài khoản và dữ liệu

Hệ thống áp dụng các biện pháp kỹ thuật và vận hành phù hợp. Theo mã hiện tại, mật khẩu được băm bằng Argon2id; mã kích hoạt được băm để đối chiếu và mã hóa trong hàng đợi gửi thư. [CẦN CHỐT: xác minh cấu hình TLS, quản lý khóa, sao lưu, phân quyền, xử lý sự cố và các biện pháp khác trước khi đưa ra tuyên bố rộng hơn].

Bạn không nên dùng lại mật khẩu ở dịch vụ khác. Nhân viên vận hành sẽ không yêu cầu bạn gửi mật khẩu qua email.

## 7. Phạm vi chưa bao gồm

Dự thảo này chỉ bao phủ đăng ký, kích hoạt và vận hành tài khoản. Mua vé, thanh toán, chia sẻ dữ liệu với nhà hát/đơn vị tổ chức, hoàn tiền, hóa đơn và các dịch vụ bên thứ ba phát sinh cần được mô tả trong thông báo riêng hoặc phần bổ sung đã được phê duyệt trước khi các luồng đó xử lý dữ liệu thật.

## Việc cần hoàn tất trước khi đưa vào website

1. Người có thẩm quyền xác nhận đơn vị chịu trách nhiệm, mục đích, căn cứ xử lý và phạm vi người dùng/khu vực áp dụng.
2. Xác minh nhà cung cấp Gmail, hosting, cơ sở dữ liệu, log và backup; xác định vị trí xử lý/chuyển dữ liệu.
3. Chốt thời hạn lưu riêng cho tài khoản chưa kích hoạt, tài khoản hoạt động, phiên, log, consent và backup; triển khai xóa tự động tương ứng nếu chưa có.
4. Chốt kênh tiếp nhận quyền, bước xác minh danh tính, thời hạn trả lời và ngoại lệ lưu trữ.
5. Người có chuyên môn pháp lý rà soát và phê duyệt bản cuối; cấp phiên bản/ngày hiệu lực mới.
6. Cập nhật đồng bộ nội dung API, trang thông báo, nhãn đồng ý và bằng chứng consent; giữ nguyên R0 để bảo toàn lịch sử.
7. Chỉ mở đăng ký dữ liệu thật khi thông báo được phê duyệt, triển khai đồng bộ và Gmail/khóa/môi trường đã cấu hình an toàn.
