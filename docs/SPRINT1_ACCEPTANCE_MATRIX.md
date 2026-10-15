# Sprint 1 — ma trận nghiệm thu hiện hành

Baseline07d683fc; deployed candidate864189e; tích hợp snapshot develop97ff917 vào feature. Mỗi evidence có SHA riêng; không gán kết quả source cũ cho head mới. Phạm vi DEC09/UIV1. **L**=`evidence/sprint1/20261015-laptop/`; **G**=`20261015-gitflow/`; **H**=`20261015-handoff/`. Chi tiết provenance/findings trong report; bảng main dưới chỉ lịch sử.

| Story/Task | AC/NFR/DoD | Implementation | Test case | Môi trường | Evidence | Kết quả | Lỗi/gate còn mở |
|---|---|---|---|---|---|---|---|
| S01/T01 | Lock/toolchain/fresh install/migration/client | setup/Prisma/clean git archive | frozen install/migrate/generate/start | local riêng + staging candidate864 | G/gates,L/runtime | PASS | Không reset/db push |
| T01 | Health dependency thật | health module | health200, dependency outage503 | API/realPGRedis | G/api; historical infrastructure | PASS | Outage mới staging chưa chạy |
| T02 | Build/lint/typecheck/unit | CI5job + test runner | đúng SHA864; integrated head riêng | GitHub/local | L/candidate-ci,H/gates | PASS | Cập nhật CI head cuối ở H |
| T02 | Test thất bại chặn deploy | watcher checks all success | predicate fail-closed; missingancestor blocks thật | laptop watcher | L/runtime | BLOCKED | Cần red-CI controlled evidence sau tích hợp, không phá main |
| T03 | Docker/production entry | API Docker+TLSgateway+loopbackNext | health/home/login/Secure cookie | staging864 | L/https-api | PASS | API container, web native Node; không gọi full-Docker web staging |
| T03 | Merge→auto-deploy<10min | watcher develop afterCI | manual485.989s≠postmerge AC | laptop | L/timeline | BLOCKED | Chưa merge/human review; không đổi T03AC |
| T03 | Candidate lỗi giữ bản cũ | candidate smoke + atomic pointers | wrong attestation candidate rejected, old health200 | real staging864 | L/timeline | PASS | Post-switch restore có Node test; runtime rollback riêng |
| T03 | Rollback+backup/history | previous pointer/pg_dump | exact previousSHA health, preserveDB | staging | H/runtime | NOT RUN | Chỉ PASS khi có timeline rollback thật |
| T04 | users/roles/unique/Argon2id | schema/guarded seeds | five roles/6fixtures, unique reject/hash | localPG + staging fixtures | G/api,L/runtime | PASS | Không plaintext demo password |
| T05 | Secure cookie/expiry/logout | production auth/session | Secure,HttpOnly,Lax,900s; anonymous/expired/logout401 | real HTTPS864 | L/https-api | PASS | UI TLS chưa tin cert |
| T05 | 5wrong→6th429/15min | Redis accountlock | actualTTL900/APIrestart/natural expiry | HTTPS+realRedis | L/https-api-initial,L/https-api | PASS | Natural expiry chỉ PASS khi result tương ứng đã ghi |
| T05 | IP/account/anti enumeration | sharedRedis/HMAC owned TCP | unknown/wrong same401, stale/forged/casealias, rotatedaccounts | localTCP/API, HTTPS864 | G/api,G/proxy-ip-final,L/https-api | PASS | Hai Wi-Fi clients độc lập BLOCKED |
| T06 | Server403/defaultdeny/publicintent/audit | RolesGuard/global guards/inventory | buyer create/edit denied, undeclaredroute, rolelogs | realAPI/browser | G/api,rbac-inventory,unit | PASS | Staging hai-client/trình duyệt chưa đủ |
| T06 | Multi-role/adminscope | roles.some | BUYER+ORGANIZER; admin no implicitowner | localAPI | G/api | PASS | Không tạo superscope |
| T05/T09 | Expiry UI/owner recovery | EventEditor/LoginForm/safeReturnTo |401→login→restore sameowner, otherowner rejects | desktop/mobile + unit | G/browser/coverage | PASS | StagingUI BLOCKED cert |
| S04/T09 | Create/edit draft/hidden/reload | event API/editor | A draft201,buyer omitted,A patchreadback | localUI/API+HTTPSAPI864 | G/browser,L/https-api | PASS | StagingUI chưa kiểm |
| T09 | Owner B/buyer forbidden | findOwned/RolesGuard | URL/API B403,buyer403 | browser/API+HTTPS864 | G/browser,L/https-api | PASS | Server side |
| T09 | Validation/input/double submit | editor field/ref guards |400 retained/fix/save,count1 | desktop/mobile | G/browser | PASS | Không universal API idempotency |
| T10 | Future/past/duplicate warning | service/editor | future201,past400,two duplicate201+warning | UI/API/DB+HTTPS864 | G/browser,L/https-api | PASS | Không unique-timeconstraint |
| T10 | UTC/VN timezone | timestamptz/helper | USdeviceVNinput→UTCDB→reloadVN | browser/PG/unit | G/browser/coverage,L/https-api | PASS | InvalidFeb30 checked |
| T09/10 | FK/data history | schema Restrict | eventwithshows delete fails | realPG864 | L/https-api | PASS | Không thêm xóa nghiệp vụ |
| K01 | PG+Redis/conditions/restart/decision | isolated spike/DEC12 |200same-seat,2process,expiry/restart | local/CI exactSHA | K01 docs,CI artifacts864 | PASS | Chỉ local authority tạm; review member còn chờ |
| K01 | Staging datastore comparison | spike separateproduct | both options in acceptedstaging | LAN staging | pending | BLOCKED | Không lấy product endpoint thay datastore |
| K01/NFR | Endpointp95<300ms | existing holdsendpoint |2000realHTTPS,100winner/100conflict×10 | staging864/1API/co-located | L/endpoint-benchmark | FAIL | all1597.9634ms/steady613.8044ms; không đổi300→800 |
| DoD row2 | Thành viên khác review | DraftPR91 | reviewed exactSHA | GitHub | PRreviews | BLOCKED | Không dùng accountrotation giả human |
| DoD row3 | Coverage delta không giảm | identicalVitest/V8_4.1.11 | baseline/changedlines/branches | isolatedharness | G/coverage/comparison | PASS | ScopeAPI76.78/web77.52%; không là toànapp |
| DoD row4 | CI head xanh | unchangedCIworkflow |5jobs exactSHA | GitHub | L/candidate-ci,H/CI | PASS | Không dùng SHA864 cho mergedsource mới |
| DoD row5 | Secret sạch/audit sạch | ignore/overrides/vendorCSS | fixtureliteralcheck/prod+fullaudit | files+dependencies | G/audit,H/secret-review | FAIL | prod0 nhưng full1highbraces/no patch |
| DoD row6 | AC staging/teamUI | isolatedLANgateway | certtrust/firewall/two-device/UI | laptop+teamWi-Fi | L/https-api,H/runtime | BLOCKED | OSAccessDenied5/trustdialog; không bypassTLS |

