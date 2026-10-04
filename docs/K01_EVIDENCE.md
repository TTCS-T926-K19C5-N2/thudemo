# DEC-12 — checkpoint nghiệm thu sản phẩm local

PO đã chấp thuận tạm thời PostgreSQL authoritative, Redis/Valkey cache/counter cho tám task local; nguyên văn decision-logDEC12. Không K01PASSstaging/NFRwaiver. [Bằng chứng sản phẩm](SEAT_HOLD_LOCAL_EVIDENCE.md):2API thật, authHTTP200/100×10 mỗi lượt100winner/100409, deadline/atomic/expiry/staletoken/APIrestart/worker minute/backlog/shutdown; counter và **loginlock thật** mất khi Valkeyrestart, PGhold giữ nguyên. LatestNFR750,96ms FAIL (lượt trước270,25PASS chỉ lịch sử). CI/Render chưa chạy. Prototype bên dưới giữ nguyên, không thay số đo spike bằng API metrics.

## Lịch sử trước DEC-12 — không dùng làm trạng thái hiện hành

# K-01 — bổ sung bằng chứng local 04/10/2026

## Cập nhật Render Free / PO + review kỹ thuật tự động

Quyết định mới tại `../docs/prompts/PROMPT_FINISH_SPRINT_2_RENDER_FREE_NO_PUSH.md` thay yêu cầu chờ host/reviewer bên ngoài: Render Free, ngân sách 0; công cụ hỗ trợ kỹ thuật đo và tự review, PO xác nhận kết luận. Chưa push/upload/deploy. Các mục lịch sử bên dưới không được dùng để chặn quy trình mới.

Lượt nghiên cứu mới: `evidence/render-free/20261004/k01-candidates.json`, chạy `./scripts/verify-k01-candidates.ps1`. Prototype chỉ nằm trong `apps/api/scripts/k01`, không đăng ký vào API sản phẩm, không migration ứng dụng. Hai process HTTP loopback dùng chung datastore thật, cùng dataset và hai process/store: PostgreSQL pool 8/process; Redis một client multiplex/process. PostgreSQL15 cổng15433 và Redis7 cổng16380 là container riêng có tên `sang-k01-*`, không restart database ứng dụng.

| Phương án | 200 request/1 ghế, ba lượt | p95 tất cả request HTTP local (ms) | Restart datastore |
|---|---|---|---|
| PostgreSQL | Mỗi lượt 1 thành công /199 conflict, 0 lỗi | 458,16 /362,89 /295,33 | Quyền giữ đã commit còn nguyên |
| Redis không persistence, tương ứng giới hạn Free | Mỗi lượt 1 thành công /199 conflict, 0 lỗi | 85,65 /34,03 /55,92 | Mất quyền giữ đã xác nhận |

Cả hai đã kiểm: tập ghế giao nhau all-or-none qua hai process; 10 phút từ clock datastore; thêm ghế/concurrent request/retry giữ nguyên deadline/token; quá hạn trống khi chưa dọn; stale token không xóa owner mới; lặp cleanup; failure không để quyền một phần; restart process ứng dụng giữ nguyên owner trong datastore. Fixture expiry không rút TTL600000 của candidate. Test HTTP này là prototype K-01, không phải auth/hold API sản phẩm hoặc T-31. Chưa có warmup riêng; ba lượt ghi đầy đủ raw, không bỏ mẫu chậm. PostgreSQL hai lượt đầu vượt300ms; không kết luận đạt NFR giữ ghế.

**Đề xuất kỹ thuật:** PostgreSQL làm nguồn quyền giữ có thẩm quyền; Redis/Render Key Value chỉ dùng cache và chức năng có chính sách mất trạng thái rõ. Giữ/đơn tương lai có thể dùng một transaction PostgreSQL và cùng thứ tự lock. Redis TTL đơn lẻ bị loại cho quyền giữ vì Free restart mất dữ liệu và không cùng transaction với đơn PostgreSQL. Redis auth counter vẫn có giới hạn restart cần ghi trong deployment/review, không tự coi cache reset là đáp ứng bảo vệ đăng nhập liên tục.

**Wording cần PO xác nhận:** “Tôi chấp thuận tạm thời dùng PostgreSQL làm nguồn quyền giữ để triển khai và kiểm local T-22–T-31 dựa trên evidence K-01 local này. Đây không phải K-01 đã PASS staging; chưa miễn NFR300ms, CI thật, worker liên tục hay DoD. Redis chỉ làm cache/counter theo deployment profile đã nêu; các giới hạn Render Free được ghi riêng.”

