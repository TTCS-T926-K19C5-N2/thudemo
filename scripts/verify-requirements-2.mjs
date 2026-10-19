#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.join(root, 'docs', 'REQUIREMENTS_2_VERIFICATION.md');
const includeE2e = process.argv.includes('--with-e2e');

// Requirement text is summarized from Requirements_2.docx. Existing tests are
// evidence for covered behavior, not proof of untested NFRs or user journeys.
const requirements = [
  { id: 'S-05', title: 'Nhập sơ đồ ghế', unit: ['apps/api/src/showtimes/showtimes.service.spec.ts', 'apps/api/src/showtimes/seat-map.spec.ts'], e2e: [], gap: 'Chưa có e2e cho thay sơ đồ khi ghế đã bán/đang giữ, rollback trên DB và thời gian nhập 2.000 ghế dưới 5 giây.' },
  { id: 'S-06', title: 'Chẩn đoán sơ đồ không hợp lệ', unit: ['apps/api/src/showtimes/seat-map.spec.ts'], e2e: [], gap: 'Chưa kiểm tra đầy đủ tập lỗi tổng hợp, vị trí ký tự JSON lỗi, preview trước import và giới hạn 5 MB.' },
  { id: 'S-07', title: 'Mở/đóng bán vé', unit: ['apps/api/src/showtimes/showtimes.service.spec.ts'], e2e: ['apps/api/test/events.e2e-spec.ts'], gap: 'Chưa xác minh toàn bộ luồng quyền organizer, audit log, đóng/mở lại và xử lý lượt giữ/đơn đang tồn tại bằng e2e.' },
  { id: 'S-08', title: 'Danh mục và chi tiết sự kiện công khai', unit: [], e2e: ['apps/api/test/events.e2e-spec.ts'], gap: 'Chưa tìm thấy unit test ánh xạ trực tiếp cho catalog công khai; chưa kiểm thử phân trang, trạng thái draft/closed, cache 30 giây hoặc p95 dưới 500 ms với 200 suất.' },
  { id: 'S-09', title: 'Sơ đồ ghế công khai', unit: ['apps/api/src/showtimes/showtimes.service.spec.ts', 'apps/api/src/modules/seats/queries/seat-status-query.service.spec.ts', 'apps/web/src/features/seat-selection/server-countdown.spec.ts'], e2e: ['apps/api/test/seat-hold-api.e2e-spec.ts'], gap: 'E2E seat-hold-api là HTTP fixture nghiên cứu, không khởi tạo AppModule; chưa xác minh trực quan/mobile và ngưỡng 2.000 ghế dưới 2 giây trên browser.' },
  { id: 'S-10', title: 'Giữ ghế 10 phút', unit: ['apps/api/src/holds/holds.service.spec.ts', 'apps/api/src/modules/seats/seat-hold.service.spec.ts', 'apps/web/src/features/seat-selection/server-countdown.spec.ts'], e2e: ['apps/api/test/seat-hold-api.e2e-spec.ts'], gap: 'E2E seat-hold-api là HTTP fixture nghiên cứu, không khởi tạo AppModule; chưa đo p95 API dưới 300 ms hoặc xác minh đồng hồ lệch giờ qua luồng chạy thật.' },
  { id: 'S-11', title: 'Bỏ giữ ghế', unit: ['apps/api/src/holds/holds.service.spec.ts', 'apps/api/src/modules/seats/seat-hold.service.spec.ts'], e2e: ['apps/api/test/seat-hold-api.e2e-spec.ts'], gap: 'E2E seat-hold-api là HTTP fixture nghiên cứu, không khởi tạo AppModule; chưa xác minh quyền sở hữu và thời hạn giữ còn lại trên PostgreSQL/Redis của sản phẩm.' },
  { id: 'S-12', title: 'Tự giải phóng ghế hết hạn', unit: ['apps/api/src/modules/seats/jobs/seat-expiry-job.service.spec.ts', 'apps/api/src/holds/hold-expiry.scheduler.spec.ts'], e2e: [], gap: 'Test hiện có chủ yếu mock scheduler; chưa xác minh query ghế thực tế trước cleanup và bootstrap trên DB.' },
  { id: 'S-13', title: 'Xử lý tranh chấp giữ ghế nguyên tử', unit: ['apps/api/src/holds/holds.service.spec.ts', 'apps/api/src/prisma/hold-transaction.spec.ts'], e2e: ['apps/api/test/s15-s16-acceptance.e2e-spec.ts'], gap: 'Chưa chạy kiểm tra đồng thời 200 yêu cầu/100 ghế và rollback lô 5 ghế với PostgreSQL cô lập.' },
  { id: 'S-14', title: 'Khôi phục lượt giữ sau tải lại', unit: ['apps/api/src/holds/holds.service.spec.ts', 'apps/web/src/features/seat-selection/server-countdown.spec.ts'], e2e: ['apps/api/test/seat-hold-api.e2e-spec.ts'], gap: 'E2E seat-hold-api là HTTP fixture nghiên cứu, không khởi tạo AppModule; chưa kiểm tra tải lại/trình duyệt mới trên phiên đăng nhập và storage thật.' },
  { id: 'S-15', title: 'Giá theo hạng ghế', unit: ['apps/api/src/showtimes/showtimes.service.spec.ts'], e2e: ['apps/api/test/s15-s16-acceptance.e2e-spec.ts'], gap: 'E2E trên DB cô lập đã kiểm tra giá hạng và snapshot đơn; chưa kiểm tra đầy đủ luồng UI inline và định dạng VND trên browser.' },
  { id: 'S-16', title: 'Tạo đơn từ ghế đang giữ', unit: ['apps/api/src/orders/orders.service.spec.ts'], e2e: ['apps/api/test/s15-s16-acceptance.e2e-spec.ts'], gap: 'E2E API/DB đã đạt cho đơn từ hold và double-click; chưa xác minh browser, TTL khác cấu hình fixture hoặc hành trình người dùng sau khi ghế mất.' },
  { id: 'S-17', title: 'Chi tiết đơn hàng', unit: ['apps/api/src/orders/orders.service.spec.ts', 'apps/web/src/features/order-review/order-review.spec.ts'], e2e: ['apps/api/test/orders.e2e-spec.ts'], gap: 'API e2e đã kiểm tra dữ liệu đơn và quyền sở hữu; chưa kiểm tra UI/countdown trên browser sau khi tải lại.' },
  { id: 'S-18', title: 'Thanh toán sandbox', unit: ['apps/api/src/payments/payments.service.spec.ts'], e2e: ['apps/api/test/payments.e2e-spec.ts'], gap: 'E2E callback/webhook và PAID/SOLD/hold đạt trên test gateway/DB ephemeral; chưa xác minh tài khoản hoặc callback sandbox MoMo thật.' },
  { id: 'S-19', title: 'Cổng thanh toán giả lập', unit: ['apps/api/src/payments/mock-gateway.service.spec.ts', 'apps/api/src/payments/gateways/mock.gateway.spec.ts', 'apps/web/src/features/mock-gateway/mock-gateway.spec.ts'], e2e: ['apps/api/test/mock-gateway.e2e-spec.ts'], gap: 'E2E giả lập đã đạt; chưa xác minh cổng khi khởi động deployment production và UI thao tác trực tiếp trên browser.' },
  { id: 'S-20', title: 'Webhook lặp và đồng thời', unit: ['apps/api/src/payments/payments.service.spec.ts'], e2e: ['apps/api/test/payments-idempotency.e2e-spec.ts'], gap: 'E2E API/DB cho webhook lặp và đồng thời đã đạt; chưa xác minh trạng thái ở browser trong môi trường staging.' },
  { id: 'S-21', title: 'Xác minh chữ ký webhook', unit: ['apps/api/src/payments/payments.service.spec.ts'], e2e: ['apps/api/test/payments-signature-verification.e2e-spec.ts'], gap: 'E2E endpoint với chữ ký hợp lệ/không hợp lệ, HTTP status và bất biến DB đã đạt bằng khóa test; chưa xác minh cấu hình khóa của môi trường triển khai.' },
  { id: 'S-22', title: 'Trang kết quả thanh toán', unit: ['apps/web/src/features/payment-result/payment-result.spec.ts'], e2e: ['apps/api/test/orders.e2e-spec.ts'], gap: 'Test logic polling có, nhưng chưa kiểm tra trang chạy trên browser và trạng thái thật qua hết mốc 60 giây.' },
  { id: 'S-23', title: 'Hết hạn đơn và giải phóng ghế', unit: ['apps/api/src/orders/order-expiry.spec.ts', 'apps/api/src/payments/payments.service.spec.ts'], e2e: ['apps/api/test/orders.e2e-spec.ts'], gap: 'E2E hết hạn và giải phóng ghế đã đạt; cuộc đua webhook/expiry mới được kiểm tra bằng unit mock, chưa chạy đồng thời trên DB thật.' },
  { id: 'S-24', title: 'Thanh toán thất bại và thử lại', unit: ['apps/api/src/payments/payments.service.spec.ts', 'apps/web/src/features/order-review/order-review.spec.ts'], e2e: ['apps/api/test/orders.e2e-spec.ts'], gap: 'API e2e cho retry đã đạt; chưa kiểm tra trạng thái UI, countdown và lịch sử lần thử trực tiếp trên browser.' },
  { id: 'S-25', title: 'Vé điện tử QR', unit: ['apps/api/src/tickets/tickets.service.spec.ts', 'apps/web/src/features/tickets/ticket-qr.spec.ts'], e2e: ['apps/api/test/tickets.e2e-spec.ts'], gap: 'E2E đã xác minh cấp QR theo ghế trả phí, quyền chủ sở hữu và verify/tamper; chưa xác minh UI vé và trường hợp đơn chưa thanh toán trên browser.' },
];

