# Stitch official — bằng chứng local ngày 04/10/2026

## Kết luận

**PARTIALLY DONE về visual fidelity.** Triển khai frontend và toàn bộ kiểm chức năng local bên dưới PASS; đã tải, xem, đối chiếu và tạo gallery đúng 29 reference. Chưa kết luận visual hoàn tất: còn sai khác bố cục organizer/alert/summary ghi theo từng màn hình. Các sai khác này không được che bằng số liệu test chức năng hay một phần trăm giống tự chấm. Không nâng trạng thái Sprint/CI/staging/K-01/T-31 từ báo cáo này.

## Reference, công cụ và WIP

- Project `1184317708208520256` — Nguyễn Văn Sáng — Demo Sprint 2 · Vé sự kiện; updateTime `2026-10-04T12:38:11.779357Z`, sync `2026-10-04T13:28:17.354Z`. Chính xác29 ID trong ledger, không mở rộng43 screen của project.
- `stitch::react-components` Google Labs pinned 0337446dadde6f8c94210444e2aa9d546126480f đã đọc và áp dụng: discovery thực qua tools, get_project/get_screen chỉ đọc, fetch-stitch.sh qua Git Bash, HTML/PNG, token, metadata, AST và visual comparison. Không generate/edit/upload Stitch.
- Dùng Next.js/React review/agent-browser-verify và frontend-testing-debugging; primitive shadcn hiện có được tùy biến theo nguồn. Browser plugin riêng của skill debugging không khả dụng: dùng repository Playwright CLI thực; không đổi stack, không cài dependency ứng dụng.
- Prompt mới ưu tiên quy ước Next/App Router/domain/API thật thay Vite/React Router/mockData/darkmode/mandatory Props validator mẫu. Project adapter AST TypeScript kiểm explicit-any/parse error/placeholder href/unsupported routing/inline hex JSX.
- Tải 29 HTML và29 PNG bằng helper chính thức vào `.stitch/designs`; giữ exports cũ làm lịch sử. 29 PNG có hash khớp lịch sử;29 HTML DOM tương đương (28 file chỉ khác serialization; 1 file bằng byte). Không tự tuyên bố thiết kế mới thay đổi.
- Source HTML được render độc lập ở CSS 1280/390, Chromium DPR 1. Bitmap tải về có tỷ lệ width/CSS được đo từng file (đa số 2, có file 1); không suy ra mọi PNG có cùng DPR từ metadata. Full PNG gốc và source render đều có trong gallery.
- Token lưu `.stitch/resources/style-guide.json`: Geist, primary#0045a9/container#175cd3; font-weight/line-height/radius/border/spacing từ head và computed DOM, không áp phong cách từ skill thẩm mỹ. Material Symbols variable100–700, subset 42 glyph được host local và kèm Apache2 license/provenance.
- Snapshot WIP trong `.git/stitch-official-wip-20261004`: 204 file. Không mất file baseline; backend/schema/migrations/manifests/lockfile/CI/Docker/Render config giữ nguyên hash. API chỉ sửa helper test allowlist run, không sửa nghiệp vụ.
- Không commit/push/PR/publish/upload source/deploy. Dữ liệu kiểm là các tài khoản `example.invalid` trong database riêng `stitch_fidelity`; competing buyer/quyền run đã cleanup, không reset database hoặc xóa migration.

## Đại diện trước → sau: login mobile 390

| Thuộc tính | Reference | Before thật đầu lượt | After |
|---|---|---|---|
| Core form |358×305px|358×329.5px|358×305px|
| Label font/line-height |12/16px|14/19.25px|12/16px|
| Email input geometry |324×44px, radius4|324×44px, radius6|324×44px, radius4|
| Input font |14px|16px|14px|
| Desktop card |460px, radius12|460px, radius12|460px, radius12; lỗi401 thật|

