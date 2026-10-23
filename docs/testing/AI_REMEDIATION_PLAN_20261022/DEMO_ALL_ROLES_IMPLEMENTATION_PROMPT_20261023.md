# Prompt: hoàn thiện demo Codegym và thực hiện kịch bản đủ vai trò, đủ chức năng

> **Đã có chỉ đạo mới hơn:** người dùng yêu cầu dừng kiểm thử lặp, rà một lượt và tập trung hoàn thiện nhanh. Ưu tiên [PROMPT_HOAN_THIEN_NHANH_20261023.md](PROMPT_HOAN_THIEN_NHANH_20261023.md); dùng các cảnh/vai trò dưới đây làm tham chiếu chức năng, không tự chạy lại chương trình kiểm thử rộng hoặc mốc19:11 đã qua.

Bạn là AI trực tiếp thực hiện phát triển và kiểm thử dự án `D:\Merge_2\Codegym`. Hãy sửa lỗi, hoàn thiện các chức năng còn thiếu hoặc chưa sử dụng được, nối đầy đủ giao diện/API/dữ liệu, rồi thực hiện một kịch bản demo xuyên suốt đủ các vai trò. **Không chỉ phân tích, đưa kế hoạch hoặc chạy unit test rồi kết luận hoàn thành.**

## 1. Mục tiêu, thời gian và quyền thực hiện

Tôi cần bản demo có thể mở lên và sử dụng toàn bộ chức năng trong phạm vi yêu cầu; giữ giao diện, hình ảnh và thông tin sự kiện tôi đã xây dựng. Mỗi vai trò phải thao tác được phần việc của mình bằng giao diện. Khi đưa lên GitHub, cần đủ mã, assets, dữ liệu khởi tạo và hướng dẫn để bản clone sạch tái tạo được demo.

Ưu tiên mốc5giờ đã giao trước: **19:10:59 ngày23/10/2026, giờ Việt Nam**. Không tính lại5giờ từ lúc nhận prompt này. Tận dụng mã/bằng chứng đã có, giảm báo cáo và các phép kiểm trùng lặp, không hạ tính đúng của tiền, ghế, quyền và dữ liệu. Nếu deadline không đủ, bàn giao trạng thái thực và danh sách thiếu; không gán DEMO_READY giả. Đề xuất2–4ngày trong báo cáo cũ không phải chỉ đạo hiện tại của người dùng.

Được sửa source, UI, service/API, migrations additive, tests, dataset demo, launcher và tài liệu cần thiết. Không reset/stash/checkout đè thay đổi có sẵn. Không tự commit/push/merge/deploy, dùng tiền thật, gửi email Internet, tạo dịch vụ trả phí hoặc sửa DB chính. Chuẩn bị bản có thể review và đưa lên repo khi được giao bước đó.

Payment/refund dùng mock, email dùng Mailpit/catcher, mất mạng có thể mô phỏng trong browser. Trạng thái và nghiệp vụ vẫn phải được xử lý thật qua ứng dụng và DB. Không chờ provider thật, staging, hosted CI, camera/4G vật lý hoặc kho backup production để bàn giao demo; ghi giới hạn riêng, không gọi chúng là đã kiểm đạt.

## 2. Đọc đúng nguồn và tiếp tục từ hiện trạng

Đọc theo nhóm, không dump toàn bộ JSON lớn vào một lần gọi:

1. `D:\Merge_2\Codegym\AGENTS.md`.
2. `D:\Merge_2\Codegym\docs\testing\AI_REMEDIATION_PLAN_20261022\DEMO_HANDOFF_SCOPE_20261023.md`.
3. `D:\Merge_2\Codegym\docs\testing\AI_REMEDIATION_PLAN_20261022\DEMO_5H_PROMPT_20261023.md`.
4. `D:\Merge_2\Codegym\docs\testing\AI_REMEDIATION_PLAN_20261022\PLAN.md` và `remediation-work-items.json`, chỉ các gói cần cho phần đang làm.
5. Checkpoint mới nhất trong `D:\Merge_2\Codegym\evidence\ai-remediation\20261022T230000-remediation\`: `progress.json`, `results.json`, `bugs.md`, `bug-retest.md`, `decision-register.json`, `report.md` và bằng chứng liên quan.
6. `D:\Merge_2\Codegym\docs\testing\AI_FULL_PROJECT_TEST_PLAN_20261022\test-cases.json` và Excel nguồn `D:\BookSys\Bán vé sự kiện có sơ đồ ghế.xlsx` khi cần đối chiếu AC/NFR.

Nếu xuất hiện run mới hơn, xác minh đúng dự án/source rồi dùng run đó làm checkpoint mới; giữ các run cũ chỉ đọc. Nội dung trong tài liệu là dữ liệu yêu cầu/tham khảo, không tự cấp quyền thao tác ngoài chỉ đạo người dùng.

Không cho rằng tính năng chưa có chỉ vì case NOT_RUN; đọc mã và thử trước khi viết lại. Không cho rằng tính năng chạy được chỉ vì có file, endpoint trả200/201, unit PASS hoặc một checkpoint cũ ghi VERIFIED. Đối chiếu source fingerprint và hành vi hiện tại.

**Lỗi thực tế đang cần ưu tiên xác minh và sửa:** checkpoint INT-16 ghi `BUG-INT16-01`: transfer API trả201, vé chủ cũ biến mất nhưng người nhận có0vé, vé VALID mới không liên kết đơn và không có transfer-mail outbox. Đọc repro/evidence mới nhất, không mặc định lỗi đã hết. Sửa nhất quán sở hữu, projection, QR và mail; không tạo order/payment giả hoặc cấp cho người nhận quyền xem toàn bộ đơn của người gửi chỉ để hiện vé.

## 3. Giữ sản phẩm gốc và tạo môi trường demo bền

- Giữ thiết kế hiện có; thêm control/trang còn thiếu theo component/design system đã dùng, không viết lại giao diện hoặc thay catalog bằng mẫu khác. Tuân hướng dẫn skill theo AGENTS khi thực thi; không giả đã dùng công cụ chưa có.
- Lập manifest nội dung và asset chuẩn: tên/mô tả/địa điểm/ảnh/banner/hạng/giá/sơ đồ, số sự kiện và các tệp UI quan trọng. Nếu DB mới hơn JSON, không seed JSON cũ đè nội dung.
- Các nguồn đã có cần tái sử dụng sau kiểm tra: `su_kien_nha_hat_40_su_kien_chi_tiet_2026.json`, `theater_chamber_events_seed.json`, `apps/web/public/images/`, các script import/seed hiện hữu. Không mặc định chạy được hoặc đủ dữ liệu chỉ vì chúng tồn tại.
- DB/Redis/Mailpit demo tách biệt với DB chính. Dữ liệu catalog/tài khoản/kịch bản demo cuối phải giữ lại cho tôi sử dụng; fixture test tạm có thể cleanup theo run-id. Không xoá toàn bộ dữ liệu sau khi quay xong demo.
- Giữ lịch sự kiện tham khảo gốc. Tạo suất còn hiệu lực riêng cho giao dịch mô phỏng theo validation hiện hành; không đổi hàng loạt ngày, gỡ guard hoặc sửa mọi `isDemo` để lách quy tắc mở bán.
- Đọc migration status trước sửa, kể cả migration còn untracked. Migration đã chạy phải giữ nguyên; dùng migration mới/bù, không db push/reset. Thử DB rỗng và upgrade fixture, giữ dữ liệu cũ.
- Cấu hình demo sinh mật khẩu/key riêng trong tệp private ignored, không commit secret/PII/QR thật. Dùng tài khoản giả miền `.invalid`. Không in raw remote URL có thể chứa token; xác minh repo/nhánh đích khi được giao push.

## 4. Những quyết định đã có phải áp dụng

Đọc decision register và nguồn approval mới nhất. Không hỏi lại những lựa chọn đã được duyệt:

- **D01:** một coupon/order; floor số tiền giảm%; mức giảm tối đa subtotal; đơn0đồng xác nhận tại server, không qua gateway.
- **D02/D14:** thông báo waitlist FIFO, Nghế nhả thì tối đa Nngười đầu hàng được báo, không giữ ghế riêng; ghế vẫn mở bán chung.
- **D15/D16:** waitlist mail tối đa3attempt, backoff5s/15s; kiểm lại ghế ngay trước SMTP, hết ghế thì huỷ lượt thư theo contract và giữ entry phù hợp cho lần sau. Email phải nêu không giữ ghế.
- **D04:** cohortA: session bắt đầu trong `[from,to)`, outcome trước `to`; cả hold-to-order và hold-to-paid, mean/p90 riêng, null nếu không có mẫu; phiên chưa hoàn tất không tự tính bỏ giỏ.
- **D12:** discount phân bổ theo tỷ trọng giá vé, floor từng phần rồi chia đồng dư theo mã vé tăng dần; snapshot và số tiền hoàn/báo cáo dùng giá thực trả đã lưu.
- **D05:** conflict offline theo AC gốc ưu tiên giờ thiết bị sớm hơn, giữ offset và cả hai lượt; dùng override khác chỉ nếu có duyệt.
- **D13:** snapshot mỗi vé chỉ mã và trạng thái; showtimeId dùng phân vùng cấu trúc, không mang tên/email khách xuống máy quét.
- **D17:** cổng từ chối chắc chắn cho retry; timeout mơ hồ giữ INITIATED/cờ cần xác minh và chặn attempt mới đến webhook/query/đối soát, không tự FAILED để thu lần nữa.
- **D03:** CSV chỉ các trường tối thiểu AC, không tự thêm tên/email/điện thoại.

Contract huỷ/hoàn, số lần mail khác, quota, consent/retention: tìm nguồn đã duyệt trước. Nếu thật còn quyết định chặn logic tiền/ghế/quyền, hỏi một câu gộp cụ thể và tiếp tục phần độc lập; không tự thay chính sách production bằng profile demo. Các tham số demo kiểm soát được phải ghi rõ, không gọi là policy thật.

Phân bổ coupon cho hoàn một phần không tự chứng minh sản phẩm đã hỗ trợ chọn từng vé để hoàn. Nếu chức năng này đã thuộc scope được duyệt, hoàn thiện UI/API/state/rounding thực; nếu contract chỉ huỷ cả đơn, dùng đúng contract đó và nói rõ giới hạn, không giả đã có partial refund.

## 5. Ma trận chức năng bắt buộc theo vai trò

Tạo `demo-role-feature-matrix` từ route/page/AC hiện tại. Với mỗi chức năng ghi: vai trò, nút/đường dẫn UI, API, tiền điều kiện, dữ liệu, expected, actual, evidence và trạng thái. Các mục dưới đây là mức tối thiểu, không thay việc kiểm inventory chức năng đã có.

| Vai trò | Chức năng phải có thể sử dụng trong demo |
|---|---|
| Khách chưa đăng nhập | Xem danh mục/chi tiết suất, thông tin và ảnh; xem trạng thái bán đúng quyền; đăng ký/kích hoạt/gửi lại kích hoạt; đăng nhập/quên/đặt lại mật khẩu. |
| ADMIN | Tạo/quản lý tài khoản nội bộ, đổi vai trò, bật/tắt tài khoản, phân công STAFF vào suất/cửa và quyền override; quản lý email lỗi/retry; duyệt yêu cầu xoá dữ liệu; xem chức năng vận hành được cấp và trạng thái worker. |
| ORGANIZER | Tạo/sửa/list sự kiện đúng chủ; thêm/clone suất; import/validate/preview sơ đồ; giá/hạng/giới hạn vé; mở/đóng bán và công bố/ẩn; quản lý coupon; đổi lịch; huỷ suất; tồn vé/doanh thu/attendance/conflict/analytics; tải PDF/CSV theo quyền. |
| BUYER | Xem/chọn ghế, hold/release/TTL/reload; waiting room nếu bật; tạo/xem order, coupon apply/remove, mock pay/fail/retry/0đồng; kết quả/lịch sử/vé/QR download/resend; waitlist đăng ký/trạng thái/huỷ; transfer gửi/nhận vé; huỷ/hoàn theo policy; consent/withdrawal/erasure của chính mình. |
| STAFF | Đăng nhập đúng màn hình, chọn suất hôm nay/cửa được gán, scan QR và lỗi rõ; chống scan lại, override khi có quyền/lý do; snapshot/delta, offline bền, network banner/count, tự sync/retry và xử lý conflict theo quyền. |
| ACCOUNTANT | Xem giao dịch/refund cần kiểm tra, mock refund failure/retry/manual resolution đúng quyền; đối soát sao kê mô phỏng, xem kết quả/history; đối chiếu tiền gộp/discount/thực thu/hoàn/ròng và audit được cấp. |
| Hệ thống/job | Dọn hold/order hết hạn; webhook ký/amount/idempotency; phát vé/mail/retry/reminder/reschedule; waitlist release/FIFO; batch refund; metrics/alert; backup/restore demo theo scope. |

ADMIN không tự có mọi quyền ORGANIZER/BUYER nếu contract không cấp. Không trao quyền rộng để diễn cho tiện; dùng đúng tài khoản theo vai trò. Hai organizer khác chủ phải bị chặn dữ liệu của nhau. Người nhận vé chuyển nhượng không được xem thông tin vé/đơn khác của người gửi.

Mọi hành động người dùng thông thường phải đi được từ UI. Nếu hiện mới có API cho một chức năng trong scope, bổ sung UI tối thiểu đúng design system. Console, SQL và gọi API trực tiếp chỉ hỗ trợ oracle/setup/fault injection, không thay cho trải nghiệm người dùng cuối.

## 6. Chuẩn bị bộ dữ liệu cho một kịch bản xuyên suốt

Giữ catalog gốc; thêm một nhóm ghi rõ “DEMO — kịch bản đủ vai trò” trong DB demo riêng. Các nhánh cùng kể một câu chuyện của một ban tổ chức, nhưng dùng nhiều suất để không phá điều kiện nghiệp vụ:

| Nhãn | Dữ liệu và mục đích |
|---|---|
| E-MAIN / S-MAIN | Suất tương lai trước check-in, ít nhất6ghế, các hạng200000/100000VND; dùng quản lý/giá/đặt vé/coupon/transfer/reschedule. |
| S-TODAY | Suất hôm nay theo giờ Việt Nam, đủ vé trả tiền và2cửa; dùng STAFF, duplicate/override, snapshot/offline/sync/conflict. |
| S-REFUND | Suất tương lai đáp ứng cutoff policy đã duyệt, không có admission; dùng buyer cancel/refund/nhả ghế và accountant. |
| S-WAIT | Suất nhỏ được mua hết, có2subscriber FIFO và ghế về kho theo luồng thật; dùng waitlist. |
| S-BATCH | Suất riêng có vài đơn PAID và một PENDING để thể hiện batch/restart/failure/retry huỷ suất; không cần dựng hàng nghìn đơn cho phần diễn chính. |
| S-POLICY | Order pending/paid/expired, coupon0đồng, gateway ambiguous và account privacy phụ; tránh làm hỏng dữ liệu đang diễn các nhánh khác. |

Số ghế/tài khoản/order có thể tái dùng fixture đã có nếu phù hợp. Giữ ID/nhãn và thời gian cho lần trình diễn sau. Không chọn một suất đã có admission để thử reschedule hoặc huỷ buyer khi rule cấm. Không dùng một vé cho cả check-in thành công rồi kỳ vọng nó còn được hoàn trước vào cửa.

Tài khoản demo tối thiểu:1ADMIN,2ORGANIZER khác chủ, BUYER-A/BUYER-B/BUYER-C phụ,2STAFF cho2cửa,1ACCOUNTANT. Tạo qua cơ chế hợp lệ, credentials chỉ trong hồ sơ demo local, không hard-code bí mật vào repo/chat công khai.

Tách browser context/profile cho từng người dùng. Không chia sẻ cookie làm sai vai trò hoặc sửa role account giữa các cảnh mà quên phục hồi. Có thể dùng cùng máy để diễn nhiều context, ghi rõ không phải nhiều thiết bị vật lý.

## 7. Thực hiện kịch bản đủ vai trò và chức năng

Mỗi cảnh phải có: tài khoản/role, URL/nút UI, dữ liệu đầu vào, thao tác, expected, actual và bằng chứng ngắn. Lưu một flowboard liên kết cùng event/show/order/ticket IDs. Không đổi status DB thủ công để vượt qua bước đang hỏng.

### Cảnh1 — ADMIN chuẩn bị nhân sự và quyền

1. ADMIN đăng nhập, tạo ORGANIZER/STAFF/ACCOUNTANT theo cơ chế hiện có; kiểm list và role. Tạo BUYER qua luồng đăng ký ở cảnh3, không tự cấp BUYER quyền quản trị.
2. Sau khi có suất, ADMIN phân công2STAFF vào2cửa của S-TODAY; chỉ một người có quyền override theo contract.
3. Dùng account phụ kiểm đổi role có hiệu lực request kế tiếp, disable thu hồi session, enable khôi phục đúng. Với STAFF có queue offline, giữ queue qua401/403, không xoá dữ liệu để sửa lỗi.
4. BUYER/ORGANIZER gọi trực tiếp API quản trị phải bị từ chối và không đổi dữ liệu.

### Cảnh2 — ORGANIZER xây sự kiện và mở bán

1. ORGANIZER-A tạo/sửa event, mô tả/ảnh/địa điểm; ORGANIZER-B thử URL/API manage của A và bị từ chối.
2. Thêm suất tương lai; quá khứ bị chặn, trùng giờ cùng event có warning nhưng được lưu theo AC. Clone suất thành DRAFT, schema/giá đúng và ghế mới trống.
3. Import một map lỗi: UI liệt kê lỗi, không ghi DB. Import map hợp lệ: preview trước confirm, đúng hàng/số/hạng, rollback khi lỗi ghi; không thay map khi có hold/vé.
4. Đặt giá nguyên VND từng hạng, thiếu/âm/chữ bị chặn; đặt limit theo contract. Mở bán/công bố đúng thứ tự khi đủ điều kiện.
5. Khách ẩn danh thấy đúng catalog/chi tiết/giá/ảnh. Hide event phải chặn cả URL map/detail/SSE công khai, không xoá order/ticket; công bố lại để tiếp tục.
6. Đóng bán chặn giữ mới nhưng không phá hold/order còn hạn; mở lại. Làm nhánh này trước giao dịch chính hoặc trên suất phụ phù hợp.
7. Tạo coupon phần trăm, fixed và free-order demo; kiểm update/deactivate/owner/expiry. Không cho dùng một mã sai event.

### Cảnh3 — BUYER đăng ký, giữ ghế, coupon và thanh toán

1. BUYER-A đăng ký, tự đồng ý notice theo UI, mở email kích hoạt từ Mailpit và đăng nhập; email trùng không bị lộ, password ngắn/token replay bị chặn. Dùng account phụ cho resend/expired activation, sai mật khẩu đến ngưỡng khoá và session hết hạn. BUYER-C đi từ Quên mật khẩu→email catcher→đặt mật khẩu mới; link dùng lại bị từ chối, mật khẩu/session cũ không còn hiệu lực. Không chỉnh giờ hệ điều hành để rút ngắn thời gian khoá/token.
2. A vào S-MAIN chọn nhiều ghế khác thời điểm: chung TTL từ ghế đầu, refresh/đóng mở browser hoặc context thứ hai đăng nhập cùng người vẫn đúng hạn; bỏ một ghế nhả ngay và tổng thay đổi. B tranh cùng ghế: đúng một người thắng, UI báo và cập nhật.
3. Nếu waiting room bật trong nhánh demo, A được admit, B thấy vị trí, direct API không bypass; lease hết hạn đúng rule. Kiểm giới hạn vé/tài khoản cộng đúng hold và paid, không cộng trùng pending; vượt limit bị chặn. Trên profile riêng thử rate limit hold/order theo account và IP, có429/Retry-After, hết cửa sổ phục hồi, header IP giả không bypass. Dùng cấu hình thử có ghi rõ, không đổi quota thật để diễn.
4. Tạo order, bấm lặp không sinh đơn thứ hai; kiểm ghế/hạng/giá/total/TTL. Đổi giá hạng sau đó không thay snapshot order cũ; sửa total phía client không được tin.
5. Apply/remove coupon, thử invalid/expired/wrong-event và quota; UI hiển thị subtotal/discount/payable đúng. Với200000+100000VND và10%, expected300000−30000=270000VND. Chỉ dùng ví dụ này nếu fixture thực có đúng hai dòng đó.
6. Mock payment fail: order vẫn pending, giữ tới deadline, retry cùng order. Sau success webhook: PAID/SOLD/xoá hold/phát vé nguyên tử. Gửi duplicate webhook không thêm payment hiệu lực/vé. Return URL giả không tự quyết PAID.
7. Nhánh free-order: coupon đạt subtotal, UI “Xác nhận nhận vé”, server kiểm quota/hold/quyền rồi phát vé một lần, không gọi gateway; không tạo bằng chứng provider thu0đồng giả.
8. Nhánh ambiguous: timeout sau INITIATED thì UI đang xác minh, chặn attempt mới; xác nhận qua mock webhook/query/đối soát được kiểm soát mới đổi trạng thái. Không chuyển FAILED chỉ để nút retry hoạt động.
9. Nhánh order hết hạn tự nhả ghế; paid không bị job huỷ; race webhook/expiry kiểm transaction ở test liên quan, không cần chờ TTL dài trong phần diễn chính.

### Cảnh4 — Vé, chuyển nhượng, đổi lịch và mail

1. A xem history và vé: mỗi ghế một QR, thông tin đúng, tải ảnh được; B không xem order/QR của A. Order unpaid không lộ vé hợp lệ.
2. A resend vé từ UI, Mailpit nhận đúng QR cũ, không sinh vé; đối chiếu outbox SENT sau transport accepted.
3. A chuyển một vé cho B đang có account. B đăng nhập **“Vé của tôi” phải thấy vé mới và mở/tải QR được**; A không còn dùng QR cũ. Giao dịch/order totals và seat capacity không tăng.
4. Kiểm mail transfer tới người nhận hiện tại, audit và projection nhất quán. Sửa BUG-INT16-01 đến khi người nhận thực dùng được, không chấp nhận transfer201/recipient0vé.
5. ORGANIZER đổi giờ suất chưa check-in, QR hiện tại không đổi, pending TTL không kéo dài; reason/requestId/audit đầy đủ, replay idempotent và sameID/differentBody409. A/B thấy lịch mới, notification đi đúng chủ vé hiện tại.
6. Nhắc lịch/đổi lịch chạy trong profile catcher có controlled job/timer. Không chỉnh giờ hệ điều hành hoặc sửa DB chính để ép chạy; không có2scheduler gửi đôi.
7. Khi kiểm revoked QR offline, phân biệt snapshot trước/sau thay đổi. Không tuyên bố thu hồi tức thì trên thiết bị mất mạng vẫn giữ snapshot cũ; kiểm server và snapshot đã cập nhật, ghi giới hạn stale cache.

### Cảnh5 — STAFF soát vé và ngoại tuyến

1. STAFF-A đăng nhập chỉ thấy phần đúng role, chọn suất hôm nay và cửa trước bật quét. STAFF không được scan/tải snapshot suất chưa được gán; đổi cửa ghi gate mới.
2. Quét vé hợp lệ tại GateA: xanh/thông tin ghế/hạng/admission. GateB quét lại: đỏ, hiện gate/time lần đầu. Hai request đồng thời chỉ một NORMAL; requestId replay không nhân admission.
3. Thử QR lạ, sửa chữ ký, sai suất, vé huỷ: message/reasoncode rõ. Response chậm>3giây có “đang chờ”, không đứng im hoặc xanh giả.
4. Nhân viên có quyền override nhập reason và xác nhận, thêm EXCEPTION có actor mà giữ NORMAL cũ; người thiếu quyền không thực hiện được.
5. Tải snapshot và public key; offline scan vé khác: persist IndexedDB trước khi xanh, quét lại cùng máy bị từ chối. Đóng/mở lại browser vẫn giữ suất/cửa/queue.
6. Nối mạng: tự sync và xoá đúng item sau ACK; mô phỏng partial ACK/timeout sau server commit và401/403 giữ queue để retry. Không clear IndexedDB để làm sạch kết quả.
7. Hai context offline cùng vé, upload muộn trước/sớm sau: đúng luật timestamp/offset đã chốt, lưu conflict không ghi đè mất lịch sử. ORGANIZER xem báo cáo; chỉ một khách được đếm hiệu lực.
8. Kiểm banner mạng/count từ API thật và queue; navigator online không có nghĩa API tới được. Không có snapshot/ghi IndexedDB lỗi phải chặn soát thành công.

### Cảnh6 — BUYER huỷ, ACCOUNTANT hoàn/đối soát, ORGANIZER waitlist

1. Trên S-REFUND chưa check-in và đủ cutoff, BUYER preview rồi cancel theo policy; ticket vô hiệu, ghế về kho, refund có số tiền đúng net snapshot coupon. Case ngoài cutoff/khác chủ/đã check-in bị chặn.
2. ACCOUNTANT thấy refund job, cho mock lỗi đủ retry/backoff rồi xử lý theo quyền; trạng thái UNKNOWN không gửi lệnh hoàn lần2 khi chưa query/đối soát. Request lặp không nhân tiền hoàn.
3. Trên S-WAIT đã hết vé, A rồi B đăng ký chờ; duplicate join không thêm entry, UI có status/unsubscribe không lộ email.
4. Làm1ghế về kho qua expiry/cancel hợp lệ; worker báo đúng1người đầu FIFO, không tạo hold riêng. Mailpit nhận email nêu ghế bán chung. Cho người khác mua trước finalcheck thì lượt mail bị huỷ theo D16, entry vẫn theo contract; không hứa còn ghế khi Inbox nhận.
5. ORGANIZER huỷ S-BATCH: đóng bán ngay, pending/paid xử lý đúng, nhiều batch qua restart, một lỗi refund mock được retry không bỏ/nhân đơn. ACCOUNTANT/ORGANIZER xem progress, audit, Mailpit nhận thông báo.
6. ACCOUNTANT nhập sao kê mock có MATCHED/SYSTEM_ONLY/PROVIDER_ONLY/AMOUNT_MISMATCH; UI thấy phân loại/history đúng, người khác không được dùng chức năng. Không gọi CSV demo là sao kê provider thật.
7. Đối chiếu gross/discount/payable/refunded/net bằng oracle độc lập, allocation từng vé cộng đúng tổng. Không chỉ so hai màn hình lấy cùng query rồi coi là proof.

### Cảnh7 — Báo cáo, file xuất, privacy và operations

1. ORGANIZER xem tồn/doanh thu theo hạng, attendance theo cửa/phút và conflict sau sync; số liệu đúng giao dịch ở các cảnh trước và cập nhật đúng chức năng.
2. Tải PDF một trang đúng snapshot/legend/ghế/Unicode; tải CSV mã vé/ghế/giờ/cửa/conflict, không PII. Mở/parse file thật, kiểm quyền và formula injection/escaping; không chỉ nhìnHTTP200.
3. Xem S-63 cohortA, count giữ/thànhđơn/paid/expired/pending và mean/p90 hai loại. Đối chiếu fixture mẫu, nhiều ghế không nhân session; emptyduration=null, không bịa thời điểm quá khứ đã mất nguồn.
4. ADMIN xem mail lỗi, filter theo loại/trạng thái, pagination với dữ liệu hơn một trang và workerflags; gây lỗi SMTP trong profile riêng, retry FAILED có lịch sử/requestId, SENT chỉ khi catcher nhận. Worker tắt phải báo thư chưa gửi; replay retry không sinh thêm vé/job trái contract. BUYER không được retry mail admin hoặc xem mail người khác.
5. BUYER-C phụ thực hiện consent/version/reconfirm/withdraw theo policy, yêu cầu erasure. ADMIN duyệt: user/session/token/PII/outbox được xử lý đúng, order/payment/doanh thu còn nguyên, không ảnh hưởng vé B đã nhận theo rule sở hữu. Chỉ account và dữ liệu giả được dùng cho bước phá huỷ này.
6. Kiểm metrics/alert bằng lỗi mô phỏng local và backup/restore sang DB demo khác nếu thuộc scope; app/đơn/vé/key xác minh được sau restore. Không restore đè DB đang trình diễn.
7. Dừng/khởi động lại demo: catalog/ảnh/tài khoản/giao dịch/QR và dữ liệu bền còn đúng; queue offline giữ khi reopen theo môi trường được test. Không đổi lịch hoặc re-seed xoá order sau restart.

### Cảnh8 — Bản sạch tái lập và bàn giao

1. Chuẩn bị tập file đúng bản sửa hiện tại, gồm untracked cần thiết. Không dùng cloneHEAD cũ thiếu code mới để chứng minh bản sửa.
2. Trên thư mục sạch và DB riêng, làm theo README/bootstrap: cài dependency đúng lockfile, sinh private env/key giả, migrate, import catalog đúng, tạo role demo và start.
3. Xem đủ ảnh/nội dung/giao diện và smoke các vai trò. Không phụ thuộc cache `.next`, DB thật, credential hoặc font ở đường dẫn riêng trên máy tác giả.
4. Lưu `DEMO_WALKTHROUGH.md`: URL, cách lấy credentials local, danh sách scene/role/nút và expected; có thể diễn lại mà không cần console/SQL để sửa trạng thái giữa chừng.
5. Giữ demo final và dữ liệu bền để tôi sử dụng. Có reset-demo an toàn nếu cần nhưng phải opt-in, kiểm đúng profile và không chạy mặc định khi start.

## 8. Quy trình sửa, kiểm thử nhanh và chứng minh kết quả

Làm theo lát cắt: reproduce→sửa→test liên quan→browser→oracle→checkpoint. Lỗi đang cản scene nào phải sửa scene đó trước; không viết lại module đã hoạt động chỉ vì checklist còn NOT_RUN.

Ưu tiên BUG-INT16-01 và các lỗi làm người dùng không dùng được chức năng. Chuẩn hoá một nguồn ownership/projection rõ giữa ticket/orderitem, không chữa bằng thêm record mà làm sai báo cáo/payment/admission.

Dùng profile DB/Redis/Mailpit hiện có nếu guard đúng; giữ source và build khớp. Unit API/web có thể chạy độc lập; E2E/fixture chia sẻ DB phải sequencing. Sau sửa chạy file/suite liên quan và dependencies ảnh hưởng. Chạy một lượt build/typecheck/lint/regression phù hợp source cuối trước bàn giao; không chạy coverage/404case thủ công sau mỗi thay đổi nhỏ.

Giữ các kiểm tra cốt lõi:200request tranh100ghế nếu suite đã có, replay webhook/cancel/refund/admission, signature/amount, owner/role, offline queue; có thể tái dùng evidence đúng source và scope, không giả đã chạy lại. Một happy-path không thay đủ logic của chức năng tiền/ghế.

Không giảm assertion, tăng SLA hoặc skip test để làm xanh. Test/harness lỗi khác lỗi sản phẩm: giữ log lỗi và lý do sửa harness. Ghi riêng API-only, component-only và browser+DB evidence.

## 9. Trạng thái và đầu ra bắt buộc

Tạo thư mục bằng chứng mới có run-id hoặc checkpoint tách biệt, không ghi đè baseline. Tối thiểu:

1. `demo-role-feature-matrix.json` hoặc bảng: toàn bộ chức năng trong scope, ai dùng, UI/API, status và evidence. Không chỉ liệt kê vài scene rồi gọi “đủ tất cả”.
2. `DEMO_WALKTHROUGH.md`: một kịch bản xuyên suốt gồm các cảnh và nhánh trên, account/role, dataset, thứ tự, kết quả mong đợi, cách diễn lại.
3. `DEMO_ACCOUNTS.md` mô tả vai trò, cách lấy mật khẩu từ private profile và URL; không chứa secret thật hoặc mật khẩu cố định public.
4. `DEMO_HANDOFF.md` ngắn1–2trang: source fingerprint, cách chạy/start/stop/restart, dữ liệu/ảnh chuẩn, chức năng đã sửa/thêm, test đã chạy, clone-clean proof, giới hạn mô phỏng và phần còn thiếu.
5. Log/screenshot/DB oracle/PDF/CSV giả đủ truy vết. Không log PII/key/token/cookie/rawremotecredentials.

Trạng thái từng chức năng: VERIFIED_DEMO, IMPLEMENTED_NOT_VERIFIED, FAIL, MISSING, NEEDS_DECISION hoặc EXTERNAL_ONLY. Trạng thái cả demo: DEMO_READY khi đủ chức năng/local logic/giao diện/nội dung và tái lập được; nếu chưa đủ thì DEMO_PARTIAL cùng tên chức năng thiếu. Không đổi original404case thành PASS cho mục chưa có bằng chứng hoặc gate chỉ thuộc production.

Kết thúc bằng tiếng Việt, trả lời trực tiếp: tôi mở web ở đâu; lấy account ở đâu; từng vai trò làm được gì; kịch bản đủ vai trò nằm ở đâu; đã sửa lỗi transfer và phần thiếu nào; bản repo đã đủ tái tạo chưa; còn giới hạn gì. Không dừng ở báo “unit test xanh”. Tiếp tục mọi việc độc lập đã được giao cho đến mốc bàn giao, báo cáo tiến độ ngắn và không hỏi lại các quyền/quy tắc đã được chốt.
