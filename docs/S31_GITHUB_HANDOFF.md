# S-31 — GitHub handoff

Trạng thái: **candidate storage proof, BLOCKED S-30 và PO policy; PR phải Draft**. Chưa đủ ba AC/DoD, chưa merge và chưa deploy.

- Issue: [#63](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/63), giữ mở, chưa gán Owner.
- Branch: `story/S-31-prevent-ticket-reuse`, base `main`.
- Base SHA: `4be30370b3007b9b9b58e4aa3598b666df64f3f3`.
- Implementation/test commit: [`921e842113b383ecc2a5c1cd837054b8fd1f08d6`](https://github.com/TTCS-T926-K19C5-N2/thudemo/commit/921e842113b383ecc2a5c1cd837054b8fd1f08d6); bằng chứng SQL gắn content SHA-256 trong `evidence/s31/storage-proof.json`.
- Tài khoản vận hành commit/push/PR: `sangnguyencoder`. Author/committer: `sangnguyencoder <sangnguyencoder@gmail.com>`. Email được GitHub map về tài khoản này ở commit `e6dacdeed4e3e4d2f423e29019991d8d73cbbb1a`; endpoint user/emails không đủ scope, không đoán email khác hoặc đổi tác giả sang Owner.
- Tài khoản review được ủy quyền: `tovanquyenh-blip`. Review phải được gửi với commit_id đúng PR head đã đọc, sau khi recheck head. Không approve khi dependency/policy/AC thiếu.
- PR: [Draft #64](https://github.com/TTCS-T926-K19C5-N2/thudemo/pull/64), được mở thật bằng sangnguyencoder sau push đầu.
- Push đầu đã thực hiện sau preflight: `82303d2d4e36699e29036b4db47a553f8fc32c94`; output thật: `[new branch] story/S-31-prevent-ticket-reuse -> story/S-31-prevent-ticket-reuse`. Log local được giữ trong checkpoint; không dựng lại pull/push history.
- Review exact final head sẽ được gửi sau commit hồ sơ này. Nguồn chính thức cho account/state/commit_id và URL review cuối: [PR reviews](https://github.com/TTCS-T926-K19C5-N2/thudemo/pull/64#pullrequestreview) và [reviews API](https://api.github.com/repos/TTCS-T926-K19C5-N2/thudemo/pulls/64/reviews). Không gắn review revision trước vào revision sau.
- CI lần đầu đã chạy thực tế: [CI 37752658641](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/37752658641), [candidate storage 37752658679](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/37752658679) tại SHA push đầu. Kết quả này không thay CI của commit hồ sơ mới. [Checks của PR](https://github.com/TTCS-T926-K19C5-N2/thudemo/pull/64/checks) hiển thị checks trên head mới; báo cáo cuối trong PR/review ghi đúng SHA và run URL cuối sau khi hoàn tất.

## Bằng chứng hiện có và còn thiếu

[`S31_IMPLEMENTATION.md`](S31_IMPLEMENTATION.md), [`S31_EVIDENCE.md`](S31_EVIDENCE.md), [`storage-proof.json`](../evidence/s31/storage-proof.json).

Local format/lint/typecheck/build, API 147 + web 35 unit tests: PASS. Candidate PostgreSQL 11 checks, 50 races qua hai DB process: PASS. 18 migration thật áp dụng vào DB riêng; không có migration sản phẩm S-31. Harness từ chối chạy lại để giữ lịch sử.

AC1/AC2 chưa kiểm scanner/API thật; AC3 BLOCKED quyền và dependency. QR verification, hai session/quyền/cửa thật, exception endpoint, hai API instance/API restart, S-30 regression, desktop/mobile screenshot, camera thật, browser/accessibility/timeout/console, staging chưa có bằng chứng. Xem ma trận đủ 13 trường hợp ở evidence. Không dùng CI chung hoặc database candidate làm PASS những phần đó.

## Danh tính và GitHub gates

Trước mỗi remote write: switch đúng account → `gh api user` → kiểm permission → kiểm biến override chỉ tên → resolve credential HTTPS với helper gh được pin → dùng credential đó gọi API `/user`, không in credential. Push phải dùng cùng helper đã xác minh. Không SSH, force-push, direct-main, merge, deploy hoặc sửa protection.

Main protected, strict required checks: `T-02 / build-and-typecheck`, `T-02 / lint`, `T-02 / test`; không required approval trong protection hiện tại, vẫn bắt buộc review tài khoản khác theo task. Không có PR template được tìm thấy. Base CI đã PASS tại SHA base; không suy thành CI head S-31.

Review body phải ghi nguyên văn:

“Review kỹ thuật tự động do Codex thực hiện theo ủy quyền bằng tài khoản tovanquyenh-blip; không phải xác nhận chủ tài khoản đã trực tiếp đọc hoặc review độc lập.”

## Bảo toàn WIP và phạm vi

Checkpoint local 1.819 file WIP, status và binary patch. Đối chiếu sau push đầu: checked 1819, changed 0, missing 0. Chỉ stage file SQL candidate, scripts, workflow/evidence S-31 và ba tài liệu; không `git add .`. Không thay payment/QR/V1 hoặc merge nhánh dependency. Migration đã áp dụng giữ nguyên; rollback sản phẩm phải thiết kế lại khi có Ticket/S-30. Container DB S-31 vẫn giữ lại evidence, không reset database task khác.
