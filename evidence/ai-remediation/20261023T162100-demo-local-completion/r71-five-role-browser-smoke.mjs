import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(`${process.cwd()}/apps/web/package.json`);
const { chromium } = require('playwright');
const config = JSON.parse(readFileSync('.sprint1-demo/config.json', 'utf8'));
if (config.profile !== 's1demo-384da3d43b41') throw new Error('Unexpected demo profile; no login attempts made');
const roles = [
  { account: 'admin', role: 'ADMIN', path: '/admin/users', heading: 'Quản lý nhân viên' },
  { account: 'organizer-a', role: 'ORGANIZER', path: '/events', heading: 'Sự kiện & suất diễn' },
  { account: 'buyer', role: 'BUYER', path: '/account', heading: 'Tài khoản' },
  { account: 'staff', role: 'STAFF', path: '/scanner', heading: 'Soát vé bằng mã QR' },
  { account: 'accountant', role: 'ACCOUNTANT', path: '/operations', heading: 'Vận hành và báo cáo' },
];
const browser = await chromium.launch({ headless: true });
const output = [];
const contexts = [];
try {
  for (const item of roles) {
    const account = config.accounts.find((x) => x.name === item.account && x.roles.includes(item.role));
    if (!account) throw new Error(`Missing synthetic role account ${item.role}; no partial result recorded`);
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    contexts.push(context);
    const page = await context.newPage();
    const errors = [];
    let loginStatus = null;
    page.on('pageerror', (error) => errors.push(error.name));
    page.on('response', (response) => {
      if (new URL(response.url()).pathname === '/api/auth/login' && response.request().method() === 'POST') loginStatus = response.status();
    });
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.locator('#login-email').fill(account.email);
    await page.locator('#login-password').fill(account.password);
    const [loginResponse] = await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname === '/api/auth/login' && response.request().method() === 'POST', { timeout: 15000 }),
      page.getByRole('button', { name: 'Đăng nhập' }).click(),
    ]);
    loginStatus = loginResponse.status();
    if (loginStatus !== 200) throw new Error(`Login returned HTTP ${loginStatus} for ${item.role}`);
    const identity = await page.evaluate(async () => {
      const response = await fetch('/api/auth/me', { credentials: 'include' });
      const body = await response.json();
      return { status: response.status, roles: body.roles };
    });
    if (loginStatus !== 200 || identity.status !== 200 || !identity.roles.includes(item.role)) throw new Error(`Login/role verification failed for ${item.role}`);
    await page.goto(`http://localhost:3000${item.path}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: item.heading }).waitFor({ state: 'visible', timeout: 15000 });
    if (errors.length) throw new Error(`Browser page error for ${item.role}`);
    const logout = await page.evaluate(async () => {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      return response.status;
    });
    if (logout !== 200) throw new Error(`Synthetic ${item.role} logout failed`);
    output.push({ role: item.role, route: item.path, loginStatus, currentUserStatus: identity.status, roleConfirmed: true, expectedHeadingVisible: true, logoutStatus: logout, pageErrors: errors });
    await context.close();
  }
} finally {
  for (const context of contexts) {
    await context.request.post('http://localhost:3000/api/auth/logout').catch(() => {});
    await context.close().catch(() => {});
  }
  await browser.close();
}
const result = { run: 'R71', profile: config.profile, syntheticAccountsOnly: true, routes: output };
writeFileSync(fileURLToPath(new URL('r71-five-role-browser-smoke.json', import.meta.url)), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