Xem [before trực tiếp](../evidence/stitch-official/20261004/before/login-390.png), [after clean](../evidence/stitch-official/20261004/after/login-clean-390.png), [computed before](../evidence/stitch-official/20261004/login-before-metrics.json), [computed after](../evidence/stitch-official/20261004/login-after-metrics.json). Context after122.5px vs reference106px do tên API dài; không đưa copy demo/M08/mock credentials trở lại. Before cho28 màn hình khác trong gallery là lịch sử run holds, không giả là screenshot đầu lượt.

## Đối chiếu29 màn hình

Gallery có HTML/raw PNG/source CSS/full-page after và cặp first viewport không mask. Cặp crop900 desktop/844 mobile chỉ để xem nhanh; full-page là bằng chứng đầy đủ. Không resize ảnh app để giả cùng geometry.

| Reference / CSS width | After & cặp đối chiếu | Kết quả và khác biệt |
|---|---|---|
|01 Khám phá sự kiện `067ffc23e523451f8a347980081c73e6` / 1280px|[after](../evidence/stitch-official/20261004/after/catalog-1280.png) · [reference/after](../evidence/stitch-official/20261004/comparison/067ffc23e523451f8a347980081c73e6.png)|Geist, Material Symbols, poster đủ độ phân giải, metadata mobile, nút 44px; số sự kiện/phân trang là API thật, search/filter/sort chưa có contract vẫn disabled.|
|02 Chi tiết suất diễn `e44ee9ca7e104e9caa80e894f2bdcdfd` / 1280px|[after](../evidence/stitch-official/20261004/after/detail-1280.png) · [reference/after](../evidence/stitch-official/20261004/comparison/e44ee9ca7e104e9caa80e894f2bdcdfd.png)|Hero/crop/tier dùng asset và API thật; mobile có header quay lại. Nhiều suất đóng làm trang dài hơn; không xóa lịch sử, không thêm duration/check-in/tax giả.|
|03 Chọn và giữ ghế `fc17da850a404552be43970014418499` / 1280px|[after](../evidence/stitch-official/20261004/after/held-1280.png) · [reference/after](../evidence/stitch-official/20261004/comparison/fc17da850a404552be43970014418499.png)|HTTP200/PG rights thật, reload/deadline/drift/reconnect. Mobile header/timer thật; summary trong flow. Source grid nhỏ/sticky summary khác bản đồ2000 và hành vi đã duyệt.|
|04 Quản lý suất diễn `00e1f736c6bb4aca894f4728ff92135e` / 1280px|[after](../evidence/stitch-official/20261004/after/manage-1280.png) · [reference/after](../evidence/stitch-official/20261004/comparison/00e1f736c6bb4aca894f4728ff92135e.png)|Sidebar240/header56, mobile card240, fact/readiness thu gọn và Material icons. Không fake số vé bán/hold/sẵn sàng của suất chưa truy vấn; heading/context còn khác bố cục source.|
|05 Nạp sơ đồ JSON `e8fd30e083654772a91ce72289e51a7a` / 1280px|[after](../evidence/stitch-official/20261004/after/import-1280.png) · [reference/after](../evidence/stitch-official/20261004/comparison/e8fd30e083654772a91ce72289e51a7a.png)|File picker/preview/confirm thật, distribution400/1000/600 và full errors. Không fake metadata file/giá; vị trí extra preview/help và chiều cao panel còn khác source.|
|06 Đặt giá theo hạng `6f8e57d7a84e4723a6f9686db5018ca0` / 1280px|[after](../evidence/stitch-official/20261004/after/prices-1280.png) · [reference/after](../evidence/stitch-official/20261004/comparison/6f8e57d7a84e4723a6f9686db5018ca0.png)|VND suffix, input44/radius6, label/status/zero miễn phí, negative card border; integer nonnegative thật. Category/row theo API; restore/preview giữ nguyên chức năng. Desktop lỗi vẫn còn khác layout badge/sidebar source.|
|07 Xem sơ đồ ghế (Read-only) `9b294786f6ba4aabb770caef00d59377` / 1280px|[after](../evidence/stitch-official/20261004/after/map-1280.png) · [reference/after](../evidence/stitch-official/20261004/comparison/9b294786f6ba4aabb770caef00d59377.png)|Material glyphs/canvas tokens; 2000 tọa độ thật, pan/zoom/Fit/keyboard/inspector. Grid minh họa A-H không thay thế grid thật; Fit nhỏ và full-page height khác. Không fake sold/held inventory.|
|08 Đăng nhập để chọn ghế `5f054a02e26949728d70914f88f5b2da` / 1280px|[after](../evidence/stitch-official/20261004/after/login-1280.png) · [reference/after](../evidence/stitch-official/20261004/comparison/5f054a02e26949728d70914f88f5b2da.png)|Form mobile 358×305; label 12/16, input 324×44, radius 4, CTA 44. Desktop card 460/radius12, lỗi401 thật. Tên sự kiện dài làm context cao hơn reference.|
|09 JSON không hợp lệ — T14 `0250def27ff14f23bc9e472b16637e72` / 1280px|[after](../evidence/stitch-official/20261004/after/import-error-1280.png) · [reference/after](../evidence/stitch-official/20261004/comparison/0250def27ff14f23bc9e472b16637e72.png)|File picker/preview/confirm thật, distribution400/1000/600 và full errors. Không fake metadata file/giá; vị trí extra preview/help và chiều cao panel còn khác source.|
|10 Giá chưa hợp lệ — T35 `c8e82fa54a344a2fad66d66d6c9985bf` / 1280px|[after](../evidence/stitch-official/20261004/after/prices-error-1280.png) · [reference/after](../evidence/stitch-official/20261004/comparison/c8e82fa54a344a2fad66d66d6c9985bf.png)|VND suffix, input44/radius6, label/status/zero miễn phí, negative card border; integer nonnegative thật. Category/row theo API; restore/preview giữ nguyên chức năng. Desktop lỗi vẫn còn khác layout badge/sidebar source.|
|11 Chọn ghế trước khi giữ — T20/T24 `f165167c08454f238a9902c085879e0e` / 1280px|[after](../evidence/stitch-official/20261004/after/draft-1280.png) · [reference/after](../evidence/stitch-official/20261004/comparison/f165167c08454f238a9902c085879e0e.png)|Hai ghế thật được chọn bằng keyboard; chưa khẳng định đã giữ. Mobile header theo nguồn, summary trong flow để không che bản đồ. Card/legend/map geometry khác do grid2000 và chức năng thật.|
|12 Ghế vừa được người khác giữ — T30 `4362f9256dd941f590b097ad207e340e` / 1280px|[after](../evidence/stitch-official/20261004/after/conflict-1280.png) · [reference/after](../evidence/stitch-official/20261004/comparison/4362f9256dd941f590b097ad207e340e.png)|HTTP409 do buyer độc lập; quyền/deadline cũ còn nguyên. Header mobile và alert thật; số ghế/summary theo rejection thực tế, không fake0 quyền nếu còn own hold. Bố cục alert/summary chưa đồng nhất hoàn toàn source.|
|13 Hết thời gian giữ — T24/T28 `907bd2951a6141d398c52cc953ca4f86` / 1280px|[after](../evidence/stitch-official/20261004/after/expired-1280.png) · [reference/after](../evidence/stitch-official/20261004/comparison/907bd2951a6141d398c52cc953ca4f86.png)|Expiry query thật dù worker off; fixture rút thời hạn chỉ run riêng, productTTL600000ms. Header/timer00:00/refresh/choose again; alert/card/summary còn khác geometry source.|
|M01 Khám phá sự kiện `8a1b1fb6473340aba5c54604c49d452f` / 390px|[after](../evidence/stitch-official/20261004/after/catalog-390.png) · [reference/after](../evidence/stitch-official/20261004/comparison/8a1b1fb6473340aba5c54604c49d452f.png)|Geist, Material Symbols, poster đủ độ phân giải, metadata mobile, nút 44px; số sự kiện/phân trang là API thật, search/filter/sort chưa có contract vẫn disabled.|
|M02 Chi tiết suất diễn `fd494f22ffa34f38a402bc2e3bf4cdb1` / 390px|[after](../evidence/stitch-official/20261004/after/detail-390.png) · [reference/after](../evidence/stitch-official/20261004/comparison/fd494f22ffa34f38a402bc2e3bf4cdb1.png)|Hero/crop/tier dùng asset và API thật; mobile có header quay lại. Nhiều suất đóng làm trang dài hơn; không xóa lịch sử, không thêm duration/check-in/tax giả.|
|M03 Chọn và giữ ghế `77ecdad3c24549b69584f589105bc3cf` / 390px|[after](../evidence/stitch-official/20261004/after/held-390.png) · [reference/after](../evidence/stitch-official/20261004/comparison/77ecdad3c24549b69584f589105bc3cf.png)|HTTP200/PG rights thật, reload/deadline/drift/reconnect. Mobile header/timer thật; summary trong flow. Source grid nhỏ/sticky summary khác bản đồ2000 và hành vi đã duyệt.|
|M04 Quản lý suất diễn `ace8a0b9fe7e454e910c70806cfcba9a` / 390px|[after](../evidence/stitch-official/20261004/after/manage-390.png) · [reference/after](../evidence/stitch-official/20261004/comparison/ace8a0b9fe7e454e910c70806cfcba9a.png)|Sidebar240/header56, mobile card240, fact/readiness thu gọn và Material icons. Không fake số vé bán/hold/sẵn sàng của suất chưa truy vấn; heading/context còn khác bố cục source.|
|M05 Nạp sơ đồ JSON `dba783fc4ece44e2948c0ba46034960d` / 390px|[after](../evidence/stitch-official/20261004/after/import-390.png) · [reference/after](../evidence/stitch-official/20261004/comparison/dba783fc4ece44e2948c0ba46034960d.png)|File picker/preview/confirm thật, distribution400/1000/600 và full errors. Không fake metadata file/giá; vị trí extra preview/help và chiều cao panel còn khác source.|
|M06 Đặt giá theo hạng `20fc786dd53d4ea4b9bbad8dd29ee5e5` / 390px|[after](../evidence/stitch-official/20261004/after/prices-390.png) · [reference/after](../evidence/stitch-official/20261004/comparison/20fc786dd53d4ea4b9bbad8dd29ee5e5.png)|VND suffix, input44/radius6, label/status/zero miễn phí, negative card border; integer nonnegative thật. Category/row theo API; restore/preview giữ nguyên chức năng. Desktop lỗi vẫn còn khác layout badge/sidebar source.|
|M07 Xem sơ đồ ghế `922cda99ddc24deb986d255ce1752e28` / 390px|[after](../evidence/stitch-official/20261004/after/map-390.png) · [reference/after](../evidence/stitch-official/20261004/comparison/922cda99ddc24deb986d255ce1752e28.png)|Material glyphs/canvas tokens; 2000 tọa độ thật, pan/zoom/Fit/keyboard/inspector. Grid minh họa A-H không thay thế grid thật; Fit nhỏ và full-page height khác. Không fake sold/held inventory.|
|M08 Đăng nhập để chọn ghế `fa4f08ad2ccc4ebaa18d0ee4d1019a89` / 390px|[after](../evidence/stitch-official/20261004/after/login-clean-390.png) · [reference/after](../evidence/stitch-official/20261004/comparison/fa4f08ad2ccc4ebaa18d0ee4d1019a89.png)|Form mobile 358×305; label 12/16, input 324×44, radius 4, CTA 44. Desktop card 460/radius12, lỗi401 thật. Tên sự kiện dài làm context cao hơn reference.|
|M09 JSON không hợp lệ — T14 `349f28c3ac9241efa2dedf6003cbfedd` / 390px|[after](../evidence/stitch-official/20261004/after/import-error-390.png) · [reference/after](../evidence/stitch-official/20261004/comparison/349f28c3ac9241efa2dedf6003cbfedd.png)|File picker/preview/confirm thật, distribution400/1000/600 và full errors. Không fake metadata file/giá; vị trí extra preview/help và chiều cao panel còn khác source.|
|M10 Giá chưa hợp lệ — T35 `70cbb7d303394a5c83e16cb46f19491a` / 390px|[after](../evidence/stitch-official/20261004/after/prices-error-390.png) · [reference/after](../evidence/stitch-official/20261004/comparison/70cbb7d303394a5c83e16cb46f19491a.png)|VND suffix, input44/radius6, label/status/zero miễn phí, negative card border; integer nonnegative thật. Category/row theo API; restore/preview giữ nguyên chức năng. Desktop lỗi vẫn còn khác layout badge/sidebar source.|
|M11 Chọn ghế trước khi giữ — T20/T24 `52811634066d4855beb17a3dfb21740f` / 390px|[after](../evidence/stitch-official/20261004/after/draft-390.png) · [reference/after](../evidence/stitch-official/20261004/comparison/52811634066d4855beb17a3dfb21740f.png)|Hai ghế thật được chọn bằng keyboard; chưa khẳng định đã giữ. Mobile header theo nguồn, summary trong flow để không che bản đồ. Card/legend/map geometry khác do grid2000 và chức năng thật.|
|M12 Ghế vừa được người khác giữ — T30 `b03b8e50691045b8a10a003180aeaa25` / 390px|[after](../evidence/stitch-official/20261004/after/conflict-390.png) · [reference/after](../evidence/stitch-official/20261004/comparison/b03b8e50691045b8a10a003180aeaa25.png)|HTTP409 do buyer độc lập; quyền/deadline cũ còn nguyên. Header mobile và alert thật; số ghế/summary theo rejection thực tế, không fake0 quyền nếu còn own hold. Bố cục alert/summary chưa đồng nhất hoàn toàn source.|
|M13 Hết thời gian giữ — T24/T28 `bd9a6672cc0c44ad8a1d646526d12dc0` / 390px|[after](../evidence/stitch-official/20261004/after/expired-390.png) · [reference/after](../evidence/stitch-official/20261004/comparison/bd9a6672cc0c44ad8a1d646526d12dc0.png)|Expiry query thật dù worker off; fixture rút thời hạn chỉ run riêng, productTTL600000ms. Header/timer00:00/refresh/choose again; alert/card/summary còn khác geometry source.|
|M14 Danh sách đang tải `6d416705815141dfaba897aab6a06016` / 390px|[after](../evidence/stitch-official/20261004/after/loading-390.png) · [reference/after](../evidence/stitch-official/20261004/comparison/6d416705815141dfaba897aab6a06016.png)|Fixture trì hoãn UI-only; 4 skeleton, Material font load, strip status11/16. Không phải độ trễ provider; search text demo bị bỏ.|
|M15 Không tìm thấy sự kiện `68eb789cfc394ba4b087518c22d2fbd2` / 390px|[after](../evidence/stitch-official/20261004/after/empty-390.png) · [reference/after](../evidence/stitch-official/20261004/comparison/68eb789cfc394ba4b087518c22d2fbd2.png)|Fixture response rỗng UI-only, không fallback fake data. Không có filter contract nên chỉ reload, không giả nút clear search; khoảng cách/control/footer khác source.|
|M16 Không tải được sự kiện `58028de332754185802595452f0a41b9` / 390px|[after](../evidence/stitch-official/20261004/after/error-390.png) · [reference/after](../evidence/stitch-official/20261004/comparison/58028de332754185802595452f0a41b9.png)|Fixture network abort UI-only, Vietnamese recovery/retry thật; mobile error strip và card312/icon56. Không fake timeout code, fallback event, hay đường support chưa có.|

