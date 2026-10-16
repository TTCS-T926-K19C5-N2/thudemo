# Chạy dự án bán vé sự kiện trên máy cá nhân

> **Sprint 1 review/demo 15/10/2026:** xem [runbook](docs/SPRINT1_DEMO_RUNBOOK.md), [ma trận nghiệm thu](docs/SPRINT1_ACCEPTANCE_MATRIX.md) và [báo cáo](docs/SPRINT1_REVIEW_REPORT.md). Profile này dùng worktree/database/container riêng, web 3440/API 3441; Git Flow feature → develop; staging laptop riêng https://10.88.164.155:3470 (cần certificate trust/firewall để team Wi-Fi truy cập; xem gate trong runbook). Khi chạy web, dùng entry `pnpm --filter web dev` hoặc `start` để xác thực IP đăng nhập qua proxy. Root `.env` cần `WEB_PORT` và `AUTH_PROXY_SECRET` ngẫu nhiên tối thiểu 32 ký tự, cùng giá trị server-only trên web/API. Không dùng `next start` trực tiếp. Các checkpoint cũ bên dưới chỉ phản ánh thời điểm được ghi.

> **Hướng dẫn hiện hành cho giao diện, tài khoản và giữ ghế Sprint 2:** [LOCAL_USER_GUIDE](docs/LOCAL_USER_GUIDE.md). Có lệnh build/chạy/test từng bước, tài khoản người tổ chức/người mua, cách đọc mật khẩu giả riêng trên máy và xử lý lỗi. Profile review dùng PostgreSQL 15432/Redis 16379 với database `stitch_fidelity`; các mục T-01 và checkpoint cũ dưới đây được giữ làm lịch sử, dùng profile khác.

Đây là hướng dẫn cho môi trường local theo T-01/TECH-01. Candidate hiện dùng bản vá Next.js16.3.8 theo quyền sửa dependency bảo mật đã cấp; yêu cầu16.3.6 lịch sử được ghi riêng trong báo cáo đối chiếu. Docker Compose chạy PostgreSQL và Redis; API NestJS và web Next.js chạy trực tiếp trên máy. Web dùng cổng **3000**, API dùng cổng **3001**. Các lệnh dưới đây dùng PowerShell và được chạy từ thư mục `thudemo/` chứa file README này.

## Demo Sprint 1 từ clone mới — một lệnh

Entrypoint mới (candidate16/10, **đang kiểm clone sạch**, chưa phải bằng chứng Sprint Done). Prerequisites: Windows PowerShell5.1+, Git, Node24.21.0, Corepack/pnpm10.15.1, Docker Desktop dùng Linux engine/Compose; C trống ít nhất12GiB, ổ checkout5GiB, RAM khả dụng2GiB. Chạy từ clone riêng, không sao chép `.env`/private config từ máy khác.

```powershell
powershell.exe -NoProfile -File .\scripts\sprint1-demo.ps1
```

Lệnh chọn cổng trống, tạo profile/secret riêng theo đường dẫn checkout, chạy PostgreSQL15/Redis7/Mailpit, frozen install, Prisma generate/migrate, seed giả, build, start, health và login/logout smoke. Chỉ in `READY` sau khi smoke thành công. Địa chỉ thực tế được in ở cuối (ưu tiên web3000/API3001); không mặc định cổng nếu máy đã bận. Credentials nằm tại `.sprint1-demo/config.json`, bị Git ignore; không gửi file này lên PR/chat. Nếu clone đã có `.env` của môi trường khác, launcher từ chối ghi đè: dùng clone riêng.

Mở `/register`, nhập tên/email giả và mật khẩu thử >=8ký tự, đọc thông báo và tự chọn consent. Xem thư ở địa chỉ **mail-catcher** được in, mở liên kết kích hoạt, đặt mật khẩu cuối cùng (có thể dùng lại mật khẩu vừa chọn) rồi đăng nhập. Mailpit là hộp nhận thử loopback, **không chứng minh thư Internet**. Hai organizer/admin/buyer/lock-test có sẵn trong credentials local; không dùng tài khoản chính cho thử khóa.

```powershell
powershell.exe -NoProfile -File .\scripts\sprint1-demo.ps1 -Action Status
powershell.exe -NoProfile -File .\scripts\sprint1-demo.ps1 -Action Stop
powershell.exe -NoProfile -File .\scripts\sprint1-demo.ps1 -Action Start
powershell.exe -NoProfile -File .\scripts\sprint1-demo.ps1 -Action Restart
```

