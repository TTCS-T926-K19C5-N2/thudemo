import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(`${process.cwd()}/apps/api/package.json`);
const webRequire = createRequire(`${process.cwd()}/apps/web/package.json`);
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const argon2 = require('argon2');
const Redis = require('ioredis');
const { chromium } = webRequire('playwright');

const configPath = 'D:/Merge_2/Codegym-demo-proof-20261023T1530/.sprint1-demo/config.json';
const c = JSON.parse(readFileSync(configPath, 'utf8'));
const acctA = c.accounts.find((a) => a.name === 'buyer' && a.roles.includes('BUYER'));
const acctB = c.accounts.find((a) => a.name === 'lock-test' && a.roles.includes('BUYER'));
const dbUrl = new URL(`postgresql://${encodeURIComponent(c.user)}:${encodeURIComponent(c.dbPassword)}@127.0.0.1:${c.ports.postgres}/${c.database}`);
if (!/^s1demo-[a-f0-9]{12}$/.test(c.profile) || c.database !== `sprint1_demo_${c.profile.slice(7)}` || dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== String(c.ports.postgres) || dbUrl.pathname !== `/${c.database}`) throw new Error('Exact demo profile guard failed');

const showtimeId = '914556a8-ba19-4766-9e20-00a3d93df432';
const runId = `R53-${Date.now()}`;
const startedAt = new Date(Date.now() - 1000);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl.toString(), max: 3 }) });
const redis = new Redis(`redis://127.0.0.1:${c.ports.redis}`, { maxRetriesPerRequest: 1, lazyConnect: true });
const browser = await chromium.launch({ headless: true });
const contexts = [];
const pages = [];
const responseLog = [];
const pageErrors = [];
let targetSeat = null;
let releaseVerified = false;
let observedOtherBuyerHold = false;
let databaseDuring = null;
const counts = async () => ({
  orders: await db.order.count(),
  tickets: await db.ticket.count(),
  activeShowtimeHolds: await db.seatHold.count({ where: { showtimeId, expiresAt: { gt: new Date() } } }),
  holdSessions: await db.holdSession.count({ where: { showtimeId } }),
});
const before = await counts();

async function login(account, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  contexts.push(context);
  const page = await context.newPage();
  pages.push(page);
  page.on('pageerror', (e) => pageErrors.push(e.name));
  page.on('response', (r) => { const u = new URL(r.url()); if (/\/api\/(auth|showtimes|privacy)/.test(u.pathname)) responseLog.push({ method: r.request().method(), path: u.pathname, status: r.status() }); });
  await page.goto(`http://localhost:3000/shows/${showtimeId}/seats`, { waitUntil: 'domcontentloaded' });
  await page.locator('#login-email').waitFor({ state: 'visible', timeout: 10000 });
  const emailField = page.locator('#login-email');
  const passwordField = page.locator('#login-password');
  await emailField.fill(account.email);
  await passwordField.fill(account.password);
  if ((await emailField.inputValue()) !== account.email || (await passwordField.inputValue()) !== account.password) throw new Error('Synthetic credentials not retained by UI form');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.locator('section[aria-label="Sơ đồ ghế"]').waitFor({ state: 'visible', timeout: 15000 });
  return page;
}