## Kiểm chức năng, không thay visual acceptance

| Kiểm tra | Kết quả | Bằng chứng |
|---|---|---|
|`pnpm lint`|PASS exit0 · 8.85s|[log](../evidence/stitch-official/20261004/gate-lint.log)|
|`pnpm typecheck`|PASS exit0 · 8.37s|[log](../evidence/stitch-official/20261004/gate-typecheck.log)|
|`pnpm test`|PASS exit0 · 5.12s|[log](../evidence/stitch-official/20261004/gate-test.log)|
|`pnpm build`|PASS exit0 · 11.76s|[log](../evidence/stitch-official/20261004/gate-build.log)|
|Unit tests|20 PASS (web 14/api 6)|[test](../evidence/stitch-official/20261004/gate-test.log)|
|Integration `./scripts/run-sprint2-local.ps1 -Mode Test`|4 files/10 tests PASS; migration deploy 9 migrations/no pending; 7.17s, database riêng|[log](../evidence/stitch-official/20261004/integration.log)|
|Browser `./scripts/verify-stitch-browser.ps1 -Run stitch-official/20261004`|139 checks/33captures, JSerrors0;360/390/768/1280|[report](../evidence/stitch-official/20261004/browser-report.json)|
|Hold `./scripts/verify-hold-browser.ps1 -Run stitch-official/20261004`|24checks/8captures, JSerrors0|[report](../evidence/stitch-official/20261004/hold-browser-state.json)|
|Expiry cùng runner `-Phase Expired`|3checks/3captures, JSerrors0|[report](../evidence/stitch-official/20261004/expired-browser-state.json)|
|Prettier explicit3.6.2, TypeScript AST adapter|PASS tất cả file của lượt|[format](../evidence/stitch-official/20261004/format.log) · [AST](../evidence/stitch-official/20261004/ast-validation.json)|
|Browser render2000seats|30 samples p95347.80ms; navigation→painted canvas gồm font load, local production build|[raw samples](../evidence/stitch-official/20261004/browser-report.json)|

