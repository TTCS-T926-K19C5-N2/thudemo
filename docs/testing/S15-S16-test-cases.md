# Test case S-15 và S-16

## Cập nhật mới nhất: validated routine / pipeline (06/10/2026)

Snapshot local v5: **51/51 E2E** (34suite riêng), **77/77unit**,3helper,build/lint/typecheck PASS. Thêm ca DB thật routine timeout khi COMMIT đã queue: phải rollback snapshot/ghế, không leak timeout/pipeline; giữ mọi AC giá đơn cũ/đủ ghế/600giây/idempotency. v2 kiểm toàn bộ trênserver và RAISE trước COMMIT, pipeline chỉ sau BEGIN được xác nhận. Seat-map live giá/expiry/quyền/6fields không cache; max2000ghế14,30ms. V4 CI p95347,07ms còn FAIL nên **cần CI SHA mới, chưa merge main**. [Báo cáo v5/raw](../../evidence/review/20261006/t31/optimization-v5/verification.md). Mọi mục dưới là lịch sử.

## Cập nhật mới nhất: PostgreSQL routine, 06/10/2026

Local bản v4 theo phê duyệt: **50/50 E2E** (suite riêng 33/33), **64/64 unit**, 3 helper; build/lint/typecheck/health PASS. Giữ toàn bộ AC giá theo hạng/snapshot giá cũ, tạo đơn đủ ghế còn hạn/idempotency/thanh toán 600 giây. Thêm test routine VOLATILE/invoker, input mảng sai không ghi dữ liệu, giữ 2000 ghế và retry không gia hạn; quan sát chờ khóa qua hạn vẫn bắt buộc. Hai lượt HTTP đầy đủ p95 187,32 / 191,43 ms, 45 correctness checks/lượt; không hạ 300 ms hoặc bỏ mẫu đầu. **Snapshot local trước commit/push, cần CI đúng SHA mới, chưa merge main**. [Báo cáo v4 và các lượt lỗi đã giữ](../../evidence/review/20261006/t31/optimization-v4/verification.md). Các mục phía dưới là lịch sử.

## Cập nhật mới nhất: pool readiness và seat reads, 06/10/2026

Nhánh `test`, base `6a60b9b`, snapshot trước commit/push: **48/48 E2E, 63/63 unit, 3 helper PASS**; build/lint/typecheck và health local PASS. Suite riêng 31 test gồm 28 AC cũ + driver timeout đã có + hai test seat-read mới. Hai lượt benchmark thường p95 **214,11 / 195,38 ms**, đủ 45 checks/lượt; sơ đồ 2000 ghế max **15,67 ms**, 30 mẫu. Không cộng benchmark checks vào E2E.

Thêm test bảo vệ preview draft chỉ cho đúng organizer, từ chối anonymous/buyer/organizer khác, public draft/missing/closed 404; đọc live giá mới và expiry (HELD→AVAILABLE không cần cleanup), đúng sáu public fields, không lộ owner/token. Không sửa kỳ vọng test cũ hoặc nghiệp vụ/TTL 600 giây. Pool cap vẫn 16 nhưng chuẩn bị/giữ 16 idle sockets/API; worker reserve 1. CI base còn FAIL, nên chỉ nghiệm thu local và chờ CI SHA mới; người dùng đồng ý commit/push, chưa merge main. [Báo cáo và toàn bộ raw](../../evidence/review/20261006/t31/optimization-v3/verification.md).

## Bản ghi tối ưu shared-pool SQL (lịch sử)

Working tree nhánh `test`, base `bd62011`: **46/46 E2E, 48/48 unit, 3 helper test PASS**. Suite riêng có 29 test = 28 AC S-15/S-16 cũ + một test driver timeout/rollback mới; không cộng benchmark checks vào số E2E. Build/lint/typecheck toàn workspace và health local PASS. Hai lượt benchmark cuối đạt total p95 **209,23 / 204,10 ms**, steady **133,28 / 120,75 ms**, đủ 45 checks/lượt, exit 0, nfrPass=true.

