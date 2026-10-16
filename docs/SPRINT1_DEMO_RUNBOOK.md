# Sprint 1 — demo local và laptop staging riêng

**Cập nhật16/10:** source sản phẩm **a2e5f675a371e9a0200b1ab7d2a83ac837d3717d**, web và hai API chạy Docker. Profile đã phục hồi sau ổ C đầy; chỉ READY sau Status kiểm home/health200. Chưa Sprint Done: policy develop/human review/K01/NFR và postmerge auto-deploy là gate riêng. HTTPS2 đăng nhậpAPI thật đo233.14/223.16ms allp95 đạt trong hai lượt cùng laptop; HTTP1.1 cùng phương pháp737.97ms FAIL, không dùng demo chức năng thay nghiệm thu tải.

Ca hai Wi-Fi peer giữ nguyên nguồn lịch sử b52ba6a: máyWindows10.88.164.22 chạy30wrong→429; serverRedis30/PTTL610giây và laptop10.88.164.155 login/me200 đồng thời. `evidence/sprint1/20261016-two-peer/correlation.json`. Không chạy lại probe chỉ để tăng evidence. HMAC/peer classifier giữ nguyên; regression HTTP2 mới kiểm đúng TCPpeer dù caller giả attestation. Không DEL/rútTTL hoặc khóa lại peer trong lúc teamdemo.

Giữ V1 và dữ liệu giả. Worktree: `D:\Development\03_Academic\Bán vé sự kiện có sơ đồ ghế\thudemo-sprint1-gitflow-20261015`. Nhánh feature → PR #91 → develop; chưa merge/Sprint Done. Trạng thái Draft/review đọc live PR. `status` in exact source đang chạy; evidence có SHA riêng.

## 1. Laptop staging đang chạy

**Web/API proxy: https://10.88.164.155:3470**; health `/api/health`. Credentials admin/A/B/buyer/lock-test/multi-role: **`.sprint1-staging/config.json`**. Chỉ mở file local; không chép password/token/privatekey vào chat/PR.

```powershell
Set-Location -LiteralPath 'D:\Development\03_Academic\Bán vé sự kiện có sơ đồ ghế\thudemo-sprint1-gitflow-20261015'
node .\scripts\sprint1-staging.mjs status
```

Status chỉ READY sau HTTPS home/health200 với CA/hostname được xác minh. Candidate đã kiểm **a2e5f675a371e9a0200b1ab7d2a83ac837d3717d**, previousaccf832 (xem active.json/status cho source thực tế). Database15455/sprint1_staging_20261015 và Redis16405 riêng, bindloopback; gatewayLAN3470, slotAPI3471/3472, replica3475/3476 và web3473/3474 loopback. API liên lạc PG/cache qua bridge riêng, mỗiAPI10DBconnections. Không mở DB/Redis ra Wi-Fi.

**Chủ máy đã hoàn tất các bước dưới đây (xác nhận và kiểm lại 16/10):** rule TCP3470/LANIP/LocalSubnet và CurrentUser Root đúng cert; actual HTTPS15case PASS. Máy Windows thứ hai mở được trustedHTTPS theo người dùng. Giữ lệnh để tái lập cho user/máy mới; không cần chạy lại trên máy đã thiết lập:

1. PowerShell **Run as administrator**, ở đúng worktree: `powershell.exe -NoProfile -File .\scripts\sprint1-staging-access.ps1 -ConfigureFirewall`. Chỉ TCP3470/LANIP đã cấu hình/RemoteAddress LocalSubnet; không tắt firewall hay đổi profile mạng.
2. PowerShell thường: `powershell.exe -NoProfile -File .\scripts\sprint1-staging-access.ps1 -TrustCertificate`; đọc và xác nhận OS prompt. Chỉ current-user trust chứng chỉ staging, không cài privatekey.
3. Máy thành viên cùng Wi-Fi nhận **chỉ** public cert `.sprint1-staging/tls/server-cert.cer`, xác minh fingerprint rồi import vào trusted roots của đúng user/browser. Không chia sẻ server-key.pem/config.json. Mở URL LAN, home200 và login A. GuestWi-Fi/clientisolation có thể chặn ngang; ghi BLOCKED nếu vậy.

