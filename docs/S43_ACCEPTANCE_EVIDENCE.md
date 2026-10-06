# S-43 — acceptance evidence

Status: **PARTIALLY DONE / implementation qua [PR #49](https://github.com/TTCS-T926-K19C5-N2/thudemo/pull/49)**, issue [#48](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/48) giữ mở. Baseline `origin/main` refresh dưới Sáng ngày 06/10/2026: `bae27719e0af98063eee96507a236f3bacc08fc7` (PR #39). Worktree sạch riêng `thudemo-s43-monitoring-20261006`, branch `story/S-43-monitoring-alerting`. Preview `thudemo` không sửa/reset/stash; checkpoint binary tracked patch và hash manifest 912 paths ở parent `.codex-tmp/s43-checkpoint-20261006`, không đưa vào Git. Không mang WIP Sprint 2 vào story PR.

## Ma trận AC → implementation → test → evidence → trạng thái

| AC/định nghĩa | Implementation | Test/evidence chạy lại | Trạng thái |
|---|---|---|---|
| Số requests/rate | Middleware trước parser/guard, finish/abort once, bounded labels | Unit completion/close/privacy; `verify-s43` known HTTP counts + Prometheus series | Unit PASS; CI Docker integration PASS tại dc29e4e |
| Tỉ lệ lỗi | 5xx/all responses, 4xx/409/499 riêng, zero denominator Unknown | Unit statuses; official promtool sustained/equality/min samples/no data | Unit + official promtool PASS; CI integration PASS tại dc29e4e |
| p95 response | Monotonic seconds histogram, sum buckets before quantile, 5m, resolution documented | Unit histogram; promtool two-instance known distribution; raw same-build benchmark | Unit + known two-instance histogram fixtures PASS; CI raw benchmark ghi riêng NFR FAIL |
| Tranh chấp ghế | 409 + SEAT_CONFLICT only, failed request count | Unit other 409 excluded; two buyers/product API/real DB fixture | CI two buyers/real API/DB PASS; 100 successes + 100 conflicts mỗi round |
| Webhook bị từ chối | Bounded seam + availability=0 + unavailable dashboard | Unit reason bound, promtool unavailable; no fake payment endpoint | **Pending AC: main chưa có handler producer thật** |
| Vượt ngưỡng gửi cảnh báo | Prometheus for/min sample → Alertmanager independent Email+Telegram routes → receiver | `verify-s43` traffic + Pending/Firing/Resolved, both PASS, each fail/recover/dedup | CI local lifecycle PASS tại dc29e4e; external Pending |
| Health/freshness/no data/reset | Private credential exporter, up/expected target count and panel masks | Unit off/fail open; runtime restart/down/recovery; rule no-data/reset | Unit PASS; CI Docker integration PASS tại dc29e4e |
| Worker hiện có | duration/error/cleaned/last-success, fail open, no cadence/TTL changes | Unit collector throw/sweep retry/off; real expired run fixture | Unit PASS; CI Docker integration PASS tại dc29e4e |
| Job backlog/age, email/refund failure | Inventory unavailable, không tạo subsystems mới | Source main inventory | N/A/chưa có producer/query nghiệm thu; không healthy 0 |
| Dashboard history/filter/mobile/viewer | Provisioned Grafana, auth required, code dashboard | Actual browser desktop/mobile + role/API checks | CI browser 6 checks PASS tại dc29e4e; fixture cleaned, 390px không overflow; No data/error/recovery PASS |
| S-01/DoD staging | Existing local/code/CI base integrated | S43 CI head SHA separate from baseline CI; no deployment in scope | Staging Pending, S-01 không fully Done |

## Local checks đã chạy

Node `v24.21.0`, pnpm `10.15.1`; frozen install baseline PASS, lock updated chỉ thêm `@prometheus-io/client` 0.16.1 và transitive peers; Prisma generate 7.10.0 PASS. `pnpm lint` PASS; `pnpm typecheck` PASS sau sửa test typing; `pnpm test` API 14 tests PASS (4 files), web 14 PASS; `pnpm build` API + Next.js PASS. Final HEAD sẽ chạy lại checks liên quan sau các sửa tiếp theo; không dùng kết quả này làm CI remote.

Unit regression bao phủ metric không làm worker dừng khi inc/set/observe throw; failed sweep vẫn retry theo 60s; off không sweep. Review chỉ đọc ban đầu đã chỉ ra fail-open/stale/missing-target/last-success/timeline và đã sửa source; chưa gọi đó là approval SHA cuối hoặc human review.

Docker Desktop 29.5.3 ban đầu kết nối được, image pull/build đang thực hiện thì engine mất kết nối; host log báo WSL unmount disk `Operation not permitted`. CLI engine/status bị treo. Không reset/prune/delete DB/volume để xử lý. Cần runtime hồi phục hoặc CI Linux để chạy full evidence; không tuyên bố Docker/config/promtool/integration đã PASS khi chưa có exit 0. Request PO khởi động lại Desktop không reset dữ liệu trong lúc tiếp tục phần độc lập.

Sau PO khởi động lại, `docker info` kết nối lại 29.5.3; setup và Compose config --quiet PASS. Build tiếp tục sau DNS/package retry, API image build thành công nhưng migration image export thất bại `input/output error` tại Docker containerd tmpmount. Full stack/browser trên máy Windows vẫn Pending; không reset/prune/xóa volume hay coi CI Linux PASS là Windows local PASS.

## CI, runtime và delivery

Workflow `S43 monitoring / S-43 / monitoring-integration` có frozen install, reproducible config diff, isolated image/DB/network/ports, official promtool/amtool, HTTP/collector/transport verifier, bounded waits/nonzero assertions và sanitized artifact. External mode forbidden in CI. PR #49: ba required checks T-02 và toàn bộ S43 PASS ở head dc29e4e. Mọi head sửa tiếp theo phải có CI cùng SHA trước approval/merge; kết quả lịch sử không thay gate final head. T31 giữ nguyên và FAIL NFR p95 baseline; không tắt test.

Raw runtime sẽ ở gitignored `evidence/s43/runtime/integration.json`, hoặc CI artifact `s43-monitoring-evidence`. Report source SHA, status/latency samples, bounded series, benchmark before/after và local receiver IDs/digests. Không raw messages hoặc PII. Local SMTP accepted/Telegram emulator message ID chỉ chứng minh local transport, không provider/người thật.

External: recipient Email + private Telegram được PO chốt ở quyết định local; sender/bot đã được điền trong env riêng tại máy. Chat được setup xác minh đúng ID private trước gửi, không đọc messages riêng. Một lượt controlled native Alertmanager Email+Telegram Firing/Resolved đã chạy, bằng chứng và giới hạn ở dưới; PO acknowledgment và lịch trực/response ownership Pending tại thời điểm ghi tài liệu. Không đóng Issue hoặc đánh Done workbook. Benchmark CI đã đo và NFR FAIL trước/sau; không sửa logic giữ ghế ngoài S-43.

Retention/resource limits và Render Free boundaries xem [runbook](S43_MONITORING_RUNBOOK.md). Không deploy, paid service, image publish hoặc protection change trong lượt này.

Codex Security diff scan 52e7089d-aba1-4973-88a2-429903a376b3 hoàn tất tại immutable 2fd86f793a5667d8b38b3dcfc077989fa77fabc5: 22/22 changed source-like files reviewed, 0 reportable findings trong static offline scope. Không advisory lookup/runtime security probes; không áp kết quả scan cũ cho SHA sửa tiếp theo. Review delta/final SHA riêng trước approval. Daybreak access chưa được cấp; protected result visibility có giới hạn.

## Evidence CI đã quan sát (chưa phải approval final head)

[Run 37459443696](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/37459443696), PR head db1f117e373348d2864c52132b452fd7b4f58703: **whole S43 CI PASS** sau delta legend/environment/transport filter và external exact-name+nonce routing. Ba required T-02 checks cùng SHA PASS; T31 vẫn FAIL NFR hiện hữu. Commit tài liệu tiếp theo vẫn phải qua checks ở SHA mới trước approval/merge.

[Run 37434773639](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/37434773639), PR head dc29e4e5fc08f5566a30d8e5ae0679817b128a2c, checkout merge tạm 394fddda460ea31a4a1879db3d3e43ce2f8a6655: **whole S43 CI PASS**, official config/rules PASS, integration 41 checks PASS và browser 6 checks PASS. Integration cleanupErrors=[]; Viewer fixture cleaned=true; desktop/filter/history/No data/datasource failure+recovery PASS; runtimeErrors=0. Mobile viewport/document đều 390px. Sáu private-dashboard discovery 404 là request Grafana khi dashboard private, được ghi riêng; không bỏ qua console errors khác. Ảnh desktop/mobile/worker-alerts/query-error đã inspect thực tế. Các panel bên dưới được scroll để Grafana render/query, không dùng full-page screenshot có khoảng trống virtualization làm bằng chứng tất cả panel.

Raw benchmark của run này: off 600 samples p95 931.783ms; on 600 samples p95 919.252ms; delta -12.532ms (-1.345%). Cả hai NFR FAIL; biến thiên so với run trước cho thấy không thể suy ra speedup/causal regression từ modes tuần tự. Mỗi round 100 success + 100 conflict; ba alert cases đều Pending/Firing/Resolved, failure từng kênh + retry/recover/dedup PASS. Receiver lọc alertName từ payload thực, không gán nhầm alert khác theo control flag.

Source bàn giao bổ sung legend environment cho worker aggregates, legend Email/Telegram và environment filter cho notification panels sau khi ảnh cho thấy legend trống; external routing chỉ tên+nonce của lượt controlled mới. Các delta này cần rerun final head và review riêng. Receipt external/staging/owner-SLA vẫn Pending.

[Run 37432913608](https://github.com/TTCS-T926-K19C5-N2/thudemo/actions/runs/37432913608), PR head 8c21fefd8d06d479cbcca48f77e6bdf8a4d32550, checkout merge tạm af2ce94cd10e50dbf61ed251764f02b21c4771da: official config/rule validation PASS; integration **41 checks PASS**, cleanupErrors=[]; ba alert test Pending/Firing/Resolved, exact one accepted Firing per channel, failure/retry/recovery independently PASS. Local receiver delivery IDs/digests nằm trong artifact integration.json, không provider external. Whole run vẫn **FAIL ở browser error-tooltip assertion**; không dùng integration PASS để ghi whole CI PASS. Source sửa tooltip theo Grafana 12.1.1 PanelStatus và mobile reload/overflow đang rerun.

Raw benchmark 600 samples/mode, 200 concurrency, 100 seats, same image: metrics off p95 876.796ms; on 911.806ms; delta +35.010ms (+3.993%). Cả hai NFR FAIL. Ba rounds/mode tuần tự chưa là thống kê capacity hoặc bằng chứng nhân quả regression; raw samples trong artifact, histogram 5m là estimate riêng. Các checks T31 hiện hữu vẫn FAIL và giữ nguyên.

Browser đã thực thi: anonymous 401, Viewer read allowed/save403/admin403, fixture cleanup thành công; đã tải ảnh actual desktop/mobile/No data. Ảnh được inspect: percent axis default bị 10000% khi toàn zero và mobile resize giữ geometry cũ; source đã đặt fraction axis0..1 và reload ở viewport390px, thêm overflow assertion. Chưa gán browser gate PASS trước rerun.

## Controlled external transport ngày 06/10/2026

Credentials chỉ được đọc từ env/runtime private; không ghi recipient/token/password trong artifact công khai. Docker Windows vẫn lỗi storage nên dùng binary **Alertmanager 0.28.1 Windows chính thức**, kiểm SHA256 với release `sha256sums.txt`, tiến trình riêng loopback 127.0.0.1:19093, fresh state, không collector nghiệp vụ/DB/Docker. Đây là controlled provider transport test, **không phải full local Docker stack, staging hoặc production**.

Lượt duy nhất khoảng 19:00–19:01 Asia/Saigon, source db1f117: chat private đã đối chiếu quyết định; routes chỉ exact alertname và nonce mới, alert expiry 90s so với repeat 4h. Alert API Firing → native Email STARTTLS Gmail và Telegram → API Resolved. Counter `alertmanager_notification_requests_total` tăng từ 0 lên 2 **mỗi kênh**, failed requests=0; đây là counter tăng sau notifier trả về, không dùng `notifications_total` tăng trước request để suy ra acceptance. [RetryStage source 0.28.1](https://github.com/prometheus/alertmanager/blob/v0.28.1/notify/notify.go), [Telegram notifier](https://github.com/prometheus/alertmanager/blob/v0.28.1/notify/telegram/telegram.go).

SMTP/native Telegram client response evidence PASS cho hai trạng thái. Bước trích xuất Telegram message ID từ buffer riêng bị lỗi, IDs không được lưu; gate report chi tiết `providerTransportPass=false`, `nativeTransportCountersPass=true`, `messageIdsCaptured=false`. Không gọi đây là provider receipt ID đầy đủ hoặc người nhận đã đọc, không gửi lại để lấy IDs. Report masked ở gitignored `evidence/s43/runtime/external-windows.json`. PO được hỏi xác nhận đủ Firing/Resolved cả hai kênh; acknowledgment Pending lúc ghi tài liệu. Tiến trình riêng đã dừng, setup local routing restored=true. Không để chế độ external chạy nền và không broadcast.
