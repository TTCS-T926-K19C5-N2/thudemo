# Sprint 1 — demo local và laptop staging riêng

## Bản nghiệm thu và điều kiện công bố cuối — 17/10/2026

**Toàn bộ assertion Sprint1 S01–S04/K01, T01–T10 và DoD áp dụng đã được kiểm theo nguồn; bản phần mềm được nghiệm thu là `4033da4dde1484fc777806421006f9c17e831f8b`.** Kết luận Sprint1 Done có hiệu lực khi gói công bố cuối này được thành viên khác approval, đủ required CI và merge develop, rồi xác minh CI/runtime tương thích. Trước khi đủ điều kiện công bố không tuyên bố Sprint Done. Gói này chỉ tài liệu/evidence; không thay ứng dụng, schema, lockfile, CI, protection, seed hoặc dữ liệu.

[PR99](https://github.com/TTCS-T926-K19C5-N2/thudemo/pull/99) được thuytrang158 APPROVED đúng head `e7db1fa0317ef6cc6e18864102fc17a5c20def8a`, merge02:21:39Z→`4033da4d…`; approved tree bằng merged tree. [CI tích hợp38994612232](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/38994612232) SUCCESS **225giây**. Watcher tự chờ CI, deploy02:25:33Z, backup3.903.959bytes02:26:28.986Z trước promotion02:26:59.279Z. **Merge→healthy320,279giây<600 PASS**; candidate84,15giây. Lần PR98 đạt321,303giây vẫn giữ; hai FAIL618,856/1754,310giây không bị xóa hoặc tính lại.

**Demo laptop READY:** https://10.228.54.197:3470. TLS xác minh hostname/certificate thật; CurrentUser trust đúng thumbprint `C47633C185CFE6D564B05C5C8BAACFAB72C770B0`. Owned firewall enabled Inbound Allow TCP3470, LocalAddress10.228.54.197, RemoteAddressLocalSubnet đã đọc lại PASS. PG/Redis chỉ loopback. Chưa chạy lại browser từ thiết bị thứ hai trên mạng mới; bằng chứng twopeer giữ môi trường gốc và classifier/proxy không đổi. Không yêu cầu VPS/Render/Tunnel.

| Task / Story | Hành vi và ca nghiệm thu | Kết quả / evidence có giới hạn |
|---|---|---|
| T01 / S01 | Frozen toolchain/lock, env, PG/Redis, Prisma migrate/client, web/API, dependency outage503, clone sạch/một lệnh/stop-start | PASS: clean-native, migration cycle tiến-bù-tái áp dụng, dependency-health; clone02a30migrations/lifecycle; compatibility02a→eb53→403; current HTTPS200 |
| T02 / S01 | CI build/lint/typecheck/test push+PR, parallel lint/test, whole workflow<300s, lint đỏ chặn merge, checks đúng tên/trigger | PASS: integrated403225s; PR99CI254s; negative lint gate PR95 provenance; protection5checks/strict/last-push1approval/admin/conversation giữ nguyên |
| T03 / S01 | Docker thật/staging riêng, health/smoke trước switch, lỗi giữ bản cũ, migration/backup/rollback, auto<600s | PASS: actual403320,279s; backup3903959bytes; old/failure/rollback compatible proof; source/image/keys/no-countdecrease checked |
| T04 / S02 | Users/roles/relations,5roles/emailuniqueDB, Argon2id, safe repeat seed/additive migrations | PASS: schema/hash/constraints/seed/migration proof gốc tương thích;30migrations retained |
| T05 / S02 | Login/nav, session securecookie/expiry/logout401;5sai/6th15phút account+IP, remainingtime, APIrestart/naturalTTL/twopeer, enumeration | PASS: current API/session; historical900s/restart/twopeer source compatible. Không lặp probe khóa IP hoặc rútTTL |
| T06 / S02 | Server defaultdeny/public explicit,401/403, role/multirole/nav/ownership/deniallog | PASS: current buyer/B direct API403, ownerB mobileURL403, guard/inventory/log proof gốc; không admin vượtphạmvi |
| T07 / S03 | Registration/emailnormalize/genericduplicate/validation/uncheckedconsent/versioned atomic consent | PASS: actual product02a unchanged; unit/integration/fullbrowser gốc; current activated BUYER/consent; allowlist trống theo DEC16 |
| T08 / S03 | Randomhashed24h/oneuse/concurrency/resend5h/retry/privacy/redirect, unverifieddenied; real email→activation→login | PASS: realSMTP+user nhận/kích hoạt02a, code unchanged; current403session/logout/replay401. Không nhận đã gửi mail mới; Mailpit chỉ catcher |
| T09 / S04 | Event/showtime/owner FK, historyrestrict, UTC/tz, append-only migration | PASS: migrationcycle/paidFK gốc + currentUTC/FK; không reset hoặc cascade lịch sử |
| T10 / S04 | A create/edit/draft/reload, buyerhidden/Bdenied, future/past, duplicatewarn vẫn lưu, double-submit, field recovery/VNtime/expiredsession | PASS:15fullbrowser038 compatible; current403 API+trustedTLS desktop/mobile; expected403 riêng, no unexpected runtime/console |
| K01 | PGvsRedis200same-seat research, measured conditions/latency/conflicts/errors, TTL/restart/persistence/tradeoffs/decision | PASS đầu ra PO chấp thuận DEC14/17 cho PGauthority laptop dữ liệu giả; historical timebox/mentor NOT RUN là sai lệch được nhận, không hồi tố. Không dùng T31endpoint thay K01 |
| DoD02 | Review thành viên khác đúng head | PASS PR99 thuytrang158 exacte7; gói công bố này có gate review/CI/merge riêng như điều kiện đầu trang |
| DoD03–04 | Relevant tests/new branches/coverage không giảm, fullCI | PASS original coverage/API/web proof unchanged product; watcher20ca/helper lifecycle; current integrated CI225s. Không lấy sốtest thay assertion |
| DoD05/09 | Dependency/secret, logging touchedpaths không lộ credential/PII | PASS bounded formal0bc diff + manualhelper review + current literal/runtime sweep; graph unchanged. F15 paymentlogger là lỗi nền ngoài scope, không nhận toànrepository sạch |
| DoD06 | Toàn AC trên staging | PASS technical software403 including realauto320,279s/current functionality/TLS/firewall; gói công bố phải hoàn tất điều kiện đầu trang |
| DoD07–08 | Concurrency/idempotence/cleanup/retry khi bị ảnh hưởng | PASS bounded regression compatible; S30/S31/S43 giữ riêng, T31requiredpolicy không trở thành Sprint1AC |
| DoD10 | Backlog/tasks/README/matrix/report/PR đúng mức và bảo toàn yêu cầu | PASS actual guarded sync sau PR99:15workbookstatuscells +10taskDone, backups/hash/styles/formulas/AC/SP/owner preserved. Hiệu lực SprintDone vẫn theo gate công bố đầu trang |

Ma trận `evidence/sprint1/20261017-final/acceptance-current.json` giữ đủ95mapping hai chiều (72original+23S03/onboarding), source→implementation→test→assertion→evidence→kết quả;47artifact gốc duy nhất/174tham chiếu có normalizedhash và snapshot tài liệu lịch sử riêng. Không gắn SHA mới vào test/mail/rollback cũ. `source-compatibility.json` chứng minh exact blobs không đổi; current API/browser/registration receipts và actual integration/deploy tách riêng. DEC15 đưa S03 vào Sprint1; DEC09 giữ lịch sử, không kéo S30/S31/T31 vào AC.

Backlog refined tại `../outputs/01a0d25b-70b6-7cc2-92ac-d4de7dbfadaa/Bán vé sự kiện có sơ đồ ghế (1) đã đồng bộ refinement.xlsx` đã áp candidate được kiểm bảo toàn toàn workbook: chỉ15statuscells S01/S02/S03/S04/K01,T01–T10; taskMarkdown10StatusDone theo kế hoạch đã reviewPR99. Hash/đối chiếu ở `source-status-sync.json`; backup và receipt local `.sprint1-staging/acceptance-final.json` bịignore. Không đổi AC/SP/owner/Sprint/capacity;18SP/12SP là sai lệch năng lực đã công khai, không sửa số để nhận đủ sức chứa.

Giữ nguyên signing/mail/TLS privatekey bytes và dữ liệu. Counts là kiểm không giảm, không chứng minh từngrow bấtbiến; order xuất hiện sau PR98promotion được giữ nguyên, không gán tác giả. API tests chỉ thêm fixtures riêng, không xóa lịch sử. K01 graceful restart không chứng minh chống mất điện. Không có tuyên bố production/provider/VPS hoặc all-mail-providers.

### Một lệnh demo clone sạch

Prerequisites đã kiểm: WindowsPowerShell5.1+, Git, Node24.21.0, pnpm10.15.1, DockerDesktopLinux/Compose; C12GiB, ổcheckout5GiB, RAMavailable2GiB cho fullbuild. Clone riêng và checkout revision gói bàn giao; từ root chạy:

`powershell.exe -NoProfile -File .\scripts\sprint1-demo.ps1`

Launcher chọn cổng trống (ưu tiên web3000/API3001), tạo config/secret riêng, dependency→frozen install→Prisma/client/30migrations→guardedfake seed→build/start→health/login/logoutsmoke rồi mới READY. Credentials `.sprint1-demo/config.json` ignored; Mailpit URL in cuối là catcher. Actual cleanclone02a tại D:\s1demo\02a8e86-clean-20261016 đã chạy toàn pipeline, browser registration→Mailpit→activate/finalpassword→BUYER403→organizerdraft/edit/showtime, stop/start giữ data/secret và không dừng sentinelforeign; source tương thích403. `-Action Status`, `-Action Stop`, `-Action Restart` dùng cùngentrypoint/profile; không init/reset/clean.

Staging phục hồi profile hiện hữu: `powershell.exe -NoProfile -File .\scripts\sprint1-staging.ps1 -Action Status` để kiểm rồi dùng thao tác đã tài liệu bên dưới; không gọiinit lại. Trước demo giữ nguồn/nắp mở/đúngWi-Fi; `scripts/sprint1-staging-session.ps1 -DurationSeconds 3600` tạo yêu cầu awake cóhạn, không chặn explicitSleep/lidclose/mấtmạng. IP đổi phải backup/rebindorigin/cert dùngkeyhiệnhữu, trustWindows và ownedfirewallAdmin; không tuyên bố tự động các bướcOS.

Credentials staging chỉ `.sprint1-staging/config.json`; SMTP `.sprint1-staging/registration-mail.env`; account email thử `.sprint1-staging/registration-test-account.json`. Không in secret. Kịch bản UI/API đầy đủ và recovery giữ bên dưới: health→A tạo/sửa nháp→future/past/duplicate→BURLdeny→buyer403/drafthidden→logout/expiry→khóa bằng fixturephụ (không chạy lại probe IP trong lượt này)→CI/Docker/K01/bằngchứng staging. Nếu input sai, sửa field rồi submit; không reseed/reset database để phục hồi.

## Checkpoint PR99 trước công bố cuối — lịch sử


### Trạng thái tại checkpoint — 17/10/2026, sau PR #98

**Chức năng và gate triển khai của Sprint 1 đã đạt trên source tích hợp `eb53a0657b2f1120a057e688084a69f1f518f047`; chưa gọi Sprint Done khi hồ sơ cuối và trạng thái nguồn còn chờ.** PR [#98](https://github.com/TTCS-T926-K19C5-N2/thudemo/pull/98) được thuytrang158 APPROVED đúng head `5b6d5783b34616fdd2b0c74c2614a5469ab8c996`, merge develop lúc 01:36:09Z. CI tích hợp [38991565168](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/38991565168) SUCCESS **226 giây**, đủ năm required checks. Không bypass protection.

**T03 auto-deploy PASS: 321,303 giây <600 giây**, từ merge đến healthy01:41:30.303Z; watcher tự phát hiện sau CI, candidate87,745s, backup3.902.898bytes trước promotion. Bằng chứng `evidence/sprint1/20261017-accepted/auto-deploy.json` giữ timeline/approval/CI/OCI labels. Hai lần618,856s và1754,310s vẫn FAIL trong lịch sử. Không trừ sleep, dùng deploy thủ công hoặc đổi ngưỡng.

URL hiện tại **https://10.228.54.197:3470**. HTTPS đã trust trên laptop, desktop/mobile browser và API thật PASS; chứng chỉ đổi SAN theo IP mới, giữ private key, dữ liệu và signing/mail keys. **Firewall PASS readback:** đúng rule thuộc phiên, enabled Inbound Allow, LocalAddress10.228.54.197, TCP3470/LocalSubnet được giữ nguyên sau cập nhật Administrator. Lỗi Access is denied5 trước đó giữ lịch sử; không dùng cấu hình rule thay bằng chứng browser từ thiết bị thứ hai. Xem `network-current.json`.

| Task / Story | Hành vi phải đạt và ca đã kiểm | Kết quả / bằng chứng áp dụng | Phần còn chờ |
|---|---|---|---|
| T01 / S01 | Toolchain/lockfile, env, PG/Redis, migrate/client, startup/health thật; dependency hỏng→503; clone sạch một lệnh và stop/start giữ dữ liệu | PASS: clean-native/migration-cycle/dependency-health; full clone02a + lifecycle, source compatibility02a→038→eb53; current HTTPS200 | Không chạy lại build nặng vì source demo/app/lock không đổi; prerequisites phải đủ |
| T02 / S01 | Build/lint/typecheck/test, CI<300s, required checks/review, lint đỏ chặn merge | PASS: integratedeb53 CI226s; negative gate PR95 giữ SHA/fixture; protection5checks vẫn bật | Hồ sơ closeout PR phải có checks/review riêng |
| T03 / S01 | Docker/staging, smoke trước switch, deploy lỗi giữ bản cũ, migration/backup/rollback, merge→healthy<600s | PASS assertion gốc: real321,303s, backup+compatible rollback; auto-deploy.json | TLS/current owned firewall readback PASS; không có thử thiết bị thứ hai mới; không cần VPS |
| T04 / S02 | Users/5roles, DB emailunique, Argon2id, guarded seed/additive migrations | PASS: schema/constraint/hash/seed evidence gốc + source compatibility;30migrations | Không reset, không đổi khóa/historical rows |
| T05 / S02 | Login/role landing, cookie/expiry/logout401;5sai/6th900s account+IP, restart/naturalTTL/twopeer | PASS: current API/session + evidence TTL/restart/twopeer lịch sử tương thích | Không chạy lại probe khóa IP; không nhận twopeer đã chạy trên mạng mới |
| T06 / S02 | Global default deny;401/403; role/multirole/nav/log; A/B ownership server | PASS: current buyer/B API403, B URL desktop/mobile, guard/inventory/log gốc | Không tạo admin vượt phạm vi |
| T07 / S03 | Email đăng ký/normalize/duplicate generic, validation giữ input, consent không chọn sẵn và versioned atomic record | PASS: implementation02a không đổi; API/unit/integration/browser gốc + activated BUYER/consent current | Allowlist trống cho mọi email hợp lệ theo DEC16 |
| T08 / S03 | Token hash24h/one-use, concurrency, resend/rate limit/outbox/privacy; gửi/nhận/kích hoạt Internet email | PASS: SMTP+user nhận/kích hoạt trên02a; source tương thích; current login/logout/replay401 | Không nhận đã gửi thư mới trêneb53; Mailpit chỉ catcher |
| T09 / S04 | Event/showtime/owner FK, UTC, additive migration, Restrict khi có lịch sử đơn/vé | PASS: migration/paidFK gốc + current UTC/FK; api-current-network | Không thêm xóa sự kiện hoặc cascade lịch sử |
| T10 / S04 | A tạo nháp/sửa/reload, buyerhidden, Bdenied, tương lai/quá khứ, trùng cảnh báo vẫn lưu, double-submit, field recovery/VN time | PASS:15 full browser cases038 tương thích; current API + desktop/mobile/newTLS smoke | Bounded browser smoke mới không thay provenance15ca cũ |
| K01 | PG/Redis same-seat research, số đo/điều kiện, conflict/TTL/restart/durability/tradeoff/quyết định | PASS đầu ra được PO nhận DEC14/17, PostgreSQL authority staging dữ liệu giả | Historical timebox1ngày/mentor NOT RUN, sai lệch được nhận công khai; không lấy T31 endpoint làm AC K01 |
| DoD02 review | Thành viên khác review đúng bản cuối | PASS PR98 exact head thuytrang158 | Closeout docs cần review riêng |
| DoD03–04 tests/CI | Branch/coverage không giảm; build/lint/typecheck/test | PASS evidence coverage/touched-source compatibility; watcher20ca/helper lifecycle; eb53 CI226s | Không lấy tổng test thay assertion |
| DoD05/09 security/logs | Dependency/secret, denial logging, touched-path không lộ credential/PII | PASS bounded scan0bc + manual helper review; current log/literal sweep/dependency graph unchanged | F15 payment logger là lỗi nền ngoài scope, task riêng; không nhận whole-repo sạch |
| DoD06 staging | Toàn AC Sprint1 trên staging | PASS technical overlay; T03 đã đạt thật | TLS/current owned firewall đã readback PASS; không gắn nhãn twopeer cũ thành lần chạy mới |
| DoD07–08 regression | Concurrency/idempotence/cleanup trong phần ảnh hưởng | PASS bounded regression tương thích; PR98 S30/S31/S43 green | Không nghiệm thu S30/S31/T31/S43 như Sprint1 |
| DoD10 docs/status | Task/backlog/README/matrix/report/PR nhất quán | BLOCKED: closeout diff đang chuẩn bị; candidate workbook chỉ15 ôstatus, toàn workbook bảo toàn đã kiểm | Review/integrate hồ sơ rồi áp guarded Done vào task/workbook; chưa ghi Done sớm |

Ma trận hai chiều hiện hành: `evidence/sprint1/20261017-accepted/acceptance-current.json`,95 yêu cầu duy nhất (72điều khoản gốc +23S03/onboarding); mỗi dòng giữ nguồn, implementation, test, assertion, source/môi trường và evidence gốc. Artifact gốc được kiểm tồn tại/hash theo UTF8/BOM/CRLF policy; compatibility chỉ dùng với file thực sự không đổi. DEC15 đưa S03 vào Sprint1; DEC09 giữ lịch sử. T31 là required deployment check hiện hành, **không AC Sprint1**. Không thêm yêu cầu máy tạo tải riêng/VPS.

Một order PENDING_PAYMENT xuất hiện sau promotion01:41:58.562Z; giữ nguyên, không gán tác giả. Không giảm counts/keys, nhưng không nhận so sánh counts là bằng chứng từng row bất biến. Network rebind giữ cả active/previous API origins và private key; các API test tạo fixture riêng có chủ đích.

**Handoff:** demo staging trên laptop Có; rule LAN mới đã xác minh TCP3470/LocalSubnet. Credentials chỉ tại `.sprint1-staging/config.json`, mail/env và tài khoản email thử trong file ignored tương ứng. Demo từ clone mới: `powershell.exe -NoProfile -File .\scripts\sprint1-demo.ps1`; frozen install/generate/30migrations/seed/build/health/smoke rồi mới READY. Clone sạch02a thật ở D:\s1demo\02a8e86-clean-20261016; launcher/app/lock tương thícheb53. Prerequisites WindowsPowerShell5.1+, Git, Node24.21.0, pnpm10.15.1, DockerDesktopLinux; C12GiB/checkout5GiB/RAMavailable2GiB. Web/API chọn cổng trống (ưu tiên3000/3001), Mailpit không thay Internet SMTP.

**Chưa hoàn tất toàn Sprint:** firewall thực tế đã PASS; việc còn lại là review/integrate hồ sơ và guarded task/backlog status sync. Source workbook candidate đã xác minh15status cells only, không đổi AC/SP/owner/Sprint/style/formula; chưa ghi đè nguồn. Không gọi tất cả task Done từ báo cáo local.

## Checkpoint PR96 — lịch sử, không phải trạng thái hiện hành

### Bản tích hợp tại checkpoint — 17/10/2026 sau PR96

URL **https://10.88.164.155:3470**, deployed038f8baff4c175e88c53b19a553105be15735dec, CI233sPASS. PR96thuytrang158 approved/merged; watcher tựdeploy. T03vẫnFAIL1754.310s, hostModernStandbyđến08:10ViệtNam; không trừsleep. API/browser/sessionPASS; key/data giữ nguyên. Credentials `.sprint1-staging/config.json`; tài khoản activatedemail `.sprint1-staging/registration-test-account.json`; SMTP `.sprint1-staging/registration-mail.env`. Chỉ mở file local, không chépsecret.

### Phiên staging laptop

Giữ nắp mở, máy có nguồn và đúngWi-Fi trong suốt phiên; kiểm LANIP/cert/firewall khi mạng đổi. Không tự đổi powerplan/lidpolicy. Mở PowerShell thứhai tại root và chạy yêu cầu giữ máy thức tối đa1giờ (Ctrl+C để kết thúc):

```powershell
powershell.exe -NoProfile -File .\scripts\sprint1-staging-session.ps1 -DurationSeconds 3600
```

Helper chỉ chặn idle sleep theo [Windows SetThreadExecutionState](https://learn.microsoft.com/windows/win32/api/winbase/nf-winbase-setthreadexecutionstate); không ngăn explicitSleep/đóngnắp, không mở firewall và không chứng minhREADY. Hết hạn tựclear; process kết thúc cũng kết thúc yêu cầu của thread. Journal `.sprint1-staging/awake-session.jsonl` không chứasecret. Không cần Administrator. Không dùngawaymode hoặc khóa màn hình để thay phiênmáy thức. Nếu host ngủ/mất mạng, gate600s phải giữFAIL và đo trên merge đượcreview tiếp theo; không sửa timestamp/redeploy tay để nhậnPASS.

Kiểm/khôi phục profile đã cấu hình (không tạo khóa haydatabase mới):

```powershell
node scripts/sprint1-staging.mjs status
node scripts/sprint1-staging.mjs resume
```

WatcherownedPID14424 hiện chạy từscriptđãreview; minimum90188. Không khởi tạo duplicate hoặc dừng appkhác. Lệnhstartwatcher chính thức trong checkpoint bên dưới; verifyPID/starttime/entry trướcstop. Rollback90188→02a→90188 đãkiểm thực tế, source deploy/rollback không đổi trên038; priorpointer hiện90188, backup3902634bytes đãverified trướcpromote038. Khôngxóa volume/downmigration. Nếu cầnrollback, dừng đúngwatcher trước, dùng `node scripts/sprint1-staging.mjs rollback`, health/smoke vàrestorebảncuối; không đểwatcherđấu vớirollback.

Clone demo sạch đãPASS tại `D:/s1demo/02a8e86-clean-20261016`: WindowsPowerShell5.1/Node24.21.0/pnpm10.15.1/DockerDesktopLinux; C>=12GiB, checkout>=5GiB, RAMavailable>=2GiBcho build. Từclone riêng chạy `powershell.exe -NoProfile -File .\scripts\sprint1-demo.ps1`; chọnporttrống, frozeninstall/migrate/seed/build/health/smoke. Credentials `.sprint1-demo/config.json`; Mailpitloopback chỉmailcatcher. Trìnhduyệt đãkiểm register→catcher→activate(finalpassword)→loginBUYER403→organizerdraft/edit/showtime; stop/startgiữdata/keys. Blobapp/launcher không đổi trên038 nên không copyartifact/env/DBtừprofilekhác để kiểm lại.

## Hồ sơ thao tác/checkpoint cũ (đọc trạng thái ở trên trước)

## Checkpoint mạng và nghiệm thu mới nhất — 2026-10-16T16:12:49.189416+00:00

URL hiện tại **https://10.88.164.155:3470**, candidate thủ công **02a8e86a6fea05a49bd27902c08652920e444a10**. Người dùng xác nhận chuyển lại mạng này; giữ nguyên certificate/key, cập nhật cả API origin và activation-link origin. `network-return-current.json`: HTTPS health200; firewall đã PASS: người dùng chạy Administrator, live readback đúng10.88.164.155/TCP3470/LocalSubnet/InboundAllow. Evidence email thật ở IP trước vẫn đúng thời điểm/môi trường, không đổi nhãn sang mạng mới.

`rollback-current.json`: rollback thật sang a2 với database30 migrations, smoke/health, rồi khôi phục02a; data counts/history/key bytes giữ nguyên. Old API chỉ tương thích auth/events, không có S03 activation mới. `staging-secret-sweep.json`: actual candidate API/replica/web stdout+stderr không chứa sensitive literal đã chọn; không phải chứng minh không có mọi loại leak. `smtp-product-staging.json`: user nhận/kích hoạt/login, server xác minh BUYER/consent/consumed tokens và login/logout/replay401 PASS.

Chưa Sprint Done: exact02a clean clone đã full frozen install/generate/30migrations/seed/build/READY và browser6assertions/lifecycle PASS ở profile19b; các lần RAMguard từ chối trước đó giữ lịch sử. Review người thật, merge develop, CI integrated và watcher auto-deploy <10phút vẫn chưa thực hiện.

## Lịch sử vận hành16/10 — IP10.112 và candidate02a (đã thay bởi checkpoint đầu trang)

URL staging hiện tại: **https://10.112.63.197:3470**. IP10.88.164.155 trong checkpoint cũ đã hết gán trên laptop. User chấp thuận chuyển mạng; đã đổi chứng chỉ SAN với **cùng khóa TLS**, giữ cert cũ/private backup, scanner/ticket/proxy/DB key và credentials. Hai API activea2 được tạo lại từ cùng image digest, chỉ đổi WEB_ORIGIN; DBcounts giữ6606users/44events/55showtimes/0orders/0tickets/29migrations trước candidate upgrade. Rule firewall đọc lại đúng TCP3470/LocalSubnet/IPmới sau user chạyadmin; CurrentUser Root đã trust cert mới. FingerprintSHA256 `1C:1A:1E:67:61:05:37:B8:A1:7E:F9:42:D1:C7:2A:F5:39:5F:50:46:D3:1D:05:D8:5E:07:85:E4:4F:3A:93:3F`. Máy khác cần import **chỉ cert public mới**; không copy privatekey/config.

Candidateapp02a8e86 đã build/READY trên clone riêng, browserdesktop/mobile17cases+5fullflows và stop/start cùngprofile PASS; filecredentials vẫn `.sprint1-demo/config.json`. Tạm dừng đúng profile clone để dành tài nguyên buildstaging, dữ liệu/secret giữ nguyên. Sau khi rảnh có thể `powershell.exe -NoProfile -File scripts\sprint1-demo.ps1` tại clone, Start reuse source khôngđổi vẫn health/login/logoutsmoke và RAMguard512MiB. Fullbuild vẫn cần2GiB, không bỏguard.

SMTP staging cho mọi emailhợp lệ khi allowlist trống; riêng bài kiểm chỉ gửi tới REGISTRATION_TEST_EMAIL đã được user chọn. Khi mở link kích hoạt, **đặt mật khẩu cuối cùng** rồi đăng nhập. Token trongfragment không chép vào chat/log. Registration/resend có caller30/hour trướcshared120/hour, resend5/hour/email. SameNAT/IP cùngbudget; đó là limit, không allowlist.

Chuyển Wi-Fi về sau: xác minh IP gán thực tế, chuẩn bị cert mới dùngkeyhiệnhữu+backup config, cập nhậtorigin của release cókiểmhealth/data/keyhash. OfficialOScommand `powershell.exe -NoProfile -File scripts\sprint1-staging-access.ps1 -ConfigureFirewall -UpdateOwnedFirewallAddress` cầnAdministrator, từ chối rulekhác/TCPport/RemoteAddresspolicykhác. Trustcert dùng-TrustCertificate theođúngprofile. Không gọiinit lại vì init tạoidentity/profilemới.

Historicalpreviousaccf còn containernhưng image digest gốc không còn trong localcatalog; không dùng tagkhác giảthayảnh gốc. Giữ container/data nguyên. Candidate mới saupromote phải dùng activea2 đãkiểm làmrollback và kiểmrollbackthật. `network-change.json` ghi giới hạn. Không nhận metadataimage haybackupfile là bằng chứngrollback.

Candidate02a đangdeploy quaDocker saubackup/compatibilityreview; đọcStatus choSHAthực tế. Đây là **manualcandidate rehearsal**, chưa phải merge→autodeploy<10phút. Review thànhviênkhác/CI cuối/developmerge/watcher/integratedAC vẫn riêng. K01 đầu ra+PGauthority đượcPOchấp thuận với sai lệchtimebox/mentor theoDEC17, không giả bằngchứng quákhứ.


> **Scope mới DEC15:** S03/T07/T08 đã được user đưa vào Sprint1; thêm clone sạch/một lệnh đầy đủ. Các kết quả cũ bên dưới chỉ phủ phạm vi trước; S03/onboarding đang review, chưa PASS. `evidence/sprint1/20261016-s03-onboarding/scope-and-plan.json` là ledger khởi đầu, sẽ mở rộng từng AC/NFR/DoD.

Snapshot CI hiện hành **c7bb13c**: [run38887699819](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/38887699819) đủ5required contexts, **209s**. Source/runtime không đổi; head tài liệu sau snapshot phải kiểm CI riêng trước merge.

## Cập nhật xác nhận PO — DEC-14, 16/10/2026

PostgreSQL authority cho **laptop staging dữ liệu giả đã được Nguyễn Văn Sáng (PO) chấp thuận trực tiếp** sau gói K01; DEC14/k01-approval.json giữ nguyên văn và ngữ cảnh. Đây không còn blocker “chưa quyết định staging authority”. K01-D timebox/mentor vẫn NOT RUN; DoD02 vẫn BLOCKED: user nhận review nhưng PR author và authenticated account đều sangnguyencoder, chưa có approval thành viên khác. Không giả review hoặc suy phê duyệt PO thành miễn quy trình. Các đoạn checkpoint trước dưới đây giữ trạng thái tại thời điểm cũ; trạng thái hiện hành phải đọc cùng cập nhật này.

> Đối chiếu toàn bộ task/DoD và tính hợp lệ evidence hiện hành: [bảng đầy đủ trong báo cáo](SPRINT1_REVIEW_REPORT.md), [ma trận hai chiều](SPRINT1_ACCEPTANCE_MATRIX.md). Task nguồn/backlog refined: **In progress**, không phải Done. K01 mentor/timebox chưa có proof; không kéo T31/S30 vào AC Sprint1.


**Cập nhật16/10:** source sản phẩm **a2e5f675a371e9a0200b1ab7d2a83ac837d3717d**, web và hai API chạy Docker. Profile đã phục hồi sau ổ C đầy; chỉ READY sau Status kiểm home/health200. Chưa Sprint Done: member review/K01 process evidence và postmerge auto-deploy (authority đã duyệt DEC14) là gate riêng. HTTPS2 đăng nhậpAPI thật đo233.14/223.16ms allp95 đạt trong hai lượt cùng laptop; HTTP1.1 cùng phương pháp737.97ms FAIL, không dùng demo chức năng thay nghiệm thu tải.

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

Benchmark endpoint trong mục này là kiểm liên quan/Sprint2 theoủyquyền, không là AC K01/Sprint1. S30 lỗi nền đã được so matchedbase/head; không phát triển QR trong runbookSprint1.

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
- Thànhviên khác trực tiếp review PR91 headcuối; AI scan chỉ hỗ trợ. Full/prod audit hiện0. Develop đã protected, negative lintPR95 bịBLOCKED/đóngunmerged; giữ5requiredchecks và humanreview. Chưa merge khi review/K01 hoặc requiredcheck chưa đạt.
- Sau tíchhợp develop được phêduyệt, kiểm CI exactmergeSHA, watcher/timeline auto-deploy<10phút, failedcheckno-deploy, failure-retains-old/rollback thực; không gọi manualdeploy là auto.
- K01 cần comparison200/cùng1ghế và quyết định/review. T31/endpoint300ms là phép kiểm story khác, đã tách khỏi nghiệm thuSprint1; không miễnNFR hoặc nhậnSprint2Done.
- K01 đã bổ sung comparison trong `H/k01-laptop-research`: PG15 và Redis7-AOF trên profile riêng15456/16406,2researchprocess; Redis graceful restart giữ owner khi AOF bật, khác phép đo không persistence trước đó. Đây không là endpoint/TLS/LAN-client benchmark; cần người thật review kiến trúc/điều kiện đo, không tự chấp thuận staging authority. Giữ container/volume nghiên cứu riêng, không chạy script K01 cũ vì nó restart tên container của profile khác.
- Không provider/payment/email/Cloudflare/production trong phiênnày. MoMoconfig giả disabledendpoint chỉ để productionstartup. Nếu health503, đọcprivatelog/dependencies; không tắtguard/verifier.

## Checkpoint S03/onboarding16/10 — candidate chưa tích hợp

Phạm vi hiện hành DEC15 gồm S01–S04/K01, T01–T10. Đối chiếu bổ sung atomic: `evidence/sprint1/20261016-s03-onboarding/traceability-s03.json`; source bytes và Git blob được ghi tại `source-manifest.json`. Không thay kết quả lịch sử bằng head mới. Staging3470 vẫn a2e5f67, chưa có S03 mới.

- Đã sửa phần đăng ký cũ không có form/delivery/consent: API/form V1, exact approved notice, consent atomic, pending BUYER/Argon2id, token hash + outbox mã hóa, kích hoạt một lần, resend Redis5/h, SMTP adapter và Mailpit. Không ghi token vào log.
- Local: build PASS; unit API358/web123/Node18; focused real-PG/Redis13cases; browser17assertions desktop1440/mobile390 PASS qua SMTP catcher. Đây chưa là nghiệm thu staging hoặc email Internet.
- Sửa phát hiện khi kiểm: tiêu đề và hướng dẫn kích hoạt bị CSS login ẩn trên mobile; final-attempt crashed lease mắc SENDING; test key file từ ignored .env xung đột key pair fixture; lockfile churn đã thu gọn23dòng, semantic assertion giữ nguyên toàn bộ graph cũ và frozen install PASS. Audit full0advisory.
- SMTP TLS/auth PASS; allowlist được điền nhưng giá trị không hợp lệ theo validation email, API400 trước mọi write/send. Chờ user sửa local; chưa có bằng chứng SMTP accepted/inbox. Không in recipient/password.
- Launcher chính thức mới đã triển khai profile riêng/cổng động/owned lifecycle/mail catcher; clone sạch/retention/ownership proof còn NOT RUN, README ghi đúng trạng thái. `-Legacy` giữ đường cũ.
- Gate còn kiểm: lỗi tải/persist consent, populated upgrade và rollback, token/PII log sweep, restart/resend persistence, coverage/security diff, clean clone, exact-head CI, review thật, merge/deploy/integrated AC. Không đánh Done các task nguồn.

### Cập nhật tiếp theo16/10 — DEC16 và kiểm thực tế

- DEC16 theo yêu cầu trực tiếp mới: allowlist SMTP là tùy chọn; bỏ/trống cho phép mọi email hợp lệ đăng ký. `REGISTRATION_TEST_EMAIL` chỉ chọn hộp thư kiểm, không hạn chế sản phẩm.
- SMTP thật đã gửi qua adapter/outbox; user xác nhận “đã nhận và kích hoạt”; DBverified/tokenconsumed/login200/logout200/replay401 đã đối chiếu. `smtp-product-local.json` ghi đúng môi trường local3490, không gán cho staging3470.
- Clone sạch ef3e4c9 đã install/generate/30migrations/seed/build/start/health/loginlogoutREADY và trả exit0; browser signup→SMTPMailpit→activate→login/RBAC→organizercreate/edit/reload/showtime PASS. Kết quả có tại `clean-clone-browser.json`; candidate sau sửa security cần kiểm lại luồng bị đổi.
- Security review phát hiện và đã sửa local hai lỗi trong `security-fixes-local.json`: chiếm trước email pending (HIGH) và không giới hạn tổng công việc SMTP (MEDIUM). Kích hoạt hiện yêu cầu người giữ liên kết đặt mật khẩu cuối cùng (có thể dùng lại mật khẩu đã chọn); liên kết GET không tự kích hoạt. Resend vẫn5/hour/email; tổng admission đăng ký+resend120/hour chia sẻRedis/replicas, trả429/TTL khi đầy. Không khôi phục allowlist bắt buộc.
- Upgrade29→30 trên DB mới có dữ liệu đã PASS, không reset/staging write. Legacy token được băm giữ owner/deadline; user/role/session/event/showtime giữ nguyên. Old API rollback còn đọc core schema nhưng không dùng lại plaintext activation links; giữ registration off nếu rollback runtime cũ, không tuyên bố downgrade S03 đầy đủ.
- Toàn Sprint chưa Done: security final/browser mới, coverage/CI exacthead, review thật, merge/deploy tự động và integrated AC còn phải hoàn tất.
