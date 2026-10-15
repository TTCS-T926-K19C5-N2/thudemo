# Sprint 2 — review PO + review kỹ thuật tự động, DEC-12

04/10/2026. **PARTIALLY DONE**: cả 21 task có phần triển khai local; trạng thái task nguồn giữ nguyên. Kiểm tra chống giữ trùng T-31 đạt local, nhưng p95 lượt cuối **750,96 ms**, vượt yêu cầu dưới 300 ms. CI, staging và nghiệm thu cuối chưa đạt. PostgreSQL tạm thời đã được PO chấp thuận trực tiếp trong DEC-12; không còn gate chờ lựa chọn kho giữ cho local. **Chưa commit/push/PR/publish/upload/deploy.**

## 1. PO review cụ thể

1. Mở http://localhost:3000; API http://localhost:3001/health. Bản Docker mới: http://localhost:3200, health API http://localhost:3201/health; mỗi service giới hạn 512 MiB. Đây là môi trường local. Cổng 3100/3101 vẫn dùng image lịch sử.
2. Tài khoản giả design-organizer@example.invalid / design-buyer@example.invalid, Mật khẩu giả nằm trong file riêng `.git/stitch-correction-password` trên máy; mở file tại chỗ, không gửi nội dung lên chat/Git. Người tổ chức thử tạo suất, xem trước/nạp JSON 2.000 ghế, lỗi JSON, sửa giá, mở/đóng bán. Người mua chọn ghế bằng bàn phím hoặc sơ đồ → Giữ ghế → thấy máy chủ xác nhận và thời hạn; reload không tăng thời gian, thêm ghế không gia hạn. Browser khác cạnh tranh trả409; hết hạn tự refresh. Chưa có luồng đặt vé, thanh toán, nhả ghế thủ công hoặc khôi phục đầy đủ của S-14.
3. Xem [29state gallery](../evidence/holds/20261004/index.html), [ledger](STITCH_FIDELITY_LEDGER.md), [gói8task/AC/lệnh/rollback](SEAT_HOLD_LOCAL_EVIDENCE.md), toàn bộ 2.000 mẫu HTTP. Xem cả ảnh pending/held/conflict/expired360/390/1280. Không dùng fixture seam trực tiếp trên dữ liệu khác.
4. Xem [K01 approval](K01_EVIDENCE.md) và Số đo p95 trước/sau tối ưu: 352,54 → 270,25 → 750,96 ms. Lượt cuối FAIL, không chọn lượt nhanh. Restart Valkey làm mất counter và khóa đăng nhập; quyền giữ trong PostgreSQL vẫn còn khi restart API. Worker liên tục trên Render Free chưa đạt; phê duyệt tạm thời không miễn yêu cầu chống lạm dụng hoặc hiệu năng.
5. PO ghi nhận xét theo màn hình/AC; xác nhận local implementation không tự thành GitHubapproval/CI/staging/production hoặc100%Sprint. Không cần người review ngoài để tiếp tục quy trình PO + review kỹ thuật tự động.

## 2. Ma trận đủ 21 task — revision hiện tại