Browser kiểm login/returnTo/401/role403, không ghi DB khi JSON preview/invalid, import2000, VND blank/negative/invalid/zero/save/restore, mở/đóng bán và khóa cấu trúc, keyboard/focus/Fit/inspector, loaded fonts, lost-POST reconciliation, conflict giữ quyền cũ và expiry không cần worker. Loading/empty/network/SOLD-HELD exclusion là **UI-only fixture**, không phải lỗi provider hay integration hold.

Console có lỗi 401/403 và network abort do kịch bản cố ý; report ghi cả URL/status/console message. Không có JS pageerror. Không nói console hoàn toàn sạch. Lint còn14 warnings baseline trong editor/Sprint1/brand-mark/workspace-header; Vitest cảnh báo ESM/configLoader/vite-tsconfig-paths baseline; không tắt hay suppress để xanh.

Render p95 ở đây không phải latency endpoint giữ ghế. Không chạy lại T-31 HTTP 200 requests × 10 ở lượt visual này; NFR endpoint p95<300ms, CI thật, staging/K-01 staging và worker gate giữ riêng trong tài liệu hiện hành.

## Review và các phần còn mở

- Đã sửa MUST FIX trong lượt: font icon đúng variable weight400/outlined thay Lucide; kích thước login primitive; poster blur; mobile padding/card/error status; nav/back/header; console evidence; runner xử lý semicolon/selector và fixture run-scoped. Không thay API/auth/migration, không thêm dependency.
- MUST FIX về **visual acceptance còn mở**, không đánh Done: organizer header/context/readiness/import panel spacing vẫn chưa đồng nhất hết; desktop invalid-price status/sidebar; alert/summary held/conflict/expired; cần tiếp tục đo cùng fixture/viewport từng biến thể, không suy ra hoàn tất từ139 checks.
- Khác biệt nghiệp vụ có chủ đích: bỏ demo/ID/Sprint labels; không fake duration/tax/count/filename; giữ restore/retry/keyboard; source schematic seats không thay2000 tọa độ thật; giữ summary mobile trong flow theo sửa trước để map không bị che. Các thay đổi này không được gọi là lỗi dataset rồi giấu mọi lệch layout khác.
- OPTIONAL: search/filter/order/payment/production legal/staging nằm ngoài lượt này; không tạo concept hay mở rộng nhiệm vụ.

