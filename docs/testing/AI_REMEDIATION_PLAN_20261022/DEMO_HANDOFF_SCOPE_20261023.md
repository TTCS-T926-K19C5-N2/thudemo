# Phạm vi bàn giao demo — chỉ đạo người dùng ngày 23/10/2026

> **Timebox mới từ người dùng:** hoàn thiện bản demo trong 5 giờ, giảm mức chi tiết kiểm thử/báo cáo. Dùng [DEMO_5H_PROMPT_20261023.md](DEMO_5H_PROMPT_20261023.md) làm thứ tự và mức độ ưu tiên hiện tại; deadline mục tiêu 19:10:59 ngày23/10/2026 giờViệtNam. Giữ các yêu cầu bảo toàn dữ liệu, giao diện và logic quan trọng dưới đây.

## 1. Mục tiêu đã được người dùng làm rõ

Người dùng cần **bản demo đầy đủ chức năng và đúng logic**, giữ giao diện, thông tin sự kiện và nội dung đã xây dựng. Khi đưa lên GitHub, mã và tài nguyên phải đủ để clone lại, khởi tạo môi trường demo và tái hiện sản phẩm đó.

Đây là điều chỉnh mục tiêu nghiệm thu theo yêu cầu trực tiếp mới hơn của người dùng. Dùng cùng PLAN.md và remediation-work-items.json; khi các tài liệu cũ yêu cầu chờ nghiệm thu bên ngoài để bàn giao, ưu tiên phạm vi demo tại đây. Không coi chỉ đạo này là chứng minh code đã hoàn tất, quyền tự ý push, hoặc cho phép làm sai logic.

Mục tiêu trước mắt là **DEMO_READY**, không phải chứng nhận production. Tất cả chức năng và logic đã được yêu cầu vẫn phải có, dùng được từ giao diện và được kiểm chứng. Không bỏ chức năng chỉ vì Tier Later nếu nó thuộc phạm vi hoàn thiện đã giao.

## 2. Những phần được phép mô phỏng và những phần phải làm thật

| Nhóm | Điều kiện nghiệm thu bản demo |
|---|---|
| Thanh toán | Gateway mock của dự án, có success, rejection, failure và ambiguous timeout theo D17; signature, amount, idempotency, order/seat/ticket transition phải thật trong ứng dụng/DB. Không có tiền thật. |
| Hoàn tiền | Adapter mock nhưng số tiền, coupon allocation, trạng thái UNKNOWN/retry, batch, audit, nhả ghế và vô hiệu vé phải đúng contract đã chốt. |
| Email | SMTP catcher local/Mailpit; phải thực sự nhận nội dung và QR, kiểm QUEUED/SENT/FAILED/retry. Không thay gửi thư bằng log hoặc trạng thái tĩnh. |
| Ngoại tuyến | Browser local có snapshot/public key/IndexedDB/queue bền, mất mạng và sync thực qua API/DB. Kiểm mô phỏng mạng được ghi rõ. Camera/4G vật lý có thể theo dõi riêng. |
| Thông báo chờ | FIFO, notify-only theo D02/D16 và các quyết định bổ sung được duyệt; phải kiểm dữ liệu và catcher, không giả thông báo thành công. |
| Backup/restore | Nếu chức năng thuộc scope, có backup và restore sang DB demo khác, integrity và key recovery thực; lịch/retention có phép thử kiểm soát. Chưa cần mua hoặc cấu hình kho production ngoài máy để gọi demo hoàn tất. |
| UI và dữ liệu | Giao diện hiện hữu, danh mục sự kiện, poster/banner/mô tả/sơ đồ/giá và các chức năng mới phải thật, không thay bằng trang mẫu trống hoặc nút không tác dụng. |
| Build, migration, nguồn | Fresh build, migrations trên DB trống và nâng cấp fixture, kiểm quyền/transaction/concurrency phải có bằng chứng; dist cũ không thay được source. |

