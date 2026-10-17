# Hướng dẫn cho AI agent

## Nguồn sự thật

- `../docs/product.md`: phạm vi sản phẩm; `../docs/architecture.md`: quyết định kỹ thuật; `../docs/risk-and-security.md`: bảo mật và rủi ro; `../docs/ui.md` cùng design system/component hiện có trong `apps/web/`: nguồn hướng dẫn giao diện chính.
- `../docs/decision-log.md`: quyết định đã duyệt và trạng thái còn mở. `../tasks/<TASK-ID>.md`: phạm vi, dependency và nghiệm thu của từng task.
- Nếu tài liệu mâu thuẫn, nêu rõ ID và hỏi người có quyền quyết định; không âm thầm sửa nguồn.

## Phạm vi

- Chỉ làm task được yêu cầu và dependency trực tiếp cần thiết. Không tự tạo yêu cầu nghiệp vụ, đổi kiến trúc, Story Point, Sprint hoặc mở rộng sang task tiếp theo.
- Phân biệt điều đã duyệt, đề xuất và `[CẦN CHỐT]`. Không xem R0 staging với dữ liệu giả/cổng giả lập là bằng chứng production hay sandbox thật.

## Kỹ thuật

- Tuân thủ TECH-01. Root ứng dụng là `thudemo/` (thư mục chứa file này); web cổng 3000, API cổng 3001. Không commit secret hoặc `.env`; không đưa secret vào `NEXT_PUBLIC_*`.
- Giữ lịch sử migration Prisma trong repository. Migration đã áp dụng thành công được hoàn tác bằng migration bù và tái áp dụng bằng migration mới; không dùng `prisma db push` hoặc reset database để nghiệm thu.
- Cơ chế giữ ghế chờ K-01. T-02 phụ trách CI hoàn chỉnh; T-03 phụ trách image ứng dụng và staging.

## Skill và MCP theo loại việc

- Xây màn hình frontend mới: dùng `build-web-apps:frontend-app-builder` và đọc `../docs/ui.md`. Làm Next.js: dùng `vercel:nextjs`. Khi cần component shadcn, dùng `build-web-apps:shadcn` và shadcn MCP để tra cứu registry sau khi đã tìm trong repository; chỉ thêm component thực sự dùng trong task.
- Sau khi sửa nhiều React/TSX component: review bằng `vercel:react-best-practices`. Với thay đổi giao diện chạy được: dùng `vercel:agent-browser-verify`; kiểm desktop, mobile, loading, empty, error, success, bàn phím/focus, console và thao tác chính. Dùng `build-web-apps:frontend-testing-debugging` khi cần xử lý lỗi giao diện.
- Chỉ dùng Figma plugin khi task có Figma URL/node hoặc yêu cầu làm bằng Figma; chỉ dùng GitHub plugin khi cần issue, PR, CI hoặc thao tác repository từ xa. Chỉ dùng skill deployment, authentication, payment hoặc Supabase khi công nghệ tương ứng đã được `../docs/architecture.md` phê duyệt.
- Đọc skill trước khi sử dụng; không dùng đồng thời nhiều skill cùng chức năng khi một skill đã đủ. Plugin đã cài không bảo đảm kết nối hoặc quyền truy cập. MCP có tác dụng ghi chỉ dùng khi task cho phép.
- Nếu skill/MCP cần thiết chưa khả dụng, báo rõ tên công cụ và phần việc bị ảnh hưởng; không đổi stack để thay thế.

## Ưu tiên tái sử dụng component frontend

Khi thực hiện frontend, tìm theo đúng thứ tự:

1. Component đã tồn tại trong repository.
2. Component primitive hiện có trong thư mục UI/design system.
3. Component shadcn đã được cài trong dự án.
4. Component có sẵn trong shadcn registry, tra cứu bằng `build-web-apps:shadcn` và shadcn MCP.
5. Kết hợp nhiều component shadcn hiện có.
6. Chỉ tự viết component khi không có component phù hợp ở các bước trên.

Trước khi tạo component mới, tìm kiếm repository để tránh trùng chức năng, chỉ khác tên, hoặc nhiều implementation của cùng một UI pattern. Không tạo custom thay thế không cần thiết cho Button, Dialog, Form, Input, Table, Card, Tabs, Select, Toast, Dropdown hay primitive đã có. Không cài component shadcn nếu repository đã có component tương đương; chỉ thêm component thực sự sử dụng trong task.