SHA256 fingerprint: `7B:43:36:26:D3:E4:E3:0C:4F:D6:66:68:A2:6F:49:CB:95:9F:08:F1:CC:07:73:EC:78:E2:8F:F4:70:8B:40:91`. Hết hạn14/11/2026 15:44:28UTC. Cert SAN IP10.88.164.155; DHCP đổi IP cần cấu hình/cert/WEB_ORIGIN được kiểm lại; không bỏ kiểm TLS. Cloudflare Tunnel chưa triển khai.

Khôi phục **một lệnh** trên máy đã init profile và có Git/Node24.21.0/pnpm10.15.1/DockerDesktop đang chạy:

```powershell
node .\scripts\sprint1-staging.mjs resume
```

Resume chỉ start container có label đúng phiên, đúng SHA và port; giữ volume/khóa/credential, không cài lại hoặc seed. Nếu cần build một revision mới, kiểm C còn ít nhất12GiB và D còn5GiB; script từ chối thiếu dung lượng trước build. Không dọn cache/volume hoặc dừng app khác để lách lỗi. Build/redeploy:

```powershell
node .\scripts\sprint1-staging.mjs deploy --sha <exact-40-character-commit-SHA>
```

Script guardđúng profile/port/label/PID, start dependencies, archive source sạch vào shortpath có markerfullSHA, frozeninstall/generate/backup/migrate/guardedseed/build/Dockerweb+2API, smoke cảAPI rồi chuyểntraffic; READY sau HTTPS smoke. Backup stream riêng có archive validation, không giới hạn1MiB. Private logs/backups ở `.sprint1-staging/`; không xóa volume hoặc đổi khóa. Nếu lầnđầu profile chưa tồn tại: `node .\scripts\sprint1-staging.mjs init --lan 10.88.164.155`, rồi `prepare-ticket-key`; init không ghiđè config/khóa hiện hữu. Không dùng init để chữa lỗi profile đang có.

Nếu commit mới có migration: auto-deploy từ chối. Đọc SQL, kiểm compatibility bản cũ, backup và dữ liệu (đặc biệt unique ticket order-seat), rồi mới manual `deploy --sha <newSHA> --reviewed-migrations-from <exact-activeSHA>`. Flag là operator acknowledgement kỹ thuật, không thay humanPRreview. Không migrate-down/reset. Khóa QR ticket riêng được giữ tại `.sprint1-staging/ticket-signing.der.b64`; `prepare-ticket-key` chạy lại giữ nguyên khóa.

Rollback mới đã kiểm thực tế a2e5f67→accf832→a2e5f67, số users/events/orders/tickets/migrations và hashkhóa giữ nguyên; C/rollback-final.json. Previousslotaccf832 được start lại và smoke sau ca candidatefailure. Tra `previous.json` trước khi thao tác:

```powershell
node .\scripts\sprint1-staging.mjs rollback
node .\scripts\sprint1-staging.mjs status
```

Smoke previous trước switch; không đảo migration/khóa/xóa dữ liệu. `previous.json` sau rollback trỏ bản vừa rời, cho phép chuyển lại bằng rollback lần nữa sau smoke. Chỉ dùng khi chủ động kiểm staging, không giữa buổi demo. `deploy --sha <activeSHA> --exercise-failure` kiểm candidate sai attestation, active giữ200; không phá main/CI. `stop` chỉ dừng process/container app thuộc profile, giữ dependencies/volume/history. `recover-lock` chỉ khi PID/creationtime chứng minh owner đã thoát, không xóa lock bằng tay.

