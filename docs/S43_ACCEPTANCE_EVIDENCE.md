# S-43 — acceptance evidence

Status: **PARTIALLY DONE / implementation đang chuẩn bị PR**, issue [#48](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/48) giữ mở. Baseline `origin/main` refresh dưới Sáng ngày 06/10/2026: `bae27719e0af98063eee96507a236f3bacc08fc7` (PR #39). Worktree sạch riêng `thudemo-s43-monitoring-20261006`, branch `story/S-43-monitoring-alerting`. Preview `thudemo` không sửa/reset/stash; checkpoint binary tracked patch và hash manifest 912 paths ở parent `.codex-tmp/s43-checkpoint-20261006`, không đưa vào Git. Không mang WIP Sprint 2 vào story PR.

## Ma trận AC → implementation → test → evidence → trạng thái

| AC/định nghĩa | Implementation | Test/evidence chạy lại | Trạng thái |
|---|---|---|---|
| Số requests/rate | Middleware trước parser/guard, finish/abort once, bounded labels | Unit completion/close/privacy; `verify-s43` known HTTP counts + Prometheus series | Unit PASS; runtime pending |
| Tỉ lệ lỗi | 5xx/all responses, 4xx/409/499 riêng, zero denominator Unknown | Unit statuses; official promtool sustained/equality/min samples/no data | Unit PASS; promtool/runtime pending |
| p95 response | Monotonic seconds histogram, sum buckets before quantile, 5m, resolution documented | Unit histogram; promtool two-instance known distribution; raw same-build benchmark | Source + unit PASS; numeric/runtime pending |
| Tranh chấp ghế | 409 + SEAT_CONFLICT only, failed request count | Unit other 409 excluded; two buyers/product API/real DB fixture | Unit PASS; producer thật có sẵn, runtime pending |
| Webhook bị từ chối | Bounded seam + availability=0 + unavailable dashboard | Unit reason bound, promtool unavailable; no fake payment endpoint | **Pending AC: main chưa có handler producer thật** |
| Vượt ngưỡng gửi cảnh báo | Prometheus for/min sample → Alertmanager independent Email+Telegram routes → receiver | `verify-s43` traffic + Pending/Firing/Resolved, both PASS, each fail/recover/dedup | Local runtime/CI pending; external Pending |
| Health/freshness/no data/reset | Private credential exporter, up/expected target count and panel masks | Unit off/fail open; runtime restart/down/recovery; rule no-data/reset | Unit PASS; runtime pending |
| Worker hiện có | duration/error/cleaned/last-success, fail open, no cadence/TTL changes | Unit collector throw/sweep retry/off; real expired run fixture | Unit PASS; runtime pending |
| Job backlog/age, email/refund failure | Inventory unavailable, không tạo subsystems mới | Source main inventory | N/A/chưa có producer/query nghiệm thu; không healthy 0 |
| Dashboard history/filter/mobile/viewer | Provisioned Grafana, auth required, code dashboard | Actual browser desktop/mobile + role/API checks | Pending browser/runtime |
| S-01/DoD staging | Existing local/code/CI base integrated | S43 CI head SHA separate from baseline CI; no deployment in scope | Staging Pending, S-01 không fully Done |

## Local checks đã chạy

Node `v24.21.0`, pnpm `10.15.1`; frozen install baseline PASS, lock updated chỉ thêm `@prometheus-io/client` 0.16.1 và transitive peers; Prisma generate 7.10.0 PASS. `pnpm lint` PASS; `pnpm typecheck` PASS sau sửa test typing; `pnpm test` API 14 tests PASS (4 files), web 14 PASS (5 files); `pnpm build` API + Next.js PASS. Final HEAD sẽ chạy lại checks liên quan sau các sửa tiếp theo; không dùng kết quả này làm CI remote.

Unit regression bao phủ metric không làm worker dừng khi inc/set/observe throw; failed sweep vẫn retry theo 60s; off không sweep. Review chỉ đọc ban đầu đã chỉ ra fail-open/stale/missing-target/last-success/timeline và đã sửa source; chưa gọi đó là approval SHA cuối hoặc human review.

Docker Desktop 29.5.3 ban đầu kết nối được, image pull/build đang thực hiện thì engine mất kết nối; host log báo WSL unmount disk `Operation not permitted`. CLI engine/status bị treo. Không reset/prune/delete DB/volume để xử lý. Cần runtime hồi phục hoặc CI Linux để chạy full evidence; không tuyên bố Docker/config/promtool/integration đã PASS khi chưa có exit 0. Request PO khởi động lại Desktop không reset dữ liệu trong lúc tiếp tục phần độc lập.

## CI, runtime và delivery

Workflow `S43 monitoring / S-43 / monitoring-integration` có frozen install, reproducible config diff, isolated image/DB/network/ports, official promtool/amtool, HTTP/collector/transport verifier, bounded waits/nonzero assertions và sanitized artifact. External mode forbidden in CI. Chưa có remote CI head SHA tại thời điểm tài liệu này.

Raw runtime sẽ ở gitignored `evidence/s43/runtime/integration.json`, hoặc CI artifact `s43-monitoring-evidence`. Report source SHA, status/latency samples, bounded series, benchmark before/after và local receiver IDs/digests. Không raw messages hoặc PII. Local SMTP accepted/Telegram emulator message ID chỉ chứng minh local transport, không provider/người thật.

External: recipient Email + private Telegram được PO chốt ở quyết định local; credentials sender/bot chưa có bằng chứng cấu hình. Không gửi thật, không đọc messages riêng. Provider acceptance Pending; PO acknowledgment Pending; lịch trực/response ownership Pending. Không đóng Issue hoặc đánh Done workbook. Benchmark NFR baseline/after chưa đo: không gán PASS; báo đỏ nếu baseline >=300ms, không sửa logic giữ ghế ngoài S-43.

Retention/resource limits và Render Free boundaries xem [runbook](S43_MONITORING_RUNBOOK.md). Không deploy, paid service, image publish hoặc protection change trong lượt này.
