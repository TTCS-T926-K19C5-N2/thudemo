import { readFileSync, writeFileSync } from 'node:fs';

const dir = import.meta.dirname;
const read = (name) => JSON.parse(readFileSync(`${dir}/${name}`, 'utf8'));
const writeJson = (name, value) => writeFileSync(`${dir}/${name}`, `${JSON.stringify(value, null, 2)}\n`);
const results = read('results.json');
const at = (id) => results.find((row) => row.id === id);

const seatMap = at('S-09-AC01');
seatMap.actual = 'R52 authenticated Chromium on active R46 demo showed the full 120-seat map, 117/120 free and distinct available/selected/held/sold legend colors and symbols. R53 rechecked the live map against PostgreSQL state. No business rows changed in R52.';
seatMap.evidence_files = [...new Set([...seatMap.evidence_files, 'r52-buyer-seat-map-ui.json', 'r52-buyer-seat-map-desktop.png', 'r53-cross-buyer-hold-refresh.json', 'r53-buyer-b-sees-held-after-reload.png'])];
const heldRefresh = at('S-09-AC02');
heldRefresh.status = 'PASS';
heldRefresh.actual = 'R53: Buyer A in one browser context selected/held A-3 through UI; distinct Buyer B in a separate context reloaded the seat map and the inspector showed “Đang được giữ”. PostgreSQL confirmed owner A. Buyer A released through UI. Exact cleanup removed the run-created empty HoldSession after proving no seats/orders remained; DB counts returned to baseline, no page errors/provider calls.';
heldRefresh.evidence_files = ['r53-cross-buyer-hold-refresh.json', 'r53-fixture.json', 'r53-buyer-a-hold-confirmed.png', 'r53-buyer-b-sees-held-after-reload.png', 'r53-buyer-a-after-release.png', 'r53-cleanup-verification.json'];
const expiredSession = at('S-02-AC04');
expiredSession.status = 'PASS';
expiredSession.actual = 'R54: Buyer signed in through the browser UI, then the exact session created by the run was expired in the isolated demo DB. Credentialed GET /api/auth/me returned 401; reloading the protected seat route redirected the browser to /login with returnTo preserved. Exact session cleanup succeeded; Redis and order/ticket counts were unchanged; no page errors.';
expiredSession.evidence_files = ['r54-expired-session-redirect-ui.json', 'r54-expired-session-login-redirect.png'];
const closedSeatMap = at('S-09-AC03');
closedSeatMap.status = 'PASS';
closedSeatMap.actual = 'R56 read-only demo DB oracle found the target showtime is DRAFT, has no seat map and has 0 seats. Browser UI on desktop 1280×900 showed “Suất diễn chưa mở bán hoặc đã đóng.”, had no seat grid/canvas and did not redirect to login; the public showtime detail API returned HTTP 404. No DB/provider writes.';
closedSeatMap.evidence_files = ['r55-showtime-map-inventory.json', 'r56-empty-seatmap-ui.json', 'r56-empty-seatmap-ui.png'];
const mobileSeatTap = at('S-09-AC05');
mobileSeatTap.status = 'PASS';
mobileSeatTap.actual = 'R57 Chromium touch viewport 390×844 authenticated synthetic Buyer, enlarged the map from 62% to 82%, tapped the coordinate for available A-3, and the UI inspector identified exactly A-3 as selected. Hold API returned 200; PostgreSQL confirmed the run-created hold belonged to the fixture Buyer; UI release returned 200. Exact empty run HoldSession cleanup restored DB counts to 5 orders, 5 tickets, 4 sessions, 0 holds. No page errors/provider calls.';
mobileSeatTap.evidence_files = ['r57-mobile-seat-tap.json', 'r57-mobile-seat-selected.png'];
const staleSeatConflict = at('S-10-AC02');
staleSeatConflict.status = 'PASS';
staleSeatConflict.actual = 'R58 two distinct Buyers first loaded A-3 as available. Buyer A held it through UI/API (200); Buyer B retained the stale UI snapshot with only the SSE stream deliberately blocked to exercise the conflict race, selected A-3 and submitted through UI. Server returned 409 SEAT_CONFLICT; UI showed “Ghế A-3 vừa được người khác giữ”, discarded the rejected selection, fetched the seat map/hold state again and inspector showed HELD. Buyer A released via UI (200); PostgreSQL returned to baseline 5 orders, 5 tickets, 0 holds, 4 sessions. No page errors/provider calls.';
staleSeatConflict.evidence_files = ['r58-stale-seat-conflict.json', 'r58-buyer-a-held-seat.png', 'r58-buyer-b-conflict.png'];
const sharedHoldExpiry = at('S-10-AC03');
sharedHoldExpiry.status = 'PASS';
sharedHoldExpiry.actual = 'R59 synthetic Buyer selected A-3/A-4/A-5 through the UI at 1.1-second intervals. One UI hold action returned 200; independent PostgreSQL showed all three run-owned holds had the exact same expiresAt timestamp, and browser showed a single 10:00 timer plus the message “10 phút tính từ ghế đầu tiên được máy chủ xác nhận. Thêm ghế không gia hạn.” UI released all three; exact cleanup restored 5 orders, 5 tickets, 4 sessions, 0 holds. No page errors/provider calls.';
sharedHoldExpiry.evidence_files = ['r59-shared-hold-expiry.json', 'r59-three-seats-selected.png', 'r59-three-seat-hold-confirmed.png'];
const closedShowtimeHold = at('S-10-AC04');
closedShowtimeHold.status = 'FAIL';
closedShowtimeHold.actual = 'R60 on the pre-fix R46 demo: browser selected A-3 while the showtime was ON_SALE; the isolated DB fixture changed only its status to CLOSED before the UI hold action. API correctly returned 409 SHOWTIME_CLOSED and no hold was created, but the UI finally-reconciliation request to /seats returned 404 and replaced the specific “Suất diễn đã đóng bán. Chọn suất khác.” response with a generic reconciliation error. The exact status was restored to ON_SALE; orders/tickets/holds/sessions returned to baseline. A narrow UI fix is present in current source but cannot yet be rebuilt/retested because the official restart preflight requires >=2GiB free RAM and reports 0.79GiB.';
closedShowtimeHold.evidence_files = ['r60-closed-showtime-hold-ui.json', 'r60-closed-showtime-hold-ui.png'];

