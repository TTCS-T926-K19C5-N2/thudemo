import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('../apps/api/node_modules/@prisma/client');
const { PrismaPg } = require('../apps/api/node_modules/@prisma/adapter-pg');

const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ticketing_dev?schema=public';
const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  const targetUser = await prisma.user.findUnique({
    where: { email: 'design-organizer@example.invalid' }
  });
  if (!targetUser) {
    console.log('Target user design-organizer not found');
    return;
  }
  const result = await prisma.event.updateMany({
    data: { organizerId: targetUser.id }
  });
  console.log(`Đã gán thành công ${result.count} sự kiện cho ${targetUser.email} (${targetUser.id})`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
