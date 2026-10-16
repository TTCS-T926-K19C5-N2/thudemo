# PR91 — sửa nền tảng và nghiệm thu Sprint 1

> **Scope mới DEC15:** S03/T07/T08 đã được user đưa vào Sprint1; thêm clone sạch/một lệnh đầy đủ. Các kết quả cũ bên dưới chỉ phủ phạm vi trước; S03/onboarding đang review, chưa PASS. `evidence/sprint1/20261016-s03-onboarding/scope-and-plan.json` là ledger khởi đầu, sẽ mở rộng từng AC/NFR/DoD.

Snapshot CI hiện hành **c7bb13c**: [run38887699819](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/38887699819) đủ5required contexts, **209s**. Source/runtime không đổi; head tài liệu sau snapshot phải kiểm CI riêng trước merge.

## Bổ sung F16 — unit harness MoMo và required CI

Run38890838587 của head e8ef760 (checkout merge thử **eeb2b83c1a43080c5b2c101ead4ded0b94f68d49**) FAIL ở Unit tests: `momo.gateway.spec.ts:25` gọi sandbox thật, timeout mặc định5000ms trong khi adapter chờ fetch tối đa10000ms. Spec/adapter giống hệt base develop80f; lỗi harness nền, không là regression QR/payment từ PR91. Vì T02/test required nên đã sửa tối thiểu **unit spec**: stub transport local mỗi test/restore sau test; giữ assertion chữ ký/parse cũ, thêm wire signature/amount/refs và fallback. Không đổi adapter sản phẩm/timeout/assertion/protection.

Tái hiện trước sửa với fetch treo có kiểm soát (không mạng ngoài):1FAIL/3PASS; cùng setup sau sửa5PASS. Focus adapter+signature8PASS; full runner mới **343API+123web+18Node,88integration PG/Redis+4scanner, lint/typecheck/migration PASS**. Evidence `evidence/sprint1/20261016-acceptance-audit/momo-unit-harness.json` và `checks-momo-harness/`. Không coi đây là MoMo sandbox acceptance. CI head chứa bản sửa phải tự đạt sau push; run đỏ được giữ.

## Cập nhật xác nhận PO — DEC-14, 16/10/2026

PostgreSQL authority cho **laptop staging dữ liệu giả đã được Nguyễn Văn Sáng (PO) chấp thuận trực tiếp** sau gói K01; DEC14/k01-approval.json giữ nguyên văn và ngữ cảnh. Đây không còn blocker “chưa quyết định staging authority”. K01-D timebox/mentor vẫn NOT RUN; DoD02 vẫn BLOCKED: user nhận review nhưng PR author và authenticated account đều sangnguyencoder, chưa có approval thành viên khác. Không giả review hoặc suy phê duyệt PO thành miễn quy trình. Các đoạn checkpoint trước dưới đây giữ trạng thái tại thời điểm cũ; trạng thái hiện hành phải đọc cùng cập nhật này.

> Đối chiếu toàn bộ task/DoD và tính hợp lệ evidence hiện hành: [bảng đầy đủ trong báo cáo](SPRINT1_REVIEW_REPORT.md), [ma trận hai chiều](SPRINT1_ACCEPTANCE_MATRIX.md). Task nguồn/backlog refined: **In progress**, không phải Done. K01 mentor/timebox chưa có proof; không kéo T31/S30 vào AC Sprint1.


Login thiếu IP budget/có alias bypass, giờ suất phụ thuộc timezone máy và form mất nội dung khi hết phiên. Bản sửa dùng shared Redis account+IP counters, HMAC theo TCP peer qua gateway/proxy/API, UTC↔giờ Việt Nam và phục hồi draft đúng chủ. Giữ UI V1, năm lần sai/lần sáu khóa15phút, default deny/RBAC/isActive và các vai trò hiện có.

Feature → PR91 → develop theo Git Flow; đã nhập develop80f7a53 bằng merge, giữ attribution/lịch sử thành viên. Research Redis module giữ source/spec nhưng tách AppModule để không mở public mock owner/TTL hoặc tạo authority song song. Product PG authority staging đã được PO chấp thuận DEC14; member review theo DoD và evidence quá trình K01 còn thiếu.

Full/prod audit0 sau scoped Next lint patch loại chuỗi braces, frozen install và luật ESLint thật được kiểm; không audit ignore. Sửa pool starvation bằng dùng lại connection đã mượn. Additive claim_hold_v4 chỉ read-reject conflict đã biết, mọi grant/retry/race qua v3, giữ migration cũ/fsync/auth/transaction guards.

Laptop staging riêng: TLSgateway3470, webDocker+2API, privatePG15455/Redis16405, guarded seed/private credentials, backup stream đã xác minh, atomic promotion/rollback, exact label/PID và disk preflight. Resume start cả replica; verifier chờ PTTL hết thật thay vì coi TTL=0 là đã hết. Watcher một instance chỉ deploy develop chứa fix khi mọi check đúng SHA success.

Source a2e5f67 (runtime), app regression accf832 cùng source ứng dụng: build/lint/typecheck,342API+123web+18Node,88+4integration;15browser desktop/mobile trustedHTTPS; API/DB/Redis thật. Coverage cùng baseline/config: originalauth API76.78/web77.52lines; foundation70.51→85.25lines,79.10→84.31branches; touched executable lines/branches100%. Dependencyoutage503→restore200; badcandidate giữ active; actual rollback a2e5f67→accf832→a2e5f67 giữ DB/migration count/khóa. Exact head CI cuối đọc tại PR; không lấy kết quả SHA cũ thay required checks mới.