const search = at('DEMO-SEARCH-BROWSER-01');
search.status = 'PASS';
search.actual = 'Build R46 đã được cài trên profile demo READY. Chromium thao tác thật ở desktop 1280×720 và mobile 390×844: header search hiện/enabled; truy vấn “Số 186” tìm được 1 kết quả ngoài trang đầu sau khi tải đủ 43/43 suất; không có lỗi trang. Không ghi DB hoặc gọi provider.';
search.evidence_files = ['r46-catalog-browser.json', 'r46-search-desktop.png', 'r46-search-mobile.png', 'r46-catalog-browser.exitcode'];

const location = at('DEMO-LOCATION-BROWSER-01');
location.status = 'PASS';
location.actual = 'Build R46 trên profile demo READY. Chromium desktop 1280×720 và mobile 390×844 chọn Bắc Ninh; mỗi viewport hiển thị đúng 2 kết quả sau khi tải đủ 43/43 suất, không lỗi trang hoặc tràn ngang. Không ghi DB hoặc gọi provider.';
location.evidence_files = ['r46-catalog-browser.json', 'r46-location-desktop.png', 'r46-location-mobile.png', 'r46-catalog-browser.exitcode'];

const mobileEvidence = [
  'r48-s04-mobile-browser.json', 'r48-s04-mobile-browser.log', 'r48-s04-mobile-browser.exitcode',
  'r48-s04-mobile-db-oracle.json', 'r48-s04-mobile-cleanup.json',
  'r48-s04-ac03-mobile.png', 'r48-s04-ac04-mobile.png', 'r48-s04-ac05-mobile-denied.png',
];
const mobileActuals = {
  'S-04-AC03': 'Desktop evidence already showed clear past-time validation and zero showtime writes. R48 mobile browser repeated the negative case at 390×844; inline reason was visible and no POST /showtimes was sent. Organizer-created DRAFT remained without showtimes until a valid time was supplied. PostgreSQL oracle confirms the only persisted showtimes were the two deliberate valid duplicate fixtures; exact cleanup restored baseline counts.',
  'S-04-AC03.02': 'R48 mobile Chromium at 390×844 entered a past local datetime and submitted. The UI showed “Vui lòng chọn thời gian bắt đầu trong tương lai.”; no POST /showtimes request occurred; the event still had zero showtimes. Mobile overflow=false and no page errors.',
  'S-04-AC04': 'Desktop proof already confirmed the exact-time warning and persistence. R48 mobile browser submitted the same future local time twice; both API calls returned 201 and the second showed the required same-time warning. Independent PostgreSQL confirmed two DRAFT showtimes at the identical UTC timestamp, with zero seats/orders/tickets. Exact fixture cleanup restored the pre-test DB counts.',
  'S-04-AC04.02': 'R48 mobile Chromium at 390×844 saved two showtimes at 2030-01-01 19:00 Vietnam time. Both POSTs returned 201; the second displayed the required warning and retained the saved result. Independent PostgreSQL confirmed identical UTC times and zero operational descendants.',
  'S-04-AC05': 'Desktop cross-owner denial was previously verified. R48 mobile browser signed in as Organizer A and opened Organizer B’s run-bound DRAFT; the UI displayed access denied and the intercepted management request returned HTTP 403. PostgreSQL confirmed the owning organizer and DRAFT were unchanged; exact cleanup removed only the test event.',
  'S-04-AC05.02': 'R48 mobile Chromium signed in as Organizer A and opened Organizer B’s run-bound draft. UI showed the explicit no-permission alert and the exact /manage request returned 403. Browser had no runtime errors or horizontal overflow.',
};
for (const id of Object.keys(mobileActuals)) {
  const row = at(id);
  if (!row) throw new Error(`Missing source case ${id}`);
  row.status = 'PASS';
  row.actual = mobileActuals[id];
  row.evidence_files = id.endsWith('.02') ? mobileEvidence : [...row.evidence_files, ...mobileEvidence];
}

const supplemental = (id, requirement, group, original, expected, actual, sourceCase, evidence) => ({
  id, requirement_id: requirement, kind: 'DEMO_SUPPLEMENTAL', group, tier: 'Ready', priority: 'Must',
  status: 'PASS', original_requirement: original, expected: [expected], actual,
  source: { kind: 'supplemental local-demo check', source_case: sourceCase },
  evidence_files: evidence, source_ac_unchanged: true,
});
if (!at('DEMO-MOBILE-SEARCH-UNIT-01')) results.push(supplemental(
  'DEMO-MOBILE-SEARCH-UNIT-01', 'S-08', 'Danh mục demo · kiểm tra component',
  'Tìm kiếm trong giao diện mobile tải và tìm trên tất cả các cursor page.',
  'Khi người dùng tìm trên mobile, component tải phần còn lại của danh mục và tìm thấy kết quả ngoài trang đầu.',
  'Focused EventCatalog component suite PASS 5/5, gồm test tải từng cursor page khi mobile catalog search được dùng; full web suite sau thay đổi PASS 168/168 trên 29 file. Test hồi quy đã đỏ 4/5 trước fix và xanh 5/5 sau fix.',
  'R46 mobile search fix', ['r46-mobile-search-test-before-fix.log', 'r46-mobile-search-test.log', 'r47-web-test.log', 'r47-web-test.exitcode']));
