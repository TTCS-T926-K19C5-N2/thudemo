# Báo cáo rà soát S-15 và S-16 — 06/10/2026

Branch: `feature/S-15-S-16-pricing-orders`. Chưa commit/push các thay đổi triển khai.

## Cập nhật sau sửa — 06/10/2026

F-01/F-02 đã sửa; ba test từng thất bại nay PASS. Toàn bộ 37 E2E, 23 unit test, lint, typecheck và build đều PASS. Đã kiểm browser luồng giá/giữ ghế/tạo đơn, nhánh mất ghế và tự cập nhật hết hạn trên desktop/mobile. Báo cáo hiện tại: [fixed/verification.md](fixed/verification.md); test case cập nhật: [S15-S16-test-cases.md](../../../docs/testing/S15-S16-test-cases.md).

**Các phần bên dưới là lịch sử review trước sửa**, không phải trạng thái lỗi hiện tại. Giữ nguyên để đối chiếu bằng chứng FAIL trước và PASS sau, không che kết quả cũ.

Nguồn nghiệm thu: hai ảnh Jira do người dùng cung cấp và yêu cầu hạn thanh toán 10 phút. Các đường dẫn `../docs/` và `../tasks/` được AGENTS.md dẫn tới không có trong workspace hiện tại.

## Kết luận

S-15: các yêu cầu chính đã có trong source/API và phù hợp các test đã chạy. Phần đặt giá/chặn mở bán tái sử dụng chức năng có sẵn trong repo; phần bảo toàn giá của đơn chờ được bổ sung bằng OrderItem snapshot trong S-16.

S-16: luồng thông thường đúng, nhưng chưa đạt đầy đủ tiêu chí khi ghế hết hạn. Hai tình huống bổ sung đã tái hiện việc tạo đơn sai. Cần sửa và bổ sung test trước khi kết luận hoàn thành hai task hoặc merge vào main.

## Đối chiếu tiêu chí

| Task | Tiêu chí Jira | Kết quả và bằng chứng |
| --- | --- | --- |
| S-15 | Đặt giá từng hạng và hiển thị đúng khi trỏ ghế | Có form giá từng category, API PATCH /showtimes/:id/prices và API sơ đồ trả giá category. Canvas onPointerMove cập nhật thông tin ghế gồm đơn giá. Source/API đạt; chưa xác minh lại hover bằng browser trong lượt này. |
| S-15 | Thiếu giá thì chặn mở bán, nêu tên hạng | Đạt. Demo ba hạng giá null trả HTTP 409 với tên Ban công, Tiêu chuẩn, VIP. UI vô hiệu nút Mở bán và hiện lý do; backend cũng chặn. |
| S-15 | Đổi giá không thay đổi đơn chờ; đơn mới dùng giá mới | Đạt. OrderItem lưu unitPrice/categoryName tại thời điểm tạo; tổng đơn được lưu. E2E kiểm giá cũ còn nguyên và người mua khác tạo đơn theo giá mới. |
| S-15 | Giá âm hoặc không phải số bị chặn ngay tại ô | Source có aria-invalid, thông báo tại ô và chặn Lưu giá; backend từ chối giá âm, chuỗi, thập phân, null và vượt giới hạn. Đạt theo source/API; chưa tự động thao tác ô nhập bằng browser lượt này. |
| S-16 | Hai ghế còn hạn tạo một đơn chờ, đúng ghế/tổng và kéo dài giữ chỗ 10 phút | Đạt luồng thường: E2E kiểm hai item, tổng từ server, chênh hạn thanh toán/serverTime = 600000 ms và hạn seat_holds trùng hạn đơn. |
| S-16 | Một ghế hết hạn thì không tạo đơn, báo ghế mất | Chưa đạt đầy đủ. Test cũ chỉ kiểm bản ghi hết hạn còn tồn tại. Kiểm bổ sung thấy lỗi khi bản ghi đã bị dọn và khi ghế hết hạn trong lúc chờ khóa database. |
| S-16 | Có đơn đang chờ thì trả về đơn đó | Đạt ở API: truy vấn đơn live theo người mua/suất diễn trước khi tạo mới; trả created=false. |
| S-16 | Bấm hai lần/mạng chậm chỉ tạo một đơn | Đạt cho yêu cầu đồng thời đã test: khóa dòng người mua và unique index; E2E hai request trả cùng ID, chỉ một bản ghi. Chưa có browser test mô phỏng mất phản hồi mạng. |

