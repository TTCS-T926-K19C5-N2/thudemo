import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const out = import.meta.dirname;
const base = resolve(root, 'evidence/ai-remediation/20261023T132000-demo-handoff');
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const write = (name, value) => writeFileSync(resolve(out, name), `${JSON.stringify(value, null, 2)}\n`);
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

const branch = git('branch', '--show-current');
const head = git('rev-parse', 'HEAD');
const baselineResults = read(resolve(base, 'results.json'));
const additions = [
  {
    id: 'DEMO-SEARCH-UNIT-01', requirement_id: 'S-08', kind: 'DEMO_SUPPLEMENTAL',
    group: 'Danh mục demo · kiểm tra component', tier: 'Ready', priority: 'Must',
    status: 'PASS', original_requirement: 'Tìm kiếm danh mục phải truy vấn trên toàn bộ các trang đã phân trang.',
    expected: ['Với từ khóa gửi từ trang chủ, component tải hết cursor pages rồi chỉ hiện suất phù hợp.'],
    actual: 'Đã chạy test component jsdom với hai cursor pages: kết quả chỉ gồm suất khớp truy vấn; tải đúng 2 trang. Đây là bằng chứng component, chưa phải browser E2E.',
    source: { kind: 'supplemental local-demo check', source_case: 'S-08-AC01/S-08-AC04' },
    evidence_files: ['catalog-filter-tests.log'], source_ac_unchanged: true,
  },
  {
    id: 'DEMO-LOCATION-UNIT-01', requirement_id: 'S-08', kind: 'DEMO_SUPPLEMENTAL',
    group: 'Danh mục demo · kiểm tra component', tier: 'Ready', priority: 'Must',
    status: 'PASS', original_requirement: 'Lọc địa điểm phải xét toàn bộ danh mục phân trang.',
    expected: ['Chọn địa điểm tải các cursor page còn lại và chỉ hiện suất tại địa điểm được chọn.'],
    actual: 'Test component jsdom chọn TP. Hồ Chí Minh trên hai trang; kết quả Hà Nội bị loại và chỉ giữ suất TP. Hồ Chí Minh.',
    source: { kind: 'supplemental local-demo check', source_case: 'UI gap from R43 handoff' },
    evidence_files: ['catalog-filter-tests.log'], source_ac_unchanged: true,
  },
  {
    id: 'DEMO-LOCATION-EDGE-01', requirement_id: 'S-08', kind: 'DEMO_SUPPLEMENTAL',
    group: 'Danh mục demo · kiểm tra component', tier: 'Ready', priority: 'Must',
    status: 'PASS', original_requirement: 'Bộ lọc địa điểm phải hoạt động khi người dùng chọn trước khi trang đầu hoàn tất tải.',
    expected: ['Sau khi trang đầu tải xong, bộ lọc tải các cursor còn lại và áp dụng đúng địa điểm đã chọn.'],
    actual: 'Test component trì hoãn trang đầu, chọn TP. Hồ Chí Minh trước khi phản hồi đầu tiên hoàn tất, rồi xác nhận trang tiếp theo được tải và chỉ suất phù hợp còn hiển thị.',
    source: { kind: 'supplemental local-demo check', source_case: 'R45 race follow-up' },
    evidence_files: ['catalog-filter-tests.log'], source_ac_unchanged: true,
  },
  {
    id: 'DEMO-SORT-UNIT-01', requirement_id: 'S-08', kind: 'DEMO_SUPPLEMENTAL',
    group: 'Danh mục demo · kiểm tra component', tier: 'Ready', priority: 'Must',
    status: 'PASS', original_requirement: 'Sắp xếp theo giá phải xét toàn bộ danh mục phân trang.',
    expected: ['Khi chọn giá tăng dần, component tải hết cursor pages và sắp xếp đúng giá trên toàn bộ kết quả.'],
    actual: 'Test component jsdom xác nhận lựa chọn price-asc tải trang thứ hai và thứ tự giá đúng xuyên hai trang.',
    source: { kind: 'supplemental local-demo check', source_case: 'UI gap from R43 handoff' },
    evidence_files: ['catalog-filter-tests.log'], source_ac_unchanged: true,
  },
  {
    id: 'DEMO-SEARCH-BROWSER-01', requirement_id: 'S-08', kind: 'DEMO_SUPPLEMENTAL',
    group: 'Danh mục demo · browser', tier: 'Ready', priority: 'Must',
    status: 'BLOCKED', original_requirement: 'Xác minh tìm kiếm header trên browser desktop và mobile.',
    expected: ['Build mới được cài vào profile demo và thao tác tìm kiếm thật trên browser.'],
    actual: 'Đã kiểm tra UI trên browser bằng profile R43 đang chạy: header search disabled, location filter chưa có. Source mới build PASS riêng nhưng chưa được cài; free RAM từng là 1.79 GB (dưới guard 2 GB) và hiện 1.94 GB. Profile vẫn READY trên build cũ; browser observation không được tính là proof cho source mới.',
    source: { kind: 'supplemental local-demo check', source_case: 'R45' },
    evidence_files: ['web-build.log', 'run-manifest.json', 'active-demo-r43-catalog-ui.json'], source_ac_unchanged: true,
  },
  {
    id: 'DEMO-LOCATION-BROWSER-01', requirement_id: 'S-08', kind: 'DEMO_SUPPLEMENTAL',
    group: 'Danh mục demo · browser', tier: 'Ready', priority: 'Must',
    status: 'BLOCKED', original_requirement: 'Xác minh lọc địa điểm trên browser desktop và mobile.',
    expected: ['Build mới được cài vào profile demo và bộ lọc hoạt động ở hai viewport.'],
    actual: 'Đã kiểm tra browser R43 và xác nhận chưa có location filter; chưa chạy được trên build mới vì free RAM 1.94 GB dưới guard 2 GB. Không dùng browser cũ làm bằng chứng cho source mới.',
    source: { kind: 'supplemental local-demo check', source_case: 'R45' },
    evidence_files: ['run-manifest.json', 'active-demo-r43-catalog-ui.json'], source_ac_unchanged: true,
  },
];
write('results.json', [...baselineResults, ...additions]);

