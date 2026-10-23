import { randomUUID, randomBytes, sign, createPrivateKey } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashSessionToken } from '../dist/auth/auth.service.js';
import { ticketQrInput } from '../../../packages/shared/ticket-qr.js';

const runId = process.env.AI_REMEDIATION_RUN_ID;
if (!/^\d{8}T\d{6}-remediation$/.test(runId ?? ''))
  throw new Error('Missing validated remediation run id.');
const root = resolve(import.meta.dirname, '../../..');
const stateDir = resolve(root, '.cache/ai-remediation', runId);
const fixturePath = resolve(stateDir, 'r19-fixture.json');
const profilePath = resolve(stateDir, 'profile.json');
if (!existsSync(profilePath)) throw new Error('Isolated profile state is missing.');
const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
if (profile.run_id !== runId) throw new Error('Isolated profile owner mismatch.');
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function seed() {
  if (existsSync(fixturePath)) throw new Error('R19 fixture already exists.');
  const ticketCount = Number(process.env.AI_REMEDIATION_R19_TICKET_COUNT ?? 40);
  if (!Number.isInteger(ticketCount) || ticketCount < 1 || ticketCount > 5000)
    throw new Error('R19 ticket fixture count must be an integer from 1 to 5000.');
  const suffix = randomUUID();
  const role = await db.role.upsert({
    where: { name: 'STAFF' },
    update: {},
    create: { name: 'STAFF' },
  });
  const organizerRole = await db.role.upsert({
    where: { name: 'ORGANIZER' },
    update: {},
    create: { name: 'ORGANIZER' },
  });
  const user = await db.user.create({
    data: {
      email: `${runId}.${suffix}@r19-fixture.invalid`,
      fullName: 'R19 Synthetic Scanner',
      password: randomBytes(32).toString('base64url'),
      isActive: true,
      isEmailVerified: true,
      userRoles: { create: [{ roleId: role.id }, { roleId: organizerRole.id }] },
    },
  });
  const token = randomBytes(32).toString('base64url');
  await db.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
    },
  });
  const event = await db.event.create({
    data: {
      name: `R19 fixture ${runId} ${suffix}`,
      description: 'Synthetic isolated scanner fixture',
      location: 'Local test venue',
      organizerId: user.id,
      status: 'PUBLISHED',
    },
  });
  const showtime = await db.showtime.create({
    data: { eventId: event.id, startTime: new Date(), status: 'ON_SALE' },
  });
  await db.showtimeStaff.create({
    data: { showtimeId: showtime.id, userId: user.id },
  });
  const category = await db.seatCategory.create({
    data: { showtimeId: showtime.id, name: 'R19 fixture', price: 100000 },
  });
  await db.seat.createMany({
    data: Array.from({ length: ticketCount }, (_, index) => ({
      showtimeId: showtime.id,
      categoryId: category.id,
      row: 'R',
      seatNumber: index + 1,
    })),
  });
  const seats = await db.seat.findMany({ where: { showtimeId: showtime.id, categoryId: category.id }, orderBy: { seatNumber: 'asc' } });
  const gate = await db.checkInGate.create({
    data: { showtimeId: showtime.id, name: 'R19 Gate A' },
  });
  await db.checkInPermission.create({
    data: {
      userId: user.id,
      gateId: gate.id,
      staffName: 'R19 Synthetic Scanner',
      canOverride: false,
    },
  });
  const alternate = await db.user.create({
    data: {
      email: `${runId}.${randomUUID()}@r19-alternate.invalid`,
      fullName: 'R19 Alternate Scanner',
      password: randomBytes(32).toString('base64url'),
      isActive: true,
      isEmailVerified: true,
      userRoles: { create: { roleId: role.id } },
    },
  });
  const alternateToken = randomBytes(32).toString('base64url');
  await db.session.create({ data: { tokenHash: hashSessionToken(alternateToken), userId: alternate.id, expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000) } });
  await db.showtimeStaff.create({ data: { showtimeId: showtime.id, userId: alternate.id } });
  await db.checkInPermission.create({ data: { userId: alternate.id, gateId: gate.id, staffName: 'R19 Alternate Scanner', canOverride: false } });
  const order = await db.order.create({
    data: {
      userId: user.id,
      eventId: event.id,
      showtimeId: showtime.id,
      status: 'PAID',
      totalAmount: ticketCount * 100000,
      paymentExpiresAt: new Date(Date.now() + 60_000),
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  await db.orderItem.createMany({
    data: seats.map((seat) => ({ orderId: order.id, seatId: seat.id, categoryName: 'R19 fixture', tierName: 'R19 fixture', unitPrice: 100000 })),
  });
  const items = await db.orderItem.findMany({ where: { orderId: order.id }, orderBy: { seatId: 'asc' } });
  await db.ticket.createMany({
    data: items.map((item, index) => ({
      orderId: order.id,
      showtimeId: showtime.id,
      seatId: item.seatId,
      code: `R19-${suffix}-${String(index + 1).padStart(2, '0')}`,
      seatLabel: `R-${index + 1}`,
      ticketType: 'R19 fixture',
      status: 'VALID',
      price: 100000,
    })),
  });
  const tickets = items.map((item, index) => {
    if (index >= 40) return { ticketId: item.id };
    const qrInput = ticketQrInput({
      keyId: profile.scanner_key_id,
      showtimeId: showtime.id,
      ticketId: item.id,
    });
    return {
      ticketId: item.id,
      qrPayload: `${qrInput}.${sign(null, Buffer.from(qrInput, 'ascii'), createPrivateKey(profile.scanner_private_key)).toString('base64url')}`,
    };
  });
  writeFileSync(
    fixturePath,
    JSON.stringify({
      runId,
      userId: user.id,
      alternateUserId: alternate.id,
      alternateToken,
      token,
      eventId: event.id,
      showtimeId: showtime.id,
      gateId: gate.id,
      ticketId: items[0].id,
      qrPayload: tickets[0].qrPayload,
      tickets,
      ticketCount,
      orderId: order.id,
      seatIds: seats.map((seat) => seat.id),
      categoryId: category.id,
    }),
    { flag: 'wx', mode: 0o600 },
  );
  console.log('R19 synthetic scanner fixture created; secrets were written only to the private cache file.');
}

async function cleanup() {
  if (!existsSync(fixturePath)) throw new Error('No owned R19 fixture exists.');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  if (fixture.runId !== runId) throw new Error('Fixture run id mismatch.');
  const event = await db.event.findUnique({ where: { id: fixture.eventId } });
  if (!event?.name.startsWith(`R19 fixture ${runId} `))
    throw new Error('Fixture ownership check failed; refusing cleanup.');
  await db.$transaction(async (tx) => {
    await tx.offlineScanLog.deleteMany({ where: { showtimeId: fixture.showtimeId } });
    await tx.ticketAdmission.deleteMany({ where: { showtimeId: fixture.showtimeId } });
    await tx.scannerSnapshotCursor.deleteMany({ where: { showtimeId: fixture.showtimeId, staffId: fixture.userId } });
    await tx.checkInPermission.deleteMany({ where: { gate: { showtimeId: fixture.showtimeId } } });
    await tx.showtimeStaff.deleteMany({ where: { showtimeId: fixture.showtimeId } });
    await tx.ticketLog.deleteMany({ where: { ticket: { orderId: fixture.orderId } } });
    await tx.ticket.deleteMany({ where: { orderId: fixture.orderId } });
    await tx.orderItem.deleteMany({ where: { orderId: fixture.orderId } });
    await tx.payment.deleteMany({ where: { orderId: fixture.orderId } });
    await tx.order.deleteMany({ where: { id: fixture.orderId } });
    await tx.checkInGate.deleteMany({ where: { showtimeId: fixture.showtimeId } });
    await tx.seat.deleteMany({ where: { id: { in: fixture.seatIds } } });
    await tx.seatCategory.deleteMany({ where: { id: fixture.categoryId } });
    await tx.showtime.deleteMany({ where: { id: fixture.showtimeId } });
    await tx.event.deleteMany({ where: { id: fixture.eventId } });
    const fixtureUsers = [fixture.userId, fixture.alternateUserId].filter(Boolean);
    await tx.session.deleteMany({ where: { userId: { in: fixtureUsers } } });
    await tx.userRole.deleteMany({ where: { userId: { in: fixtureUsers } } });
    await tx.user.deleteMany({ where: { id: { in: fixtureUsers } } });
  });
  for (const name of ['r19-browser-profile', 'r19-browser-profile-final', 'r19-duplicate-browser-profile', 'r19-duplicate-browser-profile-desktop', 'r19-duplicate-browser-profile-mobile', 'r19-delta-browser-profile', 'r19-delta-browser-profile-final', 'r19-5000-browser-profile']) {
    const browserProfile = resolve(stateDir, name);
    if (resolve(browserProfile, '..') !== stateDir)
      throw new Error('Browser fixture path escaped the run cache.');
    rmSync(browserProfile, { recursive: true, force: true });
  }
  rmSync(fixturePath, { force: true });
  console.log('R19 synthetic fixture rows cleaned after run and ownership checks.');
}

async function verify() {
  if (!existsSync(fixturePath)) throw new Error('No owned R19 fixture exists.');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  if (fixture.runId !== runId) throw new Error('Fixture run id mismatch.');
  const browser = JSON.parse(
    readFileSync(resolve(root, 'evidence/ai-remediation', runId, 'r19-browser.json'), 'utf8'),
  );
  const scanIds = browser.syncedRequestIds ?? [browser.syncedRequestId];
  if (scanIds.length !== fixture.tickets.length || scanIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id ?? '')))
    throw new Error('Browser did not record an ACK for all 40 queued scans.');
  const [scans, admissions, checkedInItems] = await Promise.all([
    db.offlineScanLog.findMany({ where: { scanId: { in: scanIds } } }),
    db.ticketAdmission.findMany({
      where: { ticketId: { in: fixture.tickets.map((ticket) => ticket.ticketId) }, kind: 'NORMAL' },
      select: { ticketId: true, requestId: true, gateId: true, enteredAt: true },
    }),
    db.orderItem.findMany({
      where: { id: { in: fixture.tickets.map((ticket) => ticket.ticketId) }, checkedInAt: { not: null } },
      select: { id: true },
    }),
  ]);
  if (
    scans.length !== 40 || scans.some((scan) => scan.status !== 'ACCEPTED' || scan.showtimeId !== fixture.showtimeId || !fixture.tickets.some((ticket) => ticket.ticketId === scan.ticketCode)) ||
    admissions.length !== 40 || admissions.some((admission) => !scanIds.includes(admission.requestId) || admission.gateId !== fixture.gateId) ||
    checkedInItems.length !== 40
  )
    throw new Error('Browser ACK does not match the durable PostgreSQL oracle for all 40 admissions.');
  console.log('Verified real browser ACK against 40 durable PostgreSQL offline scans and 40 NORMAL admissions.');
}