Stop chỉ dừng process/container của profile này, giữ volume, lịch sử và secret. Source đổi thì dùng Restart để build lại; không `down -v`, reset DB hoặc dừng Node/Docker dùng chung. Khi lỗi, chưa có READY; đọc log private `.sprint1-demo/*.log` và lỗi ngắn trên terminal. Thiết lập cũ trong worktree15/10 vẫn dùng `-Legacy` và runbook checkpoint cũ. Demo localhost khác bootstrap HTTPS/LAN lần đầu và khác resume staging đã cấu hình; certificate/firewall vẫn cần thao tác OS được nêu trong runbook.

## 1. Chuẩn bị

Cài và khởi động Docker Desktop. Máy cần có Node.js **24.21.0** và pnpm **10.15.1**. Mở PowerShell tại `thudemo/`, rồi kiểm tra:

```powershell
node --version
pnpm --version
docker compose version
```

Nếu phiên bản Node hoặc pnpm khác các phiên bản trên, hãy chọn đúng phiên bản trước khi cài dependency. Nếu lệnh Docker báo không kết nối được engine, hãy chờ Docker Desktop khởi động xong.

## 2. Tạo cấu hình local

Chỉ sao chép file mẫu khi chưa có `.env`:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Mở `thudemo/.env` và thay **mọi** giá trị dạng `<...>` bằng giá trị thử nghiệm do bạn tự đặt. Dùng cùng tên user, mật khẩu và tên database trong `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` và `DATABASE_URL`. URL của API phải trỏ `localhost:5432`; Redis trỏ `localhost:6379`. Nếu mật khẩu chứa ký tự đặc biệt, phần mật khẩu trong `DATABASE_URL` cần được mã hóa theo URL; dùng ký tự chữ/số cho mật khẩu local sẽ dễ cấu hình hơn.

Giữ `PORT=3001` và `NEXT_PUBLIC_API_URL=http://localhost:3001` như file mẫu. `NEXT_PUBLIC_*` là biến công khai: không đặt mật khẩu, token hoặc chuỗi kết nối vào đó. `.env` đã được Git ignore; không commit hoặc gửi nội dung file này. Phiên đăng nhập hiện dùng server session theo TECH-02; cookie HttpOnly, Secure trên HTTPS. Không cấu hình JWT thay cho session. `WEB_PORT`, `WEB_ORIGIN` và `AUTH_PROXY_SECRET` phải khớp web/API; dùng entry web `pnpm --filter web dev` để có xác thực TCP peer.

Nếu đã có volume PostgreSQL từ lần chạy trước, đổi `POSTGRES_USER`, `POSTGRES_PASSWORD` hoặc `POSTGRES_DB` trong `.env` không tự đổi tài khoản/database đã khởi tạo trong volume. Hãy dùng lại các giá trị tương ứng hoặc xử lý volume theo quy trình của nhóm; không xóa volume khi còn dữ liệu cần giữ.

## 3. Khởi động dữ liệu và cài dependency

```powershell
docker compose up -d --wait postgres redis
pnpm install --frozen-lockfile
pnpm --filter api exec prisma migrate deploy
pnpm --filter api exec prisma generate
```

`--wait` chỉ hoàn tất khi PostgreSQL và Redis đạt healthcheck. Lệnh migration dùng lịch sử Prisma trong repository; chạy lại sẽ báo không có migration chờ nếu database đã cập nhật. Checkout tích hợp hiện có 29 migration, gồm User/Role/Event/Showtime và các module sprint sau. Ba migration probe của T-01 là mẫu apply → migration bù → tái áp dụng; không có nghĩa schema hiện tại chỉ còn scaffold. Không dùng `prisma db push` hoặc reset database thay cho migration.

## 4. Chạy API và web

Mở **hai cửa sổ PowerShell riêng**, cùng ở `thudemo/`:

```powershell
# Cửa sổ 1 — API
pnpm --filter api run start:dev
```

```powershell
# Cửa sổ 2 — web
pnpm --filter web run dev
```

