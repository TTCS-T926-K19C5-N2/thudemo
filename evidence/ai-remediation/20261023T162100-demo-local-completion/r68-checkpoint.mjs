import { readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('.', import.meta.url).pathname.replace(/^\//, '').replaceAll('/', '\\');
const read = (n) => JSON.parse(readFileSync(`${dir}${n}`, 'utf8'));
const write = (n, v) => writeFileSync(`${dir}${n}`, `${JSON.stringify(v, null, 2)}\n`);
const id = 'DEMO-EVENT-DETAIL-RUNTIME-01';
const evidence = ['r67-event-detail-browser.json', 'r67-event-detail-desktop.png', 'r67-event-detail-mobile.png', 'r67-event-detail-browser-retry.log', 'r67-event-detail-browser-retry.log.exitcode', 'r67-event-detail-browser-attempt3.log', 'r67-event-detail-browser-attempt3.log.exitcode'];
const results = read('results.json');
if (!results.some((x) => x.id === id)) results.push({
  id, requirement_id: ['S-07', 'S-08'], kind: 'SUPPLEMENTAL_DEMO', group: 'Hành trình và rủi ro bổ sung', tier: 'IMPLEMENTED_OR_PROPOSED', priority: 'P1',
  source: { origin: 'Current runtime retest; supplemental to source inventory' }, original_requirement: null,
  expected: ['Existing Bệnh sĩ event detail loads in current build on desktop and mobile with venue, schedule, price, seat-route link, no horizontal overflow or page errors.'],
  baseline_status: 'NOT_RUN', status: 'PASS',
  actual: 'R67 final successful Chromium attempt: desktop 1280×720 and mobile 390×844 both opened /shows/6ce1aa53-fc92-42de-ae37-46a7b09ad408. Title/venue/schedule/price and four seat-route links were visible; no horizontal overflow or page errors. Read-only; no provider calls. Earlier attempts were harness-only failures (Windows screenshot URL path and hidden mobile search selector); fixed and retained the retry log; no product defect inferred from those attempts.',
  evidence_files: evidence, source_ac_unchanged: true,
});
write('results.json', results);
const progress = read('progress.json');
if (!progress.some((x) => x.id === 'R67')) progress.push({ id: 'R67', title: 'Post-restart event detail read-only UI smoke', dependencies: ['R66'], status: 'VERIFIED', actual: 'Final harness run passed event detail on desktop/mobile with the original event content, venue, schedule, price and links; no JS errors/overflow. Two prior failures were test harness locator/path issues; they were not product failures.', evidence });
write('progress.json', progress);
const manifest = read('run-manifest.json');
manifest.lastCheckpoint = 'R67';
manifest.verification = { ...manifest.verification, r67EventDetailDesktopMobile: 'PASS; read-only; final corrected browser harness run' };
manifest.supplementalResults = { rows: 14, PASS: 14 };
write('run-manifest.json', manifest);
let report = readFileSync(`${dir}report.md`, 'utf8');
report = report.replace('# Báo cáo kiểm tra local demo — R66', '# Báo cáo kiểm tra local demo — R67');
report = report.replace('## Checkpoint mới nhất · R66', '## Checkpoint mới nhất · R67');
report = report.replace('Supplemental rows: 13.', 'Supplemental rows: 14. R67 adds post-restart event detail desktop/mobile smoke.');
report = report.replace('Combined results: 513; PASS 175, FAIL 0, NOT_RUN 326, BLOCKED 6, NEEDS_DECISION 5, MISSING 1.', 'Combined results: 514; PASS 176, FAIL 0, NOT_RUN 326, BLOCKED 6, NEEDS_DECISION 5, MISSING 1.');
report = report.replace('| Hành trình và rủi ro bổ sung | 46 | 33 | 0 | 13 | 0 | 0 | 0 | 0 |', '| Hành trình và rủi ro bổ sung | 47 | 34 | 0 | 13 | 0 | 0 | 0 | 0 |');
report = report.replace('- R66: sau khi build/restart,', '- R67: trang chi tiết Bệnh sĩ mở được trên desktop 1280×720 và mobile 390×844; thấy đúng tên/địa điểm/lịch/giá và 4 liên kết suất/chọn ghế, không JS error/tràn ngang. Hai lần chạy harness trước không qua do Windows output path và selector mobile ẩn; sau khi sửa harness lần cuối PASS, không quy chúng thành lỗi sản phẩm.\n- R66: sau khi build/restart,');
report = report.replace('tiến độ R43–R66 ở `progress.json`', 'tiến độ R43–R67 ở `progress.json`');
writeFileSync(`${dir}report.md`, report);
console.log(JSON.stringify({ checkpoint: 'R67', results: results.length, progress: progress.length }));
