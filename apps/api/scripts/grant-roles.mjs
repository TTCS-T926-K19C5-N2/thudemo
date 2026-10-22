import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

config({ path: resolve(import.meta.dirname, '../../../.env') });

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const targetEmail = process.argv[2] || 'duongthutrang2912@gmail.com';
  console.log(`Đang cấp quyền ADMIN và ORGANIZER cho tài khoản: ${targetEmail}`);

  const user = await db.user.findUnique({
    where: { email: targetEmail },
  });

  if (!user) {
    throw new Error(`Không tìm thấy người dùng với email: ${targetEmail}`);
  }

  const roles = await db.role.findMany({
    where: { name: { in: ['ADMIN', 'ORGANIZER'] } },
  });

  for (const role of roles) {
    await db.userRole.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId: role.id,
        },
      },
      update: {},
      create: {
        userId: user.id,
        roleId: role.id,
      },
    });
    console.log(`✅ Đã cấp vai trò: ${role.name}`);
  }

  const updatedUser = await db.user.findUnique({
    where: { id: user.id },
    select: {
      email: true,
      userRoles: { select: { role: { select: { name: true } } } },
    },
  });

  console.log(
    'Tài khoản hiện có các quyền:',
    updatedUser?.userRoles.map((r) => r.role.name),
  );
  console.log('🎉 Hoàn tất! Bạn có thể tải lại trang web ngay bây giờ.');
}

main()
  .catch((e) => {
    console.error('Lỗi:', e.message);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
