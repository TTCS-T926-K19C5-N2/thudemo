# Hướng dẫn sử dụng local — build, chạy, đăng nhập và kiểm thử

Cập nhật ngày 04/10/2026. Dành cho Nguyễn Văn Sáng và người review dự án trên Windows/PowerShell. Root ứng dụng là **thudemo/**. Hướng dẫn này dùng database giả **stitch_fidelity**, đúng bộ giao diện và tài khoản đang được review; không dùng dữ liệu thật.

## 1. Nếu bạn chỉ muốn dùng ngay

Ở lần kiểm tra khi viết tài liệu, web/API đang lắng nghe tại cổng 3000/3001; PostgreSQL và Redis local đang chạy. Không cần build hoặc seed lại nếu trang vẫn hoạt động.

1. Mở <http://localhost:3000/login>.
2. Đăng nhập bằng một trong hai tài khoản ở mục 2.
3. Nếu muốn thử chọn/giữ ghế, dùng tài khoản **người mua**, mở liên kết chọn ghế ở mục 7.
4. Nếu muốn quản lý sự kiện, dùng tài khoản **người tổ chức**, mở <http://localhost:3000/events>.

Nếu máy vừa khởi động lại hoặc trang không mở được, làm mục 3 → 4 → 5 → 6 theo thứ tự. Phần tạo mới dữ liệu ở mục 9 chỉ cần khi chưa có container/database/tài khoản.

## 2. Tài khoản đăng nhập nào?

Đã kiểm trực tiếp trong database khi viết tài liệu: cả hai tài khoản tồn tại, đã kích hoạt, đúng vai trò; mật khẩu lưu riêng trên máy khớp với password hash.

| Mục đích | Email | Vai trò | Trang bắt đầu |
|---|---|---|---|
| Quản lý sự kiện, suất diễn, nạp sơ đồ, giá, mở/đóng bán | `design-organizer@example.invalid` | ORGANIZER | `/events` |
| Xem sự kiện, chọn và giữ ghế | `design-buyer@example.invalid` | BUYER | `/` hoặc `/shows/{id}/seats` |

**Hai tài khoản dùng cùng mật khẩu giả local**, nằm trong file riêng `thudemo/.git/stitch-correction-password`. Mật khẩu không được ghi trong tài liệu/chat/Git. Đây không phải mật khẩu PostgreSQL và không phải tài khoản GitHub.

Để mở file xem tại chỗ, từ PowerShell ở root ứng dụng:

```powershell
notepad .git/stitch-correction-password
```

Sao chép mật khẩu vào ô **Mật khẩu** rồi đóng Notepad. Không thay nội dung file khi chỉ muốn đăng nhập. Nếu file không còn: không thể đọc ngược password hash từ database; cần đặt lại mật khẩu đúng hai tài khoản giả, không xóa database hoặc tạo lại toàn bộ dataset.

Tài khoản người tổ chức không có quyền giữ ghế; người mua không có quyền sửa sự kiện/giá. Để thử hai vai trò đồng thời, dùng một cửa sổ thường và một cửa sổ ẩn danh hoặc hai trình duyệt. Hai tab trong cùng cửa sổ thường dùng chung cookie; đăng nhập lại ở một tab sẽ ảnh hưởng tab kia.

## 3. Mở đúng thư mục và kiểm tra máy

Mở PowerShell, chạy:

```powershell
Set-Location -LiteralPath 'D:\Development\03_Academic\Bán vé sự kiện có sơ đồ ghế\thudemo'

# Docker Desktop cần ở trạng thái Engine running / Linux containers.
$env:Path = "C:\Program Files\Docker\Docker\resources\bin;$env:Path"
node --version
npx --yes pnpm@10.15.1 --version
docker version
docker compose version
```

Kết quả mong đợi: Node **v24.21.0**, pnpm **10.15.1**; `docker version` có cả **Client và Server**, phần Server dùng Linux. Các lệnh bên dưới dùng `npx --yes pnpm@10.15.1` để chọn đúng pnpm; không cần nâng dependency.

Nếu PowerShell báo chặn chạy `.ps1`, trong cửa sổ hiện tại có thể chạy:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

Chỉ áp dụng cho cửa sổ hiện tại và các script đã đọc trong repository. Nếu máy bị policy của tổ chức quản lý, cần người quản trị xử lý; không thay policy toàn máy.

### Môi trường review hiện tại

| Thành phần | Địa chỉ/cổng | Tên sử dụng |
|---|---|---|
| Web | `http://localhost:3000` | Next.js chạy trên Windows |
| API | `http://localhost:3001` | NestJS chạy trên Windows |
| PostgreSQL | `127.0.0.1:15432` | `sang-sprint2-postgres-20261004`, database `stitch_fidelity` |
| Redis | `127.0.0.1:16379` | `sang-sprint2-redis-20261004` |
| Worker dọn ghế | Không có cổng HTTP | Một tiến trình Node riêng |

Compose gốc dùng 5432/6379 là profile khác. **Không chạy Compose gốc rồi kỳ vọng runner Sprint 2 tự chuyển sang 5432/6379**: runner đang trỏ cố định 15432/16379. Các ví dụ cũ trong README được giữ làm lịch sử.

## 4. Khởi động PostgreSQL và Redis đang có

```powershell
docker start sang-sprint2-postgres-20261004 sang-sprint2-redis-20261004

docker ps --filter name=sang-sprint2
docker exec sang-sprint2-postgres-20261004 pg_isready -U sprint2 -d stitch_fidelity
docker exec sang-sprint2-redis-20261004 redis-cli ping
```

Mong đợi: hai container `Up`; PostgreSQL báo **accepting connections**; Redis trả **PONG**. Nếu tên container không tồn tại, xem mục 9. Không xóa container/volume để chữa lỗi mật khẩu hoặc kết nối.

Runner `scripts/run-sprint2-local.ps1` tự đặt cấu hình database/cache local trong tiến trình rồi phục hồi môi trường khi thoát. Đối với profile này, bạn không cần sửa `.env` hiện có. Các credential trong runner là dữ liệu thử local, không dùng cho production.

## 5. Cài dependency, migration và build

Chạy ở root ứng dụng sau khi database sẵn sàng:

```powershell
npx --yes pnpm@10.15.1 install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Cài dependency thất bại; dừng tại đây.' }

# Áp dụng migration còn thiếu vào đúng database review.
./scripts/run-sprint2-local.ps1 -Mode Migrate -Database stitch_fidelity

# Chọn cấu hình local cho Prisma generate, không ghi đè .env.
$env:DATABASE_URL = 'postgresql://sprint2:local_fixture_only@127.0.0.1:15432/stitch_fidelity'
npx --yes pnpm@10.15.1 --filter api exec prisma generate
if ($LASTEXITCODE -ne 0) { throw 'Prisma generate thất bại; dừng tại đây.' }

npx --yes pnpm@10.15.1 build
if ($LASTEXITCODE -ne 0) { throw 'Build thất bại; chưa khởi động bản mới.' }
```

Mong đợi:

- Install không thay lockfile; đã cài trước có thể báo `Already up to date`.
- Migration báo áp dụng thành công hoặc `No pending migrations to apply`.
- Prisma generate tạo client tương ứng schema.
- Build tạo `apps/api/dist/` và bản Next.js standalone trong `apps/web/.next/standalone/`.

Đây là build để chạy local, không phải deploy production. Nếu API/web/worker đã chạy, dừng chúng trước khi rebuild để tránh dùng output lẫn giữa hai lần build. Dữ liệu PostgreSQL vẫn giữ nguyên. Sau khi sửa code, build lại và khởi động lại tiến trình tương ứng; runner production không tự cập nhật như dev server.

**Không chạy `prisma db push`, `prisma migrate reset`, `docker compose down -v` hoặc xóa migration** để chữa lỗi build/migration.

## 6. Chạy ứng dụng — ba cửa sổ PowerShell

Mở ba cửa sổ PowerShell riêng. Trong **mỗi cửa sổ**, chuyển vào root ứng dụng bằng lệnh Set-Location ở mục 3. Mỗi lệnh dưới đây chạy lâu dài; giữ cửa sổ mở.

### Cửa sổ A — API

```powershell
$env:WEB_ORIGIN = 'http://localhost:3000'
./scripts/run-sprint2-local.ps1 -Mode Api -Database stitch_fidelity
```

Mong đợi: log **Nest application successfully started**. Kiểm API ở <http://localhost:3001/health>.

### Cửa sổ B — web

```powershell
$env:API_INTERNAL_URL = 'http://localhost:3001'
./scripts/run-sprint2-local.ps1 -Mode Web -Database stitch_fidelity
```

Mong đợi: web mở ở <http://localhost:3000>. Web gọi API qua `/api` cùng origin; đăng nhập trên web, không nhập tài khoản vào trang `/health` của API.

### Cửa sổ C — worker

```powershell
./scripts/run-sprint2-local.ps1 -Mode Worker -Database stitch_fidelity
```

Mong đợi: log `hold_expiry` và `deleted`; worker quét ngay khi khởi động, sau đó mỗi 60 giây. `deleted: 0` là bình thường khi không có quyền giữ quá hạn. Không có website riêng cho worker. Nếu worker không chạy, query vẫn coi ghế quá hạn là trống, nhưng bản ghi cũ chưa được dọn.

Nếu thấy `EADDRINUSE`, ứng dụng cũ có thể đang chạy; không mở thêm API/web cùng cổng. Để xác định tiến trình:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3000,3001 |
  Select-Object LocalPort,OwningProcess
# Thay số bên dưới bằng đúng PID vừa tìm, chỉ xem thông tin trước.
Get-Process -Id 12345
```

Ưu tiên Ctrl+C tại cửa sổ đã chạy ứng dụng. Không tắt tất cả tiến trình Node/Docker hoặc tiến trình dự án khác. Nếu tiến trình do công cụ hỗ trợ kỹ thuật khởi động và không có cửa sổ để dừng, gửi đúng cổng/PID cho công cụ hỗ trợ kỹ thuật xử lý.

## 7. Cách dùng từng vai trò

### A. Người mua — xem sự kiện và giữ ghế

1. Đăng nhập bằng `design-buyer@example.invalid`.
2. Mở trang chủ → chọn sự kiện → chọn suất đang bán → chọn ghế.
3. Có thể mở trực tiếp suất giả đang review:
   <http://localhost:3000/shows/c0100401-0000-4000-8000-000000000001/seats>.
4. Chọn một hoặc hai ghế trống trên sơ đồ. Dùng zoom/thu nhỏ/Fit và cuộn trong bản đồ để xem đủ 2.000 ghế. Có thể dùng Tab để vào sơ đồ, phím mũi tên đổi ghế, Space/Enter để chọn theo hướng dẫn trên map.
5. Bấm **Giữ ghế**. Chỉ coi thành công khi có **Máy chủ đã xác nhận**, các ghế hiển thị đã giữ và có thời hạn máy chủ.
6. Reload trang: deadline không đổi. Chọn thêm một ghế rồi bấm **Giữ thêm ghế**: dùng chung hạn gốc, không khởi động lại 10 phút.
7. Khi về 00:00, sơ đồ tự tải lại và bỏ trạng thái quyền giữ đã hết hạn. Có thể chọn lại ghế nếu chưa bị người khác giữ.

Trước khi máy chủ xác nhận, lựa chọn chỉ là nháp. Khi có lỗi mạng, tải lại để kiểm quyền giữ; không coi lỗi mạng là thành công. Nếu ghế vừa bị người khác giữ, UI hiển thị phản hồi xung đột và ghế bị từ chối; cả tập ghế gửi trong request đó không được giữ một phần.

**Chưa có đặt đơn/thanh toán/phát vé hoặc nhả ghế thủ công trong phạm vi hiện tại.** Nút Tiếp tục bị vô hiệu hóa là giới hạn chức năng đã ghi nhận, không phải lỗi đăng nhập. Hai cửa sổ cùng tài khoản buyer không phải hai người mua độc lập để thử chống giữ trùng; dùng bài test HTTP ở mục 8.

### B. Người tổ chức — sự kiện, suất, sơ đồ và giá

1. Đăng xuất hoặc mở cửa sổ trình duyệt riêng; đăng nhập bằng `design-organizer@example.invalid`.
2. Mở <http://localhost:3000/events>. Chọn sự kiện để xem/chỉnh sửa; dùng thao tác tạo sự kiện khi cần dữ liệu giả mới.
3. Với suất giả đã có, có thể mở trực tiếp:
   <http://localhost:3000/showtimes/c0100401-0000-4000-8000-000000000001/manage>.
4. Các màn hình cùng suất: `/manage` quản lý; `/import` nạp JSON; `/prices` đặt giá theo hạng; `/map` xem sơ đồ.
5. Để thử nạp JSON, **tạo suất mới chưa từng mở bán**. Chọn file `fixtures/seat-map-2000.json`, xem preview và lỗi; chỉ bấm xác nhận khi đúng. Preview không ghi DB.
6. Đặt giá từng hạng, lưu; giá âm/để trống không hợp lệ, giá 0 hợp lệ theo contract hiện hành.
7. Mở bán khi đầy đủ sơ đồ và giá. Kiểm suất xuất hiện ở trang public. Đóng bán: request giữ mới bị từ chối 409; mở lại khi đủ điều kiện.

Suất từng mở bán bị khóa cấu trúc vĩnh viễn; đóng bán không cho phép thay sơ đồ. Không dùng suất fixture đang mở bán để kỳ vọng import lại thành công. Khi sửa giá/mở/đóng trên dữ liệu giả có sẵn, ghi lại giá/trạng thái trước đó để phục hồi bằng UI; không seed/reset toàn bộ để hoàn tác.

## 8. Kiểm thử — từ đơn giản đến chuyên sâu

### 8.1 Health, không thay dữ liệu

Chạy từ một cửa sổ PowerShell thứ tư:

```powershell
Invoke-RestMethod http://localhost:3001/health
Invoke-RestMethod http://localhost:3000/api/health
```

Mong đợi: `status: ok` và HTTP 200. `/health` kiểm dependency; web `/api/health` kiểm thêm đường proxy web→API. Nếu 503, xem log và kiểm database/cache, không chỉ reload web.

### 8.2 Lint, typecheck, unit test, build

```powershell
npx --yes pnpm@10.15.1 lint
npx --yes pnpm@10.15.1 typecheck
npx --yes pnpm@10.15.1 test
npx --yes pnpm@10.15.1 build
```

Chạy từng lệnh và kiểm kết quả trước lệnh tiếp theo. Exit code khác 0 nghĩa thất bại; không bỏ qua để tiếp tục nghiệm thu. Dừng app trước bước build nếu đang chạy bản production. Có warning baseline lint/Vitest; warning không đồng nghĩa lệnh thành công — kiểm exit code.

Để lưu log/gate vào bộ evidence hiện có, dùng:

```powershell
./scripts/verify-stitch-correction.ps1 -Run holds/20261004
```

Lệnh này ghi lại `gate-*.log` và `local-gates.json` trong `evidence/holds/20261004/`, **ghi đè kết quả lượt trước**. Sao lưu thư mục evidence nếu muốn giữ nguyên gói nghiệm thu cũ. Những kết quả 20 unit/10 integration đã công bố là lần kiểm 04/10/2026, không bảo đảm mọi lần chạy sau tự động PASS.

### 8.3 Integration với database test riêng

`-Mode Test` trỏ **sprint2_integration**, không phải database review stitch_fidelity. Database này đã tồn tại trên máy hiện tại; máy mới cần tạo một lần:

```powershell
$taskExists = docker exec sang-sprint2-postgres-20261004 psql -U sprint2 -d postgres -At -c "SELECT 1 FROM pg_database WHERE datname='sprint2_integration'"
if ($LASTEXITCODE -ne 0) { throw 'Không kiểm tra được database test.' }
if ("$taskExists".Trim() -ne '1') {
  docker exec sang-sprint2-postgres-20261004 createdb -U sprint2 sprint2_integration
  if ($LASTEXITCODE -ne 0) { throw 'Không tạo được database test.' }
}
./scripts/run-sprint2-local.ps1 -Mode Test
```

Mong đợi: migrations cập nhật, 4 test files/10 tests pass theo suite hiện tại. Đây là kiểm local, không phải GitHub CI/staging.

### 8.4 T-31: 200 request/100 ghế ×10 — nâng cao

Bài này khởi động **hai API test cổng 3301/3302**, tạo buyer giả riêng, giữ ghế qua HTTP thật, kiểm worker và **restart container Valkey test**. Dùng database `sang_holds_local` cổng **15434** và Valkey cổng **16382**; không dùng database demo/Redis đăng nhập đang chạy. Cần build API trước; không chạy hai bản benchmark đồng thời.

Nếu hai container test đã có trên máy, chỉ khởi động lại chúng:

```powershell
docker start sang-holds-postgres-20261004 sang-holds-cache-20261004
```

Nếu chưa có, tạo một lần trong môi trường local:

```powershell
docker run -d --name sang-holds-postgres-20261004 -p 127.0.0.1:15434:5432 -e POSTGRES_USER=holds_test -e POSTGRES_PASSWORD=local_fixture_only -e POSTGRES_DB=sang_holds_local --mount type=volume,source=sang-holds-postgres-data,target=/var/lib/postgresql/data postgres:15-alpine

# File cấu hình không persistence, tránh lỗi truyền chuỗi rỗng giữa các phiên bản PowerShell.
$taskCacheConfig = Join-Path (Get-Location) '.git/holds-user-guide-valkey.conf'
if (Test-Path -LiteralPath $taskCacheConfig) { throw 'File cấu hình đã tồn tại; kiểm tra trước, không ghi đè.' }
@'
save ""
appendonly no
'@ | Set-Content -LiteralPath $taskCacheConfig -Encoding ascii
docker run -d --name sang-holds-cache-20261004 -p 127.0.0.1:16382:6379 --mount "type=bind,source=$taskCacheConfig,target=/etc/valkey/holds.conf,readonly" valkey/valkey:8-alpine valkey-server /etc/valkey/holds.conf
```

Mật khẩu trên chỉ là credential giả cho local test. Kiểm `pg_isready` và PONG trước khi tiếp tục; nếu chưa sẵn sàng, chờ rồi kiểm lại:

```powershell
docker exec sang-holds-postgres-20261004 pg_isready -U holds_test -d sang_holds_local
docker exec sang-holds-cache-20261004 valkey-cli ping

$env:DATABASE_URL = 'postgresql://holds_test:local_fixture_only@127.0.0.1:15434/sang_holds_local'
$env:REDIS_URL = 'redis://127.0.0.1:16382'
$env:HOLDS_DOCKER = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
npx --yes pnpm@10.15.1 --filter api exec prisma migrate deploy
if ($LASTEXITCODE -ne 0) { throw 'Migration test thất bại.' }
node apps/api/scripts/verify-holds-http.mjs
$taskExit = $LASTEXITCODE
Write-Host "T-31 exit code: $taskExit"
```

Mong đợi correctness: mỗi lượt 100 thành công/100 conflict/0 lỗi khác, đúng 100 quyền hợp lệ trong DB; đủ 10 lượt. NFR yêu cầu p95 dưới **300 ms**, không nới ngưỡng.

**Kết quả cuối hiện có: correctness đạt nhưng p95 750,96 ms, nên script exit 1 đúng gate.** Nếu lần chạy mới vẫn exit 1, đọc `failure` và `rounds` trong `evidence/holds/20261004/http-concurrency.json`; không gọi đây là PASS. Script giữ đủ raw timings, không bỏ timeout/mẫu chậm. Toàn bài mất hơn một phút vì kiểm nhịp worker 60 giây; không phải treo ở đoạn chờ worker.

Lệnh ghi đè raw/log T-31 trong thư mục evidence hiện tại; sao lưu trước khi tái đo. Sau bài test, đóng cửa sổ PowerShell test để tránh dùng nhầm DATABASE_URL test cho thao tác khác. Không chạy các helper `expire/near-expiry/cleanup` tùy tiện: chúng dành cho run fixture được chỉ định, không phải nút reset ứng dụng.

### 8.5 Browser và ảnh nghiệm thu

Để xem kết quả đã có, mở:

- [Gói review và bảng 21 task](SPRINT2_PO_REVIEW.md).
- [AC, lệnh, raw, rollback và giới hạn](SEAT_HOLD_LOCAL_EVIDENCE.md).
- [Gallery đối chiếu 29 state Stitch](../evidence/holds/20261004/index.html).

Browser tự động có thể tạo/chỉnh dữ liệu giả và ghi đè capture/report. Khi chỉ muốn review, dùng gallery hoặc thao tác UI ở mục 7; không cần chạy lại suite. Nếu cần tái nghiệm thu browser đầy đủ, yêu cầu công cụ hỗ trợ kỹ thuật thực hiện fixture lifecycle/cleanup đúng run theo gói evidence. Không dùng account thật hoặc gọi đó là kiểm staging.

## 9. Chỉ khi chưa có môi trường/dữ liệu giả

**Bỏ qua mục này trên máy hiện tại nếu đã đăng nhập được.** Không dùng để reset hay sửa dữ liệu bạn đã nhập.

### 9.1 Tạo container local một lần

Chạy chỉ khi các tên container tương ứng chưa tồn tại; nếu đã có, dùng `docker start` ở mục 4:

```powershell
docker run -d --name sang-sprint2-postgres-20261004 -p 127.0.0.1:15432:5432 -e POSTGRES_USER=sprint2 -e POSTGRES_PASSWORD=local_fixture_only -e POSTGRES_DB=stitch_fidelity --mount type=volume,source=sang-sprint2-postgres-data,target=/var/lib/postgresql/data postgres:15-alpine
docker run -d --name sang-sprint2-redis-20261004 -p 127.0.0.1:16379:6379 redis:7-alpine
```

Kiểm accepting connections/PONG ở mục 4, rồi cài dependency/migrate/generate/build ở mục 5. Credential trên là fixture local; không đưa lên dịch vụ thật. Đổi POSTGRES_USER/PASSWORD trên container mới không thay mật khẩu của volume cũ; nếu volume có dữ liệu khác thì dừng để kiểm nguồn cấu hình, không xóa volume.

### 9.2 Tạo tài khoản và sự kiện giả một lần

Chỉ seed khi dataset mới hoặc đã được xác nhận cho phép cập nhật fixture. Seeder cập nhật password của hai design account, metadata sự kiện giả và tạo sơ đồ khi chưa có; không phải reset toàn bộ app. Seed lại có thể thay metadata bạn sửa trên chính sự kiện fixture.

Nếu file mật khẩu riêng đã có, dùng đúng file đó. Nếu chưa có, nhập một mật khẩu **giả local** tối thiểu 12 ký tự; PowerShell không hiện nội dung lúc nhập:

```powershell
if (-not (Test-Path -LiteralPath '.git/stitch-correction-password')) {
  $taskSecurePassword = Read-Host 'Nhập mật khẩu giả local, ít nhất 12 ký tự' -AsSecureString
  $taskCredential = [PSCredential]::new('local-fixture', $taskSecurePassword)
  $taskPassword = $taskCredential.GetNetworkCredential().Password
  if ($taskPassword.Length -lt 12) { throw 'Mật khẩu chưa đủ 12 ký tự.' }
  [IO.File]::WriteAllText((Join-Path (Get-Location) '.git/stitch-correction-password'), $taskPassword)
  Remove-Variable taskPassword,taskCredential,taskSecurePassword
}
$env:SPRINT2_DEMO_PASSWORD = (Get-Content -LiteralPath '.git/stitch-correction-password' -Raw).Trim()
try {
  ./scripts/run-sprint2-local.ps1 -Mode Seed -Database stitch_fidelity
} finally {
  Remove-Item Env:SPRINT2_DEMO_PASSWORD -ErrorAction SilentlyContinue
}
```

File này là plaintext **chỉ trên máy local**, nằm trong `.git/` để không vào commit; không upload/share toàn thư mục `.git`. Mật khẩu được Argon2 hash trong DB. Mong đợi: hai account design được tạo/kích hoạt và bộ sự kiện/sơ đồ giả; đăng nhập như mục 2. Không seed staging/production bằng runner local.

## 10. Dừng và lần chạy tiếp theo

1. Nhấn **Ctrl+C** trong cửa sổ API, web và worker do bạn mở.
2. Khi không dùng profile Docker 3200/3201 nữa, có thể dừng đúng hai container đó để tránh scheduler khác cùng chạy trên DB demo.
3. Dừng database/cache mà giữ nguyên dữ liệu:

```powershell
docker stop sang-holds-render-api-20261004 sang-holds-render-web-20261004
docker stop sang-sprint2-postgres-20261004 sang-sprint2-redis-20261004
```

Lệnh dòng đầu chỉ dùng nếu có hai container profile đó. Không cần dừng/xóa các container test hoặc dự án khác. `docker stop` không xóa volume PostgreSQL. Redis local không persistence có thể mất cache/khóa đăng nhập sau restart; quyền giữ ở PostgreSQL vẫn là nguồn có thẩm quyền. Thời hạn giữ vẫn trôi khi ứng dụng tắt, không dừng đồng hồ theo tiến trình.

Lần sau: kiểm máy → mục 4 → mục 6. Chỉ build lại nếu code/dependency đã đổi; chỉ migrate khi cần cập nhật schema; không seed lại mỗi lần khởi động.

## 11. Xử lý lỗi thường gặp

| Hiện tượng | Việc cần làm |
|---|---|
| Trang không mở | Kiểm web 3000 và API 3001; các cửa sổ chạy app còn mở không; thử hai health URL. |
| Đăng nhập sai | Dùng đúng design email, password từ file riêng; không dùng password DB; không thêm khoảng trắng. |
| Login bị 429/tạm khóa | Có 5 lần sai nên bị khóa theo contract khoảng 15 phút. Chờ hết khóa rồi dùng đúng password; không restart Redis để né khóa. |
| Login thành công nhưng không giữ được | Kiểm vai trò BUYER và suất đang bán. Organizer giữ ghế bị từ chối đúng quyền. |
| Ghế không còn trống hoặc 409 | Máy chủ đã ghi quyền của người khác hoặc suất đã đóng; tải lại, chọn ghế khác/suất khác. |
| 403 nguồn yêu cầu | Dùng nhất quán `http://localhost:3000` và WEB_ORIGIN này; không trộn 127.0.0.1 với localhost hoặc origin 3200. |
| Không kết nối được PostgreSQL | Kiểm container cổng 15432, DB stitch_fidelity, pg_isready và credential đúng volume. |
| Build/worker báo thiếu module/client | Install frozen → migrate → prisma generate → build, rồi chạy lại. |
| Runner Web báo chưa build | Chưa có standalone server.js; chạy mục 5 thành công trước. |
| Cổng bị chiếm | Xem PID đúng cổng, dừng app cũ qua Ctrl+C; không tắt toàn bộ Node. |
| Import bị chặn dù đã đóng bán | Suất từng mở bán khóa cấu trúc vĩnh viễn; tạo suất mới để thử import. |
| Không thấy event sau sửa trạng thái | Kiểm trạng thái suất, reload catalog; cache có TTL/revision. Không tạo fallback event để che lỗi API. |
| T-31 exit 1 | Xem failure và raw counts/NFR; có thể correctness đạt nhưng p95 chưa đạt. Không bỏ assertion. |

## 12. Hiện tại đã dùng được và còn hạn chế

Đã có local: đăng nhập với phiên máy chủ/cookie, phân quyền, sự kiện/suất diễn, import JSON, đặt giá, mở/đóng bán, catalog/detail, canvas 2.000 ghế, giữ nguyên tử, 409, countdown theo máy chủ và worker expiry.

Chưa hoàn thành nghiệm thu Sprint 2: hiệu năng giữ ghế chưa ổn định dưới 300 ms; CI/staging revision mới chưa chạy; Render Free không chứng minh worker liên tục khi API ngủ. Chưa có đơn hàng/thanh toán/vé hoặc dữ liệu thật. Xem báo cáo hiện hành, không lấy chữ PASS local làm PASS release.

Tài liệu này chỉ bổ sung hướng dẫn sử dụng; không commit, push, tạo PR, deploy, thay schema hoặc thay password/data đang có.