if (!at('DEMO-SORT-BROWSER-01')) results.push(supplemental(
  'DEMO-SORT-BROWSER-01', 'S-08', 'Danh mục demo · browser',
  'Sắp xếp theo giá trên toàn bộ danh mục khi chạy trên browser.',
  'Desktop browser tải mọi cursor page và sắp xếp giá tăng dần trên toàn bộ kết quả.',
  'Chromium desktop 1280×720 tải đủ 43/43 suất; minPrice tăng đơn điệu từ 190.000₫ đến 450.000₫. Không lỗi trang, không ghi DB/provider.',
  'R46 catalog browser', ['r46-catalog-browser.json', 'r46-catalog-browser.exitcode']));

const statusCounts = (rows) => rows.reduce((acc, row) => (acc[row.status] = (acc[row.status] ?? 0) + 1, acc), {});
const sourceRows = results.filter((row) => row.kind !== 'DEMO_SUPPLEMENTAL');
const supplementalRows = results.filter((row) => row.kind === 'DEMO_SUPPLEMENTAL');
const expectedSource = { PASS: 161, FAIL: 1, NOT_RUN: 326, BLOCKED: 6, NEEDS_DECISION: 5, MISSING: 1 };
const sourceCounts = statusCounts(sourceRows);
if (sourceRows.length !== 500 || Object.entries(expectedSource).some(([status, count]) => (sourceCounts[status] ?? 0) !== count)) {
  throw new Error(`Source baseline changed unexpectedly: ${JSON.stringify(sourceCounts)}`);
}
writeJson('results.json', results);

