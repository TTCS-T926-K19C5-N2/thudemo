# T-03 — bằng chứng đóng gói Docker local
> Cập nhật DEC-11 / 04-10-2026: Render Free, ngân sách 0; PO + review kỹ thuật tự động thực hiện review/chốt; chưa commit/push/PR/publish/upload/deploy. Quy định host/reviewer bên dưới là lịch sử. Xem [gói PO review hiện tại](SPRINT2_PO_REVIEW.md) và [runbook Render](RENDER_FREE_RUNBOOK.md). K-01 tạm thời vẫn chờ PO duyệt recommendation đã đo; không miễn staging/CI/NFR/DoD.

Ngày 01/10/2026. Đây là phần chuẩn bị local cho T-03, **chưa phải nghiệm thu staging**. T-02 đã chứng minh required check chặn merge nhưng chưa đạt DoD vì còn chờ review độc lập; chưa có máy chủ staging, registry, đường cấp SSH hoặc kho secret. Không có image nào được push hoặc deploy.

## Image và kiểm tra local

Từ root repository:

```sh
docker build --target api --tag event-ticketing-api:t03-local .
docker build --target web --tag event-ticketing-web:t03-local .
```

Build dùng Node.js `24.21.0`, pnpm `10.15.1` và `pnpm install --frozen-lockfile`. Image API cài OpenSSL cho Prisma, chỉ mang dependency runtime và tạo lại Prisma Client trong gói triển khai. Image web dùng output Next.js standalone. Hai image chạy bằng user `node`; `.dockerignore` loại `.env`, Git, dependency/build local và tài liệu khỏi build context.

Lượt kiểm tra local: cả hai image build thành công; API **852 MB**, web **413 MB**. Đặt API và web vào cùng Docker network với PostgreSQL/Redis local, gán alias `api` cho API; truyền `DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`, `WEB_ORIGIN` từ môi trường runtime. Các URL kiểm tra đều trả HTTP 200:

| URL local | Bằng chứng |
| --- | --- |
| `http://127.0.0.1:3101/health` | API kết nối PostgreSQL và Redis, `status: ok` |
| `http://127.0.0.1:3100/` | Trang chủ có nội dung |
| `http://127.0.0.1:3100/login` | Trang đăng nhập có nội dung |
| `http://127.0.0.1:3100/api/health` | Web chuyển tiếp đến API container |

`docker image inspect` xác nhận user runtime là `node` cho cả hai image. Kiểm tra trong image xác nhận không có `/app/.env`. Container smoke test đã dừng và xóa; PostgreSQL/Redis local giữ nguyên dữ liệu. Không dùng credential production.

## Điều kiện còn thiếu

- T-02 đã có required checks và bằng chứng PR sai lint bị chặn; còn cần review độc lập trước khi đánh dấu Done và merge.
- Cung cấp máy chủ staging Docker, registry, tên miền/HTTPS, cách cấp SSH và secret riêng. Web image hiện dùng Docker DNS `api:3001` cho rewrite; staging cần service/alias `api` trên cùng network.
- Thiết kế và kiểm chứng thao tác migration trên staging, health gate trước chuyển traffic, giữ container cũ khi image lỗi, rollback image không đảo migration phá dữ liệu. Đo từ merge đến staging hoạt động dưới 10 phút.
- Chạy smoke với dữ liệu giả và review độc lập trước khi nghiệm thu T-03. Không mở PostgreSQL/Redis ra Internet hoặc dùng cấu hình local làm cấu hình staging.

Các bước trên không thể chứng minh bằng image build và health local; trạng thái T-03 vẫn **PARTIALLY DONE/BLOCKED ở phần staging**.
