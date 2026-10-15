# Sprint 1 — hướng dẫn kiểm thử và demo local

Ngày kiểm: 15/10/2026. Nguồn: develop `07d683fcfcfd7d05c8aff1119ab6dc3c63f6e458` cộng diff candidate trong nhánh feature/sprint1-acceptance-20261015. Giữ UI V1, chỉ dùng dữ liệu giả. Lệnh dưới đây không commit, push hoặc deploy.

## 1. Mở đúng phiên

Mở PowerShell và chạy:

```powershell
Set-Location -LiteralPath 'D:\Development\03_Academic\Bán vé sự kiện có sơ đồ ghế\thudemo-sprint1-gitflow-20261015'
powershell.exe -NoProfile -File .\scripts\sprint1-demo.ps1 -Action Status
```

Nếu chưa chạy, khởi động bằng **một lệnh**:

```powershell
powershell.exe -NoProfile -File .\scripts\sprint1-demo.ps1
```

Lệnh kiểm Node 24.21.0, pnpm 10.15.1, Docker Linux engine, cổng và container; khởi động dependency; cài bằng lockfile; áp migration; seed an toàn; build và start. Chỉ in **READY** khi health của API, trang chủ web và health qua proxy đều thực sự trả 200.

- Web: **http://localhost:3440**
- API health: **http://localhost:3441/health**
- Proxy health: **http://localhost:3440/api/health**
- Credentials: **`.sprint1-local/config.json`**. Mở file trên máy để lấy email/password; không chép nội dung vào chat, báo cáo hoặc PR.
- Cấu hình app: root `.env`; khóa ký và log: `.sprint1-local/`. Cả hai bị Git ignore; thư mục private cũng bị Docker ignore.

| Tài khoản trong config | Dùng để |
|---|---|
| admin | Kiểm vai trò quản trị; không tự có quyền organizer |
| organizer-a | Demo tạo/sửa sự kiện |
| organizer-b | Kiểm từ chối truy cập sự kiện của A |
| buyer | Kiểm API trái quyền và sự kiện nháp |
| lock-test | Bài khóa đăng nhập; không dùng tài khoản demo chính |
| multi-role | Kiểm BUYER + ORGANIZER, không tạo vai trò mới |

Phiên mới dùng PostgreSQL 15445, database `sprint1_gitflow_20261015`, Redis 16395. Phiên S-32 tại 3300/3301, PostgreSQL 15432 và Redis 16381 được giữ nguyên.

Nếu script báo cổng bận hoặc container khác label, hãy dừng và đọc lỗi. Không kill tiến trình khác, không xóa volume. Dừng riêng phiên này:

```powershell
powershell.exe -NoProfile -File .\scripts\sprint1-demo.ps1 -Action Stop
```

Sau đó có thể Start lại. Dữ liệu và container được giữ. Khóa ký chỉ tạo lần đầu cho profile riêng; không tái tạo khóa hiện hữu. `-SkipBuild` chỉ dành cho lần chạy lại đúng bản đã build; kiểm thử tái lập nên dùng lệnh mặc định có build.

## 2. Kịch bản demo

Dùng profile trình duyệt riêng cho A, B và buyer. Cùng dùng hostname `localhost`; tránh đổi sang `127.0.0.1` giữa phiên vì cookie theo hostname.