Giá, snapshot giá đơn, chống tạo trùng và hạn thanh toán 600 giây không đổi. Đọc phiên vẫn kiểm DB mỗi request, không cache auth; dùng cùng pool/SQL nghiệp vụ, thêm server-side statement timeout trong transaction. Đây là **snapshot trước commit/push**; người dùng đã yêu cầu push `test` để CI kiểm bản mới. Chưa xác nhận CI PASS hoặc merge main từ các kết quả local này. Báo cáo và mọi lượt trước/sau: [verification.md](../../evidence/review/20261006/t31/optimization-v2/verification.md).

Các mục bên dưới là kết quả lịch sử của những lần nghiệm thu trước, không phải số test hoặc trạng thái CI mới nhất.

Ngày chạy: 06/10/2026. Branch: `feature/S-15-S-16-pricing-orders`.

## Kiểm tra bổ sung sau CI hiệu năng

Lượt mới nhất (profiling/prepared statements): **45/45 E2E, 28/28 nghiệm thu riêng,
25/25 unit PASS**, thêm 3 helper test profiling PASS. Lint/typecheck/build PASS.
Bốn lượt giữ ghế local đạt total p95 256,66 / 258,58 / 273,28 / 266,10 ms.
Lượt mới nhất do người dùng chạy đủ **45 checks**, gồm cache restart thật;
steady p95 170,49 ms, nfrPass=true. CI mới chưa chạy, **chưa merge main**.
Chi tiết và toàn bộ lượt FAIL/PASS: `evidence/review/20261006/t31/verification.md`.
Không cộng checks benchmark vào 45 test E2E hoặc số test browser. Cache restart
vẫn làm mất khóa đăng nhập như giới hạn đã biết; không coi đây là nghiệm thu auth bền vững.

Branch hiện tại: `test`. Sau tối ưu snapshot/round-trip S-16: **45/45 E2E, 23/23 unit PASS**;
suite nghiệm thu riêng **28/28 PASS**. Lint, typecheck, build và health local PASS.
Không đổi TTL 10 phút, không sửa migration cũ hoặc hạ ngưỡng NFR 300 ms.
Bằng chứng bổ sung: `evidence/review/20261006/performance/`.
Kết quả browser bên dưới thuộc lượt nghiệm thu trước; đợt tối ưu này chỉ đổi backend và test, không đổi giao diện.

| Test bổ sung | Mong đợi | Kết quả |
|---|---|---|
| TC-S16-16: hai yêu cầu giữ đầu tiên chạy đồng thời | Một phiên, cùng deadline, snapshot chứa cả hai ghế, đơn đủ hai ghế | PASS |
| TC-S16-17: gửi lại cùng ghế | Không trùng snapshot, không gia hạn, đơn chỉ một ghế | PASS |
| TC-S16-18: tranh chấp ngay lần giữ đầu | Rollback cả snapshot phiên và ghế không tranh chấp; không có đơn | PASS |
| TC-S16-19: mất một ghế rồi thêm ghế mới | Snapshot vẫn giữ mã ghế bị mất; tạo đơn bị chặn và báo đúng ghế đó | PASS |
| TC-S16-20: suất đóng, ghế chưa giá hoặc mã ghế lạ (3 test) | Trả 409/400, không ghi phiên, snapshot hoặc ghế | PASS |
| TC-S16-21: giữ ghế chờ khóa phiên qua hạn | Kiểm lại clock sau khi chờ; trả HOLD_EXPIRED, không xác nhận quyền hết hạn hoặc gia hạn | PASS |

Đã sửa một kỳ vọng test race trong `sprint2.e2e-spec.ts`: chỉ response `created=true` phải có đủ 600 giây tại lúc tạo; response tái sử dụng cùng đơn có thời gian còn lại giảm theo serverTime, deadline không đổi. Không đổi deadline ứng dụng. Lượt FAIL được giữ trong `performance/cte/regression/e2e-failure-before-test-fix.json`.

## Trạng thái sau sửa ban đầu (snapshot trước tối ưu CI)

