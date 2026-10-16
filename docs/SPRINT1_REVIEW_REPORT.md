# Sprint 1 — review và nghiệm thu hiện hành (16/10/2026)

**NOT DONE. Demo chức năng laptop HTTPS sẵn sàng khi Status báo READY; chưa đủ AC/DoD để merge/nghiệm thu Sprint.** Phạm vi DEC09: S01/T01–03, S02/T04–06, S04/T09–10, K01; S03 Sprint3. Giữ giao diện V1. Nguồn gốc tại thư mục cha: `docs/{product,architecture,risk-and-security,ui,decision-log}.md`, `tasks/T-01…06,T-09…10.md`, backlog và DoD-DoR. T09 là schema/FK, T10 là giao diện/API tạo và quản lý sự kiện/suất. Không tính story khác thành Sprint1.

## Revision và kết luận

- Source sản phẩm và deployed SHA: **a2e5f675a371e9a0200b1ab7d2a83ac837d3717d**; feature `feature/sprint1-acceptance-20261015`, tích hợp develop **80f7a53d752d78ea6b65da3f8c6c08ca23e78176** bằng merge, giữ nguyên attribution/lịch sử. Baseline đầu tiên07d683fc; baseline nền tảng đo delta a1aab98. Commit804f071 thêm tối ưu và regression; accf832 nhập PR38/T28 dưới dạng module nghiên cứu chưa đăng ký vào ứng dụng sản phẩm. PR91 head có thể gồm commit tài liệu/test sau source runtime; đọc live GitHub để lấy head cuối, không gọi đó là merge SHA.
- [PR91](https://github.com/TTCS-T926-K19C5-N2/thudemo/pull/91) → develop; **chưa merge, chưa có independent human approval**. Không xoay tài khoản để giả review. Gate trước merge: required CI đúng head, member review, policy chặn merge và quyết định K01 hợp lệ. Gate sau merge: exact integrated SHA CI → watcher tự deploy → HTTPS healthy dưới10phút → smoke/NFR bản tích hợp. Không dùng manual deploy thay tự triển khai.
- Staging: **https://10.88.164.155:3470**, web Docker và **hai API Docker** non-root, gateway TLS native sở hữu TCP peer; DB/cache riêng bindloopback/private bridge. Manual deploy a2e5f67 **230.018s**, backup2,960,053bytes được `pg_restore --list` xác minh trước migration. Đây không là thời gian merge→healthy.
- WIP/worktree gốc và review cũ được giữ; không reset/clean, không xóa volume/dữ liệu/khóa, không deploy Render/public/production. Sau Docker restart do ổ C đầy, chỉ profile Sprint1 được khởi động lại; các phiên cũ cần tự kiểm Status, không nhận chúng READY từ snapshot cũ.

| Phần | Kết quả hiện hành | Ranh giới |
|---|---|---|
| Local/LAN demo chức năng | PASS có điều kiện Status200 | HTTPS/UI/API/DB giả riêng; không đồng nghĩa Sprint Done |
| S01/T01 | PASS phần đã kiểm | Fresh frozen install/client/migrate, Docker start, health thật; outage mới ghi riêng theo source |
| S01/T02 | FAIL | Build/lint/typecheck/test thật đã PASS trên source; develop chưa protected/ruleset, red pipeline chưa cưỡng chế chặn merge |
| S01/T03 | BLOCKED tổng thể | Web/API Docker, candidate failure, backup và actual rollback PASS; merge→auto-deploy chỉ kiểm được sau merge hợp lệ |
| S02/T04–06 | PASS phạm vi chức năng đã kiểm | API/browser/DB/Redis thật; natural expiry đã chờ đủ900s/PTTL và login200, không suy từ mock; hai peer giữ source lịch sử riêng |
| S04/T09–10 | PASS trên a2e5f67 | Draft/ownership/validation/double-submit/showtime/timezone/FK, desktop/mobile thật |
| K01 | BLOCKED | Hai datastore đo riêng; PG authority DEC12 chỉ local; cần Lead review quyết định staging. Endpoint HTTPS2 đạt trong điều kiện đo nhưng HTTP1.1 còn FAIL |
| Sprint1 AC/DoD | Chưa | Policy, independent review, kiến trúc, ranh giới NFR và postmerge acceptance chưa đóng |

Ma trận đầy đủ62gate: [SPRINT1_ACCEPTANCE_MATRIX.md](SPRINT1_ACCEPTANCE_MATRIX.md), [gates.json](../evidence/sprint1/20261016-closeout/gates.json). Bằng chứng mới dưới `evidence/sprint1/20261016-closeout/` (C bên dưới); file lịch sử giữ source riêng, không đổi SHA cũ.

## Findings ban đầu, sửa và hồi quy

| ID / ảnh hưởng | Route/file, tái hiện và mong đợi/thực tế | Nguyên nhân / sửa | Regression và evidence |
|---|---|---|---|
| F01 High auth | Sai password xoay email/giả XFF có thể né IP budget; phải charge TCP peer thật | Shared Redis account+IP, HMAC peer/timestamp/route; alias/case/decode thống nhất; gateway ghi đè caller attestation | Hai Wi-Fi peer thật sourceb52; focused HTTP2 mới actual LAN counter+1, forged valid HMAC không đổi peer; C/h2-security.json |
| F02 High dữ liệu | Browser khác TZ tạo/sửa ngày giờ VN bị lệch; phải giữ UTC↔VN qua reload | VN input+07→timestamptz UTC, display Asia/Ho_Chi_Minh; từ chối ngày lịch không hợp lệ | C/browser-a2e5f67/results.json; API/DB time roundtrip |
| F03 Medium UI | Save gặp401 mất input; phải login và restore đúng owner | sessionStorage draft/owner, allowlist returnTo, một lần restore | Desktop/mobile, cùng owner restore, owner khác bị chặn; UI V1 giữ nguyên |
| F04 High auth | Alias `/api/Auth/LOGIN` tới API nhưng verifier exact-path không chạy | Shared login classifier giữa transport/proxy/API; thiếu/stale/forged attestation fail closed | Unit + HTTPS alias/spoof/Secure cookie/logout replay401 |
| F05 High vận hành | Smoke lỗi sau switch có thể mất previous pointer | Snapshot/restore active **và** previous byte-for-byte trước cleanup |18Node tests tổng; C/timeline.json actual failed candidate, C/rollback-final.json actuala2↔accf |
| F06 Medium vận hành | Lỗi CIM không được hiểu là PID chết rồi kill/recover nhầm | ErrorAction Stop, exact PID/starttime/entry/label; uncertain identity fail closed | Node regression + owned resume/restart, không kill phiên khác |
| F07 High dependency | Full audit high braces3.0.3 qua Next lint plugin→fast-glob→micromatch; upstream advisory không có patched version | Scoped pnpm patch bỏ đúng dependency fast-glob của plugin, thay bằng glob13/brace-expansion5 có giới hạn expansion; không audit ignore/force override | Frozen clean archive, patch directory/glob/Windowsjunction/malformed bound tests, real ESLint vẫn báo Next anchor/image; full+prod audit0 |
| F08 High correctness/NFR |200request lạnh giữ đủ10connections rồi quota lookup vay thêmconnection gây500/503/p95>10s | Reuse connection của session guard cho quota/count; single-flight giữ nguyên, không tăng vô hạn pool | Prisma ownership/release/error tests; C/performance/api-before* giữ failure; real200/100×10 không500/503 |
| F09 High auth/authority | Research Redis routes public cho caller owner/TTL và lazy DEL; không được mở cùng product PG | Bỏ đăng ký research SeatsModule khỏi AppModule; giữ source/spec/commit tác giả. Product PG module và guard vẫn chạy | Prefix hold-seats/release-expired/countdown/expired-list không reachable; AppModule real integration404. Upstream T28 vẫn dormant, chưa được nhận là product implementation an toàn |
| F10 High NFR | Windows↔Docker↔Next proxy và200TLS handshakes gây latency lớn | Private Docker network; HTTPS2 hỗ trợ200streams; bounded gateway reuse; exact canonical POST holds đi trực tiếp API nhưng giữ Nest auth/RBAC/origin/body guards; hai API×10DBconnections | Full raw2000samples mỗi run; no cache grants/no guard bypass; H2 anonymous401/organizer403/origin403/oversize413/missing404 |
| F11 Medium NFR | Known loser vẫn tạo hold_session/write rồi rollback | Additive `claim_hold_v4`: chỉ read-reject conflict đã biết, mọi grant/retry/race qua v3; không sửa migration cũ, không giảm fsync/TTL | Real DB exact rejected IDs/no partial claim/no loser session/closed+invalid precedence/original deadline; S16 lockwait observer cập nhật v4, giữ assert phải chờ khóa và expiry409 |
| F12 Medium vận hành | C hết dung lượng làm Docker/staging503; archive Windows MAX_PATH; pg_dump buffer1MiB | Disk preflight12GiB system/5GiB workspace; short ignored build path có fullSHA marker; backup exclusive stream và archive validation; resume exact release; cleanup cả candidate replicas | User giải phóng C; observed40.9GiB, backup1.67MiB hợp lệ; nguồn/data/keys giữ nguyên, runtime recovery và threshold unit tests |

Applied migration cũ không bị sửa. v4 chỉ thêm function, giữ v1–v3 để rollback code; backup trước migrate, manual compatibility acknowledgement từ630745d. Prototype Redis vẫn có vấn đề cần xử lý nếu task sau muốn đăng ký; không âm thầm triển khai hết Sprint2. AccountantNotifier ngoài Sprint1 còn log metadata đơn/transaction khi test lỗi; không nhận toàn sản phẩm đã sạch PII chỉ từ scan những đường vừa sửa.

## NFR và điều kiện đo

`benchmark-sprint1-staging.mjs`:200 buyer fixture Argon2id/session SHA256 hợp lệ,100ghế/vòng,10vòng disjoint,2000requestthật, yêu cầu đồng thời; mỗi vòng kiểm100winner/100conflict/100 quyền bền vững. Dữ liệu thêm riêng, không reset. Cold TLS tính trong vòng đầu; không bỏ sample, không warmup loại khỏi all. Fsync on, synchronous_commit on; RedisAOFyes; PG15 vẫn authority. MaxTicketsPerUser:null của **fixture này** để cô lập benchmark ghế, production quota/guard vẫn nguyên. Load generator cùng laptop, hai API, gateway native TLS, webDocker; protocol ghi rõ trong mỗi JSON.

| Bản/đường đo | All p95 ms | Steady p95 ms (chẩn đoán) | Kết quả |
|---|---:|---:|---|
| b52 HTTPS1 qua Next (lịch sử) |1519.9835|688.0835|FAIL; raw chỉ có aggregate lịch sử, không nhận đã có toàn sample từ trước |
| cdb HTTPS2 qua Next,1API |541.2536|518.4529|FAIL |
|97d HTTPS2 direct claim,1API |452.4070|359.4848|FAIL |
|630 HTTPS2,2API,cold |376.6512|246.2635|FAIL; không lấy steady thay all |
|630 warm profiler |272.4431|232.3862|PASS lượt này; không dùng để che cold329.3312/agent10cold306.223FAIL |
|accf832/v4 HTTPS2 sau deploy |285.0255|239.0983|PASS trong topology này |
|accf832/v4 HTTPS2 restart cả2API |260.2670|177.6250|PASS trong topology này |
|accf832/v4 HTTPS1.1,200connections |866.1147|325.6919|FAIL; không tuyên bố mọi protocol đạt |

Các lượt bổ sung source a2e5f67 giữ riêng cả kết quả trái chiều:

| Điều kiện trên cùng laptop | All p95 ms | Kết quả / evidence trong C |
|---|---:|---|
| H2 sau deploy, fixture session cấp từ DB |359.0416|FAIL; performance/https-h2-a2e5f67-after-deploy.json |
| H2 restart2API →200loginAPI thật →fresh TLS tải, lượt2 |233.1358|PASS có điều kiện; load-laptop-h2-cold-api-2/ |
| H2 cùng phương pháp, lượt3 |223.1592|PASS có điều kiện; load-laptop-h2-cold-api-3/ |
| H2 client cuối có profile/LAN/overwrite guards |263.4703|PASS có điều kiện; load-laptop-h2-final-client/ |
| H1 cùng phương pháp,200TLSconnections |737.9675|FAIL; load-laptop-h1-cold-api-1/ |
| H1 kiểm exit gate cuối |954.9460|FAIL, exit1 và2000mẫu được giữ; có browser verification chạy chồng một phần, chỉ dùng kiểm CLI fail-closed, không thay lượt đo cô lập |

Không có yêu cầu máy tạo tải vật lý riêng trong `../tasks/T-31.md` AC, `../docs/product.md` §7 (dòng145–155) hoặc `../docs/architecture.md` §14 (dòng303–319). §14 yêu cầu nhóm ghi điều kiện đo; máy tính/điện thoại được nêu cho S09, không phải điều kiện bắt buộc của T31. Một laptop được đo với process client riêng; không gọi là thiết bị độc lập. Không yêu cầu mua/thêm máy hoặc tự miễn300ms.

Wrapper `verify-sprint1-load-laptop.mjs --cold-api` kiểm dung lượng/health/profile trước đo, restart đúng2API, tạo200fakeBUYER, đăng nhập API thật để có session trước bài hold, rồi dùng TLS load connection mới. Latency của cả2000hold request gồm TLS lượt đầu; auth setup được ghi riêng, không phải hold warmup. Tất cả200request mỗi vòng overlap trước phản hồi đầu,100winner/100conflict/0lỗi; DB kiểm1000quyền giữ duy nhất với owner đúng cặp. Không sửa quota/guard/fsync/TTL. Bundle password chỉ ignoredlocal, client nhận CA pin và private LAN/profile guard, từ chối ghi đè lần đo cũ; wrapper trả exit1 khi NFRFAIL và giữ raw.

Tài nguyên lượtH2-2: CPU trong pha tải trung bình60.59%, cao nhất67.20%, RAM trống tối thiểu2796.78MiB; clientELU0.246, event-loop delayp9516.65ms/max24.46ms, RSS~84MiB. LượtH2-3 clientELU0.246/delayp9517.15ms/max23.07ms. Máy i5-13500H/16logicalCPU/~16.8GB, Docker/Node/source/image/fsync được ghi trong correlation/clientJSON. Generator không có dấu hiệu event-loop bão hòa trong hai lượtH2 đó; số liệu không chứng minh không có tranh CPU/TLS của toàn hệ thống. Không build/test nặng song song các lượt nghiệm thu này.

Tất cả raw và FAIL được giữ trong C/performance/ và C/load-laptop-*/. LượtpreflightH2-1 ECONNRESET trước đo được giữ; sửa health probe dùng agent mới sau Dockerrestart, không bỏ mẫu chậm. Các thử4/8gateway TLSworker và4client không ổn định khi cold nên bị loại khỏi source/runtime, vẫn giữ báo cáo FAIL; hiện chỉ1gateway. Query plan dùng index đúng, PGauth~0.56ms; force_generic_plan tệ hơn nên không áp dụng. Pool starvation đã được sửa. H1 cold còn chậm trong pha200TLShandshakes cùng laptop; chưa có tối ưu an toàn trong các thử nghiệm đã làm đủ căn cứ để đưa vào bản sửa. NFR tổng thể giữFAIL, H2 chỉPASS đúng phương pháp/môi trường đã đo. Không lấy steady-only/prototype/CI hoặc một lượt warmPASS để đóng gate.

K01 A/B/C tách riêng tại [K01_EVIDENCE.md](K01_EVIDENCE.md): PG và RedisAOF-everysec qua2process,200same-seat×3,1winner; PG644.9619/326.9403/308.3991ms, Redis85.2419/50.7857/40.9145ms. Graceful restart cảhai giữowner; không có hard-power-loss proof. PG authority **tạm local DEC12** không tự phê duyệt laptop staging; hồ sơ đề xuất/rủi ro/chọn-loại cần Lead review thật.

## Kiểm chứng và gate quy trình

- C/checks-a2e5f67/gates.json: lint/typecheck/unit342API+123web+18Node, integration88+4scanner PASS trên DBguard riêng; lockwait, concurrent held seats, atomicity/deadline/expiry/stale token và auth/proxy chịu ảnh hưởng được kiểm lại. Web build/API build và Prisma generate trong clean Docker source archive a2e5f67 PASS. Có format script chỉ tạiAPI; chạy formatter đúng file đã đổi, không sửa hàng loạt source thành viên.
- C/browser-a2e5f67:15ca desktop1440×1000 TZ Mỹ và mobile390×844 TZVN, actualtrustedHTTPS không bypassTLS; keyboard/focus,loading/empty/error/server400/recovery/success/double-submit/expiry-owner, không console/pageerror bất ngờ. Đã nhìn ảnh desktop/mobile để đối chiếu V1.
- C/api-a2e5f67: realHTTPS session/Secure cookie/logout/serverexpiry/5wrong→6th429/TTL900/APIrestart; chờ tự nhiên900s khôngDEL/rútTTL. Tài khoản riêng lock-test, không khóa A. Natural-expiry PASS trong artifact sau900s thực. Lượt api-final cũ FAIL vì TTL=0 vẫn còn phần giây; verifier mới đọc PTTL đến hết thật, giữ lượtFAIL và không xóa khóa. Hai Wi-Fi peers nguồn b52 tại20261016-two-peer vẫn giữ nguyên; user chạy remote10.88.164.22, Redis30/PTTL610s và laptop155login200 đồng thời. Không chạy lại peer brute force để tăng evidence; HMAC/login classifiers không đổi, focused H2 actualpeer regression bổ sung.
- Coverage dùng **cùng config/Vitest4.1.11/V8**: original auth/UI baseline07d API7.89→76.78lines/2.50→87.95branches,web23.94→77.52lines/18.37→63.94branches. Foundation baselinea1a:70.51→85.25lines,79.10→84.31branches; touched executable lines/branches100% (C/coverage-foundation-final). SQL correctness kiểm qua realDB, không nhận SQL có unit coverage100%; ops CLI có focusedNode tests riêng, không lấy testcount thay coverage.
- Full/prod audit mới0, không ignore. Actual fixture literal scan/diff và static bundle không chứa actualAUTH_PROXY_SECRET; credentials/QR/TLS/private logs chỉ ignoredlocal. Không đưa token/payload vào evidence công khai.
- Source a2e5f67 CI toàn13checkrun PASS; core5jobs PASS trên GitHub Actions; exact final PR head phải kiểm riêng. Run38866941333 đầy đủ5jobs từ07:23:50→07:27:33UTC=223s<5min; S30/S31 PASS; S43 integration chậm được báo riêng, không đổi threshold. C/candidate-ci.json lưu head/run timestamps thực.
- Develop policy live: protected=false, protection404, applicable rules/rulesets=[]; do đó T02 “redlint chặn merge” **FAIL** dù CI đỏ hoặc watcher khôngdeploy. Chuẩn bị `docs/SPRINT1_FIX_PR_DRAFT.md` và policy đề xuất; chưa thay protection do chưa có quyền user. Watcher gate rehearsal dùng cùng `watchOnce` thật,10mode adaptercontrolled + realchild deployment sentinel: red/pending/missing/truncated/error không invoke deploy. Đây không là live bad push hoặc postmerge proof.
- Security scans sealed: d893629 scope foundational patch; d893629..630745d operational3surfaces/26files;630745d..accf832 final15files. Không có reportable reachable finding trong các scope đã kiểm; parent sequential fallback vì provider không launch được worker mới. AI không là human review. Reports canonical ở Codex Security workbench; operational scan tool usage báo9,454,063tokens(cached9,272,704), là thống kê thread do tool trả, không suy chi phí hay số code được review. Final small scan không trả usage lúc capture trước. Bổ sung scan23ade8df cho a2e5f67..b50cd9a: cả3file tooling được kiểm, không reportable issue; guard subprocess sai profile/publictarget/priorresult đều bị từ chối trước login. Không mở rộng kết luận sang toàn sản phẩm.

## Bàn giao và việc còn cần

Runbook: [SPRINT1_DEMO_RUNBOOK.md](SPRINT1_DEMO_RUNBOOK.md). URL **https://10.88.164.155:3470**, health`/api/health`; credentials chỉ tại **`.sprint1-staging/config.json`**, QR/scanner/TLS keys không chia sẻ. Một lệnh khôi phục không rebuild/reseed: `node scripts/sprint1-staging.mjs resume`; chỉ READY sauhome/health200. Build bản mới: `deploy --sha <40hex>` với disk/networkguard, backup/migration acknowledgement nếu cần. Chứng chỉ hiện tại hết hạn14/11/2026, DHCPIP đổi cần cert/origin kiểm lại, khôngbypassTLS.

Chưa merge: cần thành viên khác trực tiếp approve exacthead, Lead xác nhận K01staging/phương phápNFR, maintainer cấu hình merge policy theo quyền được cho phép. Sau đó mới mergePR91→develop khi checks xanh/không unresolved; watcher một instance tự deploy exactintegratedSHA, ghi merge/CI/deploystart/trafficswitch/healthy<10min và kiểm lại smoke/NFR. Chưa có merge SHA hoặc integrated deployed SHA thì giữ BLOCKED, không điền bằng manualSHA. Tất cả yêu cầu trên có sẵn diff/test/đề xuất để review, không giả chữ ký hoặc tự miễn gate.

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