Không lấy sandbox provider thật, email Internet/Inbox, staging/release, thiết bị 4G/camera vật lý hoặc backup production ngoài host làm điều kiện chặn bàn giao **demo**. Giữ chúng trong danh sách xác minh bên ngoài nếu còn liên quan yêu cầu gốc. Không đổi status gốc thành PASS khi chưa kiểm ở môi trường đó.

GitHub CI/review áp dụng khi công việc tích hợp/push được giao và theo chính sách repo. Thiếu hosted CI không ngăn hoàn thiện local/demo package; cũng không được giả CI xanh hoặc bypass khi thực sự tích hợp.

## 3. Giữ giao diện và nội dung đã xây dựng

Trước thay đổi thêm, tạo manifest chỉ đọc cho các tệp UI/assets và dữ liệu nguồn được chọn làm chuẩn. Phân biệt mã ban đầu, mã người dùng đã sửa và phần remediation mới. Không reset/stash/checkout đè working tree. Không tự thiết kế lại trang chủ, đổi tên sự kiện, mô tả, poster, hạng/giá hoặc sơ đồ chỉ để test dễ hơn.

Nguồn hiện có cần đối chiếu, chưa phải chứng minh khôi phục đã thành công:

- `su_kien_nha_hat_40_su_kien_chi_tiet_2026.json`: tồn tại và đã được Git theo dõi tại lượt đọc phạm vi này.
- `theater_chamber_events_seed.json`: tồn tại và đã được Git theo dõi.
- `apps/web/public/images/`: hiện có 35 tệp ảnh khi duyệt đệ quy; kiểm đủ đường dẫn được dữ liệu thực tham chiếu, không dùng số35 làm giá trị bắt buộc vĩnh viễn.
- `scripts/import-real-productions.mjs`, `apps/api/scripts/import-theater-demo.mjs`, `apps/api/prisma/seed-demo.mjs`: có thể tái sử dụng sau khi kiểm guard/contract, không chạy vào DB chính hoặc mặc định mọi script đều là bootstrap demo đầy đủ.
- Component, styles và ảnh nghiệm thu trước đó trong repository là nguồn đối chiếu giao diện. Giữ bố cục/nhận diện chính; chức năng mới được bổ sung theo design system đang dùng.

Nếu nội dung trong DB hiện có mới hơn JSON, không ghi đè nó bằng seed cũ. Lập so sánh và chọn bản chuẩn có nguồn rõ ràng; xuất riêng dữ liệu nội dung được phép tái tạo, không xuất bảng người dùng hoặc giao dịch thật vào GitHub. Dữ liệu demo được đóng gói phải khớp bản chuẩn đã xác minh, không chỉ là sáu sự kiện mẫu không liên quan.

Chụp và so các trang quan trọng desktop/mobile: trang chủ/catalog, chi tiết/sơ đồ, đăng nhập/tài khoản, order/vé/scanner, event management và operations. Kiểm đủ ảnh, nội dung, font, layout, navigation và các trạng thái. Thay đổi giao diện cần thiết để thêm chức năng phải được nêu riêng, không nhận toàn bộ CSS mới là đã giữ nguyên giao diện.

## 4. Hai môi trường dữ liệu phải tách biệt

1. **Dữ liệu hiện tại trên máy:** bảo toàn, backup trước migration/chuyển cấu hình; không seed/reset/delete/restore đè. Restart bình thường không được tự nhập lại hoặc làm mất sự kiện, đơn và vé.
2. **Môi trường demo tái lập:** DB/Redis/Mailpit riêng, có dataset được kiểm soát, tài khoản giả đủ5vai trò và hướng dẫn đăng nhập. Test fixture tạm tách khỏi catalog demo bền; cleanup không xoá catalog cần bàn giao.

Danh sách trống ở profile test không được dùng làm trang demo cuối. Hiển thị rõ đang chạy profile nào và nội dung demo được lấy từ đâu; không tự fallback sang DB chính khi thiếu env.