async function setStaff(enabled) {
  if (!existsSync(fixturePath)) throw new Error('No owned R19 fixture exists.');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  if (fixture.runId !== runId) throw new Error('Fixture run id mismatch.');
  const ownedEvent = await db.event.findUnique({ where: { id: fixture.eventId }, select: { name: true, organizerId: true } });
  const role = await db.role.findUnique({ where: { name: 'STAFF' }, select: { id: true } });
  if (!ownedEvent?.name.startsWith(`R19 fixture ${runId} `) || ownedEvent.organizerId !== fixture.userId || !role)
    throw new Error('Fixture ownership or STAFF role check failed; refusing role mutation.');
  if (enabled) {
    await db.userRole.upsert({
      where: { userId_roleId: { userId: fixture.userId, roleId: role.id } },
      update: {},
      create: { userId: fixture.userId, roleId: role.id },
    });
  } else {
    await db.userRole.deleteMany({ where: { userId: fixture.userId, roleId: role.id } });
  }
  console.log(`Owned R19 fixture STAFF role ${enabled ? 'restored' : 'revoked'}; no other account was changed.`);
}

async function setActive(enabled) {
  if (!existsSync(fixturePath)) throw new Error('No owned R19 fixture exists.');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  if (fixture.runId !== runId) throw new Error('Fixture run id mismatch.');
  const event = await db.event.findUnique({ where: { id: fixture.eventId }, select: { name: true, organizerId: true } });
  if (!event?.name.startsWith(`R19 fixture ${runId} `) || event.organizerId !== fixture.userId)
    throw new Error('Fixture ownership check failed; refusing account mutation.');
  await db.user.update({ where: { id: fixture.userId }, data: { isActive: enabled } });
  console.log(`Owned R19 fixture user active state ${enabled ? 'restored' : 'disabled'}; no other account was changed.`);
}

