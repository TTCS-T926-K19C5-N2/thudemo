# S-30: kiểm camera Android ngày 10/10/2026

Revision ứng dụng đã chạy: `d423fa8d2e5143b07cd7158985776ef8ca740ce8`. Đây là kiểm local trên điện thoại vật lý với database PostgreSQL riêng và migration thật. Không phải staging, production, sandbox thanh toán hay bằng chứng hai camera quét đồng thời.

Người dùng trong phiên task trực tiếp đưa QR kiểm thử trên màn hình máy tính vào camera điện thoại và báo kết quả. Codex quan sát camera sau đang live, input ban đầu trống, kết quả UI, HTTP thật và ledger đã commit. Không đưa QR vào input, chọn ảnh hoặc gắn video giả để thay camera. Không suy ra người dùng là Quyền/Sáng hoặc chủ tài khoản GitHub đã trực tiếp kiểm.

Vé fixture PAID được phát QR ký qua endpoint owner thật. Danh tính nhân viên lấy từ phiên đăng nhập thật, nhân viên A/cửa A và nhân viên B/cửa B có phân công riêng. Một cáp USB chuyển lần lượt giữa các máy; `localhost:3050` trên Android được nối tới web/API local riêng. Các QR/ghế trong ảnh đều thuộc dữ liệu kiểm thử, không phải vé khách. Credentials, khóa riêng, serial USB và raw QR không có trong bằng chứng công khai.

## Kết quả camera

| Thiết bị             | Model / Android / Chrome thực tế | Ca kiểm                                                                                       | Kết quả                                                                                               | Implementation / bằng chứng / source SHA                                                                        |
| -------------------- | -------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Redmi Note 13 Pro 5G | 2312DRA50G / 16 / 154.0.8037.126 | Vé mới ký đúng ở A; UUID thiếu chữ ký; chữ ký sửa                                             | PASS camera kỹ thuật: một NORMAL; hai QR sai không thêm lịch sử                                       | Signer/verifier + scanner/ledger; [proof](../evidence/s30/device-d423fa8-20261010/camera-proof.json); `d423fa8` |
| Redmi Note 13        | 2404ARN45A / 16 / 154.0.8037.126 | Quét lại vé máy đầu tại B; vé mới ký đúng ở B; unsigned; tampered                             | PASS camera kỹ thuật: quét lại 409, giữ lần đầu; một NORMAL cho vé mới; hai QR sai không thêm lịch sử | Verifier + scoped grants + transaction; cùng proof và SHA                                                       |
| Redmi Note 11 4G     | Chưa đo OS/Chrome                | Người dùng dừng kiểm máy thứ ba vì máy đang phát Wi-Fi và không truy cập được trong phiên này | CHƯA KIỂM; không suy ra PASS                                                                          | Hai máy đầu là phạm vi camera đã chạy; không có yêu cầu bắt buộc ba model                                       |

Quét lại tại B hiển thị đúng **“Vé đã sử dụng — Đã vào lúc 19:19:50 10/10/2026 tại cửa A.”** HTTP 409; database giữ nguyên NORMAL đầu tiên. Vé mới tại B được commit lúc **19:35:53 10/10/2026**. Giờ hiển thị Asia/Saigon; proof lưu thời điểm database theo UTC.

Ảnh thật: [máy 1 hợp lệ](../evidence/s30/device-d423fa8-20261010/valid-1-device.png), [máy 2 quét lại](../evidence/s30/device-d423fa8-20261010/duplicate-1-device.png), [máy 2 hợp lệ](../evidence/s30/device-d423fa8-20261010/valid-2-device.png). Các ảnh còn lại và hash ảnh nằm trong proof. Đây là viewport native của điện thoại, không phải mô phỏng mobile desktop.

Observer đầu tiên phân loại sai do so khớp “Hợp lệ” phân biệt hoa/thường với UI “Vé hợp lệ”. Raw observation được giữ nguyên, không đổi thất bại thành PASS. Validator riêng kiểm thông báo thực tế, live camera, HTTP 200 với QR kỳ vọng, NORMAL đã commit và danh tính/cửa tin cậy; kết quả camera kỹ thuật PASS. Proof công khai ghi cả `rawClassifierResult: false` và giải thích này. Các ca sau sửa classifier để khớp đúng chữ của UI; không hạ assertion nghiệp vụ.

Phone 1 dùng Playwright/CDP. Trên Phone 2, kết nối Playwright toàn browser bị timeout khi chờ các tab khác; chuyển sang CDP của riêng tab `localhost:3050`. Không đóng, điều hướng hay thay đổi tab cá nhân. Không đổi viewport, giả camera, bỏ kiểm chữ ký hay thay ứng dụng để xử lý công cụ kiểm.

## Các lớp bằng chứng và gate còn lại

| Lớp                                                    | Trạng thái                                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Camera vật lý trên hai máy đầu                         | PASS bảy ca đã ghi ở trên; máy thứ ba chưa kiểm theo cập nhật của người dùng      |
| Hai API process, hai nhân viên/cửa tranh chấp database | PASS CI trên revision ứng dụng; không diễn giải thành hai camera vật lý đồng thời |
| Quá 3 giây chờ / lỗi mạng                              | PASS browser CI; chưa báo PASS kiểm sự cố vật lý trên Android trong phiên này     |
| Đọc text/icon và thao tác dưới nắng thực tế            | PASS do người dùng trực tiếp báo cáo; chi tiết nguồn bên dưới                     |
| Staging / deploy                                       | CHƯA THỰC HIỆN                                                                    |

CI ứng dụng `d423fa8`: [signed QR HTTP/browser](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/37900465341), [T-02/K-01/T-31](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/37908627668), [S-43](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/37900465301) đã completed/success khi đối chiếu ngày 10/10. T-31 giữ ghế là hồi quy chung, không phải NFR S-31.

Người dùng báo kiểm **cả hai máy lúc khoảng 12h trưa 10/10/2026, nắng trực tiếp, đọc rõ text/icon/cửa/thời điểm và bấm được**, đồng thời xác nhận màn hình là **scanner V1 bản S-30 đã sửa QR trong PR #68**. Ghi PASS theo báo cáo người thực hiện; Codex không trực tiếp quan sát điều kiện ánh sáng. Không có log tiến trình hoặc ảnh lúc trưa. Camera có telemetry ở phiên 19h được ghi riêng theo source `d423fa8`; không dựng bằng chứng camera/telemetry lúc 12h.

Commit chứa tài liệu/ảnh này cần CI và review theo head mới riêng; không đổi source SHA của phiên camera hoặc dùng CI revision cũ để tuyên bố head mới xanh. Giữ PR #68 Draft đến khi CI/review cuối đủ. Không merge S-31 #64 hoặc deploy.
