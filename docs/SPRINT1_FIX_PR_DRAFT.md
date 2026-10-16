# PR91 — sửa nền tảng và nghiệm thu Sprint 1

Login thiếu IP budget/có alias bypass, giờ suất phụ thuộc timezone máy và form mất nội dung khi hết phiên. Bản sửa dùng shared Redis account+IP counters, HMAC theo TCP peer qua gateway/proxy/API, UTC↔giờ Việt Nam và phục hồi draft đúng chủ. Giữ UI V1, năm lần sai/lần sáu khóa15phút, default deny/RBAC/isActive và các vai trò hiện có.

Feature → PR91 → develop theo Git Flow; đã nhập develop80f7a53 bằng merge, giữ attribution/lịch sử thành viên. Research Redis module giữ source/spec nhưng tách AppModule để không mở public mock owner/TTL hoặc tạo authority song song. Product PG authority DEC12 tạm local; quyết định staging cần Lead review thật.

Full/prod audit0 sau scoped Next lint patch loại chuỗi braces, frozen install và luật ESLint thật được kiểm; không audit ignore. Sửa pool starvation bằng dùng lại connection đã mượn. Additive claim_hold_v4 chỉ read-reject conflict đã biết, mọi grant/retry/race qua v3, giữ migration cũ/fsync/auth/transaction guards.

Laptop staging riêng: TLSgateway3470, webDocker+2API, privatePG15455/Redis16405, guarded seed/private credentials, backup stream đã xác minh, atomic promotion/rollback, exact label/PID và disk preflight. Resume start cả replica; verifier chờ PTTL hết thật thay vì coi TTL=0 là đã hết. Watcher một instance chỉ deploy develop chứa fix khi mọi check đúng SHA success.

Source a2e5f67 (runtime), app regression accf832 cùng source ứng dụng: build/lint/typecheck,342API+123web+18Node,88+4integration;15browser desktop/mobile trustedHTTPS; API/DB/Redis thật. Coverage cùng baseline/config: originalauth API76.78/web77.52lines; foundation70.51→85.25lines,79.10→84.31branches; touched executable lines/branches100%. Dependencyoutage503→restore200; badcandidate giữ active; actual rollback a2e5f67→accf832→a2e5f67 giữ DB/migration count/khóa. Exact head CI cuối đọc tại PR; không lấy kết quả SHA cũ thay required checks mới.

NFR chưa đóng tổng thể:200concurrent/100seats×10,2000rawsamples,100winner/100conflict mỗi vòng. H2 a2e5f67 cùng laptop/processriêng sau200loginAPI thật đạt allp95233.1358/223.1592/263.4703ms; H1 cùng phương pháp737.9675msFAIL và H2coldDB-issued359.0416msFAIL đều giữ. Không bắt buộc máy tải riêng theo nguồn đã đọc; không dùng steady-only/CI/prototype thay300ms. CLI fail khi vượtNFR, ghi CPU/RAM/ELU/source/Docker/DBownership. Thử nhiều gateway bị loại vì cold chưaổnđịnh. HaiWi-Fi peer nguồn b52 giữ riêng, không lặpIPprobe.

Trước merge: thành viên thật approve exacthead; Lead review K01 authority và NFR/topology; policy chặn merge được maintainer cho phép; required checks xanh/không unresolved. AI scan hỗ trợ, không thay human approval. Sau merge hợp lệ: watcher tự chạy, ghi merge→CI→deploy→healthy<10phút và nghiệm thu integratedSHA; manual230.018s không là auto-deploy. Không main/release/production/publicTunnel/paidhosting.

Evidence: evidence/sprint1/20261016-closeout/, ma trận62gate/report/runbook trong docs. Demo https://10.88.164.155:3470; credentials chỉ ignoredlocal .sprint1-staging/config.json. Rollback code giữ DB/history/keys, không reset/migrate-down.

## Đề xuất policy develop — cần maintainer cho phép, chưa áp dụng

Live16/10: protected=false, protection404, rules/rulesets rỗng. T02 yêu cầu pipeline đỏ chặn merge nên FAIL. JSON dưới là đề xuất cụ thể, chỉ PUT sau khi chủ repository cho phép thay protection.

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