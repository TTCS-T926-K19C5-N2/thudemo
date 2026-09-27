# Bộ prompt Antigravity — Sprint 1 nền tảng bán vé sự kiện có sơ đồ ghế

Dựa trên `Raw.xlsx`: 5 hạng mục Sprint 1 (Tier=Ready, Priority=Must) — **S-01 → S-02 → S-03 → S-04**, và spike **K-01** chạy song song sau S-01.

## 0. Stack đề xuất

| Lớp | Chọn | Vì sao |
|---|---|---|
| Backend | **NestJS** (Node.js + TypeScript) | Kiến trúc module/Guard/Decorator ép được nguyên tắc "mặc định từ chối quyền" (S-02) thành 1 Guard toàn cục, khó quên khai báo quyền cho route mới |
| ORM/DB | **Prisma + PostgreSQL** | Migration rõ ràng, transaction + `SELECT ... FOR UPDATE` dễ dùng cho các story giữ chỗ sau này |
| Cache/Lock | **Redis (ioredis)** | Cần cho khoá tạm/rate-limit ở S-02 và là 1 trong 2 phương án K-01 khảo sát |
| Frontend | **Next.js** (React + TypeScript) | Vừa cần trang public (SEO) vừa cần dashboard nội bộ; sau này vẽ sơ đồ ghế (canvas/SVG) vẫn trong hệ React |
| Repo | **pnpm workspace** monorepo: `apps/api`, `apps/web`, `packages/shared` | Dùng chung type (Role enum, DTO) giữa BE/FE — giảm lỗi lệch hợp đồng API khi để agent tự sinh code |
| Test | **Jest** (unit/integration BE) + **Playwright** (e2e) | Mỗi dòng AC dạng Given-When-Then trong backlog ánh xạ thẳng sang 1 test case |
| CI/CD | **GitHub Actions** + Docker Compose | Giả định deploy staging lên 1 VPS chạy Docker qua SSH. Nếu bạn dùng nền tảng khác (Railway/Render/VPS khác), nói lại cho agent ở bước S-01 |

Nếu team đã quen sẵn stack khác (vd Python), toàn bộ nội dung dưới đây vẫn áp dụng được — chỉ cần đổi phần "Stack" trong prompt gốc, các AC và ràng buộc nghiệp vụ giữ nguyên.

## 1. Cách dùng

- Mỗi mục 2–6 là **một task riêng** trong Agent Manager (Antigravity khuyến nghị: không gộp nhiều tính năng vào 1 prompt). Dùng **Planning mode** vì đều là việc nhiều file.
- Dán đúng khối **PROMPT** vào ô chat của agent, đọc kỹ plan agent đưa ra trước khi bấm approve.
- Thứ tự bắt buộc: **S-01 trước tiên** (mọi story sau cần hạ tầng này chạy được). Sau đó S-02 → S-03 → S-04 tuần tự. **K-01** có thể chạy song song bất cứ lúc nào sau S-01 (chỉ cần Postgres + Redis đã sống).
- AC (Given-When-Then) là tiêu chí Done — yêu cầu agent viết test tự động cho **từng dòng AC**, không tự báo xong nếu test chưa pass.

## 2. Prompt gốc — dán đầu tiên (thiết lập bối cảnh dự án)

