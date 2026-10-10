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

## Bổ sung bằng chứng ngày 10/10/2026

[Camera Android](S30_DEVICE_EVIDENCE_20261010.md) ghi bảy ca thật trên hai máy, source ứng dụng `d423fa8d2e5143b07cd7158985776ef8ca740ce8`. Redmi Note 11 4G chưa kiểm theo cập nhật của người dùng; không phải yêu cầu bắt buộc ba model. Người dùng báo kiểm cả hai máy lúc khoảng 12h ngày 10/10 dưới nắng trực tiếp, đọc rõ/bấm được và xác nhận scanner V1 bản S-30 sửa QR của PR #68. Ghi PASS do người thực hiện báo cáo; không giả ảnh/log/telemetry lúc trưa.

Revision bổ sung chỉ tài liệu và ảnh/JSON fixture đã lọc thông tin; không đổi signer, verifier, migration hoặc scanner. Phải đối chiếu CI và review của head chứa bổ sung sau publish. Camera trên source `d423fa8` không tự trở thành bằng chứng đã chạy trên một SHA mới. Chưa merge hoặc deploy; trạng thái và log thao tác thật sau publish được cập nhật trong PR.