| Bước | Thao tác và dữ liệu | Kết quả mong đợi | Cách phục hồi |
|---|---|---|---|
| 1. Health | Chạy Status, mở hai URL health ở trên | READY, HTTP 200, status ok | Mở Docker, đọc log private, chờ dependency healthy; không sửa dữ liệu |
| 2. Login A | Mở `/login`, dùng organizer-a từ config | Vào `/events`, thấy quản lý sự kiện, không thấy mục kế toán | Nhập lại từ config; không dùng lock-test |
| 3. Tạo draft | `/events/new`; thử submit trống, rồi nhập tên `Demo Sprint 1 <giờ>`, mô tả `Dữ liệu giả`, địa điểm `Phòng A` | Lỗi ngay trường sai; tạo đúng một sự kiện nháp | Sửa trường báo lỗi rồi lưu; tránh reload khi chưa lưu |
| 4. Sửa và reload | Đổi địa điểm thành `Phòng A đã sửa`, lưu rồi reload | Dữ liệu đã sửa còn nguyên | Mở lại sự kiện của A từ danh sách, không sửa DB bằng tay |
| 5. Suất tương lai | Chọn ngày mai 19:30 hoặc nút +24 giờ | Lưu một suất gắn đúng sự kiện; hiển thị giờ Việt Nam | Nhập lại ngày tương lai hợp lệ; không cần xóa suất đã lưu |
| 6. Quá khứ | Nhập 01/01/2020 10:00, thêm suất | Lỗi rõ thời điểm phải ở tương lai; không tạo record; input còn | Đổi sang tương lai rồi lưu |
| 7. Trùng giờ | Nhập lại chính xác ngày/giờ bước 5 | Cảnh báo nhưng vẫn lưu; có hai suất cùng thời điểm | Đây là AC mong đợi, không sửa thành unique constraint |
| 8. Ownership B | Login B ở profile khác, paste `/events/<idA>`; gọi manage/PATCH bằng phiên B | API 403, UI báo không có quyền, không hiện dữ liệu A | Quay về danh sách của B; không nâng quyền để vượt |
| 9. Buyer | Login buyer, xem catalog công khai; gọi POST `/api/events` hoặc PATCH bằng phiên buyer | Không thấy draft A; API 403, có log role mismatch | Xác nhận đúng profile buyer; không chỉ dựa vào nút bị ẩn |
| 10. Logout | A bấm Đăng xuất, truy cập trang/API cần phiên | Về login/401; cookie cũ không dùng lại được | Đăng nhập A lại; không chép token vào tài liệu |
| 11. Hết phiên | Để form mở hơn 15 phút; nhập sửa rồi lưu | 401 → login; cùng A đăng nhập lại → về form, khôi phục nội dung chưa lưu | Giữ cùng tab và cùng tài khoản. Đóng tab không bảo đảm giữ draft; tài khoản khác không được restore draft A |
| 12. Khóa phụ | Sau khi lock-test hết khóa, nhập sai 5 lần, lần thứ 6 thử mật khẩu đúng | 5 lần 401, lần 6 trả 429 và thời gian còn lại, khóa 15 phút | Chờ đúng thời gian; không rút TTL hoặc DEL lock; không khóa A |
| 13. Restart | Khi lock-test đang khóa: Stop rồi Start riêng phiên app, Redis vẫn chạy | Khóa còn, TTL giảm; hết 15 phút tự mở và login đúng thành công | Không restart Redis hoặc task khác để làm mất khóa |
| 14. Trình bày evidence | Mở report, matrix và thư mục evidence | Phân biệt source CI, local repair, prototype, endpoint, staging | Không nói CI xanh nghĩa là Sprint Done; staging vẫn BLOCKED |

Bài kiểm main trước đã chờ khóa tự hết **900 giây thật**; bằng chứng đó không được gán lại cho develop. Lượt develop kiểm TTL/restart bằng Redis thật. Bài UI bổ sung đã khóa lại tài khoản phụ; xem thời gian còn lại trên UI trước khi chạy lại bước 12. Tài khoản chính vẫn dùng được. Budget IP là 30 lần sai/15 phút; không tiếp tục dò nhiều tài khoản từ cùng máy trong demo. Bằng chứng hai TCP peer thật nằm trong `proxy-ip-final.json`.

## 3. Kiểm API và chạy lại regression

Có thể dùng DevTools Network để xem status, method và route. Không lưu hoặc chia sẻ cookie/token. Verifier đọc credential local và chỉ cho đúng database/cache demo:

```powershell
node .\scripts\verify-sprint1-api.mjs
node .\scripts\verify-sprint1-browser.mjs
```

API verifier kiểm cổng 3442 trống, tự mở/tắt tiến trình verification riêng, tạo thêm sự kiện/suất giả và khóa lock-test 15 phút. Nó không xóa lịch sử. Browser verifier tạo thêm dữ liệu giả và chủ động làm hết hạn session của **organizer-a fixture** để kiểm recovery. Chỉ chạy khi đang chủ động kiểm expiry, không chạy lúc người khác demo cùng tài khoản.

