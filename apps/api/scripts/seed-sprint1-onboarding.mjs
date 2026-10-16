import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';

const root = realpathSync(resolve(import.meta.dirname, '../../..'));
const c = JSON.parse(readFileSync(resolve(root, '.sprint1-demo/config.json')));
let url;
try {
  url = new URL(process.env.DATABASE_URL);
} catch {
  throw Error('Invalid demo database target');
}
if (
  c.root !== root ||
  !/^s1demo-[a-f0-9]{12}$/.test(c.profile) ||
  c.database !== `sprint1_demo_${c.profile.slice(7)}` ||
  process.env.SPRINT1_DEMO_PROFILE !== c.profile ||
  process.env.NODE_ENV === 'production' ||
  url.hostname !== '127.0.0.1' ||
  url.port !== String(c.ports.postgres) ||
  url.pathname !== '/' + c.database ||
  decodeURIComponent(url.username) !== c.user ||
  decodeURIComponent(url.password) !== c.dbPassword
)
  throw Error('Seed refused: exact owned demo profile/database required');
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }),
});
try {
  await db.$transaction(
    async (tx) => {
      for (const name of ['BUYER', 'ORGANIZER', 'STAFF', 'ACCOUNTANT', 'ADMIN'])
        await tx.role.upsert({ where: { name }, update: {}, create: { name } });
      for (const account of c.accounts) {
        if (
          !account.email.endsWith(`@${c.profile}.demo.invalid`) ||
          account.password.length < 20
        )
          throw Error('Invalid fixture profile');
        const old = await tx.user.findUnique({
          where: { email: account.email },
          include: { userRoles: { include: { role: true } } },
        });
        if (old) {
          if (
            !(await argon2.verify(old.password, account.password)) ||
            old.userRoles
              .map((r) => r.role.name)
              .sort()
              .join() !== [...account.roles].sort().join() ||
            !old.isEmailVerified ||
            !old.isActive
          )
            throw Error(
              'Existing fixture differs; no credential/role overwrite allowed',
            );
          continue;
        }
        await tx.user.create({
          data: {
            email: account.email,
            password: await argon2.hash(account.password, {
              type: argon2.argon2id,
            }),
            isEmailVerified: true,
            userRoles: {
              create: account.roles.map((name) => ({
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
    'Owned demo fixtures ready; existing records and history retained.',
  );
} finally {
  await db.$disconnect();
}