Watcher mỗi phút fetch develop, chỉ deploy khi minimumsourceSHA là ancestor và **mọi** check đúngSHA success; corebuild/lint/test phải có, không chấp nhận truncated response/app giả. Hiện BLOCKED develop chưa chứa fix; không tự merge khi thiếu review/policy/NFR. Manual267.435s không là bằng chứng AC merge→auto-deploy<10phút. Bật watcher: `powershell.exe -NoProfile -File .\scripts\sprint1-staging-access.ps1 -StartWatcher -MinimumSourceSha <approved40hexSHA>`; guard từ chối instance thứhai. File watcher-process.json lưuPID/starttime; xem watcher.jsonl để biết vì sao chưa deploy. ControlledwatchOnce10mode với childsentinel đã kiểm red/missing/pending khôngdeploy, không là live postmerge proof.

## 2. Kịch bản demo

Dùng profile trình duyệt riêng cho A, B và buyer. Trên staging luôn dùng cùng `https://10.88.164.155:3470`; cookie theo hostname, không đổi sang localhost/127.0.0.1 giữa phiên.

| Bước                   | Thao tác và dữ liệu                                                                                          | Kết quả mong đợi                                                         | Cách phục hồi                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| 1. Health              | Chạy Status, mở hai URL health ở trên                                                                        | READY, HTTP 200, status ok                                               | Mở Docker, đọc log private, chờ dependency healthy; không sửa dữ liệu                                       |
| 2. Login A             | Mở `/login`, dùng organizer-a từ config                                                                      | Vào `/events`, thấy quản lý sự kiện, không thấy mục kế toán              | Nhập lại từ config; không dùng lock-test                                                                    |
| 3. Tạo draft           | `/events/new`; thử submit trống, rồi nhập tên `Demo Sprint 1 <giờ>`, mô tả `Dữ liệu giả`, địa điểm `Phòng A` | Lỗi ngay trường sai; tạo đúng một sự kiện nháp                           | Sửa trường báo lỗi rồi lưu; tránh reload khi chưa lưu                                                       |
| 4. Sửa và reload       | Đổi địa điểm thành `Phòng A đã sửa`, lưu rồi reload                                                          | Dữ liệu đã sửa còn nguyên                                                | Mở lại sự kiện của A từ danh sách, không sửa DB bằng tay                                                    |
| 5. Suất tương lai      | Chọn ngày mai 19:30 hoặc nút +24 giờ                                                                         | Lưu một suất gắn đúng sự kiện; hiển thị giờ Việt Nam                     | Nhập lại ngày tương lai hợp lệ; không cần xóa suất đã lưu                                                   |
| 6. Quá khứ             | Nhập 01/01/2020 10:00, thêm suất                                                                             | Lỗi rõ thời điểm phải ở tương lai; không tạo record; input còn           | Đổi sang tương lai rồi lưu                                                                                  |
| 7. Trùng giờ           | Nhập lại chính xác ngày/giờ bước 5                                                                           | Cảnh báo nhưng vẫn lưu; có hai suất cùng thời điểm                       | Đây là AC mong đợi, không sửa thành unique constraint                                                       |
| 8. Ownership B         | Login B ở profile khác, paste `/events/<idA>`; gọi manage/PATCH bằng phiên B                                 | API 403, UI báo không có quyền, không hiện dữ liệu A                     | Quay về danh sách của B; không nâng quyền để vượt                                                           |
| 9. Buyer               | Login buyer, xem catalog công khai; gọi POST `/api/events` hoặc PATCH bằng phiên buyer                       | Không thấy draft A; API 403, có log role mismatch                        | Xác nhận đúng profile buyer; không chỉ dựa vào nút bị ẩn                                                    |
| 10. Logout             | A bấm Đăng xuất, truy cập trang/API cần phiên                                                                | Về login/401; cookie cũ không dùng lại được                              | Đăng nhập A lại; không chép token vào tài liệu                                                              |
| 11. Hết phiên          | Để form mở hơn 15 phút; nhập sửa rồi lưu                                                                     | 401 → login; cùng A đăng nhập lại → về form, khôi phục nội dung chưa lưu | Giữ cùng tab và cùng tài khoản. Đóng tab không bảo đảm giữ draft; tài khoản khác không được restore draft A |
| 12. Khóa phụ           | Sau khi lock-test hết khóa, nhập sai 5 lần, lần thứ 6 thử mật khẩu đúng                                      | 5 lần 401, lần 6 trả 429 và thời gian còn lại, khóa 15 phút              | Chờ đúng thời gian; không rút TTL hoặc DEL lock; không khóa A                                               |
| 13. Restart            | Khi lock-test đang khóa: Stop rồi Start riêng phiên app, Redis vẫn chạy                                      | Khóa còn, TTL giảm; hết 15 phút tự mở và login đúng thành công           | Không restart Redis hoặc task khác để làm mất khóa                                                          |
| 14. Trình bày evidence | Mở report, matrix và thư mục evidence                                                                        | Phân biệt source CI, local repair, prototype, endpoint, staging          | Không nói CI xanh nghĩa là Sprint Done; staging vẫn BLOCKED                                                 |

