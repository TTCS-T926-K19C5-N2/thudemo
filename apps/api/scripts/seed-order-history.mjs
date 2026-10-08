import { resolve } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  seedOrderHistory,
  cleanupOrderHistory,
  assertOrderHistoryTestDatabase,
} from '../test/fixtures/order-history.ts';

config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });
assertOrderHistoryTestDatabase();
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const output = resolve(import.meta.dirname, '../../../output/playwright/s32');
const path = resolve(output, 'fixture.json');
try {
  if (process.argv.includes('--cleanup')) {
    await cleanupOrderHistory(db, JSON.parse(await readFile(path, 'utf8')));
    console.log(
      'Removed only S-32 browser fixture records from the isolated database.',
    );
  } else {
    const fixture = await seedOrderHistory(db);
    // The browser signs in through the real form; never write session cookies.
    for (const account of Object.values(fixture.accounts))
      delete account.cookie;
    await mkdir(output, { recursive: true });
    await writeFile(path, JSON.stringify(fixture, null, 2));
    console.log(
      'Seeded S-32 browser fixture; manifest contains no passwords or session tokens.',
    );
  }
} finally {
  await db.$disconnect();
}