Ngoài nghiệm thuSprint1 — phépđo S10/S13/T31 theoủyquyền:200concurrent/100seats×10,2000rawsamples,100winner/100conflict mỗi vòng. H2 a2e5f67 cùng laptop/processriêng sau200loginAPI thật đạt allp95233.1358/223.1592/263.4703ms; H1 cùng phương pháp737.9675msFAIL và H2coldDB-issued359.0416msFAIL đều giữ. Không bắt buộc máy tải riêng theo nguồn đã đọc; không dùng steady-only/CI/prototype thay300ms. CLI fail khi vượtNFR, ghi CPU/RAM/ELU/source/Docker/DBownership. Thử nhiều gateway bị loại vì cold chưaổnđịnh. HaiWi-Fi peer nguồn b52 giữ riêng, không lặpIPprobe.

Trước merge: thành viên thật approve exacthead; review/xác nhận K01 theo phạmvi nghiêncứu; policy develop đã áp dụng/readback và negativePR95 xác nhận; required checks xanh/không unresolved. AI scan hỗ trợ, không thay human approval. Sau merge hợp lệ: watcher tự chạy, ghi merge→CI→deploy→healthy<10phút và nghiệm thu integratedSHA; manual230.018s không là auto-deploy. Không main/release/production/publicTunnel/paidhosting.

Bổ sung FK test trên DB riêng: xóa event/showtime có PAID order/ticket bị P2003, lịch sử giữ nguyên; rollback fixture mới. Các CASCADE ticket cũ được ghi riêng trong report, không thêm API xóa hoặc mở rộng lifecycle.

Evidence: evidence/sprint1/20261016-closeout/, 62mục đã phânloại (56Sprint1,2repairregression,1support,3futurechecks)/report/runbook trong docs. Demo https://10.88.164.155:3470; credentials chỉ ignoredlocal .sprint1-staging/config.json. Rollback code giữ DB/history/keys, không reset/migrate-down.

## Policy develop — đã được cho phép và áp dụng16/10

Trước thay đổi: protected=false/protection404/rulesrỗng; giữsnapshot. Sau ủyquyền trực tiếp đã áp dụng riêng develop, GET xác minh toàn bộ trường. PR95 isolated lintFAIL required=true, bốnrequiredchecks khácPASS, mergeBLOCKED, đóngunmerged. Không đổi main. Không dùng configsuccess thay negativegate; bằng chứng tại closeout/protection/.

```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["T-02 / build-and-typecheck", "T-02 / lint", "T-02 / test", "K-01 / candidate-research", "T-31 / hold-concurrency"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1,
    "require_last_push_approval": true
  },
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
```

Có thể nhờ thuytrang158/admin hoặc thành viên write/admin phù hợp trực tiếp review; chưa có review request được gửi. Không dùng tài khoản đăng nhập sẵn để review thay người đó.
## Gói review thành viên — tự động hỗ trợ, chưa có approval người thật

Exact head: đọc header PR hiện tại (body được cập nhật sau push cuối); deployed source a2e5f67, harness b50cd9a. Review cả diff/source và nhóm56yêu cầu Sprint1 +2regression của phần sửa, không nhận T31/QR là StorySprint1.

- Thay đổi chính: IP/session/proxy, timezone/draft recovery, dependency patch, pool/PG conflict optimization, isolated Docker/staging/release/backup/watcherguards; giữattribution và UI V1.
- Finding đã sửa/evidence: bảngF01–12 của report, API/browser/DB/Redis thật, coverage cùngbaseline và audit0. S30 hiện là baselinefailure: same60fixtures/base=head7FAIL, chưa sửaQR; actualruncheckoutmergeSHA được ghi riêng.
- Người review tự mở diff, kiểm auth/defaultdeny/ownership/UTC, migrationappend-only, đọc role/fixtureguards, nguồn scope và negativeCIgate; chạy các bước phù hợp trong runbook; xem timeline/rollback và các hạn chế. Không chỉ chép lại sốtest.
- Nội dung review để người đó tự hoàn thiện: “SHA tôi đã đọc: …; bước tôi đã trực tiếp kiểm: …; finding/rủi ro còn lại: …; quyết định và lý do: Request changes/Approve …”. Đây là mẫu trống, không là chữký/approval. Không dùng tài khoản khác để giảreview độclập hoặc tự đóngDoDrow2.

T31 vẫn required theo policy vừa được người dùng duyệt, không trở thành AC Sprint1. S30 không requiredprotection; watcher vẫn failclosed với checkFAIL thực sự tồn tại ởdevelopSHA. Không tắtworkflow/assert/policy để né. Cần người thật review và K01 xác nhận còn thiếu trước merge; T03auto-deploy<10phút chỉ đo sau merge hợp lệ.

T02 harness follow-up: giữFAILa506; suiteorder dùng MoMo thật/timeout10s trongtest5s. Đổi riêng suite sang existingmockprovider và thêm no-external-fetchassert, không sửaAPI/timeout/assertnghiệpvụ. Chạy lại88integration+4scanner; exactheadCI kiểm saupush. Không nhận S24provideracceptance.

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