```
Đây là dự án web bán vé sự kiện có sơ đồ ghế. Mục tiêu sản phẩm: ban tổ chức mở bán vé cho
sự kiện có sơ đồ ghế mà KHÔNG BAO GIỜ bán trùng ghế hay bán vượt sức chứa, và soát được vé
tại cửa kể cả khi mất mạng. Đây là nguyên tắc bất di bất dịch, chi phối mọi quyết định thiết kế
kể cả ở các tính năng chưa code tới.

Stack: NestJS (TypeScript) + Prisma + PostgreSQL cho backend; Next.js (TypeScript) cho frontend;
Redis cho cache/lock; pnpm workspace monorepo gồm apps/api, apps/web, packages/shared; Jest cho
unit/integration test, Playwright cho e2e; Docker Compose để chạy local và staging; GitHub Actions
cho CI/CD.

5 vai trò dùng chung hệ thống, mỗi vai trò chỉ thấy phần việc của mình: người mua vé, ban tổ chức,
nhân viên soát vé, kế toán, quản trị.

Nguyên tắc kỹ thuật không thương lượng, áp dụng ngay từ story đầu tiên:
- Phân quyền mặc định ĐÓNG: route mới không khai báo quyền tường minh thì bị từ chối, không phải
  ẩn nút giao diện mà chặn ở API.
- Không log mật khẩu, không log token dưới bất kỳ hình thức nào. Hash mật khẩu bằng argon2id.
- Biến môi trường chứa bí mật không được nằm trong mã nguồn — dùng .env, có .env.example mẫu.
- Dù soát vé ngoại tuyến chưa code ở sprint này, khi thiết kế schema vé/đơn hàng, hãy để trạng thái
  vé là một state machine rõ ràng, có timestamp và có chỗ cho "thiết bị thực hiện thao tác" — để
  sau này thêm đồng bộ ngoại tuyến không phải thiết kế lại từ đầu.
- Mọi thao tác liên quan tiền bạc (khi có ở sprint sau) phải ghi log dạng chỉ-thêm, không sửa/xoá được.

Tôi sẽ giao từng story một, mỗi story có Acceptance Criteria dạng Given-When-Then lấy trực tiếp
từ backlog — coi đó là test case bắt buộc, viết test tự động cho từng dòng trước khi báo hoàn thành.
Xác nhận đã hiểu bối cảnh trước khi tôi gửi story đầu tiên.
```

## 3. S-01 — Khung ứng dụng chạy được trên staging

Epic E-01. NFR epic: biến môi trường chứa bí mật không nằm trong mã nguồn.

```
STORY S-01 — Khung ứng dụng chạy được trên staging

Là thành viên phát triển, tôi muốn có khung ứng dụng chạy được trên staging để mọi story sau
đều có chỗ chạy thật thay vì chỉ chạy trên máy cá nhân.

Việc cần làm:
- Khởi tạo monorepo pnpm: apps/api (NestJS), apps/web (Next.js), packages/shared.
- docker-compose.yml chạy được: api, web, postgres, redis — 1 lệnh duy nhất khởi động toàn bộ.
- Route health-check (vd GET /health) trả HTTP 200 khi mọi service sẵn sàng.
- GitHub Actions: lint + test + build ở mọi PR; merge vào nhánh chính thì build, test, deploy
  staging tự động.
- .env.example liệt kê đủ biến môi trường cần thiết, không có giá trị bí mật thật trong repo.
- README ghi rõ lệnh khởi động 1 dòng cho người mới.

Acceptance Criteria (bắt buộc có test/kịch bản kiểm chứng tương ứng):
1. Giả sử máy chủ staging đã sẵn sàng, Khi merge vào nhánh chính, Thì pipeline build, chạy test
   và triển khai tự động, và trang chủ trả về HTTP 200.
2. Giả sử một bài test thất bại, Khi pipeline chạy, Thì dừng lại và không triển khai.
3. Giả sử thành viên mới lấy mã nguồn về, Khi chạy lệnh khởi động đã ghi trong README, Thì ứng
   dụng, PostgreSQL và Redis chạy được trên máy cá nhân.
4. Giả sử lần triển khai mới thất bại giữa chừng, Khi kiểm tra staging, Thì phiên bản cũ vẫn
   đang chạy (không rơi vào trạng thái nửa vời/sập).

Ràng buộc: biến môi trường chứa bí mật (DB password, JWT secret...) không được commit vào mã
nguồn dưới bất kỳ hình thức nào — kể cả trong file cấu hình mẫu hay comment.
```

## 4. S-02 — Đăng nhập và phân quyền theo vai trò

Epic E-02, phụ thuộc E-01. NFR epic: mật khẩu hash argon2id; không log mật khẩu/token.

