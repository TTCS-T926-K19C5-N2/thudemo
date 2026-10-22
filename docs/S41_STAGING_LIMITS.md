# S41 — ngưỡng khởi điểm staging

Ngày 22/10/2026, người dùng giao ước lượng ngưỡng thực tế trong quá trình hoàn thiện. Đây là lựa chọn kỹ thuật ban đầu cho staging, không phải kết quả benchmark hay xác nhận NFR production.

| Thao tác | Mỗi tài khoản / 60 giây | Mỗi IP / 60 giây |
| --- | ---: | ---: |
| Giữ ghế | 60 | 6.000 |
| Tạo đơn | 15 | 1.500 |

Giữ giới hạn tài khoản hiện hành. Ước lượng IP theo mạng chung khoảng 200 người: trung bình 30 yêu cầu giữ ghế hoặc 7,5 yêu cầu tạo đơn mỗi người trong một phút. Đây là ngân sách chống chặn nhầm do NAT, không phải cam kết laptop xử lý được 100 yêu cầu giữ ghế mỗi giây. Giới hạn tài khoản và IP được kiểm đồng thời; retry/idempotency/quota ghế vẫn áp dụng riêng.

Mức cũ 240 yêu cầu giữ ghế/IP/phút gây HTTP429 khi nhiều tài khoản chung IP. Không thay concurrency, dataset, protocol, ngưỡng latency hay assertion nghiệp vụ của T31 để né vấn đề. Sau thay đổi cần chạy lại nguyên gate; nếu vượt ngưỡng hiệu năng thì giữ FAIL và điều tra hiệu năng.

Biến server: `BOOKING_HOLD_ACCOUNT_LIMIT`, `BOOKING_HOLD_IP_LIMIT`, `BOOKING_ORDER_ACCOUNT_LIMIT`, `BOOKING_ORDER_IP_LIMIT`. Compose demo truyền các giá trị từ `.env`. Cửa sổ hiện tại là bộ đếm TTL60 giây từ yêu cầu đầu, không phải sliding window. Vượt mức trả HTTP429 và Retry-After; Redis không sẵn sàng vẫn từ chối an toàn. Không tin X-Forwarded-For chưa xác thực.

Kiểm hồi quy gồm 200 tài khoản chung IP, mỗi tài khoản10 yêu cầu; tài khoản vượt60 bị chặn; trần IP cấu hình thấp bị chặn dù đổi tài khoản. Các kiểm này không thay thế đo throughput/latency hoặc nghiệm thu staging.

Hiệu chỉnh tiếp dựa trên lưu lượng hợp lệ và tỷ lệ429 theo mạng chung; không ghi email/IP/tokens vào nhãn metric. Giữ bảo vệ login độc lập. Không tăng ngưỡng tự động chỉ để làm CI xanh.

Tham khảo nguyên tắc điều chỉnh theo nghiệp vụ: [OWASP API4:2023](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/). Các con số trong bảng là ước lượng của dự án, không phải ngưỡng do OWASP quy định.