| Task | Implementation hiện tại | Local/bằng chứng | CI mới | Staging | PO review | Kết luận/tiêu chí còn thiếu |
|---|---|---|---|---|---|---|
| T-11 | seats/category FK,unique,index,migration | DB constraints + fresh cycle10history PASS | Pending | Pending | Pending | PARTIAL; DoD remote/review |
| T-12 | batch import transaction | 10import2k, failure rollback PASS | Pending | Pending | Pending | PARTIAL; remote/review |
| T-13 | pure map validator, đủ lỗi/position | unit+invalid import PASS | Pending | Pending | Pending | PARTIAL; remote/review |
| T-14 | preview/confirm riêng | browser invalid/oversize/stale preview, zero preview writes PASS | Pending | Pending | Pending | PARTIAL; remote/review |
| T-15 | sale state/readiness/permanent structural lock | close/reopen/price/map integration PASS | Pending | Pending | Pending | PARTIAL; remote/review |
| T-16 | organizer sale UI, owner guard | real open/close,BUYER403 PASS | Pending | Pending | Pending | PARTIAL; remote/review |
| T-17 | cursor catalog,0price,revision cache30s | 200shows,p95<500ms,Redis7+Valkey8 PASS | Pending | Pending | Pending | PARTIAL; managed cache/review |
| T-18 | public catalog/detail, safe login return | actualAPI/login/metadata/browser PASS | Pending | Pending | Pending | PARTIAL; remote/review |
| T-19 | single seat query,inventory seam | 2k p95<200ms,SQLfixture3states PASS | Pending | Pending | Pending | PARTIAL; seam allowed by task; real PGholds now integrated |
| T-20 | one canvas,zoom/touch/keyboard/inspector | desktop/mobile360/390/tablet768 PASS | Pending | Pending | Pending | PARTIAL; real PGheld state now integrated |
| T-21 | configurable generator + render benchmark | 30warm navigation/frame,p95152.9ms<2s,README | Pending | Pending | Pending | PARTIAL; physical mobile/staging not claimed |
| T-22 | PGowner/session/UTCexpiry/index/T19 | Product HTTP/DB/browser PASS local | Pending | Pending | Pending | PARTIAL; CI/staging/PO Pending |
| T-23 | Atomichold/originaldeadline/closed409 | Product HTTP/DB/browser PASS local | Pending | Pending | Pending | PARTIAL; latest NFR FAIL750.96ms; CI/staging Pending |
| T-24 | Server countdown+reload/drift/reconnect+6Stitchstates | Product HTTP/DB/browser PASS local | Pending | Pending | Pending | PARTIAL; CI/staging/PO Pending |
| T-27 | Standaloneworker60sec/repeat/log/backlog/shutdown | Product HTTP/DB/browser PASS local | Pending | Pending | Pending | PARTIAL; continuousworker Free not satisfied |
| T-28 | DB-clock expiredAVAILABLE without job | Product HTTP/DB/browser PASS local | Pending | Pending | Pending | PARTIAL; CI/staging/PO Pending |
| T-29 | SharedPG uniqueowner/expiredreclaim/staletoken | Product HTTP/DB/browser PASS local | Pending | Pending | Pending | PARTIAL; CI/staging/PO Pending |
| T-30 | 409 precise rejectedlist/safelog/no500 | Product HTTP/DB/browser PASS local | Pending | Pending | Pending | PARTIAL; CI/staging/PO Pending |
| T-31 | Real authHTTP200/100×10 and CIjob | 45invariants; each round100/100/0,2000rawsamples | Pending | Pending | Pending | PARTIAL; latest NFR FAIL750.96ms; CI/staging Pending |
| T-34 | nullable integer VND + SQLcheck | null vs0/negative/overflow/cycle PASS | Pending | Pending | Pending | PARTIAL; remote/review |
| T-35 | priceform/restore/inspector | savedinteger/errors/0/browser PASS | Pending | Pending | Pending | PARTIAL; remote/review |

Dependency local đã được mở bởi DEC-12: T22→T29/T30/T23→T27/T28/T24→T-31 đã triển khai. Remaining critical path: stable NFR300ms → PO acceptance → authorized remote → realCI/Render/staging/worker/K01gates. Không mở rộng S11/S14/payment/Sprint3.

## 3. Bằng chứng và thay đổi review

Các file mới/current logs tại evidence/holds/20261004; reportchi tiết20unit/10integration/106regression+24hold+3expirychecks, migration005/cycle11, actionlint/schema/image8smokechecks ở SEAT_HOLD_LOCAL_EVIDENCE.md. Snapshot `.git/hold-local-wip-20261004` bảo toàn WIP; changed-files.json ghi theo diff của phiên, không coi toàngitstatus là thay đổi mới. Oldprofile/research/stitchbefore giữ lịch sử.

Reviewer xem hold_models/migration, HoldsService/Controller/Scheduler/worker, SessionAuthGuard/PrismaService, T19query; webfeatureseat-selection/clock/contracts/sharedSeatMap; CIjobT-31, renderHOLD_EXPIRY_MODEapi và scriptsfixtures. Không dependencyupgrade trong phase này. Không claim formal Securityplugin scan/independentreview; self-review/code+negativeHTTP ghi trong evidence report.

## 4. Remote sau review — chưa thực hiện

Branch/commit/PRbody/checklist/rollback ở SEAT_HOLD_LOCAL_EVIDENCE.md. Requiredchecks chuẩn bị: T-02 / build-and-typecheck, T-02 / lint, T-02 / test, K-01 / candidate-research, T-31 / hold-concurrency. Chưa đổi branchprotection; chưa chạy Actions revisionmới. Script T-31 exit1 khi count/NFRfail, khôngcontinue-on-error. Review đúng gate còn đỏ trướcmerging.

Runbook [RenderFree](RENDER_FREE_RUNBOOK.md) đã có schedulerapi, workerlocal, env/health/migration/export/rollback. Free sleep/không worker/PGretention/cacheloss vẫn là giới hạn; không hứa staged NFR/timing/T03rollback. Chờ quyền remote mới để upload/deploy sau PO xem gói cụ thể; không xinsecret qua chat.
