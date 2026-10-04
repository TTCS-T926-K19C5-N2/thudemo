// Synthetic, fixed-ID data for visual verification. Never targets an existing user database.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as argon2 from 'argon2';
const url = new URL(process.env.DATABASE_URL ?? '');
if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '15432' ||
  url.pathname !== '/stitch_fidelity'
)
  throw new Error('Requires the isolated stitch_fidelity database');
const password = process.env.SPRINT2_DEMO_PASSWORD;
if (!password || password.length < 12)
  throw new Error('Requires a local-only synthetic account password');
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }),
});
const fixture = JSON.parse(
  readFileSync(resolve('../../fixtures/design-events.json'), 'utf8'),
);
try {
  for (const name of ['ORGANIZER', 'BUYER']) {
    const role = await db.role.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    const email = `design-${name.toLowerCase()}@example.invalid`;
    const user = await db.user.upsert({
      where: { email },
      create: {
        email,
        password: await argon2.hash(password),
        isEmailVerified: true,
      },
      update: { password: await argon2.hash(password), isEmailVerified: true },
    });
    await db.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    });
  }
  const owner = await db.user.findUniqueOrThrow({
    where: { email: 'design-organizer@example.invalid' },
  });
  for (const event of fixture.events) {
    const existing = await db.event.findUnique({
      where: { id: event.eventId },
    });
    if (existing && existing.organizerId !== owner.id)
      throw new Error('Fixture ownership mismatch');
    const data = {
      name: event.name,
      description: event.description,
      location: event.location,
      posterPath: event.posterPath,
      mobilePosterPath: event.mobilePosterPath,
      bannerPath: event.bannerPath,
      categoryLabel: event.categoryLabel,
    };
    await db.event.upsert({
      where: { id: event.eventId },
      create: { ...data, id: event.eventId, organizerId: owner.id },
      update: data,
    });
    const show = await db.showtime.upsert({
      where: { id: event.showtimeId },
      create: {
        id: event.showtimeId,
        eventId: event.eventId,
        startTime: new Date(event.startTime),
      },
      update: {},
    });
    if (show.eventId !== event.eventId)
      throw new Error('Fixture showtime mismatch');
    if (!(await db.seat.count({ where: { showtimeId: show.id } }))) {
      await db.$transaction(async (tx) => {
        const categories = event.categories.map((c) => ({
          ...c,
          id: randomUUID(),
          showtimeId: show.id,
        }));
        await tx.seatCategory.createMany({ data: categories });
        const seats = Array.from({ length: 2000 }, (_, i) => ({
          id: randomUUID(),
          showtimeId: show.id,
          row: `R${String(Math.floor(i / 50)).padStart(2, '0')}`,
          seatNumber: (i % 50) + 1,
          categoryId:
            categories[
              Math.min(
                categories.length - 1,
                Math.floor(i / (2000 / categories.length)),
              )
            ].id,
        }));
        await tx.seat.createMany({ data: seats });
        await tx.showtime.update({
          where: { id: show.id },
          data: {
            status: 'ON_SALE',
            structureLocked: true,
            seatMapId: 'managed-json',
          },
        });
      });
    }
  }
  await db.catalogRevision.update({
    where: { id: 1 },
    data: { version: { increment: 1 } },
  });
  writeFileSync(
    resolve('../../evidence/stitch-correction/20261004/dataset.json'),
    JSON.stringify(
      {
        synthetic: true,
        database: 'stitch_fidelity',
        eventIds: fixture.events.map((e) => e.eventId),
        showtimeIds: fixture.events.map((e) => e.showtimeId),
        accounts: [
          'design-organizer@example.invalid',
          'design-buyer@example.invalid',
        ],
        rows: 6,
        seatsPerShow: 2000,
      },
      null,
      2,
    ),
  );
  console.log(
    'Isolated six-event visual dataset ready; no existing user records changed.',
  );
} finally {
  await db.$disconnect();
}