const now = '2026-10-23T12:32:00.000Z';
const progress = read('progress.json');
for (const item of progress) {
  if (item.id === 'R45') {
    item.status = 'VERIFIED';
    item.actual = 'Đã cài source R46 vào profile cô lập mà không reset dữ liệu. Search/filter/sort được kiểm trên browser desktop và mobile trong R46; mobile search phân trang được sửa tiếp và có test hồi quy.';
    item.evidence = ['r46-catalog-browser.json', 'r46-search-desktop.png', 'r46-location-mobile.png', 'r47-web-test.log'];
  }
  if (item.id === 'R46') {
    item.status = 'VERIFIED';
    item.actual = 'Phát hiện mobile search chỉ xét 12 kết quả đã tải dù desktop header search xét toàn danh mục. Thêm tải hết cursor pages khi mobile search có query. Focused component 5/5, full web 29 files/168 tests PASS, typecheck PASS, lint exit 0 (2 warnings), browser desktop/mobile PASS, build profile vẫn READY và DB chỉ đọc không đổi (40 event, 44 suất, 5 order, 5 ticket).';
    item.evidence = ['r46-mobile-search-diagnostic.png', 'r46-mobile-search-test-before-fix.log', 'r46-mobile-search-test.log', 'r46-catalog-browser.json', 'r47-web-test.log', 'r47-web-typecheck.log', 'r47-web-lint.log', 'r47-demo-db-oracle.json'];
  }
  if (item.id === 'R47') {
    item.actual = 'Full monorepo regression on current source: API 61 files/481 tests PASS; web 29 files/168 tests PASS; deployment/laptop 20/20 PASS; zero failed or skipped tests. Web typecheck PASS; ESLint exit 0 with two unused-variable warnings in existing browser harnesses. Source R46 built and installed via official demo Restart. Chromium desktop/mobile search/location/price sort PASS. Read-only PostgreSQL: 40 events, 44 showtimes, 5 orders, 5 tickets. No DB write/provider call/reset/fixture seed in R47. Original 494-row matrix unchanged; combined results 502 rows.';
    item.evidence = ['r47-full-regression.log', 'r47-full-regression.exitcode', 'r47-web-test.log', 'r47-web-typecheck.log', 'r47-web-lint.log', 'r46-catalog-browser.json', 'r47-demo-db-oracle.json'];
  }
}
if (!progress.some((item) => item.id === 'R47')) progress.push({
  id: 'R47', title: 'Đóng regression web và đồng bộ bằng chứng search/filter/sort', dependencies: ['R46'], status: 'VERIFIED',
  actual: 'Full web regression trên source hiện tại: 29 test files/168 tests PASS; web typecheck PASS; ESLint exit 0 với 2 warning cũ (unused variable trong hai browser harness). Profile demo source R46 READY; Chromium desktop/mobile search, location, price sort PASS. DB oracle chỉ đọc xác nhận 40 events, 44 showtimes, 5 orders, 5 tickets; không ghi DB/provider, reset/seed fixture. Original 494-row source matrix giữ nguyên; results.json có thêm hai supplemental cases và hiện 502 hàng.',
  evidence: ['r47-web-test.log', 'r47-web-test.exitcode', 'r47-web-typecheck.log', 'r47-web-typecheck.exitcode', 'r47-web-lint.log', 'r47-web-lint.exitcode', 'r46-catalog-browser.json', 'r47-demo-db-oracle.json']
});
if (!progress.some((item) => item.id === 'R48')) progress.push({
  id: 'R48', title: 'Xác minh ba ca Organizer mobile trên browser và PostgreSQL', dependencies: ['R47'], status: 'VERIFIED',
  actual: 'Ở viewport mobile 390×844, Organizer B tạo fixture DRAFT qua UI; thời gian quá khứ bị chặn, hiện rõ lý do và không gửi POST; hai suất cùng giờ được lưu với cảnh báo; Organizer A truy cập bị HTTP 403. PostgreSQL oracle xác nhận owner/status/timestamps và không có seat/order/ticket phát sinh. Guarded cleanup xóa đúng draft + 2 showtimes, khôi phục DB counts về baseline 40 events/44 showtimes/5 orders/5 tickets/5904 seats. Không sửa source sản phẩm, không gọi provider. Sáu source assertions (3 parent + 3 mobile child) chuyển PASS theo bằng chứng desktop đã có và mobile mới.',
  evidence: mobileEvidence,
});
if (!progress.some((item) => item.id === 'R49')) progress.push({
  id: 'R49', title: 'Rà quyền truy cập Organizer/Buyer và kiểm chứng đăng nhập local', dependencies: ['R48'], status: 'VERIFIED',
  actual: 'Chromium desktop đăng nhập Organizer: mục Sự kiện hiện, mục Đối soát kế toán vắng mặt, logout 200. Synthetic Buyer gọi direct POST /events: HTTP 403, không tạo event, logout 200. Hai mệnh đề S-02-AC01 đã tách và PASS; S-02-AC02.01 PASS. Phần ghi log runtime chưa quan sát được do API worker detached không ghi stdio vào api.log; S-02-AC02 và .02 giữ BLOCKED, dù source có Logger.warn. Không sửa code sản phẩm; không còn fixture nghiệp vụ.',
  evidence: ['r49-s02-ac01-browser.json', 'r49-s02-ac01-organizer-nav-desktop.png', 'r49-s02-ac02-api-log.json'],
});
if (!progress.some((item) => item.id === 'R50')) progress.push({
  id: 'R50', title: 'Kiểm thử khóa đăng nhập 5 lần sai và lần thứ sáu trên UI mobile', dependencies: ['R49'], status: 'VERIFIED',
  actual: 'Dedicated synthetic lock-test role: 5 incorrect CLI login attempts each returned 401; Redis account lock was set; sixth attempt via mobile browser returned HTTP 429, retryAfterSeconds=899 and visible “15 phút” message. Exact Redis lock/failure/IP keys and TTLs were snapshotted and restored; no DB write or provider call. S-02-AC03 parent and .01/.02 PASS with separate assertions.',
  evidence: ['r50-s02-ac03-lockout.json', 'r50-s02-ac03-lockout-mobile.png'],
});
if (!progress.some((item) => item.id === 'R51')) progress.push({
  id: 'R51', title: 'Rà soát lần thử Buyer đầu tiên', dependencies: ['R50'], status: 'SUPERSEDED',
  actual: 'Lần thử bằng selector nhãn không thu được phản hồi auth. Read-only oracle xác nhận Buyer active/verified, mật khẩu khớp config và không bị khóa. R52 điền exact input IDs, nhận HTTP 200 và mở sơ đồ; R51 là bằng chứng harness không đủ, không phải bug sản phẩm.',
  evidence: ['r51-seat-map-ui-desktop.png', 'r51-seat-map-ui.json', 'r51-auth-diagnostic.mjs', 'r52-buyer-seat-map-ui.json'],
});
if (!progress.some((item) => item.id === 'R52')) progress.push({
  id: 'R52', title: 'Đăng nhập Buyer và mở sơ đồ ghế bằng UI', dependencies: ['R51'], status: 'VERIFIED',
  actual: 'Read-only oracle confirmed synthetic Buyer is verified, active, correct role/password and unlocked. Chromium filled the actual UI fields by ID; /api/auth/login, /api/auth/me and /api/privacy/me returned 200; UI reached active seat map showing all 120 seats. Logout returned 200; orders/tickets/holds unchanged; no JS errors.',
  evidence: ['r51-auth-diagnostic.mjs', 'r52-buyer-seat-map-ui.json', 'r52-buyer-seat-map-desktop.png'],
});
if (!progress.some((item) => item.id === 'R53')) progress.push({
  id: 'R53', title: 'Hai Buyer kiểm tra hold và reload sơ đồ ghế', dependencies: ['R52'], status: 'VERIFIED',
  actual: 'Hai Buyer ở hai browser context: cả hai ban đầu thấy A-3 trống; Buyer A giữ ghế qua UI, Buyer B reload và thấy “Đang được giữ”. Buyer A nhả qua UI. Guarded cleanup gỡ đúng HoldSession rỗng run-created sau khi xác minh không có seat/order; DB counts về baseline 5 orders, 5 tickets, 0 active holds, 4 sessions.',
  evidence: ['r53-cross-buyer-hold-refresh.json', 'r53-fixture.json', 'r53-buyer-a-hold-confirmed.png', 'r53-buyer-b-sees-held-after-reload.png', 'r53-buyer-a-after-release.png', 'r53-cleanup-verification.json'],
});
if (!progress.some((item) => item.id === 'R54')) progress.push({
  id: 'R54', title: 'Session hết hạn trả 401 và chuyển browser về login', dependencies: ['R52'], status: 'VERIFIED',
  actual: 'Buyer signed in through UI; the exact new session was expired in the isolated demo DB. Credentialed /api/auth/me returned 401; reloading the protected seat route redirected to /login with the original returnTo preserved. Exact session was removed; Redis locks/failure counters and orders/tickets remained unchanged.',
  evidence: ['r54-expired-session-redirect-ui.json', 'r54-expired-session-login-redirect.png'],
});
if (!progress.some((item) => item.id === 'R56')) progress.push({
  id: 'R56', title: 'Xác minh UI suất chưa mở bán không hiện lưới ghế rỗng', dependencies: ['R55'], status: 'VERIFIED',
  actual: 'R55 read-only DB oracle found a draft showtime without a seat map and with 0 seats. Chromium desktop on isolated profile displayed the exact closed-showtime message, no seat grid/canvas, and did not redirect to login; public detail API returned 404. No DB/provider writes. S-09-AC03 PASS.',
  evidence: ['r55-showtime-map-inventory.json', 'r56-empty-seatmap-ui.json', 'r56-empty-seatmap-ui.png'],
});
if (!progress.some((item) => item.id === 'R57')) progress.push({
  id: 'R57', title: 'Kiểm tra phóng to và chạm đúng ghế trên mobile', dependencies: ['R56'], status: 'VERIFIED',
  actual: 'Chromium touch viewport 390×844 authenticated synthetic Buyer, zoomed from 62% to 82%, tapped available seat A-3 and the inspector selected exactly A-3. Hold POST returned 200; PostgreSQL confirmed fixture ownership; release DELETE returned 200. Exact run-created empty HoldSession cleanup restored 5 orders/5 tickets/4 sessions/0 holds; no page errors/provider calls. S-09-AC05 PASS.',
  evidence: ['r57-mobile-seat-tap.json', 'r57-mobile-seat-selected.png', 'r57-cleanup-verification.json'],
});
if (!progress.some((item) => item.id === 'R58')) progress.push({
  id: 'R58', title: 'Kiểm tra xử lý ghế vừa được Buyer khác giữ', dependencies: ['R57'], status: 'VERIFIED',
  actual: 'Two Buyers loaded A-3 available; A held it through UI/API. For a controlled stale-snapshot race, B SSE was deliberately blocked while the browser UI remained active; B selected and submitted A-3 in UI. API returned 409; UI showed “Ghế A-3 vừa được người khác giữ”, removed rejected selection and refreshed the map; inspector showed HELD. A released via UI. Exact cleanup restored 5 orders/5 tickets/0 holds/4 sessions. S-10-AC02 PASS.',
  evidence: ['r58-stale-seat-conflict.json', 'r58-buyer-a-held-seat.png', 'r58-buyer-b-conflict.png'],
});
if (!progress.some((item) => item.id === 'R59')) progress.push({
  id: 'R59', title: 'Kiểm tra ba ghế dùng chung hạn giữ đầu tiên', dependencies: ['R58'], status: 'VERIFIED',
  actual: 'Synthetic Buyer selected A-3/A-4/A-5 in UI at 1.1-second intervals. Single hold action returned 200; PostgreSQL showed one identical expiresAt for all three and UI displayed one 10:00 timer with the no-extension message. UI released each seat; DB returned to 5 orders/5 tickets/4 sessions/0 holds, no page errors/provider calls. S-10-AC03 PASS.',
  evidence: ['r59-shared-hold-expiry.json', 'r59-three-seats-selected.png', 'r59-three-seat-hold-confirmed.png'],
});
if (!progress.some((item) => item.id === 'R60')) progress.push({
  id: 'R60', title: 'Phát hiện và vá cảnh báo giữ ghế khi suất vừa đóng', dependencies: ['R59'], status: 'BLOCKED',
  actual: 'Pre-fix UI/API/DB test reproduced: close the exact active ON_SALE showtime after Buyer selected A-3, then submit via UI. API correctly returned 409 SHOWTIME_CLOSED, but finally refresh returned seats 404 and overwrote the specific message with a generic reconciliation error. No hold/order/ticket; exact status restored, DB counts baseline. Narrow UI fix added to canonical and prepared source; focused web typecheck and ESLint passed. Official demo Restart stopped the profile and refused rebuild because free RAM was 0.79GiB (guard requires 2GiB); source fix remains unbuilt and browser retest BLOCKED. Do not count fix as verified.',
  evidence: ['r60-closed-showtime-hold-ui.json', 'r60-closed-showtime-hold-ui.png', 'r60-web-typecheck.log', 'r60-web-lint.log'],
});
writeJson('progress.json', progress);

