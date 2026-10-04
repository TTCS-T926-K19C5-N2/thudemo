// Operator-only, once on an EMPTY synthetic staging database. No service startup seed.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { validateSeedTarget } from './render-staging-target.mjs';
let db;
try {
  const target = validateSeedTarget(process.env);
  db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: target.connectionString }),
  });
  const password = await argon2.hash(process.env.SPRINT2_DEMO_PASSWORD, {
    type: argon2.argon2id,
  });
  await db.$transaction(
    async (tx) => {
      // Serialize two operator seeds and block concurrent user/event creation.
      await tx.$executeRawUnsafe(
        'LOCK TABLE users, events, showtimes, seats, roles, user_roles IN EXCLUSIVE MODE',
      );
      const counts = await Promise.all([
        tx.user.count(),
        tx.event.count(),
        tx.showtime.count(),
        tx.seat.count(),
      ]);
      if (counts.some((count) => count !== 0))
        throw new Error('Refusing to modify a non-empty staging database');
      for (const name of ['BUYER', 'ORGANIZER', 'STAFF', 'ACCOUNTANT', 'ADMIN'])
        await tx.role.upsert({ where: { name }, create: { name }, update: {} });
      for (const [email, role] of [
        ['staging-organizer@example.invalid', 'ORGANIZER'],
        ['staging-buyer@example.invalid', 'BUYER'],
      ]) {
        const r = await tx.role.findUniqueOrThrow({ where: { name: role } });
        await tx.user.create({
          data: {
            email,
            password,
            isEmailVerified: true,
            userRoles: { create: { roleId: r.id } },
          },
        });
      }
    },
    { timeout: 15000 },
  );
  console.log(
    `Synthetic organizer/buyer initialized once (${target.mode}); no personal data.`,
  );
} catch {
  // Database/adapter errors can include URLs or credentials; don't log raw errors.
  console.error(
    'Seed refused or failed. Check dedicated target, approval, TLS, migrations and empty database. No reset permitted.',
  );
  process.exitCode = 1;
} finally {
  if (db) await db.$disconnect();
}
