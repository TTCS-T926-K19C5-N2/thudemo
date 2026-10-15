# Sprint 1 — review, sửa và bàn giao hiện hành

Phạm vi DEC-09: **S-01/T-01–03, S-02/T-04–06, S-04/T-09–10 và K-01**. Giữ V1; S-03 thuộc Sprint 3. Nguồn: backlog Excel hiện hành, DoD-DoR, `../docs/{product,architecture,ui,risk-and-security,decision-log}.md`, các task và PR/commit thực tế. Không quy tác giả chỉ theo người mở PR; bảng provenance lịch sử phía dưới giữ nguồn riêng.

## Revision và môi trường

- Nhánh sửa `feature/sprint1-acceptance-20261015` → **develop**, Draft PR [#91](https://github.com/TTCS-T926-K19C5-N2/thudemo/pull/91). Người dùng cho phép commit/push/PR và staging giả; Git Flow theo chỉ đạo trực tiếp mới nhất/DEC-13. Chưa merge, không bypass protection, không giả review qua tài khoản khác.
- Baseline review ban đầu develop **07d683fcfcfd7d05c8aff1119ab6dc3c63f6e458**. Candidate đã kiểm và triển khai **864189edcba0b0c112203d8de4ebbfb189ac7148** (sau 0c1358e); CI đúng SHA gồm đủ 5 job PASS, run [38765169156](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/38765169156).
- Trong phiên, develop nhận PR #70/#92 tới **97ff91710fea7736acac5c413ab7a9d77a502212**. Tích hợp snapshot này bằng merge vào feature, giữ attribution/lịch sử; giải xung đột chỉ package/lock/Render config, giữ Next16.3.8/HMAC và thêm dependency/config QR upstream. Story mới không được nhận là nghiệm thu Sprint 1. Bản tích hợp có evidence riêng `20261015-handoff`, không gán bằng chứng 864189e cho source mới.
- WIP gốc `thudemo`, review cũ `thudemo-sprint1-review-20261015`, phiên S-32_3300/3301 và demo cũ3400/3401 được giữ nguyên. Local develop riêng3440/3441, PG15445/Redis16395. Staging riêng **https://10.88.164.155:3470**, PG15455/Redis16405. Credentials chỉ trong `.sprint1-staging/config.json` hoặc `.sprint1-local/config.json`, bị ignore; không có password trong báo cáo.
- Render đã khảo sát read-only rồi bỏ theo yêu cầu người dùng; không tạo tài nguyên. Laptop LAN thay Render; Cloudflare Tunnel giai đoạn sau.

## Kết luận theo gate

| Gate | Kết quả | Bằng chứng / ranh giới |
|---|---|---|
| Demo local | PASS | Profile riêng; API/browser15 ca trước trên develop, staging HTTPS API thật; dùng Status để xác nhận source đang chạy |
| S-01/T-01–02 candidate864189e | PASS | Frozen install sạch, migrate/generate/build/lint/typecheck/unit/integration, Docker runtime và 5job CI đúng SHA |
| S-01/T-03 toàn bộ | BLOCKED | Candidate manual đã chạy 485.989s, home/health200; failure giữ bản cũ đã kiểm; **chưa có merge→auto-deploy**, chưa chứng minh team Wi-Fi |
| S-02 local | PASS | API/browser/Redis thật; server401/403, default deny, đa vai trò, logout/replay/expiry, account/IP |
| S-02 HTTPS staging phần API | PASS | Cookie Secure/HttpOnly/Lax/900s; 5wrong→6th429, TTL900; API restart giữ khóa; spoof/case alias tính đúng peer LAN; evidence HTTPS |
| S-02 staging toàn bộ | BLOCKED | Trình duyệt chưa tin chứng chỉ và chưa kiểm hai thiết bị Wi-Fi độc lập; không dùng XFF giả thay client thứ hai |
| S-04 local | PASS | UI+API+DB draft/ownership/edit/reload/validation/double-submit/future/past/duplicate-warning/UTC→VN |
| S-04 HTTPS staging API | PASS | Draft ẩn buyer, A edit/readback, B/buyer403, future201/past400/duplicate201+warning, DBUTC/FK Restrict |
| S-04 staging UI | BLOCKED | Cần OS/browser trust + UI trên URL LAN; bằng chứng local không đổi nhãn thành staging |
| K-01 spike | PASS trong môi trường đã đo | Hai datastore, cạnh tranh/restart và DEC-12 PG authority tạm local; CI artifacts đúng SHA864189e có riêng |
| K-01 staging/NFR tổng thể | BLOCKED | Endpoint HTTPS đo thật nhưng không đạt NFR; thiếu so sánh hai datastore và điều kiện nghiệm thu staging đầy đủ |
| Endpoint NFR p95<300ms | FAIL | 2000 HTTPS calls/200buyers/100seats×10; correctness100winner/100conflict mỗi vòng; all1597.9634ms, steady613.8044ms; một API/generator cùng laptop. Không thay300 bằng800 |
| Dependency runtime | PASS | Prod audit0; Next16.3.8/sharp0.35.5/deepmerge8/mysql2_3.23.1/source-map-js1.2.2; frozen lock |
| Dependency toàn bộ/DoD row5 | FAIL | Còn high **braces3.0.3 GHSA-vfj7-8cjw-p6xm**, upstream chưa có bản vá; không ignore/waiver |
| Coverage delta/DoD row3 | PASS trong scope đo | Vitest/V8_4.1.11, baseline/config như nhau; API lines7.89→76.78%, branches2.50→87.95%; web23.94→77.52%, branches18.37→63.94%; source manifest xác định phạm vi |
| Review độc lập/DoD row2 | BLOCKED | Chưa có thành viên khác trực tiếp review SHA cuối. AI security scan và việc đăng nhập nhiều tài khoản không thay human approval |
| Sprint 1 đủ AC/DoD | Chưa | Human review, audit full, staging UI/Wi-Fi/autodeploy và K01 còn thiếu |

## Findings và sửa có bằng chứng

Các finding gốc F-01/F-02/F-03 và bước tái hiện/expected/actual/root cause/test nằm trong phần lịch sử phía dưới; bản sửa được chuyển có chọn lọc sang develop, giữ `isActive`, STAFF→check-in và không kéo S-32 từ main.

| Finding | Ảnh hưởng / tái hiện | Nguyên nhân và sửa | Regression / kết quả |
|---|---|---|---|
| F-01 IP brute-force | High; xoay email hoặc giả XFF để né account lock | Shared Redis IP counter30fail/900s, HMAC peer+timestamp+route, entry sở hữu TCPpeer; caller headers bị loại | Real TCP local+Redis, signed/stale/forged unit, HTTPS alias/spoof LAN counter PASS; client Wi-Fi thứ hai BLOCKED |
| F-02 giờ suất | High dữ liệu; máy timezone khác tạo ngày/giờ VN bị lệch | VN input+07→UTC, display Asia/Ho_Chi_Minh; invalidFeb30 bị chặn | API/DB/US-device browser VN roundtrip PASS |
| F-03 hết phiên mất form | Medium; server401 khi lưu | sessionStorage draft+owner; allowlist returnTo; restore đúng chủ một lần | Browser401→login→restore; khác chủ/malformed unit PASS |
| F-04 login alias boundary | High auth; `/api/Auth/login` tới Nest dù exact-path HMAC không chạy | Classify decode/case/trailing slash chung tại shared helper/transport/APIproxy; thiếu attestation fail closed | Unit encoded/case/stale/signatures và HTTPS `/api/Auth/LOGIN` spoof vẫn charge peer thực PASS tại864189e |
| F-05 pointer rollback | High vận hành; smoke lỗi sau switch có thể làm mất previous pointer | Snapshot/restore **cả active và previous** byte-for-byte trước cleanup | 8 Node tests gồm fault-injection promotion PASS; failure candidate runtime giữ active864189e PASS |
| F-06 lỗi truy vấn CIM | Medium vận hành; lỗi PowerShell không được coi như PID đã chết để recover lock | ErrorAction Stop và parseProcessIdentity fail closed khi exit/error | Dedicated regression PASS; không kill process chưa xác minh |
| F-07 integration tiền điều kiện | Test harness; token fixture hex64 bị guard401 | Đổi token benchmark thành base64url43 đúng contract; không sửa guard | Lượt invalid-fixture giữ riêng, không dùng đo NFR hay quy lỗi sản phẩm |

Không migration sản phẩm nào được sửa trong repair. Khi merge develop97ff, các migration upstream thêm maxTicketsPerUser/default4, ticket keyId/signature+unique order-seat, ownerEmail/transfer và ticket_logs. Đây là thay đổi tích hợp upstream; phải backup/kiểm dữ liệu trước migrate. Script tự động vẫn từ chối migration mới; manual yêu cầu đúng SHA bản cũ đã review. Khóa ký ticket mới chỉ tạo một lần ở profile staging; khóa scanner/TLS hiện hữu được giữ.

## Kiểm chứng và giới hạn

- Candidate864189e: API220/web105 unit; Node5; integration81+4; browser15 desktop/mobile; build/lint/typecheck PASS. JSON coverage có counts khác unit default do scope/config, không dùng count suy coverage. Helper timezone `.test.ts` trước đây không được discover; đã đổi `.spec.ts` và ghi đính chính, không sửa lịch sử.
- Candidate sau merge97ff: API284/web116/Node8, integration84+4 và build/lint/typecheck PASS. Lượt integration đầu FAIL do token-budget test timeout5s khi build chạy đồng thời và suite ticket mới chưa cho exactport15446; giữ gates-merge-initial.json. Sau build kết thúc và bổ sung exactport với SPRINT1_ISOLATED_TEST=true, full84+4 PASS, không nới timeout/assert. CI head tích hợp được ghi riêng ở `20261015-handoff` khi hoàn tất.
- Full audit chưa sạch; scoped fast-glob→tinyglobby không phải drop-in (glob/absolute/trailing/junction parity), nên chưa thay chỉ để xanh scan. Hướng cần quyết định: upstream patch hoặc adapter/dependency thay thế được kiểm rule parity. Gate vẫn FAIL.
- Security scan develop `b0fb0ae4-1158-4ce6-affd-34d469c95d6a`; follow-up laptop `6ad87ca3-6cdb-43aa-91d4-d577a125a862`, source19file supplementSHA99d8360e… khớp product864189e; không có residual reportable trong phạm vi scan. Compatibility follow-up có supplement riêng; không là chứng nhận toàn bộ source PR70/92 hoặc human approval.
- CI864189e artifacts K01/T31 được lưu private rồi lấy số đo sạch. Product CI p95all423.363ms/steady309.672ms, budget800ms xanh **không đạt**300ms. Staging HTTPS p95 cao hơn; không tối ưu toàn Sprint2 hoặc sửa NFR để đạt.
- TLS request nghiệm thu dùng exact CA cert + hostname và rejectUnauthorized:true; không tắt verify. Browser Chromium thực tế trả ERR_CERT_AUTHORITY_INVALID (H/browser-tls.json). OS import cert cần người dùng xác nhận; firewall tạo rule trả AccessDenied5 vì phiên không elevated. Không dùng công cụ khác né. Máy thứ hai/browser TLS còn BLOCKED.
- Watcher chạy, fetch develop nhưng **BLOCKED_develop_missing_approved_fix**, đúng fail-closed trước merge. Chưa có bằng chứng pipeline red ngăn triển khai thực tế sau merge. develop chưa protection (404 lúc kiểm); ghi vấn đề quy trình, không tự thay.
- Cấu hình MoMo là synthetic/endpoint disabled.invalid để production module startup; không thanh toán, email, provider sandbox hay worker acceptance. Issued-session `isActive` là baseline S28 limitation; repair vẫn chặn login inactive, không nhận đã giải quyết thu hồi phiên tức thời.

## Bàn giao

Runbook có lệnh start/status, địa chỉ, credentials path, trust cert/firewall đúng cổng, demo A/B/buyer/lock, rollback và cách phục hồi. Evidence theo tier: `20261015/` là lịch sử main; `20261015-gitflow/` baseline07+repair; `20261015-laptop/` deployed864 và HTTPS; `20261015-handoff/` tích hợp develop mới. Không gọi Sprint Done khi các gate còn mở. PR Draft giữ để review, chưa merge vào develop/main.

## Findings lịch sử — nguồn main, giữ để đối chiếu

# Sprint 1 — DISCOVER → REVIEW → FIX → VERIFY → DEMO HANDOFF

Ngày kiểm: **15/10/2026, giờ Việt Nam**. Đây là review và sửa local, chưa commit/push/tạo GitHub review/merge/deploy. Giao diện V1 được giữ nguyên.

## 1. Kết luận theo tầng bằng chứng

| Kết luận | Trạng thái | Ranh giới |
|---|---|---|
| Sẵn sàng demo local | **Có**, khi lệnh Status báo READY | Web `http://localhost:3400`, API `http://localhost:3401`, dữ liệu giả/database riêng; credentials trong `.sprint1-local/config.json` |
| S-01 | **BLOCKED** | Local scaffold/CI nguồn/Docker được kiểm riêng; chưa có staging tự triển khai, giữ bản cũ và rollback đúng AC |
| S-02 | **PASS local / BLOCKED staging** | Đã kiểm API/browser/Redis thật, phiên/RBAC/lock/IP; chưa chứng minh HTTPS và client IP qua edge Render |
| S-04 | **PASS local / BLOCKED staging** | Tạo/sửa/nháp/ownership/validation/suất/timezone được kiểm UI+API+DB |
| K-01 | **BLOCKED tổng thể** | So sánh hai phương án và quyết định tạm local PASS; staging/endpoint NFR chưa đủ |
| Sprint 1 đủ AC/DoD | **Chưa** | Staging, dependency audit, final remote CI, review độc lập và coverage delta còn thiếu |
| Sẵn sàng publish bản sửa | **Chưa** | Có diff/test/nội dung PR đề xuất; cần giải quyết dependency audit và các gate quy trình, sau đó xin quyền remote |

Ma trận chi tiết: [SPRINT1_ACCEPTANCE_MATRIX.md](SPRINT1_ACCEPTANCE_MATRIX.md). Kịch bản thao tác/khôi phục: [SPRINT1_DEMO_RUNBOOK.md](SPRINT1_DEMO_RUNBOOK.md).

## 2. Revision, WIP và phạm vi

- Repository gốc `D:\Development\03_Academic\Bán vé sự kiện có sơ đồ ghế\thudemo` ở `task/T-03-docker-packaging`, HEAD `88d8bfd38712f293a5794069c69cfdc3d7b8860c`, nhiều modified/untracked WIP. Không checkout/reset/clean/ghi đè tại đó.
- Fetch `origin` rồi chọn `origin/main`: **`81d1dd9d8f453b32ed0c6956399e5600f71a32d6`**, PR60 S-32 đã tích hợp. `develop` cũng tồn tại với công việc khác, không tự gom vào lần nghiệm thu này.
- Worktree sửa riêng, detached HEAD: `D:\Development\03_Academic\Bán vé sự kiện có sơ đồ ghế\thudemo-sprint1-review-20261015`. App-managed create_worktree trả `Not a git repository` do chat ở thư mục cha; sau đó dùng `git -C thudemo worktree add --detach ... origin/main`, thành công. Không có policy rejection hay thao tác bị cấm được né tránh.
- Source nghiệm thu là SHA trên **cộng diff local chưa commit**. `source-manifest.json` và `repair.patch` trong evidence xác định file/hash; SHA main một mình không đại diện cho bản sửa.
- Giữ phiên S-32 đang chạy tại3300/3301, PostgreSQL15432, Redis16381. Phiên mới: web3400/API3401; PostgreSQL15435/database`sprint1_demo_20261015`; Redis16385; các container mang label`sprint1.review=20261015`.
- Đọc AGENTS.md, parent docs/product/architecture/UI/security/decision-log, T01/02/03/04/05/06/09/10, backlog workbook hiện hành và DoD. DEC09 vẫn xếp S01/S02/S04/K01 vào Sprint1; S03/T07/T08 ở Sprint3. DEC11 chọn Render Free; DEC12 cho PostgreSQL authority tạm local. Không đổi Sprint/SP/AC/NFR/stack hay áp AfterglowV2.

## 3. Review đóng góp và lịch sử tích hợp

Owner trong task nguồn vẫn là **cả team**. Bảng này ghi metadata commit/phần thay đổi quan sát được, không quy lỗi cho người mở PR hay suy chủ tài khoản đã tự review.

| Phần | Nguồn đã đọc | Đóng góp quan sát được / kết luận |
|---|---|---|
| Scaffold T01 | `e6dacde...`, README, migrations | Commit ghi Quang Sáng Dev; scaffold gốc còn lịch sử `c6bd1ab` của Thuy Trang. Kiểm lại fresh setup hiện tại thay vì dùng kết quả30/09 làm PASS mới |
| CI T02 | PR1 commits285e9aa/470990c/32ac726; PR2 proof | Quang Sáng Dev trong metadata; PR1 OPEN nhưng nội dung đã có trên main qua tích hợp. PR2 CLOSED, cố ý sai lint, không được merge |
| Auth/events T04–06/T09–10 | PR3 f5731b9/60b800b/dd4ff55/a5df54b/993b2da; current files | Metadata Quang Sáng Dev và Nguyễn Văn Sáng; sửa mixed-case identity/activation đã giữ trên main. PR3 OPEN không đồng nghĩa main thiếu chức năng |
| Docker T03 | PR4 193d971/88d8bfd; current Dockerfile/Render profile | Quang Sáng Dev trong metadata; main có profile tích hợp mới hơn. Không merge PR cũ để gom code |
| K01 thành viên | PR29, `docs/k01-seat-holding-report.md`, `k01-benchmark.ts` | Metadata Tien và merge của tài khoản tương ứng. Report đo Redis200/1, p95~5.243ms ở datastore client, chưa đo PostgreSQL; đề xuất Redis+PG không tự đủ AC so sánh hai cách |
| Tích hợp hiện hành | PR39→`bae2771...`; PR60→sourceSHA | PR39 có APPROVED metadata nhưng `SPRINT2_MAIN_INTEGRATION.md` ghi review kỹ thuật tự động qua tài khoản được ủy quyền. Không biến thành review độc lập của người thật |

PR1/3/4 không phải ancestor nguyên vẹn sau squash/tích hợp; đã so nội dung main và các commit/file tương ứng. Raw metadata read-only ở evidence/pr-*.json. Không đề nghị merge lại PR29 chứa cả implementation các sprint sau.

## 4. Findings ban đầu và cách sửa

| ID / mức ảnh hưởng | File/route, tái hiện, expected → actual | Nguyên nhân và sửa | Regression/evidence |
|---|---|---|---|
| F01 — cao, thiếu NFR chống dò IP | POST `/auth/login`: đổi email mỗi lần từ cùng IP; expected giới hạn IP+tài khoản → baseline chỉ có account Redis lock | AuthService không nhận transport peer, RedisService không có IP budget. Thêm budget30 lần sai/900s độc lập tài khoản; key hash, Redis shared/TTL, account5+15phút giữ nguyên | A/P; integration IP real Redis; fake XFF không thay IP; peer khác vẫn login200 |
| F02 — trung bình, sai giờ suất | Browser timezone Mỹ nhập `2099-01-01T00:30`; expected00:30VN→17:30Z ngày trước → baseline lấy timezone trình duyệt và formatter thiếu timeZone | Thêm helper input VN+07:00→UTC, presets theo VN, formatter Asia/Ho_Chi_Minh; ghi label giờ Việt Nam. Schema đã Timestamptz nên không migration | Unit qua mốc ngày; UI US timezone + DB exact UTC + reload + mobile |
| F03 — trung bình, phiên hết hạn làm kẹt form | Mở editor, hết hạn session rồi Save; expected401→login có recovery → baseline generic lỗi, không hướng dẫn quay lại đúng form | Xử lý401; sessionStorage chỉ giữ nội dung sự kiện/startTime/userId theo tab, restore một lần cho cùng user; allowlist returnTo `/events/new` hoặc UUID; login copy theo sự kiện | Browser expire session thật→login→return→draft restored→save; logout/replay401; không lưu credential/token |
| F04 — trung bình, phát hiện trong bản sửa đầu | API lấy socket peer sau Next proxy:30 lần sai có thể khóa mọi browser user qua cùng web peer | Security scan đầu xác nhận dataflow. Custom HTTP web entry sở hữu TCP peer và ghi đè header caller; HMAC SHA256 server-only ký peer+timestamp+POST/path; proxy/API verify30s/timing-safe; missing/forged proxy metadata fail closed | Real TCP127.0.0.4→web→API→Redis429, peer127.0.0.5 login200; caller gửi cả signed header khác vẫn bị overwrite; directAPI forged403; unit expiry/signature |
| F05 — trung bình, demo không tái lập | Script cũ hardcode profile/ports; native stderr PowerShell5 bị coi lỗi; process-state JSON array xử lý sai; inherited DB/RedisURL có thể đổi target | Script mới kiểm port/containerlabel, exact .env/db/cache trước migration, override isolated DB và bỏ RedisURL inherited, đúng PowerShell5 native exit; stop chỉ launcher/path/creation time và cây con sở hữu | Full Start→READY/Stop/Start/Status; wrong-target guards; dependency outage recovery |
| F06 — trung bình, Docker chỉ build chưa đủ | Custom entry trên host chạy nhưng image standalone thiếu shared rồi thiếu Next custom-server runtime; webcontainer exited | Build web production deployment có đủ dependency + .next, loại cache/standalone duplicate; runtime nonroot, root private files excluded. Cập nhật Render entrypath | Docker build **và chạy**, health/home/proxy/login; không dùng image build làm staging proof |

Các lỗi nền sau không bị che giấu hay tự triển khai thành sprint mới:

- **D01 dependency DoD FAIL:** `pnpm audit --prod --json` báo12 advisory (6high/5moderate/1low). Paths: Prisma config→deepmerge-ts/source-map-js; Prisma→mysql2; shadcnCLI→braces; Next→sharp; Next16.3.6. Đây là tín hiệu registry, chưa PoC/đánh giá khả năng khai thác từng advisory. Chưa nâng version ghim TECH01 hay sửa lockfile để tự thay quyết định. Cần lập patch dependency riêng, ưu tiên runtime Next/sharp, bỏ CLI khỏi runtime nếu phù hợp, rồi audit/test lại. `dependency-audit.json` giữ range/patched versions/source URL; không coi diff scan không có finding là dependency scan sạch.
- **D02 T03 staging BLOCKED:** Render profile vẫn `autoDeployTrigger: off`; chưa có deployment gate sau CI, smoke HTTPS, thời gian<10phút hay traffic/rollback bằng chứng. Chưa được phép upload/deploy.
- **D03 cloud IP BLOCKED:** local custom entry xác thực peer thực của web; nếu Render/edge đặt reverse proxy trước web, peer có thể là edge dùng chung. Cần contract client-IP từ edge đáng tin và kiểm chống spoof/multi-client trên staging; tuyệt đối không bật trust proxy cho header client tùy ý.
- **D04 process:** main strict ba required checks nhưng `required_pull_request_reviews=null`, `enforce_admins=false`; historical report nói một approval là trạng thái cũ. Có develop/main và nhiều PR cũ chưa đóng; không thay branching/protection trong nhiệm vụ này.
- **D05 NFR ngoài phạm vi Sprint1:** artifact current CI T31 overallp95 **368.67ms**, steadyp95 **250.65ms**, checker dùng **800ms** nên xanh. Không đạt mục tiêu300ms cho toàn mẫu, không dùng xanhCI hoặc datastore spike để nhận PASS NFR endpoint. Tách thành issue hiệu năng giữ ghế; không viết lại Sprint1 hay thay ngưỡng.

## 5. Kiểm chứng thực hiện

| Kiểm | Kết quả/bằng chứng |
|---|---|
| Fresh install/toolchain | Frozen install PASS, lockfile không đổi; Node24.21.0,pnpm10.15.1,Next16.3.6,React19.2.8,Nest12.1.0,Prisma7.10.0,Tailwind4.3.3 |
| Format/lint/typecheck/build | Prettier theo file thay đổi (không format toàn repo), project lint/typecheck/build PASS; warnings gateway có trước và pg deprecation ghi riêng |
| Unit | API183 + web55 = **238 PASS**; helper VN/HMAC/proxy negative cases có test |
| Integration | **105 PASS/13files** trên sprint2_integration15434 + **4 PASS** scanner trên signed_qr_integration15440. Không đổi hoặc bỏ assert guard scanner; chạy suite đầy đủ bằng đúng profile của nó |
| HTTP/DB |16 acceptance groups API; role/default-deny/ownership/time/FK/unique/hash/logout/expiry/realAPIrestart; supplemental admin/seed/lock checks |
| Lock thời gian thật | Lần sai1–5 là401; lần6 là429, TTL900; restartAPI còn429. Sau original900s tự hết, valid login200. Không DEL lock hoặc rút TTL để nhận kết quả |
| Browser |15 checks;1440×1000 timezone Mỹ và390×844 VN; create/edit/reload/past/duplicate/double-submit/B403/server400/recovery/expired login/loading/error/empty/focus; không runtime error/console bất ngờ; screenshot đã xem |
| Health/fresh migrations | PG stop503/restore200, Redis stop503/restore200;9-row apply/compensate/reapply bằng Prisma, DB test riêng |
| Docker | API/web builds và runtime smoke/logincookie; usernode; no `/app/.env` hoặc `.sprint1-local`; candidate fail không thay old container. Local only |
| CI | SourceSHA run38695462765 xanh; lint proof36827889536 đỏ lint, build/test xanh; currentrequired checks checked. Bản sửa chưa remoteCI |
| K01 | Exact source CI artifact bothstores200/1×3, invariant checks/restart; không chạy lại benchmark lên DB đang dùng |
| Security diff | Scan đầu phát hiệnF04; scan tiếp theo review attestation; source snapshot và packaging/script supplements phân biệt rõ trong security-review.json. Không phải human independent review |
| Secret review | Sensitive values/PEM không có trong diff/public evidence/browser JS; credential path ignored; raw logs giữ local |

**Các thất bại trong quá trình kiểm cũng được giữ:** lint purity ở Date.now preset đã sửa; tests bị ambient demo QR keys và payment mode ảnh hưởng đã tách config; scanner guard bắt wrong testport nên chuyển đúng profile; Docker missingruntime đã được sửa rồi kiểm lại. Không nới assert, không continue-on-error để tạo PASS. Các log của lần thất bại ở private .sprint1-local; final summaries ghi đúng lượt đạt sau sửa.

## 6. K-01: trạng thái hiện tại và lịch sử

1. PR29 report chỉ đo Redis client, đề xuất hybrid. Không đủ đầu ra so sánh PostgreSQL và Redis; không merge PR này chỉ vì nhãn K01.
2. Lượt04/10 trong K01_EVIDENCE có hai store, hai prototype process, overlap/expiry/fencing/restart; PG giữ quyền đã commit, Redis không persistence mất quyền. Đó là prototype local, không endpoint application.
3. DEC12 có xác nhận Nguyễn Văn Sáng: PostgreSQL authority tạm local, Redis cache/counter; không miễn staging/NFR.
4. Artifact **run38695462765, job K01/candidate-research,15/10/2026** đã đọc raw mới: PGp95 **489.41/225.51/177.61ms**, Redisp95 **58.09/35.09/30.15ms**, mỗi lượt1winner/199conflict/0errors; AMD EPYC9V45,4threads,16.77GB,Node24.21.0,2process/store,pool8/process. PG restart retains; Redis no persistence loses owner. File có chuỗi mode lịch sử “not CI”/recommendation pending; provenance thực là downloaded CI artifact, chuỗi đó không thay được runner metadata hay DEC12.
5. T31 artifact khác: productHTTP p95all368.67ms/threshold800, không nhận300ms. Không gộp benchmark K01, endpoint, local và staging.

Prototype ở `apps/api/scripts/k01`; application ở `apps/api/src/holds`. Không sửa report cũ thành đã có evidence mới từ trước. [K01_EVIDENCE.md](K01_EVIDENCE.md) có note hiện hành và giữ phần lịch sử.

## 7. Diff, ảnh hưởng và phục hồi

Thay đổi tập trung auth/Redis/proxy/entryweb, helpertimezone/editor/login, package export nội bộ, packaging/Renderenv, seed/demo/verifier/test/docs. **Không migration/schema mới, không đổi lockfile, không xóa event/order/ticket lịch sử, không thay V1 layout/CSS/primitives.** Danh sách/hash chính xác ở source-manifest.json và repair.patch; không liệt kê private credentials vào patch.

Ảnh hưởng cần reviewer lưu ý: web khởi động qua custom entry để có transport peer; thêm server-only `AUTH_PROXY_SECRET` giống nhau web/API; `WEB_PORT` tách khỏi API `PORT`; Docker dùng production package thay trace-only standalone. Plain `next start` thiếu attestation sẽ fail503 ở login. Kiểm E2E toàn bộ các module hiện có sau đổi auth/proxy, không tự nhận nghiệm thu các sprint sau.

Rollback local: `scripts/sprint1-demo.ps1 -Action Stop` chỉ dừng launcher của phiên này; giữ containers/volumes/db. Giữ bản sửa để chẩn đoán; trước khi bỏ diff phải lưu patch/source manifest. Không reset checkout gốc hoặc tự xóa volume. Nếu publish sau này, rollback code bằng reviewed revert; database hiện tại không cần rollback schema. Không đưa lại verifier/unsignedQR hay tắt guard.

## 8. Gate trước publish và staging

- Review diff + bổ sung remediation dependency, audit lại; quyết định thay version TECH01 cần trace riêng.
- Sau khi được quyền remote: commit theo attribution đúng, chạy CI ở finalSHA, người khác review thật nếu yêu cầu DoD chưa được thay; không dùng đổi GitHub account như chứng cứ độc lập.
- Bổ sung gate CI→Render, env/secret server-only, HTTPS/cookie/client-IP edge, migrations trước switch, health/smoke, failcandidate oldalive, rollback; đo thời gian và lưu URL/runSHA. Không tự bật autodeploy trong lần này.
- Chạy AC lên staging bằng dữ liệu giả, K01 stage/endpoints/NFR nguyên ngưỡng. Render Free expiry/sleep/durability/worker limit không được tự miễn.
- Coverage delta chưa đo; sourceCI có nhưng finalpatchCI chưa chạy; dependencyaudit chưa sạch. Không ghi Sprint1Done.

Nội dung PR sửa đề xuất: [SPRINT1_FIX_PR_DRAFT.md](SPRINT1_FIX_PR_DRAFT.md). Không có PR mới được tạo trong lượt này.

## DEC-13 — Git Flow/develop và staging laptop LAN (15/10/2026)

- **Nguồn quyết định:** Người dùng xác nhận trực tiếp trong phiên hoàn thiện Sprint1 ngày15/10/2026.
- **Quy trình đã duyệt:** “từ bây giờ mọi commit, push, pull, PR đều phải làm đúng quy trình git flow và dùng develop”. Feature branch từ develop, PR vào develop; không commit/push thẳng nhánh tích hợp, không bypass protection. Main giữ vai trò phát hành theo Git Flow; không tự tạo một release production trong nhiệm vụ này.
- **Host mới đã duyệt:** “Render không dùng được đổi qua phương án dùng Laptop cá nhân để triển khai Staging (tách biệt với môi trường dev) chạy thật các người trong team có thể trụy cập nếu dùng chung wifi, có thể triển khai Public Staging với Cloudflare Tunnel ở giai đoạn sau”. Thay phương án host Render trong DEC11 cho lượt này; chưa triển khai Tunnel/public.
- **Quyền ở phase hiện tại:** Người dùng đã cho phép bản sửa scoped, commit/push/DraftPR, CI, staging dữ liệu giả/migration/seed và chỉ merge sau review/gate cần thiết. Không tạo tài nguyên trả phí, không production/dữ liệu thật/reset/migration sửa lịch sử/force push.
- **Không thay:** DEC09 scope Sprint1, UI V1, DoD review thành viên khác/CI/dependency scan sạch/AC staging, TECH02 cookie Secure qua HTTPS và local HTTP chỉ localhost, DEC12 PG authority tạm local, NFR300ms và các AC rollback/thời hạn T03. Không coi laptop tự đáp ứng uptime/đồng thời/hiệu năng chỉ vì đã chọn host.
- **Bằng chứng cần thu:** revision sạch, profile staging riêng, HTTPS/cookie/HMAC peer thực, LAN từ máy thứ hai, deploy sau CI develop, thời gian<10phút, failed candidate giữ old và rollback, database backup/migration. Những mục chưa chạy phải giữ NOT RUN/BLOCKED.
