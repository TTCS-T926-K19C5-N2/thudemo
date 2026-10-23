import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('../apps/api/node_modules/@prisma/client');
const { PrismaPg } = require('../apps/api/node_modules/@prisma/adapter-pg');

const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ticketing_dev?schema=public';
const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  const events = await prisma.event.findMany({
    include: {
      showtimes: {
        include: {
          categories: true,
          _count: { select: { seats: true, tickets: true, orders: true } }
        }
      }
    }
  });

  console.log(`Current events count: ${events.length}`);
  for (const e of events) {
    console.log(`- [${e.id}] "${e.name}" (${e.status}), organizerId: ${e.organizerId}`);
    for (const s of e.showtimes) {
      console.log(`    Showtime ${s.id} (${s.status}), seats: ${s._count.seats}, tickets: ${s._count.tickets}, orders: ${s._count.orders}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
