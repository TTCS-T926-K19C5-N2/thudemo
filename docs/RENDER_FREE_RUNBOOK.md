# Render Free — cấu hình chuẩn bị local, chưa upload/deploy

Ngày 04/10/2026; áp dụng DEC-11. **Ngân sách 0. Không commit, push, PR, publish image, upload source hoặc tạo dịch vụ trong phase này.** Các bước Dashboard/ghi staging dưới đây dành cho phase sau khi PO cho phép rõ phiên bản và thao tác. Không gửi secret trong chat. Tài khoản Render, quota còn lại và khả năng tạo resource chưa được kiểm trên Dashboard.

## 1. Profile và điều đã kiểm

Repository root là `thudemo/`, không phải thư mục cha. [render.yaml](../render.yaml) có bốn resource đều ghi `plan: free`, cùng Singapore; auto-deploy đang **off**. Đã validate offline bằng JSON Schema chính thức và guard ngân sách. Đây không phải provider provisioning/Render build evidence.

| Resource | Name | Runtime/cấu hình | Health |
|---|---|---|---|
| API | sang-event-api | Docker, SERVICE_ROLE=api, NODE_ENV=production | /health |
| Web | sang-event-web | Docker, SERVICE_ROLE=web, NODE_ENV=production | /api/health |
| Database | sang-event-postgres | Free, PostgreSQL **15**, database sang_events_staging, user sang_events | API query |
| Cache | sang-event-cache | Free Key Value, noeviction, persistence off, external IP allow list rỗng | API ping |

Không có worker, cron, disk, preview hoặc registry. Không triển khai nguyên Compose lên Render. Dockerfile cuối có stage `render`, dùng lại build API/web và chạy **một** role theo env. Dashboard/Blueprint không có trường `--target`: giữ Dockerfile path `./Dockerfile`, context `.`, Docker command trống để dùng CMD. Migration target riêng chỉ dành cho operator local.

Docker đã build local; runtime API/web user `node`, port platform `PORT`, bind `0.0.0.0`. Hai container kiểm local giới hạn RAM 512MiB; lúc lấy mẫu API khoảng 114MiB và web 99MiB. Đây là mẫu sau smoke/browser, **không** chứng minh đủ CPU, quota build hay tải Render. Image runtime ban đầu khoảng 206MB; build Render vẫn phải đo trên tài khoản thật, không giữ máy thức để tạo bằng chứng.

## 2. Giới hạn đã xác minh và khác biệt TECH-01

