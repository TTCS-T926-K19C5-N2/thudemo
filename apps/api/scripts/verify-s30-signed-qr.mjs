import assert from 'node:assert/strict';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { ScannerCryptoService } from '../dist/scanner/scanner-crypto.service.js';
import {
  randomBytes,
  randomUUID,
  createHash,
  createPrivateKey,
  sign,
  generateKeyPairSync,
} from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, relative, isAbsolute, sep } from 'node:path';
const target = new URL(process.env.DATABASE_URL ?? '');
assert(
  target.hostname === '127.0.0.1' &&
    target.port === '15440' &&
    target.pathname === '/signed_qr_integration',
  'Dedicated QR database only',
);
assert(
  process.env.REDIS_PORT === '16388' && process.env.REDIS_HOST === '127.0.0.1',
  'Dedicated QR Redis only',
);
const root = resolve(import.meta.dirname, '../../..');
const evidence = resolve(root, 'evidence/s30');
mkdirSync(evidence, { recursive: true });
const keyDir = process.env.QR_FIXTURE_KEY_DIR
  ? resolve(process.env.QR_FIXTURE_KEY_DIR)
  : mkdtempSync(resolve(tmpdir(), 'thudemo-qr-fixture-'));
const rel = relative(root, keyDir);
assert(
  rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel),
  'Fixture keys outside repository',
);
mkdirSync(keyDir, { recursive: true, mode: 0o700 });
const keys = {};
for (const kid of ['fixture-k1', 'fixture-k2']) {
  const privatePath = resolve(keyDir, kid + '.private.pem'),
    publicPath = resolve(keyDir, kid + '.public.pem');
  if (!existsSync(privatePath)) {
    const pair = generateKeyPairSync('ed25519');
    writeFileSync(
      privatePath,
      pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
      { mode: 0o600, flag: 'wx' },
    );
    writeFileSync(
      publicPath,
      pair.publicKey.export({ type: 'spki', format: 'pem' }),
      { flag: 'wx' },
    );
  }
  keys[kid] = { privatePath, public: readFileSync(publicPath, 'utf8') };
}
const cfg = (
  kid = 'fixture-k1',
  ring = { 'fixture-k1': keys['fixture-k1'].public },
) => ({
  SCANNER_KEY_ID: kid,
  SCANNER_SIGNING_PRIVATE_KEY_FILE: keys[kid].privatePath,
  SCANNER_PUBLIC_KEYS: JSON.stringify(ring),
  SCANNER_SIGNING_PRIVATE_KEY: '',
  SCANNER_PUBLIC_KEY: '',
});
let signer = new ScannerCryptoService(new ConfigService(cfg()));
const db = new PrismaService(new ConfigService({ DATABASE_URL: target.href }));
const report = {
  sourceSha: process.env.QR_SOURCE_SHA ?? 'working-tree',
  driverSha256: createHash('sha256')
    .update(readFileSync(import.meta.filename))
    .digest('hex'),
  local: !process.env.CI,
  ci: Boolean(process.env.CI),
  staging: false,
  camera: false,
  checks: [],
  races: [],
  processIds: [],
  startedAt: new Date().toISOString(),
};
const children = [],
  fds = [],
  timings = [];