**37/37 E2E và 23/23 unit test PASS.** Suite nghiệm thu riêng có 20/20 test PASS. Ba test hồi quy TC-S16-06/07/08 đã chuyển từ FAIL sang PASS, không đổi kỳ vọng hoặc skip. Lint, typecheck và build PASS. Kết quả hiện tại: `evidence/review/20261006/fixed/`; kết quả FAIL trước sửa được giữ nguyên để đối chiếu.

Đã kiểm browser: lưu ba giá; chặn giá âm/chữ ngay tại ô; chặn mở bán khi thiếu giá; xem giá ba hạng bằng bàn phím và con trỏ chuột; giữ hai ghế và tạo đơn; chặn đặt vé khi còn ghế nháp; báo đúng A-2 bị mất sau khi tải lại danh sách; tự cập nhật đơn hết hạn. Đã kiểm chiều rộng 1280, 390 và 360px. Kiểm bổ sung mất phản hồi sau khi server tạo đơn: PASS, thử lại trả đúng đơn cũ và không gia hạn. Bằng chứng: `evidence/review/20261006/fixed/browser-final-results.json`. Số 37 E2E/23 unit không cộng thêm các kiểm browser.


## Dữ liệu và môi trường

- Ba hạng ghế: VIP / Tiêu chuẩn / Ban công.
- Giá chuẩn: 1.200.000 / 650.000 / 350.000 VNĐ.
- Có tài khoản ban tổ chức sở hữu sự kiện và hai người mua khác nhau.
- Suất mới bắt đầu ở trạng thái nháp, đã có sơ đồ và chưa có giá.
- Test tự động tạo riêng 6 ghế (mỗi hạng 2 ghế) cho từng test. Fixture tự dọn khi kết thúc.
- Test tự động chỉ chạy trên PostgreSQL `sprint2_integration`, `127.0.0.1:15432`; không dùng database demo `ttcs_local`.
- `HOLD_EXPIRY_MODE=off` để test chủ động kiểm soát nhánh hết hạn/cleanup.
- Test timeout dùng hạn ngắn để tránh phải chờ 10 phút; test luồng thành công vẫn xác nhận deadline chính xác 600 giây.

Demo kiểm thủ công: http://localhost:3000/showtimes/e5969d51-7419-4925-8695-d5a654ea2a45/prices . Suất có 30 ghế, ba hạng giá null khi được chuẩn bị. Nếu đã sửa giá, cần tạo một suất nháp khác/nạp sơ đồ trước khi thử lại trường hợp chưa đặt giá.

Không nhập 0 để mô phỏng chưa có giá: 0 là miễn phí; chưa có giá là null/ô trống.

## S-15 — Đặt giá cho từng hạng ghế

### TC-S15-01 — Lưu ba giá và hiển thị đúng trên ghế

- Điều kiện: suất nháp đã có sơ đồ ba hạng.
- Bước: vào Giá vé; nhập VIP 1.200.000, Tiêu chuẩn 650.000, Ban công 350.000; Lưu giá; mở bán; đăng nhập người mua; mở sơ đồ; trỏ/chọn một ghế mỗi hạng.
- Mong đợi: lưu thành công; chú thích và thông tin ghế hiển thị đúng hạng, đúng giá; không đổi giá của hạng khác.
- Tự động: PASS — kiểm API sơ đồ của cả 6 ghế.
- Browser: PASS khi lưu giá và dùng phím mũi tên kiểm A-1/B-1/C-1. Kiểm bổ sung con trỏ chuột: PASS, trỏ lần lượt C-1/B-1/A-1 hiện đúng 350.000/650.000/1.200.000đ; không chọn ghế. Do công cụ không có hover primitive, dùng chuột phải rồi Escape để di chuyển con trỏ thật, không dùng phím mũi tên hoặc left-click để đổi phần thông tin ghế; handler onClick không chạy với chuột phải.

### TC-S15-02 — Thiếu một hạng thì chặn mở bán

- Điều kiện: VIP/Tiêu chuẩn đã đặt giá, Ban công chưa đặt giá.
- Bước: mở quản lý suất diễn; thử Mở bán. Với API, PATCH status=ON_SALE.
- Mong đợi: UI chặn thao tác và hiện Ban công; API trả 409; suất vẫn DRAFT. Thông báo không liệt kê VIP/Tiêu chuẩn vì hai hạng này đã có giá.
- Tự động: PASS.

