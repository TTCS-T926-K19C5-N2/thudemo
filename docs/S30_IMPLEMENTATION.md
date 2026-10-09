# S-30: tích hợp ký QR và soát vé V1

Nguồn: PR #68 của tovanquyenh-blip, branch feature/SCRUM-30-qr-ticket-check. Giữ các commit gốc; sửa mới do Codex theo ủy quyền, không chứng minh tác giả tài khoản trực tiếp code/review. Base kiểm: 79704a2dc2de0eddb883319a1a520085b89e18cb (S-33 đã merge).

## Phạm vi và dependency

S-26 tối thiểu theo [contract](S26_SIGNED_QR_CONTRACT.md). S-29 được thực thi bằng session/role hiện hữu và assignment suất/cửa; không thêm màn hình tự cấp quyền. Seed/grant bằng công cụ quản trị tin cậy; không tự gán staff/admin mọi cửa.

S-30 cần thời điểm/cửa và nghiệp vụ nguyên tử: tái sử dụng nền ledger đã chuẩn bị S-31, migration 202610080003_s31_admission_ledger giữ đúng bytes/checksum để S-31 tích hợp không tạo bảng lần hai. S-30 chỉ NORMAL; canOverride trả false. EXCEPTION schema dành cho dependency sau, chưa có route/UI ngoại lệ.

Khóa OrderItem và paid Order bằng SELECT FOR UPDATE, kiểm paid/seat/suất, ghi NORMAL + checkedInAt + matching Ticket S-33 trong transaction. Partial unique NORMAL(ticketId) và unique(staffId,requestId) là database guarantees. Trả hợp lệ sau commit. Ticket S-33 CANCELLED veto; CHECKED_IN kể cả thiếu thời gian phải từ chối, không bịa thời gian.

Controller mỏng, domain Orders service, QR crypto Scanner service. UI giữ tokens/layout/font/màu V1, thêm public-key verification trước request nhưng server vẫn verify. Không offline fallback. Quá 3 giây có WAITING, không báo xanh khi mất mạng. Trang vé hiển thị một QR ký; sửa CSS V1 đang thu SVG về icon bằng kích thước cục bộ QR, không sửa design system.

S-33 /scanner/snapshot giữ luồng tải danh sách thật; payload canonical OrderItem IDs thay trùng alias Ticket cùng ghế, incremental nhìn thấy admission và public ring rotation. Không triển khai lại offline; không tuyên bố benchmark local là <10s/4G.

## Loại thay đổi ngoài phạm vi từ PR gốc

Khôi phục AppModule/HoldsModule/HoldsController/EventsController về main để không vô hiệu expiry/auth. Loại public seat-write controller, decorator public trùng và guard bypass throttling bằng header/user-agent/CI. Giữ guard/rate-limit/auth chuẩn. Các migration gốc (kể cả NOP cũ) giữ nguyên bytes; không rewrite tác giả Ten Cua Ban của commit cũ.

## Migration và rollback

Migration thật 22 bước trên DB test riêng. Không db push/reset/sửa migration đã áp dụng. File verification/s31-compensate-empty.sql chỉ là mẫu migration bù MỚI, từ chối nếu có lịch sử/quyền/cửa. Khi đã có dữ liệu: rollback application, giữ schema/lịch sử; không chạy DROP hoặc biến vé chưa dùng. Reapply qua migration mới theo AGENTS, không sửa checksum cũ.

## Kiểm chứng và giới hạn

Xem [evidence](S30_EVIDENCE.md). Local khác CI khác staging/camera. Không merge khi camera/ngoài trời là gate bắt buộc mà còn thiếu. Không deploy trong task.
