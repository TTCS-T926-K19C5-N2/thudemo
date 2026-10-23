import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const apiRequire = createRequire(`${process.cwd()}/apps/api/package.json`), webRequire = createRequire(`${process.cwd()}/apps/web/package.json`);
const { PrismaClient } = apiRequire('@prisma/client'), { PrismaPg } = apiRequire('@prisma/adapter-pg'), argon2 = apiRequire('argon2'), { chromium } = webRequire('playwright');
const c = JSON.parse(readFileSync('D:/Merge_2/Codegym-demo-proof-20261023T1530/.sprint1-demo/config.json', 'utf8'));
const buyer = c.accounts.find((a) => a.name === 'lock-test' && a.roles.includes('BUYER'));
const showtimeId = '914556a8-ba19-4766-9e20-00a3d93df432';
const url = new URL(`postgresql://${encodeURIComponent(c.user)}:${encodeURIComponent(c.dbPassword)}@127.0.0.1:${c.ports.postgres}/${c.database}`);
if (!/^s1demo-[a-f0-9]{12}$/.test(c.profile) || c.database !== `sprint1_demo_${c.profile.slice(7)}` || url.hostname !== '127.0.0.1' || url.port !== String(c.ports.postgres) || url.pathname !== `/${c.database}`) throw new Error('Exact demo DB guard failed');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 2 }) });
const user = await db.user.findUnique({ where: { email: buyer.email }, select: { id: true, password: true, isActive: true, isEmailVerified: true, userRoles: { select: { role: { select: { name: true } } } } } });
if (!user?.isActive || !user.isEmailVerified || !user.userRoles.some((r) => r.role.name === 'BUYER') || !(await argon2.verify(user.password, buyer.password))) throw new Error('Buyer precondition failed');
const targets = await db.seat.findMany({ where: { showtimeId, row: 'A', seatNumber: { in: [3, 4, 5] }, isSold: false, hold: null }, orderBy: { seatNumber: 'asc' }, select: { id: true, row: true, seatNumber: true } });
if (targets.length !== 3) throw new Error('Seats A-3/A-4/A-5 not all available; test not started');
const startedAt = new Date(Date.now() - 1000);
const before = { orders: await db.order.count(), tickets: await db.ticket.count(), holds: await db.seatHold.count({ where: { showtimeId } }), sessions: await db.holdSession.count({ where: { showtimeId } }) };
const browser = await chromium.launch({ headless: true }), context = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await context.newPage();
const http = [], errors = []; let selectedSeats = [], expiries = [], sameExpiry = false, commonTimer = false, released = false, holdConfirmed = false, bodyOnHoldResult = '';
page.on('pageerror', (e) => errors.push(e.name));
page.on('response', (r) => { const p = new URL(r.url()).pathname; if (/holds|auth\/login|auth\/logout/.test(p)) http.push({ method: r.request().method(), path: p, status: r.status() }); });
try {
  await page.goto(`http://localhost:3000/shows/${showtimeId}/seats`, { waitUntil: 'domcontentloaded' });
  await page.locator('#login-email').fill(buyer.email); await page.locator('#login-password').fill(buyer.password); await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.locator('section[aria-label="Sơ đồ ghế"]').waitFor({ state: 'visible', timeout: 15000 });
  const canvas = page.locator('canvas[role="application"]'), inspector = page.locator('#seat-inspector');
  const initial = (await inspector.innerText()).match(/Hàng\s+(\w+)\s*·\s*Ghế\s+(\d+)/);
  if (!initial || initial[1] !== 'A') throw new Error('Initial map focus is not row A');
  for (const n of [3, 4, 5]) {
    const current = Number((await inspector.innerText()).match(/Ghế\s+(\d+)/)?.[1]);
    while (current < n) { await canvas.press('ArrowRight'); break; }
    if (current !== n) { const now = Number((await inspector.innerText()).match(/Ghế\s+(\d+)/)?.[1]); for (let i = now; i < n; i++) await canvas.press('ArrowRight'); }
    if (!(await inspector.innerText()).includes(`Hàng A · Ghế ${n}`)) throw new Error(`UI navigation missed A-${n}`);
    await canvas.press('Enter');
    selectedSeats.push(`A-${n}`);
    await page.waitForTimeout(1100);
  }
  await page.screenshot({ path: fileURLToPath(new URL('r59-three-seats-selected.png', import.meta.url)), fullPage: true });
  await page.getByRole('button', { name: 'Giữ ghế' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Máy chủ đã xác nhận'), null, { timeout: 10000 }).then(() => { holdConfirmed = true; }).catch(() => {});
  bodyOnHoldResult = (await page.locator('body').innerText()).slice(-2500);
  const rows = await db.seatHold.findMany({ where: { seatId: { in: targets.map((s) => s.id) }, showtimeId }, include: { holdSession: { select: { userId: true, createdAt: true } } }, orderBy: { seatId: 'asc' } });
  const ownerMatch = rows.length === 3 && rows.every((h) => h.holdSession.userId === user.id && h.holdSession.createdAt >= startedAt);
  expiries = rows.map((h) => h.expiresAt.toISOString());
  sameExpiry = ownerMatch && new Set(expiries).size === 1;
  commonTimer = (await page.getByLabel('Thời gian giữ ghế').innerText()).trim() !== '--:--';
  await page.screenshot({ path: fileURLToPath(new URL('r59-three-seat-hold-confirmed.png', import.meta.url)), fullPage: true });
  if (holdConfirmed) {
    for (let i = 0; i < 3; i++) {
      const remove = page.getByRole('button', { name: 'Bỏ ghế' }).first();
      if (!(await remove.count())) break;
      await remove.click(); await page.waitForTimeout(200);
    }
    await page.waitForTimeout(350);
  }
  released = (await db.seatHold.count({ where: { seatId: { in: targets.map((s) => s.id) }, showtimeId } })) === 0;
} finally {
  const sessions = await db.holdSession.findMany({ where: { showtimeId, userId: user.id, createdAt: { gte: startedAt }, orders: { none: {} } }, include: { orders: { select: { id: true } } } });
  for (const s of sessions) {
    if (s.orders.length) throw new Error('Cleanup refused: run session has an order');
    await db.seatHold.deleteMany({ where: { showtimeId, holdSessionId: s.id, seatId: { in: targets.map((t) => t.id) } } });
    if (!(await db.seatHold.count({ where: { holdSessionId: s.id } }))) await db.holdSession.deleteMany({ where: { id: s.id, showtimeId, userId: user.id, createdAt: { gte: startedAt }, orders: { none: {} }, seats: { none: {} } } });
  }
  await context.request.post('http://localhost:3000/api/auth/logout').catch(() => {}); await context.close(); await browser.close();
}
const after = { orders: await db.order.count(), tickets: await db.ticket.count(), holds: await db.seatHold.count({ where: { showtimeId } }), sessions: await db.holdSession.count({ where: { showtimeId } }) };
await db.$disconnect();
const result = { run: 'R59', profile: c.profile, showtimeId, testAccount: 'lock-test synthetic Buyer', selectedSeats, selectionSpacingMs: 1100, holdConfirmed, bodyOnHoldResult, commonHoldExpiry: sameExpiry, expiries, commonVisibleTimer: commonTimer, released, before, after, countsRestored: JSON.stringify(before) === JSON.stringify(after), http, pageErrors: errors, evidence: ['r59-three-seats-selected.png', 'r59-three-seat-hold-confirmed.png'] };
writeFileSync(fileURLToPath(new URL('r59-shared-hold-expiry.json', import.meta.url)), `${JSON.stringify(result, null, 2)}\n`); console.log(JSON.stringify(result));
