# S-43 — monitoring local và cảnh báo

Phạm vi: NestJS API, hai instance, worker expiry hiện có, PostgreSQL/Redis giả riêng, Prometheus/Grafana/Alertmanager và bộ nhận SMTP/Telegram **local**. Không deploy Render hoặc production. Đây là cấu hình triển khai đề xuất cho S-43, không tự đổi AC/backlog thành Done.

## Từ clone tới dashboard

Yêu cầu Node **24.21.0**, pnpm **10.15.1**, Docker Desktop Linux engine/Compose. Linux CI dùng cùng versions. Chạy từ root repository sạch, không checkout/reset preview WIP:

```sh
pnpm install --frozen-lockfile
node monitoring/build-config.mjs
node monitoring/build-rule-tests.mjs
node monitoring/setup.mjs
docker compose --env-file monitoring/.runtime/compose.env -f monitoring/compose.yaml config --quiet
docker compose --env-file monitoring/.runtime/compose.env -f monitoring/compose.yaml build api-a migration
docker compose --env-file monitoring/.runtime/compose.env -f monitoring/compose.yaml up -d --no-build --wait --wait-timeout 180
```

`setup.mjs` tạo credentials ngẫu nhiên trong `monitoring/.runtime/` đã gitignore; không xoay password đã tồn tại. Trên POSIX thư mục cha có mode 0700, chặn tài khoản host khác truy cập; file secret/config bind-mounted có mode 0444 để UID riêng của Grafana/Prometheus/Alertmanager/Node đọc được trong container. DB password và Compose env giữ mode 0600. Trên Windows, setup bỏ ACL kế thừa và cấp riêng tài khoản hiện tại/SYSTEM/Administrators cho thư mục runtime; env private ngoài thư mục này cần cùng mức bảo vệ. Credentials external dùng file riêng, chạy setup mặc định khôi phục local routing mà không ghi đè bot fixture. Không sao chép `.runtime`, `.env.monitoring.local` hoặc dữ liệu Grafana vào Git/evidence/chat. Không dùng `docker compose config` không có `--quiet` trong evidence vì output chứa DB credential.