## File của lượt và rollback

- `scripts/verify-stitch-correction.ps1`
- `scripts/verify-stitch-browser.ps1`
- `scripts/verify-hold-browser.ps1`
- `scripts/hold-expired-browser-flow.js`
- `scripts/hold-browser-flow.js`
- `scripts/correction-browser-flow.js`
- `docs/STITCH_FIDELITY_LEDGER.md`
- `apps/api/scripts/hold-browser-fixture.mjs`
- `apps/web/src/features/showtime-management/showtime-workspace.tsx`
- `apps/web/src/features/showtime-management/sale-status-control.tsx`
- `apps/web/src/features/seat-selection/seat-selection.tsx`
- `apps/web/src/features/seat-pricing/seat-pricing-form.tsx`
- `apps/web/src/features/seat-map-import/seat-map-import-form.tsx`
- `apps/web/src/components/seat-map/seat-map.tsx`
- `apps/web/src/components/login-form.tsx`
- `apps/web/src/features/event-catalog/public-showtime.tsx`
- `apps/web/src/features/event-catalog/event-poster.tsx`
- `apps/web/src/features/event-catalog/event-catalog.tsx`
- `apps/web/src/components/layout/product-layout.tsx`
- `apps/web/src/app/product.css`
- Mới: `apps/web/src/components/ui/material-icon.tsx`, `apps/web/public/fonts/*`, `.stitch/designs/*`, `.stitch/metadata.json` (mirror workspace), `.stitch/resources/*`, `scripts/validate-stitch-components.mjs`, báo cáo này và `evidence/stitch-official/20261004/*`. Ledger được append lịch sử mới, không xóa evidence cũ.

