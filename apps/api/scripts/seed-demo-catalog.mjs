import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const root = realpathSync(resolve(import.meta.dirname, '../../..'));
const profilePath = resolve(root, '.sprint1-demo/config.json');
const config = JSON.parse(readFileSync(profilePath, 'utf8'));
const datasetPath = resolve(root, 'demo-data/catalog.source.json');
const dataset = JSON.parse(readFileSync(datasetPath, 'utf8'));
const profile = process.env.SPRINT1_DEMO_PROFILE;
let target;
try {
  target = new URL(process.env.DATABASE_URL ?? '');
} catch {
  throw new Error('Invalid demo database target.');
}

if (
  config.root !== root ||
  !/^s1demo-[a-f0-9]{12}$/.test(config.profile) ||
  profile !== config.profile ||
  process.env.NODE_ENV === 'production' ||
  target.hostname !== '127.0.0.1' ||
  target.port !== String(config.ports.postgres) ||
  target.pathname !== `/${config.database}` ||
  decodeURIComponent(target.username) !== config.user ||
  decodeURIComponent(target.password) !== config.dbPassword ||
  !Array.isArray(dataset.catalog) ||
  dataset.catalog.length !== 40
)
  throw new Error('Catalog bootstrap refused: exact owned demo profile required.');

const organizerAccount = config.accounts.find(
  (account) => account.name === 'organizer-a',
);
if (!organizerAccount?.email)
  throw new Error('Demo organizer fixture missing.');

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: target.toString() }),
});
let created = { events: 0, showtimes: 0, categories: 0, seats: 0 };
try {
  await db.$transaction(
    async (tx) => {
      const organizer = await tx.user.findUnique({
        where: { email: organizerAccount.email },
        select: { id: true },
      });
      if (!organizer) throw new Error('Demo organizer account not seeded.');

      for (const source of dataset.catalog) {
        const eventFields = {
          name: source.name,
          description: source.description,
          location: source.location,
          posterPath: source.posterPath,
          mobilePosterPath: source.mobilePosterPath,
          bannerPath: source.bannerPath,
          categoryLabel: source.categoryLabel,
          status: 'PUBLISHED',
          organizerId: organizer.id,
        };
        const existingEvent = await tx.event.findUnique({
          where: { id: source.id },
        });
        if (existingEvent) {
          for (const [key, value] of Object.entries(eventFields))
            if (existingEvent[key] !== value)
              throw new Error(`Existing demo event differs: ${source.id}/${key}`);
        } else {
          await tx.event.create({ data: { id: source.id, ...eventFields } });
          created.events += 1;
        }

        for (const sourceShow of source.showtimes) {
          const startTime = new Date(sourceShow.startTime);
          if (!Number.isFinite(startTime.getTime()))
            throw new Error(`Invalid source schedule: ${sourceShow.id}`);
          const existingShow = await tx.showtime.findUnique({
            where: { id: sourceShow.id },
          });
          const referenceFields = {
            eventId: source.id,
            startTime,
            status: 'DRAFT',
            isDemo: true,
            structureLocked: sourceShow.structureLocked,
            maxTicketsPerUser: sourceShow.maxTicketsPerUser,
            seatMapId: sourceShow.seatMapId,
          };
          if (existingShow) {
            if (
              existingShow.eventId !== referenceFields.eventId ||
              existingShow.startTime.getTime() !== startTime.getTime() ||
              existingShow.status !== referenceFields.status ||
              existingShow.isDemo !== referenceFields.isDemo ||
              existingShow.structureLocked !== referenceFields.structureLocked ||
              existingShow.maxTicketsPerUser !== referenceFields.maxTicketsPerUser ||
              existingShow.seatMapId !== referenceFields.seatMapId
            )
              throw new Error(`Existing demo reference schedule differs: ${sourceShow.id}`);
          } else {
            await tx.showtime.create({
              data: { id: sourceShow.id, ...referenceFields },
            });
            created.showtimes += 1;
          }

          const priorCategories = await tx.seatCategory.findMany({
            where: { showtimeId: sourceShow.id },
            orderBy: { name: 'asc' },
          });
          for (const sourceCategory of sourceShow.categories) {
            const old = priorCategories.find((item) => item.id === sourceCategory.id);
            if (old) {
              if (old.name !== sourceCategory.name || old.price !== sourceCategory.price)
                throw new Error(`Existing demo category differs: ${sourceCategory.id}`);
            } else {
              if (priorCategories.some((item) => item.name === sourceCategory.name))
                throw new Error(`Existing demo category uses another id: ${sourceCategory.name}`);
              const category = await tx.seatCategory.create({
                data: {
                  id: sourceCategory.id,
                  showtimeId: sourceShow.id,
                  name: sourceCategory.name,
                  price: sourceCategory.price,
                },
              });
              priorCategories.push(category);
              created.categories += 1;
            }
            const existingSeats = await tx.seat.findMany({
              where: { showtimeId: sourceShow.id, categoryId: sourceCategory.id },
              select: { row: true, seatNumber: true, isSold: true },
            });
            const existingCoordinates = new Set(
              existingSeats.map((seat) => `${seat.row}\u0000${seat.seatNumber}`),
            );
            const missingSeats = sourceCategory.seats.filter(
              (seat) => !existingCoordinates.has(`${seat.row}\u0000${seat.seatNumber}`),
            );
            if (missingSeats.length) {
              await tx.seat.createMany({
                data: missingSeats.map((seat) => ({
                  showtimeId: sourceShow.id,
                  categoryId: sourceCategory.id,
                  row: seat.row,
                  seatNumber: seat.seatNumber,
                  isSold: false,
                })),
              });
              created.seats += missingSeats.length;
            }
            if (existingSeats.some((seat) => seat.isSold))
              throw new Error(`Demo source seat inventory unexpectedly sold: ${sourceShow.id}`);
            if (existingCoordinates.size > sourceCategory.seats.length)
              throw new Error(`Existing demo seat inventory differs: ${sourceShow.id}`);
          }
          const expectedSeats = sourceShow.categories.reduce(
            (sum, category) => sum + category.seats.length,
            0,
          );
          const actualSeats = await tx.seat.count({
            where: { showtimeId: sourceShow.id },
          });
          if (actualSeats !== expectedSeats)
            throw new Error(`Demo reference seat count mismatch: ${sourceShow.id}`);
        }
      }
    },
    { timeout: 120000 },
  );
  console.log(
    JSON.stringify({
      importedEvents: created.events,
      importedReferenceShowtimes: created.showtimes,
      importedCategories: created.categories,
      importedSeats: created.seats,
      policy: 'Original event content and start times retained; all source schedules are DRAFT reference-only, isDemo=true; no orders, users, payments, tickets, or sold-seat state imported.',
      idempotent: true,
    }),
  );
} finally {
  await db.$disconnect();
}
