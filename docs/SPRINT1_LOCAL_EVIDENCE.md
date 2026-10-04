# Sprint 1: bằng chứng local và hướng dẫn demo

Ngày kiểm tra: 01/10/2026 (giờ Việt Nam). Môi trường: máy phát triển, PostgreSQL/Redis Docker local. Không dùng credential hay dữ liệu production. Đã có thêm CI GitHub thật cho T-02; bằng chứng local/CI chưa thay thế staging hoặc review độc lập.

## Trạng thái theo task

| Task | Trạng thái thực tế | Bằng chứng local | Còn thiếu để Done |
| --- | --- | --- | --- |
| T-01 | DONE | `tasks/T-01.md` ghi từng AC; lượt này Node 24.21.0, pnpm 10.15.1, Docker Engine 29.5.3, Compose 5.1.4, frozen install, health, migration và kiểm thử vẫn đạt. | Không có AC T-01 còn thiếu. |
| T-02 | PARTIALLY DONE | Workflow push/PR, quyền `contents: read`, runtime đúng TECH-01, frozen install; actionlint đạt. GitHub run hợp lệ `36765657553` xanh 3/3 check trong 48 giây. Branch protection trên `main` yêu cầu đủ ba check; run cố ý sai lint `36827889536` thất bại trong 46 giây và PR #2 có `mergeable_state: blocked`, sau đó đã đóng không merge. | AC kỹ thuật đã đạt; còn review độc lập theo DoD trước khi chuyển task sang Done. |
| T-03 | PARTIALLY DONE | Hai image Docker đã build và smoke local; CI PR #4 xanh 3/3 trong 49 giây. | T-02 chưa Done theo DoD; chưa có host staging, registry/secret, tên miền/HTTPS và quyền triển khai để kiểm chứng deploy/rollback dưới 10 phút. |
| T-04 | PARTIALLY DONE | Migration `users`/`roles`/`user_roles`; unique email từ chối trùng; seed local tạo 5 vai trò và 2 tài khoản giả với Argon2id. Migration bù rồi tái áp dụng trên DB cô lập, giữ lịch sử; CI PR #3 xanh. | Staging và review độc lập theo DoD. |
| T-05 | PARTIALLY DONE | Phiên phía máy chủ theo TECH-02, cookie HttpOnly/Secure trên HTTPS, kiểm nguồn thao tác ghi; đăng nhập web local thành công. E2E xác nhận khoá Redis và dọn phiên hết hạn; CI PR #3 xanh. Playwright mobile 390×844 đăng nhập thành công, không có console error. | Staging và review độc lập. |
| T-06 | PARTIALLY DONE | Guard kiểm vai trò từ DB mỗi yêu cầu, thu hồi quyền có hiệu lực ngay; đăng xuất thu hồi phiên. `curl` local: organizer route 200, route không khai báo 403, admin vào route organizer 403; CI PR #3 xanh. | Staging và review độc lập. |
| T-09 | PARTIALLY DONE | Migration `events`/`showtimes`, FK chặn xoá event còn showtime, thời gian `timestamptz`; migration bù rồi tái áp dụng trên DB cô lập; CI PR #3 xanh. | Staging và review độc lập. |
| T-10 | PARTIALLY DONE | UI tạo/sửa/danh sách sự kiện và suất diễn bằng shadcn; API kiểm owner, trường nhập và thời gian. E2E xác nhận user khác nhận 403; browser local tạo/sửa/thêm suất diễn và validation đạt; CI PR #3 xanh. Playwright mobile 390×844 xác nhận danh sách, form tạo, ba lỗi tại trường, focus và không tràn ngang/console error. | Staging và review độc lập. |
| K-01 | BLOCKED | Chưa chạy spike hoặc chọn kho giữ ghế. | S-01/staging chưa Done; cần thử hai phương án với 200 yêu cầu đồng thời và reviewer. |

Database cô lập `sprint1_verify_b7lad8x8` giữ 9 bản ghi migration sau chuỗi apply → migration bù → tái áp dụng T-04/T-09. Database local `event_demo` có 6 migration hiện hành gồm T-01, T-04, T-09 và T-05. Không dùng `db push`, reset hay xoá database. `WEB_ORIGIN` giới hạn nguồn yêu cầu ghi dùng cookie; khi chạy trên domain HTTPS phải đặt đúng origin của web.