```
STORY S-02 — Đăng nhập và phân quyền theo vai trò

Là người dùng hệ thống, tôi muốn đăng nhập và chỉ thấy phần việc của vai trò mình để không vô
tình chạm vào dữ liệu không thuộc trách nhiệm của tôi.

5 vai trò: người mua vé, ban tổ chức, nhân viên soát vé, kế toán, quản trị.

Việc cần làm:
- Bảng user với role, mật khẩu hash bằng argon2id.
- Đăng nhập trả JWT (access + refresh) hoặc session — bạn chọn cơ chế, nêu lý do ngắn gọn.
- Guard toàn cục kiểm tra quyền theo route: MẶC ĐỊNH TỪ CHỐI nếu route chưa khai báo role được phép.
- Đếm số lần sai mật khẩu theo tài khoản (dùng Redis), khoá 15 phút sau 5 lần sai liên tiếp.
- Middleware/Guard log lại các lần bị từ chối do sai quyền (403), không log mật khẩu/token.

Acceptance Criteria:
1. Giả sử tài khoản có vai trò ban tổ chức, Khi đăng nhập, Thì thấy mục quản lý sự kiện và
   không thấy mục đối soát kế toán.
2. Giả sử tài khoản có vai trò người mua vé, Khi gọi thẳng API tạo sự kiện bằng công cụ dòng
   lệnh (không qua giao diện), Thì máy chủ trả về 403 và ghi nhật ký lần thử đó.
3. Giả sử nhập sai mật khẩu 5 lần liên tiếp, Khi thử lần thứ 6, Thì khoá đăng nhập 15 phút và
   thông báo thời gian còn lại.
4. Giả sử phiên đăng nhập đã hết hạn, Khi gọi API bất kỳ, Thì trả về 401 và chuyển về trang
   đăng nhập.
5. Giả sử một route mới chưa khai báo quyền, Khi có người gọi tới, Thì bị từ chối — mặc định
   là đóng, không phải mở. Viết 1 test chứng minh route "quên khai báo quyền" tự động bị chặn,
   không phải kiểm tra thủ công từng route.

Ràng buộc: không log mật khẩu và không log token dưới bất kỳ hình thức nào (kể cả log lỗi/debug).
```

## 5. S-03 — Người mua tự đăng ký tài khoản bằng email

Epic E-02.

```
STORY S-03 — Người mua tự đăng ký tài khoản bằng email

Là khách truy cập, tôi muốn tự tạo tài khoản bằng email để mua vé mà không phải chờ ai cấp
tài khoản (khác với nhân viên nội bộ, do quản trị tạo — không thuộc story này).

Việc cần làm:
- Form đăng ký: email + mật khẩu, validate ở cả client và server.
- Tài khoản mới ở trạng thái "chờ xác nhận", gửi email chứa link kích hoạt (token hết hạn 24h).
- Thông báo phản hồi không được tiết lộ email đã tồn tại hay chưa (chống dò email).
- Cho phép gửi lại link kích hoạt khi link cũ hết hạn.

Acceptance Criteria:
1. Giả sử email chưa có trong hệ thống, Khi gửi form đăng ký hợp lệ, Thì tài khoản được tạo ở
   trạng thái chờ xác nhận và một email chứa liên kết kích hoạt được gửi đi.
2. Giả sử email đã tồn tại, Khi gửi form, Thì thông báo chung "nếu email hợp lệ, bạn sẽ nhận
   được hướng dẫn" — không tiết lộ email đã có tài khoản.
3. Giả sử mật khẩu dưới 8 ký tự, Khi gửi form, Thì bị chặn ở cả trình duyệt lẫn máy chủ.
4. Giả sử liên kết kích hoạt đã quá 24 giờ, Khi bấm vào, Thì báo hết hạn và cho gửi lại liên
   kết mới.
5. Giả sử tài khoản chưa kích hoạt, Khi đăng nhập, Thì bị từ chối kèm hướng dẫn kích hoạt.

Ghi chú: nếu chưa có dịch vụ gửi email thật ở môi trường dev, dùng 1 email service giả lập
(log link ra console hoặc MailHog) — không chặn tiến độ vì thiếu SMTP thật.
```

## 6. S-04 — Tạo sự kiện và suất diễn

Epic E-03, phụ thuộc E-02.

