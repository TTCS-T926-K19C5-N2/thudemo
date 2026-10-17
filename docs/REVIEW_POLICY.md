# Review và tích hợp develop — DEC-18

Được người dùng chấp thuận trực tiếp17/10/2026 cho quy trình một người vận hành. Quyết định canonical được append tại `../docs/decision-log.md`; bản lưu trong repository: [DEC-18](../evidence/sprint1/20261017-review-policy/decision-18.md). Quy tắc có hiệu lực sau khi cấu hình được đọc lại và kiểm enforcement; không hồi tố lịch sử.

Giữ feature/fix → PR → develop. Gate human approval được thay bằng review kỹ thuật tự động đúng repository/PR/base/head/diff; required approvals=0 và last-push approval=false. Giữ PR bắt buộc, strict/up-to-date, conversation resolution, enforce admins, cấm force-push/xóa develop. Không thay main. Giữ năm required checks `T-02 / build-and-typecheck`, `T-02 / lint`, `T-02 / test`, `K-01 / candidate-research`, `T-31 / hold-concurrency` với issuer GitHub Actions15368, thêm `Review / technical-review`. T31 là policy regression, không phải AC Sprint1.

## Review từng revision

Đọc toàn bộ diff và bằng chứng trước khi kết luận: correctness, yêu cầu, security, migration, concurrency, regression, dependency, CI và deployment. Ghi coverage từng file, assertion, nguồn/bằng chứng, findings và rủi ro. Mục không áp dụng phải giải thích. P0–P2 phải sửa và kiểm lại; P3 chỉ được nhận nếu không vi phạm yêu cầu/bảo mật/toàn vẹn dữ liệu và có lý do. Test xanh hoặc validator/schema PASS không thay review thực tế.

`node scripts/technical-review.mjs inspect <PR>` lấy identity/diff digest. Sau review thực tế, report có schemaVersion1/kind `automated_technical_review`/policy DEC-18 phải bám candidate này. `coverage.changedFiles` ghi path/assessment/evidence cho mọi file; mỗi risk dimension ghi status REVIEWED hoặc NOT_APPLICABLE, assessment/evidence. Ghi actor, startedAt/completedAt, findings, unverifiedMaterialRisks, verificationEvidence, conclusion và publishable. Không ghi đó là review độc lập của thành viên khác.

Đăng report trong comment PR bằng account vận hành, gắn URL vào `reviewExecution.runEvidenceUrl`, rồi cập nhật chính comment đó với report đầy đủ và `DEC18-REPORT-SHA256:<sha256 của JSON.stringify(report)>`. `validate <PR> <report.json>` kiểm exact SHA/digest/coverage/risks/timestamps và comment/actor; `publish` re-read candidate trước khi xuất bản status success. Không xuất bản khi thiếu, stale hoặc còn finding bắt buộc. Script chỉ là validator/publisher, không phải engine tự đọc và suy luận diff.

Publisher dùng account vận hành và context mới `app_id=-1`: không độc lập với tác giả và không chống người có quyền status cố ý làm giả. Năm check CI vẫn bind15368. Quy trình này chưa có service review24/7; khi engine/phiên vận hành không chạy hoặc thiếu quota thì gate thiếu/pending/error, không tự fallback thành CI-only. Không dùng account người khác để approve.

Commit mới cần review/CI mới; base đổi cần cập nhật nhánh và re-review. Không tái dùng report SHA/base cũ. Khi phát hiện finding mới trên cùng head, hủy auto-merge và đổi review status pending/failure trước sửa.

## Auto-merge và staging

Capability auto-merge là cài đặt toàn repository, không tự arm PR. Chỉ arm PR vào develop thuộc nhiệm vụ đã giao sau khi review thực tế không còn finding bắt buộc, cả sáu required contexts đúng head/issuer success, nhánh cập nhật, không draft/conflict/conversation mở, scope và backup/deployment sẵn sàng. Re-read ngay trước thao tác và dùng expected-head guard. Không dùng admin bypass. Được tự thực hiện xuyên suốt trong phạm vi đã giao, không xin lại người thứ hai hoặc từng PR.

Sau merge phải kiểm CI integrated SHA, watcher tự deploy, merge→healthy dưới600s, HTTPS/API/browser/session, dữ liệu/khóa/backup/rollback và AC/regression liên quan. Không coi merge/test xanh là nghiệm thu staging.

## Lịch sử và đóng góp

Giữ approvals thực tế, author/committer/owner và receipts cũ. Không biến self-review thành approval người khác. Thay đổi này bỏ bảo đảm một thành viên khác đã trực tiếp đọc và quyết định; không chứng minh đóng góp cá nhân hoặc năng lực chỉ qua account/status. Minh chứng cá nhân cần phần việc/file/commit/demo/giải thích có nguồn. Chấp thuận quy trình dự án không chứng minh mentor/chương trình đã miễn rubric ngoài dự án.