Mở [web](http://localhost:3000) và [API health](http://localhost:3001/health). Health trả HTTP `200` với `status: ok` khi API kết nối được cả PostgreSQL và Redis; nếu một dịch vụ lỗi, API trả `503`. Đăng nhập, phân quyền và quản lý sự kiện nháp/suất diễn thuộc phạm vi Sprint 1; các module sprint sau có trong checkout không tự được nghiệm thu ở Sprint 1.

Để dừng API hoặc web, nhấn `Ctrl+C` trong từng cửa sổ. Có thể dừng hai dịch vụ dữ liệu bằng `docker compose stop postgres redis`; lệnh này giữ nguyên volume PostgreSQL.

### Chạy thử nghiệm luồng thanh toán bằng cổng giả lập (Story S-19)

Khi chưa có tài khoản MoMo Sandbox, có thể bật cổng thanh toán giả lập nội bộ trong `.env`:
```powershell
PAYMENT_GATEWAY=mock
PAYMENT_WEBHOOK_SECRET=mock_webhook_secret_dev
```
Khi bấm "Thanh toán ngay" ở trang chi tiết đơn hàng, hệ thống sẽ chuyển hướng tới trang `/mock-gateway/pay`. Tại đây có hai nút **"Thanh toán thành công"** và **"Thanh toán thất bại"**. Server giả lập sẽ phát một IPN webhook chuẩn MoMo có chữ ký số hợp lệ tới endpoint `/payments/webhook`, cập nhật đơn hàng tức thì và chuyển người dùng về trang kết quả `/payment/result`. *Lưu ý: Cổng mock chỉ dùng cho dev/test và bị nghiêm cấm trên môi trường production.*

## 5. Kiểm tra thay đổi local

Sau khi dữ liệu đã healthy và migration đã chạy, từ `thudemo/`:

```powershell
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter api run test:e2e
pnpm --filter api exec prisma migrate status
```

E2E gọi API với PostgreSQL và Redis local thật. `prisma migrate status` phải báo database đã cập nhật. Một số warning lint trong module auth/users thuộc scaffold hiện có; nếu lệnh lint trả mã thoát khác 0 thì kiểm tra và sửa lỗi trước khi tiếp tục.

## Khi gặp lỗi

| Triệu chứng | Kiểm tra trước |
|---|---|
| `docker compose` không chạy | Docker Desktop đã chạy chưa; cổng 5432/6379 có bị ứng dụng khác chiếm không. |
| Compose báo thiếu `POSTGRES_*` | File `.env` phải nằm ở `thudemo/`, không phải `apps/api/`; thay hết placeholder. |
| Migration không kết nối được database | Chờ `docker compose up -d --wait postgres redis` thành công; kiểm `DATABASE_URL` khớp `POSTGRES_*` và dùng `localhost:5432`. |
| API không khởi động hoặc `/health` trả `503` | Kiểm tra container PostgreSQL/Redis healthy, `DATABASE_URL`, `REDIS_HOST` và `REDIS_PORT`; xem lỗi trong terminal API. |
| Web/API báo cổng đang được dùng | Dừng tiến trình local đang chiếm 3000/3001; giữ cổng theo TECH-01. |

CI đầy đủ và chặn merge thuộc T-02. Docker image ứng dụng, staging và rollback khi triển khai thuộc T-03.

## Sprint 2 — triển khai và đo local 04/10/2026

Root ứng dụng vẫn `thudemo/`. Hướng dẫn chạy/seed/demo an toàn: [SPRINT2_HANDOFF](docs/SPRINT2_HANDOFF.md). [AC và bằng chứng](docs/SPRINT2_LOCAL_EVIDENCE.md), [K01 spike](docs/K01_EVIDENCE.md).

Đã nối API thật cho nạp JSON, giá từng hạng, mở/đóng bán, danh sách/chi tiết và một canvas2.000ghế. Chọn ghế hiện chỉ nháp; giữ ghế disabled vì K01 chưa đóng gate. 13task kiểm local,8task chờ dependency. Không tuyên bố Sprint Done.

Tạo fixture tùy số ghế (1–2.000):

```powershell
node scripts/generate-seat-map.mjs 2000 fixtures/seat-map-2000.json
```

Chọn tệp ở trang Nạp sơ đồ JSON để preview không ghi DB; xác nhận mới import. Script seed dùng cùng API thật. Tái đo: khởi động bản production theo handoff, đặt mật khẩu giả trong biến môi trường, mở CLI browser rồi chạy `./scripts/verify-sprint2-browser.ps1`. Kết quả máy đọc được: `evidence/sprint2/20261004-local/browser-report.json`.

| Phép đo | p95 local | Mẫu / mode |
|---|---|---|
| Import2000 |715.8ms |10 HTTP test-harness, DBthật |
| Query2000 |36.4ms |30 HTTP test-harness, DBthật |
| Danh sách200 suất |19.7ms cachemiss /11.9ms hit |30 mỗi loại, Redisthật |
| Hiển thị đủ2000ghế |177.3ms |30 navigation→double-frame, production web, warm browser |

p95 nearest-rank sort/ceil(n×.95)-1. Windows i5-13500H/16threads/~15.64GiB, Node24.21.0,pnpm10.15.1,DockerPG15/Redis7. Local không thay thế staging, physicalmobile hoặc benchmark HTTPgiữ ghế. Rawresults và screenshot gồm35browserchecks. Không dùng request lỗi để giảm latency.

## Bản sửa Stitch và code sản phẩm

Run sửa ngày 04/10/2026 dùng DB riêng `stitch_fidelity`. Runtime được tổ chức theo nghiệp vụ; poster gắn event ổn định, thao tác API thật và copy nội bộ đã được loại khỏi các bề mặt sửa. Bằng chứng cũ ở trên được giữ nguyên theo lần chạy cũ.

Xem [bằng chứng mới](docs/STITCH_CORRECTION_EVIDENCE.md), [hướng dẫn chạy và rollback](docs/STITCH_CORRECTION_HANDOFF.md), [ledger 29 màn hình](docs/STITCH_FIDELITY_LEDGER.md) và [viewer trước/sau](evidence/stitch-correction/20261004/index.html). Giữ ghế vẫn chưa khả dụng; không xác nhận Sprint Done.

## Profile Render Free và review hiện hành — 04/10/2026

Quyết định DEC-11: Render Free/ngân sách0, PO + review kỹ thuật tự động review, chưa commit/push/publish/upload/deploy. [Gói review và ma trận21task](docs/SPRINT2_PO_REVIEW.md), [Dashboard/migration/seed/backup runbook](docs/RENDER_FREE_RUNBOOK.md). Hướng dẫn lịch sử ở trên không phải trạng thái scaffold hiện tại: auth dùng phiên máy chủ/cookie, client gọi /api cùng origin; web proxy đọc API_INTERNAL_URL runtime, Redis hỗ trợ REDIS_URL. Giữ root thudemo và runtime Node24.21.0/pnpm10.15.1.

Profile Docker kiểm tại http://localhost:3100, API3101. Browser106checks/33captures/0JSerrors; render2.000ghế p95162.3ms (30navigation warm) trong evidence/render-free/20261004/browser-report.json. Build/lint/typecheck/unit/integration local PASS. Không thay con số này thành staging hoặc hold p95.

K01 local two-process đã so durability/invariant và đề xuất PostgreSQL authority; chờ PO xác nhận tạm thời trước T22–T31. Sáu màn hình giữ thành công/conflict/expiry chưa nối API. Không báo Sprint100% khi chưa producthold/CI/Render/NFR/POacceptance. Source/current evidence giữ WIP; không sửa AC nguồn.

## Quyền giữ ghế local — DEC-12

PostgreSQL authoritative tạm thời cho local; Redis/Valkey chỉ cache/counter. [Gói review hiện tại](docs/SPRINT2_PO_REVIEW.md), [AC/lệnh/bằng chứng](docs/SEAT_HOLD_LOCAL_EVIDENCE.md). API/web3001/3000; imageprofilemới3201/3200. Chạy migration theo runner trướcAPI; mở cửa sổ thứba `./scripts/run-sprint2-local.ps1 -Mode Worker -Database stitch_fidelity` để quét mỗi phút. Thêm ghế/retry/reload không gia hạn10phút; query vẫn trống ngay khi quá hạn dù worker tắt. Chỉ tài khoản/dữ liệu giả, passwordlocal không trongchat/source.

Lượt cuối T31 đúng100winner/100conflict×10 nhưng NFRp95FAIL750,96ms. ChưaCI/staging/Render/continuousworkerPASS; khôngSprint100%. Không dùngreset/dbpush để rollback, không xóa.env/volumes/WIP. RenderFree scheduler chỉ khiAPIthức,cache/loginlock có thểmất khi restart.
