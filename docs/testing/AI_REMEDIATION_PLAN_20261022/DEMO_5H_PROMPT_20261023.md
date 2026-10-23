# Chỉ đạo mới: bàn giao demo trong 5 giờ

> **Chỉ đạo này đã được thay đổi:** người dùng yêu cầu dừng kiểm thử lặp và chỉ rà một lượt để ưu tiên hoàn thiện chức năng nhanh. Dùng [PROMPT_HOAN_THIEN_NHANH_20261023.md](PROMPT_HOAN_THIEN_NHANH_20261023.md), không tái đặt hoặc áp deadline19:11 đã cũ.

> Kịch bản thực hiện đủ vai trò và chức năng đã được bổ sung tại [DEMO_ALL_ROLES_IMPLEMENTATION_PROMPT_20261023.md](DEMO_ALL_ROLES_IMPLEMENTATION_PROMPT_20261023.md). Dùng kịch bản đó trong cùng deadline dưới đây, không mở lại một timebox5giờ mới.

Người dùng ưu tiên **bản demo dùng được trong 5 giờ**, không cần mức hoàn thiện hình thức, kiểm thử và báo cáo quá chi tiết. Giữ giao diện và thông tin đã xây dựng; hoàn thiện các chức năng trong phạm vi đã giao và logic quan trọng.

Mốc ghi nhận chỉ đạo: **14:10:59 ngày 23/10/2026, giờ Việt Nam**. Mục tiêu bàn giao: **19:10:59 cùng ngày**. Đây là deadline mục tiêu, không phải bằng chứng đã hoàn tất. Không tính lại 5 giờ mỗi lần nhận prompt, chuyển phiên hoặc tiếp tục công việc. Nếu nhận sau mốc bắt đầu, dùng phần thời gian còn lại.

Áp dụng chỉ đạo này trước các yêu cầu mức chi tiết và lịch kiểm thử trong kế hoạch cũ. Vẫn đọc AGENTS.md, scope demo và các quyết định đã chốt, nhưng không đọc lại toàn bộ lịch sử hoặc lập thêm một kế hoạch dài. Tiếp tục từ mã và bằng chứng hiện có. Nếu đang có thao tác khác chưa xong, hoàn tất hoặc dừng an toàn trước chuyển bước, không chạy hai tiến trình cùng sửa/chạy profile gây xung đột.

## Các điều phải giữ

- Giữ giao diện/nội dung sự kiện/ảnh và dữ liệu hiện có. Không reset, xoá hoặc seed đè DB chính; dùng môi trường demo riêng và catalog đầy đủ, không bàn giao trang trống.
- Hoàn thiện chức năng thật trên UI/API/DB, không giả nút hoặc phản hồi thành công. Payment/refund mock, email catcher và mô phỏng offline được phép cho demo.
- Không làm sai tiền, bán/giữ trùng ghế, sinh vé hoặc admission trùng, mất queue offline, bypass quyền hay lộ secret. Áp dụng các quyết định coupon/waitlist/analytics/refund/gateway đã có; không hỏi lại.
- Không thiết kế lại UI, đổi kiến trúc hoặc thêm việc ngoài yêu cầu. Không tự commit/push/merge/deploy; chuẩn bị đủ tập file để bàn giao GitHub khi được giao bước đó.
- Không ghi PASS hoặc DEMO_READY cho phần chưa chứng minh. Nếu không đủ deadline, bàn giao đúng bản chạy được và nêu phần còn thiếu, không hứa toàn bộ đã xong.

## Phân bổ thời gian mục tiêu

| Thời gian từ mốc bắt đầu | Công việc |
|---|---|
| 0–15 phút | Đọc checkpoint mới nhất, xác nhận profile/data, snapshot mã/UI/assets và chọn danh sách lỗi chặn demo. Không rà lại mọi log cũ. |
| 15–135 phút | Sửa lỗi chặn các luồng chính và khép chức năng đã làm dở: account/event/map/prices, hold/order/mock payment, tickets/scanner, coupon/waitlist, exports/analytics và operations liên quan. Ưu tiên luồng không chạy được trước lỗi trình bày nhỏ. |
| 135–210 phút | Chạy browser theo vai trò và kịch bản demo; kiểm API/DB cho tiền/ghế/idempotency/quyền/offline. Tận dụng bằng chứng còn hiệu lực; không lặp toàn bộ404case chỉ để tăng độ chi tiết. Sửa ngay lỗi tái hiện ảnh hưởng demo. |
| 210–270 phút | Hoàn thiện gói demo: đúng catalog/ảnh, seed an toàn/idempotent, migrations/env mẫu, cách lấy tài khoản giả và startup. Kiểm bản sạch của tập file dự định bàn giao, gồm file mới chưa commit; restart phải giữ dữ liệu. |
| 270–300 phút | Chạy build/typecheck/lint và regression phù hợp source cuối, smoke browser lần cuối. Viết hướng dẫn ngắn và bàn giao, giữ phần thiếu trung thực. Không mở thêm refactor/tính năng mới lúc này. |

