# Nghiệm thu sau sửa S-15/S-16 — 06/10/2026

Branch: `feature/S-15-S-16-pricing-orders`. Chưa commit/push/merge. Phạm vi: hai story Jira người dùng cung cấp; thời hạn thanh toán 10 phút. Không triển khai S-17 hoặc cổng thanh toán.

## Kết luận

Các tiêu chí nghiệp vụ của S-15/S-16 đã được triển khai và vượt qua các kiểm tự động hiện có, gồm ba tình huống lỗi trước sửa. Luồng chính và nhánh mất ghế đã xác minh trực tiếp trên browser. Sẵn sàng cho người dùng/leader nghiệm thu trên nhánh test; không coi là chứng nhận production hoặc toàn bộ kiểm UI đã hoàn tất.

Kiểm bổ sung theo yêu cầu “test nốt”: **con trỏ chuột và mất phản hồi sau khi server tạo đơn đều PASS**. Không cần sửa source ứng dụng trong lượt này. Đã thêm helper kiểm lỗi mạng `scripts/testing/order-response-fault-proxy.mjs` và bằng chứng máy đọc `browser-final-results.json`, không cộng các kiểm browser vào 37 E2E/23 unit đã chạy.

## Thay đổi triển khai

- `apps/api/src/orders/`: tạo/đọc đơn; xác định người mua từ phiên, tính tổng phía server, snapshot giá từng ghế, gia hạn hold 10 phút; trả lại đơn chờ; khóa người mua và ràng buộc database ngăn đơn trùng.
- F-01: trong `orders.service.ts`, lấy lại `clock_timestamp()` sau khi đã khóa showtime, holdSession và seat_holds. Kiểm hiệu lực và tính deadline bằng mốc mới, không dùng giờ trước lúc chờ khóa.
- F-02: `HoldSession.expectedSeatIds` lưu đầy đủ các ghế đã giữ thành công. `holds.service.ts` cập nhật trong cùng transaction, giữ nguyên khi thêm ghế, reset khi đổi token lượt mới. Tạo đơn đối chiếu đầy đủ danh sách này; ghế bị cleanup hoặc người khác giữ lại vẫn được nhận diện là mất, toàn bộ đơn bị từ chối.
- Migration mới `202610060001_hold_expected_seats` thêm/backfill snapshot. Không sửa migration `202610050001_pending_orders` đã áp dụng; không db push/reset.
- `apps/web/src/features/seat-selection/seat-selection.tsx`: gọi tạo đơn, chặn khi còn ghế nháp/đang xử lý/lượt giữ lỗi, ánh xạ ghế mất bằng toàn bộ sơ đồ thay vì chỉ ghế còn giữ; refresh cập nhật cả giá ghế chọn nháp. Thông báo lượt giữ không hợp lệ không còn khẳng định mọi ghế đều đã hết hạn.
- `apps/web/src/features/orders/order-status.tsx` và route `/orders/[id]`: xác nhận đơn; tự hỏi server ở deadline, khi trở lại tab hoặc nối mạng; cleanup timer/request; hiển thị retry khi lỗi. Tiêu đề trang trung lập, không ghi “đang chờ” cho đơn hết hạn. Không tự suy đoán thanh toán hoặc hết hạn từ client.
- `apps/api/test/s15-s16-acceptance.e2e-spec.ts`: 20 test nghiệm thu/hồi quy. `sprint2.e2e-spec.ts`: giữ kiểm luồng cũ và các kiểm đơn. `vitest.config.e2e.ts`: file chạy lần lượt để tránh fixture catalog chung, không bỏ concurrency của test double-click.
- `apps/web/src/lib/contracts/orders{,.spec}.ts`, `apps/api/src/app.module.ts`, Prisma schema: contract, test giải mã, đăng ký module và cấu trúc đơn.
- Tài liệu `docs/testing/S15-S16-test-cases.md` cập nhật bước, kỳ vọng và trạng thái; evidence trước sửa giữ nguyên.

## Kiểm tự động

