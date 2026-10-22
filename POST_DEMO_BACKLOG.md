# Sau demo — chưa gọi Sprint Done / production-ready

| S-ID | Tạm/thiếu | Ảnh hưởng, AC/NFR/DoD | Hướng xử lý | Priority |
|---|---|---|---|---|
| S25–26 | PAID seed giả; khóa demo lưu volume riêng | Không chứng minh provider payment thật; operational rotation trên active deployment chưa kiểm | Sandbox riêng; diễn tập keyring giữ public keys cũ, backup/restore keys | P1 |
| S27 | SMTP catcher; actual retry3 và PNG receipt đã kiểm | Chưa chứng minh Internet delivery/DNS/SPF/DKIM | Cấu hình provider có quyền, chạy receipt ngoài hệ thống; không dùng logger thay transport | P1 |
| S28 | Tài khoản giả khởi tạo chung password do người cài chọn | Không dùng profile này production; auth/role/disable vẫn bắt buộc | Provision riêng, rotate demo credentials thủ công nếu cần | P1 |
| S29–31,39 | Browser camera emulation/text fallback | Chưa kiểm camera vật lý/ngoài trời; NFR500ms chưa benchmark đủ điều kiện | Kiểm thiết bị thật và tải đúng giao thức, không hạ ngưỡng | P1 |
| S32,38 | Dataset nhỏ; màn hình đơn chỉ dùng projection ET1 (khối legacy/transfer được giữ code nhưng không render) | Transfer/coupon ngoài scope không được coi đã nghiệm thu; ownership bắt buộc server | Nghiệm thu transfer riêng sau demo; giữ tải ảnh ET1 và ownership tests | P2 |
| S33 | Snapshot nhỏ trên laptop | AC5000vé/4G<10giây NOT RUN | Dataset5000, mạng4Gthật, đo cấu hình/generator/threshold gốc | P1 |
| S34–37 | Hai Chromium profiles và network emulation | Không phải hai thiết bị vật lý; offline không ngăn trùng tức thì; thiết bị giờ sai vẫn cần diễn giải | Test hai thiết bị, clock skew và reconnect thực; giữ durable queue/replay/idempotency | P1 |
| S25–39 | Compose demo HTTP localhost, API compiled development mode cho existing mock guard | Không an toàn để mở Internet; không thay production protection. LAN TLS setup/OS khác chưa kiểm | Profile production riêng: TLS/secure cookies/provider secrets; deployment/platform checks | P1 |
| S25–39 | Seed idempotent theo ngày/batch, không reset used tickets | Dữ liệu tích lũy; đổi env không reset mật khẩu hoặc DB password | Thêm batch rõ ràng; quản lý vòng đời dataset sau demo có phê duyệt, không xóa tự động | P2 |
| Toàn dự án | Các task Master Plan ngoài dependency Sprint4–5 giữ nguyên | Không đạt toàn bộ dự án/AC/DoD vì demo hoạt động | Tiếp tục RTM/findings Master Plan sau buổi demo; không đổi Done tự động | P2 |

Bằng chứng clone sạch/restart và source SHA nằm trong báo cáo bàn giao tại outputs của người thực thi; không retag CI hoặc local proof thành production. Required checks/DEC18 không bị nới để demo.
