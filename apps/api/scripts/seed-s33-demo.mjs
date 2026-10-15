import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient, TicketStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';

config({ path: resolve(import.meta.dirname, '../../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL không tồn tại trong .env');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main() {
  console.log('--- KHỞI TẠO DỮ LIỆU THỬ NGHIỆM CHO S-33 (SCANNER) ---');

  // 1. Ensure roles
  for (const name of ['BUYER', 'ORGANIZER', 'STAFF', 'ADMIN']) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  const staffRole = await prisma.role.findUniqueOrThrow({ where: { name: 'STAFF' } });
  const orgRole = await prisma.role.findUniqueOrThrow({ where: { name: 'ORGANIZER' } });

  // 2. Create Organizer & Staff
  const passwordHash = await argon2.hash('Staff@123456', { type: argon2.argon2id });

  const organizer = await prisma.user.upsert({
    where: { email: 'organizer@demo.invalid' },
    update: {},
    create: {
      email: 'organizer@demo.invalid',
      password: passwordHash,
      isEmailVerified: true,
      userRoles: { create: { roleId: orgRole.id } },
    },
  });

  const staffUser = await prisma.user.upsert({
    where: { email: 'staff@demo.invalid' },
    update: {},
    create: {
      email: 'staff@demo.invalid',
      password: passwordHash,
      isEmailVerified: true,
      userRoles: { create: { roleId: staffRole.id } },
    },
  });

  // Ensure staff role attached
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: staffUser.id, roleId: staffRole.id } },
    update: {},
    create: { userId: staffUser.id, roleId: staffRole.id },
  });

  // 3. Create Event & Showtime
  const event = await prisma.event.create({
    data: {
      name: 'Đêm Nhạc Mùa Thu 2026',
      description: 'Chương trình hòa nhạc đặc biệt mừng kỷ niệm thành phố.',
      location: 'Nhà hát Hòa Bình, TP. Hồ Chí Minh',
      status: 'PUBLISHED',
      organizerId: organizer.id,
    },
  });

  const showtime = await prisma.showtime.create({
    data: {
      eventId: event.id,
      startTime: new Date(Date.now() + 7 * 24 * 3600 * 1000), // 7 days later
      status: 'ON_SALE',
    },
  });

  // 4. Assign staff to showtime
  await prisma.showtimeStaff.upsert({
    where: {
      showtimeId_userId: { showtimeId: showtime.id, userId: staffUser.id },
    },
    update: {},
    create: {
      showtimeId: showtime.id,
      userId: staffUser.id,
    },
  });

  // 5. Seed 100 sample tickets (80 VALID, 15 CHECKED_IN, 5 CANCELLED)
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K'];
  const ticketData = [];
  for (let i = 1; i <= 100; i++) {
    const row = rows[i % rows.length];
    const num = ((i - 1) % 25) + 1;
    let status = TicketStatus.VALID;
    let checkedInAt = null;
    let cancelledAt = null;

    if (i <= 15) {
      status = TicketStatus.CHECKED_IN;
      checkedInAt = new Date(Date.now() - 3600 * 1000);
    } else if (i > 95) {
      status = TicketStatus.CANCELLED;
      cancelledAt = new Date(Date.now() - 1800 * 1000);
    }

    ticketData.push({
      id: randomUUID(),
      showtimeId: showtime.id,
      code: `TK-${i.toString().padStart(5, '0')}`,
      seatLabel: `${row}-${num}`,
      ticketType: i % 3 === 0 ? 'VIP' : 'STANDARD',
      status,
      checkedInAt,
      cancelledAt,
      price: i % 3 === 0 ? 500000 : 250000,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  await prisma.ticket.createMany({
    data: ticketData,
    skipDuplicates: true,
  });

  console.log('✅ Đã tạo thành công dữ liệu mẫu cho S-33:');
  console.log(`- Tài khoản nhân viên soát vé: staff@demo.invalid (mật khẩu: Staff@123456)`);
  console.log(`- Sự kiện: ${event.name}`);
  console.log(`- Suất diễn (Showtime ID): ${showtime.id}`);
  console.log(`- Đã phân công nhân viên vào suất diễn.`);
  console.log(`- Đã tạo 100 vé mẫu (80 hợp lệ, 15 đã vào, 5 đã huỷ).`);
  console.log(`- Bạn có thể đăng nhập và truy cập http://localhost:3000/scanner để kiểm thử.`);
}

main()
  .catch((e) => {
    console.error('Lỗi khởi tạo dữ liệu mẫu:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
