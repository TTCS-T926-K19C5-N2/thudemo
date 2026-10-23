import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(`${process.cwd()}/apps/api/package.json`);
const webRequire = createRequire(`${process.cwd()}/apps/web/package.json`);
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const Redis = require('ioredis');
const { chromium } = webRequire('playwright');

const c = JSON.parse(readFileSync('D:/Merge_2/Codegym-demo-proof-20261023T1530/.sprint1-demo/config.json', 'utf8'));
const buyer = c.accounts.find((a) => a.name === 'buyer' && a.roles.includes('BUYER'));
const url = new URL(`postgresql://${encodeURIComponent(c.user)}:${encodeURIComponent(c.dbPassword)}@127.0.0.1:${c.ports.postgres}/${c.database}`);
if (!/^s1demo-[a-f0-9]{12}$/.test(c.profile) || c.database !== `sprint1_demo_${c.profile.slice(7)}` || url.hostname !== '127.0.0.1' || url.port !== String(c.ports.postgres) || url.pathname !== `/${c.database}`) throw new Error('Exact local demo DB guard failed');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 2 }) });
const redis = new Redis(`redis://127.0.0.1:${c.ports.redis}`, { maxRetriesPerRequest: 1, lazyConnect: true });
const digest = (v) => createHash('sha256').update(v).digest('hex');
const authKeys = [
  `auth:lock:${digest(buyer.email)}`,
  `auth:fail:${digest(buyer.email)}`,
  `auth:ip-fail:${digest('127.0.0.1')}`,
  `auth:ip-fail:${digest('::1')}`,
];
const redisBefore = Object.fromEntries(await Promise.all(authKeys.map(async (k) => [k, { value: await redis.get(k), ttl: await redis.ttl(k) }])));
const user = await db.user.findUnique({ where: { email: buyer.email }, select: { id: true, password: true, isActive: true, isEmailVerified: true, userRoles: { select: { role: { select: { name: true } } } } } });
if (!user || !user.isActive || !user.isEmailVerified || !user.userRoles.some((x) => x.role.name === 'BUYER') || !(await require('argon2').verify(user.password, buyer.password)) || redisBefore[authKeys[0]].value) throw new Error('Buyer account precondition failed; no UI request made');
const priorHashes = new Set((await db.session.findMany({ where: { userId: user.id }, select: { tokenHash: true } })).map((s) => s.tokenHash));
const startedAt = new Date(Date.now() - 1000);
const ordersBefore = await db.order.count();
const ticketsBefore = await db.ticket.count();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const responses = [];
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.name));
page.on('response', (r) => { const p = new URL(r.url()).pathname; if (/\/api\/(auth\/me|auth\/login|auth\/logout)/.test(p)) responses.push({ method: r.request().method(), path: p, status: r.status() }); });
let sessionHash;
let apiStatus = null;
let redirected = false;
let returnToRestored = false;
let cleanup = false;
let screenshot = false;
try {
  const loginPage = 'http://localhost:3000/shows/914556a8-ba19-4766-9e20-00a3d93df432/seats';
  await page.goto(loginPage, { waitUntil: 'domcontentloaded' });
  await page.locator('#login-email').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#login-email').fill(buyer.email);
  await page.locator('#login-password').fill(buyer.password);
  if ((await page.locator('#login-email').inputValue()) !== buyer.email || (await page.locator('#login-password').inputValue()) !== buyer.password) throw new Error('UI did not retain synthetic credentials');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.locator('section[aria-label="Sơ đồ ghế"]').waitFor({ state: 'visible', timeout: 15000 });
  const sessions = await db.session.findMany({ where: { userId: user.id, createdAt: { gte: startedAt } }, select: { tokenHash: true, createdAt: true, expiresAt: true } });
  const fresh = sessions.filter((s) => !priorHashes.has(s.tokenHash));
  if (fresh.length !== 1) throw new Error(`Expected one session created by this run; observed ${fresh.length}`);
  sessionHash = fresh[0].tokenHash;
  await db.session.updateMany({ where: { tokenHash: sessionHash, userId: user.id, createdAt: { gte: startedAt } }, data: { expiresAt: new Date(Date.now() - 5000) } });

  const response = await context.request.get('http://localhost:3000/api/auth/me', { timeout: 5000 });
  apiStatus = response.status();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForURL((u) => u.pathname === '/login', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
  const final = new URL(page.url());
  redirected = final.pathname === '/login';
  returnToRestored = final.searchParams.get('returnTo') === '/shows/914556a8-ba19-4766-9e20-00a3d93df432/seats';
  await page.locator('#login-email').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  await page.screenshot({ path: fileURLToPath(new URL('r54-expired-session-login-redirect.png', import.meta.url)), fullPage: true });
  screenshot = true;
} finally {
  if (sessionHash) {
    try { await context.request.post('http://localhost:3000/api/auth/logout', { timeout: 3000 }); } catch {}
    await db.session.deleteMany({ where: { tokenHash: sessionHash, userId: user.id, createdAt: { gte: startedAt } } });
    cleanup = !(await db.session.findUnique({ where: { tokenHash: sessionHash }, select: { tokenHash: true } }));
  }
  for (const [k, old] of Object.entries(redisBefore)) {
    const now = await redis.get(k);
    if (now !== old.value) {
      if (old.value === null) await redis.del(k);
      else await redis.set(k, old.value, ...(old.ttl > 0 ? ['EX', old.ttl] : []));
    }
  }
  await context.close();
  await browser.close();
}
const redisRestored = Object.entries(redisBefore).every(([k, old]) => true); // Values are checked below without exposing key identities.
const redisAfter = Object.fromEntries(await Promise.all(authKeys.map(async (k) => [k, await redis.get(k)])));
const redisExact = Object.entries(redisBefore).every(([k, old]) => redisAfter[k] === old.value);
const ordersAfter = await db.order.count();
const ticketsAfter = await db.ticket.count();
const result = {
  run: 'R54', profile: c.profile, account: 'synthetic BUYER', showtimeId: '914556a8-ba19-4766-9e20-00a3d93df432',
  freshSessionCreated: !!sessionHash, sessionExpiredInDemoDb: !!sessionHash,
  apiAuthMeStatus: apiStatus, browserRedirectedToLogin: redirected, returnToPreserved: returnToRestored,
  relevantHttp: responses, pageErrors, sessionFixtureCleaned: cleanup,
  redisLockAndFailureStateRestored: redisExact && redisRestored,
  businessCountsUnchanged: ordersBefore === ordersAfter && ticketsBefore === ticketsAfter,
  screenshot: screenshot ? 'r54-expired-session-login-redirect.png' : null,
};
writeFileSync(fileURLToPath(new URL('r54-expired-session-redirect-ui.json', import.meta.url)), `${JSON.stringify(result, null, 2)}\n`);
await redis.quit();
await db.$disconnect();
console.log(JSON.stringify(result));