const progress = read(resolve(base, 'progress.json'));
progress.push({
  id: 'R45', title: 'Nối tìm kiếm danh mục và lọc địa điểm cho demo', dependencies: ['R43'],
  status: 'IN_PROGRESS',
  actual: 'Header query nay truyền vào trang chủ; truy vấn có từ khóa tải hết các cursor page. Bộ lọc địa điểm và sắp xếp giá tải nốt trang trước khi áp dụng; bộ lọc xử lý cả chọn trước khi trang đầu tải xong. Component tests 4/4, web typecheck/lint/build PASS. Browser proof và cập nhật profile demo BLOCKED bởi guard RAM 2 GB; profile được khôi phục READY trên build cũ, DB giữ nguyên.',
  evidence: ['run-manifest.json', 'catalog-filter-tests.log', 'web-typecheck.log', 'web-lint.log', 'web-build.log'],
});
write('progress.json', progress);

const priorBugs = readFileSync(resolve(base, 'bugs.md'), 'utf8');
writeFileSync(resolve(out, 'bugs.md'), `# Bug register — R45\n\n## BUG-R45-01 — Header search is disabled and catalog filtering is page-limited\n\n- **Severity:** P2 (public discovery controls shown in the header were disabled; catalog search only covered pages already loaded).\n- **Requirement/case:** Supplemental gap discovered against S-08-AC01/S-08-AC04; source AC text is unchanged.\n- **Fixture:** Two-page in-memory catalog component fixture; no DB writes or real customer data.\n- **Reproduction:** On the prior build, the header input was disabled; the catalog's local search only filtered fetched pages.\n- **Expected:** Header search submits a query, all catalog cursor pages are considered, and location selection filters the complete loaded catalog.\n- **Actual before fix:** Header search and location controls were disabled; a non-empty page result could leave an unrelated featured event visible.\n- **Fix status:** Implemented in current dirty source. Query submits through the home route, query searches fetch all cursor pages, location selection loads remaining pages, and filtered views hide the unrelated featured card.\n- **Retest:** Component test 4/4 (including location selection while page one is still loading and price sorting across cursor pages), typecheck, targeted lint and production web build passed. The source fix is not yet installed in the active demo profile; browser retest is BLOCKED by the launcher's 2 GB free-RAM guard (1.79 GB observed). Active profile was restored READY on its prior build.\n- **Evidence:** catalog-filter-tests.log, web-typecheck.log, web-lint.log, web-build.log.\n\n---\n\n${priorBugs}`);

