import { config } from 'dotenv';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
const root = resolve(import.meta.dirname, '../../..');
config({ path: resolve(root, '.env'), quiet: true });
const c = JSON.parse(readFileSync(resolve(root, '.sprint1-local/config.json')));
let url;
try {
  url = new URL(process.env.DATABASE_URL);
} catch {
  throw new Error('Invalid local DATABASE_URL configuration');
}
if (
  process.env.NODE_ENV === 'production' ||
  url.hostname !== '127.0.0.1' ||
  url.port !== String(c.pgPort) ||
  url.pathname !== '/sprint1_gitflow_20261015' ||
  c.database !== 'sprint1_gitflow_20261015'
)
  throw new Error('Seed denied: exact isolated database required');
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }),
});
try {
  await db.$transaction(
    async (tx) => {
      for (const name of ['BUYER', 'ORGANIZER', 'STAFF', 'ACCOUNTANT', 'ADMIN'])
        await tx.role.upsert({ where: { name }, update: {}, create: { name } });
      for (const a of c.accounts) {
        if (
          !a.email.endsWith('@sprint1.demo.invalid') ||
          a.password.length < 20
        )
          throw new Error('Invalid fixture');
        const old = await tx.user.findUnique({
          where: { email: a.email },
          include: { userRoles: { include: { role: true } } },
        });
        if (old) {
          if (
            !(await argon2.verify(old.password, a.password)) ||
            old.userRoles
              .map((r) => r.role.name)
              .sort()
              .join() !== [...a.roles].sort().join()
          )
            throw new Error(
              'Existing fixture differs; refuse password or role overwrite',
            );
          continue;
        }
        await tx.user.create({
          data: {
            email: a.email,
            password: await argon2.hash(a.password, { type: argon2.argon2id }),
            isEmailVerified: true,
            userRoles: {
              create: a.roles.map((name) => ({ role: { connect: { name } } })),
            },
          },
        });
      }
    },
    { timeout: 30000 },
  );
  console.log(
    'Five roles and six isolated fixtures ready; existing accounts/history preserved.',
  );
} finally {
  await db.$disconnect();
}
