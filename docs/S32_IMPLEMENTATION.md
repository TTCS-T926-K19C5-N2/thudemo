# S-32 — implementation trên main mới

Ngày 08/10/2026. Branch `task/orders-integration-ready`, base `de610b58ab065a22342ab18a49970626134197fd`. Bằng chứng local trước commit đủ ba AC/NFR; trạng thái Git/CI tiếp theo được ghi trong PR. Chưa tích hợp main. PR #47 đã merge; không dùng kết luận OPEN của bằng chứng ngày07 làm trạng thái hiện tại. Dependency/contract/payment/PR #51 và nội dung PR đề xuất: [ORDERS_INTEGRATION_HANDOFF.md](ORDERS_INTEGRATION_HANDOFF.md).

## AC/NFR nguyên gốc

S-32 thuộc E-05, dependency S-16, Sprint4, Owner chưa phân. Không nhầm T-32 hoặc sửa workbook/SP/Sprint/Owner/AC.

1. Mới nhất trước, có trạng thái/sự kiện/số ghế/tổng tiền và phân trang.
2. API bằng mã đơn của người khác trả403.
3. Đơn hủy/hết hạn vẫn xuất hiện đúng trạng thái.

NFR: phân trang phía máy chủ, không tải toàn bộ lịch sử một lần. Evidence mapping: [S32_EVIDENCE.md](S32_EVIDENCE.md).

## API và dữ liệu

- `GET /orders/me?page=1&pageSize=10`: cookie session + BUYER guard; danh tính từ `req.user.id`; count và page đều `{userId}`. Thứ tự `createdAt DESC,id DESC`, Prisma `take/skip`, batched event/showtime và item count.
- Trả `serverTime`, `orders` và `pagination:{page,pageSize,total,totalPages,hasPrevious,hasNext}`. Summary gồm id/code/createdAt/status/paymentExpiresAt/seatCount/totalAmount và event/showtime.
- `GET /orders/:id`: chỉ probe owner trước quyền, query content scoped `{id,userId}` sau quyền; người khác403/missing404/invalid UUID400/unauth401/admin không bypass. Giữ shape flat S-17 và `order` S-16 để không phá luồng hiện có.
- `GET /orders/:id/status`: reader nhẹ, không load items/event/all payment attempts; cùng owner403 và server DB clock, có latestPayment id/status/attemptNo. Detail cũng có field này cho S-22, không có payment payload/token/transaction details.
- GET không mutation. `isOrderExpired` dùng deadline đã lưu cho PENDING/PENDING_PAYMENT; terminal status giữ nguyên. Không chờ cleanup để biết hết hạn.
- `totalAmount` lấy record order; từng ghế dùng `unitPrice`/category snapshot. Không tính lại từ giá live, không sửa chênh lệch tổng bằng GET. Payment initiation/webhook đã được sửa có giới hạn để cùng giữ số tiền đã đặt.
- Cache: API private,no-store/VaryCookie; proxy/upstream fetch no-store, dynamic Orders routes, state local/abort/session event/BroadcastChannel; không shared cache hoặc localStorage order data.

## Quyết định triển khai bổ sung

Đây là lựa chọn kỹ thuật, không là AC có sẵn: page1/size10/max50; canonical positive integer validation, max page tránh tràn signed OFFSET; RepeatableRead snapshot count/page; out-of-range200/mảng rỗng/metadata thật và UI recovery; code `DH-` + toàn bộ UUID encode base36 không cắt ngắn; page giữ trong URL; countdown đọc lại server tại deadline, không tự thanh toán.

## V1 và structure

Route mỏng `/orders` và `/orders/[id]`; business UI trong `features/orders`, decoder/mapper ở `lib/contracts`, read service trong Orders hiện có. `OrderReview` S-17 wrap cùng detail; không tạo Orders thứ hai.

Giữ PublicLayout/account/navigation, existing Button/Badge/Table/Alert/Skeleton, Geist Sans/Mono, formatVnd/formatShowtime, token `.product --primary #0045a9 --background #faf8ff`. `.stitch/metadata.json` V1 không có riêng history; so catalog cùng viewport và compose existing components. Không tài nguyên V2, coral/lime/new-dark hoặc redesign shell/organizer.

Desktop table, mobile cards; code/event/showtime/date/seats/total/status/details; skeleton/empty/discovery/error/retry giữ page/login continuation/safe403; bàn phím/focus và session switch. Payment action chỉ là chức năng S-17/S-19 thực sự đã có, explicit click khi đơn chờ còn hạn; mở trang không tạo payment. Không thêm refund/cancel/export/search/QR/mua lại.

Migration chỉ `202610080001_order_history_index`; đã áp trên DB riêng15434, chưa shared/staging. Toàn bộ file, dependency risk, reviewer đề xuất và gate integration ở tài liệu handoff. Code review là review của Codex, không attribution/approval độc lập.
