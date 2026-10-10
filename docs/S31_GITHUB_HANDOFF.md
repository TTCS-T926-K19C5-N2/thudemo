# S-31 — GitHub handoff sau tích hợp QR ký

Issue [#63](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/63) vẫn mở/unassigned. PR duy nhất [#64](https://github.com/TTCS-T926-K19C5-N2/thudemo/pull/64), branch story/S-31-prevent-ticket-reuse, giữ Draft. Không merge S-31/deploy.

Main hiện chứa dependency [#68](https://github.com/TTCS-T926-K19C5-N2/thudemo/pull/68), merge SHA `2498c52901d8a2dfc7b25bdbd4d76035f1fc3bdf` ngày 10/10/2026 20:24:46 Asia/Saigon, merged_by sangnguyencoder. [Review Sáng APPROVED](https://github.com/TTCS-T926-K19C5-N2/thudemo/pull/68#pullrequestreview-5479098718) đúng head `75d15ecbc3d3364c5a481ded21108434a8d4cec3`, CI head PASS. Camera thật source d423fa8 và under-sun user report ghi riêng trong tài liệu S-30; không gọi đó là Codex hoặc chủ tài khoản trực tiếp kiểm ngoài trời.

S-31 tích hợp bằng merge không viết lại f63616b7db28f32c3b31dc95b8095e00bbdd51d6. Snapshot cũ dependency/S-30-pr68-3dc6b5c được giữ; snapshot mới dependency/S-30-pr68-d423fa8 cố định revision đã kiểm để diff PR chỉ có S-31. Việc chuẩn bị branch phụ thuộc không có nghĩa S-30 có trên main. Khi camera/evidence/review cho phép merge S-30 bình thường, fetch main/merge có kiểm soát/retarget PR64 main và re-run/review mới; không force/bypass.

Operator S-31 author/committer/push/PR: `sangnguyencoder <sangnguyencoder@gmail.com>`, email GitHub commit-mapped đã xác minh. Reviewer `tovanquyenh-blip`. Original S-30 attribution giữ nguyên; sửa signed QR mới của Codex theo ủy quyền bằng tài khoản Quyền. Verify API login, repo write, actual Git HTTPS account pin/helper và absence credential override trước remote write. Không secret/coauthor/empty commit.

Exact merge/head SHA, actual push log, final CI runs và technical review URL được cập nhật trong PR64 sau thao tác thật. Không ghi trước rằng đã push/review/merge. Review phải đọc exact head và truyền commit_id. Bắt buộc disclosure:

> Review kỹ thuật tự động do Codex thực hiện theo ủy quyền bằng tài khoản tovanquyenh-blip; không phải xác nhận chủ tài khoản đã trực tiếp đọc hoặc review độc lập.

Required main checks T-02 build/typecheck/lint/test; không sửa protection/assertion/workflow để làm xanh. Thêm workflow S31 signed admission: migration22/2API/50races/QRsignature/exception/real browserV1; artifact sanitized JSON+PNG. Review cũ f636 và26browser UUID không thay bằng chứng contract mới.

WIP checkout chính được giữ bằng binary diff+SHA256 manifest1881files ở checkpoint ngoài Git. Mọi sửa trong worktree riêng; không reset/clean/database khác. Các container mới15442/16392 chỉ cho kiểm S-31 ký. [Implementation](S31_IMPLEMENTATION.md), [evidence](S31_EVIDENCE.md), [PO decision](S31_PERMISSION_DECISION.md) là nguồn bàn giao trong repo.

Thao tác remote thật09/10/2026: Sang push snapshot d423fa8→dependency/S-30-pr68-d423fa8; push f63616b..5cd1e2d rồi5cd1e2d..8e6374d vào đúng story branch; retargetPR64 base mới, API xác nhận baseSHA=d423/head=8e. Log timestamp nằm ngoài Git để không chứa credential; các range ở đây lấy từ output push thật, không dựng lại lịch sử. Không retargetmain/chưa có mergeSHA S-30.

## Thao tác thật 10/10/2026

Sang fetch origin/main `79704a2→2498c529`; merge main có kiểm soát vào branch S-31 sạch, commit **5a97a91c6e06efa4249d96e8bb99baaca4e8ed51**, không conflict, author/committer `sangnguyencoder <sangnguyencoder@gmail.com>`. Push thật **8621095→5a97a91**, không force. Retarget PR #64 từ snapshot sang **main2498c529**; API readback head5a/base2498/main. Diff chỉ còn S-31, không lặp S-30. Không xóa snapshot cũ.

CI admission/S-30 compatibility/T-02 head5a PASS, artifact mới nguyên bytes trong evidence/s31/ci-5a97a91. WIP checkout gốc 1881 files/hash/status unchanged khi kiểm 10/10. Phiên điện thoại S-31 đang chờ người dùng khởi động script riêng và kết nối lại máy; chưa có PASS cho phần đó. Commit tài liệu tiếp theo cần final-head CI/review riêng; không gán sourceSha5a của artifact thành SHA tương lai. S-31 giữ Draft trong lúc thiếu bằng chứng; chưa merge/deploy.
