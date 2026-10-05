import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';

config({ path: resolve(import.meta.dirname, '../../../.env') });

const databaseUrl = process.env.DATABASE_URL;
const adminPassword = process.env.DEMO_ADMIN_PASSWORD;
const organizerPassword = process.env.DEMO_ORGANIZER_PASSWORD;

if (
  process.env.NODE_ENV === 'production' ||
  !databaseUrl ||
  !adminPassword ||
  !organizerPassword
) {
  throw new Error(
    'Demo seed requires a local database and both demo passwords.',
  );
}

if (
  adminPassword.length < 12 ||
  organizerPassword.length < 12 ||
  adminPassword.startsWith('<') ||
  organizerPassword.startsWith('<')
) {
  throw new Error(
    'Replace demo password placeholders with local passwords of at least 12 characters.',
  );
}

const databaseHost = new URL(databaseUrl).hostname;
if (!['localhost', '127.0.0.1'].includes(databaseHost)) {
  throw new Error('Demo seed only supports a local database.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

try {
  const [adminHash, organizerHash] = await Promise.all([
    argon2.hash(adminPassword, { type: argon2.argon2id }),
    argon2.hash(organizerPassword, { type: argon2.argon2id }),
  ]);

  await prisma.$transaction(async (tx) => {
    for (const name of ['BUYER', 'ORGANIZER', 'TICKET_INSPECTOR', 'ACCOUNTANT', 'ADMIN']) {
      await tx.role.upsert({ where: { name }, update: {}, create: { name } });
    }

    for (const account of [
      { email: 'admin@demo.invalid', password: adminHash, role: 'ADMIN' },
      {
        email: 'organizer@demo.invalid',
        password: organizerHash,
        role: 'ORGANIZER',
      },
    ]) {
      const user = await tx.user.upsert({
        where: { email: account.email },
        update: { password: account.password, isEmailVerified: true },
        create: {
          email: account.email,
          password: account.password,
          isEmailVerified: true,
        },
      });
      await tx.userRole.createMany({
        data: [
          {
            userId: user.id,
            roleId: (
              await tx.role.findUniqueOrThrow({ where: { name: account.role } })
            ).id,
          },
        ],
        skipDuplicates: true,
      });
    }
  });
  console.log('Seeded five roles and two local demo accounts.');
} catch {
  console.error('Demo seed failed.');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