### TC-S15-03 — Đổi giá giữ nguyên đơn cũ, đơn mới dùng giá mới

- Điều kiện: VIP 1.200.000; người mua A giữ một ghế VIP và tạo đơn chờ thanh toán.
- Bước: ghi nhận giá và tổng đơn A; organizer đổi VIP thành 1.500.000; đọc lại đơn A; người mua B giữ một ghế VIP khác và tạo đơn.
- Mong đợi: đơn A vẫn unitPrice=1.200.000 và totalAmount=1.200.000; đơn B dùng 1.500.000; hai mã đơn khác nhau.
- Tự động: PASS — kiểm cả unitPrice và totalAmount sau khi đổi giá.
- Thủ công: trang xác nhận hiện chưa có bảng tổng/ghế; kiểm snapshot bằng API. Giao diện chi tiết đầy đủ thuộc S-17.

### TC-S15-04 — Giá không hợp lệ, không được lưu một phần

- Điều kiện: cả ba hạng đã có giá chuẩn.
- Dữ liệu riêng cho từng lượt: -1; abc; 1.5; null/ô trống; 2147483648.
- Bước UI: nhập giá không hợp lệ vào Tiêu chuẩn; kiểm lỗi tại ô; thử Lưu giá.
- Bước API: gửi cùng request VIP=1.500.000 và Tiêu chuẩn=giá không hợp lệ.
- Mong đợi: ô sai có lỗi, Lưu giá bị chặn; API trả 400; tất cả giá cũ giữ nguyên, kể cả VIP trong cùng request.
- Tự động: PASS cho 5 bộ dữ liệu API.
- Browser: PASS với -1 và abc: aria-invalid=true, Lưu giá bị vô hiệu. Các dữ liệu còn lại đã kiểm API, chưa thao tác riêng trên UI. Dấu chấm nhóm hàng nghìn hợp lệ (1.200.000); 1.5 không phải cách ghi giá hợp lệ trong form này.

### TC-S15-05 — Giá bằng 0 là miễn phí

- Bước: đặt Ban công=0, hai hạng còn lại có giá; lưu và mở bán.
- Mong đợi: lưu/mở bán thành công; API ghế Ban công có price=0; UI hiện miễn phí/0đ, không xem là chưa có giá.
- Tự động: PASS; phần hiển thị miễn phí cần kiểm UI.

### TC-S15-06 — Thiếu nhiều hạng phải nêu đủ tên

- Điều kiện: cả ba hạng chưa đặt giá, hoặc chỉ VIP có giá.
- Bước: vào quản lý suất diễn và kiểm lý do chặn Mở bán; gọi API mở bán.
- Mong đợi: liệt kê đúng toàn bộ hạng còn thiếu, không mở bán.
- Bằng chứng: API suất Demo với ba giá null trả 409, nêu Ban công/Tiêu chuẩn/VIP. Browser suất nghiệm thu chưa đặt giá vô hiệu Mở bán và hiện đủ ba tên. Chưa thêm case riêng này vào suite mới.

### TC-S15-07 — Phân quyền trang giá

- Bước: đăng nhập người mua, mở URL Giá vé của organizer; tiếp tục thử bằng organizer khác không sở hữu sự kiện.
- Mong đợi: API từ chối (403); không sửa được giá. Organizer sở hữu sự kiện truy cập thành công.
- Có kiểm quyền trong suite Sprint 2 hiện có; UI có thể hiển thị Insufficient permissions khi dùng phiên người mua.

## S-16 — Tạo đơn từ các ghế đang giữ

### TC-S16-01 — Hai ghế còn hạn tạo đúng đơn và hạn 10 phút

- Điều kiện: mở bán; người mua giữ một ghế VIP và một ghế Tiêu chuẩn còn hiệu lực.
- Bước: bấm Đặt vé; API bổ sung thử gửi totalAmount=0, unitPrice=0 và userId của người mua khác.
- Mong đợi: PENDING_PAYMENT; đúng hai seatId; tổng 1.850.000; giá/người mua do server xác định; paymentExpiresAt-serverTime=600000 ms; holdSession và cả hai seat_holds được gia hạn đến cùng deadline của đơn.
- Tự động: PASS.

