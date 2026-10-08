# S-31 — Vé đã soát không dùng lại được lần hai

Trạng thái: triển khai và kiểm chứng local trên dependency S-30; **Draft, chưa nghiệm thu toàn bộ, chưa merge/deploy**. Cập nhật 08/10/2026.

## DISCOVER

Backlog A41:O41 giữ nguyên S-31, E-06, Next/Must, Sprint 4, 3 SP ước lượng thô, Owner chưa phân, dependency S-30. Tài khoản vận hành Codex không phải Owner. Nguồn: AGENTS.md; ../docs/product.md, architecture.md §9/10, risk-and-security.md §3.6, ui.md §6.12 và decision-log.md đến DEC-12. Quyết định PO mới được lưu trong [S31_PERMISSION_DECISION.md](S31_PERMISSION_DECISION.md).

Main: `4be30370b3007b9b9b58e4aa3598b666df64f3f3`. S-30 hiện ở [PR #68](https://github.com/TTCS-T926-K19C5-N2/thudemo/pull/68), revision `3dc6b5cf051047e2c794b96b7f265103073db1ab`, chưa merge. Đã đọc source/controller/service, scanner camera thật, migration, 4 integration test và CI của revision đó (run 37789530175/37789529998 PASS). PR #66 S-29 chỉ liệt kê suất hôm nay, chưa có schema cửa/quyền. Không nhập S-33 hoặc dựng scanner khác.

S-30 dùng OrderItem UUID làm nội dung QR; **không có chữ ký hoặc QR verifier đã duyệt**. S-31 giữ nguyên contract này, không đổi thanh toán/QR/S-26. Kiểm chữ ký sai chưa thể đạt; đây là blocker nghiệm thu. S-31 bổ sung context cửa/quyền trực tiếp cần cho lịch sử và không cấp mặc định cho vai trò.

## PLAN và IMPLEMENT

Tái sử dụng OrdersModule, TicketCheckInService/Controller, OrderItem.checkedInAt, session cookie guard, roles guard, scanner html5-qrcode và PublicLayout V1. Chỉ thêm Dialog từ registry @shadcn; dùng Button, Field và Textarea hiện có. Không sửa globals.css/product.css/design system hoặc Afterglow V2.

- CheckInGate thuộc Showtime; CheckInPermission gắn User + Gate (gate suy ra suất), staffName tin cậy và canOverride mặc định false.
- TicketAdmission phân biệt NORMAL/EXCEPTION; lưu snapshot tên cửa/nhân viên, ID nhân viên, thời gian database, request ID, lý do và xác nhận chủ vé. Không biến scan bị từ chối thành lịch sử vào.
- Một partial unique index theo ticketId WHERE kind='NORMAL' chống hai lần vào thông thường. Unique (staffId,requestId) chống retry/bấm đúp cho cả hai loại.
- Transaction revalidate session, khóa quyền/cửa, kiểm vé thuộc đúng suất/ghế và đơn PAID, khóa OrderItem và Order bằng FOR UPDATE, kiểm lịch sử rồi insert. Cập nhật checkedInAt cùng transaction; response chỉ resolve sau commit.
- Các cạnh tranh insert dùng ON CONFLICT DO NOTHING và lỗi nghiệp vụ 409. Không có Node mutex/cache làm lớp bảo đảm.
- Metadata vé đã dùng chỉ sau session/role/quyền cửa/điều kiện vé: code S-30 `TICKET_ALREADY_CHECKED_IN`, firstAdmission.checkedInAt/gateName, canOverride. Không trả người mua/email.
- Ngoại lệ: endpoint riêng, quyền riêng trên cửa hiện tại, lý do trim không rỗng/≤500 ký tự, ownerConfirmed=true là lời xác nhận của nhân viên đã kiểm tra thực tế, không phải bằng chứng KYC từ nút. Không thu giấy tờ/dữ liệu mới.

## Contract

GET /showtimes/:showtimeId/check-in/gates trả chỉ cửa được phân công. POST /showtimes/:showtimeId/check-in nhận ticketId, gateId bắt buộc; requestId UUID khuyến nghị. Thêm POST cùng đường dẫn /exception nhận thêm reason/ownerConfirmed. Server từ chối các trường danh tính/thời gian do client gửi.

RequestId là mở rộng tùy chọn vì S-30 chưa có idempotency: bỏ trường này tạo key server mới, nên client cũ mỗi POST được coi là scan mới. Scanner V1 luôn gửi và giữ cùng key khi retry. Canonicalize UUID lowercase; fingerprint ticket/suất/cửa/kind/reason. Cùng key khác hành động → REQUEST_CONFLICT. Replay đã ghi → ALREADY_RECORDED, UI cảnh báo “không phải lần vào mới”, không xanh. Quét mới vé đã dùng → 409; ngoại lệ mới là một admission EXCEPTION riêng.

UI giữ context suất/cửa, text/icon/cảnh báo “Đã vào lúc … tại cửa …”, nút tiếp tục, dialog đúng quyền, validation/lời xác nhận bắt buộc, loading khóa submit, chờ >3 giây của S-30, lỗi mạng/thử lại. Sau ngoại lệ hiển thị riêng “Đã ghi nhận vào lại theo ngoại lệ”; quét thường vẫn bị từ chối.

## Migration và vận hành

Migration mới `202610080003_s31_admission_ledger`; không chỉnh migration đã áp dụng, không db push/reset. Dữ liệu S-30 đã used giữ nguyên checkedInAt, không bịa cửa lịch sử; UI ghi cửa chưa lưu và không cho ngoại lệ khi thiếu NORMAL đầy đủ.

Deploy client/API cùng revision S-31 sau khi dependency được duyệt. Migration tạo bảng rỗng, **không tự cấp quyền**. Người vận hành database có thẩm quyền tạo cửa và cấp CheckInPermission cho nhân viên được phân công; staffName lấy từ danh sách nhân viên tin cậy, không lấy request/browser. Schema User hiện chưa có tên hiển thị, nên lưu tên tin cậy trong assignment và snapshot admission. S-28/S-29 chưa có UI quản lý assignment; chưa mở endpoint tự cấp quyền trong S-31. Cần chuẩn bị assignment trước khi cho scanner sử dụng.

Rollback ưu tiên rollback application và giữ ledger/quyền. Không chạy lại API S-30 cho traffic thật sau khi rollback vì nó chưa kiểm quyền cửa; tạm dừng admission cho tới bản sửa phù hợp. [Template migration bù](../apps/api/prisma/verification/s31-compensate-empty.sql) từ chối nếu có bất kỳ lịch sử/cửa/quyền; chỉ dùng làm migration MỚI trên target đã kiểm và rỗng, tái áp dụng bằng migration MỚI. Không xóa dữ liệu để ép rollback. Đã kiểm guard từ chối dữ liệu có lịch sử; chưa chạy rollback rỗng hoặc staging. Giữ partial index/CHECK thủ công khi tạo migration Prisma tiếp theo; Prisma model không thể biểu diễn partial unique.

## REVIEW → VERIFY → PUBLISH

[Ma trận/bằng chứng](S31_EVIDENCE.md), [handoff GitHub](S31_GITHUB_HANDOFF.md). Candidate storage proof trước khi S-30 có code được giữ làm lịch sử nghiên cứu, không dùng thay bằng chứng product HTTP/browser. S-31 không phải kiểm tải giữ ghế T-31. Không đóng issue hoặc dùng chữ Done khi signed QR/dependency/thiết bị thật/staging còn thiếu.
