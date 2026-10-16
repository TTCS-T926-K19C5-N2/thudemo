# K-01 — hồ sơ quyết định hiện tại, 16/10/2026

**Chưa nhận K-01 hoàn tất.** DEC-12 duyệt PostgreSQL authority **tạm cho local**; quyền triển khai laptop LAN theo DEC-13 không tự mở rộng phê duyệt authority. Cần Lead/PO xem bộ bằng chứng dưới đây và xác nhận phạm vi staging. Không chọn lại Redis chỉ vì tốc độ prototype.

K01 Backlog row14 yêu cầu200request cùng1ghế, cảhai phương án, sốđo và quyết định/lýdo; T31 Tasksrow32 thuộcSprint2,200/100×10. Không có nguồn chuyển T31 vàoSprint1.

## A. So sánh kho giữ ghế — tách khỏi endpoint sản phẩm

| Phép đo | PostgreSQL p95 từng lượt (ms) | Redis p95 từng lượt (ms) | Điều kiện và kết quả |
|---|---|---|---|
| Local04/10, không Redis persistence |458,16 /362,89 /295,33 |85,65 /34,03 /55,92 |Hai process/store;200request/1ghế×3; mỗi lượt1winner/199conflict; Redis mất owner sau restart; PG giữ owner |
| Laptop research15/10, Redis AOF everysec |644,9619 /326,9403 /308,3991 |85,2419 /50,7857 /40,9145 |PG15/Redis7, hai process/store, poolPG8/process, i5-13500H/16threads/16,8GB, Node24.21.0; generator cùng laptop; mỗi lượt1winner/199conflict/0errors |

Raw và source adapted có hash: `evidence/sprint1/20261015-handoff/k01-laptop-research/`. Cổng15456/16406, named volumes riêng; không dùng database sản phẩm. Checks: overlapping sets all-or-none,10phút theo datastore clock, thêm/retry không gia hạn, concurrent session có một deadline/token, quá hạn thấy trống trước cleanup, stale token không xóa owner mới, cleanup lặp, failure không để partial claims và restart process giữ trạng thái. Các số đo cũ không bị thay.

PG và Redis-AOF đều giữ owner sau **graceful container restart** ở lượt15/10. Điều này **không chứng minh power loss, hard crash hoặc zero-data-loss**. AOF everysec có cửa sổ chưa fsync; ownership Redis vẫn khác transaction của orders trong PG. Redis không persistence ở lượt04/10/CI có failure model khác; không trộn hai profile.

## B. Endpoint sản phẩm — bằng chứng Sprint2 liên quan, không là AC K01/Sprint1

`evidence/sprint1/20261016-closeout/performance/` giữ cả các lượt FAIL và raw mẫu mới, thông số giao thức/topology. Bài đo giữ200request đồng thời/100ghế×10, cookie/session thật, PGdurable,100winner+100conflict mỗi lượt. Ngưỡng giữ nguyên **all p95<300ms**, gồm lượt đầu; steady chỉ chẩn đoán. CI800ms budget và prototype không thay NFR.

Điều tra16/10: claim request giữ connection từ session guard nhưng quota lookup vay thêm connection cùng pool gây cạn pool; dùng lại connection của request, không tăng pool/giảm auth. PG queries có index; fsync/synchronous_commit vẫn bật. Tiếp tục đo TLS/gateway/Next/API và kiểm correctness sau tối ưu. Kết quả hiện tại theo matrix/report; không tự ký đã đạt NFR trong hồ sơ kiến trúc.

Lượt endpoint mới sourcea2e5f67 cùng laptop/process client riêng: H2 sau200loginAPI thật allp95233.1358/223.1592/263.4703msPASS có điều kiện; H1 cùng phương pháp737.9675msFAIL, H2coldDB-issued-fixture359.0416msFAIL được giữ. Không máy tải riêng bắt buộc trong T31AC/product§7/architecture§14; không tự bỏ ngưỡng300ms hoặc lượtFAIL. Chi tiết CPU/RAM/ELU/2000rawresponses/DB1000quyền trong closeout/load-laptop-* và performance-summary.json. NFR S10/S13 cònFAIL/conditionalPASS; không đưa T31 thành blocker Sprint1. DEC11/12 giữ NFR nhưng không chuyển Sprint.