## Lỗi đã tái hiện

### F-01 — Tạo đơn dù hold hết hạn trong lúc chờ khóa database

Mức ưu tiên: cao, ảnh hưởng trực tiếp tiêu chí từ chối ghế hết hạn của S-16.

- `apps/api/src/orders/orders.service.ts:73` lấy thời gian máy chủ trước các khóa showtime/hold/seat.
- `:99`, `:113`, `:127` có thể phải chờ transaction khác.
- `:129` và `:132` vẫn kiểm expiresAt theo thời gian cũ.
- Kiểm tái hiện trên PostgreSQL cô lập: rút hạn hold còn 700 ms; transaction khác giữ khóa showtime trong 1600 ms; gọi createFromHold khi hold còn hạn.
- Kỳ vọng: khi được xử lý sau hết hạn, trả HOLD_EXPIRED và không có đơn.
- Thực tế: tạo đơn thành công khoảng 938 ms sau hạn cũ; serverTime trong response đã cũ khoảng 1621 ms.
- Hướng sửa: lấy lại giờ DB sau khi đã lấy các khóa cần thiết, kiểm tra hiệu lực lại rồi tính deadline thanh toán từ mốc hợp lệ đó; thêm test chờ khóa qua thời điểm hết hạn.

### F-02 — Mất một bản ghi ghế thì tạo đơn với ghế còn lại

Mức ưu tiên: cao đối với tính toàn vẹn danh sách ghế; kiểm tái hiện có chủ động làm một ghế hết hạn để kiểm nhánh Jira.

- `apps/api/src/orders/orders.service.ts:122` chỉ lấy các seat_holds còn thuộc hold/token hiện tại.
- Nếu bản ghi ghế mất đã bị cleanup hoặc đổi chủ, ghế đó không có trong kết quả, nên lostSeatIds cũng không chứa nó.
- Không có đối chiếu danh sách đầy đủ người mua đã giữ với danh sách dùng tạo đơn.
- Kiểm tái hiện: giữ A-1 và A-2; cho A-2 hết hạn; chạy cleanup theo đúng seatId/token; tạo đơn.
- Kỳ vọng: báo mất A-2 và không tạo đơn.
- Thực tế: tạo đơn một item (A-1), dù ban đầu người mua giữ hai ghế.
- Lưu ý: các ghế cùng hold bình thường dùng chung deadline. Đây là kiểm tình trạng mất một ghế theo AC, không phải khẳng định hai ghế bình thường có deadline khác nhau.
- Hướng sửa: có danh sách kỳ vọng của lượt giữ được đối chiếu đầy đủ trong transaction; chỉ thành công khi còn đủ mọi ghế. Danh sách kỳ vọng không được dùng để tin giá/người mua từ client. Thêm test expired-record-cleaned và expired-record-reclaimed.

## Hạn chế giao diện cần biết

`apps/web/src/features/orders/order-status.tsx:16` chỉ fetch đơn khi mount/ID đổi. Nếu để nguyên trang qua hạn 10 phút, nội dung không tự tải lại và có thể vẫn hiện Tạo đơn thành công. Reload gọi GET mới và cập nhật EXPIRED. Đây là hạn chế giao diện xác nhận; không tính là yêu cầu của thanh toán thực hay tự động hủy đơn trong các story sau.