Có thể đổi thứ tự để tận dụng công việc đã hoàn tất; đây là ngân sách tổng, không bắt buộc làm lại bước đã có bằng chứng đúng source. Nếu trễ checkpoint, thu gọn báo cáo/ảnh lặp và kiểm chứng trùng trước, không cắt kiểm tra an toàn nghiệp vụ.

## Cách tăng tốc

1. Giữ profile DB/Redis/Mailpit ổn định; tái dùng dữ liệu demo bền, fixture có run-id và cleanup đúng phạm vi.
2. Sau sửa chạy test liên quan; một lượt regression toàn cục ở mốc bàn giao. Không rebuild mọi package sau mỗi sửa nhỏ khi không cần.
3. Các suite kiểm độc lập có thể chạy đồng thời trong giới hạn tài nguyên. Không song song các test cùng sửa DB/fixture hoặc các build dùng chung output. Không tự mở nhiều agent/thread nếu chưa được giao.
4. Không chờ staging, provider thật, SMTP Internet/Inbox, thiết bị4G/camera vật lý, off-host backup production hoặc hosted CI để bàn giao demo. Ghi giới hạn riêng, không đổi kết quả gốc thành PASS.
5. NFR chỉ ghi “chưa refine” được nêu là chưa có tiêu chí, không tự xây thêm chức năng hay hỏi một loạt SLA production. Chỉ hỏi quyết định thực sự chặn logic; dùng rule đã được duyệt.
6. Chứng minh mỗi nhóm chức năng bằng kịch bản đại diện và negative/concurrency cốt lõi. Không viết lại mọi lịch sử checkpoint. Lưu log/ảnh đủ truy vết, báo tiến độ ngắn khoảng mỗi60phút, tiếp tục làm thay vì dừng chờ xác nhận những việc đã được phép.

## Bàn giao tối thiểu trước deadline

### Áp dụng lọc test hiện có để giảm chạy lặp

Log tham chiếu của run remediation ghi API unit khoảng6–10giây, Web unit khoảng9giây và một full API E2E 133test khoảng76giây. Đây là thời gian của các lượt đã ghi, không phải cam kết cho lần tiếp theo; việc dựng fixture, build và browser mới có thể chiếm phần lớn thời gian tổng. Không tự tăng số worker chỉ dựa vào số CPU.

Ví dụ chạy test đúng phần vừa sửa từ rootCodegym:

```powershell
pnpm --filter api exec vitest run src/orders/coupon-pricing.spec.ts
pnpm --filter web exec vitest run --config vitest.config.ts src/features/order-review/order-review.coupon.spec.tsx
```

E2E dùng runner có guard và profile đang hoạt động; có thể lọc theo một tệp bằng `AI_REMEDIATION_E2E_FILE=test/coupons.e2e-spec.ts` và theo tên test bằng `AI_REMEDIATION_E2E_NAME` đúng giới hạn runner. Lưu và khôi phục biến lọc sau lượt chạy; full regression cuối phải bỏ bộ lọc. Giữ đúng run-id/profile hiện có, không chạy bằng envmain hoặc tạo lại profile vì chỉ cần đổi filter.

Giữ `fileParallelism:false`/một worker ở E2E chia sẻ DB, không chạy đồng thời với browser/fixture đang đụng cùng dữ liệu. Chỉ tách thêm parallel worker nếu có DB/Redis/fixture riêng cho mỗi worker và có nhu cầu thực sự trong timebox; không đầu tư refactor hạ tầng đó trước bàn giao demo. Không chạy coverage và report đầy đủ sau mỗi sửa nhỏ; nếu CI/review có gate bắt buộc thì vẫn thực hiện ở checkpoint phù hợp, không bỏ gate.

### Checklist bàn giao

- Bản demo khởi động được, đủ tài khoản giả theo vai trò, thấy nội dung/ảnh và đi được các luồng chức năng đã hoàn thiện.
- Tập source, assets, dataset, migration, lockfile và env mẫu đầy đủ; không phụ thuộc DB/cache/bí mật riêng của tác giả để chạy trên bản sạch. Không upload DB/PII/key thật.
- Hướng dẫn ngắn: chạy ở đâu, lấy tài khoản thế nào, mở Mailpit ở đâu, trình diễn các chức năng ra sao, restart/stop an toàn và gói repo nào đang được chuẩn bị.
- Báo cáo ngắn tối đa1–2trang: chức năng đã chạy, kiểm tra đã thực hiện, source fingerprint, mục còn thiếu và các phần đang mô phỏng. Kèm checklist demo, không cần diễn giải lại404case trong văn bản.
- Chỉ ghi DEMO_READY nếu có bằng chứng đáp ứng scope; nếu còn thiếu, ghi DEMO_PARTIAL và tên chức năng cụ thể. Deadline không cho phép che lỗi hoặc gán thành công giả.

Chỉ đạo này là yêu cầu thực hiện cho AI đang sửa dự án. Bản thân tệp này không khởi chạy công việc nền hoặc chứng minh tiến trình đã chuyển sang chế độ5giờ.