## Demo local

1. Dùng Node.js **24.21.0**, pnpm **10.15.1**, Docker Engine/Desktop và Docker Compose. Tạo `.env` từ `.env.example` tại root `thudemo/`, thay placeholder cho PostgreSQL. Giữ `WEB_ORIGIN=http://localhost:3000` ở local. Không commit `.env`.
2. Đặt hai mật khẩu giả dài tối thiểu 12 ký tự trong biến môi trường `DEMO_ADMIN_PASSWORD` và `DEMO_ORGANIZER_PASSWORD` của terminal chạy seed. Không dùng tài khoản thật hoặc credential production.
3. Chạy `pnpm install --frozen-lockfile`, `docker compose up -d --wait postgres redis`, `pnpm --filter api exec prisma migrate deploy`, `pnpm --filter api exec prisma generate`, rồi `pnpm --filter api run seed:demo`.
4. Chạy `pnpm --filter api run dev` và `pnpm --filter web run dev` ở hai terminal. Gọi `http://localhost:3001/health` để kiểm PostgreSQL/Redis và mở `http://localhost:3000/`.
5. Đăng nhập bằng `organizer@demo.invalid` và mật khẩu giả vừa đặt. Trang `/events` chỉ hiện sự kiện của organizer đó. Chọn **Tạo sự kiện**, thử gửi form trống để thấy lỗi tại từng ô, nhập dữ liệu giả rồi lưu. Sửa sự kiện, thêm suất diễn trong tương lai, quay lại danh sách, tìm theo tên và đăng xuất. Vào lại `/events` sau đăng xuất phải được chuyển về `/login`.
6. Dừng dev server bằng Ctrl+C; `docker compose stop` dừng dependency mà vẫn giữ volume.

Giới hạn: UI đã được kiểm bằng trình duyệt desktop và Playwright mobile 390×844; chưa kiểm trên thiết bị di động vật lý. T-03 staging và K-01 chưa có bằng chứng; CI GitHub đã chạy thật cho PR #1, #3 và #4, run PR #3 gần nhất xanh 3/3 trong 50 giây. Sự kiện tạo ra giữ trạng thái nháp; không có thao tác xuất bản trong phạm vi Sprint 1.

## Kiểm thử và rollback

- Lượt cuối ngày 01/10/2026: `pnpm install --frozen-lockfile`, `prisma migrate deploy` (không còn migration chờ), `prisma generate`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (4/4), `pnpm --filter api run test:e2e` (5/5) và `pnpm build` đều đạt. Playwright mobile 390×844 đăng nhập, mở danh sách/form tạo, hiển thị lỗi tại trường, không tràn ngang và không có console error. Plugin Vitest vẫn báo khuyến nghị chuyển `vite-tsconfig-paths` sang cấu hình native, không làm test thất bại.
- E2E sự kiện nhiều bước lần đầu vượt timeout mặc định 5 giây; tăng timeout riêng lên 15 giây và chạy lại đạt 5/5, không bỏ qua assertion.
- `rollback.sql` của T-04/T-09/T-05 là mẫu cho **migration bù mới** với review và kế hoạch dữ liệu, không chạy trực tiếp trên DB đang dùng. Nếu cần hoàn nguyên, dừng luồng ghi, backup rồi bù theo thứ tự phụ thuộc; không xoá volume/reset database để giả rollback. Hoàn nguyên code bằng một thay đổi Git có review; giữ nguyên `README.md` và `AGENTS.md` vốn đã thay đổi trước lượt này.

## Việc cần làm trên GitHub

Repository hiện là `TTCS-T926-K19C5-N2/thudemo`. Branch protection trên `main` đã yêu cầu `T-02 / build-and-typecheck`, `T-02 / lint`, `T-02 / test` ở chế độ strict và một approval. PR hợp lệ #1 có ba check xanh trong 48 giây; PR proof #2 cố ý sai lint chạy lại ở run `36827889536`, lint đỏ và GitHub trả `mergeable_state: blocked`; PR proof đã đóng không merge. PR #1 và #3 vẫn cần review độc lập từ `thuytrang158`. Chi tiết trong `docs/SPRINT1_GITHUB_HANDOFF.md`.