Trang đơn hiện hiển thị mã và hạn giữ; chưa có bảng ghế/tổng tiền hoặc cổng thanh toán. Xem chi tiết đơn (S-17) và thanh toán không thuộc hai task này.

## Kiểm tra đã thực hiện

- `pnpm.cmd lint`: pass.
- `pnpm.cmd typecheck`: pass.
- `pnpm.cmd test`: API 6 + web 17 = 23 test pass.
- `pnpm.cmd --filter api run test:e2e`: 5 file / 17 test pass trên DB sprint2_integration, port 15432.
- `pnpm.cmd build`: API và web pass.
- `prisma migrate status`: 10 migration, database local up to date.
- `/health`: HTTP 200, status ok.
- `git diff --check`: không lỗi whitespace; có cảnh báo chuyển LF/CRLF của Git.
- Hai kiểm bổ sung dùng service build từ source hiện tại và PostgreSQL cô lập: đều tái hiện lỗi như trên. Fixture dùng riêng cho kiểm bổ sung đã được xóa; script tạm đã được gỡ.
- Evidence performance lượt chạy mới: `integration-performance.json` trong cùng thư mục, không ghi đè evidence sprint2 cũ.

Chưa kiểm đầy đủ desktop/mobile, keyboard/focus và console bằng browser trong lượt này. Skill vercel:agent-browser-verify được AGENTS.md yêu cầu không có trong catalog skill phiên hiện tại. Khi thử skill computer-use thay thế, runtime node_repl không khởi động: `windows sandbox failed: CreateProcessWithLogonW failed: 2`. Đánh giá UI ở trên dựa trên source và ảnh người dùng, không được coi là browser test mới đã pass.

## Demo chưa đặt giá

Suất Demo hiện có 30 ghế (mỗi hạng 10), ba hạng VIP/Tiêu chuẩn/Ban công đều price=null, trạng thái DRAFT. Không thay giá suất demo cũ có 2000 ghế.

- Giá vé: http://localhost:3000/showtimes/e5969d51-7419-4925-8695-d5a654ea2a45/prices
- Quản lý/mở bán: http://localhost:3000/showtimes/e5969d51-7419-4925-8695-d5a654ea2a45/manage
- Đăng nhập bằng organizer@demo.invalid với mật khẩu local đã được cung cấp trong hội thoại.

Trong lượt review này không sửa source triển khai hai task, không commit/push. Bước tiếp theo để nghiệm thu là sửa F-01/F-02 và thêm test hồi quy, sau đó chạy lại các gate liên quan.

## Bổ sung test case theo yêu cầu tiếp theo — 06/10/2026

- Tài liệu bước kiểm thử, tiền điều kiện, dữ liệu và kỳ vọng: `docs/testing/S15-S16-test-cases.md`.
- Suite mới: `apps/api/test/s15-s16-acceptance.e2e-spec.ts`, 17 trường hợp, 14 pass / 3 fail.
- Tái hiện thêm nhánh ghế hết hạn đã được người mua khác giữ lại (TC-S16-07): người mua ban đầu vẫn tạo được đơn thiếu ghế. Cùng nguyên nhân F-02.
- Test lỗi còn tồn tại chạy bình thường, không skip, không dùng kỳ vọng sai để làm xanh.
- Cấu hình E2E chạy các file lần lượt vì có truy vấn catalog toàn cục trên database dùng chung; requests của test chống double-click vẫn được gửi đồng thời.
- Toàn bộ E2E: 34 test, 31 pass / 3 fail. Cả 17 test cũ đều pass.
- Ba case fail: TC-S16-06 (cleanup), TC-S16-07 (reclaim), TC-S16-08 (hết hạn trong lúc chờ lock).
- Lint/typecheck API pass; không đổi source nghiệp vụ hoặc migration ở lượt thêm test.
- Kết quả runner: `test-cases/e2e-results.json` trong thư mục báo cáo này.
