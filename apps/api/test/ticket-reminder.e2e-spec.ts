import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TicketReminderScheduler } from '../src/tickets/ticket-reminder.scheduler.js';
import { assertIntegrationDatabase } from './integration-database.js';

describe('S61 reminder pagination with real stores', () => {
  let module: TestingModule, db: PrismaService;
  let userId: string, eventId: string, showId: string, orderId: string;
  beforeAll(async () => {
    assertIntegrationDatabase();
    // Compile without init: exercise the real scheduler/outbox explicitly,
    // with no background timers racing this regression fixture.
    module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    db = module.get(PrismaService);
  });
  afterAll(async () => {
    if (orderId) {
      await db.ticket.deleteMany({ where: { orderId } });
      await db.order.deleteMany({ where: { id: orderId } });
    }
    if (showId) await db.showtime.deleteMany({ where: { id: showId } });
    if (eventId) await db.event.deleteMany({ where: { id: eventId } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    if (module) {
      await module.get('REDIS_CLIENT').quit();
      await module.close();
    }
  });
  it('queues the 101st changed ticket once after 100 unchanged tickets', async () => {
    userId = (
      await db.user.create({
        data: {
          email: `${randomUUID()}@reminder-fixture.invalid`,
          password: 'fixture-not-login',
          isEmailVerified: true,
        },
      })
    ).id;
    eventId = (
      await db.event.create({
        data: {
          organizerId: userId,
          name: 'S61 pagination fixture',
          description: 'Synthetic',
          location: 'Fixture hall',
        },
      })
    ).id;
    const start = new Date(Date.now() + 48 * 3600000);
    showId = (
      await db.showtime.create({
        data: { eventId, startTime: start, status: 'ON_SALE' },
      })
    ).id;
    orderId = (
      await db.order.create({
        data: {
          userId,
          showtimeId: showId,
          status: 'PAID',
          totalAmount: 0,
          paymentExpiresAt: new Date(Date.now() + 600000),
        },
      })
    ).id;
    const ids = Array.from({ length: 101 }, () => randomUUID()).sort((a, b) =>
      a.localeCompare(b),
    );
    await db.ticket.createMany({
      data: ids.map((id, index) => ({
        id,
        code: randomUUID(),
        orderId,
        showtimeId: showId,
        seatLabel: `Synthetic-${index}`,
        ticketType: 'Fixture',
        price: 0,
        remindedStartTime:
          index === 100 ? new Date(start.getTime() - 3600000) : start,
      })),
    });
    const scheduler = module.get(TicketReminderScheduler);
    await scheduler.sweepRescheduled();
    const jobs = await db.ticketMailDelivery.findMany({ where: { orderId } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].notification).toMatchObject({
      kind: 'RESCHEDULED',
      ticketId: ids[100],
      showtimeStart: start.toISOString(),
    });
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: ids[100] } }))
        .remindedStartTime,
    ).toEqual(start);
    await scheduler.sweepRescheduled();
    expect(await db.ticketMailDelivery.count({ where: { orderId } })).toBe(1);
    // Returning to an earlier advertised time is a new schedule change.
    for (const time of [new Date(start.getTime() + 3600000), start]) {
      await db.showtime.update({
        where: { id: showId },
        data: { startTime: time },
      });
      await scheduler.sweepRescheduled();
    }
    expect(
      await db.ticketMailDelivery.count({
        where: {
          orderId,
          notification: { path: ['ticketId'], equals: ids[100] },
        },
      }),
    ).toBe(3);
  });
});
