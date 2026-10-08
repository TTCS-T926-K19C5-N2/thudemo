# S-31 — GitHub handoff

Issue [#63](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/63) mở/unassigned; PR duy nhất [#64](https://github.com/TTCS-T926-K19C5-N2/thudemo/pull/64) giữ Draft. Không đổi Owner backlog chưa phân. Không merge/deploy.

Branch `story/S-31-prevent-ticket-reuse`; main khảo sát `4be30370b3007b9b9b58e4aa3598b666df64f3f3`. Dependency fork [S-30 #68](https://github.com/TTCS-T926-K19C5-N2/thudemo/pull/68) revision `3dc6b5cf051047e2c794b96b7f265103073db1ab` được tham chiếu bằng base upstream `dependency/S-30-pr68-3dc6b5c` đúng SHA này để PR chỉ có diff S-31. Snapshot không có commit sửa S-30, không tạo PR thứ hai, không nhập main hoặc coi dependency đã được review. Khi dependency được merge và đủ signed QR contract, người được ủy quyền merge base main có kiểm soát vào branch, retarget PR và re-run checks/review; không force push.

Commit stack dependency: `728bb01`. Commit implementation: `2cceb1d3cf1740c327d9421e0033fb92c0748302`. Test driver/retry: `285c9afe5b56483118b2b655750e9ab2ae8ccd9e`. Fix stale UI + browser đã kiểm: `59314d16710a38152c1b23e98aef289aea792bb8`. Artifact/docs commit sau đó không đổi logic được kiểm. Exact final head, pushes, CI/check URLs và technical review URL/SHA được ghi trong PR body/comment; không tự bịa SHA của commit chứa tài liệu này.

Author/committer các commit S-31: `sangnguyencoder <sangnguyencoder@gmail.com>`, email đã xác minh từ GitHub commit mapped của tài khoản. Push/mở/cập nhật PR: sangnguyencoder. Reviewer vận hành: tovanquyenh-blip. Kiểm API /user + quyền repo + Git HTTPS credential thực và credential override trước mỗi thao tác ghi. Pin gh HTTPS helper cho push; không dùng active gh account như bằng chứng duy nhất, không in token. S-30 giữ tác giả commit gốc. Không coauthor/empty commit/tự đổi tác giả để tạo hoạt động.

Required main checks khảo sát: T-02 / build-and-typecheck, lint, test. Force push=false; required reviewer config=null, nhưng task vẫn yêu cầu review khác account. Workflow product S-31 mới chạy hai API processes/50 races/rollback; candidate workflow riêng vẫn mang nhãn nghiên cứu. CI phải PASS đúng head cuối; queued/running/cancelled không là PASS.

Review phải đọc diff/revision cuối, AC, quyền, constraint/migration/retry, V1, S-30 regression và evidence mới; gửi review với commit_id đã kiểm. Phải dùng nguyên văn disclosure:

> Review kỹ thuật tự động do Codex thực hiện theo ủy quyền bằng tài khoản tovanquyenh-blip; không phải xác nhận chủ tài khoản đã trực tiếp đọc hoặc review độc lập.

Do dependency/signature/camera/staging gate còn mở, không approve. Review Changes requested phải gắn blocker cụ thể; giữ Draft và issue mở. Review cũ trên `88bf8446e06152ab5e84286174c5d65522508cab` là lịch sử, không thay review revision mới.

Bảo toàn WIP: original checkout thudemo ở task/T03 được checkpoint bằng binary patch +1819 SHA256 file, thực hiện mọi sửa trong worktree riêng. Không reset/clean/pull checkout bẩn. Dữ liệu kiểm thử riêng được giữ, không dùng database task khác để reset. [Implementation](S31_IMPLEMENTATION.md), [evidence](S31_EVIDENCE.md), [PO decision](S31_PERMISSION_DECISION.md) đã ở repository để mentor truy cập.