Rollback chỉ các file/thay đổi của lượt này bằng so sánh snapshot `.git/stitch-official-wip-20261004/files` và `manifest.json`, bảo toàn mọi WIP tiếp theo. Không checkout/reset HEAD, không xóa database/migration. Dừng đúng web process rồi build/start lại; font và screenshots mới có thể giữ làm lịch sử. Helper cạnh tranh cleanup chỉ run của mình.

## Gói review cho Nguyễn Văn Sáng

Mở [gallery 29 màn hình](../evidence/stitch-official/20261004/index.html). App `http://localhost:3000`, API health `http://localhost:3001/health`. Account giả và cách chạy theo [LOCAL_USER_GUIDE](LOCAL_USER_GUIDE.md); mật khẩu lấy từ cấu hình local riêng, không chép vào báo cáo/Git. Bản này chờ review trực tiếp về visual; không dùng gallery thay chức năng UI.

Branch đề xuất: `task/stitch-official-fidelity`; commit dự thảo: `refactor(web): align approved Stitch tokens and screen families`; PR title dự thảo: `Đồng bộ frontend với 29 reference Stitch đã duyệt`. PR body: phạm vi token/icon/geometry theo ledger; API/domain/Next giữ nguyên; local gates/browser/hold/expiry PASS; visual differences/open items trong báo cáo; không gồm rollout/production/K-01 staging/T-31 acceptance. Checklist reviewer: đúng 29 ID, full-page không mask, dữ liệu thật, regression/font/keyboard, WIP preserved, không secret, visual open items phải được xử lý trước khi chấp thuận fidelity. Chưa tạo branch/commit/PR.

