# Quản trị nhân viên — S28 / MIP005

Đăng nhập bằng ADMIN, mở **Tài khoản → Quản lý nhân viên** (`/admin/users`). Dùng dữ liệu giả trên laptop staging theo thông báo hiện hành. UI giữ component/token V1; danh sách20tài khoản/trang, bảng cuộn ngang trên mobile.

- Tạo nhân viên: email hợp lệ, mật khẩu8–1024ký tự và vai trò. Email được trim/lowercase; mật khẩu Argon2id. API không trả hash/token. Tài khoản nội bộ được kích hoạt ngay; không gửi email thật.
- Đổi vai trò: xác nhận trước khi lưu. Quyền mới lấy từ DB tại request kế tiếp, không cần đăng xuất. Session giữ nguyên; quyền STAFF cũ không được giữ khi đổi sang ORGANIZER.
- Khóa: trạng thái và việc thu hồi mọi session thực hiện trong cùng transaction. API từ chối cả session còn sót nếu `isActive=false`. Login đang chờ xử lý cũng phải kiểm lại tài khoản dưới khóa DB trước cấp session. Mở khóa không khôi phục session đã thu hồi.
- Không tự đổi vai trò/trạng thái; organizer không có quyền quản trị tài khoản. Các route API vẫn kiểm ADMIN, không dựa vào ẩn nút.
- Staff đơn vai trò đăng nhập vào `/check-in`, kể cả URL returnTo của organizer. Lỗi đăng nhập chung có hướng dẫn liên hệ quản trị, không tiết lộ email tồn tại.

## API

| Method/path | Body | Quyền |
|---|---|---|
| GET `/admin/users?page=1` | — | ADMIN; no-store; projectionID/email/status/roles/createdAt |
| POST `/admin/users` | email,password,role | ADMIN |
| PATCH `/admin/users/:id/role` | role trong5vai trò hiện hành | ADMIN |
| PATCH `/admin/users/:id/status` | isActive:boolean | ADMIN |
| POST `/users/staff` | email,password | ADMIN; legacy wrapper tạoSTAFF |
| PATCH `/users/:id/disable` | — | ADMIN; legacy wrapper khóa |

Payload/UUID sai400, chưa đăng nhập401, sai quyền/self-change403, target không tồn tại404. Không chấp nhận `TICKET_INSPECTOR` từ candidate cũ; contract hiện hành làSTAFF.

Migration mới thêm `user_admin_audit`; không sửa migration cũ, không đổi FK nghiệp vụ. Audit gồm actorID,targetID,action,role/status trước/sau và thời điểm, không lưu email/password/token. Ghi audit thất bại phải rollback thay đổi. MIP031 bổ sung ledger nghiệp vụ/retention; bảng này không thay toàn bộS49. Rollback ứng dụng giữ bảng additive và audit, không drop/reset dữ liệu; bản cũ không dùng bảng này. Chỉ chạy migration bằng deploy vào target đã kiểm.

## Kiểm chứng

Sau kiểm DB/Redis profile riêng:

```powershell
corepack pnpm --filter api exec vitest run --config vitest.config.e2e.ts test/account-management.e2e-spec.ts test/auth-roles.e2e-spec.ts test/registration.e2e-spec.ts
corepack pnpm --filter api test
corepack pnpm --filter web test
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
```

`account-management` chỉ chấp nhận loopback DBsprint2_integration port15432(CI) hoặc15449(profile riêng), dùng UUIDfixture, hai Nestinstance/DBRedis thật, không provider. Fault audit cài trigger test có targetfixture rồi tháo trongfinally, không chạy trên staging. Browser thực thi form→API→DB→reload, kiểm quyền/cookie ở1440×900 và390×844; evidence nằm trong Master Plan, gắn candidateSHA trước tích hợp. Chưa hoàn tất CI/review exactSHA/merge/staging thì chưa nhậnDONE.