Nguồn chính thức kiểm ngày 04/10/2026: [Free](https://render.com/docs/free), [Blueprint](https://render.com/docs/blueprint-spec), [Docker](https://render.com/docs/docker), [Key Value](https://render.com/docs/key-value), [Postgres](https://render.com/docs/postgresql-creating-connecting), [Deploy](https://render.com/docs/deploys), [Health](https://render.com/docs/health-checks).

- Web ngủ sau 15 phút không có inbound traffic; wake thường khoảng một phút. Quota 750 giờ web/tháng chia sẻ giữa **hai** service và các service khác trong workspace. Không có card thì vượt quota có thể suspend; không thêm card/nâng gói để giải quyết.
- Free web không nhận private-network traffic. Web proxy đến **HTTPS public URL của API**, API truy cập database/cache qua internal URL cùng region. Không dùng private API hostname trong profile Render.
- Free Postgres 1GB, một database/workspace, hết hạn 30 ngày, có 14 ngày grace rồi dữ liệu bị xóa. Không có managed backup; ghi ngày hết hạn từ Dashboard, export trước hạn (nhắc nội bộ ngày 20/25/28), tuân thủ DEC-08 về retention. Không gọi export thủ công là S-55 đã Done.
- Key Value mới dùng **Valkey 8**, không phải Redis 7 trong TECH-01 local. Đây là adapter triển khai của host đã chọn: ioredis, PING/GET/SET/TTL/DEL/EVAL được kiểm bằng 10 integration test trên Valkey 8 local; chưa có bằng chứng managed service. Local Compose vẫn Redis 7, không nâng dependency/stack âm thầm. Free cache mất toàn bộ state khi restart; catalog dựng lại từ PG, counter/login lock mất qua restart là rủi ro cần PO xem, không phải ownership durable.
- Free không có Background Worker, cron, SSH, shell, one-off job, pre-deploy command, disk hoặc multi-instance scale. Scheduler trong API (nếu được triển khai sau gate K-01) chỉ chạy khi API thức; **chưa đáp ứng worker mỗi phút liên tục**. Hiện chưa có product hold/expiry worker.
- Free rollback chỉ hai phiên bản deploy trước gần nhất. Chưa deploy nên chưa có version để rollback; local negative startup không chứng minh rollout Render.

## 3. Dashboard — chỉ thực hiện sau quyền upload/deploy

1. Đăng nhập tài khoản của PO. Xem Workspace Billing/Usage: không có payment method, đủ Free allowance, chưa có PG/Key Value Free chiếm quota. Nếu không có lựa chọn Free hoặc hiện giá khác 0: dừng bước tạo, ghi giới hạn; không chọn gói mặc định.
2. New → PostgreSQL: nhập tên/database/user ở bảng, Singapore, PostgreSQL 15, Free. Giữ external access đóng; sau này operator chỉ mở **IP hiện tại/32** tạm thời để migrate/export. Không mở `0.0.0.0/0`. Kết quả: Available và expiry date ghi trong checklist không chứa credentials. Nếu không cho pin 15, dừng deployment và báo tương thích cần chốt, không dùng 18 thay thế ngầm.
3. New → Key Value: tên ở bảng, Singapore, Free, noeviction, persistence off. External access đóng. Internal auth có thể bật theo Dashboard nhưng phải cập nhật URL của API khi bật; restart sẽ mất cache/counter. Kết quả: Available; chỉ copy internal URL vào env của API.
4. Sau khi **được phép đưa source revision lên remote**, chọn repo/branch đã được review và đúng SHA. Có thể dùng Blueprint `render.yaml` hoặc hai New → Web Service. Blueprint sync cũng upload cấu hình và lần tạo đầu sẽ build/deploy dù autoDeploy off, vì vậy chưa bấm trong phase hiện tại.
5. Hai Web Service: Singapore, Docker, Free, Dockerfile/context như mục 1, auto deploy off, health đúng bảng. Không Static Site vì Next cần server/proxy. Thêm env theo mục 4. Tên URL có thể có hậu tố do trùng tên; dùng URL Dashboard cấp thật.
6. Migration phải xong trước smoke nghiệp vụ. Free không có pre-deploy: dùng operator local ở mục 5. Khi tạo lần đầu API có thể health fail cho tới khi DB cập nhật; không báo deploy thành công trước health. Web chưa public demo cho tới khi login/permission/fixture smoke PASS.
7. Khi cho phép auto-deploy và CI của revision mới PASS: Dashboard Settings → Auto-Deploy → **After CI Checks Pass** (Blueprint tương ứng checksPass). Chọn branch đã thống nhất. Trước migration mới: tạm off auto deploy, export, apply migration tương thích, kiểm DB, sau đó bật lại có phê duyệt. Không dùng deploy hook trong phase này.

## 4. Env và HTTPS/cookie

| Service | Env | Nhập ở đâu / cách kiểm |
|---|---|---|
| API | SERVICE_ROLE=api; NODE_ENV=production | Manifest hoặc Dashboard |
| API | DATABASE_URL | Internal PG URL (secret, fromDatabase trong Blueprint) |
| API | REDIS_URL | Internal Key Value URL redis/rediss (secret, fromService) |
| API | WEB_ORIGIN | HTTPS web URL **chính xác**, không slash cuối |
| Web | SERVICE_ROLE=web; NODE_ENV=production | Manifest hoặc Dashboard |
| Web | API_INTERNAL_URL | HTTPS **public** API origin, không path/query/credential/slash cuối |

Render cấp PORT; không cố định 3000/3001 trên platform. Web `/api/*` đọc API_INTERNAL_URL khi runtime, giữ Origin và host-only HttpOnly/Secure/SameSite cookie; client gọi cùng origin web, không gọi API domain trực tiếp. Không đặt DATABASE_URL/REDIS_URL/password trong NEXT_PUBLIC_*, build args, Dockerfile/layer hoặc screenshot.

Kiểm browser: đăng nhập trên web HTTPS, session cookie thuộc web, HttpOnly/Secure; refresh vẫn có phiên; BUYER không mở pricing, organizer chỉ sửa event của mình; logout hủy phiên. DevTools chỉ xem flags, không chụp value cookie. POST sai Origin phải 403, request không phiên 401. 429 phải có hướng dẫn retry; 503 có retry, không giả vờ giữ thành công. Nếu login báo403, kiểm WEB_ORIGIN khớp URL đang mở; nếu503, xem health/log trong Dashboard, kiểm DB/Key Value URL và region; không in URL ra log để debug.

## 5. Migration và seed operator — không SSH/pre-deploy

Chỉ chạy lệnh có ghi remote sau PO phê duyệt thao tác **migrate/seed dữ liệu giả** trên database staging cụ thể. Token env dưới đây chỉ là guard, không thay sự cho phép của PO.

1. Bật external PG đúng IP/32 tạm thời, lấy External Database URL từ Connect và nhập vào biến môi trường qua prompt ẩn. Không dùng URL trong tham số CLI/ghi vào repo. Với Node/Prisma đặt `sslmode=verify-full` để kiểm TLS; nếu TLS fail, kiểm CA/hostname, không tắt xác minh.
2. Từ root thudemo với runtime đúng, frozen install, Prisma generate (URL vẫn chỉ env):

```powershell
$taskSecure = Read-Host 'External URL staging (không gửi trong chat)' -AsSecureString
$env:DATABASE_URL = [System.Net.NetworkCredential]::new('', $taskSecure).Password
npx --yes pnpm@10.15.1 --filter api exec prisma migrate status
# Xem danh sách migration: chỉ migration mới có review, giữ mọi file đã áp dụng.
npx --yes pnpm@10.15.1 --filter api exec prisma migrate deploy
npx --yes pnpm@10.15.1 --filter api exec prisma migrate status
```

Exit0/status up-to-date là kết quả mong đợi; không dùng db push/reset/resolve giả. Không log full command env. Nếu dùng migration image local thay CLI: build `docker build --target migration -t sang-event-migration:local .`, `docker run --rm -e DATABASE_URL sang-event-migration:local`; **không publish**. Image có Prisma CLI, không mang secret build-time. Operator cần external network tới PG; internal hostname không dùng được từ máy PO.

3. Seed một lần, chỉ **database sang_events_staging, user sang_events, external dpg-*.render.com, TLS verify-full, database rỗng**:

```powershell
$taskSecure = Read-Host 'Mật khẩu riêng >=16 ký tự cho hai tài khoản giả' -AsSecureString
$env:SPRINT2_DEMO_PASSWORD = [System.Net.NetworkCredential]::new('', $taskSecure).Password
$env:RENDER_WRITE_APPROVAL = 'seed-synthetic-staging-after-po-approval'
npx --yes pnpm@10.15.1 --filter api exec node scripts/seed-render-staging.mjs
Remove-Item Env:SPRINT2_DEMO_PASSWORD, Env:RENDER_WRITE_APPROVAL
```

Kết quả: hai tài khoản **staging-organizer@example.invalid**, **staging-buyer@example.invalid**, password Argon2id; năm role, không admin account, không email thật. Script khóa bảng và từ chối DB có users/events/showtimes/seats; chạy lại phải exit1 và không đổi dữ liệu. Nếu seed fail do DB không rỗng, dùng tài khoản giả đã có hoặc điều tra fixture, không reset để chạy lại. Seed local cũ `seed-design-fidelity` chỉ hỗ trợ DB local, **không** dùng nó trên Render.

4. Organizer login → /events → tạo sự kiện giả → tạo suất tương lai → nạp fixtures/seat-map-2000.json → preview → confirm → đặt giá VIP/Standard/Balcony integer VND → mở bán. Invalid JSON/giá âm không được ghi. Buyer xem catalog/detail/map. Chưa K-01 approved thì giữ ghế không khả dụng; không demo fake timer. Ghi event/showtime ID của run vào checklist, cleanup chỉ fixture đó sau review/retention; không xóa toàn DB.
5. Xóa DATABASE_URL khỏi env operator và đóng external IP allowance khi xong. Runtime API dùng internal URL, không bị ảnh hưởng.

## 6. Export/import thủ công và rollback

Export chứa password hash/session/dữ liệu giả, phải giữ private ngoài Git; không attach dump vào PR/chat. Đặt dưới `.git/staging-backups`, tên có ngày/ID; sau retention xóa theo DEC-08 với phạm vi chính xác. External URL nhập ẩn như mục 5, PGDATABASE nhận URL trong env, không lộ trên command line:

```powershell
# Sau phê duyệt export, target là staging giả và external IP/32 đã mở.
$env:PGDATABASE = $env:DATABASE_URL
$taskBackupDir = Join-Path (Get-Location) '.git/staging-backups'
New-Item -ItemType Directory -Force $taskBackupDir | Out-Null
docker run --rm -e PGDATABASE -e PGSSLROOTCERT=/etc/ssl/certs/ca-certificates.crt `
  --mount "type=bind,source=$taskBackupDir,target=/backup" postgres:15-alpine `
  pg_dump --format=custom --file=/backup/staging-approved-run.dump
# Kiểm exit0 và hash/size; không đọc hoặc upload nội dung dump.
Remove-Item Env:PGDATABASE, Env:DATABASE_URL
```

Trước import: PO xác nhận target **mới/rỗng**, đúng PostgreSQL15/TLS/IP, migrations và dữ liệu không có. Dùng `pg_restore --exit-on-error --dbname` (database name/URL qua env), **không --clean/drop/reset**. Nếu target có dữ liệu, dừng; không restore chồng để giả lập rollback. Free chỉ một PG/workspace nên việc có target Free mới còn tùy quota/lifecycle, chưa được chứng minh. Trong phase này đã dump/restore vào hai DB **local mới**, trả2users và8migrations; không là backup/restore managed Render evidence.

Rollback app: Dashboard → service → Events → chọn một trong hai revision deploy trước → Rollback; kiểm /health, /api/health và login/cookie. API/web rollback phối hợp giữ contract; giữ schema additive/migrations/data. Nếu cần schema rollback, chỉ migration bù **mới** sau backup/đánh giá dữ liệu; không sửa/xóa migration đã áp dụng. Không dùng database deletion để rollback.

Phép kiểm T-03 phase sau: ghi SHA/version hiện tại và health, đo từ merge timestamp tới health/demo mới (<10phút); triển khai revision lỗi build/start/health đã cô lập, xác minh phiên bản cũ vẫn healthy và SHA cũ đang phục vụ. Sau đó revision hợp lệ phải hoạt động. Chưa có phép kiểm này trên Render; deploy thất bại phải thu log thật, không thay bằng screenshot nút Dashboard.

## 7. Tái kiểm local và dừng

Node24.21.0, pnpm10.15.1, Docker Linux. Evidence mới `evidence/render-free/20261004/`; không ghi đè lịch sử cũ.

```powershell
npx --yes pnpm@10.15.1 install --frozen-lockfile
./scripts/verify-stitch-correction.ps1 -Run render-free/20261004
node --test apps/api/scripts/render-staging-target.spec.mjs
# DB sprint2_integration/Redis local thật, runner thiết lập đúng env:
$env:SPRINT2_EVIDENCE_DIR = '../../evidence/render-free/20261004'
./scripts/run-sprint2-local.ps1 -Mode Test
./scripts/verify-k01-candidates.ps1
```

Browser profile đang kiểm: http://localhost:3100, API http://localhost:3101. Dữ liệu stitch_fidelity, hai tài khoản design-*@example.invalid với password fake local đã nhập trước; lấy từ nơi riêng trên máy, không trong tài liệu. Profile nguyên bản vẫn cổng3000/3001 theo TECH-01. Chỉ dừng đúng container sở hữu `sang-render-*` khi cần, không dừng stores của dự án khác. Không `docker compose down -v`/xóa DB; giữ dataset/migration history.

Rollback code chọn lọc qua `.git/render-free-wip-20261004/files/` và before.patch sau khi kiểm WIP từng file; không reset repo. Tắt auto-deploy giữ off, không có remote revision nào được tạo trong phase này.


## 8. DEC-12 — cấu hình quyền giữ và worker local mới

PGauthoritative được phê duyệt **local**, khôngK01stagingPASS. Migration005 phải deploy trướcAPI mới; không sửa/xóa migration đã áp dụng. PGURL dùng secret Dashboard, pool16/service phải đối chiếu giới hạn managed; Redis/Valkey không giữ quyền. API Blueprint có HOLD_EXPIRY_MODE=api: startup drain và tick60s **khi API thức**. Không worker/cron paidresource; không ping làm giả continuousworker. Localworker thật: `./scripts/run-sprint2-local.ps1 -Mode Worker -Database stitch_fidelity` (cửa sổ riêng, Ctrl+C để dừng). APIlocal dùngmodeoff,workerentrypoint épworker nên không chạy hai scheduler mặc định.

Latestimage sang-event-render:holds-20261004 kiểm local nonroot512MiB/0.5CPU tại3200web/3201API,8realproxy/auth/holdchecks PASS. Dockerprivatehostname chỉ trong networklocal; RenderFree API_INTERNAL_URL phải publicHTTPS đúngrunbook, WEB_ORIGIN đúngwebHTTPS; không suy privateDNSlocal ra Free. Image chỉ local, chưa publish/deploy/upload. LatestT31NFRFAIL750,96ms; chưa sẵn sàng tuyên bố NFR/DoDstaging.

Valkeyrestart mất counter và khóa đăng nhập thật; PG quyền giữ còn nguyên. Cacheunavailablefailclosed không bảo đảm authlock qua restart. PO/engineering phải review risk và chính sách khôi phục/kiểm durability trước dữ liệu thật; không coi DEC12 miễnanti-abuse. FreeAPI ngủ thì expiry query vẫn đúngDBclock, nhưng jobkhông chạy liên tục; khi thức cleanupbacklog idempotent. Unknown Order/Ticketlink chưa thuộcSprint2, phải nối/filter trướcSprint3.

Profile/test hiện tại: [gói nghiệm thu](SEAT_HOLD_LOCAL_EVIDENCE.md), [POreview](SPRINT2_PO_REVIEW.md). Khi dừng chỉ đúng sang-holds-render-api-20261004 / sang-holds-render-web-20261004 và worker của phiên. Không xóa volume/databases hoặc container dự án khác. Giữ schema additive khi rollbackapp; compensationguard chỉđãkiểm trênDBmới/rỗng, không công cụ xóa dữ liệu thật.
