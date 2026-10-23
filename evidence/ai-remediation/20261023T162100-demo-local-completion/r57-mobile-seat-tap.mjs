import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const apiRequire = createRequire(`${process.cwd()}/apps/api/package.json`);
const webRequire = createRequire(`${process.cwd()}/apps/web/package.json`);
const { PrismaClient } = apiRequire('@prisma/client');
const { PrismaPg } = apiRequire('@prisma/adapter-pg');
const argon2 = apiRequire('argon2');
const { chromium } = webRequire('playwright');
const c = JSON.parse(readFileSync('D:/Merge_2/Codegym-demo-proof-20261023T1530/.sprint1-demo/config.json', 'utf8'));
const account = c.accounts.find((a) => a.name === 'buyer' && a.roles.includes('BUYER'));
const showtimeId = '914556a8-ba19-4766-9e20-00a3d93df432';
const dbUrl = new URL(`postgresql://${encodeURIComponent(c.user)}:${encodeURIComponent(c.dbPassword)}@127.0.0.1:${c.ports.postgres}/${c.database}`);
if (!/^s1demo-[a-f0-9]{12}$/.test(c.profile) || c.database !== `sprint1_demo_${c.profile.slice(7)}` || dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== String(c.ports.postgres) || dbUrl.pathname !== `/${c.database}`) throw new Error('Exact demo profile guard failed');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl.toString(), max: 2 }) });
const user = await db.user.findUnique({ where: { email: account.email }, select: { id: true, password: true, isActive: true, isEmailVerified: true, userRoles: { select: { role: { select: { name: true } } } } } });
if (!user?.isActive || !user.isEmailVerified || !user.userRoles.some((r) => r.role.name === 'BUYER') || !(await argon2.verify(user.password, account.password))) throw new Error('Synthetic Buyer precondition failed; no login attempted');
const seats = await db.seat.findMany({ where: { showtimeId }, orderBy: [{ row: 'asc' }, { seatNumber: 'asc' }], select: { id: true, row: true, seatNumber: true, category: true, isSold: true, hold: { select: { seatId: true } } } });
const target = seats.find((s) => s.row === 'A' && !s.isSold && !s.hold);
if (!target) throw new Error('No available row A fixture seat');
const baseline = { orders: await db.order.count(), tickets: await db.ticket.count(), sessions: await db.holdSession.count({ where: { showtimeId } }), holds: await db.seatHold.count({ where: { showtimeId } }) };
const runStarted = new Date(Date.now() - 1000);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const page = await context.newPage();
const http = [];
const errors = [];
page.on('pageerror', (e) => errors.push(e.name));
page.on('response', (r) => { const p = new URL(r.url()).pathname; if (/auth\/login|holds|auth\/logout/.test(p)) http.push({ method: r.request().method(), path: p, status: r.status() }); });
let clickedSeat = false, inspectorMatches = false, zoomChanged = false, holdOwnedByFixtureBuyer = false, releaseConfirmed = false, inspectorAfterTap = '';
let zoomStart = '', zoomAfter = '', targetPosition = null;
try {
  await page.goto(`http://localhost:3000/shows/${showtimeId}/seats`, { waitUntil: 'domcontentloaded' });
  await page.locator('#login-email').fill(account.email);
  await page.locator('#login-password').fill(account.password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.locator('section[aria-label="Sơ đồ ghế"]').waitFor({ state: 'visible', timeout: 15000 });
  const canvas = page.locator('canvas[role="application"]');
  zoomStart = await page.getByLabel('Mức thu phóng').innerText();
  await page.getByRole('button', { name: 'Phóng to' }).click();
  zoomAfter = await page.getByLabel('Mức thu phóng').innerText();
  zoomChanged = zoomStart !== zoomAfter;
  const box = await canvas.boundingBox();
  const viewWidth = await canvas.evaluate((node) => node.parentElement.clientWidth);
  const maxSeat = Math.max(...seats.map((s) => s.seatNumber));
  const aisleSeats = new Set();
  const rows = [...new Set(seats.map((s) => s.row))];
  for (const row of rows) {
    const list = seats.filter((s) => s.row === row).toSorted((a, b) => a.seatNumber - b.seatNumber);
    for (let i = 1; i < list.length; i++) if (list[i].category.name !== list[i - 1].category.name) aisleSeats.add(list[i - 1].seatNumber);
  }
  if (!aisleSeats.size && maxSeat >= 8) aisleSeats.add(Math.floor(maxSeat / 2));
  const pitch = Math.max(35, Math.min(54, (viewWidth - 64 - aisleSeats.size * 28) / maxSeat));
  const offset = (n) => (n - 1) * pitch + [...aisleSeats].filter((a) => a < n).length * 28;
  const byRow = seats.filter((s) => s.row === target.row);
  const span = offset(Math.max(...byRow.map((s) => s.seatNumber))) - offset(Math.min(...byRow.map((s) => s.seatNumber))) + 26;
  const contentW = Math.max(26, ...rows.map((row) => { const list = seats.filter((s) => s.row === row); return offset(Math.max(...list.map((s) => s.seatNumber))) - offset(Math.min(...list.map((s) => s.seatNumber))) + 26; }));
  const width = Math.max(560, contentW + 112, viewWidth);
  const left = (width - contentW) / 2;
  const rowTop = 120 + rows.indexOf(target.row) * 38;
  const x = left + (contentW - span) / 2 + offset(target.seatNumber);
  const zoom = Number(zoomAfter.replace('%', '')) / 100;
  targetPosition = { row: target.row, seatNumber: target.seatNumber, x: +(x + 13) * zoom, y: +(rowTop + 13) * zoom, canvas: { x: box.x, y: box.y, width: box.width, height: box.height }, zoomAfter, layout: { viewWidth, maxSeat, aisleCount: aisleSeats.size, contentW, width, left, pitch, rowTop, x } };
  await canvas.click({ position: { x: targetPosition.x, y: targetPosition.y }, force: true });
  await page.waitForTimeout(250);
  const inspector = await page.locator('#seat-inspector').innerText();
  inspectorAfterTap = inspector;
  inspectorMatches = inspector.includes(`Hàng ${target.row} · Ghế ${target.seatNumber}`) && inspector.includes('Đang chọn');
  clickedSeat = inspectorMatches;
  if (clickedSeat) {
    await page.getByRole('button', { name: 'Giữ ghế' }).click();
    await page.getByText('Máy chủ đã xác nhận').waitFor({ state: 'visible', timeout: 10000 });
    const hold = await db.seatHold.findUnique({ where: { seatId: target.id }, include: { holdSession: { select: { userId: true, createdAt: true, orders: { select: { id: true } } } } } });
    holdOwnedByFixtureBuyer = !!hold && hold.holdSession.userId === user.id && hold.holdSession.createdAt >= runStarted && hold.holdSession.orders.length === 0;
    await page.getByRole('button', { name: 'Bỏ ghế' }).click();
    await page.waitForTimeout(400);
    releaseConfirmed = !(await db.seatHold.findUnique({ where: { seatId: target.id }, select: { seatId: true } }));
  }
  await page.screenshot({ path: fileURLToPath(new URL('r57-mobile-seat-selected.png', import.meta.url)), fullPage: true });
} finally {
  if (target) {
    const sessions = await db.holdSession.findMany({ where: { showtimeId, userId: user.id, createdAt: { gte: runStarted }, seats: { some: { seatId: target.id, showtimeId } } }, include: { orders: { select: { id: true } } } });
    for (const session of sessions) {
      if (session.orders.length) throw new Error('Cleanup refused: test-created hold unexpectedly has an order');
      await db.seatHold.deleteMany({ where: { seatId: target.id, showtimeId, holdSessionId: session.id } });
      if (!(await db.seatHold.count({ where: { holdSessionId: session.id } }))) await db.holdSession.deleteMany({ where: { id: session.id, userId: user.id, createdAt: { gte: runStarted }, orders: { none: {} } } });
    }
    const emptyRunSessions = await db.holdSession.findMany({ where: { showtimeId, userId: user.id, createdAt: { gte: runStarted }, orders: { none: {} }, seats: { none: {} } }, select: { id: true, createdAt: true } });
    for (const session of emptyRunSessions) await db.holdSession.deleteMany({ where: { id: session.id, showtimeId, userId: user.id, createdAt: session.createdAt, orders: { none: {} }, seats: { none: {} } } });
  }
  await context.request.post('http://localhost:3000/api/auth/logout').catch(() => {});
  await context.close(); await browser.close();
}
const after = { orders: await db.order.count(), tickets: await db.ticket.count(), sessions: await db.holdSession.count({ where: { showtimeId } }), holds: await db.seatHold.count({ where: { showtimeId } }) };
await db.$disconnect();
const result = { run: 'R57', profile: c.profile, viewport: '390x844 touch', targetSeat: `${target.row}-${target.seatNumber}`, zoomStart, zoomAfter, zoomChanged, targetPosition, inspectorAfterTap, clickedSeat, inspectorMatches, holdOwnedByFixtureBuyer, releaseConfirmed, baseline, after, baselineRestored: JSON.stringify(baseline) === JSON.stringify(after), http, pageErrors: errors, screenshot: 'r57-mobile-seat-selected.png' };
writeFileSync(fileURLToPath(new URL('r57-mobile-seat-tap.json', import.meta.url)), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