Mở [dashboard](http://localhost:13000/d/s43-monitoring) và đăng nhập `operator`; password ở file `monitoring/.runtime/grafana-password`, đọc riêng tại máy. Không anonymous hoặc token Grafana admin trong frontend. Operator có thể quản lý datasource/user/silence; cấp user **Viewer** để chỉ xem và query, không sửa dashboard/config/silence. Dashboard provisioned-as-code không cho sửa qua UI. Role hệ thống này độc lập với ORGANIZER trong app.

API thử ở `127.0.0.1:18001` và `18002`; PostgreSQL fixture ở `127.0.0.1:15443`. Không dùng DB này cho dữ liệu thật. Metrics listen riêng ở port 9464, không có route `/metrics` công khai của API; trong Compose không publish metrics port. Mọi scrape cần bearer token riêng. Prometheus/Alertmanager/receiver chỉ ở network Compose; Grafana/DB/API chỉ publish loopback. Docker network thuộc quyền operator, không phải isolation trước người đã có quyền Docker. Với API chạy trực tiếp trên host, mặc định metrics bind loopback; chỉ mở private network có kiểm soát và token nếu collector nằm máy khác.

## Định nghĩa metric và cửa sổ

`ticket_http_requests_total` đếm một lần tại response finish; aborted response (close trước finish) dùng status **499**, nằm trong duration/mẫu số, không trong tử số 5xx. Monotonic `hrtime` đo duration seconds từ middleware trước guard/parser. Không có streaming endpoint trên main; duration của stream tương lai cần định nghĩa riêng. Health `/health`, `/ready`, `/metrics` không tính là traffic nghiệp vụ. JSON parse lỗi trước routing gom `__unmatched__`, method lạ gom OTHER. Route dùng template do framework đăng ký; không raw URL/query, ID, email, IP, token, exception hay request ID.

RPS = sum(rate(total[5m])). Error ratio = rate(5xx)/rate(all completed+aborted), không có mẫu/denominator zero thì Unknown; có traffic và không có series 5xx thì tử số 0 có nghĩa. 4xx/409/499 có panel riêng. `rate/increase` xử lý reset sau restart. p95 = histogram_quantile(0.95, sum(rate(bucket[5m])) by(le,route,...)); cộng phân bố trước quantile, không trung bình p95 các instance. Histogram classic là **ước lượng**, resolution quanh 300ms là bucket 250–300–350ms (tối đa độ rộng bucket chứa quantile); ngoài vùng này độ rộng lớn hơn, >10s chỉ bound +Inf không cho p95 chính xác. Raw HTTP latency còn gồm transport và đọc body, khác server duration.

Conflict là **số request** hold trả 409 + `SEAT_CONFLICT`, không số ghế, không 409 do đóng bán/expiry, không đếm service/controller/retry đôi. Webhook hook chỉ nhận reason enum signature/schema/replay/permission; chưa có handler thật, producer availability=0 và panel “Chưa có nguồn webhook”. Seam test không đóng AC. Email/refund job và backlog/oldest age chưa có producer/query được nghiệm thu. Worker đếm sweep duration/error/cleanup và last success; timestamp 0 chưa có success là Unknown, worker off/down khác backlog=0. Không query toàn bảng trên scrape/request hoặc ghi DB đồng bộ để thu metrics. Worker 60s và deadline hold 10 phút giữ nguyên.

Mất scrape hoặc thiếu một target bắt buộc thì panel tổng/ratio/p95 trả Unknown. Topology local là **hai API + một worker**; ngưỡng expected replicas 2 trong generator/rules phải đổi có chủ đích cùng `targets.json` khi operator thay topology. Freshness panel đo tuổi mẫu scrape; down (`up=0`) không chứng minh ứng dụng đã chết. Prometheus sống ngoài lifecycle API và giữ history qua API restart; không fake counter persisted.

## Rules và lifecycle

Ngưỡng/for/minimum sample được ghi trong `S43_REFINEMENT.md`; chỉ hold 300ms bám NFR đã có. Các ngưỡng volume/error/conflict/rejection là đề xuất cấu hình trong `monitoring/build-config.mjs`, chưa là capacity benchmark đã duyệt. Thay generator rồi regenerate/rule-test/review, không hạ ngưỡng sản phẩm để test.

Alert lifecycle: Normal chỉ khi scrape đủ/healthy và không có alert; biểu đồ ALERTS có legend alertname + Pending/Firing. Khi trở về bình thường series ALERTS vắng; receiver/provider evidence ghi Resolved. Không có dữ liệu là Unknown. Alertmanager group theo alertname/environment/service, group_wait 5s, group_interval 10s, repeat 4h, debounce `for` ở Prometheus. Đây là timing local đề xuất; không tạo tin mỗi request. Email và Telegram là hai receiver routes độc lập (`continue`), retry/backoff do Alertmanager, failures có metric theo integration. Không có custom vòng retry vô hạn; retry dừng khi alert đã resolved/notification không còn actionable; incident kéo dài có repeat interval. Operator giám sát delivery failure và xử lý credentials/provider, không gọi firing là delivered.

Nội dung notification chứa marker kiểm thử, môi trường/service/severity, metric/value/threshold/window, thời điểm, dashboard/runbook. Không payload thanh toán hoặc PII. SMTP server accepted/message ID hoặc Telegram message ID chỉ là accepted vào provider, chưa chứng minh người nhận đã đọc. Browser URL localhost phục vụ local; khi triển khai môi trường riêng, operator phải cấu hình link thật được duyệt.

## Kiểm chứng có thể chạy lại

```sh
docker compose --env-file monitoring/.runtime/compose.env -f monitoring/compose.yaml exec -T prometheus promtool check config /etc/prometheus/prometheus.json
docker compose --env-file monitoring/.runtime/compose.env -f monitoring/compose.yaml exec -T alertmanager amtool check-config /etc/alertmanager/config.json
docker run --rm --entrypoint promtool -v "$PWD/monitoring:/monitoring:ro" -w /monitoring prom/prometheus:v3.5.0 test rules rule-tests.json
```

PowerShell dùng `-v "${PWD}/monitoring:/monitoring:ro"` thay biểu thức Bash trên. Generate Prisma client trước script Node, không reset DB:

```sh
# DATABASE_URL placeholder chỉ phục vụ generate; script tự đọc dedicated fixture secret tại máy.
pnpm --filter api exec prisma generate
node apps/api/scripts/verify-s43.mjs
```

Verifier chỉ kết nối DB s43 fixture loopback:15443, tạo users/event/show/seats run-scoped, request qua buyer sessions thật, và dọn đúng các ID của run trong finally. Không reset volume/schema, không sửa migration hay giữ ghế người khác. Script kiểm HTTP success/401/403/validation/unknown/parse và conflict; inspect exporter/series, restart một API để kiểm reset, stop/start một API để kiểm down; worker cleanup chỉ expiry fixture riêng; load test before/after cùng image/dataset/concurrency; collector→rule Pending/Firing→native fanout→SMTP/Telegram local→Resolved; failure từng kênh và recover/dedup. Config rule **test riêng** ở `.runtime/test-rules.json`, không đổi TTL/ngưỡng sản phẩm. Evidence JSON chỉ status/latency/series labels hữu hạn/delivery ID/digest; không sessions/user IDs/raw payload. CI gọi same local verifier, **cấm external mode**.

Benchmark dùng 200 requests/100 seats, 2 buyers fixture, hai API và 3 rounds mỗi mode; ghi raw samples và pooled p95, không trung bình p95. Đây là phép đo overhead cục bộ có nhiễu do sequential modes, không S-13/T-31 full DoD hoặc capacity production. Nếu baseline >=300ms, NFR giữ ghế vẫn FAIL; monitoring không sửa atomic/SQL để che kết quả. Toàn bộ scripts repo `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, API E2E trên các DB fixture có guard riêng vẫn là gates riêng.

Kiểm browser thật sau verifier, với Chrome cài sẵn:

```sh
npm install --global @playwright/cli@0.1.22
node monitoring/browser.mjs
```

Browser script chỉ dùng Grafana loopback của stack này: tạo Viewer fixture riêng, xác minh anonymous bị chặn/Viewer đọc được nhưng không sửa hay quản trị, tải dashboard history/refresh/filter ở desktop và mobile, kiểm No data và lỗi datasource có kiểm soát rồi recovery. Session state private nằm trong `.runtime`, không in credentials, xóa state và Viewer fixture khi xong. Report sanitized `browser.json`; ảnh ở gitignored `output/playwright/`. Full verifier từ chối routing ngoài receiver local. Cleanup độc lập giữ evidence cả khi bước khác lỗi.

## Email + Telegram external

Hiện credentials sender/bot và end-to-end nhận thật là gate riêng. Không tạo paid service. Cấu hình SMTP bằng credential/app password của nhà cung cấp hỗ trợ STARTTLS, không mật khẩu đăng nhập Gmail thường. Đọc [transport configuration](https://prometheus.io/docs/alerting/latest/configuration/) và tài liệu chính thức của provider SMTP thực tế trước dùng. Chưa chọn provider thật, không coi recipient email là sender account.

Copy `monitoring/.env.example` thành `.env.monitoring.local` private, điền sender/bot và recipient đã được PO xác nhận. Recipient cụ thể không ở repo; lưu đối chiếu vào `.runtime/approved-recipients.json` `{email,telegramChatId}` riêng tại máy theo quyết định PO. File này đã được chuẩn bị trong worktree triển khai, không cần hỏi lại kênh. PO gửi `/start` cho bot. Setup gọi `getChat` đúng chat private, kiểm ID khớp quyết định; không đọc getUpdates/tin nhắn riêng, không in token hoặc URL chứa token. [Telegram API](https://core.telegram.org/bots/api#sendmessage).

```sh
node --env-file=.env.monitoring.local monitoring/setup.mjs --external
docker compose --env-file monitoring/.runtime/compose.env -f monitoring/compose.yaml exec -T alertmanager amtool check-config /etc/alertmanager/config.json
```

`S43_EXTERNAL_TEST_APPROVED=true` chỉ bật cho lượt kiểm thử Firing+Resolved đã được PO ủy quyền, mỗi kênh một lượt, không broadcast. Không chạy full verifier trong external mode: failure/load suite chỉ dành local receiver. Chỉ restart Alertmanager sau khi config hợp lệ; tạo duy nhất một alert kiểm thử có controlled start/end, không trigger lại khi chưa rõ trạng thái delivery. Lưu evidence masked: channel/status/time/provider-accepted ID; không raw email/chat/token. Nếu lỗi một kênh, kênh kia độc lập; kiểm delivery failure và retry, không tự gửi lại spam. PO xác nhận đã thấy email/tin nhắn để nghiệm thu end-to-end. Khi xong, `node monitoring/setup.mjs` trở lại local recipients và restart Alertmanager; không sử dụng external config cho CI.

Owner vận hành, lịch trực và thời gian phản hồi **Cần PO chốt**; không tự cam kết 24/7/SLA. Recipient được xác nhận không có nghĩa đã nhận ca trực.

## Lỗi, stop và rollback

`metrics_exporter_unavailable`: kiểm file/token >=32 ký tự, port/bind và quyền đọc, không log giá trị; API tiếp tục chạy. `up=0`: phân biệt exporter/network/auth/API down; `up` absent: mất target/discovery, Unknown. Worker enabled=0 là off; enabled=1 nhưng last success=0/age cao: sweep failure hoặc chưa chạy. Notification failed: kiểm credential/start chat/SMTP/TLS/network riêng, không log raw response của provider chứa PII.

```sh
docker compose --env-file monitoring/.runtime/compose.env -f monitoring/compose.yaml ps
docker compose --env-file monitoring/.runtime/compose.env -f monitoring/compose.yaml stop
docker compose --env-file monitoring/.runtime/compose.env -f monitoring/compose.yaml down --timeout 10
```

Không dùng `down -v`, prune/delete Docker data hoặc reset DB. Volumes riêng giữ DB fixture/history/receiver. Retention đề xuất: Prometheus 7 ngày/512MB, Alertmanager state 24h; container memory limits trong Compose tổng khoảng 2GB (build cần thêm). Grafana/receiver volume và raw evidence không tự TTL: operator dọn **chỉ test data riêng** sau 7 ngày theo retention đề xuất, không tự thay policy dữ liệu nghiệp vụ. Stack không chạy mặc định trong Compose nghiệp vụ, không thêm tài nguyên khi chưa start.

Rollback code qua revert PR, tắt `MONITORING_ENABLED` và stop stack; giữ nguyên DB nghiệp vụ/migration/WIP. API+worker metrics chỉ enabled theo env, default off; exporter/collector thất bại không đổi business success hoặc worker cadence.

Render Free: stack local không phải monitoring luôn bật trên Render. Cần collector/time-series ở host độc lập đã duyệt trước staging; API free có sleep/restart nên downtime/scrape gaps phải Unknown, không giữ awake bằng scrape, không hứa uptime. Không triển khai collector lên free service rồi gọi giám sát 24/7. Không deploy trong lượt này.
