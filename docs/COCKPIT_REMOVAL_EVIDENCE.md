# Gỡ ShowSeat Cockpit — nghiệm thu local 04/10/2026

## Kết quả

**DONE cho việc thay giao diện Cockpit trong phạm vi local.** Không xác nhận Sprint 2, staging, CI hoặc pixel-identical đã hoàn tất.

[Gallery Stitch / trước / sau](../evidence/cockpit-removal/20261004/index.html) có 8 ảnh trước sửa, 32 ảnh sau sửa và 4 reference lấy lại bằng Stitch MCP chỉ đọc. [96 kiểm chức năng/state](../evidence/cockpit-removal/20261004/browser-results.json), [70 kiểm bản build cuối](../evidence/cockpit-removal/20261004/final-browser-results.json), [AST](../evidence/cockpit-removal/20261004/ast-validation.json), [WIP audit](../evidence/cockpit-removal/20261004/change-audit.json).

## Nguồn và phạm vi

Project `1184317708208520256`, updateTime `2026-10-04T12:38:11.779357Z`, design system `11368154981114117566` version 2. Đọc HTML/head tokens và xem ảnh đầy đủ của các ID:

- `00e1f736c6bb4aca894f4728ff92135e`: organizer desktop.
- `ace8a0b9fe7e454e910c70806cfcba9a`: organizer mobile.
- `6f8e57d7a84e4723a6f9686db5018ca0`: bảng/form giá desktop.
- `067ffc23e523451f8a347980081c73e6`: public layout.

Tải bằng helper `fetch-stitch.sh`, ảnh dùng `=w{metadata.width}`. Exports lịch sử không bị ghi đè. Metadata và token resource ghi rõ sync một phần 4 ID; 25 ID còn lại giữ bằng chứng trước. Không tạo/edit/upload design. Chỉ các reference đã duyệt trong ledger được dùng.

`/events`, `/events/new`, `/events/[id]`, `/account` chưa có reference riêng trong phạm vi 29 ID; tái sử dụng shell, bảng, form, surface, typography và spacing của các reference phù hợp. Không tuyên bố đây là các màn hình Stitch mới hoặc đã khớp pixel với một reference không tồn tại.

## Thay đổi của lượt này

- Sửa `apps/web/src/app/events/page.tsx`: bảng/lưới sáng, lọc và tìm kiếm thực; số liệu tính từ API.
- Sửa `apps/web/src/components/event-editor.tsx`: form tạo/sửa và danh sách/thêm suất diễn thực; xóa simulator ghế giả và trạng thái simulator. Giữ validation, presets, endpoint, method, payload và guards hiện có.
- Sửa `apps/web/src/app/account/page.tsx`: email/vai trò từ `/auth/me`; Organizer dùng organizer shell, Buyer dùng public shell; bỏ matrix quyền giả và các thông tin bảo mật tĩnh không có trong contract.
- Sửa `apps/web/src/components/layout/product-layout.tsx`: mở rộng shell hiện có cho sự kiện/tài khoản; giữ route suất diễn; thêm slot phiên đã đăng nhập vào public header.
- Thêm `apps/web/src/components/layout/session-actions.tsx`: giữ POST logout thật, pending/error và điều hướng hiện có; có thao tác trên mobile.
- Sửa `apps/web/src/app/globals.css`, `layout.tsx`, `product.css`: token nền sáng toàn cục; xóa glass/glow/neon/scrollbar riêng; typography/panel/button/badge theo Stitch. Sửa tràn ngang do nhãn screen-reader trong bảng và selector địa điểm mobile không áp vào Material icon.
- Xóa đúng hai component đã hết nơi dùng: `workspace-header.tsx`, `brand-mark.tsx`. Logo riêng là SVG trong component; không có asset rời cần xóa. Giữ nguyên poster/font/Material Symbols thuộc Stitch.
- Cập nhật `.stitch/metadata.json`, `.stitch/resources/style-guide.json` và mirror `../.stitch/metadata.json`; thêm tài liệu/bằng chứng này.

Không sửa backend, schema, migration, package manifest, lockfile, Docker/deploy/CI hoặc dữ liệu đang có. Git diff các file tracked ngoài web giống trước lượt sửa; xem audit. `/events/new` và `/events/[id]` giữ nguyên route page, chỉ component giao diện được thay.

## Nghiệm thu