Dùng URL staging cho bước trên sau certtrust, hoặc `http://localhost:3440` cho demo local đã kiểm UI. Cả hai có credentials/DB riêng; không trộn password/cookie. Các bước UI staging và thiết bị Wi-Fi chỉ đánh PASS sau thao tác thực tế. Chỉ tài khoản `lock-test` bị khóa kiểm; chờ15phút thật, không DEL/rútTTL. Các account khác dùng demo bình thường; budget IP30fail/15phút nên tránh chạy bài brute-force trong buổi team demo cùng peer.

## 3. Demo local dự phòng

```powershell
powershell.exe -NoProfile -File .\scripts\sprint1-demo.ps1 -Action Status
powershell.exe -NoProfile -File .\scripts\sprint1-demo.ps1
```

Web3440/API3441, PG15445/Redis16395, credentials `.sprint1-local/config.json`, config root.env ignored. Mặc định build/start kiểmREADY. Stopchỉphiênnày: `-Action Stop`. Không đụng3300/3301/S32,3400/3401/demo cũ. Đổi source phải stop/build/start thuộc profile này; không build đè `.next` của server đang chạy. Giữ AUTH_PROXY_SECRET server-only≥32; localcustomentry sở hữupeer. Staging dùng TLSgateway riêng sở hữupeer rồi loopbackNext; không đưa bareNext ra LAN.

## 4. Chạy lại kiểm thử có chủ đích

```powershell
$sprint1Run = Get-Date -Format 'yyyyMMdd-HHmmss'
node .\scripts\verify-sprint1-staging.mjs --wait-natural-expiry --skip-peer-probe --output "evidence/sprint1/$sprint1Run/api"
node .\scripts\verify-sprint1-load-laptop.mjs --cold-api --output "evidence/sprint1/$sprint1Run/load-h2"
$env:SPRINT1_EVIDENCE_DIR = "evidence/sprint1/$sprint1Run/checks"
node .\scripts\sprint1-tests.mjs
```

API verifier tạo thêm fakeevent/showtime, làm hết hạn đúng session vừa cấp và restart **đúng APIstaging** để kiểm lock; không chạy lúc người khác đang demo. Browser verifier với `node .\scripts\verify-sprint1-browser.mjs --staging --output "evidence/sprint1/$sprint1Run/browser"` tạo session riêng, chỉ expire tokenHash của chính context, kiểm phiên A khác vẫn200. Dùng CA pin+rejectUnauthorized:true, không ignoreHTTPSerrors. Khóa đợi15phút thật, đọc PTTL đến khi key đã hết; TTL=0 chưa phải hết khóa. Flag skip-peer tránh lặp brute force máy thứhai; bằng chứng hai Wi-Fi peer thật đã có source riêng.