const missingTestFiles = [...new Set(requirements.flatMap((item) => [...item.unit, ...item.e2e]))]
  .filter((testFile) => !existsSync(path.join(root, testFile)));
if (missingTestFiles.length) {
  console.error('Đường dẫn test ánh xạ không tồn tại:', missingTestFiles.join(', '));
  process.exit(2);
}

function safeE2eTarget() {
  try {
    const db = new URL(process.env.DATABASE_URL ?? '');
    const redis = new URL(process.env.REDIS_URL ?? '');
    return db.protocol === 'postgresql:' && db.hostname === '127.0.0.1' && db.port === '15432' && db.pathname === '/sprint2_integration'
      && redis.protocol === 'redis:' && redis.hostname === '127.0.0.1' && redis.port === '16379';
  } catch {
    return false;
  }
}

function run(label, args, env = process.env, capture = false) {
  console.log(`\n> ${label}`);
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: capture ? 'utf8' : undefined,
    maxBuffer: capture ? 32 * 1024 * 1024 : undefined,
    stdio: capture ? 'pipe' : 'inherit',
    shell: process.platform === 'win32',
  });
  const output = capture ? `${result.stdout ?? ''}\n${result.stderr ?? ''}` : '';
  if (capture && output) process.stdout.write(output);
  if (result.error) console.error(result.error.message);
  return {
    passed: result.status === 0,
    failedFiles: capture
      ? [...new Set([...output.matchAll(/FAIL\s+test\/([^\s]+\.e2e-spec\.ts)/g)].map((match) => `apps/api/test/${match[1]}`))]
      : [],
    summary: capture
      ? {
          files: Number(output.match(/Test Files\s+(\d+) passed \((\d+)\)/)?.[1] ?? 0),
          tests: Number(output.match(/Tests\s+(\d+) passed \((\d+)\)/)?.[1] ?? 0),
        }
      : undefined,
  };
}