const report = readFileSync(resolve(base, 'report.md'), 'utf8');
const update = `# R45 update — demo remains DEMO_PARTIAL\n\nRun 20261023T162100-demo-local-completion. This is a new checkpoint; the R43 baseline was not overwritten.\n\n- Implemented a working public header search, full-cursor search on query submit, and a location filter that loads remaining pages before filtering. Filtered views no longer show an unrelated featured event.\n- Verification on current source: catalog component 4/4 PASS, full web unit suite 167/167 across 29 files, web typecheck PASS, targeted lint exit 0, production web build PASS.\n- The updated source is not yet live in the demo browser. Direct browser inspection on the active R43 build found the header search disabled and no location filter; the catalog/poster rendered and the seat route settled to its login form (active-demo-r43-catalog-ui.json). That is old-runtime evidence only. The launcher refused rebuild at 1.79 GB free RAM against the 2 GB guard; later readings were 2.05 GB and 1.94 GB, so there is not enough stable margin to retry. Demo DB and Mailpit volumes were retained.\n- Read-only DB oracle after restart: 40 events, 44 showtimes, 5 orders, 5 tickets. These counts include R44 test schedules/orders and a later local demo checkout; no rows were reset or overwritten in this checkpoint.\n- New supplemental results: 4 component PASS and 2 browser BLOCKED. Original source matrix remains unchanged at 494 rows: 142 PASS, 336 NOT_RUN, 10 BLOCKED, 5 NEEDS_DECISION, 1 MISSING.\n- Footer terms/refund/map/support links remain unimplemented because approved legal/support content is not available; no policy text was invented.\n\n## Required next actions\n\n1. Free at least 2 GB physical memory, update/rebuild the owned demo profile without resetting its volume, then verify search and location filtering on desktop and mobile.\n2. Continue remaining Ready/Must local checks and role journeys.\n3. Keep external-provider, camera/4G, production backup, and unresolved legal decisions separate from demo readiness.\n\n---\n\n`;
writeFileSync(resolve(out, 'report.md'), update + report);

const files = [
  'apps/web/src/app/page.tsx',
  'apps/web/src/components/layout/product-layout.tsx',
  'apps/web/src/features/event-catalog/event-catalog.tsx',
  'apps/web/src/features/event-catalog/event-catalog.spec.tsx',
  'apps/web/src/app/theater-theme.css',
];
const { stdout: status } = { stdout: git('status', '--short') };
const manifest = {
  runId: '20261023T162100-demo-local-completion',
  updatedAt: new Date().toISOString(),
  parentRun: '20261023T132000-demo-handoff',
  checkpoint: 'R45',
  target: 'DEMO_READY',
  currentDisposition: 'DEMO_PARTIAL',
  branch,
  head,
  dirtyTreePreserved: true,
  noCommitPushMergeDeploy: true,
  changedFiles: files,
  gitStatusShort: status.split(/\r?\n/).filter(Boolean),
  verification: {
    componentTests: 'PASS 4/4',
    webPackageUnitTests: 'PASS 167/167 across 29 files',
    webTypecheck: 'PASS',
    targetedLint: 'PASS exit 0',
    webProductionBuild: 'PASS',
    activeDemoBrowser: 'BLOCKED for new source; profile READY on prior verified build',
  },
  runtimeGuard: { minimumFreeRamGB: 2, observedFreeRamGB: 1.79, action: 'rebuild refused; no guard bypass' },
  demoProfile: {
    status: 'READY after safe restart',
    dbReset: false,
    resetOrCatalogSeedOnThisCheckpoint: false,
    startupChecksOnRestart: ['demo-showtime', 'demo-scanner-showtime'],
    events: 40,
    showtimes: 44,
    orders: 5,
    tickets: 5,
    ports: { web: 3000, api: 3001, mailpit: 24931 },
    secretsOrPiiIncluded: false,
  },
  sourceMatrix: { rows: 494, PASS: 142, FAIL: 0, NOT_RUN: 336, BLOCKED: 10, NEEDS_DECISION: 5, MISSING: 1 },
  supplementalResults: { PASS: 4, BLOCKED: 2 },
  sourceStatusSummary: 'Tracked and untracked user/source changes were preserved; this checkpoint delta contains the catalog UI fix and its test harness addition.',
};
write('run-manifest.json', manifest);

copyFileSync(resolve(base, 'report.md'), resolve(out, 'report-baseline-r43.md'));
console.log(`R45 checkpoint written: ${out}`);