Benchmark là **endpoint sản phẩm thật quaHTTPS**,200buyers/100seats×10 trên cùng laptop, process tạo tải riêng. Wrapper chuẩn bị bundle200BUYER/1000ghế mới, loginAPI thật, rồi dùng freshTLS cho pha đo; không tính loginsetup vào hold latency và không holdwarmup. Profile/CA/privateLAN được guard; không chia sẻ bundlepassword, không reset/cleanup dữ liệu. Health/disk/source/Docker/CPU/RAM/ELU và raw2000responses được lưu; DB kiểm1000quyền giữ đúng owner. Ngưỡng300ms,200concurrent vàfsync/auth/TTL giữ nguyên. Lệnh trả exit1 khi NFRFAIL; phải đọc cả correlation.json/client.json. Không chạy benchmark đồng thời build/test/browser.

HTTPS2 các lượt cùng phương pháp đạt233.14/223.16ms, client cuối263.47ms; H1 còn737.97msFAIL. Thêm `--http1` và thư mụcoutput mới để đoH1; giữ toàn mẫu và mọi lượtFAIL. Không yêu cầu máy tải riêng: T31AC,product§7,architecture§14 không bắt buộc; vẫn ghi rõ chung phần cứng. Scriptbenchmark trực tiếp cũ dùng DB-issued sessions là phương pháp khác, giữ cả H2cold359.04FAIL. Nhiều TLSgateway thử nghiệm đã loại; hiện1gateway. Không đổi protocol/sampling hoặc dùng steady-only để tự nhận toànNFRPASS.

Test runner dùng DB15446/sprint2_integration,15450/signed_qr_integration,Redis16396; guardexacttarget+label. Có cleanupfixture của suite, không đưa dữliệu thật vào DBtest. Chạy build/test tuần tự nếu thiếu CPU; không nới assert/NFR để xanh. Evidence lưu đúngsource/môi trường và giữ lượtthấtbại.

## 5. Gate để nhóm tiếp tục

- Firewall/certtrust và actualHTTPSUI15ca đãPASS. Hai peer nguồn b52 đãPASS tại20261016-two-peer; không chạy lại IPprobe. Hiện chỉ một laptop, dùng bài tải cùngmáy/processriêng ở§4. Không yêu cầu người dùng có thêm máy.
- Thànhviên khác trực tiếp review PR91 headcuối; AI scan chỉ hỗ trợ. Full/prod audit hiện0. Develop hiện chưaprotected/rulesets; policy đề xuất trong SPRINT1_FIX_PR_DRAFT.md cần maintainer cho phép. Chưa merge khi review/policy/K01/NFR chưa đạt.
- Sau tíchhợp develop được phêduyệt, kiểm CI exactmergeSHA, watcher/timeline auto-deploy<10phút, failedcheckno-deploy, failure-retains-old/rollback thực; không gọi manualdeploy là auto.
- K01 cần stagingcomparison/điềukiệnđo/review và NFR liênquan; không miễn300ms bằngCI800ms, không nhận Sprint2Done.
- K01 đã bổ sung comparison trong `H/k01-laptop-research`: PG15 và Redis7-AOF trên profile riêng15456/16406,2researchprocess; Redis graceful restart giữ owner khi AOF bật, khác phép đo không persistence trước đó. Đây không là endpoint/TLS/LAN-client benchmark; cần người thật review kiến trúc/điều kiện đo, không tự chấp thuận staging authority. Giữ container/volume nghiên cứu riêng, không chạy script K01 cũ vì nó restart tên container của profile khác.
- Không provider/payment/email/Cloudflare/production trong phiênnày. MoMoconfig giả disabledendpoint chỉ để productionstartup. Nếu health503, đọcprivatelog/dependencies; không tắtguard/verifier.