## Lịch sử main — không đại diện head hiện hành

# Sprint 1 acceptance matrix — 15/10/2026

Source SHA: `81d1dd9d8f453b32ed0c6956399e5600f71a32d6` (fetched origin/main) + uncommitted fixes; final source manifest in `evidence/sprint1/20261015/`. Initial matrix was written before acceptance execution. F-01/F-02/F-03 initially FAIL; results below follow fixes. Only PASS / FAIL / BLOCKED / NOT RUN are used.

DEC-09 scope: S-01/T-01..03, S-02/T-04..06, S-04/T-09..10, K-01. S-03/T-07/T-08 belongs to Sprint 3. DEC-12 permits PostgreSQL authority locally, without waiving staging/NFR. Sources: approved `đã đồng bộ refinement.xlsx`, Backlog rows2/5/8/14; DoD-DoR rows2–10; parent product/architecture/security/UI/decision/task docs.

Evidence shorthand: **E**=`evidence/sprint1/20261015/`; **A**=`api.json`; **B**=`browser/results.json`; **G**=`gates.json`; **I**=`infrastructure.json`; **C**=`source-ci.json`; **P**=`proxy-ip-final.json`. Sensitive configuration/logs stay Git-ignored under `.sprint1-local/`. Local results do not certify staging.

