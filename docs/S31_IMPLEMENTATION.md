# S-31 — Vé đã soát không dùng lại được lần hai

Cập nhật 10/10/2026. S-30 #68 đã merge main bằng `2498c52901d8a2dfc7b25bdbd4d76035f1fc3bdf` sau CI/review và bằng chứng camera thật. S-31 tích hợp main bằng merge `5a97a91c6e06efa4249d96e8bb99baaca4e8ed51`, giữ lịch sử, PR #64 base main và diff chỉ S-31. HTTP/browser trên bản mới PASS; **S-31 giữ Draft trong lúc chờ phiên điện thoại cho ngoại lệ và review cuối. Chưa merge/deploy S-31.**

## DISCOVER → PLAN

Backlog S-31/E-06/Sprint4/3SP/dependency S-30/Owner chưa phân giữ nguyên. Không nhầm T-31 giữ ghế. Đọc AGENTS.md và ../docs/{product,architecture,risk-and-security,ui,decision-log}. Quyền PO vẫn hiệu lực: [capability riêng theo nhân viên/suất/cửa](S31_PERMISSION_DECISION.md), canOverride mặc định false.

Main sau dependency là `2498c52901d8a2dfc7b25bdbd4d76035f1fc3bdf`; base PR64 đã retarget main sau xác minh merge S-30 thực tế. PR duy nhất tiếp tục branch `story/S-31-prevent-ticket-reuse`. Dependency fork PR68 giữ attribution/commit gốc; merge thường exact-head, không force/bypass. Snapshot cũ được giữ. CI admission trên 5a97a91 kiểm lại QR ký/ngoại lệ/50 races/rollback/restart; camera S-30 không thay bằng chứng dialog ngoại lệ trên điện thoại S-31.

## IMPLEMENT

Tái sử dụng OrdersModule, TicketCheckInService/Controller, ScannerCryptoService và scanner V1 của S-30; không thêm scanner khác hay endpoint tự cấp quyền.

- NORMAL và EXCEPTION cùng nhận `qrPayload,gateId,requestId`; EXCEPTION thêm reason 1–500 ký tự không trắng và ownerConfirmed=true. UUID vé trần hoặc trường ticketId bị từ chối. Danh tính/thời gian client bị từ chối.
- Session/role và grant suất/cửa được kiểm trước metadata. EXCEPTION kiểm capability riêng, không suy từ STAFF/ADMIN/ORGANIZER. verifyQr xác minh ET1.Ed25519/allowlisted key/claims; ticketId chỉ lấy từ chữ ký đã xác minh. [Contract S-26 tối thiểu](S26_SIGNED_QR_CONTRACT.md); không đánh dấu toàn S-26 Done.
- Transaction revalidate session/quyền bằng FOR SHARE, khóa OrderItem/PAID Order và matching S-33 Ticket bằng FOR UPDATE. Vé CANCELLED/sai suất/không đủ điều kiện không vào. S-33 CHECKED_IN thiếu timestamp vẫn từ chối an toàn.
- Ledger/constraint S-31 đã được S-30 tái sử dụng: partial UNIQUE ticketId WHERE kind=NORMAL; UNIQUE staffId/requestId; CHECK kind/reason/ownerConfirmed. Không tạo bảng lần hai hay sửa migration đã áp dụng.
- NORMAL insert ledger + cập nhật checkedInAt và matching Ticket trong cùng transaction. Chỉ resolve hợp lệ sau COMMIT. Xung đột thành 409 nghiệp vụ, không mutex/cache/500.
- Quét mới vé dùng: TICKET_ALREADY_CHECKED_IN với thời điểm/cửa NORMAL đầu. Replay cùng request: ALREADY_RECORDED, không phải lần vào mới. Fingerprint ticket/suất/cửa/kind/reason; đổi hành động cùng key → REQUEST_CONFLICT.
- EXCEPTION cần NORMAL đầy đủ, lưu snapshot staffId/staffName từ assignment tin cậy, cửa hiện tại, reason, DB time; không reset/ghi đè lần đầu. Quét thường sau ngoại lệ vẫn từ chối. Tên User chưa có display name, assignment là nguồn tên nhân viên tin cậy.
- Dialog V1 gửi lại chính QR ký của lượt quét, không lấy UUID result để bypass verifier. Checkbox là attestation nhân viên đã kiểm chủ vé thực tế, không phải KYC hoặc bằng chứng danh tính từ nút.
- Giữ PublicLayout/font/token/component V1, Dialog/Field/Textarea/Button hiện có; không sửa design system. Loading chặn submit, >3s báo chờ, timeout/mạng lỗi không hợp lệ, retry giữ key/reason, focus/live region/touch/metadata đầu.

## Migration / rollback

Migration ledger `202610080003_s31_admission_ledger` byte-identical với dependency S-30. Môi trường mới deploy đủ22 migration thật, không db push/reset. Không có migration mới riêng ở lần tích hợp này. Legacy used thiếu NORMAL giữ trạng thái và hiển thị cửa chưa lưu, không bịa lịch sử/cho ngoại lệ.

Rollback application về S-30 signed head vẫn giữ ledger/grant/check first NORMAL; tuyệt đối không về scanner UUID không ký. [Template compensation](../apps/api/prisma/verification/s31-compensate-empty.sql) chỉ dùng dưới dạng migration MỚI khi đã xác minh trống; guard từ chối dữ liệu populated. Không xóa lịch sử để rollback. Rollback/reapply trống và staging chưa kiểm.

## REVIEW → VERIFY → PUBLISH

[Ma trận](S31_EVIDENCE.md), [handoff](S31_GITHUB_HANDOFF.md). Local mới: 46 HTTP checks +50 real races/2processes, rotation/restart/rollback; build/lint/typecheck/unit228 PASS. CI signed8e6374d:46HTTP/50races/27browser PASS,84integration hồi quy local PASS. Final-head checks/review tham chiếu PR64, không dùng26check UUID cũ. Camera/ngoài trời vẫn chờ, staging chưa kiểm. Không đóng issue, chuyển Ready hoặc gọi Done khi gate còn mở.