Trạng thái xác nhận hiện hành: **ĐÃ DUYỆT TẠM THỜI CHO LOCAL**, theo DEC-12 ngày 04/10/2026 và xác nhận trực tiếp của Nguyễn Văn Sáng. PostgreSQL là nguồn quyền giữ có thẩm quyền; Redis/Valkey chỉ cache/counter. T-22/23/24/27/28/29/30/31 được triển khai và kiểm local. Không phải K-01 PASS staging; không miễn NFR, CI thật hoặc worker. Prototype và số đo ở trên giữ nguyên là lịch sử; bằng chứng endpoint sản phẩm mới nằm trong `evidence/holds/20261004/`.

Self-review nghiên cứu: schema/namespace chỉ cho DB research; khóa session trước claim theo seat tăng dần; conflict throw rollback; thông tin owner không dùng public projection; nghiên cứu chưa chứng minh product auth, sold/order transition, worker cadence hoặc Render. Drop chỉ schema do đúng run tạo sau kiểm; không reset database hoặc sửa migration ứng dụng.

> Run sửa Stitch/code: [bằng chứng mới](STITCH_CORRECTION_EVIDENCE.md) kiểm UI lựa chọn nháp, API/import/pricing và rendering. Không thay đổi các số đo spike bên dưới, không hoàn thành gate K-01 và không bổ sung bằng chứng HTTP giữ ghế.

## Lịch sử trước DEC-11 — không dùng làm gate reviewer hiện tại

**Trạng thái lịch sử: BLOCKED tại staging + reviewer độc lập.** Thử nghiệm này không triển khai T-22, không cung cấp API giữ ghế và không phải T-31.

## Phương án và phạm vi

`apps/api/scripts/k01-spike.mjs`, chạy `./scripts/run-sprint2-local.ps1 -Mode Spike`. Guard chỉ DB sprint2_local127.0.0.1:15432 và Redis16379. Tạo schema/namespace unique, chỉ dọn tài nguyên tự tạo; không reset DB. DBclock UTC cho PostgreSQL; TTL Redis authoritative server.

- PostgreSQL: primary-key seat + INSERT ON CONFLICT với điều kiện quyền cũ hết hạn. 200 request cạnh tranh một ghế ×3 lượt, pool/process chung, transaction all-or-none; token tránh job cũ xóa quyền tái cấp.
- Redis: SET NX PX + Lua tập nhiều ghế atomic;200 request ×3 lượt. Expiry reuse được kiểm.
- Mỗi lượt đúng1 winner/199rejected, không error/timeout. Rawtimings giữ trong evidence/sprint2/20261004-local/k01-spike.json. Mỗi giá trị là datastore operation local, không HTTP300ms.

| Store | p95 theo 3 lượt local (ms) | Cân nhắc, không phải quyết định |
|---|---|---|
| PostgreSQL |448.3 /374.6 /402.7 | Dễ cùng transaction đơn/ghế tương lai; có latency pool dưới tranh chấp cần đo staging |
| Redis |13.1 /5.4 /15.1 | Nhanh trên máy local; vẫn cần chứng minh durability/restart/chuyển sang order và nhất quán với DB |

Hardware i5-13500H/16threads,~15.64GiB RAM, Node24.21.0, Docker PostgreSQL15/Redis7. concurrency200, single Node process; p95 nearest-rank. Kết quả không suy rộng thành network/staging/multi-instance proof.

## Gate còn phải đóng

1. Lead cung cấp staging theo kiến trúc đã duyệt và quyền chạy test giả; không gửi secret trong chat.
2. Chạy lại spike trên staging, kiểm hai backend, all-or-none tập giao nhau, expired reuse, stale job, crash/restart/durable ownership và ranh giới order.
3. Reviewer độc lập đánh giá raw evidence + failure model, chốt phương án trong quyết định nguồn được duyệt.
4. Khi đó mới triển khai T-22→T-29/T-30→T-23/T-27/T-28/T-24→T-31. T31 có HTTP200requests vào100ghế,10lượt và CI/staging riêng; cần100thành công/lượt.

Không thay đổi K01.md/source workbook, không bỏ dependency để thêm fake hold/counter. Người review chưa xác nhận; self review không thay thế reviewer.