### TC-S16-02 — Một trong hai bản ghi ghế hết hạn

- Điều kiện: giữ hai ghế; chủ động cho một seat_holds hết hạn, chưa cleanup, holdSession còn hiệu lực.
- Bước: gửi yêu cầu Đặt vé.
- Mong đợi: 409/HOLD_EXPIRED; lostSeatIds chứa ghế hết hạn; không có Order hoặc OrderItem; UI báo tên ghế mất.
- Tự động: PASS ở API/database. Browser: sau khi A-2 hết hạn và danh sách đã tải lại chỉ còn A-1, đặt vé vẫn bị từ chối, hiện “Ghế đã mất: A-2.” và vô hiệu Đặt vé. Không tạo đơn thiếu ghế.

### TC-S16-03 — Bấm lại trả đơn đang chờ

- Bước: tạo một đơn hợp lệ; gửi tiếp cùng yêu cầu.
- Mong đợi: trả cùng mã đơn; created=false cho lần sau; chỉ một Order; deadline không cộng thêm 10 phút mỗi lần bấm lại.
- Tự động: PASS.

### TC-S16-04 — Bấm hai lần đồng thời

- Điều kiện: hai ghế đang giữ, chưa có đơn.
- Bước: gửi hai POST orders đồng thời.
- Mong đợi: hai response có cùng mã; một created=true, một created=false; database có đúng một Order và hai OrderItem.
- Tự động: PASS.

### TC-S16-05 — Chưa giữ ghế

- Bước: người mua chưa giữ ghế gửi POST orders.
- Mong đợi: 409/HOLD_REQUIRED; không tạo Order/OrderItem; giao diện không cho bấm Đặt vé khi chưa có hold.
- Tự động: PASS ở API/database; kiểm UI thủ công.

### TC-S16-06 — Ghế hết hạn đã bị cleanup (F-02)

- Điều kiện: giữ hai ghế; cho một ghế hết hạn trong fixture; gọi cleanup đúng seatId/token của ghế đó; holdSession vẫn còn hạn.
- Bước: gửi POST orders.
- Mong đợi: 409, báo seatId mất; không tạo đơn cho ghế còn lại.
- Trước sửa: HTTP 200, tạo một đơn có một ghế, không báo ghế mất.
- Sau sửa: PASS — HTTP 409, đúng lostSeatIds, không tạo Order/OrderItem. Đối chiếu expectedSeatIds độc lập với bản ghi đã bị cleanup.

### TC-S16-07 — Ghế mất đã được người khác giữ lại (F-02)

- Điều kiện: giữ hai ghế; cho một ghế hết hạn trong fixture; người mua B giữ lại ghế đó.
- Bước: người mua A gửi POST orders.
- Mong đợi: 409, báo ghế mất; A không có đơn; ghế của B vẫn thuộc hold B.
- Trước sửa: A nhận HTTP 200 và một đơn thiếu ghế; quyền giữ ghế của B vẫn được giữ nguyên.
- Sau sửa: PASS — A bị từ chối với đúng ghế mất, không có đơn; hold của B không đổi.

TC-S16-02/06/07 chủ động tạo tình trạng mất một ghế theo tiêu chí Jira. Trong luồng bình thường các ghế cùng hold dùng chung deadline; fixture không khẳng định hệ thống vốn đặt hạn khác nhau.

### TC-S16-08 — Ghế hết hạn trong lúc chờ khóa database (F-01)

- Điều kiện: giữ một ghế; một transaction giữ khóa dòng showtime.
- Bước: rút hạn fixture còn 1,5 giây; gửi POST orders khi ghế còn hạn; quan sát request thực sự chờ khóa qua pg_stat_activity; giữ khóa qua deadline rồi thả.
- Mong đợi: kiểm lại giờ DB sau khi được xử lý; trả 409/HOLD_EXPIRED; không có đơn.
- Trước sửa: HTTP 200, tạo đơn dù hold đã hết hạn.
- Sau sửa: PASS — lấy lại clock_timestamp sau các khóa, trả 409/HOLD_EXPIRED, không tạo đơn. Test vẫn quan sát lock wait thực tế.

