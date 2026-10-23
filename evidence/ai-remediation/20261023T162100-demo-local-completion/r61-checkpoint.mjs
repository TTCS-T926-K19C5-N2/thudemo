import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('.', import.meta.url).pathname.replace(/^\//, '').replaceAll('/', '\\');
const read = (name) => JSON.parse(readFileSync(`${dir}${name}`, 'utf8'));
const write = (name, value) => writeFileSync(`${dir}${name}`, `${JSON.stringify(value, null, 2)}\n`);
const id = 'R61';
const resultId = 'DEMO-COUPON-UNIT-01';
const evidence = ['r61-coupon-unit.log', 'r61-coupon-unit.log.exitcode'];

const results = read('results.json');
if (!results.some((x) => x.id === resultId)) {
  results.push({
    id: resultId,
    requirement_id: ['S-56'],
    kind: 'SUPPLEMENTAL_UNIT',
    group: 'Hành trình và rủi ro bổ sung',
    tier: 'IMPLEMENTED_OR_PROPOSED',
    priority: 'P1',
    source: { origin: 'Kiểm tra hồi quy bổ sung; không thay thế acceptance case trong inventory' },
    original_requirement: null,
    expected: ['Coupon service unit suite chạy hết không lỗi. Phạm vi unit không được coi là bằng chứng UI/API/DB/concurrency.'],
    baseline_status: 'NOT_RUN',
    status: 'PASS',
    actual: 'Ran only apps/api/src/coupons/coupons.service.spec.ts: 1 file, 5 tests passed, exit code 0. This is a unit-only regression check; it does not change any source-derived S-56 status or claim database/UI/concurrency acceptance.',
    evidence_files: evidence,
    source_ac_unchanged: true,
  });
  write('results.json', results);
}

const progress = read('progress.json');
if (!progress.some((x) => x.id === id)) {
  progress.push({
    id,
    title: 'Coupon service unit regression while demo runtime is stopped',
    dependencies: ['R60'],
    status: 'VERIFIED',
    actual: 'Ran the focused coupon service unit suite without database/profile access: 1 file, 5 tests PASS. This is a narrow logic regression check only; source-derived S-56 acceptance status is unchanged. Current free RAM observed at 1.13GiB, below the official 2GiB Restart guard; isolated runtime remains stopped and R60 browser retest remains blocked.',
    evidence,
  });
  write('progress.json', progress);
}

const manifest = read('run-manifest.json');
manifest.lastCheckpoint = id;
manifest.verification = { ...manifest.verification, r61CouponServiceUnit: 'PASS (1 file/5 tests; unit-only)' };
manifest.latestRuntimeCheck = { ...manifest.latestRuntimeCheck, at: new Date().toISOString(), status: 'BLOCKED', freeRamGiB: 1.13, blocker: 'Isolated runtime remains stopped. Latest observed free RAM 1.13GiB; safe Restart requires >=2GiB. No build/restart attempted in R61.' };
manifest.supplementalResults = { rows: 9, PASS: 9 };
write('run-manifest.json', manifest);

let report = readFileSync(`${dir}report.md`, 'utf8');
report = report.replace('# Báo cáo kiểm tra local demo — R60', '# Báo cáo kiểm tra local demo — R61');
report = report.replace('## Checkpoint mới nhất · R60', '## Checkpoint mới nhất · R61');
report = report.replace('Supplemental rows: 8. Combined results: 508; PASS 169, FAIL 1, NOT_RUN 326, BLOCKED 6, NEEDS_DECISION 5, MISSING 1.', 'Supplemental rows: 9. R61 adds one coupon unit-only regression result (1 file/5 tests); source-derived S-56 acceptance is unchanged. Combined results: 509; PASS 170, FAIL 1, NOT_RUN 326, BLOCKED 6, NEEDS_DECISION 5, MISSING 1.');
report = report.replace('| Hành trình và rủi ro bổ sung | 41 | 28 | 0 | 13 | 0 | 0 | 0 | 0 |', '| Hành trình và rủi ro bổ sung | 42 | 29 | 0 | 13 | 0 | 0 | 0 | 0 |');
report = report.replace('- R60: trên build cũ,', '- R61: coupon service unit regression chạy 1 file/5 tests PASS; đây chỉ là kiểm logic unit, không nâng status acceptance S-56 và không thay bằng chứng UI/API/DB/concurrency. RAM quan sát được 1,13GiB, vẫn dưới guard Restart 2GiB; profile giữ nguyên trạng thái dừng.\n- R60: trên build cũ,');
report = report.replace('tiến độ R43–R60 ở `progress.json`', 'tiến độ R43–R61 ở `progress.json`');
writeFileSync(`${dir}report.md`, report);

console.log(JSON.stringify({ checkpoint: id, results: results.length, supplemental: results.filter((x) => x.id === resultId).length, progress: progress.length }));
