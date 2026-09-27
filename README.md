# Event Ticketing Platform

Dự án nền tảng bán vé sự kiện có sơ đồ ghế - Sprint 1.

## 🚀 Hướng dẫn chạy dự án chi tiết (Sử dụng PowerShell)

Do dự án sử dụng cấu trúc Monorepo với `pnpm` và cần build một số native packages, hãy làm theo các bước sau bằng PowerShell trên Windows:

### Bước 1: Khởi động Docker Desktop
Hãy đảm bảo bạn đã mở ứng dụng **Docker Desktop** trên Windows và đợi cho đến khi Engine ở trạng thái "Running". Điều này bắt buộc để có thể khởi chạy database.

### Bước 2: Dọn dẹp và cài đặt gói phụ thuộc (Dependencies)
Mở PowerShell tại thư mục gốc của dự án (`d:\Downloads\DEMO`) và cấp quyền chạy các script cài đặt (để `prisma` và `argon2` có thể build đúng):
```powershell
# Bật tính năng cho phép chạy post-install scripts
npx pnpm config set ignore-scripts false

# Tiến hành cài đặt lại toàn bộ gói phụ thuộc
npx pnpm install --force
```

### Bước 3: Khởi chạy Database & Redis
Khởi động cơ sở dữ liệu PostgreSQL và Redis thông qua Docker:
```powershell
docker compose up -d postgres redis
```
*(Đợi một lát cho đến khi console thông báo container `Started`)*

### Bước 4: Đồng bộ CSDL và Sinh Prisma Client
Tạo các bảng (tables) trong Database và generate thư viện Prisma:
```powershell
cd apps\api
npx prisma db push
npx prisma generate
cd ..\..
```

### Bước 5: Chạy API Server
Khởi động server backend (NestJS) môi trường dev:
```powershell
npx pnpm --filter api run start:dev
```
Server sẽ chạy tại `http://localhost:3000`. 

**Kiểm tra:** Mở trình duyệt và truy cập [http://localhost:3000/health](http://localhost:3000/health). Nếu màn hình hiện `{"status": "ok", "timestamp": "..."}` thì xin chúc mừng, API của bạn đã chạy thành công!