## C. Đề xuất cụ thể để Lead/PO phê duyệt

Đề xuất **PostgreSQL tiếp tục làm authority cho laptop staging dữ liệu giả**, dùng transaction, một quyền còn hạn trên mỗi ghế, thời hạn UTC10phút từ ghế đầu, thêm/retry không gia hạn, token fencing cho cleanup. Redis-AOF chỉ giữ counter/cache; mất counter khi Redis hỏng/mất dữ liệu phải ghi là giới hạn vận hành, không gọi ownership/counter durable tuyệt đối.

Loại Redis làm authority trong bản này vì ownership/đơn PG không có cùng transaction; phải thêm distributed commit/reconciliation để bảo toàn nhất quán, vượt phạm vi sửa Sprint1. Redis nhanh hơn trong prototype không đủ chứng minh consistency hoặc endpoint sản phẩm. Giữ research tách AppModule; các module Redis do PR29/34–37 bổ sung còn nguyên lịch sử, không đưa public mock owner/TTL vào API sản phẩm.

**Nội dung cần người có quyền xác nhận sau khi đọc evidence:** “Tôi đã xem bằng chứng A/B và trade-off; chấp thuận PostgreSQL là nguồn quyền giữ có thẩm quyền cho laptop staging dữ liệu giả theo các invariant trên. Không miễn NFR300ms, human review, CI, auto-deploy, rollback hoặc điều kiện production.” Trạng thái: **BLOCKED — chưa có xác nhận này**. Không ghi người mở PR hoặc AI là người phê duyệt thay Lead.

## Lịch sử trước checkpoint16/10 — giữ nguyên provenance

# Trạng thái đối chiếu 15/10/2026 — không thay lịch sử dưới đây

Review Sprint1 lấy source main `81d1dd9d8f453b32ed0c6956399e5600f71a32d6` và đọc raw artifact của CI run `38695462765`, job `K-01 / candidate-research`. Bản lưu: `evidence/sprint1/20261015/k01-current-ci.json`. PostgreSQL p95 ba lượt200/1:489.41/225.51/177.61ms; Redis:58.09/35.09/30.15ms. Mỗi lượt1winner/199conflict/0errors. Hai process/store, PostgreSQL15/Redis7 thật; pool8/process; AMD EPYC9V45,4threads,Node24.21.0. PG giữ ownership sau restart, Redis không persistence mất ownership. Đây là CI prototype mới; chuỗi mode “not CI” trong producer là nhãn lịch sử, không thay provenance artifact. Recommendation “pending” trong raw cũng không hủy DEC12 đã duyệt tạm local.

DEC12 tiếp tục là nguồn quyết định authority tạm local. PR29 report cũ chỉ đo Redis nên chưa đủ so sánh hai phương án; không dùng PR29 OPEN để kết luận main thiếu sản phẩm, không merge implementation khác chỉ để đóng spike. Staging vẫn **BLOCKED**. Artifact sản phẩm T31 cùng CI có overallp95 **368.67ms**, steadyp95 **250.65ms**, checker threshold **800ms**: không nhận PASS300ms cho toàn bộ request. Không trộn datastore/prototype/product endpoint hoặc local/CI/staging. Báo cáo/matrix hiện hành: `SPRINT1_REVIEW_REPORT.md`, `SPRINT1_ACCEPTANCE_MATRIX.md`.

Phần bên dưới giữ nguyên kết quả và trạng thái tại thời điểm04/10, bao gồm các câu “CI chưa chạy”; chúng không mô tả CI mới15/10.

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
