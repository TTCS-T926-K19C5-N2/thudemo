import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';

config({ path: resolve(process.cwd(), '.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not defined in .env');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  console.log('Seeding demo data...');

  // 1. Create or upsert Organizer
  const hashedPassword = await argon2.hash('Admin@123');
  const organizer = await prisma.user.upsert({
    where: { email: 'organizer@eventticket.local' },
    update: {},
    create: {
      email: 'organizer@eventticket.local',
      password: hashedPassword,
      role: Role.ORGANIZER,
      isEmailVerified: true,
    },
  });
  console.log(`Organizer ready: ${organizer.email} (id: ${organizer.id})`);

  // 2. Create Demo Event
  let event = await prisma.event.findFirst({
    where: { name: 'Đại Nhạc Hội Mùa Hè 2026 - Summer Music Fest' },
  });

  if (!event) {
    event = await prisma.event.create({
      data: {
        name: 'Đại Nhạc Hội Mùa Hè 2026 - Summer Music Fest',
        description: 'Đêm nhạc hội bùng nổ cảm xúc với dàn nghệ sĩ hàng đầu Việt Nam.',
        location: 'Sân vận động Quốc gia Mỹ Đình, Hà Nội',
        status: 'PUBLISHED',
        organizerId: organizer.id,
      },
    });
    console.log(`Event created: ${event.name} (id: ${event.id})`);
  } else {
    console.log(`Event exists: ${event.name} (id: ${event.id})`);
  }

  // 3. Create Showtime
  let showtime = await prisma.showtime.findFirst({
    where: { eventId: event.id },
  });

  if (!showtime) {
    showtime = await prisma.showtime.create({
      data: {
        eventId: event.id,
        startTime: new Date('2026-11-20T19:30:00Z'),
      },
    });
    console.log(`Showtime created: ${showtime.startTime.toISOString()} (id: ${showtime.id})`);
  } else {
    console.log(`Showtime exists: ${showtime.startTime.toISOString()} (id: ${showtime.id})`);
  }

  // 4. Create Seat Categories & Seats
  const existingSeatsCount = await prisma.seat.count({
    where: { showtimeId: showtime.id },
  });

  if (existingSeatsCount === 0) {
    const vipCat = await prisma.seatCategory.create({
      data: { showtimeId: showtime.id, name: 'VIP' },
    });
    const standardCat = await prisma.seatCategory.create({
      data: { showtimeId: showtime.id, name: 'Standard' },
    });
    const economyCat = await prisma.seatCategory.create({
      data: { showtimeId: showtime.id, name: 'Economy' },
    });

    const seatsToCreate: Array<{
      showtimeId: string;
      seatCategoryId: string;
      seatRow: string;
      seatNumber: number;
    }> = [];

    // Rows A & B: VIP (10 seats each)
    for (const row of ['A', 'B']) {
      for (let num = 1; num <= 10; num++) {
        seatsToCreate.push({
          showtimeId: showtime.id,
          seatCategoryId: vipCat.id,
          seatRow: row,
          seatNumber: num,
        });
      }
    }

    // Rows C, D, E: Standard (12 seats each)
    for (const row of ['C', 'D', 'E']) {
      for (let num = 1; num <= 12; num++) {
        seatsToCreate.push({
          showtimeId: showtime.id,
          seatCategoryId: standardCat.id,
          seatRow: row,
          seatNumber: num,
        });
      }
    }

    // Rows F, G: Economy (14 seats each)
    for (const row of ['F', 'G']) {
      for (let num = 1; num <= 14; num++) {
        seatsToCreate.push({
          showtimeId: showtime.id,
          seatCategoryId: economyCat.id,
          seatRow: row,
          seatNumber: num,
        });
      }
    }

    await prisma.seat.createMany({ data: seatsToCreate });
    console.log(`Created ${seatsToCreate.length} demo seats across 3 categories!`);
  } else {
    console.log(`Seats already seeded for this showtime (${existingSeatsCount} seats)`);
  }

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