Lịch cũ và suất tham khảo có thể không phù hợp điều kiện mở bán hiện tại. **Giữ lịch/nội dung gốc**, tạo suất mô phỏng còn hiệu lực riêng trong môi trường demo theo luồng hợp lệ để trình diễn đặt vé. Phân biệt dữ liệu tham khảo không bán với suất được phép thử giao dịch. Không sửa hàng loạt ngày gốc, chuyển mọi `isDemo` hay gỡ guard cấm bán chỉ để có dữ liệu hiển thị.

Bootstrap tạo mới phải có mốc thời gian cấu hình được và lưu ổn định sau khởi tạo. Chạy lại không đổi lịch của đơn đã tạo hoặc reset ghế đã mua. Import idempotent có dry-run/guard và không update nội dung hiện hữu nếu chưa chọn rõ chế độ đó.

## 5. Chức năng và các quyết định nghiệp vụ

Hoàn thiện đầy đủ phạm vi story/feature đã giao, gồm chức năng cũ, core integration và S-56/S-59/S-60/S-62/S-63. Mỗi chức năng cần UI đi tới được, quyền đúng, validation/negative cases, dữ liệu bền và hành vi đúng khi retry/lỗi; không chỉ có endpoint hoặc test unit.

Áp dụng các quyết định người dùng đã thực sự chốt trong chat/decision register, không hỏi lại:

- D01: một mã, floor tiền giảm %, giảm tối đa subtotal, xác nhận đơn0đồng tại server không qua gateway.
- D02: thông báo FIFO, không giữ ghế riêng.
- D04: cohortA `[from,to)`, outcome trước `to`, cả hold-to-order và hold-to-paid, tách pending.
- D12: phân bổ giảm theo tỷ trọng từng vé, floor phần chia, phân bổ đồng dư theo mã vé tăng dần, lưu snapshot cho refund/report.
- D16: kiểm lại trước SMTP, nếu không còn ghế thì huỷ lượt mail theo contract; thư vẫn nêu không giữ ghế.
- D17: từ chối chắc chắn có thể retry; timeout mơ hồ chặn attempt mới, chờ webhook/query/đối soát.

Các quyết định khác chỉ dùng khi có bằng chứng người dùng đã chọn. Nếu thật còn thiếu policy làm thay đổi tiền/ghế/quyền, nêu đúng câu hỏi cần chốt và tiếp tục phần độc lập; không vì chỉ cần demo mà tự đặt rule trái yêu cầu.

Việc D12 quy định allocation không tự chứng minh đã có UI/API hoàn từng vé. Nếu phạm vi đã được chốt bao gồm hoàn một phần, phải triển khai và nghiệm thu lát cắt đó; không ghi hoàn tất chỉ vì hàm phân bổ đã có. Không tự mở rộng thành hoàn một phần nếu người dùng mới chỉ chốt cách lưu số liệu và contract vẫn huỷ toàn đơn: truy vết nguồn để phân biệt.

## 6. Những gì cần có để GitHub tái tạo được demo

**Push code không tự sao chép PostgreSQL trên máy.** Trước khi gọi gói bàn giao đầy đủ, chuẩn bị và kiểm:

1. Đủ source đang được dùng, gồm file mới/untracked cần thiết, migrations, shared package, lockfile và config mẫu. Không chỉ commit những file đã tracked từ trước.
2. Đủ ảnh/poster/banner, font và asset được runtime tham chiếu. Không phụ thuộc đường dẫn `C:\Users\...`, `D:\...`, thư mục cache riêng hoặc tệp không được Git theo dõi.
3. Dataset nội dung sự kiện và import/seed có bảo vệ, đúng bản chuẩn, không PII/secret/DB dump thật. Bản clone mới phải có catalog mong muốn chứ không chỉ database rỗng.
4. `.env.example` có tên biến/placeholder/giải thích; launcher tạo credentials và key demo riêng trên máy, lưu private/ignored. Không commit `.env`, token, SMTP password, private signing/encryption key hoặc credentials thật. Dữ liệu phát vé mới dùng key của profile mới; giữ key cũ riêng khi bảo toàn đơn/QR trên máy hiện tại.
5. Bootstrap và hướng dẫn start/stop/status/migrate/import/login đủ vai trò, mở Mailpit, kịch bản trình diễn và cách restore. Người clone không cần lấy bí mật, file cache hay DB từ máy tác giả.
6. Migration additive, nâng cấp dữ liệu cũ giữ nội dung/đơn/vé; cần backup và rollback tương thích trước áp vào DB đang dùng. Không dùng reset để khiến clone và máy cũ có vẻ giống nhau.
7. Quét phần định đưa lên Git và metadata/log công khai, kiểm không lộ secret. Không in raw remote URL nếu có thể chứa credentials; dùng URL đã loại thông tin xác thực. Cấu hình remote hiện có thông tin xác thực nhúng cần được thay bằng cơ chế đăng nhập phù hợp trước publish; token đã lộ cần được thay, không đưa vào tài liệu.
8. Kiểm remote/nhánh đích khi được giao push. Chỉ đạo hiện tại nói mục tiêu khi đưa lên GitHub, **chưa phải lệnh push ngay**. Giữ policy feature/fix→PR→develop nơi áp dụng; không force-push/bypass hoặc tự chọn repo sai.

Thử bản clone/checkout sạch từ đúng tập file chuẩn bị đưa lên repo, bao gồm file mới chưa commit cần thiết. `git archive HEAD` hoặc clone HEAD đơn lẻ chưa có file untracked/modified, nên không được dùng để chứng minh bản sửa đã được đóng gói. Không commit tự động chỉ để tạo bản thử: có thể stage copy được kiểm soát hoặc kiểm tra bản export của tập file dự định bàn giao, rồi lặp lại clean-clone proof sau commit khi được giao.

## 7. Demo-ready checklist và báo cáo cuối

Chỉ ghi DEMO_READY khi:

- Bản sạch cài/chạy theo README bằng profile demo, không cần file riêng trên máy tác giả.
- Catalog/nội dung/ảnh/giao diện khớp bản chuẩn, không rỗng hoặc bị thay bằng fixture test.
- Đăng nhập5vai trò và đi được mọi chức năng đã giao, bao gồm chức năng mới; các rule đã chốt đúng ở UI/API/DB.
- Chứng minh không trùng ghế/tiền/admission, coupon/hoàn đúng, queue offline không mất, dữ liệu không mất khi restart; đủ negative/retry/concurrency quan trọng.
- Build/typecheck/lint/unit/integration và browser demo liên quan đạt trên đúng source đóng gói; test failures không bị bỏ để làm đẹp kết quả.
- Ma trận404case được đối chiếu: phần functional/local trong demo có kết quả hoặc được sửa; phần chỉ dành nghiệm thu bên ngoài ghi rõ không chặn demo. Không làm giả PASS cho các NFR chưa có threshold hoặc môi trường chưa chạy.
- README/runbook, dataset/assets, migrations và config mẫu đầy đủ, cùng report `DEMO_HANDOFF.md` chỉ rõ chức năng, role, data source, commands, source fingerprint, giới hạn mô phỏng và các mục production chưa nghiệm thu.

Thêm `demo-acceptance.json` hoặc bảng tương đương bên cạnh results gốc: `case_id`, `demo_applicability`, `demo_status`, `evidence`, `external_status`, `reason`. Không ghi đè expected hoặc bằng chứng baseline404case; không coi “chưa refine” là thiếu một chức năng phải phát minh.

Ngay sau scope này, tiếp tục đóng lỗi và kiểm demo theo nhóm, không dành phần lớn thời gian append lại mọi lịch sử checkpoint. Chạy targeted tests sau sửa, full regression ở mốc bàn giao, giữ profile cố định. Thiếu external không chặn bản demo; thiếu logic/chức năng/nội dung trong demo vẫn phải xử lý.