const manifest = read('run-manifest.json');
manifest.checkpoint = 'R60';
manifest.updatedAt = now;
manifest.currentDisposition = 'DEMO_PARTIAL';
manifest.verification = {
  ...manifest.verification,
  componentTests: 'PASS 5/5 focused EventCatalog suite',
  webPackageUnitTests: 'PASS 168/168 across 29 files (R47 full regression)',
  webTypecheck: 'PASS R47',
  targetedLint: 'PASS exit 0; 2 warnings in existing browser harnesses',
  webProductionBuild: 'PASS in official isolated demo Restart R46',
  fullMonorepoRegression: 'PASS API 61 files/481 tests; web 29 files/168 tests; deployment/laptop 20 tests; zero failed/skipped',
  activeDemoBrowser: 'PASS R46 Chromium desktop 1280×720 and mobile 390×844: cross-page search, location filter, price sort; no page errors or mobile horizontal overflow',
  organizerMobileChecks: 'PASS R48 390×844: past showtime blocked with no write; exact-time duplicate saved with warning; cross-owner event access returned HTTP 403; PostgreSQL oracle and guarded cleanup verified',
  roleNavigationAndBuyerAuthorization: 'R49 Organizer navigation PASS in desktop browser; Buyer direct POST /events returned 403 with no data write; runtime log assertion BLOCKED because detached API worker stdio is not persisted',
  accountLockout: 'PASS R50: five failed logins, sixth UI login locked with retry time; Redis snapshot restored and no DB/provider writes',
  buyerSeatMapAttempt: 'R51 initial label-based browser form attempt lacked proof and is superseded as harness-incomplete. R52 exact input IDs authenticated successfully; not a product defect.',
  buyerSeatMap: 'R52 PASS on active R46 demo: authenticated browser shows all 120 seats and distinct statuses; business counts unchanged.',
  crossBuyerSeatRefresh: 'R53 PASS: two distinct Buyers and browser contexts; A-3 held by A, B reload sees HELD; UI release and exact orphan-session cleanup restored baseline.',
  expiredSessionRedirect: 'R54 PASS: exact session expiry, credentialed /auth/me 401, UI returns to login with returnTo; exact fixture cleanup and Redis/business-data invariants verified.',
  closedSeatMap: 'R56 PASS: DRAFT showtime with no map and 0 seats showed the closed-showtime message in desktop browser, no seat canvas, API 404; read-only DB oracle; no writes.',
  mobileSeatZoomAndTap: 'R57 PASS: touch browser 390×844 zoomed 62%→82%, tapped A-3 and UI selected the exact seat; hold API 200, PostgreSQL owner matched synthetic Buyer, UI release 200, exact cleanup restored baseline counts.',
  staleSeatConflict: 'R58 PASS: two Buyers loaded A-3 available; controlled stale snapshot via blocked Buyer B SSE; B UI submit returned 409 SEAT_CONFLICT, conflict alert and refreshed map showed HELD; owner release and exact DB cleanup restored baseline.',
  sharedHoldExpiry: 'R59 PASS: selected A-3/A-4/A-5 through UI 1.1 seconds apart, one hold POST 200, all three PostgreSQL expiresAt values identical; browser one 10:00 timer/no-extension message; UI released and exact cleanup restored baseline.',
  closedShowtimeHold: 'R60 pre-fix FAIL: API returned 409 SHOWTIME_CLOSED, UI generic reconciliation error overwrote the specific closed message after seats 404. Exact DB status restored, no hold/order/ticket. Narrow fix is in source and passes focused typecheck/lint but not built/retested; official Restart preflight blocked at 0.79GiB free RAM (requires 2GiB), leaving local profile stopped.',
};
manifest.demoProfile = {
  ...manifest.demoProfile, status: 'BLOCKED_RESTART_PREFLIGHT', dbReset: false, databaseWritesR47: false, databaseWritesR48: true, databaseWritesR52: false, databaseWritesR53: true, databaseWritesR54: true, fixtureCleanupRestoredBaseline: true,
  events: 40, showtimes: 44, orders: 5, tickets: 5,
  currentBuild: 'R46 catalog source; R60 source fix is unbuilt pending safe restart preflight',
};
manifest.changedFiles = [...new Set([...(manifest.changedFiles ?? []), 'apps/web/src/features/seat-selection/seat-selection.tsx'])];
manifest.verification = { ...manifest.verification, r60FocusedTypecheck: 'PASS', r60FocusedEslint: 'PASS', r60BrowserRetest: 'BLOCKED: isolated profile services stopped by Restart preflight, free RAM 0.79GiB versus >=2GiB required.' };
manifest.sourceMatrix = { rows: sourceRows.length, originalInventoryRows: 494, splitAssertions: 6, ...sourceCounts };
manifest.supplementalResults = { rows: supplementalRows.length, ...statusCounts(supplementalRows) };
manifest.latestRuntimeCheck = {
  at: new Date().toISOString(), status: 'BLOCKED', web: 'http://localhost:3000', api: 'http://localhost:3001',
  mailpit: 'http://127.0.0.1:24931', sourceBuild: 'R46 last build; R60 source fix not installed', newSourceInstalled: false,
  dbReset: false, dbWrite: true, fixtureCleanupRestoredBaseline: true, dbOracle: 'r60-closed-showtime-hold-ui.json',
  blocker: 'Official Restart stopped services but failed its safe resource preflight: 0.79GiB free RAM; >=2GiB required.',
};
writeJson('run-manifest.json', manifest);