try {
  const buyers = await Promise.all([acctA, acctB].map(async (a) => {
    const u = await db.user.findUnique({ where: { email: a.email }, select: { id: true, password: true, isActive: true, isEmailVerified: true, userRoles: { select: { role: { select: { name: true } } } } } });
    if (!u || !u.isActive || !u.isEmailVerified || !u.userRoles.some((x) => x.role.name === 'BUYER') || !(await argon2.verify(u.password, a.password))) throw new Error('Buyer fixture precondition failed');
    return { account: a, user: u };
  }));
  const lockKeys = buyers.map(({ account }) => `auth:lock:${require('node:crypto').createHash('sha256').update(account.email).digest('hex')}`);
  if ((await Promise.all(lockKeys.map((k) => redis.get(k)))).some(Boolean)) throw new Error('A synthetic Buyer is locked; no UI attempt made');
  const seats = await db.seat.findMany({ where: { showtimeId, isSold: false, hold: null, row: 'A' }, orderBy: { seatNumber: 'asc' }, select: { id: true, row: true, seatNumber: true } });
  targetSeat = seats.find((s) => s.seatNumber >= 3);
  if (!targetSeat) throw new Error('No run-safe available row-A seat; no hold created');
  const pagesByBuyer = [];
  pagesByBuyer.push(await login(buyers[0].account));
  pagesByBuyer.push(await login(buyers[1].account));
  const [pageA, pageB] = pagesByBuyer;

  const navigateToSeat = async (page) => {
    const canvas = page.locator('canvas[role="application"]');
    let inspector = await page.locator('#seat-inspector').innerText();
    const start = inspector.match(/Hàng\s+(\w+)\s*·\s*Ghế\s+(\d+)/);
    if (!start || start[1] !== 'A') throw new Error('Canvas focus did not start in row A');
    for (let n = Number(start[2]); n < targetSeat.seatNumber; n++) await canvas.press('ArrowRight');
    inspector = await page.locator('#seat-inspector').innerText();
    if (!inspector.includes(`Hàng A · Ghế ${targetSeat.seatNumber}`)) throw new Error('UI keyboard navigation did not reach fixture seat');
    return inspector;
  };

  const initialA = await navigateToSeat(pageA);
  const initialB = await navigateToSeat(pageB);
  if (!/Trạng thái\s+Còn trống/.test(initialA) || !/Trạng thái\s+Còn trống/.test(initialB)) throw new Error('Both independent buyer maps must initially show the chosen seat available');
  await pageA.locator('canvas[role="application"]').press('Enter');
  await pageA.getByRole('button', { name: 'Giữ ghế' }).click();
  await pageA.getByText('Máy chủ đã xác nhận').waitFor({ state: 'visible', timeout: 10000 });
  const hold = await db.seatHold.findUnique({ where: { seatId: targetSeat.id }, include: { holdSession: { select: { id: true, userId: true, createdAt: true, orders: { select: { id: true } } } } } });
  if (!hold || hold.holdSession.userId !== buyers[0].user.id || hold.holdSession.createdAt < startedAt || hold.holdSession.orders.length) throw new Error('Database did not show the expected run-owned temporary hold');
  databaseDuring = await counts();
  const manifest = { runId, profile: c.profile, showtimeId, seat: `${targetSeat.row}-${targetSeat.seatNumber}`, seatId: targetSeat.id, ownerId: buyers[0].user.id, holdSessionId: hold.holdSession.id, before, during: databaseDuring };
  writeFileSync(fileURLToPath(new URL('r53-fixture.json', import.meta.url)), `${JSON.stringify(manifest, null, 2)}\n`);
  await pageA.screenshot({ path: fileURLToPath(new URL('r53-buyer-a-hold-confirmed.png', import.meta.url)), fullPage: true });

  await pageB.reload({ waitUntil: 'domcontentloaded' });
  await pageB.locator('section[aria-label="Sơ đồ ghế"]').waitFor({ state: 'visible', timeout: 10000 });
  const afterReloadB = await navigateToSeat(pageB);
  observedOtherBuyerHold = /Trạng thái\s+Đang được giữ/.test(afterReloadB);
  await pageB.screenshot({ path: fileURLToPath(new URL('r53-buyer-b-sees-held-after-reload.png', import.meta.url)), fullPage: true });

  await pageA.getByRole('button', { name: 'Bỏ ghế' }).click();
  await pageA.getByText('Máy chủ đã xác nhận').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  await pageA.waitForTimeout(400);
  const afterRelease = await db.seatHold.findUnique({ where: { seatId: targetSeat.id }, select: { seatId: true } }).catch(() => null);
  releaseVerified = !afterRelease;
  await pageA.screenshot({ path: fileURLToPath(new URL('r53-buyer-a-after-release.png', import.meta.url)), fullPage: true });
} finally {
  if (targetSeat) {
    const userA = await db.user.findUnique({ where: { email: acctA.email }, select: { id: true } }).catch(() => null);
    if (userA) {
      const created = await db.holdSession.findMany({ where: { showtimeId, userId: userA.id, createdAt: { gte: startedAt }, seats: { some: { seatId: targetSeat.id, showtimeId } } }, include: { orders: { select: { id: true } } } });
      for (const session of created) {
        if (session.orders.length) throw new Error('Guard cleanup refused: run session unexpectedly owns an order');
        await db.seatHold.deleteMany({ where: { seatId: targetSeat.id, showtimeId, holdSessionId: session.id } });
        const remainingSeats = await db.seatHold.count({ where: { holdSessionId: session.id, showtimeId } });
        if (remainingSeats === 0) await db.holdSession.deleteMany({ where: { id: session.id, showtimeId, userId: userA.id, createdAt: { gte: startedAt }, orders: { none: {} } } });
      }
    }
  }
  for (const context of contexts) {
    try { await context.request.post('http://localhost:3000/api/auth/logout', { timeout: 3000 }); } catch {}
    await context.close().catch(() => {});
  }
  await browser.close().catch(() => {});
}

const after = await counts();
const result = {
  runId, profile: c.profile, showtimeId, seat: targetSeat ? `${targetSeat.row}-${targetSeat.seatNumber}` : null,
  twoDistinctBuyers: true, twoDistinctBrowserContexts: contexts.length === 2,
  bothInitiallySawAvailable: true, firstBuyerHoldConfirmed: !!databaseDuring,
  secondBuyerSawHeldAfterReload: observedOtherBuyerHold,
  firstBuyerReleasedHold: releaseVerified,
  businessCountsBefore: before, businessCountsAfterCleanup: after,
  countsRestored: before.orders === after.orders && before.tickets === after.tickets && before.activeShowtimeHolds === after.activeShowtimeHolds && before.holdSessions === after.holdSessions,
  pageErrors, relevantHttp: responseLog.filter((x) => /holds|auth\/login|auth\/logout/.test(x.path)),
  evidence: ['r53-fixture.json', 'r53-buyer-a-hold-confirmed.png', 'r53-buyer-b-sees-held-after-reload.png', 'r53-buyer-a-after-release.png'],
};
writeFileSync(fileURLToPath(new URL('r53-cross-buyer-hold-refresh.json', import.meta.url)), `${JSON.stringify(result, null, 2)}\n`);
await redis.quit();
await db.$disconnect();
console.log(JSON.stringify(result));
