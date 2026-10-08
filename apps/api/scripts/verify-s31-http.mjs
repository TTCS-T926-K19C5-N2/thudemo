// Real product HTTP through two independent Nest processes. Fixtures never reset a shared database.
import assert from 'node:assert/strict';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '../dist/prisma/prisma.service.js';

const target = new URL(process.env.DATABASE_URL ?? '');
assert(
  target.hostname === '127.0.0.1' &&
    target.port === '15438' &&
    target.pathname === '/s31_admission_integration',
  'S-31 private database only',
);
assert(
  process.env.REDIS_URL === 'redis://127.0.0.1:16386',
  'S-31 private cache only',
);
const root = resolve(import.meta.dirname, '../../..');
const evidence = resolve(root, 'evidence/s31');
mkdirSync(evidence, { recursive: true });
const db = new PrismaService(new ConfigService({ DATABASE_URL: target.href }));
const report = {
  local: !process.env.CI,
  ci: Boolean(process.env.CI),
  staging: false,
  camera: false,
  sourceSha: process.env.S31_SOURCE_SHA ?? 'working-tree',
  instances: 2,
  processIds: [],
  checks: [],
  races: [],
  startedAt: new Date().toISOString(),
  signature: 'NOT VERIFIED: S-30 uses unsigned ticket UUID',
};
const children = [];
const fds = [];
const timings = [];
function start(port) {
  const fd = openSync(resolve(evidence, `api-${port}.log`), 'w');
  fds.push(fd);
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: resolve(root, 'apps/api'),
    windowsHide: true,
    stdio: ['ignore', fd, fd],
    env: {
      ...process.env,
      PORT: String(port),
      HOLD_EXPIRY_MODE: 'off',
      NODE_ENV: 'test',
      WEB_ORIGIN: 'http://localhost:3040',
      PAYMENT_GATEWAY: '',
      PAYMENT_WEBHOOK_SECRET: '',
    },
  });
  children.push(child);
  report.processIds.push(child.pid);
  return child;
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill();
  await exited;
}
async function ready(port) {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {}
    await new Promise((done) => setTimeout(done, 250));
  }
  throw Error(`API ${port} unavailable; inspect local log`);
}
function check(value, label) {
  assert(value, label);
  report.checks.push(label);
}
async function account(role, name) {
  await db.role.createMany({ data: [{ name: role }], skipDuplicates: true });
  const r = await db.role.findUniqueOrThrow({ where: { name: role } });
  const user = await db.user.create({
    data: {
      email: `${randomUUID()}@s31-fixture.test`,
      password: 'fixture-not-login',
      isEmailVerified: true,
      userRoles: { create: { roleId: r.id } },
    },
  });
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await db.session.create({
    data: {
      tokenHash,
      userId: user.id,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  return { id: user.id, name, cookie: `event_session=${token}`, tokenHash };
}
let fixture;
let seatNumber = 0;
async function ticket(status = 'PAID') {
  const seat = await db.seat.create({
    data: {
      showtimeId: fixture.showtimeId,
      categoryId: fixture.categoryId,
      row: 'A',
      seatNumber: ++seatNumber,
    },
  });
  const order = await db.order.create({
    data: {
      userId: fixture.buyer.id,
      eventId: fixture.eventId,
      showtimeId: fixture.showtimeId,
      status,
      totalAmount: 200000,
      paymentExpiresAt: new Date(Date.now() + 600000),
      items: {
        create: {
          seatId: seat.id,
          categoryName: 'Hạng thường',
          unitPrice: 200000,
        },
      },
    },
    include: { items: true },
  });
  return order.items[0].id;
}
async function send(ticketId, actor, gateId, options = {}) {
  const port = options.port ?? 3041;
  const startAt = performance.now();
  const res = await fetch(
    `http://127.0.0.1:${port}/showtimes/${options.showtimeId ?? fixture.showtimeId}/check-in${options.exception ? '/exception' : ''}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: actor?.cookie ?? '',
        Origin: 'http://localhost:3040',
      },
      body: JSON.stringify({
        ticketId,
        gateId,
        requestId: options.requestId ?? randomUUID(),
        ...(options.exception
          ? {
              reason:
                options.reason ?? 'Khách đã được nhân viên xác nhận là chủ vé',
              ownerConfirmed: options.ownerConfirmed ?? true,
            }
          : {}),
        ...options.extra,
      }),
    },
  );
  timings.push(performance.now() - startAt);
  return { status: res.status, body: await res.json() };
}
const count = (ticketId, kind) =>
  db.ticketAdmission.count({ where: { ticketId, ...(kind ? { kind } : {}) } });
try {
  await db.$connect();
  const a = await account('STAFF', 'Nhân viên cửa A');
  const b = await account('STAFF', 'Nhân viên cửa B');
  const denied = await account('ADMIN', 'Quản trị chưa được phân công');
  const buyer = await account('BUYER', 'Khách thử nghiệm');
  const organizer = await account('ORGANIZER', 'Ban tổ chức');
  const event = await db.event.create({
    data: {
      organizerId: organizer.id,
      name: 'Suất kiểm thử S-31',
      description: 'Private local fixture',
      location: 'Nhà hát thử nghiệm',
      status: 'PUBLISHED',
    },
  });
  const showtime = await db.showtime.create({
    data: {
      eventId: event.id,
      startTime: new Date('2026-12-25T12:00:00Z'),
      status: 'ON_SALE',
    },
  });
  const otherShowtime = await db.showtime.create({
    data: {
      eventId: event.id,
      startTime: new Date('2026-12-26T12:00:00Z'),
      status: 'ON_SALE',
    },
  });
  const category = await db.seatCategory.create({
    data: { showtimeId: showtime.id, name: 'Hạng thường', price: 200000 },
  });
  const gateA = await db.checkInGate.create({
    data: { showtimeId: showtime.id, name: 'A' },
  });
  const gateB = await db.checkInGate.create({
    data: { showtimeId: showtime.id, name: 'B' },
  });
  const otherGate = await db.checkInGate.create({
    data: { showtimeId: otherShowtime.id, name: 'C' },
  });
  await db.checkInPermission.createMany({
    data: [
      { userId: a.id, gateId: gateA.id, staffName: a.name },
      { userId: b.id, gateId: gateB.id, staffName: b.name, canOverride: true },
      { userId: b.id, gateId: otherGate.id, staffName: b.name },
    ],
  });
  fixture = {
    a,
    b,
    denied,
    buyer,
    eventId: event.id,
    showtimeId: showtime.id,
    categoryId: category.id,
    gateA: gateA.id,
    gateB: gateB.id,
    otherShowtimeId: otherShowtime.id,
  };
  let apiA = start(3041);
  start(3042);
  await Promise.all([ready(3041), ready(3042)]);
  const firstTicket = await ticket();
  const requestId = randomUUID();
  const first = await send(firstTicket, a, gateA.id, { requestId });
  check(
    first.status === 200 && first.body.status === 'SUCCESS',
    'First admission succeeds only after commit',
  );
  const stored = await db.ticketAdmission.findFirstOrThrow({
    where: { ticketId: firstTicket, kind: 'NORMAL' },
  });
  const state = await db.orderItem.findUniqueOrThrow({
    where: { id: firstTicket },
  });
  check(
    stored.staffId === a.id &&
      stored.staffName === a.name &&
      stored.gateId === gateA.id &&
      stored.enteredAt.toISOString() === first.body.checkedInAt &&
      state.checkedInAt.toISOString() === first.body.checkedInAt,
    'Database staff/gate/time snapshot matches response and ticket state',
  );
  // Concrete 19:02 AC fixture is seeded as historical committed data, never a browser-supplied time.
  const historicalTime = new Date('2026-12-25T12:02:00Z');
  await db.$transaction([
    db.ticketAdmission.update({
      where: { id: stored.id },
      data: { enteredAt: historicalTime },
    }),
    db.orderItem.update({
      where: { id: firstTicket },
      data: { checkedInAt: historicalTime },
    }),
  ]);
  const duplicate = await send(firstTicket, b, gateB.id, { port: 3042 });
  check(
    duplicate.status === 409 &&
      duplicate.body.code === 'TICKET_ALREADY_CHECKED_IN' &&
      duplicate.body.firstAdmission.checkedInAt ===
        historicalTime.toISOString() &&
      duplicate.body.firstAdmission.gateName === 'A' &&
      (await count(firstTicket)) === 1,
    'AC1: gate B rejects with first 19:02/gate A, no extra entry',
  );
  const replay = await send(firstTicket, a, gateA.id, { requestId });
  check(
    replay.status === 200 &&
      replay.body.status === 'ALREADY_RECORDED' &&
      (await count(firstTicket)) === 1,
    'Scan retry returns recorded result, never a new admission',
  );
  const unauthorized = await send(firstTicket, denied, gateB.id);
  check(
    unauthorized.status === 403 && !unauthorized.body.firstAdmission,
    'ADMIN without explicit assignment denied before ticket metadata',
  );
  const wrongGate = await send(firstTicket, a, gateB.id);
  check(
    wrongGate.status === 403 && !wrongGate.body.firstAdmission,
    'Staff at a different unassigned gate sees no ticket metadata',
  );
  check(
    (await send(firstTicket, null, gateA.id)).status === 401,
    'No session cannot scan',
  );
  for (let round = 0; round < 50; round++) {
    const id = await ticket();
    const results = await Promise.all([
      send(id, a, gateA.id),
      send(id, b, gateB.id, { port: 3042 }),
    ]);
    assert.deepEqual(results.map((x) => x.status).sort(), [200, 409]);
    const entries = await db.ticketAdmission.findMany({
      where: { ticketId: id },
    });
    const ticketState = await db.orderItem.findUniqueOrThrow({ where: { id } });
    assert(
      entries.length === 1 &&
        entries[0].kind === 'NORMAL' &&
        ticketState.checkedInAt.toISOString() ===
          entries[0].enteredAt.toISOString(),
    );
    report.races.push({
      round: round + 1,
      statuses: results.map((x) => x.status),
      admissionCount: entries.length,
    });
  }
  check(
    true,
    'AC2: 50 races across two API OS processes/sessions/gates, exactly one committed normal admission each',
  );
  const sameActionTicket = await ticket();
  const sameKey = randomUUID();
  const same = await Promise.all([
    send(sameActionTicket, a, gateA.id, { requestId: sameKey }),
    send(sameActionTicket, a, gateA.id, { port: 3042, requestId: sameKey }),
  ]);
  check(
    same.every((x) => x.status === 200) &&
      same
        .map((x) => x.body.status)
        .sort()
        .join() === 'ALREADY_RECORDED,SUCCESS' &&
      (await count(sameActionTicket)) === 1,
    'Simultaneous same scan request inserts once',
  );
  const malformed = await send('tampered-signature.payload', a, gateA.id);
  const unpaid = await ticket('PENDING_PAYMENT');
  const cancelled = await ticket('CANCELLED');
  check(
    malformed.status === 400 &&
      (await send(randomUUID(), a, gateA.id)).status === 404 &&
      (await send(unpaid, a, gateA.id)).status === 404 &&
      (await send(cancelled, a, gateA.id)).status === 404 &&
      (await count(unpaid)) === 0 &&
      (await count(cancelled)) === 0,
    'Malformed QR/unknown/unpaid/cancelled tickets never enter; cryptographic signature remains unverified',
  );
  check(
    (await send(firstTicket, b, otherGate.id, { showtimeId: otherShowtime.id }))
      .status === 404,
    'Assigned gate in wrong showtime rejects ticket',
  );
  const noReason = await send(firstTicket, b, gateB.id, {
    exception: true,
    reason: ' \t\n ',
  });
  const noConfirmation = await send(firstTicket, b, gateB.id, {
    exception: true,
    ownerConfirmed: false,
  });
  check(
    noReason.status === 400 &&
      noConfirmation.status === 400 &&
      (
        await send(firstTicket, b, gateB.id, {
          exception: true,
          reason: 'x'.repeat(501),
        })
      ).status === 400,
    'Exception requires nonblank bounded reason and explicit owner attestation',
  );
  check(
    (await send(firstTicket, a, gateA.id, { exception: true })).status ===
      403 &&
      (await send(firstTicket, denied, gateB.id, { exception: true }))
        .status === 403,
    'STAFF/ADMIN roles never imply exception permission',
  );
  check(
    (
      await send(firstTicket, b, gateB.id, {
        exception: true,
        extra: { staffId: a.id },
      })
    ).status === 400 &&
      (
        await send(firstTicket, a, gateA.id, {
          extra: { enteredAt: historicalTime.toISOString() },
        })
      ).status === 400,
    'Client identity/time injection rejected',
  );
  check(
    (await send(cancelled, b, gateB.id, { exception: true })).status === 404 &&
      (await send(await ticket(), b, gateB.id, { exception: true })).status ===
        409,
    'Exception cannot bypass eligibility or absent first admission',
  );
  const exceptionKey = randomUUID();
  const reason = 'Đã xác nhận chủ vé; khách ra ngoài để nhận cuộc gọi';
  const exceptions = await Promise.all([
    send(firstTicket, b, gateB.id, {
      exception: true,
      requestId: exceptionKey,
      reason,
    }),
    send(firstTicket, b, gateB.id, {
      port: 3042,
      exception: true,
      requestId: exceptionKey,
      reason,
    }),
  ]);
  check(
    exceptions.every((x) => x.status === 200) &&
      exceptions
        .map((x) => x.body.status)
        .sort()
        .join() === 'ALREADY_RECORDED,EXCEPTION_RECORDED' &&
      (await count(firstTicket, 'EXCEPTION')) === 1,
    'AC3: simultaneous exception retry records exactly one additional admission',
  );
  const override = await db.ticketAdmission.findFirstOrThrow({
    where: { ticketId: firstTicket, kind: 'EXCEPTION' },
  });
  check(
    override.reason === reason &&
      override.staffId === b.id &&
      override.staffName === b.name &&
      override.gateId === gateB.id &&
      override.ownerConfirmed &&
      Math.abs(Date.now() - override.enteredAt.getTime()) < 60000,
    'AC3: trusted staff name/current gate/reason/DB time retained',
  );
  // Future-dated historical fixture is used for 19:02 text; enteredAt is verified against server clock instead of chronological fixture ordering.
  const afterOverride = await send(firstTicket, a, gateA.id);
  check(
    afterOverride.status === 409 &&
      afterOverride.body.firstAdmission.checkedInAt ===
        historicalTime.toISOString() &&
      afterOverride.body.firstAdmission.gateName === 'A' &&
      (await count(firstTicket)) === 2,
    'Normal scan after exception still denied with unchanged first admission',
  );
  check(
    (
      await send(firstTicket, b, gateB.id, {
        exception: true,
        requestId: exceptionKey,
        reason: 'Khác lý do',
      })
    ).status === 409,
    'Reusing request ID with different action is a conflict',
  );
  await stop(apiA);
  apiA = start(3041);
  await ready(3041);
  check(
    (await send(firstTicket, a, gateA.id)).status === 409,
    'Restarted API cannot reuse consumed ticket',
  );
  const rollbackTicket = await ticket();
  await db.$executeRawUnsafe(
    `CREATE FUNCTION s31_fail_fixture_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${rollbackTicket}'::uuid THEN RAISE EXCEPTION 'S31 rollback fixture'; END IF; RETURN NEW; END $$`,
  );
  await db.$executeRawUnsafe(
    'CREATE TRIGGER s31_fixture_rollback BEFORE UPDATE ON order_items FOR EACH ROW EXECUTE FUNCTION s31_fail_fixture_update()',
  );
  try {
    check(
      (await send(rollbackTicket, a, gateA.id)).status === 500 &&
        (await count(rollbackTicket)) === 0 &&
        (
          await db.orderItem.findUniqueOrThrow({
            where: { id: rollbackTicket },
          })
        ).checkedInAt === null,
      'Injected failure after ledger insertion rolls back both ledger and ticket state',
    );
  } finally {
    await db.$executeRawUnsafe(
      'DROP TRIGGER s31_fixture_rollback ON order_items',
    );
    await db.$executeRawUnsafe('DROP FUNCTION s31_fail_fixture_update()');
  }
  check(
    (await send(rollbackTicket, a, gateA.id)).status === 200,
    'Ticket remains usable after rollback',
  );
  const firstRow = await db.ticketAdmission.findFirstOrThrow({
    where: { ticketId: firstTicket, kind: 'NORMAL' },
  });
  let uniqueRejected = false;
  try {
    await db.ticketAdmission.create({
      data: { ...firstRow, id: randomUUID(), requestId: randomUUID() },
    });
  } catch {
    uniqueRejected = true;
  }
  check(
    uniqueRejected && (await count(firstTicket, 'NORMAL')) === 1,
    'Database partial unique rejects duplicate normal insert even outside API',
  );
  const legacyTicket = await ticket();
  await db.orderItem.update({
    where: { id: legacyTicket },
    data: { checkedInAt: historicalTime },
  });
  const legacy = await send(legacyTicket, b, gateB.id);
  check(
    legacy.status === 409 &&
      legacy.body.canOverride === false &&
      legacy.body.firstAdmission.gateName.includes('Chưa lưu') &&
      (await count(legacyTicket)) === 0,
    'Legacy S-30 used tickets stay denied; unknown historic gate is not fabricated',
  );
  let compensationDenied = false;
  const compensation = readFileSync(
    resolve(root, 'apps/api/prisma/verification/s31-compensate-empty.sql'),
    'utf8',
  );
  const guard = compensation.match(/DO \$\$[\s\S]*?END \$\$;/)?.[0];
  assert(guard, 'Compensation guard must exist');
  try {
    await db.$executeRawUnsafe(guard);
  } catch (error) {
    compensationDenied = error.message.includes('S31 compensation refused');
  }
  check(
    compensationDenied && (await count(firstTicket)) === 2,
    'Compensation refuses populated history; application-only rollback preserves entries',
  );
  const expired = await account('STAFF', 'Phiên hết hạn');
  await db.checkInPermission.create({
    data: { userId: expired.id, gateId: gateA.id, staffName: expired.name },
  });
  await db.session.update({
    where: { tokenHash: expired.tokenHash },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  const expiredScan = await send(firstTicket, expired, gateA.id);
  check(
    expiredScan.status === 401 && !expiredScan.body.firstAdmission,
    'Expired session denied before ticket metadata',
  );
  const normalUppercase = await send(
    firstTicket.toUpperCase(),
    a,
    gateA.id.toUpperCase(),
    { requestId: requestId.toUpperCase() },
  );
  check(
    normalUppercase.status === 200 &&
      normalUppercase.body.status === 'ALREADY_RECORDED' &&
      (await count(firstTicket)) === 2,
    'UUID case normalization preserves request replay fingerprint',
  );
  check(
    (await send(firstTicket, buyer, gateA.id)).status === 403,
    'BUYER role cannot use scanner endpoint',
  );
  await db.checkInPermission.update({
    where: { userId_gateId: { userId: b.id, gateId: gateB.id } },
    data: { canOverride: false },
  });
  check(
    (await send(firstTicket, b, gateB.id, { exception: true })).status === 403,
    'Revoked exception capability rejected on next request',
  );
  await db.checkInPermission.update({
    where: { userId_gateId: { userId: b.id, gateId: gateB.id } },
    data: { canOverride: true },
  });
  report.responseMs = {
    count: timings.length,
    p95: [...timings].sort((a, b) => a - b)[
      Math.ceil(timings.length * 0.95) - 1
    ],
    max: Math.max(...timings),
  };
  fixture.browserTicket = firstTicket;
  fixture.freshTicket = await ticket();
  if (process.env.S31_PRIVATE_FIXTURE_FILE)
    writeFileSync(
      process.env.S31_PRIVATE_FIXTURE_FILE,
      JSON.stringify(fixture),
      { mode: 0o600 },
    );
  report.status = 'PASS';
  report.finishedAt = new Date().toISOString();
} catch (error) {
  report.status = 'FAIL';
  report.error = error.message;
  throw error;
} finally {
  writeFileSync(
    resolve(evidence, 'http-proof.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  if (process.env.S31_KEEP_APIS !== '1') await Promise.all(children.map(stop));
  for (const fd of fds) closeSync(fd);
  await db.$disconnect();
}
console.log(
  JSON.stringify({
    status: report.status,
    checks: report.checks.length,
    races: report.races.length,
    instances: report.instances,
    responseMs: report.responseMs,
  }),
);