const countRows = (rows, key) => {
  const map = new Map();
  for (const row of rows) {
    const label = row[key] ?? '(chưa phân loại)';
    if (!map.has(label)) map.set(label, []);
    map.get(label).push(row);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'vi'));
};
const table = (rows, key) => {
  const columns = ['PASS', 'FAIL', 'NOT_RUN', 'BLOCKED', 'NEEDS_DECISION', 'MISSING', 'NOT_APPLICABLE'];
  const header = `| ${key} | Tổng | ${columns.join(' | ')} |`;
  const separator = `|---|---:|${columns.map(() => '---:').join('|')}|`;
  const body = countRows(rows, key).map(([label, group]) => {
    const counts = statusCounts(group);
    return `| ${label} | ${group.length} | ${columns.map((status) => counts[status] ?? 0).join(' | ')} |`;
  });
  return [header, separator, ...body].join('\n');
};
const allCounts = statusCounts(results);
const openMustReady = sourceRows.filter((row) => row.tier === 'Ready' && row.priority === 'Must' && !['PASS', 'NOT_APPLICABLE'].includes(row.status)).length;
const footer = `# Báo cáo kiểm tra local demo — R60\n\n`+
  `**Kết luận: DEMO_PARTIAL. Chưa đủ bằng chứng để ghi DEMO_READY.**\n\n`+
  `Cây nguồn \`D:\\Merge_2\\Codegym\`, nhánh \`feature/sprint-4-8-complete\`, HEAD \`ce777bd13e472c089eef4a3c1ed4455e501ae3ba\`; dirty tree được giữ nguyên. Không commit/push/merge/deploy. Profile cô lập \`s1demo-384da3d43b41\`: bản R46 cũ đã dừng bởi official Restart; R60 source fix chưa build vì safe preflight yêu cầu >=2GiB free RAM nhưng chỉ có 0.79GiB. API :3001/mail catcher :24931 runtime cần được kiểm lại sau restart; DB chính không được đụng tới.\n\n`+
  `## Checkpoint mới nhất · R60\n\n`+
  `- Full monorepo regression trước R60: API 61 files/481 tests, web 29 files/168 tests, deployment/laptop 20 tests PASS; không fail/skip. TypeScript typecheck PASS; ESLint exit 0, còn 2 warning unused-variable trong browser harness. Build source R46 thành công qua launcher Restart trước khi áp dụng R60. R60 focused typecheck/lint PASS.\n`+
  `- Browser thật local: desktop 1280×720 và mobile 390×844. Search “Số 186” tìm được kết quả ngoài trang đầu; lọc Bắc Ninh trả đúng 2 suất; desktop sort giá tăng dần tải đủ 43 suất (190.000₫→450.000₫); không lỗi trang/tràn ngang.\n`+
  `- PostgreSQL oracle chỉ đọc sau restart: 40 sự kiện, 44 suất, 5 đơn, 5 vé. Không reset/seed fixture/write/provider call trong R47. Catalog và order/ticket demo còn nguyên.\n`+
  `- R48 mobile Organizer: past datetime bị chặn, hiện lý do và không gọi endpoint ghi; duplicate exact-time được lưu và cảnh báo; cross-owner bị UI chặn bằng HTTP 403. Fixture duy nhất được tạo qua UI với run tag, không tạo order/seat/ticket; cleanup exact-scope khôi phục counts về baseline 40 event/44 showtime/5 order/5 ticket/5904 seat.\n`+
  `- R49 role check: Organizer thấy mục Sự kiện và không thấy Đối soát kế toán trên browser. Synthetic Buyer direct POST /events nhận 403 và không tạo event. Runtime log clause chưa chứng minh vì detached worker không persist stdout/stderr; source Logger.warn không được tính bằng chứng runtime, nên parent và child log assertion còn BLOCKED.\n`+
  `- R50 account lockout: năm mật khẩu sai trả 401; Redis account lock được đặt; lần thứ sáu trên UI mobile trả 429, retryAfterSeconds=899 và thông báo 15 phút. Các key Redis/TTL trước test được phục hồi; không DB/provider write.\n`+
  `- R51–R52: lần đầu selector nhãn không thu được phiên; oracle read-only xác nhận Buyer hợp lệ. R52 dùng đúng input IDs, API login/me/privacy trả 200 và UI mở sơ đồ đủ 120 ghế; không có business write. R51 là bằng chứng harness chưa đủ, không phải bug sản phẩm.\n`+
  `- R53: hai Buyer ở hai browser context; Buyer A giữ A-3, Buyer B tải lại và thấy ghế đang giữ. Buyer A nhả ghế qua UI; cleanup gỡ đúng HoldSession rỗng do run sau khi xác minh không ghế/đơn liên kết; counts về baseline. S-09-AC02 PASS.\n`+
  `- R54: session mới được hết hạn có kiểm soát; credentialed /api/auth/me trả 401 và UI chuyển về login, giữ returnTo. Session thử được xóa chính xác; Redis và dữ liệu đơn/vé không đổi. S-02-AC04 PASS.\n`+
  `- R56: DB oracle xác nhận suất DRAFT không seat map, 0 ghế; browser desktop hiện đúng “Suất diễn chưa mở bán hoặc đã đóng.”, không render canvas/lưới ghế và không chuyển login; public detail API 404. S-09-AC03 PASS; không ghi DB/provider.\n`+
  `- R57: browser touch 390×844 phóng sơ đồ từ 62% lên 82%, chạm đúng A-3; inspector xác nhận ghế đã chọn, POST giữ ghế 200 và PostgreSQL xác nhận đúng Buyer. UI nhả ghế 200; cleanup exact HoldSession rỗng run-created đưa baseline về 5 đơn/5 vé/4 session/0 hold. S-09-AC05 PASS.\n`+
  `- R58: hai Buyer cùng tải A-3 trống; A giữ qua UI/API 200. Để tái tạo trạng thái snapshot cũ, luồng SSE của B được chặn có chủ đích trong harness; B vẫn thao tác UI, submit nhận 409, thấy cảnh báo “Ghế A-3 vừa được người khác giữ” và sơ đồ tự refresh thành HELD. A nhả 200, DB về 5 đơn/5 vé/4 session/0 hold. S-10-AC02 PASS.\n`+
  `- R59: synthetic Buyer chọn A-3/A-4/A-5 cách nhau 1,1 giây; một UI POST 200 tạo ba hold có expiresAt giống hệt và một đồng hồ 10:00. UI hiện đúng thông báo thời hạn tính từ lần máy chủ đầu tiên xác nhận và ghế thêm không gia hạn. Nhả ba ghế qua UI; DB baseline được phục hồi. S-10-AC03 PASS.\n`+
  `- R60: trên build cũ, đóng suất ngay sau khi chọn ghế cho API 409 SHOWTIME_CLOSED; UI bị refresh 404 ghi đè thông báo cụ thể bằng lỗi chung. Đã vá hẹp UI, typecheck+lint focused PASS, nhưng official Restart dừng dịch vụ và từ chối build do free RAM 0.79GiB (<2GiB guard). Bản vá chưa được browser retest; S-10-AC04 ghi FAIL theo actual trước fix cho đến khi kiểm lại.\n`+
  `- BUG-R46-01 (P2, mobile search chỉ xét trang đầu) đã sửa; test đỏ trước/sáng sau và browser retest có evidence.\n`+
  `- Inventory base 494 rows plus 6 split assertions = ${sourceRows.length} source-derived rows: PASS ${sourceCounts.PASS ?? 0}, FAIL ${sourceCounts.FAIL ?? 0}, NOT_RUN ${sourceCounts.NOT_RUN ?? 0}, BLOCKED ${sourceCounts.BLOCKED ?? 0}, NEEDS_DECISION ${sourceCounts.NEEDS_DECISION ?? 0}, MISSING ${sourceCounts.MISSING ?? 0}. Supplemental rows: ${supplementalRows.length}. Combined results: ${results.length}; PASS ${allCounts.PASS ?? 0}, FAIL ${allCounts.FAIL ?? 0}, NOT_RUN ${allCounts.NOT_RUN ?? 0}, BLOCKED ${allCounts.BLOCKED ?? 0}, NEEDS_DECISION ${allCounts.NEEDS_DECISION ?? 0}, MISSING ${allCounts.MISSING ?? 0}. Source Ready/Must still has ${openMustReady} non-PASS assertions; this is not complete coverage.\n\n`+
  `## Kết quả theo tier (500 source-derived rows)\n\n${table(sourceRows, 'tier')}\n\n`+
  `## Kết quả theo mức ưu tiên (500 source-derived rows)\n\n${table(sourceRows, 'priority')}\n\n`+
  `## Kết quả theo nhóm yêu cầu (500 source-derived rows)\n\n${table(sourceRows, 'group')}\n\n`+
  `## Đang thiếu hoặc chưa được chứng minh\n\n`+
  `- Các ca NOT_RUN/BLOCKED vẫn cần được làm hoặc phân loại theo phụ thuộc môi trường. Những ca staging/provider thật, thiết bị camera/4G, hosted CI và backup off-host không được thay bằng mock/local restore.\n`+
  `- Demo local hiện chưa chạy do restart an toàn bị chặn bởi RAM dưới ngưỡng; sau khi giải phóng >=2GiB RAM cần Restart và chạy lại R60.\n`+
  `- Source Ready/Must còn ${openMustReady} ca chưa PASS; bao gồm coverage workflow/role đầy đủ, concurrency/negative cases và các NFR chưa đo hoặc chưa quyết định.\n`+
  `- Các NEEDS_DECISION giữ nguyên; không tự đặt policy refund, conflict offline, quota, retention hay nội dung pháp lý.\n`+
  `- Chi tiết lịch sử bug, fixture, expected/actual và evidence theo case ở \`bugs.md\`; inventory/source traceability ở \`results.json\`; tiến độ R43–R60 ở \`progress.json\`; trạng thái môi trường ở \`run-manifest.json\`.\n\n`+
  `## Giới hạn demo\n\n`+
  `Browser local và PostgreSQL đã được kiểm trên R46 trước R60. Hiện profile đang dừng và R60 fix chưa build; payment/refund/email vẫn mock/catcher. Không có bằng chứng staging, Internet email/Inbox, provider sandbox thật, 4G/camera thật, nightly/off-host backup hoặc GitHub fresh clone. Các giới hạn này không được tính PASS.\n`;
