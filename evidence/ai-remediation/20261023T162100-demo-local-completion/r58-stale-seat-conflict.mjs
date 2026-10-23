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
const acctA = c.accounts.find((a) => a.name === 'buyer' && a.roles.includes('BUYER'));
const acctB = c.accounts.find((a) => a.name === 'lock-test' && a.roles.includes('BUYER'));
const showtimeId = '914556a8-ba19-4766-9e20-00a3d93df432';
const dbUrl = new URL(`postgresql://${encodeURIComponent(c.user)}:${encodeURIComponent(c.dbPassword)}@127.0.0.1:${c.ports.postgres}/${c.database}`);
if (!/^s1demo-[a-f0-9]{12}$/.test(c.profile) || c.database !== `sprint1_demo_${c.profile.slice(7)}` || dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== String(c.ports.postgres) || dbUrl.pathname !== `/${c.database}`) throw new Error('Exact demo profile guard failed');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl.toString(), max: 3 }) });
const users = [];
for (const a of [acctA, acctB]) {
  const u = await db.user.findUnique({ where: { email: a.email }, select: { id: true, password: true, isActive: true, isEmailVerified: true, userRoles: { select: { role: { select: { name: true } } } } } });
  if (!u?.isActive || !u.isEmailVerified || !u.userRoles.some((r) => r.role.name === 'BUYER') || !(await argon2.verify(u.password, a.password))) throw new Error('Synthetic Buyer precondition failed; no login attempted');
  users.push(u);
}
const seat = await db.seat.findFirst({ where: { showtimeId, row: 'A', isSold: false, hold: null, seatNumber: { gte: 3 } }, orderBy: { seatNumber: 'asc' }, select: { id: true, row: true, seatNumber: true } });
if (!seat) throw new Error('No safe available A-row test seat');
const startedAt = new Date(Date.now() - 1000);
const counts = async () => ({ orders: await db.order.count(), tickets: await db.ticket.count(), holds: await db.seatHold.count({ where: { showtimeId } }), sessions: await db.holdSession.count({ where: { showtimeId } }) });
const before = await counts();
const browser = await chromium.launch({ headless: true });
const contexts = [], pages = [], http = [], errors = [];
let initialBothAvailable = false, ownerHoldConfirmed = false, staleSelectionSubmitted = false, conflictMessage = false, mapAutoUpdated = false, rejectedPost = null, ownerReleased = false, staleClientStreamBlocked = false;
try {
  for (const [i, account] of [acctA, acctB].entries()) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }); contexts.push(context);
    if (i === 1) {
      await context.route(`**/api/showtimes/${showtimeId}/seats/stream`, (route) => { staleClientStreamBlocked = true; return route.abort(); });
    }
    const page = await context.newPage(); pages.push(page);
    page.on('pageerror', (e) => errors.push(e.name));
    page.on('response', (r) => { const p = new URL(r.url()).pathname; if (/holds|\/seats(?:\/|$)|auth\/login|auth\/logout/.test(p)) http.push({ buyer: i, method: r.request().method(), path: p, status: r.status() }); });
    await page.goto(`http://localhost:3000/shows/${showtimeId}/seats`, { waitUntil: 'domcontentloaded' });
    await page.locator('#login-email').fill(account.email); await page.locator('#login-password').fill(account.password);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await page.locator('section[aria-label="Sơ đồ ghế"]').waitFor({ state: 'visible', timeout: 15000 });
    const canvas = page.locator('canvas[role="application"]');
    const inspector = page.locator('#seat-inspector');
    const initial = await inspector.innerText();
    const focus = initial.match(/Hàng\s+(\w+)\s*·\s*Ghế\s+(\d+)/);
    if (!focus || focus[1] !== seat.row) throw new Error('Seat map initial focus not in row A');
    for (let n = Number(focus[2]); n < seat.seatNumber; n++) await canvas.press('ArrowRight');
    if (!(await inspector.innerText()).includes(`Hàng A · Ghế ${seat.seatNumber}`) || !/Trạng thái\s+Còn trống/.test(await inspector.innerText())) throw new Error('Buyer did not initially see target seat as available');
  }
  initialBothAvailable = true;
  await pages[0].locator('canvas[role="application"]').press('Enter');
  await pages[0].getByRole('button', { name: 'Giữ ghế' }).click();
  await pages[0].getByText('Máy chủ đã xác nhận').waitFor({ state: 'visible', timeout: 10000 });
  const active = await db.seatHold.findUnique({ where: { seatId: seat.id }, include: { holdSession: { select: { userId: true, createdAt: true, orders: { select: { id: true } } } } } });
  ownerHoldConfirmed = !!active && active.holdSession.userId === users[0].id && active.holdSession.createdAt >= startedAt && active.holdSession.orders.length === 0;
  await pages[0].screenshot({ path: fileURLToPath(new URL('r58-buyer-a-held-seat.png', import.meta.url)), fullPage: true });
  // Buyer B retains the pre-hold UI snapshot; attempt the same seat through the UI.
  await pages[1].locator('canvas[role="application"]').press('Enter');
  staleSelectionSubmitted = (await pages[1].locator('#seat-inspector').innerText()).includes('Đang chọn');
  if (staleSelectionSubmitted) {
    await pages[1].getByRole('button', { name: 'Giữ ghế' }).click();
    await pages[1].getByText('vừa được người khác giữ', { exact: false }).waitFor({ state: 'visible', timeout: 10000 });
    conflictMessage = true;
    await pages[1].waitForFunction(() => document.querySelector('#seat-inspector')?.textContent?.includes('Đang được giữ'), { timeout: 10000 });
  }
  rejectedPost = http.find((x) => x.buyer === 1 && x.method === 'POST' && x.path.endsWith('/holds')) ?? null;
  const ownerSnapshot = await pages[1].locator('#seat-inspector').innerText();
  mapAutoUpdated = ownerSnapshot.includes('Đang được giữ');
  await pages[1].screenshot({ path: fileURLToPath(new URL('r58-buyer-b-conflict.png', import.meta.url)), fullPage: true });
  await pages[0].getByRole('button', { name: 'Bỏ ghế' }).click();
  await pages[0].waitForTimeout(350);
  ownerReleased = !(await db.seatHold.findUnique({ where: { seatId: seat.id }, select: { seatId: true } }));
} finally {
  const ownerIds = users.map((u) => u.id);
  const sessions = await db.holdSession.findMany({ where: { showtimeId, userId: { in: ownerIds }, createdAt: { gte: startedAt }, orders: { none: {} } }, include: { orders: { select: { id: true } } } });
  for (const session of sessions) {
    if (session.orders.length) throw new Error('Cleanup refused: test-created session unexpectedly has an order');
    await db.seatHold.deleteMany({ where: { showtimeId, holdSessionId: session.id, seatId: seat.id } });
    if (!(await db.seatHold.count({ where: { holdSessionId: session.id } }))) await db.holdSession.deleteMany({ where: { id: session.id, showtimeId, userId: { in: ownerIds }, createdAt: { gte: startedAt }, orders: { none: {} }, seats: { none: {} } } });
  }
  for (const context of contexts) { await context.request.post('http://localhost:3000/api/auth/logout').catch(() => {}); await context.close().catch(() => {}); }
  await browser.close().catch(() => {});
}
const after = await counts(); await db.$disconnect();
const result = { run: 'R58', profile: c.profile, showtimeId, seat: `${seat.row}-${seat.seatNumber}`, twoDistinctBuyers: true, initialBothAvailable, ownerHoldConfirmed, staleClientStreamBlocked, staleSelectionSubmitted, rejectedPost, conflictMessage, mapAutoUpdated, ownerReleased, before, after, countsRestored: JSON.stringify(before) === JSON.stringify(after), http, pageErrors: errors, evidence: ['r58-buyer-a-held-seat.png', 'r58-buyer-b-conflict.png'] };
writeFileSync(fileURLToPath(new URL('r58-stale-seat-conflict.json', import.meta.url)), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
