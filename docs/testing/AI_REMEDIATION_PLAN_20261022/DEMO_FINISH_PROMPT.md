# Prompt cập nhật mục tiêu: hoàn tất demo đầy đủ và đóng gói GitHub

> **Kịch bản đủ vai trò mới nhất:** dùng [DEMO_ALL_ROLES_IMPLEMENTATION_PROMPT_20261023.md](DEMO_ALL_ROLES_IMPLEMENTATION_PROMPT_20261023.md) để tiếp tục hoàn thiện và thực hiện một kịch bản đủ5vai trò cùng toàn bộ chức năng trong scope. Giữ deadline5giờ đã giao, không tự tính lại từ lượt mới.

> **Cập nhật mới nhất:** người dùng yêu cầu bản demo trong 5 giờ và chấp nhận giảm mức chi tiết kiểm thử/báo cáo. Ưu tiên [DEMO_5H_PROMPT_20261023.md](DEMO_5H_PROMPT_20261023.md), mục tiêu 19:10:59 ngày23/10/2026 giờViệtNam. Không giảm tính đúng của tiền/ghế/quyền/dữ liệu; không tính lại deadline khi nhận prompt muộn.

Mục tiêu hiện tại của tôi là **bản demo đầy đủ tất cả chức năng đã yêu cầu, đúng logic, giữ giao diện và thông tin sự kiện tôi đã xây dựng**. Khi đưa lên GitHub, phải có đủ source, ảnh, dữ liệu demo và hướng dẫn để clone lại vẫn chạy đúng sản phẩm đó.

Hãy áp dụng ngay phạm vi mới trong:

`D:\Merge_2\Codegym\docs\testing\AI_REMEDIATION_PLAN_20261022\DEMO_HANDOFF_SCOPE_20261023.md`

Đọc cùng AGENTS.md, PLAN.md, remediation-work-items.json, bằng chứng sửa mới nhất và ma trận404case. Chỉ đạo này điều chỉnh mục tiêu bàn giao từ nghiệm thu môi trường thật sang **DEMO_READY**; không cho phép bỏ chức năng hoặc làm sai logic. Tiếp tục thực hiện sửa/hoàn thiện, không chỉ lập kế hoạch mới.

Ưu tiên:

1. Đóng các lỗi/chức năng và quy tắc nghiệp vụ còn thiếu trong bản demo. Dùng payment/refund mock, Mailpit/catcher và browser offline; state, số tiền, ghế, vé, quyền, queue và retry vẫn phải thực thi đúng qua DB/API thật.
2. Áp đúng quyết định tôi đã chốt: D01, D02, D04, D12, D16, D17 và những quyết định khác có record. Không hỏi lại nội dung đã trả lời. Câu hỏi mới thật sự chặn nghiệp vụ thì hỏi cụ thể và tiếp tục phần độc lập.
3. Giữ giao diện/nội dung hiện hữu. Không tự thiết kế lại, thay sự kiện/ảnh/mô tả/giá/sơ đồ bằng bộ mẫu khác. Bổ sung UI mới theo component/design system sẵn có, kiểm desktop/mobile và đủ các thao tác.
4. Bảo toàn DB và key hiện tại trên máy. Không seed/reset/restore đè. Tạo DB demo bền riêng với catalog đúng, tách khỏi fixture tạm. Danh sách trống ở DB test không phải sản phẩm bàn giao.
5. Giữ lịch tham khảo gốc. Nếu cần suất tương lai để trình diễn mua vé, tạo suất mô phỏng riêng qua luồng hợp lệ; không sửa hàng loạt ngày hoặc gỡ guard bán vé để lách validation. Khởi tạo có mốc thời gian ổn định; restart không đổi lịch đơn đã tạo hay xoá ghế đã mua.
6. Đóng gói đủ dataset sự kiện, ảnh/banner/font, migration, source mới/untracked, shared package, lockfile và env mẫu. Push source không tự mang theo DB; cần script khởi tạo idempotent có guard. Không xuất PII, secret hoặc DB dump thật lên repo.
7. Kiểm bản sạch từ đúng tập file chuẩn bị bàn giao, gồm các thay đổi chưa commit. Chạy theo README, đăng nhập đủ5vai trò, thấy đủ catalog/ảnh, đi được các luồng và restart giữ dữ liệu. Không dùng clone HEAD cũ thiếu file mới để tuyên bố đã kiểm bản sửa.
8. Kiểm test liên quan khi sửa, full regression ở mốc đóng demo. Đối chiếu404case, cập nhật kết quả theo bằng chứng; tách ca demo với ca cần staging/provider/camera/4G/backup production. Không gọi các ca external chưa chạy là PASS, nhưng không để chúng chặn demo.

Chưa cần chờ provider thật, email Internet/Inbox, staging production, thiết bị 4G/camera thật hoặc kho backup production để bàn giao demo. Các giới hạn đó ghi riêng. Không bỏ kiểm nguyên tử, phân quyền, chữ ký, đúng tiền, chống trùng và độ bền dữ liệu chỉ vì đang demo.

Báo cáo `DEMO_HANDOFF.md` cần có: phiên bản source; danh sách chức năng và kết quả; catalog/data source và ảnh so giao diện; cách cài/chạy/start/stop/restart/import; tài khoản giả theo vai trò và cách lấy credentials local; kịch bản trình diễn; nguồn mock/catcher; kết quả clean-package proof; nội dung repo đã đủ/chưa đủ; và các giới hạn ngoài demo.

Không tự commit/push/merge/deploy ở bước này. Chuẩn bị bản reviewable và kiểm repo/nhánh đích trước khi được giao thao tác GitHub. Không log raw URL remote chứa credentials; loại secret khỏi tập file bàn giao và xử lý thông tin xác thực theo scope được phép.

Chỉ ghi **DEMO_READY** khi có đủ chức năng, logic, nội dung/giao diện và bản sạch tái lập được. Chưa đủ thì tiếp tục phần độc lập, báo lỗi/blocker cụ thể; không dừng ở “unit tests xanh” hoặc giao một catalog trống.