const results = {
  apiUnit: run('pnpm --filter api exec vitest run --no-file-parallelism --maxWorkers=1', ['--filter', 'api', 'exec', 'vitest', 'run', '--no-file-parallelism', '--maxWorkers=1']).passed,
  webUnit: run('pnpm --filter web exec vitest run --config vitest.config.ts --no-file-parallelism --maxWorkers=1', ['--filter', 'web', 'exec', 'vitest', 'run', '--config', 'vitest.config.ts', '--no-file-parallelism', '--maxWorkers=1']).passed,
  e2e: 'SKIPPED',
  e2eFailedFiles: [],
  e2eSummary: undefined,
};

if (includeE2e) {
  if (!safeE2eTarget()) {
    console.error('\nKhông chạy e2e: cần DATABASE_URL tới 127.0.0.1:15432/sprint2_integration và REDIS_URL tới 127.0.0.1:16379 để cô lập dữ liệu test.');
    results.e2e = 'UNSAFE_OR_UNCONFIGURED';
  } else {
    const testEnv = {
      ...process.env,
      PAYMENT_WEBHOOK_SECRET: 'requirements-2-test-secret-only',
      MOMO_SECRET_KEY: 'requirements-2-test-secret-only',
      MOMO_ACCESS_KEY: 'requirements-2-test-access-only',
      PAYMENT_GATEWAY: 'momo',
      HOLD_EXPIRY_MODE: 'off',
    };
    const e2eFiles = [...new Set(requirements.flatMap((item) => item.e2e))];
    const e2eArgs = e2eFiles.map((testFile) =>
      path.relative(path.join(root, 'apps/api'), path.join(root, testFile)).replaceAll(path.sep, '/'),
    );
    const e2eResult = run(
      `pnpm --filter api exec vitest run --config ./vitest.config.e2e.ts --testTimeout=15000 ${e2eArgs.join(' ')}`,
      ['--filter', 'api', 'exec', 'vitest', 'run', '--config', './vitest.config.e2e.ts', '--testTimeout=15000', ...e2eArgs],
      testEnv,
      true,
    );
    results.e2e = e2eResult.passed ? 'PASS' : 'FAIL';
    results.e2eFailedFiles = e2eResult.failedFiles;
    results.e2eSummary = e2eResult.summary;
  }
}

