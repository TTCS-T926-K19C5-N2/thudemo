import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(`${process.cwd()}/apps/api/package.json`);
const webRequire = createRequire(`${process.cwd()}/apps/web/package.json`);
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const Redis = require('ioredis');
const { chromium } = webRequire('playwright');

const configPath = 'D:/Merge_2/Codegym-demo-proof-20261023T1530/.sprint1-demo/config.json';
const c = JSON.parse(readFileSync(configPath, 'utf8'));
const buyer = c.accounts.find((a) => a.name === 'buyer' && a.roles.includes('BUYER'));
const url = new URL(`postgresql://${encodeURIComponent(c.user)}:${encodeURIComponent(c.dbPassword)}@127.0.0.1:${c.ports.postgres}/${c.database}`);
if (!/^s1demo-[a-f0-9]{12}$/.test(c.profile) || c.database !== `sprint1_demo_${c.profile.slice(7)}` || url.hostname !== '127.0.0.1' || url.port !== String(c.ports.postgres) || url.pathname !== `/${c.database}`) throw new Error('Exact local demo DB guard failed');

const showtimeId = '914556a8-ba19-4766-9e20-00a3d93df432';
const key = (kind, identity) => `auth:${kind}:${require('node:crypto').createHash('sha256').update(identity).digest('hex')}`;
const redis = new Redis(`redis://127.0.0.1:${c.ports.redis}`, { maxRetriesPerRequest: 1, lazyConnect: true });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 2 }) });
const snapshot = {};
for (const kind of ['lock', 'fail']) {
  const k = key(kind, buyer.email); snapshot[k] = { value: await redis.get(k), ttl: await redis.ttl(k) };
}
const user = await db.user.findUnique({ where: { email: buyer.email }, select: { id: true, password: true, isEmailVerified: true, isActive: true, userRoles: { select: { role: { select: { name: true } } } } } });
if (!user || !user.isActive || !user.isEmailVerified || !user.userRoles.some((x) => x.role.name === 'BUYER') || !(await require('argon2').verify(user.password, buyer.password)) || snapshot[key('lock', buyer.email)].value) throw new Error('Buyer fixture failed read-only preconditions; no login attempt made');
const businessBefore = {
  orders: await db.order.count(),
  tickets: await db.ticket.count(),
  holds: await db.seatHold.count({ where: { showtimeId, expiresAt: { gt: new Date() } } }),
};

const browser = await chromium.launch({ headless: true });
const responses = [];
const pageErrors = [];
let entered = { email: false, password: false };
let finalRoute = '';
let body = '';
let loginErrorVisible = false;
let loggedIn = false;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (e) => pageErrors.push(e.name));
  page.on('response', (r) => { const p = new URL(r.url()).pathname; if (/\/auth\/(login|me|logout)|\/privacy\/me/.test(p)) responses.push({ path: p, status: r.status() }); });
  await page.goto(`http://localhost:3000/shows/${showtimeId}/seats`, { waitUntil: 'domcontentloaded' });
  const email = page.locator('#login-email');
  const password = page.locator('#login-password');
  await email.waitFor({ state: 'visible', timeout: 10000 });
  await email.fill(buyer.email);
  await password.fill(buyer.password);
  entered.email = (await email.inputValue()) === buyer.email;
  entered.password = (await password.inputValue()) === buyer.password;
  if (!entered.email || !entered.password) throw new Error('Browser form did not retain expected synthetic credentials; submit skipped');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForTimeout(1500);
  finalRoute = new URL(page.url()).pathname;
  loggedIn = finalRoute.endsWith('/seats');
  loginErrorVisible = await page.locator('.login-error').isVisible().catch(() => false);
  body = (await page.locator('body').innerText()).slice(0, 5000);
  await page.screenshot({ path: fileURLToPath(new URL('r52-buyer-seat-map-desktop.png', import.meta.url)), fullPage: true });
  if (loggedIn) {
    const logout = page.getByRole('link', { name: 'Đăng xuất' }).or(page.getByRole('button', { name: 'Đăng xuất' })).first();
    if (await logout.count()) { await logout.click(); await page.waitForTimeout(250); }
  }
} finally {
  await browser.close();
}

const businessAfter = {
  orders: await db.order.count(),
  tickets: await db.ticket.count(),
  holds: await db.seatHold.count({ where: { showtimeId, expiresAt: { gt: new Date() } } }),
};
const changedBusinessCounts = JSON.stringify(businessBefore) !== JSON.stringify(businessAfter);
let redisRestored = true;
for (const [k, old] of Object.entries(snapshot)) {
  const current = await redis.get(k);
  if (current !== old.value) {
    if (old.value === null) await redis.del(k);
    else await redis.set(k, old.value, ...(old.ttl > 0 ? ['EX', old.ttl] : []));
  }
  redisRestored &&= (await redis.get(k)) === old.value;
}
await redis.quit();
await db.$disconnect();

const result = {
  run: 'R52', profile: c.profile, sourceBuild: 'R46', viewport: '1280x900',
  formValuesRetained: entered,
  authResponses: responses,
  finalRoute, loggedIn, loginErrorVisible,
  seatMapVisible: /Sơ đồ ghế|Chọn ghế|Sơ đồ vị trí/i.test(body),
  seatNamesVisible: /\b(?:A|B|C|D|E)-\d+\b/.test(body),
  pageErrors,
  businessCountsUnchanged: !changedBusinessCounts,
  redisLockFailureKeysRestored: redisRestored,
  logoutAttempted: loggedIn,
  screenshot: 'r52-buyer-seat-map-desktop.png',
};
writeFileSync(fileURLToPath(new URL('r52-buyer-seat-map-ui.json', import.meta.url)), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
if (!entered.email || !entered.password || !redisRestored || changedBusinessCounts) process.exitCode = 1;
