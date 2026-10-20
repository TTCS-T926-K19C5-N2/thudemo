import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

config({ path: resolve(import.meta.dirname, '../../../.env') });

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  console.log('--- THIẾT LẬP DỮ LIỆU THỬ NGHIỆM SOÁT VÉ (SCANNER) ---');

  // 1. Tìm user nhân viên soát vé
  const staff = await db.user.findUnique({
    where: { email: 'soatve@codegym.local' },
  });
  if (!staff) throw new Error('Không tìm thấy tài khoản soatve@codegym.local');

  // 2. Lấy suất diễn có sẵn vé đã mua (Nghêu, Sò, Ốc, Hến)
  const showtimeId = 'd5a0ee7d-a709-4f65-ad25-ee6a56a70356';
  const showtime = await db.showtime.findUnique({
    where: { id: showtimeId },
    include: { event: true },
  });
  if (!showtime) throw new Error('Không tìm thấy suất diễn mục tiêu');

  // Đặt thời gian bắt đầu sang hôm nay (giờ hiện tại) để /check-in/today nhận diện
  const todayNow = new Date();
  await db.showtime.update({
    where: { id: showtimeId },
    data: {
      startTime: todayNow,
      status: 'ON_SALE',
    },
  });

  // 3. Phân công nhân viên vào showtime (showtime_staff)
  await db.showtimeStaff.upsert({
    where: { showtimeId_userId: { showtimeId, userId: staff.id } },
    update: {},
    create: { showtimeId, userId: staff.id },
  });

  // 4. Tạo Cửa soát vé và phân quyền
  const gateName = 'Cửa 1 - Khán phòng chính';
  const gate = await db.checkInGate.upsert({
    where: { showtimeId_name: { showtimeId, name: gateName } },
    update: {},
    create: { showtimeId, name: gateName },
  });

  // 5. In ra thông tin vé và chuỗi mã QR để test
  const items = await db.orderItem.findMany({
    where: { order: { showtimeId } },
    include: { order: true, seat: true },
  });

  const { readFileSync } = await import('node:fs');
  const { sign, createPrivateKey } = await import('node:crypto');
  const { ticketQrInput } = await import('../../../packages/shared/ticket-qr.js');

  const keyPem = readFileSync(resolve(import.meta.dirname, '../../../.keys/codegym-local-ticket.pem'), 'utf8');
  const privateKey = createPrivateKey(keyPem);
  const keyId = 'codegym-local-20261020';

  console.log('\n🎟️ DANH SÁCH VÉ MẪU ĐỂ QUÉT THỬ:');
  for (const item of items) {
    const input = ticketQrInput({ keyId, showtimeId: item.order.showtimeId, ticketId: item.id });
    const sig = sign(null, Buffer.from(input, 'ascii'), privateKey).toString('base64url');
    const qrPayload = input + '.' + sig;
    console.log(`\n• Ghế: ${item.seat.row}-${item.seat.seatNumber} (${item.categoryName}) - Đơn hàng: ${item.orderId}`);
    console.log(`  Mã QR Payload (copy để dán vào ô "Hoặc nhập mã vé"):`);
    console.log(`  ${qrPayload}`);
  }
}

main()
  .catch((e) => {
    console.error('Lỗi thiết lập:', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