Nếu vẫn cần tự viết, giải thích ngắn gọn vì sao component hiện có và shadcn không đáp ứng. Giữ API và composition pattern nhất quán với shadcn hiện tại; tái sử dụng CSS variables, design tokens, `cn` và variant utility hiện có. Theo màu, typography, spacing, radius, shadow và trạng thái tương tác của dự án; không hard-code màu khi đã có token. Dùng semantic HTML, keyboard navigation khi phù hợp, focus rõ và ARIA khi native HTML chưa đủ. Hỗ trợ disabled, loading, error, validation và responsive khi liên quan. Không sao chép component từ nguồn chưa kiểm chứng, không tạo abstraction chung chỉ cho một lần dùng; ưu tiên bọc hoặc compose primitive hiện tại thay vì sửa trực tiếp primitive dùng chung.

## Quy trình frontend chuẩn

- **DISCOVER:** Đọc task và `../docs/ui.md`; kiểm tra component trong repository, primitive UI/design system và shadcn đã cài; tra registry nếu còn thiếu.
- **PLAN:** Liệt kê component sẽ tái sử dụng, component shadcn thật sự cần thêm, component buộc phải tự viết kèm lý do; xác định loading, empty, error, success và responsive state.
- **IMPLEMENT:** Tái sử dụng trước, compose shadcn khi phù hợp, chỉ tự viết phần đặc thù; không thay toàn bộ design system trong một task tính năng.
- **REVIEW:** Sau khi sửa nhiều TSX/component, dùng `vercel:react-best-practices`; chạy lint, typecheck, test liên quan và build khi phù hợp.
- **VERIFY:** Khi giao diện thay đổi và chạy được, dùng `vercel:agent-browser-verify`; kiểm desktop, mobile, loading, empty, error, success, keyboard/focus cơ bản, console và lỗi runtime. Thay đổi chỉ ở tài liệu hoặc logic không tạo UI không bắt buộc kiểm browser.

## Hoàn thành

- Chạy build, lint, typecheck và test liên quan khi task có thay đổi triển khai. UI phải được kiểm tra trực tiếp bằng browser.
- Từ `thudemo/`: `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`; sau khi PostgreSQL và Redis local sẵn sàng, `pnpm --filter api run test:e2e` và kiểm tra `http://localhost:3001/health`.
- Liệt kê file đã đổi và tóm tắt diff. Không commit khi prompt chưa yêu cầu.


## Review tự động và tích hợp — DEC-18

- Chỉ áp dụng sau khi DEC-18 được người dùng chấp thuận và cấu hình được đọc lại thành công. Feature/fix → PR → develop; không push trực tiếp, force-push, xóa develop hoặc bypass.
- Gate thay thế approval thành viên khác là review kỹ thuật tự động thực sự trên exact base/head/diff, không lấy CI/test PASS hoặc JSON tự khai làm review. Artifact phải ghi loại automated technical review, actor thực thi, thời gian, coverage file/AC/risk, findings và bằng chứng sửa/kiểm lại. Không ghi là human/independent approval.
- Required status Review / technical-review chỉ success khi report đầy đủ, đúng SHA, không còn finding bắt buộc hoặc coverage/risk chưa kiểm; P0–P2 bắt buộc xử lý; P3 chỉ được để lại nếu không vi phạm AC/NFR/bảo mật/toàn vẹn dữ liệu và có lý do. Code-sensitive diff dùng security review phù hợp; scanner sạch không thay review correctness/concurrency/migration.
- Giữ nguyên năm required CI checks/app đã chốt, strict branch cập nhật, conversation resolution, enforce admins, cấm force-push/xóa develop. Mỗi push mới mất hiệu lực receipt cũ; base đổi phải revalidate/review theo diff mới.
- Chỉ arm auto-merge khi exact-head review status và mọi required CI đều success, PR đúng phạm vi/base, không conversation chưa giải quyết, không draft/conflict, môi trường/backup sẵn sàng; dùng exact-head guard. Không arm sớm để chờ CI.
- Sau khi người dùng duyệt chính sách, được tự thực hiện review→fix→verify→PR/auto-merge→postmerge CI/staging cho các task đã giao, không hỏi lại từng PR. Không tự mở rộng sang task chưa giao, main/release/production, dịch vụ trả phí hoặc quyết định nghiệp vụ mới.
- Merge/CI trước merge không phải nghiệm thu staging. Sau merge phải xác minh integrated SHA/CI, watcher tự deploy, actual timing/health/smoke/source/data/keys/rollback và AC liên quan trước Done.
- Giữ tác giả/owner/commit/review lịch sử. Không dùng tài khoản người khác để tạo approval. Bằng chứng đóng góp ghi rõ account thực thi và phần hỗ trợ tự động; không suy commit hoặc automated review thành người khác trực tiếp review hay năng lực cá nhân.