| Story/task | AC/NFR | Implementation | Test case | Environment | Evidence | Result | Finding/gap |
|---|---|---|---|---|---|---|---|
| S-01/T-01 | Exact toolchain/frozen lock | package/lock/workspace | Fresh worktree install/versions | Node24.21.0/pnpm10.15.1 | setup-summary.json | PASS | Lockfile unchanged |
| T-01 | Root env/PG/Redis/migration/client/start | ConfigModule/Prisma/demo script | New containers/volumes/database, full migrations, start | isolated PG15/Redis7/API/web | G/I/readiness.json | PASS | No manual schema repair/db push/reset |
| T-01 | Dependency-aware health | AppController | Stop owned PG then Redis→503; restore→200 | real API | I | PASS | No false success |
| T-01/T-04/T-09 | Apply/compensate/reapply | original SQL in new migration cycle | 9 Prisma history rows, users/roles/events/showtimes restored | disposable sprint1_migration_cycle | I | PASS | No applied product migration edited |
| T-01/S-01 | No source/browser/log secrets | ignore/env/proxy | Literal-secret + bundle/build-context review | files/images | secret-review.json/I | PASS | Private credentials/keys ignored |
| T-02 | Build/lint/typecheck/test | ci.yml | Exact-SHA run38695462765 | GitHub read-only | C | PASS | Baseline CI; patch has local checks only |
| T-02 | Failed lint blocks normal merge | required checks | Red-lint proof36827889536 + live strict checks | GitHub | ci-lint-negative-proof.json/main-protection.json | PASS | Admin bypass/review gap separately |
| T-02 | Parallel lint/test, pipeline<5min | job graph | All core jobs start06:56:21Z, test ends06:57:34Z; full workflow06:59:46Z | GitHub | C | PASS | Core73s; full205s |
| T-02/S-01 | Failed test prevents staging deploy | no active deploy workflow | Actual failure-to-deploy gate | staging | absent | BLOCKED | Render autoDeployTrigger off; CI-only workflow |
| T-03 | API/web images/non-root/no secret | Dockerfile/custom web entry | Builds, health/home/proxy200, signed-peer login | local Docker | I/docker-images.json | PASS | Local packaging only |
| T-03 | Bad candidate keeps old version | separate local containers | Candidate fails, old ID unchanged/home200 | local Docker | I | PASS | Isolation simulation, no traffic-switch proof |
| T-03 | Merge→staging<10min/HTTP200/health/rollback | Render profile/runbook | Real auto deployment and failed candidate rollout | Render staging | runbook checklist | BLOCKED | No remote deploy authorized/access/evidence |
| S-02/T-04 | Five roles, seed admin/organizer | schema/guarded seed | Five roles/six fake accounts; repeat seed preserves data | isolated demo DB | A/setup-summary.json | PASS | Includes A/B/buyer/lock/multi; role/password mismatch refuses overwrite |
| T-04 | Unique email, Argon2id, relations | schema/migrations | Duplicate email insert fails; hashes Argon2id | PostgreSQL | A | PASS | No plaintext DB password |
| T-05 | Correct login/nav/cookie/expiry | AuthService/guard/UI | Login; event nav/no accounting; HttpOnly/Lax/900s; Docker Secure | real HTTP/browser/images | A/B/I | PASS | HTTP-local API dev mode; production cookie unchanged |
| T-05 | Five wrong/sixth429/15min/remaining time | RedisService/AuthService | 5 actual401→429, TTL900; UI retry minutes | real HTTP/Redis | A/lock-natural-expiry.json | PASS | Dedicated fixture; natural expiry, no shortening |
| T-05 | API restart retains lock | shared Redis | Kill/relaunch verification API process→429 | real processes | A | PASS | Not only service mock |
| T-05 NFR | Per-account + IP brute-force defense | Redis + transport-peer HMAC | Rotating emails peerA429; peerB200; XFF/attestation spoof rejected | API + real TCP through web proxy | A/P | PASS | F-01 fixed locally; cloud-edge identity remains staging gate |
| T-05 | Unknown/wrong error generic | dummy hash/AuthService | Compare real401 body/status | API | A | PASS | Timing equivalence not claimed |
| T-05 | Anonymous/expired401/logout revocation | sessionQuery/controller/UI | Replay logout cookie401; expired fixture401; UI login+draft recovery | API/browser | A/B | PASS | F-03 fixed;15min contract retained |
| T-06 | Buyer direct create/edit403 + safe log | RolesGuard/events | Create/patch/showtime denied; role mismatch safe log | API | A/rbac-inventory.md | PASS | Server guard independent of UI |
| T-06 | Default deny/intentional public | global guards/decorators | Undeclared root403 with session + guard tests/inventory | API/source | A/G/rbac-inventory.md | PASS | Mock controller intentionally public with enabled guard; no blanket public event controller |
| T-06 | Multi-role/no blanket admin bypass | requiredRoles.some/relations | Buyer+organizer own management; ADMIN alone no implicit organizer | API | A/supplemental.json | PASS | No invented superscope |
| S-04/T-10 | A creates draft/hidden from buyer | EventsService/editor | Create/list/public404+omission | API/browser | A/B | PASS | Database DRAFT |
| T-10 | Edit/read/reload persistence | owner service/editor | PATCH then UI reload exact fields | API/browser | A/B | PASS | V1 preserved |
| T-10 | Future show correct event/FK | addShowtime | Future201 + exact eventId | API/browser/DB | A/B | PASS | |
| T-10 | Past blocked server and UI reason | date validation/editor | API400, inline field error/input retained | API/browser | A/B | PASS | Both layers |
| T-10 | Duplicate same event/time warns and saves | count+create | Second201/warning; exactly two intentional shows | API/browser/DB | A/B | PASS | No unique time constraint |
| T-10 | B and buyer denied URL/API | findOwned/RolesGuard | B manage/patch/add403; mobile direct URL denied | API/browser | A/B | PASS | No unauthorized resource data |
| T-10 | Double-submit no extra record | ref gate+disabled | Two submit events same turn; database exactly one event | browser/DB | B | PASS | Not universal API POST idempotency |
| T-10 | Validation fields/input recovery | editor | Empty form + actual server400→retained input→corrected save | browser/API | B | PASS | Loading/empty/error/success exercised |
| S-04 NFR/T-09 | UTC/timestamptz/Vietnam display | schema/helper/formatter | US browser Jan1 00:30VN→Dec31 17:30Z→reload00:30VN | DB/desktop/mobile | A/B/G | PASS | F-02 fixed; no schema rewrite |
| T-09 | Deliberate delete/FK/history protection | RESTRICT relations | Event with shows delete fails; order/ticket restrictions inspected | DB/source | A/report | PASS | No delete feature/cascade history |
| K-01 | Both measured/conditions/concurrency/restart | scripts/k01/raw artifact | 200/1×3 each;2 processes; invariants/restart | exact-SHA CI artifact | k01-current-ci.json/C | PASS | PR29 Redis-only report insufficient alone |
| K-01 | Selection/reason/review chronology | DEC-12/K01 docs | PG temporary authority; Redis TTL-only restart loses owner | docs/history | K01_EVIDENCE.md/report | PASS | Not permanent/staging approval |
| K-01 | Disposable spike separate product code | scripts/k01 vs src/holds | Source separation | source | report | PASS | Candidate benchmark not endpoint evidence |
| K-01 | Staging comparison/relevant endpoint NFR | no staging evidence | Staging2backend spike/product endpoint measurement | staging | absent | BLOCKED |300ms unchanged; CI green800ms budget not300ms acceptance |
| DoD C2 | Another member independent approval | review metadata | PR39 approval exists but handoff says automated account review | GitHub/docs | pr-39.json/report | BLOCKED | No human independent approval of current patch |
| DoD C3 | New logic branch regression | helper/proxy/IP tests |238 unit +109 integration + real HTTP/browser | local patch | G/A/B/P | PASS | Counts do not prove coverage percentage |
| DoD C3 | Changed-line coverage nondecreasing | no baseline coverage artifact | Baseline/patch equal instrumentation | local/CI | absent | NOT RUN | No inferred percentage |
| DoD C4 | Final repair CI green | uncommitted diff | Remote CI for repair revision | GitHub | publication not authorized | NOT RUN | Source CI green/local patch checks pass |
| DoD C5 | Dependency scan clean | TECH01 pinned deps | pnpm audit --prod --json | registry/local lock | dependency-audit.json | FAIL |12 signals:6high/5moderate/1low; exploitability not validated; upgrade/remediation needed |
| DoD C5/C9 | No new secret/PII/payment logs | source/evidence | Literal-secret/bundle/diff/log review | local | secret-review.json | PASS | No repository-wide certification of historic unrelated logs |
| DoD C6 | AC pass staging | no staged repair | All story AC on staging | Render | absent | BLOCKED | Local is distinct |
| DoD C7/C8 | Concurrent/idempotent regressions | existing later modules | Full orders/payments/holds/scanner E2E suites | isolated databases | G | PASS | Regression only; no new later-sprint NFR/staging worker acceptance |
| DoD C10 | Docs/env updated | README/env/runbook/report/matrix | SourceSHA/commands/paths checked | local | documents | PASS | No credential content |
| UI QA | Real desktop/mobile/focus/runtime/console | V1/primitives reused |15 checks/screenshots1440x1000,390x844 | Chromium local | B | PASS | Physical phone/other browsers NOT RUN |

Overall: local demonstration ready when live readiness passes. S-01 BLOCKED; S-02 PASS local/BLOCKED staging; S-04 PASS local/BLOCKED staging; K-01 BLOCKED overall (local comparison/decision PASS). Sprint1 AC/DoD chưa đủ. Publish chưa sẵn sàng: dependency remediation/review/final CI and external gates remain; diff/draft PR prepared without commit/push.