### TC-S16-09 — Không xem đơn của người khác

- Bước: tạo đơn bằng người mua A; GET mã đơn bằng người mua B.
- Mong đợi: 404; không tiết lộ dữ liệu đơn của A.
- Suite Sprint 2 hiện có đã kiểm; không nhân đôi trong suite mới.

### TC-S16-10 — Đơn quá hạn khi đọc lại

- Bước: tạo đơn; cho paymentExpiresAt quá hạn trong fixture; GET đơn bằng chủ đơn.
- Mong đợi: status=EXPIRED; không giả định vẫn chờ thanh toán.
- Suite Sprint 2 kiểm API: PASS. Browser: PASS — rút hạn chỉ đơn fixture nghiệm thu xuống 20 giây, tải trang một lần để nhận hạn mới, rồi để nguyên trang; nội dung tự đổi từ Tạo đơn thành công sang Đơn không còn chờ thanh toán. Lần wait đầu hết timeout trước deadline; snapshot kế tiếp xác nhận cập nhật, không reload hay click giữa hai lần quan sát. Thời hạn thật 600 giây được kiểm riêng bằng E2E.

### TC-S16-11 — Mất phản hồi/mạng chậm (kiểm thủ công)

- Bước: bật throttling mạng ở DevTools; bấm Đặt vé; kiểm nút đang xử lý không cho bấm tiếp. Có thể chặn phản hồi sau khi server tạo đơn, sau đó nối mạng/tải lại và thử lại.
- Mong đợi: yêu cầu gửi lại trả đơn cũ; chỉ một đơn; không tự gia hạn mỗi lần retry; UI xử lý lỗi mạng rõ ràng.
- Browser: PASS trên suất fixture riêng `6bdf7f2a-753a-4de2-baae-66bab1340c61`. Proxy local giữ phản hồi POST đầu sau khi server đã tạo đơn: Đang tạo đơn… disabled; sau khi ngắt body phản hồi, UI báo Không đọc được phản hồi. Hãy thử lại. Bấm Thử lại để đồng bộ, rồi Đặt vé: chuyển đến đúng mã đơn ban đầu `48d86ca9-65d0-4c28-8b27-17349d49634f`; response created=false. Database chỉ một Order, hai item A-1/B-1, tổng 1.850.000; deadline `2026-10-05T18:34:17.479Z` giữ nguyên và trùng hạn hold/seat_holds. Không dùng test đồng thời để thay thế kiểm mạng; không ngắt mạng hệ thống.

Tái chạy kiểm mất phản hồi: tạo một suất ON_SALE fixture mới có giá/sơ đồ, đăng nhập buyer và chưa tạo đơn; từ root repo chạy `node scripts/testing/order-response-fault-proxy.mjs <showtime-uuid>`. Mở `http://localhost:3002/shows/<showtime-uuid>/seats`, giữ ghế rồi Đặt vé. Quan sát nút loading/disabled, đọc status và ngắt phản hồi bằng PowerShell:

```powershell
Invoke-RestMethod http://localhost:3002/__test/status
Invoke-RestMethod http://localhost:3002/__test/drop -Method Post
```

Thử lại trên UI, đối chiếu attempts trong status và database. Helper chỉ bind loopback, lỗi chỉ tác động POST orders của UUID đã chỉ định; timeout tự ngắt sau 60 giây nếu không release. Không dùng helper trong deployment; dừng bằng Ctrl+C và quay về port 3000 khi xong. Không in/log cookie hoặc thông tin đăng nhập. Chỉ mô phỏng phản hồi bị ngắt, không đại diện mọi loại lỗi mạng.

### TC-S16-12 — Có ghế chọn nháp chưa được giữ (kiểm thủ công)

