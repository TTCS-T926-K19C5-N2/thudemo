import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const snapshotFile = resolve(root, 'demo-data/demo-database-snapshot-20261024.sql');

if (!existsSync(snapshotFile)) {
  console.error('Lỗi: Không tìm thấy file snapshot tại demo-data/demo-database-snapshot-20261024.sql');
  process.exit(1);
}

// 1. Tìm container postgres đang chạy
let containerName = null;
let dbUser = 'sprint1_demo';
let dbName = null;

// Thử tìm trong .sprint1-demo/config.json ở thư mục hiện tại hoặc các profile lân cận
const configCandidates = [
  resolve(root, '.sprint1-demo/config.json'),
  resolve(root, '../Codegym-demo-proof-20261023T1530/.sprint1-demo/config.json'),
];

for (const p of configCandidates) {
  if (existsSync(p)) {
    try {
      const cfg = JSON.parse(readFileSync(p, 'utf8'));
      if (cfg.profile && cfg.database) {
        containerName = `${cfg.profile}-postgres-1`;
        dbUser = cfg.user || 'sprint1_demo';
        dbName = cfg.database;
        break;
      }
    } catch {}
  }
}

// Nếu chưa thấy, dùng docker ps để tự động detect container postgres đang chạy
if (!containerName) {
  const psOut = spawnSync('docker', ['ps', '--filter', 'ancestor=postgres:15-alpine', '--format', '{{.Names}}'], {
    encoding: 'utf8',
  });
  if (psOut.stdout) {
    const lines = psOut.stdout.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length > 0) {
      containerName = lines[0];
      // Đoán dbName từ tên container nếu dạng s1demo-<id>-postgres-1
      const match = containerName.match(/s1demo-([a-f0-9]+)/);
      if (match) {
        dbName = `sprint1_demo_${match[1]}`;
      }
    }
  }
}

if (!containerName) {
  console.error('Lỗi: Không tìm thấy Docker container Postgres đang chạy.');
  console.error('Vui lòng khởi động môi trường demo trước bằng: node scripts/sprint1-onboarding.mjs Start');
  process.exit(1);
}

if (!dbName) {
  dbName = 'sprint1_demo';
}

console.log(`Đang khôi phục dữ liệu snapshot vào container: ${containerName}...`);
console.log(`Database: ${dbName}, User: ${dbUser}`);

const sqlContent = readFileSync(snapshotFile);

const restoreProc = spawnSync('docker', [
  'exec',
  '-i',
  containerName,
  'psql',
  '-U',
  dbUser,
  '-d',
  dbName,
], {
  input: sqlContent,
  stdio: ['pipe', 'inherit', 'inherit'],
});

if (restoreProc.status !== 0) {
  console.error(`Khôi phục dữ liệu thất bại với mã lỗi ${restoreProc.status}`);
  process.exit(restoreProc.status || 1);
}

console.log('✅ Khôi phục thành công toàn bộ dữ liệu (40 sự kiện, các tài khoản role, đơn hàng, vé đã chuyển nhượng)!');
