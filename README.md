# Event Ticketing Platform — môi trường local T-01

Scaffold hiện có chạy web và API trực tiếp trên máy phát triển. Docker Compose chỉ chạy PostgreSQL và Redis. T-01 chưa triển khai staging, thanh toán thật, schema người dùng hoặc cơ chế giữ ghế.

## Yêu cầu

- Node.js **24.21.0 LTS**, pnpm **10.15.1**, Docker Desktop/Compose.
- Chạy các lệnh dưới đây từ thư mục `thudemo/`.
- Copy `.env.example` thành `.env`, thay các placeholder bằng **giá trị thử nghiệm local**. Không dùng credential production. `.env` đã bị Git ignore; không đưa bí mật vào `NEXT_PUBLIC_*` hoặc log.

## Chạy local

```powershell
node --version
pnpm --version
docker compose up -d --wait postgres redis
pnpm install --frozen-lockfile
pnpm --filter api exec prisma migrate deploy
pnpm --filter api exec prisma generate
```

Mở hai terminal riêng, cùng ở root `thudemo/`:

```powershell
pnpm --filter api run start:dev
```

```powershell
pnpm --filter web run dev
```

- API: `http://localhost:3001/health`. Endpoint chỉ trả `200` khi PostgreSQL và Redis cùng phản hồi; lỗi kết nối trả `503`.
- Web: `http://localhost:3000`.
- PostgreSQL và Redis chỉ công bố trên `localhost:5432` và `localhost:6379`.

## Kiểm tra

```powershell
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter api run test:e2e
```

Các migration T-01 trong `apps/api/prisma/migrations/` chỉ chứng minh thay đổi schema kỹ thuật, migration bù và tái áp dụng. Chúng không tạo bảng User/Event/Showtime đang khai báo trong scaffold; các bảng nghiệp vụ thuộc task sau. Không dùng `prisma db push`, reset hoặc xóa database để nghiệm thu migration. Lịch sử migration phải được giữ nguyên.

CI hoàn chỉnh và chặn merge thuộc T-02; Docker image ứng dụng, staging và rollback deployment thuộc T-03.
