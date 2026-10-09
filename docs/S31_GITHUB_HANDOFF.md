# S-31 — GitHub handoff sau tích hợp QR ký

Issue [#63](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/63) vẫn mở/unassigned. PR duy nhất [#64](https://github.com/TTCS-T926-K19C5-N2/thudemo/pull/64), branch story/S-31-prevent-ticket-reuse, giữ Draft. Không merge S-31/deploy.

Main khảo sát `79704a2dc2de0eddb883319a1a520085b89e18cb`. Dependency [#68](https://github.com/TTCS-T926-K19C5-N2/thudemo/pull/68) mới `d423fa8d2e5143b07cd7158985776ef8ca740ce8` đã sửa signed QR và CI PASS, nhưng chưa merge do camera/ngoài trời chưa có bằng chứng. [Review Sáng exact SHA](https://github.com/TTCS-T926-K19C5-N2/thudemo/pull/68#pullrequestreview-5467874301) Changes requested giữ gate này.

S-31 tích hợp bằng merge không viết lại f63616b7db28f32c3b31dc95b8095e00bbdd51d6. Snapshot cũ dependency/S-30-pr68-3dc6b5c được giữ; snapshot mới dependency/S-30-pr68-d423fa8 cố định revision đã kiểm để diff PR chỉ có S-31. Việc chuẩn bị branch phụ thuộc không có nghĩa S-30 có trên main. Khi camera/evidence/review cho phép merge S-30 bình thường, fetch main/merge có kiểm soát/retarget PR64 main và re-run/review mới; không force/bypass.

Operator S-31 author/committer/push/PR: `sangnguyencoder <sangnguyencoder@gmail.com>`, email GitHub commit-mapped đã xác minh. Reviewer `tovanquyenh-blip`. Original S-30 attribution giữ nguyên; sửa signed QR mới của Codex theo ủy quyền bằng tài khoản Quyền. Verify API login, repo write, actual Git HTTPS account pin/helper và absence credential override trước remote write. Không secret/coauthor/empty commit.

Exact merge/head SHA, actual push log, final CI runs và technical review URL được cập nhật trong PR64 sau thao tác thật. Không ghi trước rằng đã push/review/merge. Review phải đọc exact head và truyền commit_id. Bắt buộc disclosure:

> Review kỹ thuật tự động do Codex thực hiện theo ủy quyền bằng tài khoản tovanquyenh-blip; không phải xác nhận chủ tài khoản đã trực tiếp đọc hoặc review độc lập.

Required main checks T-02 build/typecheck/lint/test; không sửa protection/assertion/workflow để làm xanh. Thêm workflow S31 signed admission: migration22/2API/50races/QRsignature/exception/real browserV1; artifact sanitized JSON+PNG. Review cũ f636 và26browser UUID không thay bằng chứng contract mới.

WIP checkout chính được giữ bằng binary diff+SHA256 manifest1881files ở checkpoint ngoài Git. Mọi sửa trong worktree riêng; không reset/clean/database khác. Các container mới15442/16392 chỉ cho kiểm S-31 ký. [Implementation](S31_IMPLEMENTATION.md), [evidence](S31_EVIDENCE.md), [PO decision](S31_PERMISSION_DECISION.md) là nguồn bàn giao trong repo.
