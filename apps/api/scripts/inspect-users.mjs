import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

config({ path: resolve(import.meta.dirname, '../../../.env') });

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const users = await db.user.findMany({
    select: {
      id: true,
      email: true,
      isEmailVerified: true,
      isActive: true,
      userRoles: { select: { role: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  console.log(
    JSON.stringify(
      users.map((u) => ({
        id: u.id,
        email: u.email,
        isActive: u.isActive,
        isEmailVerified: u.isEmailVerified,
        roles: u.userRoles.map((r) => r.role.name),
      })),
      null,
      2,
    ),
  );
}

main().catch(console.error).finally(() => db.$disconnect());
