# S-31 — Vé đã soát không dùng lại được lần hai

Trạng thái: **BLOCKED / bản chuẩn bị kỹ thuật, chưa triển khai vào sản phẩm**. Ngày khảo sát: 08/10/2026 (Asia/Saigon).

## DISCOVER

Nguồn: workbook `Bán vé sự kiện có sơ đồ ghế (1).xlsx`, sheet Backlog, dòng 41 (A41:O41); `../docs/product.md`, `decision-log.md` (đến DEC-12), `architecture.md` mục 9/10, `risk-and-security.md` mục 3.6, `ui.md` mục 6.12 và AGENTS.md. Các nguồn ngoài Git root được trích nội dung cần thiết tại đây để mentor đọc trên PR.

Giữ nguyên S-31, E-06, tier Next, Must, Sprint 4, **3 SP ước lượng thô**, Todo, Owner **chưa phân**, dependency **S-30**. Tài khoản vận hành Codex không phải Owner. S-31 không phải T-31 kiểm tải giữ ghế.

Ba AC giữ nguyên:

1. Vé đã vào lúc 19:02 ở cửa A, quét tại cửa B bị từ chối kèm thời điểm và cửa trước đó.
2. Hai máy quét cùng vé cùng khoảnh khắc: chỉ một máy báo hợp lệ.
3. Nhân viên xác nhận khách bị từ chối là chủ vé thật, “cho vào có ghi chú” ghi thêm lần vào với lý do và tên nhân viên.

NFR: chống đồng thời bằng ràng buộc ở database.

Base khảo sát: `4be30370b3007b9b9b58e4aa3598b666df64f3f3`. Đã fetch, kiểm toàn bộ remote refs và PR/issue hiện hành. Main có Order/Payment nhưng **không có Ticket, QR verifier, scanner, scope suất/cửa hay check-in service**. Không suy OrderItem thành Ticket. Không có branch/PR S-30 hoặc S-31. PR #50 (S-27) ở `c492c2865ec6344c467b8e0f376961e1095ccf06`, cùng revision Sprint 2, chưa cung cấp QR. PR #46 (S-28) ở `62f1eef1fe90324207413ccc28939f2ebf3b973a` có quản lý nhân viên, chưa cung cấp quyền ngoại lệ/scoped scanner. Không merge hoặc cherry-pick các PR đó.

Checkout gốc ở `task/T-03-docker-packaging`, HEAD `88d8bfd38712f293a5794069c69cfdc3d7b8860c`, nhiều WIP. Worktree riêng: `thudemo-s31-prevent-reuse-20261008`, branch `story/S-31-prevent-ticket-reuse`. Checkpoint local chứa binary patch, status và SHA-256 của 1.819 file WIP; không đưa patch/WIP vào PR.

## PLAN và IMPLEMENT — phần độc lập đã thực hiện

Thêm SQL **candidate chỉ dùng kiểm chứng** trong `apps/api/prisma/verification/s31-admission-candidate.sql`, harness `apps/api/scripts/verify-s31-storage.mjs` và workflow cách ly. Không đăng ký module, route hay scanner mới; không thay schema Prisma, migration, thanh toán, QR hoặc giao diện V1.

Fixture nằm riêng trong schema `s31_verification`, trên database riêng `s31_storage_verification`, sau khi deploy 18 migration thật của repository. Các bảng tickets/admissions ở đây là mô hình thử có ghi nhãn; không phải Ticket/RBAC sản phẩm và không phải bằng chứng API hay session nhân viên.

Candidate dùng:

- Unique partial index theo ticket cho `kind='NORMAL'`, giữ nhiều dòng `EXCEPTION` riêng.
- `SELECT ... FOR UPDATE` trên vé, kiểm trạng thái/suất và insert trong cùng transaction PostgreSQL. Kết quả được đọc sau autocommit; caller mở transaction phải commit trước khi báo hợp lệ.
- Trạng thái đã dùng được suy từ dòng NORMAL, không có cờ used cần ghi hai nơi. Nếu S-30 dùng cờ trên Ticket, cập nhật cờ và ledger trong cùng transaction khi tích hợp.
- `ON CONFLICT DO NOTHING` xử lý race insert và request key bằng code nghiệp vụ, không để unique violation thành 500 trong routine.
- Dòng đầu không bị cập nhật bởi quét trùng. Metadata tối thiểu: thời điểm, cửa và ID admission nội bộ. Hợp đồng public phải chỉ lộ metadata tối thiểu đã duyệt, sau authentication, scoped authorization và QR verification.
- Unique `(actor_id, request_id)`: cùng request đã ghi trả `ALREADY_RECORDED`; khác ticket/suất/cửa/hành động trả `REQUEST_CONFLICT`, không có metadata. Một lần quét mới trả `TICKET_ALREADY_USED`. Không có log từ chối giả thành lịch sử vào.

**Idempotency ở đây là đề xuất chờ đối chiếu S-30**, chưa thêm HTTP header/payload contract. Retry cùng key không được UI diễn giải thành lần vào mới. Đề xuất bind key với phiên nhân viên và fingerprint canonical của thao tác khi tích hợp; chưa quyết thay contract hiện hữu.

