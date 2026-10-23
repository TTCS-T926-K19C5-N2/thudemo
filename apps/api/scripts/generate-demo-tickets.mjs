import QRCode from 'qrcode';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const qr1 = 'ET1.Ed25519.codegym-local-20261020.d5a0ee7d-a709-4f65-ad25-ee6a56a70356.b710445b-f71b-40c0-9112-ed77bac48a69.ocLkDDY9wpoPTjdY_FEhpxURI0bq00RhLwN65fBMcAhB8v-wScuzbH-pJLBRxPzFRDEKv7ozUyAiskIVeGA_Aw';
const qr2 = 'ET1.Ed25519.codegym-local-20261020.d5a0ee7d-a709-4f65-ad25-ee6a56a70356.fab1edd3-4264-4656-b2dd-b64617a33767.oBlfUzSs9Yd-hSmTrI5QatMrb9qMnZtgOoa9W-MPmEJ8pFTwhZBl-U33vX41cdBpMjf3gNeiGf9jN06GoCQ_Bw';

async function main() {
  const dataUri1 = await QRCode.toDataURL(qr1, { width: 300, margin: 2 });
  const dataUri2 = await QRCode.toDataURL(qr2, { width: 300, margin: 2 });

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Mã QR Vé Thử Nghiệm Soát Vé</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem; display: flex; flex-direction: column; align-items: center; margin: 0; }
    h1 { margin-bottom: 0.5rem; color: #38bdf8; text-align: center; }
    p.sub { color: #94a3b8; margin-bottom: 2rem; max-width: 650px; text-align: center; line-height: 1.5; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 2rem; width: 100%; max-width: 900px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 1.5rem; text-align: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2); }
    .card.checked-in { border-color: #f59e0b; }
    .badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.85rem; font-weight: 600; margin-bottom: 1rem; }
    .badge-valid { background: #10b981; color: #fff; }
    .badge-used { background: #f59e0b; color: #000; }
    img { border-radius: 8px; background: #fff; padding: 10px; margin-bottom: 1rem; width: 220px; height: 220px; }
    .code { font-family: monospace; font-size: 0.75rem; background: #0f172a; padding: 0.5rem; border-radius: 6px; word-break: break-all; color: #cbd5e1; user-select: all; text-align: left; }
    .meta { font-weight: 600; font-size: 1.1rem; margin-bottom: 0.25rem; }
  </style>
</head>
<body>
  <h1>Vé Điện Tử Mẫu (Test QR Scanner)</h1>
  <p class="sub">
    Mở trang này trên điện thoại hoặc màn hình phụ để dùng Camera tại 
    <a href="/scanner" target="_blank" style="color: #38bdf8; font-weight: bold;">/scanner</a> 
    quét trực tiếp, hoặc copy chuỗi mã QR bên dưới để dán vào ô "Hoặc nhập mã vé".
  </p>
  <div class="grid">
    <div class="card">
      <span class="badge badge-valid">VÉ HỢP LỆ (CHƯA QUÉT)</span>
      <div class="meta">Ghế: A-9 · Hạng: VIP</div>
      <div style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 1rem;">Vở kịch: Nghêu, Sò, Ốc, Hến</div>
      <img src="${dataUri1}" alt="Mã QR Ghế A-9" />
      <div style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 0.25rem;">Chuỗi mã QR (click để bôi đen):</div>
      <div class="code">${qr1}</div>
    </div>
    <div class="card checked-in">
      <span class="badge badge-used">VÉ ĐÃ QUA CỬA (TEST BÁO TRÙNG)</span>
      <div class="meta">Ghế: B-9 · Hạng: VIP</div>
      <div style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 1rem;">Vở kịch: Nghêu, Sò, Ốc, Hến</div>
      <img src="${dataUri2}" alt="Mã QR Ghế B-9" />
      <div style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 0.25rem;">Chuỗi mã QR (click để bôi đen):</div>
      <div class="code">${qr2}</div>
    </div>
  </div>
</body>
</html>`;

  const publicDir = resolve(import.meta.dirname, '../../web/public');
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(resolve(publicDir, 'demo-tickets.html'), html, 'utf8');
  console.log('✅ Đã tạo thành công trang hiển thị vé: apps/web/public/demo-tickets.html');
}

main().catch(console.error);