async function addSecondGate() {
  if (!existsSync(fixturePath)) throw new Error('No owned R19 fixture exists.');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  if (fixture.runId !== runId) throw new Error('Fixture run id mismatch.');
  const event = await db.event.findUnique({ where: { id: fixture.eventId }, select: { name: true, organizerId: true } });
  if (!event?.name.startsWith(`R19 fixture ${runId} `) || event.organizerId !== fixture.userId)
    throw new Error('Fixture ownership check failed; refusing to add a gate.');
  if (fixture.secondGateId) throw new Error('Second gate already exists for this fixture.');
  const gate = await db.checkInGate.create({
    data: { showtimeId: fixture.showtimeId, name: 'R19 Gate B' },
  });
  await db.checkInPermission.create({
    data: { userId: fixture.userId, gateId: gate.id, staffName: 'R19 Synthetic Scanner', canOverride: true },
  });
  fixture.secondGateId = gate.id;
  writeFileSync(fixturePath, JSON.stringify(fixture), { mode: 0o600 });
  console.log('Second gate added only to the owned R19 fixture.');
}

async function verifyDuplicateCheckIn() {
  if (!existsSync(fixturePath)) throw new Error('No owned R19 fixture exists.');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  if (fixture.runId !== runId || !fixture.secondGateId) throw new Error('R19 duplicate-check-in fixture identity is invalid.');
  const browser = JSON.parse(readFileSync(resolve(root, 'evidence/ai-remediation', runId, 'r19-duplicate-browser.json'), 'utf8'));
  const ticketIds = browser.viewports?.map((entry) => entry.ticketId) ?? [];
  const [admissions, exceptions, checkedInItems] = await Promise.all([
    db.ticketAdmission.findMany({ where: { ticketId: { in: ticketIds }, kind: 'NORMAL' }, select: { ticketId: true, gateId: true, enteredAt: true } }),
    db.ticketAdmission.findMany({ where: { ticketId: { in: ticketIds }, kind: 'EXCEPTION' }, select: { ticketId: true, gateId: true, reason: true, ownerConfirmed: true, staffName: true } }),
    db.orderItem.findMany({ where: { id: { in: ticketIds }, checkedInAt: { not: null } }, select: { id: true } }),
  ]);
  const verified = ticketIds.length === 2 && browser.viewports.length === 2 && browser.viewports.every((entry) => entry.showsPriorGate && entry.showsPriorTime && entry.checkInStatuses.join(',') === '200,409,200' && entry.overrideValidationBlocked === true && entry.exceptionStatus === 200) && admissions.length === 2 && admissions.every((admission) => admission.gateId === fixture.gateId && ticketIds.includes(admission.ticketId)) && exceptions.length === 2 && exceptions.every((exception) => ticketIds.includes(exception.ticketId) && exception.gateId === fixture.secondGateId && exception.ownerConfirmed === true && Boolean(exception.staffName) && exception.reason === browser.viewports.find((entry) => entry.ticketId === exception.ticketId)?.exceptionReason) && checkedInItems.length === 2;
  if (!verified) throw new Error('Browser duplicate result does not match the one-admission PostgreSQL oracle.');
  console.log('Verified desktop/mobile duplicate UI and exactly one PostgreSQL NORMAL admission at the first gate.');
}