```
STORY S-04 — Tạo sự kiện và suất diễn

Là ban tổ chức, tôi muốn tạo sự kiện và các suất diễn của nó để mở bán vé cho từng khung giờ
riêng. (Story này CHƯA bao gồm nạp sơ đồ ghế JSON hay đặt giá theo hạng — đó là story sau,
đừng tự mở rộng phạm vi.)

Việc cần làm:
- CRUD sự kiện: tên, mô tả, địa điểm, trạng thái (nháp/đã công bố — story này chỉ cần trạng
  thái nháp, chưa hiện với người mua).
- Thêm suất diễn (showtime) gắn với 1 sự kiện: thời điểm bắt đầu.
- Mỗi sự kiện chỉ sửa được bởi đúng tài khoản ban tổ chức đã tạo nó.

Acceptance Criteria:
1. Giả sử đã đăng nhập bằng vai trò ban tổ chức, Khi tạo sự kiện với tên, mô tả và địa điểm
   hợp lệ, Thì sự kiện được lưu ở trạng thái nháp và chưa hiện với người mua.
2. Giả sử sự kiện đã tồn tại, Khi thêm một suất diễn có thời điểm bắt đầu trong tương lai, Thì
   suất diễn được lưu và gắn với sự kiện.
3. Giả sử nhập thời điểm bắt đầu ở quá khứ, Khi lưu suất diễn, Thì bị chặn kèm thông báo rõ lý do.
4. Giả sử hai suất diễn cùng sự kiện trùng hoàn toàn thời gian, Khi lưu suất thứ hai, Thì cảnh
   báo nhưng vẫn cho lưu — một sự kiện có thể diễn song song ở hai phòng.
5. Giả sử tài khoản ban tổ chức khác, Khi mở sự kiện không phải của mình, Thì bị từ chối.

Ghi chú thiết kế: bảng suất diễn (showtime) sẽ cần liên kết tới sơ đồ ghế và sức chứa ở story
sau — để 1 trường sức chứa/seat_map_id nullable ngay bây giờ để không phải viết lại migration,
nhưng KHÔNG cần xây UI hay logic sơ đồ ghế trong story này.
```

## 7. K-01 — Spike: chọn cơ chế giữ chỗ có thời hạn

Epic E-04. Đây là **nghiên cứu quyết định 1 ngày, timebox chặt**, không phải xây tính năng
hoàn chỉnh. Sản phẩm đầu ra là một quyết định có số đo, không phải code chạy production.

```
SPIKE K-01 — Chọn cơ chế giữ chỗ có thời hạn (timebox 1 ngày, dừng đúng giờ dù chưa xong)

Mục tiêu: so sánh 2 cách giữ 1 ghế có thời hạn (ai chọn ghế thì ghế bị giữ, hết hạn tự nhả),
để chọn cơ chế dùng cho các story chọn ghế thật ở sprint sau:

Phương án A — khoá trong Redis có thời hạn tự hết (vd SET seat:{id} <holder> NX EX 600).
Phương án B — bảng seat_holds trong PostgreSQL (seat_id, held_by, expires_at) + job dọn định kỳ,
hoặc SELECT ... FOR UPDATE SKIP LOCKED.

Việc cần làm:
- Dựng nhanh 1 script/test load cho mỗi phương án (không cần UI, không cần tích hợp vào app thật).
- Bắn 200 request đồng thời vào CÙNG MỘT GHẾ cho từng phương án, đếm số request giữ thành công
  (đúng ra chỉ 1 request được thắng — nếu đo ra khác 1, đó là bằng chứng phương án đó có lỗi
  race condition).
- Với mỗi phương án, kiểm tra thêm: nếu tiến trình nền (worker dọn dẹp, hoặc Redis) vừa khởi
  động lại, giữ chỗ đã hết hạn có được nhả đúng không, hay bị kẹt mãi mãi?
- Ghi lại độ trễ trung bình/p95 của mỗi phương án dưới tải 200 request đồng thời.

Đầu ra bắt buộc (Acceptance Criteria):
- Một quyết định nêu rõ: cơ chế đã chọn (A hoặc B, hoặc kết hợp), con số đo được của CẢ HAI
  phương án (số giữ thành công / 200, độ trễ), và lý do cụ thể loại phương án còn lại — không
  chấp nhận kết luận chung chung kiểu "Redis nhanh hơn" mà không có số.
- Ghi rõ phương án được chọn xử lý thế nào khi tiến trình nền vừa restart mà vẫn phải nhả đúng
  giữ chỗ hết hạn — đây là yêu cầu bắt buộc (NFR) của epic, không phải tuỳ chọn.

Dừng đúng 1 ngày công. Nếu chưa đủ dữ liệu, báo cáo với dữ liệu đang có và nêu rõ phần còn thiếu,
đừng kéo dài quá timebox.
```

## 8. Sau Sprint 1

K-01 quyết định cơ chế cho các story chọn-ghế-thật (S-10, S-13 — chưa có trong dữ liệu bạn đưa,
có thể ở sprint sau). S-04 dựng sẵn bảng sự kiện/suất diễn để story nạp sơ đồ ghế JSON và đặt
giá theo hạng (còn lại của E-03) nối vào. Khi có backlog Sprint 2, đưa lại file để mình viết tiếp
bộ prompt tương ứng.
