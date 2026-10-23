import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ar = createRequire(`${process.cwd()}/apps/api/package.json`), wr = createRequire(`${process.cwd()}/apps/web/package.json`);
const { PrismaClient } = ar('@prisma/client'), { PrismaPg } = ar('@prisma/adapter-pg'), argon2 = ar('argon2'), { chromium } = wr('playwright');
const c = JSON.parse(readFileSync('D:/Merge_2/Codegym-demo-proof-20261023T1530/.sprint1-demo/config.json', 'utf8'));
const buyer = c.accounts.find((a) => a.name === 'lock-test' && a.roles.includes('BUYER'));
const showtimeId = '914556a8-ba19-4766-9e20-00a3d93df432';
const url = new URL(`postgresql://${encodeURIComponent(c.user)}:${encodeURIComponent(c.dbPassword)}@127.0.0.1:${c.ports.postgres}/${c.database}`);
if (!/^s1demo-[a-f0-9]{12}$/.test(c.profile) || c.database !== `sprint1_demo_${c.profile.slice(7)}` || url.hostname !== '127.0.0.1' || url.port !== String(c.ports.postgres)) throw new Error('Exact profile guard failed');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 2 }) });
const user = await db.user.findUnique({ where: { email: buyer.email }, select: { id: true, password: true, isActive: true, isEmailVerified: true, userRoles: { select: { role: { select: { name: true } } } } } });
if (!user?.isActive || !user.isEmailVerified || !user.userRoles.some((x) => x.role.name === 'BUYER') || !(await argon2.verify(user.password, buyer.password))) throw new Error('Synthetic Buyer precondition failed');
const beforeShow = await db.showtime.findUnique({ where: { id: showtimeId }, select: { status: true, isDemo: true } });
const target = await db.seat.findFirst({ where: { showtimeId, row: 'A', seatNumber: 3, isSold: false, hold: null }, select: { id: true, row: true, seatNumber: true } });
if (beforeShow?.status !== 'ON_SALE' || beforeShow.isDemo || !target) throw new Error('Showtime/seat precondition failed; no write made');
const before = { orders: await db.order.count(), tickets: await db.ticket.count(), holds: await db.seatHold.count({ where: { showtimeId } }), sessions: await db.holdSession.count({ where: { showtimeId } }) };
const startedAt = new Date(Date.now() - 1000), browser = await chromium.launch({ headless: true }), context = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await context.newPage();
const http = [], errors = []; let selected = false, closedFixtureApplied = false, closedResponse = null, expectedMessage = false, unrelatedError = '', restoredStatus = false;
page.on('pageerror', (e) => errors.push(e.name));
page.on('response', (r) => { const p = new URL(r.url()).pathname; if (/holds|showtimes\//.test(p)) http.push({ method: r.request().method(), path: p, status: r.status() }); });
try {
  await page.goto(`http://localhost:3000/shows/${showtimeId}/seats`, { waitUntil: 'domcontentloaded' });
  await page.locator('#login-email').fill(buyer.email); await page.locator('#login-password').fill(buyer.password); await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.locator('section[aria-label="Sơ đồ ghế"]').waitFor({ state: 'visible', timeout: 15000 });
  const canvas = page.locator('canvas[role="application"]'), inspector = page.locator('#seat-inspector');
  const initial = (await inspector.innerText()).match(/Hàng\s+(\w+)\s*·\s*Ghế\s+(\d+)/); if (!initial || initial[1] !== 'A') throw new Error('Initial focus not row A');
  for (let n = Number(initial[2]); n < target.seatNumber; n++) await canvas.press('ArrowRight');
  if (!(await inspector.innerText()).includes(`Hàng A · Ghế ${target.seatNumber}`) || !/Còn trống/.test(await inspector.innerText())) throw new Error('Target seat not available in UI snapshot');
  await canvas.press('Enter'); selected = (await inspector.innerText()).includes('Đang chọn');
  if (!selected) throw new Error('UI did not select target seat; no status fixture changed');
  const changed = await db.showtime.updateMany({ where: { id: showtimeId, status: 'ON_SALE', isDemo: false }, data: { status: 'CLOSED' } });
  if (changed.count !== 1) throw new Error('Exact ON_SALE->CLOSED fixture update guard refused');
  closedFixtureApplied = true;
  await page.getByRole('button', { name: 'Giữ ghế' }).click();
  await page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/holds'), { timeout: 10000 }).then((r) => { closedResponse = { status: r.status(), body: r.json().catch(() => null) }; }).catch(() => {});
  await page.waitForTimeout(300);
  const text = await page.locator('body').innerText();
  expectedMessage = text.includes('Suất diễn đã đóng bán. Chọn suất khác.');
  unrelatedError = text.includes('Chưa xác nhận được trạng thái trên máy chủ') ? 'Client follow-up replaced the closed-showtime message with a generic reconciliation error.' : '';
  await page.screenshot({ path: fileURLToPath(new URL('r60-closed-showtime-hold-ui.png', import.meta.url)), fullPage: true });
} finally {
  if (closedFixtureApplied) {
    const restore = await db.showtime.updateMany({ where: { id: showtimeId, status: 'CLOSED', isDemo: false }, data: { status: 'ON_SALE' } });
    restoredStatus = restore.count === 1;
  }
  const sessions = await db.holdSession.findMany({ where: { showtimeId, userId: user.id, createdAt: { gte: startedAt }, orders: { none: {} } }, include: { orders: { select: { id: true } } } });
  for (const s of sessions) { if (s.orders.length) throw new Error('Cleanup refused: run session has order'); await db.seatHold.deleteMany({ where: { showtimeId, holdSessionId: s.id, seatId: target.id } }); if (!(await db.seatHold.count({ where: { holdSessionId: s.id } }))) await db.holdSession.deleteMany({ where: { id: s.id, showtimeId, userId: user.id, createdAt: { gte: startedAt }, orders: { none: {} }, seats: { none: {} } } }); }
  await context.request.post('http://localhost:3000/api/auth/logout').catch(() => {}); await context.close(); await browser.close();
}
const afterShow = await db.showtime.findUnique({ where: { id: showtimeId }, select: { status: true, isDemo: true } });
const after = { orders: await db.order.count(), tickets: await db.ticket.count(), holds: await db.seatHold.count({ where: { showtimeId } }), sessions: await db.holdSession.count({ where: { showtimeId } }) };
await db.$disconnect();
const result = { run: 'R60', profile: c.profile, showtimeId, selected, closedFixtureApplied, closedResponseStatus: closedResponse?.status ?? null, expectedMessage, unrelatedError, restoredStatus, finalShowtime: afterShow, before, after, countsRestored: JSON.stringify(before) === JSON.stringify(after), http, pageErrors: errors, screenshot: 'r60-closed-showtime-hold-ui.png' };
writeFileSync(fileURLToPath(new URL('r60-closed-showtime-hold-ui.json', import.meta.url)), `${JSON.stringify(result, null, 2)}\n`); console.log(JSON.stringify(result));