async function verifyDelta() {
  if (!existsSync(fixturePath)) throw new Error('No owned R19 fixture exists.');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  if (fixture.runId !== runId) throw new Error('Fixture run id mismatch.');
  const browser = JSON.parse(readFileSync(resolve(root, 'evidence/ai-remediation', runId, 'r19-delta-browser.json'), 'utf8'));
  const [item, admissions] = await Promise.all([
    db.orderItem.findUnique({ where: { id: browser.cachedTicketCode }, select: { orderId: true, checkedInAt: true } }),
    db.ticketAdmission.findMany({ where: { ticketId: browser.cachedTicketCode, kind: 'NORMAL' }, select: { gateId: true, enteredAt: true } }),
  ]);
  const changed = browser.delta?.changedTickets?.filter((ticket) => ticket.code === browser.cachedTicketCode && ticket.status === 'checked_in') ?? [];
  if (browser.fullSnapshot?.totalTickets !== 40 || browser.serverChangeStatus !== 200 || browser.delta?.status !== 200 || browser.delta.mode !== 'delta' || browser.staleAgeMinutes < 30 || changed.length !== 1 || browser.localAfterDelta?.ticketStatus !== 'checked_in' || browser.localAfterDelta?.ticketCount !== 40 || !browser.localAfterDelta?.cursorChanged || !item?.checkedInAt || admissions.length !== 1 || admissions[0].gateId !== fixture.gateId)
    throw new Error('Browser delta state does not match the PostgreSQL oracle.');
  console.log('Verified one changed offline-ticket snapshot record against the durable PostgreSQL check-in.');
}

