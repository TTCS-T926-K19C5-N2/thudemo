# T-03: phiên staging laptop và bằng chứng sau PR96

PR96 đã được thuytrang158 review đúng head0bc47dc và merge thành038f8baff4c175e88c53b19a553105be15735dec. CI bản tích hợp xanh trong233giây. Watcher tự deploy thành công, nhưng merge→healthy1754.310giây vượt600giây: Windows ghi nhận thoát Modern Standby sau thời điểm merge. Không trừ thời gian ngủ hoặc nhận deploy-only281.142giây là đạt AC.

## Thay đổi

- Thêm `scripts/sprint1-staging-session.ps1`: yêu cầu Windows giữ hệ thống hoạt động trong một phiên có thời hạn1–7200giây; mặc định3600giây. Kiểm đúng profile trước khi gọi kernel32; clear trongfinally. Không đổi power plan, registry, firewall, authentication, policy GitHub hoặc dữ liệu. Người vận hành vẫn phải giữ nắp mở, nguồn và mạng; explicitSleep vẫn được tôn trọng.
- Cập nhật README (clone sạch đã kiểm,30migration), runbook và trạng thái toàn bộT01–T10/K01/DoD theo bản tích hợp038. Giữ các lần618.856/1754.310giây làFAIL.
- Thêm95mapping yêu cầu hiện tại với174tham chiếu evidence cóhash; không sửa lịch sử hoặc dùng sốtest thay assertion. Source API/web/shared/lock/demoentry không đổi so với02a đã kiểm clone sạch.

## Kiểm chứng

PowerShell5 gọi API Windows thật: nhận yêu cầu2giây rồi clear, exit0; duration0 bị từ chối trước khi có yêu cầu. Parse PowerShell thành công.12test Node watcher/release/compat/resources PASS. Trên038:15ca browser desktop/mobile,7nhóm API chức năng, phiên activatedBUYER/login/logout/replay401 và secretliteral sweep PASS. Không chạy lại probeIP, không gửi email mới. Evidence email thật giữsource02a/thờiđiểm gốc.

Rà kỹ thuật helper: chỉ đọc profile cố định tại repo, P/Invoke tênAPI/flags cố định, không shell/userinput/network/secret, journal metadata trong thư mục ignored, không stopprocess hay xóa file. Thời hạn hợp lệ dùngmonotonic Stopwatch; finally chỉ clear quyền của thread hiện tại. Đây không phải cơ chế chặn explicitSleep, không cam kết hoạt động khi máy tắt/mất mạng, và chưa chứng minh gate600s sau sửa vận hành.

## Điều kiện tích hợp và hoàn thành

CI đúng head mới và một thành viên khác review helper/runbook. Không dùng approvalPR96 thay approval cho PR này. Trong phiên laptop thức, sau merge để watcher hiện có tự phát hiện/deploy; thu timestamp merge/CI/candidate/promote và xác minh source đang chạy. Chỉ đóngT03/Sprint khi merge→healthy<600giây và toàn bộDoD đã có evidence. Không deploy tay, không đổi ngưỡng, không đẩy trực tiếpdevelop hoặc bypass.

Evidence: `evidence/sprint1/20261017-pr96/` gồm integration-ci, auto-deploy/power events, source-compatibility, acceptance-current, API/browser, registration-session, secret-sweep và session-lifecycle. Không có credentials hoặc rawactivationtoken.
