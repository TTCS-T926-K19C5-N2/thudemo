import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'argon2';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const target = new URL(process.env.DATABASE_URL ?? '');
assert(
  target.hostname === '127.0.0.1' &&
    target.port === '15432' &&
    target.pathname === '/stitch_fidelity',
  'Fidelity local fixtures only',
);
const root = resolve(import.meta.dirname, '../../..');
const run = process.argv[3] ?? 'holds/20261004';
assert(['holds/20261004', 'stitch-official/20261004'].includes(run));
const path = resolve(
  root,
  run === 'holds/20261004'
    ? '.git/hold-browser-fixture.json'
    : `.git/hold-browser-fixture-${run.replaceAll('/', '-')}.json`,
);
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: target.href }),
});
const showtimeId = 'c0100401-0000-4000-8000-000000000001';
try {
  if (process.argv[2] === 'prepare') {
    assert(
      process.env.SPRINT2_DEMO_PASSWORD?.length >= 12,
      'Fake local password required',
    );
    const show = await db.showtime.findUniqueOrThrow({
      where: { id: showtimeId },
      include: { event: { include: { organizer: true } } },
    });
    assert(
      show.event.organizer.email === 'design-organizer@example.invalid' &&
        show.status === 'ON_SALE',
    );
    const role = await db.role.findUniqueOrThrow({ where: { name: 'BUYER' } });
    const email = `hold-competitor-${randomUUID()}@example.invalid`;
    const user = await db.user.create({
      data: {
        email,
        password: await hash(process.env.SPRINT2_DEMO_PASSWORD),
        isEmailVerified: true,
        userRoles: { create: { roleId: role.id } },
      },
    });
    writeFileSync(
      path,
      JSON.stringify({ showtimeId, competitorId: user.id, email }),
    );
    console.log(
      'Synthetic competing buyer created; private fixture descriptor in .git',
    );
  } else if (['expire', 'near-expiry'].includes(process.argv[2])) {
    const ids = JSON.parse(
      readFileSync(
        resolve(root, `evidence/${run}/hold-browser-state.json`),
        'utf8',
      ),
    ).holdIds;
    assert(Array.isArray(ids) && ids.length > 0);
    const sessions = await db.holdSession.findMany({
      where: { id: { in: ids }, showtimeId },
      include: { user: true },
    });
    assert(
      sessions.length === ids.length &&
        sessions.every((s) => s.user.email === 'design-buyer@example.invalid'),
    );
    // Explicit test fixture seam; never shortens the production 600000 ms TTL.
    const deadline = new Date(
      Date.now() + (process.argv[2] === 'near-expiry' ? 10000 : -1000),
    );
    await db.holdSession.updateMany({
      where: { id: { in: ids }, showtimeId },
      data: { expiresAt: deadline },
    });
    await db.seatHold.updateMany({
      where: { holdSessionId: { in: ids }, showtimeId },
      data: { expiresAt: deadline },
    });
    console.log(
      'Only browser-run synthetic rights expired; rows retained for query-without-job proof',
    );
  } else if (process.argv[2] === 'cleanup') {
    const f = JSON.parse(readFileSync(path, 'utf8'));
    const ids = JSON.parse(
      readFileSync(
        resolve(root, `evidence/${run}/hold-browser-state.json`),
        'utf8',
      ),
    ).holdIds;
    await db.seatHold.deleteMany({
      where: {
        holdSession: {
          OR: [{ id: { in: ids } }, { userId: f.competitorId }],
          showtimeId,
        },
      },
    });
    await db.holdSession.deleteMany({
      where: {
        OR: [{ id: { in: ids } }, { userId: f.competitorId }],
        showtimeId,
      },
    });
    await db.user.delete({ where: { id: f.competitorId } });
    console.log('Only this browser run fixtures cleaned');
  } else throw Error('Mode prepare/expire/cleanup required');
} finally {
  await db.$disconnect();
}
