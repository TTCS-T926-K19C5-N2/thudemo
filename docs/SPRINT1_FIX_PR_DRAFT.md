# Sửa T-03 sau nghiệm thu tích hợp PR #91

PR #91 đã được thuytrang158 APPROVED đúng a829 và merge vào develop 90188. Auto-deploy hoạt động nhưng mất 618.856 giây từ merge đến healthy, vượt ngưỡng 600 giây. Sprint 1 chưa Done.

Bản sửa này chỉ chạm watcher, test và tài liệu/evidence; không thay API, web, auth, schema, UI, AC hay protection.

## Thay đổi và kiểm chứng

- Giới hạn mỗi lệnh Git/GitHub CLI ở 20 giây; tắt credential prompts. Timeout từ chối deploy và ghi metadata lỗi, không log raw output hay secret.
- Khi CI còn pending hoặc gặp lỗi, thử lại sau 15 giây; khi bản hiện hành khỏe, giữ chu kỳ 60 giây. Không dùng SHA cũ hoặc coi check chưa phát sinh là thành công.
- Đòi đủ cả 5 required checks và mọi check bổ sung phải SUCCESS. T-31 là deployment policy hiện hành, vẫn ngoài AC Sprint 1.
- 20 checks gateway/release/compat/resource/watcher PASS. Git HTTP thật bị treo đã trả timeout ở mặc định 20.009 giây; ca thử lại và đối chứng thiếu check PASS. Lint/typecheck PASS.
- Trên bản tích hợp 90188: 15 ca browser, 8 nhóm API, phiên của tài khoản đã kích hoạt và rollback đều PASS. Bằng chứng email thật cũ giữ nguyên revision và thời điểm, không nhận là vừa gửi thư mới.

## Evidence

Trong `evidence/sprint1/20261017-integrated/`: `auto-deploy.json`, `integration.json`, `watcher-deadline-rehearsal.json`, `watcher-required-checks-regression.json`, `watcher-gate-rehearsal.json`, `rollback-90188e5.json`, `browser-90188e572d41/results.json`, `api-90188e5/https-api.json`, `registration-session.json`, `secret-sweep.json`.

## Review và điều kiện hoàn thành

Đọc diff `scripts/sprint1-staging-watch.mjs` và `deploy/laptop-watcher.spec.mjs`; kiểm argv không qua shell, timeout không mở guard, cleanup chỉ xóa repository tạm của test, và các gate SHA/ancestor/5 required checks/extra failure vẫn mặc định từ chối.

CI phải xanh đúng head hiện tại. Approval PR #91 không thay approval cho bản sửa mới. Sau merge được review vào develop, để watcher tự deploy và đo lại merge→healthy dưới 600 giây. Giữ nguyên lần 618.856 giây là FAIL trong lịch sử; không lấy rehearsal hoặc deploy thủ công thay gate thật.

Sau đó kiểm source, health, các luồng bị ảnh hưởng trên bản cuối và đồng bộ task/backlog/DoD khi đủ bằng chứng.
