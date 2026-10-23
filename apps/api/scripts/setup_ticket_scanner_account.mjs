import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';

config({ path: resolve(import.meta.dirname, '../../../.env') });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
});

async function main() {
  console.log('=== THIẾT LẬP TÀI KHOẢN NGƯỜI SOÁT VÉ (STAFF) ===');

  const email = 'soatve@codegym.local';
  const password = 'Staff@123456';
  const fullName = 'Nhân viên Soát Vé';

  // 1. Đảm bảo role STAFF tồn tại
  const staffRole = await prisma.role.upsert({
    where: { name: 'STAFF' },
    update: {},
    create: { name: 'STAFF' },
  });

  const buyerRole = await prisma.role.upsert({
    where: { name: 'BUYER' },
    update: {},
    create: { name: 'BUYER' },
  });

  // 2. Hash mật khẩu bằng Argon2id
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  // 3. Upsert tài khoản user
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      fullName,
      password: passwordHash,
      isActive: true,
      isEmailVerified: true,
    },
    create: {
      email,
      fullName,
      password: passwordHash,
      isActive: true,
      isEmailVerified: true,
    },
  });

  // 4. Gán quyền STAFF cho user
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId: staffRole.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      roleId: staffRole.id,
    },
  });

  // 5. Phân công nhân viên vào tất cả các suất diễn đang có
  const showtimes = await prisma.showtime.findMany({
    select: { id: true, event: { select: { name: true } } },
  });

  let assignedCount = 0;
  for (const st of showtimes) {
    await prisma.showtimeStaff.upsert({
      where: {
        showtimeId_userId: {
          showtimeId: st.id,
          userId: user.id,
        },
      },
      update: {},
      create: {
        showtimeId: st.id,
        userId: user.id,
      },
    });

    // Đảm bảo mỗi suất diễn có ít nhất 1 cửa soát vé
    const gate = await prisma.checkInGate.upsert({
      where: {
        showtimeId_name: {
          showtimeId: st.id,
          name: 'Cửa 1 - Cửa chính',
        },
      },
      update: {},
      create: {
        showtimeId: st.id,
        name: 'Cửa 1 - Cửa chính',
      },
    });

    // Cấp quyền check-in tại cửa
    const allGates = await prisma.checkInGate.findMany({
      where: { showtimeId: st.id },
    });
    for (const g of allGates) {
      await prisma.checkInPermission.upsert({
        where: {
          userId_gateId: {
            userId: user.id,
            gateId: g.id,
          },
        },
        update: {},
        create: {
          userId: user.id,
          gateId: g.id,
          staffName: fullName,
          canOverride: true,
        },
      });
    }

    assignedCount++;
  }

  // Đảm bảo suất diễn mẫu "Nghêu, Sò, Ốc, Hến" (có sẵn vé) bắt đầu hôm nay
  const sampleShowtimeId = 'd5a0ee7d-a709-4f65-ad25-ee6a56a70356';
  await prisma.showtime.update({
    where: { id: sampleShowtimeId },
    data: {
      startTime: new Date(),
      status: 'ON_SALE',
    },
  });

  console.log(`✅ Đã thiết lập tài khoản thành công!`);
  console.log(`- Email: ${email}`);
  console.log(`- Mật khẩu: ${password}`);
  console.log(`- Họ và tên: ${fullName}`);
  console.log(`- Vai trò: STAFF`);
  console.log(`- Đã phân công vào: ${assignedCount} suất diễn`);
}

main()
  .catch((e) => {
    console.error('❌ Lỗi:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
