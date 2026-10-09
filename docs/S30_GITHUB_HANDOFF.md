# S-30 GitHub handoff

PR đang dùng: https://github.com/TTCS-T926-K19C5-N2/thudemo/pull/68
Source fork/branch: tovanquyenh-blip/thudemo / feature/SCRUM-30-qr-ticket-check.
Base main đã fetch: 79704a2dc2de0eddb883319a1a520085b89e18cb.
Original PR commit: 3dc6b5cf051047e2c794b96b7f265103073db1ab, giữ attribution kể cả placeholder author gốc.
Merge main vào branch local: c4d6d36, commit mới dưới tài khoản vận hành Quyền đã API/Git credential xác minh.

Sửa/commit/push S-30: tovanquyenh-blip (tovanquyenh@gmail.com đã đối chiếu commit GitHub mapped).
Review/merge khi đủ gate: sangnguyencoder.
Các bản sửa do Codex theo ủy quyền, không chứng minh Quyền/Sáng trực tiếp code hoặc human independent review.

Push thật 2026-10-09: fork ref3dc6b5c→9afefc7, rồi9afefc7→ed76c9a005029707719279b05170695b011e5395. Lần đầu bị xác thực từ chối do global credential.username còn Sáng; không ref nào thay đổi. Các lần thành công ghim credential.helper và credential.https://github.com.username, đối chiếu credential identity bằng API trong memory, không in secret. PR API readback đúng fork/branch/head.

CI signed QR đầu9afefc7 bị lỗi workflow (runner context không dùng tại jobs.env); đã sửa thành paths cấu hình trên runner step ở ed76. Không tính run lỗi là PASS. Review cuối và merge chưa thực hiện lúc ghi; camera/ngoài trời vẫn thiếu.

Trước mỗi mutation dùng github-preflight riêng (switch + API login + repo write + pinned HTTPS credential API login + override check không in secret). Không force push, không --admin/bypass. S-30 chỉ merge exact head sau CI/review/evidence đủ. S-31 #64 chỉ cập nhật/review, không merge/deploy. Các SHA/push/review/CI thực tế được cập nhật qua audit PR sau thao tác; tài liệu này không dựng lịch sử tương lai.
