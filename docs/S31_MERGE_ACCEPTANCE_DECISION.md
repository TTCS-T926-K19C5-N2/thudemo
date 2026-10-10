# S-31 — Quyết định merge và giới hạn nghiệm thu 10/10/2026

## Quyết định của người dùng

Người dùng trực tiếp cho phép merge S-30 và S-31 vào main theo quy trình trong phiên Codex ngày 10/10/2026. Sau khi được thông báo log QA S-31 dừng vì cấu hình khóa QR, chưa mở web 3060 và chưa có bằng chứng camera/dialog ngoại lệ, người dùng xác nhận:

> Coi phần còn thiếu là PASS

Tài liệu này ghi quyết định đó là **chấp nhận bỏ gate kiểm thiết bị S-31 để merge**, không phải kết quả thử nghiệm PASS. Camera/dialog ngoại lệ trên điện thoại ở revision tích hợp vẫn là **NOT RUN / USER-WAIVED**. Lời xác nhận trước đó “Đã kiểm đủ các bước trên bản S-31 cổng 3060” được làm rõ bằng câu trả lời trên; không dùng làm bằng chứng đã thực hiện thử nghiệm.

Quyết định chỉ thay đổi gate merge của nhiệm vụ này. Không sửa ba AC, ID, Sprint, Story Point, Owner, quyền ngoại lệ hoặc kết quả đo. Không tuyên bố nghiệm thu đầy đủ trên thiết bị, staging hoặc production. Không deploy.

## Bằng chứng đã thực hiện

- S-30 #68 đã merge thật tại 2498c52901d8a2dfc7b25bdbd4d76035f1fc3bdf; CI main và review chéo PASS. Bằng chứng hai camera Android và báo cáo dưới nắng của người dùng được ghi riêng trong tài liệu S-30.
- S-31 head ứng dụng 7f68e18977aefdb1bb805565589edc5d8724a313, base main ở merge SHA trên. [Admission CI 38056229529](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/38056229529) PASS: 46 kiểm tra HTTP, 50 vòng cạnh tranh qua hai API process, 27 kiểm tra browser; không có lỗi console/runtime. AC1–AC3 có bằng chứng API/database/browser tự động.
- [CI 38056229635](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/38056229635), [S-30 compatibility 38056229471](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/38056229471), [S-43 38056229479](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/38056229479) đều hoàn tất SUCCESS đúng head 7f68e18.
- Commit quyết định này chỉ sửa tài liệu. CI và review phải chạy/đọc lại đúng head mới trước merge; kết quả head 7f68e18 không được gán thành kết quả head tương lai.

## Giới hạn và việc còn lại

Không có ảnh, log READY hoặc quan sát camera S-31 mới. Log QA local lúc 21:32 ngày 10/10/2026 báo Invalid ticket QR key configuration; no ephemeral fallback. Đây là lần khởi động QA thất bại, không phải thử nghiệm admission thành công. Không đưa private key, credential hoặc toàn bộ log vào evidence. Bộ khởi động QA nằm ngoài repository; cần cấu hình và kiểm lại trước phiên thiết bị tiếp theo.

Nên thực hiện camera ký thật, quét lại cửa khác, dialog/lý do ngoại lệ và quét thường sau ngoại lệ trên Android trước nghiệm thu thiết bị hoặc đưa vào vận hành. Giữ issue #63 mở cho phần nghiệm thu còn thiếu; không dùng Closes hoặc đổi trạng thái backlog thành Done chỉ vì merge.

Không có migration mới trong quyết định này. Giữ ledger/constraint, lịch sử và hướng dẫn rollback hiện có. Review kỹ thuật tự động phải nêu rõ giới hạn nghiệm thu và gắn commit SHA cuối; không coi việc đổi tài khoản là review độc lập của người sở hữu tài khoản.
