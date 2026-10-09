# S-30/S-26 acceptance evidence

Ngày 2026-10-09. Dữ liệu giả được tạo trong PostgreSQL 15440/signed_qr_integration và Redis 16388 riêng; hồi quy đầy đủ dùng container riêng 15432/sprint2_integration và Redis 16390, không reset DB task khác.

| AC/NFR                                                   | Implementation                                        | Test/evidence                           | Kết quả                                      |
| -------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------- | -------------------------------------------- |
| S-26 ký bất đối xứng, canonical, no PII                  | shared parser + ScannerCryptoService                  | crypto 13 unit + HTTP proof             | PASS local                                   |
| Sửa payload/signature, unsigned UUID, key/alg/version lạ | verifyQr server + browser verifier                    | evidence/s30/http-proof.json            | PASS local, zero history                     |
| Xoay giữ khóa cũ, restart                                | persistent private file + public ring                 | HTTP 2 API process + WebCrypto unit     | PASS local                                   |
| S-30 vé hợp lệ, seat/cửa/time sau commit                 | TicketCheckInService + ledger                         | 78 HTTP checks, 50 database races       | PASS local                                   |
| Sai QR/suất/quyền/status                                 | permission trước metadata, paid/order/seat/S33 status | HTTP 136 requests                       | PASS local                                   |
| Quá 3s đang chờ, lỗi mạng không xanh                     | check-in-request + scanner V1                         | browser-proof.json                      | cập nhật sau browser cuối                    |
| Hồi quy Orders/payment/scanner/S-33                      | module/API/consumers                                  | 224 unit, 84 integration                | PASS local                                   |
| <500ms                                                   | real HTTP loopback private DB                         | p95 28.59ms, max 53.41ms (136 requests) | PASS local; không chứng minh staging/network |
| V1 desktop/mobile, QR ảnh thật render                    | SignedTickets + TicketScanner                         | screenshots + browser proof             | cập nhật sau browser cuối                    |
| Camera thiết bị thật, ngoài trời                         | scanner camera hiện hữu                               | cần người thực hiện trên revision mới   | CHƯA KIỂM, gate merge còn mở                 |
| Staging                                                  | chưa deploy                                           | không có bằng chứng revision này        | CHƯA KIỂM                                    |

Lint/typecheck/build PASS; lint có 4 warning baseline ngoài diff. API tích hợp cuối chạy lại sau sửa QR/S-33; file proof ghi sourceSha và hash driver. Các report working-tree là local pre-publication, không dùng thay CI exact head. Workflow S-30 signed QR chạy migration/HTTP/browser thật trên DB service riêng, artifact theo head SHA; status queued/running không phải PASS.

Ảnh QR là fixture giả, không QR khách. Cookie/key file nằm ngoài Git; artifact chỉ JSON proof và PNG, không private key/session/log API. Kiểm ảnh/video fixture không phải camera thật.

## Camera / ngoài trời: bài kiểm cần hoàn tất

Trên thiết bị camera thật và ứng dụng revision cần review, nhân viên có assignment suất/cửa mở scanner trong secure context, cho phép camera, quét QR ký từ trang đơn chủ vé thật của DB test. Xác nhận seat/gate/time sau server commit; quét lại cửa khác bị từ chối; QR tampered/unsigned bị từ chối; mạng trễ >3s chờ; ngắt mạng không hợp lệ. Kiểm dưới ánh sáng ngoài trời, text/icon không chỉ màu và nút chạm. Ghi thiết bị/OS/browser, revision, điều kiện sáng, kết quả và ảnh không lộ QR/session thật. localhost desktop camera là thiết bị thật nếu có camera vật lý; mobile viewport và camera giả không được tính.

Không cung cấp endpoint tự cấp quyền/KYC/upload giấy tờ. Không lấy click “xác nhận” làm bằng chứng kiểm chủ vé cho S-31.