async function verifyInt06() {
  if (!existsSync(fixturePath)) throw new Error('No owned R19 fixture exists.');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  if (fixture.runId !== runId) throw new Error('Fixture run id mismatch.');
  const browser = JSON.parse(readFileSync(resolve(root, 'evidence/ai-remediation', runId, 'r19-int06-conflict-browser.json'), 'utf8'));
  const scansByDevice = browser.devices ?? [];
  const scanIds = scansByDevice.map((device) => device.scan?.scanId);
  if (scanIds.length !== 2 || scanIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id ?? '')))
    throw new Error('Browser did not persist two distinct offline scan requests.');
  const [scans, admissions, item] = await Promise.all([
    db.offlineScanLog.findMany({ where: { scanId: { in: scanIds } }, orderBy: { scannedAt: 'asc' } }),
    db.ticketAdmission.findMany({ where: { ticketId: fixture.tickets[0].ticketId, kind: 'NORMAL' } }),
    db.orderItem.findUniqueOrThrow({ where: { id: fixture.tickets[0].ticketId }, select: { checkedInAt: true } }),
  ]);
  const earlier = [...scansByDevice].sort((a, b) => Date.parse(a.scan.scannedAt) - Date.parse(b.scan.scannedAt))[0];
  const later = scansByDevice.find((device) => device !== earlier);
  const scanById = new Map(scans.map((scan) => [scan.scanId, scan]));
  const earlierRow = scanById.get(earlier?.scan?.scanId);
  const laterRow = scanById.get(later?.scan?.scanId);
  const expectedMs = Date.parse(earlier.scan.scannedAt);
  const reports = browser.conflictReports ?? [];
  const verified = scans.length === 2 && scans.every((scan) => scan.showtimeId === fixture.showtimeId && scan.ticketCode === fixture.tickets[0].ticketId && Number.isFinite(scan.clockOffsetMs) && scan.deviceId) && new Set(scans.map((scan) => scan.deviceId)).size === 2 && earlier.scan.scannedAt < later.scan.scannedAt && earlierRow?.status === 'ACCEPTED' && laterRow?.status === 'CONFLICT' && admissions.length === 1 && admissions[0].requestId === earlier.scan.scanId && admissions[0].gateId === fixture.gateId && admissions[0].enteredAt.getTime() === expectedMs && item.checkedInAt?.getTime() === expectedMs && reports.length === 2 && reports.every((entry) => entry.visible === true && entry.ticketCode === fixture.tickets[0].ticketId && entry.winningGate === 'R19 Gate A' && entry.losingGate === 'R19 Gate B' && entry.offsetsVisible === true);
  if (!verified) throw new Error('D05 browser result and PostgreSQL admission/conflict oracle do not agree.');
  const oracle = {
    runId,
    fixture: { showtimeId: fixture.showtimeId, ticketItemId: fixture.tickets[0].ticketId },
    rule: 'D05 earlier original device scan timestamp wins; preserve both observations and device/server offsets.',
    syncOrder: browser.syncOrder,
    scans: scans.map((scan) => ({ scanId: scan.scanId, deviceId: scan.deviceId, gateId: scan.gateId, scannedAt: scan.scannedAt.toISOString(), receivedAt: scan.createdAt.toISOString(), clockOffsetMs: scan.clockOffsetMs, status: scan.status })),
    winner: { requestId: admissions[0].requestId, gateId: admissions[0].gateId, enteredAt: admissions[0].enteredAt.toISOString(), orderItemCheckedInAt: item.checkedInAt?.toISOString() ?? null },
    conflictUi: reports,
    retainedOriginalObservations: scans.length === 2,
  };
  writeFileSync(resolve(root, 'evidence/ai-remediation', runId, 'int06-postgres-oracle.json'), JSON.stringify(oracle, null, 2));
  console.log('Verified INT-06: two browser devices uploaded in reverse order; earlier device time won and both scans/offsets remain in PostgreSQL.');
}