- Bước: giữ một ghế thành công; chọn thêm một ghế nhưng chưa bấm Giữ thêm ghế.
- Mong đợi: Đặt vé bị vô hiệu và nhắc giữ các ghế đang chọn trước; không bỏ qua ghế nháp một cách âm thầm.
- Browser: PASS — giữ A-1/A-2, chọn nháp A-3 làm Đặt vé disabled và hiện hướng dẫn; bỏ A-3 làm nút enabled; đơn chỉ có A-1/A-2.

### TC-S16-13 — Thêm ghế không gia hạn lượt giữ

- Bước: giữ ghế đầu; giữ thêm ghế thứ hai; đọc hold và tạo đơn.
- Mong đợi: giữ nguyên deadline, expectedSeatIds có đủ hai ghế, đơn chứa đúng cả hai.
- Tự động: PASS.

### TC-S16-14 — Lượt mới không mang danh sách ghế lượt hết hạn

- Bước: cho lượt cũ hết hạn, cleanup; giữ ghế khác trong lượt mới.
- Mong đợi: token đổi; expectedSeatIds chỉ có ghế lượt mới; đơn không chứa ghế cũ.
- Tự động: PASS.

### TC-S16-15 — Giữ thêm thất bại không sửa danh sách đã xác nhận

- Bước: giữ một ghế; người khác giữ ghế thứ hai; yêu cầu giữ thêm ghế thứ hai và một ghế trống.
- Mong đợi: request thất bại toàn bộ; snapshot và hold ban đầu giữ nguyên; không giữ riêng ghế trống; đơn sau đó chứa ghế ban đầu.
- Tự động: PASS.

## Kết quả tự động đã chạy

Suite `apps/api/test/s15-s16-acceptance.e2e-spec.ts`: **20/20 PASS**. TC-S15-04 được triển khai thành 5 test theo dữ liệu đầu vào, nên số test runner nhiều hơn số ID nhóm.

Ba test từng fail: TC-S16-06, TC-S16-07, TC-S16-08 nay đều PASS. Lịch sử F-01/F-02 giữ trong `evidence/review/20261006/S15-S16-review.md`.

Toàn bộ E2E: **37/37 PASS**, 6 file; không hồi quy 17 test cũ. Báo cáo máy đọc: `evidence/review/20261006/fixed/e2e-results.json`. Kết quả trước sửa 31/34 được giữ tại `test-cases/e2e-results.json`.

Lint, typecheck, build toàn workspace và 23 unit test: PASS. Kiểm browser được ghi riêng, không cộng vào số test runner.

Các file E2E chạy lần lượt (`fileParallelism=false`) vì dùng chung database cô lập. Khi chạy song song, fixture ON_SALE của suite mới lọt vào kiểm danh sách toàn cục của suite Sprint 2 và làm sai giả định dữ liệu của test cũ; đây là xung đột fixture, không phải lỗi mới của nghiệp vụ. Không thay đổi việc gửi hai request đồng thời bên trong TC-S16-04.

## Cách chạy bằng PowerShell

Từ thư mục `thudemo`, với database kiểm thử port 15432 và Redis local đã chạy:

```powershell
$env:DATABASE_URL = 'postgresql://ci_test_user:ci_test_password@127.0.0.1:15432/sprint2_integration?schema=public'
$env:REDIS_URL = 'redis://127.0.0.1:6379'
$env:HOLD_EXPIRY_MODE = 'off'
pnpm.cmd --filter api exec vitest run --config ./vitest.config.e2e.ts test/s15-s16-acceptance.e2e-spec.ts
```

Đây là credentials fixture kiểm thử local, không phải tài khoản triển khai. Suite từ chối chạy nếu URL không đúng database cô lập.

Để chạy toàn bộ E2E sau này, đặt thư mục evidence mới để không ghi đè báo cáo Sprint 2 cũ:

```powershell
$env:VERIFICATION_EVIDENCE_DIR = '../../evidence/review/20261006/fixed-rerun'
pnpm.cmd --filter api run test:e2e
```

Lượt sau sửa trả exit code 0. Trước khi chạy trên database mới, dùng migration deploy (không db push/reset) và xác nhận migration `202610060001_hold_expected_seats` đã áp dụng.
