# S-31 — Quyết định quyền ngoại lệ

Ngày 08/10/2026, PO/người dùng trả lời trực tiếp câu hỏi trong task Codex:

> Cấp riêng quyền ngoại lệ theo suất/cửa

Câu hỏi nêu hai lựa chọn: nhân viên được cấp riêng quyền ngoại lệ theo từng suất/cửa, hoặc chỉ trưởng ca được phân công; STAFF/ADMIN hay quyền quét thường không tự có quyền ngoại lệ.

Quyết định `S31-PO-20261008-SCOPED-CAPABILITY`: chọn capability riêng, không giới hạn vào vai trò trưởng ca. Endpoint giữ role gate của S-30 (STAFF/ORGANIZER/ADMIN) và luôn yêu cầu assignment riêng theo cửa thuộc suất. canOverride=true chỉ do người vận hành có thẩm quyền cấp trong dữ liệu tin cậy; mặc định false. Không có auto-grant cho admin, organizer sở hữu sự kiện hoặc mọi staff. BUYER vẫn bị chặn role gate.

Chỉ dùng cho vé PAID đúng suất đã có NORMAL đầy đủ, sau khi nhân viên xác nhận thực tế khách là chủ vé thật; yêu cầu lời xác nhận và lý do 1–500 ký tự. Nút/checkbox ghi attestation của nhân viên, không chứng minh danh tính khách. Không bổ sung KYC/upload giấy tờ. Mỗi ngoại lệ lưu thêm lịch sử với lý do/tên nhân viên/cửa/thời gian, giữ lần vào đầu.

Không đổi ID, ba AC, SP, Sprint, Owner hoặc dependency của backlog. Đây là quyết định mới cho điểm CẦN CHỐT trong UI/kiến trúc, không thay DEC-01–12 hoặc mở rộng offline.