| Kiểm | Kết quả |
| --- | --- |
| `pnpm.cmd lint` | PASS API + web, sau thay đổi UI cuối |
| `pnpm.cmd typecheck` | PASS API + web, sau thay đổi UI cuối |
| `pnpm.cmd test` | 23/23 PASS: API 6, web 17 |
| `pnpm.cmd --filter api run test:e2e` | 37/37 PASS, 6 file, 0 fail/skip |
| Suite nghiệm thu riêng | 20/20 PASS |
| `pnpm.cmd build` | PASS API + web, sau thay đổi UI cuối |
| Prisma migrate status local | 11 migration, up to date |
| GET `http://localhost:3001/health` | 200, status=ok |
| `git diff --check` | PASS; chỉ cảnh báo LF/CRLF của Git |

E2E dùng DB cô lập `sprint2_integration` port 15432, migration mới đã deploy trước test. DB demo `ttcs_local` port 5432 cũng đã deploy. `e2e-results.json` trong thư mục này ghi 37 passed/0 failed/0 pending, success=true; performance nằm ở `integration-performance.json`, không ghi đè evidence Sprint 2.

Ba case TC-S16-06/07/08 trước sửa FAIL nay PASS, không đổi kỳ vọng, không skip. Ba kiểm thêm PASS: thêm ghế giữ nguyên deadline/snapshot; lượt mới reset snapshot; giữ thêm thất bại rollback cả snapshot và claims. Luồng thành công xác nhận deadline 600000 ms, đủ items/tổng; đổi giá giữ nguyên đơn cũ và đơn mới dùng giá mới; hai request đồng thời chỉ một đơn.

Unit runner có cảnh báo cấu hình Vite/tsconfig-paths, không làm test thất bại; chưa thay toolchain ngoài phạm vi task.

## Browser thực tế

Thao tác trên IAB tại localhost, không dùng giả lập DOM làm bằng chứng browser.

1. Organizer mở suất nghiệm thu chưa đặt giá: Mở bán disabled, hiện đủ VIP/Tiêu chuẩn/Ban công còn thiếu giá.
2. Ô VIP nhập `-1`, rồi `abc`: `aria-invalid=true`, Lưu giá disabled. Nhập 1.200.000/650.000/350.000, Lưu giá: hiện “Đã lưu giá. Sơ đồ đã cập nhật.”. Mở bán thành công.
3. Buyer dùng mũi tên xem A-1/B-1/C-1: đúng VIP 1.200.000, Tiêu chuẩn 650.000, Ban công 350.000. Enter chọn A-1/A-2; giữ ghế: máy chủ xác nhận, đồng hồ 10:00, tổng 2.400.000.
4. Chọn nháp A-3: Đặt vé disabled và nhắc giữ ghế trước; bỏ A-3: enabled. Tạo đơn `ebc70323-7778-4527-9432-0d997ed36ef4`; kiểm DB có đúng hai item VIP 1.200.000, totalAmount=2400000, expectedSeatIds đúng hai ghế.
5. Chỉ đơn fixture này được rút deadline xuống 20 giây, đồng bộ hạn order/holdSession/seat_holds. Reload một lần để nhận deadline thử nghiệm; sau đó để nguyên trang. Lần chờ đầu timeout trước deadline, snapshot kế tiếp xác nhận tự chuyển “Đơn không còn chờ thanh toán”/“Thời hạn giữ chỗ của đơn đã kết thúc”, không có click hoặc reload giữa hai lần quan sát. Không thay timeout 10 phút của ứng dụng; E2E kiểm mốc thật 600 giây.
6. Lượt giữ mới A-1/A-2: đánh dấu hết hạn chỉ A-2 của buyer fixture và suất nghiệm thu. Reload sơ đồ chỉ còn một ghế giữ; bấm Đặt vé: báo “Ghế đã mất: A-2.”, không tạo đơn thiếu ghế và nút bị vô hiệu. Thông báo lượt giữ không hợp lệ đã xác minh sau chỉnh copy.
7. Chọn lại A-2, giữ thêm, tạo đơn thành công `e6334a1d-6998-4e22-8b11-4707f2d0acf2`; DB có hai item, totalAmount=2400000. Để nguyên thời hạn thật 10 phút của đơn này.
8. Desktop width 1280: documentWidth=1265; mobile width 390: documentWidth=375; width 360: documentWidth=345 ở sơ đồ, 360 ở trang đơn. Không tràn ngang toàn trang. Keyboard focus trên canvas được quan sát. Đã reset viewport override khi xong.
9. Console error/warn thu được sau các luồng trên: danh sách rỗng. Ngay sau khởi động lại API từng có lỗi kết nối PostgreSQL tạm thời dẫn đến 500; các request sau 200, nút Thử lại khôi phục trang. Không coi lỗi tạm thời đó là đã không xảy ra.