async function verifyInt07(browserFile = 'r19-int07-offline-recovery-browser.json', oracleFile = 'int07-postgres-oracle.json') {
  if (!existsSync(fixturePath)) throw new Error('No owned R19 fixture exists.');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  if (fixture.runId !== runId) throw new Error('Fixture run id mismatch.');
  const browser = JSON.parse(readFileSync(resolve(root, 'evidence/ai-remediation', runId, browserFile), 'utf8'));
  const requestIds = [browser.committedScanId, browser.protectedScanId];
  const ticketCodes = [browser.committedTicketCode, browser.protectedTicketCode];
  if (requestIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id ?? '')) || ticketCodes.some((id) => !fixture.tickets.some((ticket) => ticket.ticketId === id)) || new Set(requestIds).size !== 2 || new Set(ticketCodes).size !== 2)
    throw new Error('Browser did not provide two distinct owned scan requests and tickets.');
  const [scans, admissions, items] = await Promise.all([
    db.offlineScanLog.findMany({ where: { scanId: { in: requestIds } }, select: { scanId: true, ticketCode: true, showtimeId: true, staffId: true, status: true } }),
    db.ticketAdmission.findMany({ where: { ticketId: { in: ticketCodes }, kind: 'NORMAL' }, select: { ticketId: true, requestId: true, gateId: true } }),
    db.orderItem.findMany({ where: { id: { in: ticketCodes }, checkedInAt: { not: null } }, select: { id: true } }),
  ]);
  const valid = scans.length === 2 && scans.every((scan) => requestIds.includes(scan.scanId) && ticketCodes.includes(scan.ticketCode) && scan.showtimeId === fixture.showtimeId && scan.staffId === fixture.userId && scan.status === 'ACCEPTED') && admissions.length === 2 && admissions.every((entry) => ticketCodes.includes(entry.ticketId) && requestIds.includes(entry.requestId) && entry.gateId === fixture.gateId) && items.length === 2 && browser.afterLostResponse?.sameRequestId === true && browser.failuresInjected?.length === 5 && browser.failuresInjected.every((entry) => entry.requestIdPreserved && entry.pendingCount === 1) && browser.accountSwitch?.syncPostsForForeignQueue === 0 && browser.finalLocalQueue?.length === 2 && browser.finalLocalQueue.every((entry) => entry.status === 'synced');
  if (!valid) throw new Error('INT-07 browser queue evidence does not match PostgreSQL durable scans and single admissions.');
  const oracle = {
    runId,
    fixture: { showtimeId: fixture.showtimeId, gateId: fixture.gateId },
    lostResponseReplay: { requestId: browser.committedScanId, ticketCode: browser.committedTicketCode, browserPendingAfterDrop: true, finalBrowserStatus: 'synced' },
    injectedHttpFailuresRetained: browser.failuresInjected.map(({ status, pendingCount, retryCount }) => ({ status, pendingCount, retryCount })),
    alternateAccountDidNotSendForeignQueue: browser.accountSwitch.syncPostsForForeignQueue === 0,
    durableScans: scans.map(({ scanId, ticketCode, showtimeId, staffId, status }) => ({ scanId, ticketCode, showtimeId, staffId, status })),
    normalAdmissions: admissions.map(({ ticketId, requestId, gateId }) => ({ ticketId, requestId, gateId })),
    checkedInItems: items.length,
  };
  writeFileSync(resolve(root, 'evidence/ai-remediation', runId, oracleFile), `${JSON.stringify(oracle, null, 2)}\n`);
  console.log('Verified INT-07 browser retry and cross-account retention against two unique PostgreSQL scans and admissions.');
}

