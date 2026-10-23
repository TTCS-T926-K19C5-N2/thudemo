import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
const dir = new URL('.', import.meta.url).pathname.replace(/^\//, '').replaceAll('/', '\\');
const read = (n) => JSON.parse(readFileSync(`${dir}${n}`, 'utf8'));
const write = (n, v) => writeFileSync(`${dir}${n}`, `${JSON.stringify(v, null, 2)}\n`);
const evidence = ['r65-closed-showtime-hold-ui.json', 'r65-closed-showtime-hold-ui.png', 'r60-pre-fix-reproduction-reconstructed.json'];

write('r60-pre-fix-reproduction-reconstructed.json', {
  run: 'R60-pre-fix-summary-reconstruction',
  source: 'Reconstructed from the R60 checkpoint summary after the original fixed-path JSON/PNG outputs were overwritten by the R65 rerun.',
  originalScreenshotAvailable: false,
  observed: {
    ui: 'Buyer selected A-3 while ON_SALE; showtime changed to CLOSED before hold submission.',
    holdPostStatus: 409,
    holdPostCode: 'SHOWTIME_CLOSED',
    followupSeatsGetStatus: 404,
    expectedClosedMessageVisible: false,
    genericReconciliationMessageVisible: true,
    createdHoldOrderTicket: false,
    exactShowtimeStatusRestored: true,
    databaseCountsBeforeAndAfter: { orders: 5, tickets: 5, holds: 0, sessions: 4 },
    pageErrors: [],
  },
  limitation: 'This is a transparent textual reconstruction of recorded R60 observations, not the original raw browser output or screenshot. R65 is the authoritative post-fix browser evidence.',
});

const results = read('results.json');
const row = results.find((x) => x.id === 'S-10-AC04');
if (!row) throw new Error('Missing source case S-10-AC04');
row.status = 'PASS';
row.actual = 'R60 pre-fix reproduction was summarized in the R60 checkpoint. R65 retest on the rebuilt current prepared source: Buyer selected A-3 on an ON_SALE showtime; the isolated fixture changed only that showtime to CLOSED; UI hold returned 409 and kept the specific “Suất diễn đã đóng bán. Chọn suất khác.” message even though the follow-up seats GET returned 404. No JS errors; exact showtime restored to ON_SALE; orders/tickets/holds/sessions stayed 5/5/0/4. Fix verified on browser against the rebuilt bundle. Historical pre-fix screenshot was overwritten when the fixed-path harness ran; a transparent reconstruction of the earlier JSON summary is retained, but it is not the original screenshot.';
row.evidence_files = evidence;
write('results.json', results);

const progress = read('progress.json');
if (!progress.some((x) => x.id === 'R65')) progress.push({
  id: 'R65', title: 'Rebuild isolated demo and verify closed-showtime hold error fix', dependencies: ['R64'], status: 'VERIFIED',
  actual: 'Official Restart passed at 2.21GiB free RAM, migrated/guarded-seeded idempotently, built current prepared source and returned READY. Status verified at web/API/Mailpit local URLs. Browser retest selected A-3, exact isolated showtime was closed between selection and hold: POST 409, specific error preserved despite follow-up seats GET 404, zero page errors; fixture restored and DB counts remained 5 orders/5 tickets/0 holds/4 sessions. S-10-AC04 is now PASS. Catalog/order/ticket retention is checked in the next oracle step.',
  evidence: [...evidence, 'r65-restart-status.log', 'r65-profile-oracle.json'],
});
write('progress.json', progress);

const manifest = read('run-manifest.json');
manifest.lastCheckpoint = 'R65';
manifest.demoProfile = { ...manifest.demoProfile, status: 'READY', currentBuild: 'R65 current prepared source; R60 closed-showtime UI fix verified', dbReset: false };
manifest.verification = { ...manifest.verification, r60BrowserRetest: 'PASS on R65 current rebuilt prepared source', demoStatus: 'READY', catalogOracle: '40 events/44 showtimes/5 orders/5 tickets; read-only oracle at r65-profile-oracle.json' };
manifest.latestRuntimeCheck = { at: new Date().toISOString(), status: 'READY', web: 'http://localhost:3000', api: 'http://localhost:3001', mailpit: 'http://127.0.0.1:24931', sourceBuild: 'R65 current prepared source; R60 fix installed', newSourceInstalled: true, dbReset: false, dbWrite: true, fixtureCleanupRestoredBaseline: true, dbOracle: 'r65-profile-oracle.json' };
manifest.demoProfile = { ...manifest.demoProfile, events: 40, showtimes: 44, orders: 5, tickets: 5 };
manifest.sourceMatrix = { ...manifest.sourceMatrix, PASS: 162, FAIL: 0 };
manifest.supplementalResults = { rows: 12, PASS: 12 };
write('run-manifest.json', manifest);

let bugs = readFileSync(`${dir}bugs.md`, 'utf8');
bugs = bugs.replace('- **Retest status:** BLOCKED. The official demo Restart stopped the running profile but refused to build because only 0.79GiB RAM was free and its guard requires at least 2GiB. Browser retest against the fixed bundle remains required.', '- **Retest status:** RESOLVED locally at R65. Official isolated Restart rebuilt the current prepared source and returned READY. Browser retest preserved the specific closed-showtime message after the expected seats 404; POST was 409; exact showtime status and data counts were restored.');
bugs = bugs.replace('- **Disposition:** Open pending local rebuild and browser verification.', '- **Disposition:** Resolved on the local demo build. Staging and external-provider conditions are outside this local bug.');
writeFileSync(`${dir}bugs.md`, bugs);

let report = readFileSync(`${dir}report.md`, 'utf8');
report = report.replace('# Báo cáo kiểm tra local demo — R64', '# Báo cáo kiểm tra local demo — R65');
report = report.replace('## Checkpoint mới nhất · R64', '## Checkpoint mới nhất · R65');
report = report.replace('R60 source fix chưa build. Lần Restart đầu bị guard chặn ở 0.79GiB; lần đo mới nhất là 1.13GiB, vẫn dưới ngưỡng >=2GiB. API :3001/mail catcher :24931 runtime cần được kiểm lại sau restart;', 'R65 official Restart/build hiện trả READY trên source prepared hiện tại; browser retest S-10-AC04 PASS. API :3001/mail catcher :24931 đang hoạt động local;');
report = report.replace('Supplemental rows: 12. R61 coupon unit (1 file/5 tests), R62 payment/ticket unit (4 files/60 tests), R63 offline/check-in unit (7 files/51 tests), and R64 auth/registration/activation unit (6 files/48 tests) passed; these narrow checks do not change source-derived acceptance status. Combined results: 512; PASS 173, FAIL 1, NOT_RUN 326, BLOCKED 6, NEEDS_DECISION 5, MISSING 1.', 'Supplemental rows: 12. R61 coupon unit (1 file/5 tests), R62 payment/ticket unit (4 files/60 tests), R63 offline/check-in unit (7 files/51 tests), and R64 auth/registration/activation unit (6 files/48 tests) passed; these narrow checks do not change source-derived acceptance status. R65 closed-showtime browser case resolves one source assertion. Combined results: 512; PASS 174, FAIL 0, NOT_RUN 326, BLOCKED 6, NEEDS_DECISION 5, MISSING 1.');
report = report.replace('| Ready | 163 | 59 | 1 | 100 | 2 | 1 | 0 | 0 |', '| Ready | 163 | 60 | 0 | 100 | 2 | 1 | 0 | 0 |');
report = report.replace('| Must | 188 | 65 | 1 | 118 | 3 | 1 | 0 | 0 |', '| Must | 188 | 66 | 0 | 118 | 3 | 1 | 0 | 0 |');
report = report.replace('| Giữ ghế | 49 | 7 | 1 | 39 | 2 | 0 | 0 | 0 |', '| Giữ ghế | 49 | 8 | 0 | 39 | 2 | 0 | 0 | 0 |');
report = report.replace('- R60: trên build cũ, đóng suất ngay sau khi chọn ghế cho API 409 SHOWTIME_CLOSED; UI bị refresh 404 ghi đè thông báo cụ thể bằng lỗi chung. Đã vá hẹp UI, typecheck+lint focused PASS, nhưng official Restart dừng dịch vụ và từ chối build do free RAM 0.79GiB (<2GiB guard). Bản vá chưa được browser retest; S-10-AC04 ghi FAIL theo actual trước fix cho đến khi kiểm lại.', '- R60: build cũ tái hiện lỗi cụ thể. R65: sau Restart tại 2,21GiB free RAM, bundle mới giữ đúng thông báo dù follow-up GET /seats trả 404; POST 409, không tạo hold, không lỗi trang, exact status/data counts khôi phục. S-10-AC04 PASS. Oracle catalog sau restart ghi 40 event/44 suất/5 đơn/5 vé.');
report = report.replace('- R60: trên build cũ,', '- R65: browser retest S-10-AC04 PASS trên build mới; runtime READY và DB/catalog retention được xác nhận. Lịch sử tái hiện trước fix còn trong bug log; ảnh pre-fix bị harness cũ ghi đè do dùng cùng output filename, việc này được ghi minh bạch trong result/evidence.\n- R60: trên build cũ,');
report = report.replace('Source Ready/Must still has 91 non-PASS assertions;', 'Source Ready/Must still has 90 non-PASS assertions;');
report = report.replace('tiến độ R43–R64 ở `progress.json`', 'tiến độ R43–R65 ở `progress.json`');
writeFileSync(`${dir}report.md`, report);

console.log(JSON.stringify({ checkpoint: 'R65', status: row.status, results: results.length, sourcePass: manifest.sourceMatrix.PASS }));