Bộ kiểm hồi quy dùng database riêng:

```powershell
node .\scripts\sprint1-tests.mjs
```

Runner chạy lint/typecheck/unit/integration. Profile chính: PostgreSQL 15446, database `sprint2_integration`, Redis 16396. Suite scanner chạy đủ ở PostgreSQL 15450, database `signed_qr_integration`, guard mở rộng exact profile với SPRINT1_ISOLATED_TEST=true. Nếu cổng bận hoặc label khác thì dừng. Không chạy E2E mù vào database demo hoặc môi trường khác. Các suite có cleanup fixture của chúng; không đưa dữ liệu thật vào database test.

## 4. Khắc phục môi trường

- **Migration lỗi:** xem private `migrate.log`, kiểm DB/port/label và history. Không sửa migration đã áp dụng, `db push` hoặc reset DB. Chuỗi migration bù đã kiểm trong database riêng.
- **Login 503:** kiểm `AUTH_PROXY_SECRET` server-only giống nhau ở web/API và dùng entry hỗ trợ qua `pnpm --filter web dev/start` hoặc script này. Bare `next start` không có attestation. Không bật tin cậy XFF tùy ý. Giữ khóa hiện có.
- **Browser 401:** dùng đúng hostname/profile; phiên hết sau 15 phút là contract. API production qua HTTP có Secure cookie không gửi lại là đúng. Demo HTTP dùng API development mode; không tắt Secure trên production.
- **Health 503:** dependency thực sự lỗi; chờ healthy rồi Status. Tiến trình còn sống không đủ để nhận READY.
- **Đổi source:** Stop phiên này rồi Start mặc định để build lại. Tránh build đè trong lúc demo. SHA cộng diff/hash manifest xác định bản kiểm.
- **Secret/log:** chỉ chia sẻ evidence đã lọc ở `evidence/sprint1/20261015/`. Không upload `.env`, config.json, PEM, Docker env hoặc raw log.

## 5. Gate staging cho phase được cấp quyền sau

1. Xử lý advisory dependency, review phiên bản và final diff. Chỉ publish sau khi được ủy quyền; chạy CI trên final SHA. CI của main cũ không chứng minh patch mới.
2. Xác minh Render project, region/Free plan, retention dữ liệu giả theo DEC-08/11; cấp secret runtime riêng và kiểm durability PostgreSQL/Redis. Không đưa secret vào image hoặc browser.
3. Cấu hình CI → deploy sau checks; profile hiện giữ `autoDeployTrigger: off`. Chứng minh test thất bại không triển khai. Không tự bật deployment bằng runbook local.
4. Đo merge → phiên bản mới hoạt động dưới 10 phút; health dependency và smoke HTTPS trước chuyển traffic; kiểm cookie Secure, assets, proxy, role và owner.
5. Kiểm client IP qua edge Render với ít nhất hai client thật và spoof header. TCP peer local không chứng minh identity sau load balancer; không để mọi người dùng chung budget của edge.
6. Migration phải tương thích bản cũ trong lúc rollout, có hướng dẫn backup/compensation. Không đảo schema phá lịch sử để rollback image.
7. Kiểm candidate lỗi trong staging được phép: bản cũ vẫn 200, không switch khi health lỗi; rollback đúng SHA rồi smoke. Lưu run URL, URL staging, SHA và thời gian.
8. Chạy AC trên staging, so sánh K-01 và NFR endpoint đúng ngưỡng. Ghi giới hạn sleep/worker/Redis restart/retention của Free plan; không tự miễn DoD.

**Local READY không đồng nghĩa staging PASS, Sprint 1 Done hoặc được phép publish.**
## Staging hiện hành

Theo người dùng15/10, chuyển sang laptop riêng/LAN, không tiếp tục Render. Profile staging riêng và hướng dẫn team sẽ được bổ sung sau khi start/HTTPS smoke thành công. Chưa bật Cloudflare Tunnel. Không dùng URL3440 làm bằng chứng staging.