async function verifyInt10() {
  if (!existsSync(fixturePath)) throw new Error('No owned R19 fixture exists.');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  if (fixture.runId !== runId) throw new Error('Fixture run id mismatch.');
  const browser = JSON.parse(readFileSync(resolve(root, 'evidence/ai-remediation', runId, 'r19-int10-role-session-browser.json'), 'utf8'));
  const ids = browser.stages?.map((stage) => stage.scanId);
  const tickets = browser.stages?.map((stage) => stage.ticketId);
  if (ids?.length !== 2 || tickets?.length !== 2 || ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id ?? '')) || new Set(ids).size !== 2 || new Set(tickets).size !== 2)
    throw new Error('INT-10 browser did not retain two separate durable queue items.');
  const [scans, admissions, activeUser] = await Promise.all([
    db.offlineScanLog.findMany({ where: { scanId: { in: ids } }, select: { scanId: true, ticketCode: true, staffId: true, showtimeId: true, status: true } }),
    db.ticketAdmission.findMany({ where: { ticketId: { in: tickets }, kind: 'NORMAL' }, select: { ticketId: true, requestId: true, gateId: true } }),
    db.user.findUniqueOrThrow({ where: { id: fixture.userId }, select: { isActive: true, userRoles: { include: { role: true } } } }),
  ]);
  const rolePresent = activeUser.userRoles.some((item) => item.role.name === 'STAFF');
  const valid = scans.length === 2 && scans.every((row) => ids.includes(row.scanId) && tickets.includes(row.ticketCode) && row.staffId === fixture.userId && row.showtimeId === fixture.showtimeId && row.status === 'ACCEPTED') && admissions.length === 2 && admissions.every((row) => tickets.includes(row.ticketId) && ids.includes(row.requestId) && row.gateId === fixture.gateId) && activeUser.isActive && rolePresent && browser.stages.every((stage) => stage.roleSyncPosts === 0 && stage.directRolePostStatus === 403 && stage.directDisabledPostStatus === 401 && stage.pendingWhileUnauthorized === true && stage.finalSyncStatus === 200);
  if (!valid) throw new Error('INT-10 role/session browser evidence does not match the PostgreSQL admission oracle.');
  const oracle = { runId, browserStages: browser.stages.map((stage) => ({ viewport: stage.viewport, roleSyncPosts: stage.roleSyncPosts, directRolePostStatus: stage.directRolePostStatus, directDisabledPostStatus: stage.directDisabledPostStatus, pendingWhileUnauthorized: stage.pendingWhileUnauthorized, finalSyncStatus: stage.finalSyncStatus })), durableScans: scans.map(({ scanId, ticketCode, staffId, showtimeId, status }) => ({ scanId, ticketCode, staffId, showtimeId, status })), normalAdmissions: admissions, finalAccount: { active: activeUser.isActive, staffRolePresent: rolePresent }, duplicates: 0 };
  writeFileSync(resolve(root, 'evidence/ai-remediation', runId, 'int10-postgres-oracle.json'), `${JSON.stringify(oracle, null, 2)}\n`);
  console.log('Verified INT-10 actual role revocation/disable responses, durable queue retention and restored admission against PostgreSQL.');
}

