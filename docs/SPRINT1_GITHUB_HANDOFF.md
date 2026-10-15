# Sprint 1: trạng thái GitHub và bàn giao review
> Cập nhật DEC-11 / 04-10-2026: Render Free, ngân sách 0; PO + review kỹ thuật tự động thực hiện review/chốt; chưa commit/push/PR/publish/upload/deploy. Quy định host/reviewer bên dưới là lịch sử. Xem [gói PO review hiện tại](SPRINT2_PO_REVIEW.md) và [runbook Render](RENDER_FREE_RUNBOOK.md). K-01 tạm thời vẫn chờ PO duyệt recommendation đã đo; không miễn staging/CI/NFR/DoD.

Ngày: 01/10/2026. Người dùng cho phép ghi GitHub và staging trong cuộc trò chuyện. Branch, commit và PR dùng tên task/Sprint; Git commit dùng cấu hình đã xác minh `Quang Sáng Dev <sangnguyencoder@gmail.com>`, cùng tài khoản GitHub đang xác thực. Không dùng tên trợ lý. Hai thay đổi có sẵn `README.md` (modified) và `AGENTS.md` (untracked) được giữ nguyên, không đưa vào PR.

## T-02 CI

- Repository đã chuyển sang tổ chức `TTCS-T926-K19C5-N2`; các URL bên dưới dùng tên hiện hành.
- PR hợp lệ: https://github.com/TTCS-T926-K19C5-N2/thudemo/pull/1 (`task/T-02-ci`, mở và không còn là draft).
- PR kiểm lỗi cố ý: https://github.com/TTCS-T926-K19C5-N2/thudemo/pull/2 (`task/T-02-lint-proof`, ghi rõ KHÔNG MERGE). Chỉ thêm một dòng `any` để job lint phải thất bại; không nằm trong PR sản phẩm.
- GitHub Actions run hợp lệ `36765657553`: cả ba check `T-02 / build-and-typecheck`, `T-02 / lint`, `T-02 / test` thành công; từ `run_started_at` đến `updated_at` là **48 giây**.
- Run proof `36765675881`: `T-02 / lint` thất bại như dự kiến; `T-02 / build-and-typecheck` thành công. Chưa tính AC chặn merge là đạt khi chưa có branch protection.
- Sau khi repository chuyển vào tổ chức, tài khoản `sangnguyencoder` có quyền admin. Branch protection trên `main` đã được cấu hình strict với ba required checks và một approval. Run `36827889536` của PR proof hoàn tất sau **46 giây**: build/typecheck và test xanh, lint đỏ; GitHub trả `mergeable_state: blocked`. PR proof sau đó đã đóng, không merge.

Required checks hiện có trên `main`: `T-02 / build-and-typecheck`, `T-02 / lint`, `T-02 / test`. AC kỹ thuật T-02 đã có đủ bằng chứng; PR #1 chỉ được merge sau review độc lập của `thuytrang158` theo DoD.

## PR tích hợp auth và sự kiện

PR tích hợp https://github.com/TTCS-T926-K19C5-N2/thudemo/pull/3 (mở, không còn là draft), branch `task/Sprint1-auth-events`, xếp sau T-02. GitHub Actions run mới nhất `36767702770` trên commit `8ad5858` có cả ba check xanh trong **50 giây**. Playwright mobile 390×844 đã xác nhận đăng nhập, danh sách, form tạo, lỗi tại trường, không tràn ngang và không có console error. Các task dùng chung `apps/api/prisma/schema.prisma`, auth contract, web components và `pnpm-lock.yaml`, nên được trình bày trong một PR tích hợp có phần review/AC riêng; không tạo các PR trung gian không typecheck. Cần review độc lập theo thứ tự logic:

1. **T-04:** migration users/roles/user_roles, unique email, 5 roles và 2 tài khoản demo Argon2id; kiểm migration bù/tái áp dụng.
2. **T-09:** migration events/showtimes, FK owner và restrict xoá, `timestamptz`; kiểm migration bù/tái áp dụng.
3. **T-05:** TECH-02 phiên máy chủ, cookie HttpOnly/Secure, Redis đếm sai/khoá 15 phút, browser đăng nhập và CSRF origin.
4. **T-06:** quyền từ DB mỗi yêu cầu, route không khai báo 403, role sai 403, đăng xuất thu hồi phiên.
5. **T-10:** UI/API tạo/sửa/danh sách sự kiện và suất diễn, lỗi tại trường, chống gửi đúp, owner 403.

Review checklist: migration/data rollback; không có secret trong Git/log; quyền server và owner isolation; browser desktop/mobile, keyboard; frozen install, lint/typecheck/unit/E2E/build; CI PR xanh; staging demo với dữ liệu giả. Bằng chứng local ở `docs/SPRINT1_LOCAL_EVIDENCE.md`. TECH-02 hiện ghi trong `../docs/decision-log.md` ngoài Git root và phải được trích dẫn trong PR review, không tự coi file này là nguồn quyết định mới.

Review bảo mật trên commit `f5731b9` ghi một phát hiện mức thấp: phiên hết hạn tồn tại trong database. PR đã bổ sung dọn phiên hết hạn khi đăng nhập và E2E xác nhận phiên mới còn hiệu lực. CI lần đầu sau sửa thất bại do hai file E2E cùng tạo role trên database sạch; fixture đã được sửa để tạo role an toàn khi chạy đồng thời, run mới nhất xanh. Báo cáo review nằm trong scan bảo mật `3887e6d6-2edd-4c1a-a676-a97611a1c4fa`.

## T-03 và K-01

T-03 đã hoàn thành phần đóng gói local trong PR draft https://github.com/TTCS-T926-K19C5-N2/thudemo/pull/4; GitHub Actions run `36770473232` xanh 3/3 trong **49 giây**. T-03 còn cần host staging Docker, registry/secret, tên miền/HTTPS và quyền triển khai để chứng minh deploy tự động, health gate, giữ container cũ và thời gian dưới 10 phút; không dùng Vercel thay cho máy chủ riêng đã ghi trong task. K-01 chờ S-01/staging đạt, sau đó thử hai cơ chế giữ ghế với 200 yêu cầu đồng thời và reviewer. Không dùng credential, dữ liệu hoặc dịch vụ production.