const unitPass = results.apiUnit && results.webUnit;
const report = [
  '# Đối chiếu Requirements_2.docx',
  '',
  `- Thời điểm chạy: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
  `- API unit: ${results.apiUnit ? 'ĐẠT' : 'KHÔNG ĐẠT'}`,
  `- Web unit: ${results.webUnit ? 'ĐẠT' : 'KHÔNG ĐẠT'}`,
  `- API e2e: ${results.e2e === 'PASS' ? `ĐẠT (${results.e2eSummary.files} file, ${results.e2eSummary.tests} test)` : results.e2e === 'FAIL' ? `KHÔNG ĐẠT (${results.e2eFailedFiles.map((file) => path.basename(file)).join(', ') || 'xem log chạy'})` : 'CHƯA CHẠY'}`,
  '- Ý nghĩa trạng thái: “ĐẠT một phần” nghĩa là test hiện có liên quan đã chạy đạt; chưa khẳng định mọi AC/NFR của dòng đó.',
  '',
  '| ID | Chức năng | Test hiện có | Trạng thái kiểm tra | Lý do / phần chưa chứng minh |',
  '|---|---|---|---|---|',
  ...requirements.map((item) => {
    const hasTests = (item.unit.length > 0 && unitPass) || (item.e2e.length > 0 && results.e2e === 'PASS');
    const mappedLayerFailed = item.unit.some((test) => test.startsWith('apps/api/') ? !results.apiUnit : !results.webUnit);
    const e2eFailed = item.e2e.some((testFile) => results.e2eFailedFiles.includes(testFile));
    const overall = mappedLayerFailed || e2eFailed ? 'KHÔNG ĐẠT' : hasTests ? 'ĐẠT MỘT PHẦN' : 'CHƯA ĐỦ BẰNG CHỨNG';
    const evidence = [...item.unit, ...(results.e2e === 'PASS' ? item.e2e : [])].join('<br>');
    const failedSuites = item.e2e.filter((testFile) => results.e2eFailedFiles.includes(testFile));
    const e2eContext = results.e2e === 'PASS'
      ? ''
      : failedSuites.length
        ? ` E2E thất bại: ${failedSuites.map((file) => path.basename(file)).join(', ')}.`
        : ' E2E chưa chạy hoặc suite này không có lỗi được ghi nhận.';
    const gap = `${item.gap}${e2eContext}`;
    return `| ${item.id} | ${item.title} | ${evidence || 'Chưa tìm thấy test ánh xạ'} | ${overall} | ${gap} |`;
  }),
  '',
  '## Giới hạn chung',
  '',
  '- Unit test không thay thế kiểm thử UI trực tiếp, trạng thái bàn phím/focus, responsive, console/runtime và hành trình người dùng trên browser.',
  '- Các NFR hiệu năng (2.000 ghế, 200 suất, 200 yêu cầu đồng thời, p95) cần benchmark riêng; không được suy ra từ test logic.',
  '- E2E tạo/xóa fixture. Chỉ dùng với PostgreSQL cô lập `sprint2_integration` cổng 15432 và Redis cô lập cổng 16379; script từ chối chạy nếu URL không đúng.',
  '',
  '## Cách chạy',
  '',
  '```powershell',
  'node scripts/verify-requirements-2.mjs',
  '# Chỉ sau khi cấu hình DB/Redis test cô lập đúng cổng:',
  'node scripts/verify-requirements-2.mjs --with-e2e',
  '```',
  '',
].join('\n');

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, report, 'utf8');
console.log(`\nĐã ghi report: ${path.relative(root, reportPath)}`);

if (!unitPass || results.e2e === 'FAIL' || results.e2e === 'UNSAFE_OR_UNCONFIGURED') process.exitCode = 1;