| Yêu cầu | Bằng chứng | Kết quả |
|---|---|---|
| Bảo toàn WIP | Snapshot 132 file + patch/hash; non-web tracked diff không đổi | PASS |
| Gỡ hết Cockpit trong sản phẩm | `rg` không còn WorkspaceHeader/BrandMark/ShowSeat/Cockpit/glass-panel/ambient-glow/bg-gradient trong source | PASS |
| Dùng Stitch thật | MCP project/screen/design system, HTML/PNG/token và gallery | PASS |
| Không xóa trang nghiệp vụ | Build vẫn có tất cả event/account/show/showtime routes | PASS |
| Organizer đăng nhập → `/events` | Browser thật, session cookie và API thật | PASS |
| Tạo/sửa/thêm suất diễn | Validation → POST event → PATCH event → POST showtime, phản hồi và điều hướng thật | PASS |
| Buyer đăng nhập → `/account` | Role từ API; không có CTA quản lý sự kiện | PASS |
| Quyền phía server | Buyer gọi `/api/events/mine` nhận 403 | PASS |
| Desktop/mobile | 1280/390; event/editor/account/manage/import/prices/map; không tràn trang | PASS |
| Root nền sáng | Computed body `rgb(250,248,255)`, Geist; sidebar 240 px, header 56 px | PASS |
| Mobile/bàn phím | Mở menu, vào account, focus visible; một logout khả dụng mỗi viewport | PASS |
| State và runtime | Loading/empty/error UI-only; validation/success thật; 0 pageerror, console cuối 0 errors/warnings | PASS |

## Lệnh đã chạy

```powershell
npx --yes pnpm@10.15.1 --filter web run lint
npx --yes pnpm@10.15.1 --filter web run typecheck
npx --yes pnpm@10.15.1 --filter web run test
npx --yes pnpm@10.15.1 --filter web run build
git diff --check -- apps/web/src
```

PASS: lint/typecheck, 14 test trong 3 file, production build và diff check. Prettier 3.6.2 check 8 file đã sửa PASS; không thêm dependency vào repository. Restart standalone web từ build cuối bằng `scripts/run-sprint2-local.ps1 -Mode Web -Database stitch_fidelity`; API port3001 và web port3000. Health API `ok`.

Browser dùng Playwright CLI hiện có vì `agent-browser` CLI không có trong PATH; áp dụng checklist của skill browser verification. Skill chính `stitch::react-components`, cùng Next.js/React review; dùng TypeScript compiler AST thay SWC helper chưa có dependency. Không đổi Next sang Vite, không tạo mockData hoặc React Router. Component readonly props, token-mapped styles, primitive Button/Input/Label/Textarea/Badge/Skeleton hiện có được tái sử dụng.

Baseline warning: Vitest/Vite cảnh báo ESM trong config `.ts` loaded CommonJS với chế độ native dự kiến ở bản tương lai; 14 test vẫn PASS. Không sửa cấu hình ngoài phạm vi. Network500 trong lượt state error là route fixture có chủ đích, không phải DB/provider outage. Một lượt harness gặp race `route already handled`; đã chờ request loading hoàn tất và chạy lại PASS. Lỗi tràn mobile được sửa và kiểm lại trên build mới.

## Khác biệt còn lại so với reference

- Các trang không có reference riêng là màn hình nghiệp vụ suy ra từ component hệ thống Stitch, không phải đối chiếu pixel từng vùng.
- Suất diễn thật có 22 sibling thay vì 4 suất minh họa; trang quản lý dài hơn. Giữ nguyên lịch sử suất hiện có.
- Reference minh họa nháp/sẵn sàng mở, suất thực đang bán; CTA đúng nghiệp vụ là đóng bán. Không đổi trạng thái DB để khớp ảnh.
- Không đưa demo banner, số bán vé giả, quyền giả hoặc thông tin không có trong API trở lại sản phẩm. Header dùng tiêu đề trang/context có thật; điều khoản chưa khả dụng vẫn disabled.
- Bảng sự kiện mobile cuộn ngang trong vùng bảng; không tràn toàn trang. Có chế độ lưới theo cùng panel system.
- Các sai lệch visual đã ghi trước đây cho 29 screen vẫn cần review riêng nếu muốn nghiệm thu pixel fidelity toàn Sprint; lượt này không xóa hoặc nâng trạng thái bằng chứng cũ.

## Dữ liệu kiểm tra và rollback

Kiểm CRUD tạo **hai sự kiện giả** `Sáng kiểm tra Stitch …`, mỗi sự kiện một suất mới; ID nằm trong final browser report. Không seed/reset hoặc thay metadata của sự kiện cũ. Chúng được giữ lại để truy vết, không có endpoint delete được tự thêm.

Snapshot riêng: `.git/cockpit-removal-20261004/files/`, `manifest.json`, `wip-before.patch`, `status-before.txt`; mirror metadata cũ ở `workspace-metadata-before.json`. Diff chỉ của lượt này ở `task-only.patch`. Không chứa mật khẩu trong gói evidence.

Muốn rollback, kiểm tra các thay đổi phát sinh sau lượt này trước, rồi chỉ copy từng file đã sửa/xóa từ snapshot về đúng vị trí; khôi phục mirror metadata từ bản riêng. Component SessionActions chỉ xóa khi không còn caller. Build/restart web sau rollback. Không restore toàn repository, không reset DB, không chỉnh migration.

Không commit, push, tạo PR, publish hoặc deploy. Không có MUST FIX còn mở trong phạm vi thay Cockpit; các khác biệt visual/data ở trên được giữ minh bạch để PO review.
