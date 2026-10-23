import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
const c = JSON.parse(
  readFileSync(process.env.SPRINT1_STAGING_CONFIG ?? '', 'utf8'),
);
let target;
try {
  target = new URL(process.env.DATABASE_URL ?? '');
} catch {
  throw new Error('Invalid staging DATABASE_URL configuration');
}
if (
  c.profile !== 'sprint1-laptop-20261015' ||
  c.pgPort !== 15455 ||
  c.database !== 'sprint1_staging_20261015' ||
  process.env.SPRINT1_STAGING_WRITE !== c.profile ||
  target.hostname !== '127.0.0.1' ||
  target.port !== '15455' ||
  target.pathname !== '/sprint1_staging_20261015' ||
  decodeURIComponent(target.username) !== c.user ||
  decodeURIComponent(target.password) !== c.dbPassword
)
  throw new Error(
    'Seed denied: exact synthetic laptop staging target required',
  );
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: target.toString() }),
});
try {
  await db.$transaction(
    async (tx) => {
      for (const name of ['BUYER', 'ORGANIZER', 'STAFF', 'ACCOUNTANT', 'ADMIN'])
        await tx.role.upsert({ where: { name }, update: {}, create: { name } });
      for (const fixture of c.accounts) {
        if (
          !fixture.email.endsWith('@sprint1.staging.invalid') ||
          fixture.password.length < 24
        )
          throw new Error('Invalid synthetic staging fixture');
        const old = await tx.user.findUnique({
          where: { email: fixture.email },
          include: { userRoles: { include: { role: true } } },
        });
        if (old) {
          if (
            !(await argon2.verify(old.password, fixture.password)) ||
            old.userRoles
              .map((r) => r.role.name)
              .sort()
              .join() !== [...fixture.roles].sort().join()
          )
            throw new Error(
              'Existing fixture differs; refusing role/password overwrite',
            );
          continue;
        }
        await tx.user.create({
          data: {
            email: fixture.email,
            password: await argon2.hash(fixture.password, {
              type: argon2.argon2id,
            }),
            isEmailVerified: true,
            userRoles: {
              create: fixture.roles.map((name) => ({
                role: { connect: { name } },
              })),
            },
          },
        });
      }
    },
    { timeout: 30000 },
  );
  console.log(
    'Synthetic laptop staging fixtures ready; existing accounts/history retained.',
  );
} finally {
  await db.$disconnect();
}