## Quyền ngoại lệ và thiết kế tích hợp chờ PO/S-30

Nguồn hiện hành vẫn `[CẦN CHỐT]`. Đã hỏi PO về vai trò và phạm vi suất/cửa. Chưa có phản hồi tại thời điểm ghi hồ sơ; **không có endpoint ngoại lệ được bật**.

Đề xuất A: capability riêng cho từng suất/cửa; STAFF/ADMIN/quyền quét thường không tự nhận quyền ngoại lệ. Phương án B: trưởng ca được phân công tại suất/cửa. Đây là đề xuất, chưa phải quyết định RBAC. Mặc định từ chối đến khi quyết định được ghi nhận. S-28 chưa được coi là approval cho ngoại lệ.

Thiết kế endpoint (tên/path phải tái sử dụng convention S-30 khi có): một action riêng cạnh endpoint scan, controller mỏng, service của scanner thực hiện transaction. Input chỉ QR/context/request key/lý do và xác nhận thao tác đã kiểm chủ vé; actor ID/tên/time lấy từ phiên và dữ liệu máy chủ. Hành động xác nhận là lời chứng của nhân viên và có audit; nhấn nút không tự chứng minh người mua. Không KYC, upload giấy tờ hoặc thêm PII.

Trình tự: xác thực phiên còn hiệu lực → kiểm quyền ngoại lệ tại suất/cửa hiện tại → xác minh QR bằng cơ chế S-26 → khóa Ticket → kiểm vé đúng suất, được phép vào và đã có NORMAL → kiểm retry/fingerprint → insert EXCEPTION cùng transaction → commit → trả `EXCEPTION_RECORDED`. Thiếu quyền, lý do trống/toàn whitespace/dài quá giới hạn hoặc vé giả/sai suất/hủy đều từ chối; không lộ metadata. Giới hạn đề xuất 500 ký tự phải đồng bộ DTO/UI và PO policy. Tên nhân viên snapshot tin cậy và FK actor phải theo schema danh tính được S-28/S-30 chấp nhận. Không reset NORMAL. Double submit cùng key trả replay riêng, không thêm dòng. Quét thường tiếp theo vẫn bị từ chối.

Fixture thử constraint lý do, unique request key và khả năng giữ NORMAL sau EXCEPTION bằng insert trực tiếp; **không có service được cấp quyền, không nghiệm thu AC3**.

## UI V1 dự kiến, chưa có scanner để sửa/render

Tái sử dụng màn hình S-30 khi dependency tồn tại. Không dựng scanner demo. Giữ font/màu/layout/tokens hiện có, không Afterglow V2.

State cần nối vào scanner: `Vé đã sử dụng` + icon/cảnh báo + `Đã vào lúc … tại cửa …`, context suất/cửa ghim và `Quét vé tiếp theo`. Chỉ show `Cho vào có ghi chú` khi server cung cấp capability đã duyệt. Compose Dialog/Label/Textarea/Button sẵn có hoặc primitive theo thứ tự AGENTS sau khi kiểm repo tại revision S-30. Dialog có xác nhận đã kiểm chủ vé, lý do bắt buộc, busy chặn lặp, focus trap/return, validation liên kết field, retry có hướng dẫn. `Đã ghi nhận vào lại theo ngoại lệ` khác kết quả NORMAL và replay.

Quá 3 giây: đang chờ, không xanh trước commit, không coi timeout/mất mạng hợp lệ và không chuyển offline. Live region, text/icon thay vì chỉ màu/âm thanh, contrast, desktop/mobile, keyboard và touch phải được kiểm trên màn hình thật S-30. Skill frontend/shadcn/React/browser sẽ đọc khi có thay đổi UI chạy được; các tên cũ `vercel:nextjs`/`vercel:agent-browser-verify` trong AGENTS không có trong catalog hiện tại, dùng skill khả dụng phù hợp khi đến bước đó.

## Migration và rollback

**Không có migration S-31 sản phẩm trong PR này**, vì chưa có Ticket/FK/contract S-30. SQL verification không được migrate/deploy vào sản phẩm. Chỉ database kiểm thử mới nhận fixture; harness từ chối khi schema đã tồn tại và giữ lại lịch sử, không reset/clean dữ liệu. Không `db push`, sửa migration đã áp dụng hoặc drop database đang chạy. Khi có dependency: bổ sung migration mới, kế hoạch migration bù có bảo toàn admissions; kiểm apply/compensate/reapply trên môi trường cách ly trước publish revision tích hợp.

## REVIEW → VERIFY → PUBLISH

Xem `S31_EVIDENCE.md` và `S31_GITHUB_HANDOFF.md`. PR phải Draft, không Closes issue, không approve thiếu AC3/dependency/bằng chứng API, không merge/deploy. Review tài khoản khác là review tự động được ủy quyền, không xác nhận chủ tài khoản trực tiếp review độc lập.