const fixture = {};
let seatNumber = 0;
const check = (ok, label) => {
  assert(ok, label);
  report.checks.push(label);
};
function start(port, config = cfg()) {
  const fd = openSync(resolve(evidence, 'api-' + port + '.log'), 'w');
  fds.push(fd);
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: resolve(root, 'apps/api'),
    windowsHide: true,
    stdio: ['ignore', fd, fd],
    env: {
      ...process.env,
      ...config,
      PORT: String(port),
      WEB_ORIGIN: 'http://localhost:3050',
      HOLD_EXPIRY_MODE: 'off',
      NODE_ENV: 'test',
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
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch('http://127.0.0.1:' + port + '/health')).ok) return;
    } catch {}
    await new Promise((done) => setTimeout(done, 150));
  }
  throw Error('API unavailable; inspect private local log');
}
async function account(role, name) {
  await db.role.createMany({ data: [{ name: role }], skipDuplicates: true });
  const r = await db.role.findUniqueOrThrow({ where: { name: role } });
  const user = await db.user.create({
    data: {
      email: randomUUID() + '@signed-qr-fixture.test',
      password: 'fixture-not-login',
      isEmailVerified: true,
      userRoles: { create: { roleId: r.id } },
    },
  });
  const token = randomBytes(32).toString('base64url');
  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 7200000),
    },
  });
  return { id: user.id, name, cookie: 'event_session=' + token };
}
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
  return {
    id: order.items[0].id,
    orderId: order.id,
    seatId: seat.id,
    qr: signer.issueQr(order.items[0].id, fixture.showtimeId),
  };
}
async function http(path, actor, body, port = 3051) {
  const start = performance.now();
  const r = await fetch('http://127.0.0.1:' + port + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      Cookie: actor?.cookie ?? '',
      Origin: 'http://localhost:3050',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  timings.push(performance.now() - start);
  return { status: r.status, body: await r.json() };
}
const send = (qr, actor, gate, opts = {}) =>
  http(
    '/showtimes/' + (opts.showtimeId ?? fixture.showtimeId) + '/check-in',
    actor,
    {
      qrPayload: qr,
      gateId: gate,
      requestId: opts.requestId ?? randomUUID(),
      ...opts.extra,
    },
    opts.port ?? 3051,
  );
const count = (id) => db.ticketAdmission.count({ where: { ticketId: id } });
try {
  await db.$connect();
  const a = await account('STAFF', 'Nhân viên cửa A'),
    b = await account('STAFF', 'Nhân viên cửa B'),
    denied = await account('ADMIN', 'Chưa được phân công'),
    buyer = await account('BUYER', 'Khách fixture'),
    otherBuyer = await account('BUYER', 'Khách khác'),
    organizer = await account('ORGANIZER', 'Ban tổ chức');
  const event = await db.event.create({
    data: {
      organizerId: organizer.id,
      name: 'Suất kiểm thử QR ký',
      description: 'Private fixture',
      location: 'Nhà hát thử nghiệm',
      status: 'PUBLISHED',
    },
  });
  const show = await db.showtime.create({
    data: {
      eventId: event.id,
      startTime: new Date('2026-12-25T12:00:00Z'),
      status: 'ON_SALE',
    },
  });
  const other = await db.showtime.create({
    data: {
      eventId: event.id,
      startTime: new Date('2026-12-26T12:00:00Z'),
      status: 'ON_SALE',
    },
  });
  const category = await db.seatCategory.create({
    data: { showtimeId: show.id, name: 'Hạng thường', price: 200000 },
  });
  const gateA = await db.checkInGate.create({
      data: { showtimeId: show.id, name: 'A' },
    }),
    gateB = await db.checkInGate.create({
      data: { showtimeId: show.id, name: 'B' },
    });
  await db.checkInPermission.createMany({
    data: [
      { userId: a.id, gateId: gateA.id, staffName: a.name },
      { userId: b.id, gateId: gateB.id, staffName: b.name },
    ],
  });
  await db.showtimeStaff.createMany({
    data: [
      { showtimeId: show.id, userId: a.id },
      { showtimeId: show.id, userId: b.id },
    ],
  });
  Object.assign(fixture, {
    a,
    b,
    denied,
    buyer,
    showtimeId: show.id,
    otherShowtimeId: other.id,
    eventId: event.id,
    categoryId: category.id,
    gateA: gateA.id,
    gateB: gateB.id,
    keyDir,
  });
  let apiA = start(3051);
  const apiB = start(3052);
  await Promise.all([ready(3051), ready(3052)]);
  const first = await ticket(),
    key = randomUUID();
  const issued = await http('/orders/' + first.orderId + '/tickets', buyer);
  check(
    issued.status === 200 &&
      issued.body.tickets[0].qrPayload === first.qr &&
      issued.body.tickets[0].ticketId === first.id,
    'Owner-only issuer reuses existing paid OrderItem; canonical signed QR',
  );
  check(
    (await http('/orders/' + first.orderId + '/tickets', otherBuyer)).status ===
      404 &&
      (await http('/orders/' + first.orderId + '/tickets', null)).status ===
        401,
    'Issuer hides other buyer ticket/QR and requires session',
  );
  const raw = await http('/showtimes/' + show.id + '/check-in', a, {
    ticketId: first.id,
    gateId: gateA.id,
    requestId: randomUUID(),
  });
  check(
    raw.status === 400 && (await count(first.id)) === 0,
    'Real UUID without signature is rejected, no state/history',
  );
  const parts = first.qr.split('.');
  const altered = parts.slice();
  altered[4] = randomUUID();
  const badSignature = parts.slice();
  badSignature[5] = (parts[5][0] === 'A' ? 'B' : 'A') + parts[5].slice(1);
  const wrong =
    parts.slice(0, 5).join('.') +
    '.' +
    sign(
      null,
      Buffer.from(parts.slice(0, 5).join('.')),
      createPrivateKey(readFileSync(keys['fixture-k2'].privatePath)),
    ).toString('base64url');
  for (const [label, payload] of [
    ['payload tampered', altered.join('.')],
    ['signature tampered', badSignature.join('.')],
    ['unsigned payload', first.id],
    ['wrong private key', wrong],
    ['unknown kid', first.qr.replace('.fixture-k1.', '.unknown.')],
    ['unknown version', first.qr.replace('ET1.', 'ET2.')],
    ['unapproved algorithm', first.qr.replace('.Ed25519.', '.HS256.')],
    ['noncanonical signature', first.qr + '='],
  ]) {
    const r = await send(payload, a, gateA.id);
    check(
      r.status === 400 && (await count(first.id)) === 0,
      label + ' rejected by real API with zero admissions',
    );
  }
  check(
    (await send(signer.issueQr(first.id, other.id), a, gateA.id)).status ===
      400 && (await count(first.id)) === 0,
    'Valid signed QR for another showtime denied',
  );
  const deniedResult = await send(first.qr, denied, gateB.id);
  check(
    deniedResult.status === 403 &&
      !deniedResult.body.firstAdmission &&
      (await count(first.id)) === 0,
    'Role without gate permission denied before ticket metadata',
  );
  check(
    (await send(first.qr, a, gateB.id)).status === 403 &&
      (await send(first.qr, buyer, gateA.id)).status === 403,
    'Wrong gate and BUYER cannot admit',
  );
  const pending = await ticket('PENDING_PAYMENT'),
    cancelled = await ticket('CANCELLED');
  check(
    (await http('/orders/' + pending.orderId + '/tickets', buyer)).status ===
      409,
    'Issuer never signs pending order',
  );
  check(
    (await send(pending.qr, a, gateA.id)).status === 404 &&
      (await send(cancelled.qr, a, gateA.id)).status === 404 &&
      (await count(pending.id)) === 0 &&
      (await count(cancelled.id)) === 0,
    'Signed unpaid/cancelled tickets rejected without admissions',
  );
  const legacyCancelled = await ticket();
  await db.ticket.create({
    data: {
      orderId: legacyCancelled.orderId,
      showtimeId: show.id,
      seatId: legacyCancelled.seatId,
      code: 'TEST-' + randomUUID(),
      seatLabel: 'A-test',
      ticketType: 'Hạng thường',
      status: 'CANCELLED',
    },
  });
  check(
    (await send(legacyCancelled.qr, a, gateA.id)).status === 404 &&
      (await http('/orders/' + legacyCancelled.orderId + '/tickets', buyer))
        .body.tickets[0].qrPayload === null &&
      (await count(legacyCancelled.id)) === 0,
    'S-33 CANCELLED Ticket vetoes admission and QR rendering',
  );
  const legacyUsed = await ticket();
  await db.ticket.create({
    data: {
      orderId: legacyUsed.orderId,
      showtimeId: show.id,
      seatId: legacyUsed.seatId,
      code: 'TEST-' + randomUUID(),
      seatLabel: 'A-test',
      ticketType: 'Hạng thường',
      status: 'CHECKED_IN',
    },
  });
  check(
    (await send(legacyUsed.qr, a, gateA.id)).status === 409 &&
      (await count(legacyUsed.id)) === 0 &&
      (await http('/orders/' + legacyUsed.orderId + '/tickets', buyer)).body
        .tickets[0].status === 'CHECKED_IN',
    'Legacy used status with missing timestamp fails closed and owner sees used',
  );
  const legacyAlias = 'TEST-' + randomUUID();
  await db.ticket.create({
    data: {
      orderId: first.orderId,
      showtimeId: show.id,
      seatId: first.seatId,
      code: legacyAlias,
      seatLabel: 'A-test',
      ticketType: 'Hạng thường',
      status: 'VALID',
    },
  });
  const accepted = await send(first.qr, a, gateA.id, { requestId: key });
  const stored = await db.ticketAdmission.findFirstOrThrow({
    where: { ticketId: first.id },
  });
  const state = await db.orderItem.findUniqueOrThrow({
    where: { id: first.id },
  });
  check(
    accepted.status === 200 &&
      accepted.body.status === 'SUCCESS' &&
      stored.staffId === a.id &&
      stored.staffName === a.name &&
      stored.gateName === 'A' &&
      stored.enteredAt.toISOString() === accepted.body.checkedInAt &&
      state.checkedInAt.toISOString() === accepted.body.checkedInAt,
    'Signed first admission commits ledger + trusted employee/gate/database time',
  );
  const duplicate = await send(first.qr, b, gateB.id, { port: 3052 });
  check(
    duplicate.status === 409 &&
      duplicate.body.firstAdmission.gateName === 'A' &&
      duplicate.body.firstAdmission.checkedInAt === accepted.body.checkedInAt &&
      (await count(first.id)) === 1,
    'Other gate duplicate returns immutable first gate/time',
  );
  const replay = await send(first.qr, a, gateA.id, { requestId: key });
  check(
    replay.status === 200 &&
      replay.body.status === 'ALREADY_RECORDED' &&
      (await count(first.id)) === 1,
    'Retry reports prior recording, no new acceptance',
  );
  for (let i = 0; i < 50; i++) {
    const fresh = await ticket();
    const r = await Promise.all([
      send(fresh.qr, a, gateA.id),
      send(fresh.qr, b, gateB.id, { port: 3052 }),
    ]);
    const successes = r.filter(
        (x) => x.status === 200 && x.body.status === 'SUCCESS',
      ).length,
      duplicates = r.filter(
        (x) => x.status === 409 && x.body.code === 'TICKET_ALREADY_CHECKED_IN',
      ).length;
    const n = await count(fresh.id);
    check(
      successes === 1 && duplicates === 1 && n === 1,
      'Two-process signed race ' + (i + 1),
    );
    report.races.push({
      iteration: i + 1,
      accepted: successes,
      rejected: duplicates,
      rows: n,
    });
  }
  const same = await ticket(),
    sameKey = randomUUID();
  const sameResults = await Promise.all([
    send(same.qr, a, gateA.id, { requestId: sameKey }),
    send(same.qr, a, gateA.id, { requestId: sameKey, port: 3052 }),
  ]);
  check(
    sameResults
      .map((r) => r.body.status)
      .sort()
      .join(',') === 'ALREADY_RECORDED,SUCCESS' && (await count(same.id)) === 1,
    'Concurrent same request across API processes records once',
  );
  const oldUnused = await ticket();
  await stop(apiA);
  const rotated = cfg('fixture-k2', {
    'fixture-k1': keys['fixture-k1'].public,
    'fixture-k2': keys['fixture-k2'].public,
  });
  apiA = start(3051, rotated);
  signer = new ScannerCryptoService(new ConfigService(rotated));
  await ready(3051);
  check(
    (await send(oldUnused.qr, a, gateA.id)).status === 200,
    'Persisted old QR verifies after restart and normal rotation retaining k1',
  );
  const newTicket = await ticket();
  const newIssued = await http(
    '/orders/' + newTicket.orderId + '/tickets',
    buyer,
  );
  check(
    newIssued.status === 200 &&
      newIssued.body.tickets[0].qrPayload.split('.')[2] === 'fixture-k2' &&
      (await send(newIssued.body.tickets[0].qrPayload, a, gateA.id)).status ===
        200,
    'New QR uses active k2 after rotation',
  );
  check(
    (await send(first.qr, b, gateB.id)).status === 409 &&
      (await count(first.id)) === 1,
    'Restart/rotation never enables used ticket',
  );
  const publicKeys = await http('/scanner/qr-keys', a);
  check(
    publicKeys.status === 200 &&
      publicKeys.body.keys.length === 2 &&
      !JSON.stringify(publicKeys.body).includes('PRIVATE KEY'),
    'Scanner receives public verification ring only',
  );
  const snapshot = await http('/scanner/showtimes/' + show.id + '/tickets', a);
  check(
    snapshot.status === 200 &&
      snapshot.body.tickets.some(
        (t) => t.code === first.id && t.status === 'checked_in',
      ) &&
      snapshot.body.publicKey.verificationKeys.length === 2 &&
      !snapshot.body.tickets.some((t) => t.code === legacyAlias) &&
      !JSON.stringify(snapshot.body).includes('@signed-qr-fixture.test'),
    'S-33 snapshot keeps envelope and adds canonical signed-ticket IDs/key ring without PII',
  );
  const cursor = snapshot.body.cursor,
    changed = await ticket();
  await send(changed.qr, a, gateA.id);
  const incremental = await http(
    '/scanner/showtimes/' +
      show.id +
      '/tickets?since=' +
      encodeURIComponent(cursor),
    a,
  );
  check(
    incremental.status === 200 &&
      incremental.body.tickets.some(
        (t) => t.code === changed.id && t.status === 'checked_in',
      ),
    'S-33 incremental sees new canonical admission',
  );
  const historical = new Date('2026-12-25T12:02:00Z');
  await db.$transaction([
    db.ticketAdmission.updateMany({
      where: { ticketId: first.id },
      data: { enteredAt: historical },
    }),
    db.orderItem.update({
      where: { id: first.id },
      data: { checkedInAt: historical },
    }),
  ]);
  fixture.browserTicket = first.id;
  fixture.usedQr = first.qr;
  fixture.fresh = await ticket();
  fixture.retry = await ticket();
  fixture.camera = await ticket();
  fixture.ownerOrderId = fixture.camera.orderId;
  report.historicalTime =
    'Explicit 19:02 gate A fixture after verifying actual database/server time';
  report.responseMs = {
    count: timings.length,
    p95: [...timings].sort((a, b) => a - b)[
      Math.ceil(timings.length * 0.95) - 1
    ],
    max: Math.max(...timings),
  };
  report.status = 'PASS';
  if (process.env.QR_PRIVATE_FIXTURE_FILE) {
    const out = resolve(process.env.QR_PRIVATE_FIXTURE_FILE);
    assert(
      relative(root, out) === '..' ||
        relative(root, out).startsWith('..' + sep) ||
        isAbsolute(relative(root, out)),
      'Private fixture outside repository',
    );
    writeFileSync(out, JSON.stringify(fixture), { mode: 0o600 });
  }
} catch (error) {
  report.status = 'FAIL';
  report.error = error.message;
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(
    resolve(evidence, 'http-proof.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  if (process.env.QR_KEEP_APIS !== '1') await Promise.all(children.map(stop));
  for (const fd of fds) closeSync(fd);
  await db.$disconnect();
}
console.log(
  JSON.stringify({
    status: report.status,
    checks: report.checks.length,
    races: report.races.length,
    instances: 2,
    responseMs: report.responseMs,
    camera: false,
  }),
);
