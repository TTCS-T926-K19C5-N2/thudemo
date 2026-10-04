# Tích hợp phiên bản Sprint 2 vào main

## Quyết định tích hợp ngày 05/10/2026

Product Owner yêu cầu đưa toàn bộ phiên bản Sprint 2 hiện tại vào main qua PR, dùng các tài khoản đã được ủy quyền để push và review chéo. Chỉ dẫn mới ưu tiên việc tích hợp phiên bản hiện tại thay cho chờ chuỗi PR theo từng task. Review đăng qua tài khoản khác là review kỹ thuật tự động theo ủy quyền, không phải bằng chứng chủ tài khoản đã trực tiếp review.

Giữ required checks và branch protection; không push trực tiếp main, force push hoặc dùng quyền quản trị để bỏ qua gate. Tích hợp code không đồng nghĩa nghiệm thu tất cả AC/NFR/DoD. Không tự đánh dấu task Done hoặc đóng issue. K-01 staging, worker liên tục, NFR và deployment vẫn theo bằng chứng thực tế. Không deploy trong lượt tích hợp này.

## Phiên bản

Nguồn: snapshot WIP của thudemo, giữ nguyên backend, migration đã áp dụng, thiết kế Stitch và API thật. Giữ thêm bản sửa đăng nhập/activation từ nhánh Sprint 1. Checkout preview được bảo toàn; bản tích hợp nằm ở worktree riêng.

Phạm vi: T-11–T-24, T-27–T-31, T-34–T-35 và kết quả nghiên cứu K-01 hiện có; cấu hình runtime, CI, Render Free, demo, tài liệu và bằng chứng hỗ trợ. T-25/T-26/T-32/T-33 không được tự mở rộng nghiệp vụ hoặc ghi Done.

## Review và bằng chứng

Kiểm tra diff, secret, frozen lockfile, lint, typecheck, unit test, integration test và build trên revision của PR. Kết quả CI từ xa được lưu trên GitHub. Các báo cáo 04/10/2026 giữ nguyên ngày và kết quả, không đổi nhãn thành staging hoặc kết quả mới.

## Rollback

Rollback code bằng PR revert commit tích hợp. Không reset database; migration đã áp dụng phải dùng migration bù được kiểm chứng. Không sửa hoặc xóa lịch sử migration.