async function verify5000() {
  if (!existsSync(fixturePath)) throw new Error('No owned R19 fixture exists.');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  if (fixture.runId !== runId || fixture.ticketCount !== 5000) throw new Error('R19 5000-ticket fixture identity is invalid.');
  const browser = JSON.parse(readFileSync(resolve(root, 'evidence/ai-remediation', runId, 'r19-5000-browser.json'), 'utf8'));
  const [ticketCount, itemCount] = await Promise.all([
    db.ticket.count({ where: { showtimeId: fixture.showtimeId, orderId: fixture.orderId } }),
    db.orderItem.count({ where: { orderId: fixture.orderId } }),
  ]);
  if (ticketCount !== 5000 || itemCount !== 5000 || browser.serverResponseStatus !== 200 || browser.snapshot?.totalTickets !== 5000 || browser.local?.count !== 5000 || browser.local?.ticketCount !== 5000 || browser.local?.forbiddenFieldNames?.length || browser.local?.containsSyntheticPII || browser.rawLatencyMs?.length !== 1)
    throw new Error('The browser 5000-ticket result does not match the isolated PostgreSQL fixture oracle.');
  console.log('Verified exactly 5000 fixture tickets/order items, browser IndexedDB count and no customer-identity fields.');
}

try {
  if (process.argv[2] === 'seed') await seed();
  else if (process.argv[2] === 'verify') await verify();
  else if (process.argv[2] === 'cleanup') await cleanup();
  else if (process.argv[2] === 'add-second-gate') await addSecondGate();
  else if (process.argv[2] === 'verify-duplicate') await verifyDuplicateCheckIn();
  else if (process.argv[2] === 'verify-delta') await verifyDelta();
  else if (process.argv[2] === 'verify-int06') await verifyInt06();
  else if (process.argv[2] === 'verify-int07') await verifyInt07();
  else if (process.argv[2] === 'verify-int07-desktop') await verifyInt07('r19-int07-offline-recovery-browser-desktop.json', 'int07-postgres-oracle-desktop.json');
  else if (process.argv[2] === 'verify-int10') await verifyInt10();
  else if (process.argv[2] === 'verify-5000') await verify5000();
  else if (process.argv[2] === 'revoke-staff') await setStaff(false);
  else if (process.argv[2] === 'restore-staff') await setStaff(true);
  else if (process.argv[2] === 'disable-user') await setActive(false);
  else if (process.argv[2] === 'enable-user') await setActive(true);
  else throw new Error('Operation must be seed, verify, cleanup, revoke-staff or restore-staff.');
} finally {
  await db.$disconnect();
}
