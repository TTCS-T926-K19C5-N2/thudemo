# Dependency S-26 cho S-30/S-31: QR ký thật

Phạm vi tối thiểu: phát QR từ vé đã thanh toán, ký/xác minh, cấu hình và xoay khóa. Không tuyên bố toàn bộ S-26 Done, không đổi backlog/Owner/Sprint/AC. Lựa chọn Ed25519 là quyết định kỹ thuật của bản sửa cần review trước merge; các thuật toán từng ghi “AI đề xuất” không được coi là phê duyệt.

## Contract ET1

`ET1.Ed25519.<keyId>.<showtime UUID>.<OrderItem UUID>.<signature>`

Ký đúng chuỗi ASCII năm phần đầu nối bằng dấu chấm. UUID chữ thường theo parser chung; keyId 1–32 ký tự ASCII chữ/số/_/-. Chữ ký Ed25519 64 byte, base64url 86 ký tự không padding, canonical. Allowlist chỉ ET1/Ed25519 và các key ID cấu hình. Không tên/email/đơn thanh toán trong payload. Parser duy nhất: packages/shared/ticket-qr.js; Node crypto sign/verify và browser WebCrypto verify dùng cùng signingInput.

Tái sử dụng ScannerCryptoService của S-33, không hệ scanner thứ hai. Ed25519 phù hợp khóa S-33 đã có, Node 24.21.0 và WebCrypto Chromium đã kiểm. Browser không hỗ trợ phải báo lỗi; không cho qua. [Node crypto](https://nodejs.org/download/release/v24.21.0/docs/api/crypto.html), [WebCrypto importKey](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/importKey), [verify](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/verify).

## Phát và soát

GET /orders/:id/tickets: BUYER có session, chỉ chủ đơn PAID, 404 cho đơn người khác; no-store. Dùng OrderItem hiện hữu, không tạo vé/payment/email lần hai. Ticket S-33 CANCELLED là veto; CHECKED_IN vẫn dùng. Chọn một QR trên trang đơn V1, không còn UUID trần.

POST /showtimes/:id/check-in: qrPayload, gateId, requestId (UUID). Session/role và assignment suất/cửa kiểm phía server trước metadata; xác minh chữ ký lại, suất/vé/paid/seat, khóa ticket+order rồi ghi NORMAL và state cùng transaction. Server lấy nhân viên và thời gian. Retry cùng requestId trả ALREADY_RECORDED, UI ghi rõ không phải lần vào mới. Không fallback UUID, không client boolean “QR valid”.

S-31 EXCEPTION phải dùng cùng qrPayload/verifier; không dùng ticket UUID làm đường bypass. S-30 chưa cung cấp endpoint ngoại lệ.

## Khóa

API server: SCANNER_KEY_ID + SCANNER_SIGNING_PRIVATE_KEY_FILE (khuyến nghị) + SCANNER_PUBLIC_KEYS JSON key ID → public SPKI PEM. Hỗ trợ cấu hình private PEM phía server theo S-33 cũ nhưng không đồng thời với private file. Scanner/browser chỉ nhận public ring. Không đưa private vào NEXT_PUBLIC, image, repository, evidence hoặc log.

Tạo khóa có chủ đích bằng `node apps/api/scripts/qr-keygen.mjs <thư-mục-ngoài-repo> <key-id>`; từ chối ghi đè. Lưu private bằng secret volume/secret manager bền vững, quyền đọc chỉ tiến trình API. Không tạo khóa khi startup. Thiếu toàn bộ cấu hình: nghiệp vụ QR 503; cấu hình dở/sai khóa: fail closed, thông báo không chứa PEM/path. Các flow không dùng QR vẫn khởi động khi chưa cấu hình.

Xoay thông thường: thêm public k2, giữ public k1, chuyển active ID/private sang k2; khởi động lại. Vé k1 còn verify, vé mới k2. Không loại public k1 đến khi vé k1 hết hiệu lực; xử lý khóa bị lộ là quy trình khác cần quyết định riêng. Browser đang mở tải lại cửa/khóa trước dùng khóa mới. S-33 snapshot giữ envelope cũ, thêm verificationKeys và lưu ring vào IndexedDB cả full/incremental.

## QR UUID trước đây

Không xóa vé hoặc lịch sử. Chủ đơn PAID mở lại trang đơn để lấy QR ET1 từ vé hiện có. UUID/image cũ không soát được; nhân viên hướng dẫn mở lại vé. Không có grace period nhận UUID unsigned.