Suất nghiệm thu riêng: `beeb3497-e545-41dd-90a8-8e226c391877`, 30 ghế, trạng thái ON_SALE. Suất Demo chưa giá của người dùng `e5969d51-7419-4925-8695-d5a654ea2a45` vẫn DRAFT, 30 ghế, cả ba price=null; không đổi dữ liệu đó.

## Giới hạn và lưu ý trước bàn giao

- Con trỏ chuột: đã kiểm bổ sung trên suất 30 ghế, lần lượt C-1/B-1/A-1. DOM phần thông tin ghế hiện đúng Ban công 350.000, Tiêu chuẩn 650.000, VIP 1.200.000; Ghế đang chọn (0) không đổi. Công cụ không có hover primitive, nên dùng thao tác chuột phải/Escape để chuyển con trỏ thật; handler onClick chỉ xử lý left-click nên cập nhật inspection ở đây qua onPointerMove, không phải dùng bàn phím thay hover.
- Mất phản hồi: đã kiểm bổ sung qua proxy loopback port 3002 trên suất fixture riêng `6bdf7f2a-753a-4de2-baae-66bab1340c61`. Chọn A-1/B-1, giữ ghế, Đặt vé. Khi upstream đã commit đơn nhưng proxy chưa trả: nút Đang tạo đơn… disabled. Ngắt body phản hồi, UI báo Không đọc được phản hồi. Hãy thử lại. Bấm Thử lại để đồng bộ rồi Đặt vé: đúng mã `48d86ca9-65d0-4c28-8b27-17349d49634f`, created=false. Database chỉ một đơn, đủ hai item, tổng 1.850.000; deadline giữ nguyên `2026-10-05T18:34:17.479Z` (lần đầu serverTime `18:24:17.479Z`, đúng 600 giây), session/seat_holds trùng hạn đơn. Đây là kiểm phản hồi body bị ngắt sau commit, không đại diện mọi dạng offline hoặc mạng di động.
- Trong setup proxy, trang dev ban đầu chưa hydrate do thiếu upgrade channel; đã thêm forwarding HMR. Sau các thao tác chuột, lớp inspect phần tử của dev UI từng chặn nút; Escape thoát lớp đó rồi hành động hoạt động. Không sửa source ứng dụng để làm kiểm xanh. Fixture nhập qua PowerShell từng lỗi encoding ở hai tên hạng; đã sửa riêng fixture bằng Unicode escapes trước test, không thay dữ liệu demo của người dùng.
- Sau test, mở đúng đơn trên port 3000 xác nhận thành công; reset viewport, dừng proxy port 3002. Helper `node --check` PASS. Kiểm thêm console error/warn trả danh sách rỗng; không diễn giải thành mọi lỗi mạng đều không có log. Suất fixture và đơn được giữ để đối chiếu, chưa xóa dữ liệu.
- Chụp screenshot browser trả lỗi Unable to capture screenshot, nên bằng chứng UI là thao tác/DOM và phép đo trực tiếp, không có ảnh chụp nghiệm thu mới.
- Các skill `vercel:nextjs`, `vercel:react-best-practices`, `vercel:agent-browser-verify` mà AGENTS.md yêu cầu không khả dụng. Đã giữ stack/component hiện có, review source và dùng browser IAB làm kiểm thay thế; không khẳng định đã chạy các skill thiếu. Skill computer-use hướng dẫn thao tác/kiểm trạng thái browser.
- Backfill migration chỉ khôi phục claims còn tồn tại; không thể suy ra ghế đã bị xóa trước khi có snapshot. Khi triển khai môi trường khác, ngừng nhận hold mới bằng bản API cũ, chờ các lượt giữ cũ hết hạn, deploy migration và khởi động bản API mới rồi kiểm lại; tránh rolling hai phiên bản cùng ghi holds. Phiên rỗng bị từ chối, không tạo đơn âm thầm.
- Trang đơn của S-16 chỉ xác nhận mã/trạng thái/hạn giữ. Chi tiết đầy đủ, thanh toán và xử lý kết quả thanh toán thuộc các story sau, không phải thiếu sót tự mở rộng trong hai task này.
- Chưa commit/push; làm việc trên feature branch, không trực tiếp sửa main. Leader vẫn cần review trước merge. Mật khẩu/local env không đưa vào commit.
