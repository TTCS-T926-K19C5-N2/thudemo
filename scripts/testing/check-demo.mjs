import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('../../apps/api/node_modules/@prisma/client');
const { PrismaPg } = require('../../apps/api/node_modules/@prisma/adapter-pg');

const env = parseEnv(readFileSync('.env', 'utf8'));
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });

async function main() {
  const counts = await prisma.showtime.groupBy({
    by: ['isDemo'],
    _count: true,
  });
  console.log('Showtimes by isDemo:', counts);

  const sample = await prisma.showtime.findMany({
    select: { id: true, isDemo: true, event: { select: { name: true } } },
    take: 5
  });
  console.log('Sample showtimes:', sample);
}

main().catch(console.error).finally(() => prisma.$disconnect());