writeFileSync(`${dir}/report.md`, footer);

const bugsPath = `${dir}/bugs.md`;
let bugs = readFileSync(bugsPath, 'utf8');
if (!bugs.includes('## BUG-R60-01')) bugs += `\n\n## BUG-R60-01 — Closed-showtime error is overwritten by map refresh failure\n\n- **Severity:** P2; the hold operation is safely rejected, but the user sees a generic reconciliation error instead of the actionable closed-showtime reason.\n- **Requirement/case:** S-10-AC04.\n- **Fixture:** Isolated demo showtime 914556a8-ba19-4766-9e20-00a3d93df432, synthetic Buyer, available A-3. Exact status changed ON_SALE→CLOSED after UI selection and restored CLOSED→ON_SALE. No order/ticket/provider call; counts restored.\n- **Steps:** Load the active seat map in Buyer UI; select A-3; change only this isolated showtime status to CLOSED; submit “Giữ ghế”.\n- **Expected:** API rejects with 409 SHOWTIME_CLOSED and UI preserves “Suất diễn đã đóng bán. Chọn suất khác.”\n- **Actual before fix:** API correctly returned 409, then reconciliation GET /seats returned 404 and replaced the specific error with “Chưa xác nhận được trạng thái trên máy chủ. Tải lại trước khi giữ tiếp.” No hold was created.\n- **Fix status:** A narrow branch now clears the stale draft and preserves the known SHOWTIME_CLOSED message across the failed follow-up refresh in canonical and prepared source. Focused web typecheck and ESLint passed.\n- **Retest status:** BLOCKED. The official demo Restart stopped the running profile but refused to build because only 0.79GiB RAM was free and its guard requires at least 2GiB. Browser retest against the fixed bundle remains required.\n- **Evidence:** r60-closed-showtime-hold-ui.json, r60-closed-showtime-hold-ui.png, r60-web-typecheck.log, r60-web-lint.log.\n- **Disposition:** Open pending local rebuild and browser verification.\n`;
if (!bugs.includes('## BUG-R46-01')) bugs += `\n\n## BUG-R46-01 — Mobile search only searched the first catalog page\n\n- **Severity:** P2; mobile users could not find published events beyond the first 12 results.\n- **Requirement/case:** S-08-AC01/S-08-AC04; supplemental DEMO-MOBILE-SEARCH-UNIT-01 and DEMO-SEARCH-BROWSER-01.\n- **Fixture:** Existing 43-showtime isolated local demo catalog; query “Số 186” has a match after page one. No DB writes or provider calls.\n- **Reproduction before fix:** Open catalog at 390×844 and search “Số 186”; the mobile component returned zero from the currently loaded 12, while the header/global search path loaded all pages.\n- **Expected:** Search loads all cursor pages before evaluating the query and returns the matching event.\n- **Actual before fix:** No match because remaining pages were never fetched for mobile catalog search.\n- **Fix:** EventCatalog now triggers loadAllPages while a nonempty mobile catalog query is active and another cursor exists.\n- **Retest:** Regression assertion failed before fix (4/5), passed after fix (5/5); complete web suite passed 29 files/168 tests; typecheck and lint passed. Chromium desktop/mobile found “Số 186” outside the first page; no browser errors.\n- **Evidence:** r46-mobile-search-diagnostic.png, r46-mobile-search-test-before-fix.log, r46-mobile-search-test.log, r46-catalog-browser.json, r46-search-desktop.png, r46-search-mobile.png, r47-web-test.log.\n- **Disposition:** Resolved locally on the active R46 demo build; no staging/provider claim.\n`;
writeFileSync(bugsPath, bugs);

const handoffPath = `${dir}/../../..`;
console.log(JSON.stringify({ sourceRows: sourceRows.length, sourceCounts, supplementalRows: supplementalRows.length, supplementalCounts: statusCounts(supplementalRows), totalRows: results.length, totalCounts: allCounts, openReadyMust: openMustReady }));
