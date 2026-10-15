import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient, type OrderStatus } from '@prisma/client';
import * as argon2 from 'argon2';

export const ORDER_HISTORY_TEST_PASSWORD = 'S32-local-only-Password123!';
export type HistoryAccount = { id: string; email: string; cookie: string };
export type HistoryFixture = {
  accounts: {
    a: HistoryAccount;
    b: HistoryAccount;
    empty: HistoryAccount;
    admin: HistoryAccount;
    organizer: HistoryAccount;
  };
  eventId: string;
  orders: {
    id: string;
    userId: string;
    status: OrderStatus;
    createdAt: Date;
    showtimeId: string;
    categoryId: string;
    holdId: string;
  }[];
};

export function assertOrderHistoryTestDatabase() {
  const target = new URL(process.env.DATABASE_URL ?? '');
  if (
    process.env.S32_ISOLATED_TEST !== 'true' ||
    target.hostname !== '127.0.0.1' ||
    (target.port !== '15432' &&
      (target.port !== '15434' || process.env.S32_ISOLATED_TEST !== 'true')) ||
    target.pathname !== '/sprint2_integration' ||
    process.env.HOLD_EXPIRY_MODE !== 'off'
  )
    throw Error(
      'S-32 fixtures require the explicitly isolated database and disabled worker.',
    );
}

export async function seedOrderHistory(
  db: PrismaClient,
): Promise<HistoryFixture> {
  assertOrderHistoryTestDatabase();
  const password = await argon2.hash(ORDER_HISTORY_TEST_PASSWORD);
  async function account(
    name: string,
    roleName: string,
  ): Promise<HistoryAccount> {
    const role = await db.role.upsert({
      where: { name: roleName },
      create: { name: roleName },
      update: {},
    });
    const email = `${name}-${randomUUID()}@orders.example.invalid`;
    const user = await db.user.create({
      data: {
        email,
        password,
        isEmailVerified: true,
        userRoles: { create: { roleId: role.id } },
      },
    });
    const token = randomBytes(32).toString('base64url');
    await db.session.create({
      data: {
        userId: user.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    return { id: user.id, email, cookie: `event_session=${token}` };
  }
  const accounts = {
    a: await account('buyer-a', 'BUYER'),
    b: await account('buyer-b', 'BUYER'),
    empty: await account('buyer-empty', 'BUYER'),
    admin: await account('admin', 'ADMIN'),
    organizer: await account('organizer', 'ORGANIZER'),
  };
  const event = await db.event.create({
    data: {
      name: 'Hòa nhạc mùa thu',
      description: 'Dữ liệu kiểm thử riêng',
      location: 'Nhà hát Thành phố',
      organizerId: accounts.organizer.id,
    },
  });
  const orders: HistoryFixture['orders'] = [];
  const statuses: OrderStatus[] = [
    'PENDING_PAYMENT',
    'PAID',
    'CANCELLED',
    'EXPIRED',
    'PENDING_PAYMENT',
  ];
  for (let index = 0; index < 17; index++) {
    const buyer = index < 14 ? accounts.a : accounts.b;
    const status =
      index === 5
        ? 'PENDING'
        : index === 6
          ? 'NEEDS_REVIEW'
          : statuses[index % statuses.length];
    const show = await db.showtime.create({
      data: {
        eventId: event.id,
        startTime: new Date(Date.now() + 86400000 + index * 3600000),
        status: 'ON_SALE',
      },
    });
    const category = await db.seatCategory.create({
      data: { showtimeId: show.id, name: 'Tiêu chuẩn', price: 250000 },
    });
    const seats = await db.seat.createManyAndReturn({
      data: [1, 2].map((seatNumber) => ({
        showtimeId: show.id,
        categoryId: category.id,
        row: 'A',
        seatNumber,
      })),
    });
    const expiresAt = new Date(
      Date.now() +
        (index % 5 === 4 || status === 'EXPIRED' ? -60000 : 86400000),
    );
    const hold = await db.holdSession.create({
      data: {
        showtimeId: show.id,
        userId: buyer.id,
        sessionHash: `test-${randomUUID()}`,
        token: randomUUID(),
        expectedSeatIds: seats.map((seat) => seat.id),
        expiresAt,
      },
    });
    await db.seatHold.createMany({
      data: seats.map((seat) => ({
        seatId: seat.id,
        showtimeId: show.id,
        holdSessionId: hold.id,
        token: hold.token,
        expiresAt,
      })),
    });
    // Two adjacent orders have identical timestamps, independent of insertion order.
    const createdAt = new Date(Date.now() - Math.floor(index / 2) * 3600000);
    if (index % 2 === 1)
      createdAt.setTime(orders[index - 1].createdAt.getTime());
    const order = await db.order.create({
      data: {
        userId: buyer.id,
        showtimeId: show.id,
        holdSessionId: hold.id,
        holdToken: hold.token,
        paymentExpiresAt: expiresAt,
        totalAmount: 500000,
        status,
        createdAt,
        items: {
          create: seats.map((seat) => ({
            seatId: seat.id,
            categoryName: 'Tiêu chuẩn',
            unitPrice: 250000,
          })),
        },
      },
    });
    orders.push({
      id: order.id,
      userId: buyer.id,
      status,
      createdAt,
      showtimeId: show.id,
      categoryId: category.id,
      holdId: hold.id,
    });
  }
  return { accounts, eventId: event.id, orders };
}

export async function cleanupOrderHistory(
  db: PrismaClient,
  fixture: HistoryFixture,
) {
  assertOrderHistoryTestDatabase();
  const userIds = Object.values(fixture.accounts).map((account) => account.id);
  await db.orderItem.deleteMany({
    where: { order: { userId: { in: userIds } } },
  });
  await db.order.deleteMany({ where: { userId: { in: userIds } } });
  const shows = (
    await db.showtime.findMany({
      where: { eventId: fixture.eventId },
      select: { id: true },
    })
  ).map((show) => show.id);
  await db.seatHold.deleteMany({ where: { showtimeId: { in: shows } } });
  await db.holdSession.deleteMany({ where: { showtimeId: { in: shows } } });
  await db.seat.deleteMany({ where: { showtimeId: { in: shows } } });
  await db.seatCategory.deleteMany({ where: { showtimeId: { in: shows } } });
  await db.showtime.deleteMany({ where: { id: { in: shows } } });
  await db.event.delete({ where: { id: fixture.eventId } });
  await db.session.deleteMany({ where: { userId: { in: userIds } } });
  await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
}
