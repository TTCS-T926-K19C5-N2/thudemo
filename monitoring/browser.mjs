// Repeatable browser verification of the dedicated local Grafana; no external services.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
const root = resolve(import.meta.dirname, "..");
const runtime = resolve(import.meta.dirname, ".runtime");
const output = resolve(root, "output/playwright");
const evidence = resolve(root, "evidence/s43/runtime");
mkdirSync(output, { recursive: true });
mkdirSync(evidence, { recursive: true });
const origin = "http://127.0.0.1:13000";
const adminPassword = readFileSync(
  resolve(runtime, "grafana-password"),
  "utf8",
).trim();
const viewerPassword = randomBytes(32).toString("hex");
const login = `s43-viewer-${Date.now()}`;
const adminHeaders = {
  Authorization: `Basic ${Buffer.from(`operator:${adminPassword}`).toString("base64")}`,
  "Content-Type": "application/json",
};
const report = {
  sourceHeadSHA: process.env.S43_SOURCE_HEAD ?? null,
  sourceSHA: spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).stdout.trim(),
  localOnly: true,
  checks: [],
};
let userId;
const stateFile = resolve(runtime, "browser-state.json");
const codeFile = resolve(runtime, "browser-code.js");
function cli(...args) {
  report.lastBrowserCommand = args[0];
  const windows = process.platform === "win32";
  const r = spawnSync(
    windows ? process.execPath : "playwright-cli",
    windows
      ? [
          resolve(
            process.env.APPDATA,
            "npm/node_modules/@playwright/cli/playwright-cli.js",
          ),
          "-s=s43",
          "--raw",
          ...args,
        ]
      : ["-s=s43", "--raw", ...args],
    { cwd: root, encoding: "utf8", timeout: 90000, windowsHide: true },
  );
  if (args[0] === "run-code" && /### Error|Error:/m.test(r.stdout)) {
    report.browserFailure = r.stdout
      .match(/(?:### Error|Error:)([\s\S]*?)(?:###|$)/)?.[1]
      ?.slice(0, 800);
  }
  assert(
    r.status === 0 && !/### Error|^Error:/m.test(r.stdout),
    "Browser command failed; private CLI state must not be printed",
  );
  return r.stdout;
}
async function loginState(user, password) {
  const response = await fetch(`${origin}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user, password }),
    signal: AbortSignal.timeout(10000),
  });
  assert(response.ok, "Local Grafana login");
  const cookies = response.headers.getSetCookie().map((entry) => {
    const pair = entry.split(";")[0],
      at = pair.indexOf("=");
    return {
      name: pair.slice(0, at),
      value: pair.slice(at + 1),
      domain: "127.0.0.1",
      path: "/",
      expires: -1,
      httpOnly: /httponly/i.test(entry),
      secure: false,
      sameSite: "Lax",
    };
  });
  assert(
    cookies.some((c) => c.name === "grafana_session"),
    "Grafana session cookie",
  );
  writeFileSync(stateFile, JSON.stringify({ cookies, origins: [] }), {
    mode: 0o600,
  });
}
try {
  const anonymous = await fetch(`${origin}/api/dashboards/uid/s43-monitoring`);
  assert(anonymous.status === 401, "Anonymous dashboard denied");
  report.checks.push("anonymous API denied");
  const create = await fetch(`${origin}/api/admin/users`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "S43 fixture viewer",
      login,
      email: `${login}@example.invalid`,
      password: viewerPassword,
    }),
  });
  assert(create.ok, "Create run-owned Grafana Viewer fixture");
  userId = (await create.json()).id;
  const role = await fetch(`${origin}/api/org/users/${userId}`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ role: "Viewer" }),
  });
  assert(role.ok, "Assign Viewer role");
  await loginState(login, viewerPassword);
  const viewerHeaders = {
    Authorization: `Basic ${Buffer.from(`${login}:${viewerPassword}`).toString("base64")}`,
    "Content-Type": "application/json",
  };
  const dashboardResponse = await fetch(
    `${origin}/api/dashboards/uid/s43-monitoring`,
    { headers: viewerHeaders },
  );
  assert(dashboardResponse.ok, "Viewer reads provisioned dashboard");
  const dashboard = await dashboardResponse.json();
  assert(
    dashboard.meta.canEdit === false && dashboard.dashboard.editable === false,
    "Viewer cannot edit",
  );
  const save = await fetch(`${origin}/api/dashboards/db`, {
    method: "POST",
    headers: viewerHeaders,
    body: JSON.stringify({ dashboard: dashboard.dashboard, overwrite: true }),
  });
  assert(save.status === 403, "Viewer save denied");
  const users = await fetch(`${origin}/api/users`, { headers: viewerHeaders });
  assert(users.status === 403, "Viewer cannot administer users");
  report.checks.push("Viewer read allowed, edit and administration denied");
  cli("open", `${origin}/login`, "--browser=chrome");
  cli("snapshot");
  cli("state-load", stateFile);
  cli(
    "goto",
    `${origin}/d/s43-monitoring?var-environment=local&var-instance=All`,
  );
  cli("snapshot");
  writeFileSync(
    codeFile,
    `async page => {
    const errors = [], queries = [];
    let privateDashboardDiscovery404 = 0;
    let expectedDatasourceError = false;
    page.on('pageerror', () => errors.push('pageerror'));
    page.on('console', message => {
      if (message.type() !== 'error' || expectedDatasourceError) return;
      if (message.location().url.includes('/public-dashboards') && message.text().includes('404')) privateDashboardDiscovery404++;
      else errors.push('consoleerror');
    });
    page.on('response', async r => {
      if (!r.url().includes('/api/ds/query')) return;
      try { const data = await r.json(); queries.push({ status: r.status(), errors: Object.values(data.results ?? {}).filter(v => v.error).length, frames: Object.values(data.results ?? {}).reduce((n,v) => n + (v.frames?.length ?? 0), 0) }); } catch { queries.push({ status: r.status(), errors: 1, frames: 0 }); }
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.reload();
    await page.getByText('Request RPS — completed + aborted, 5m', { exact: true }).waitFor();
    await new Promise(r => setTimeout(r, 12000));
    if (!queries.length || queries.some(q => q.status !== 200 || q.errors) || !queries.some(q => q.frames > 0)) throw Error('Live datasource query/history validation failed');
    await page.screenshot({ path: 'output/playwright/s43-desktop.png', fullPage: true });
    await page.getByText('Webhook rejection — unavailable until real producer', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'output/playwright/s43-unavailable.png', fullPage: true });
    await page.goto('${origin}/d/s43-monitoring?var-environment=local&var-instance=api-a%3A9464');
    await page.getByText('Request RPS — completed + aborted, 5m', { exact: true }).waitFor();
    await new Promise(r => setTimeout(r, 6000));
    if (!(await page.locator('body').innerText()).includes('api-a:9464')) throw Error('Instance filter missing');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('${origin}/d/s43-monitoring?var-environment=local&var-instance=api-a%3A9464');
    await page.getByText('Request RPS — completed + aborted, 5m', { exact: true }).waitFor();
    await new Promise(r => setTimeout(r, 6000));
    const mobile = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    if (mobile.document > mobile.viewport + 2) throw Error('Mobile horizontal overflow');
    await page.screenshot({ path: 'output/playwright/s43-mobile.png', fullPage: true });
    await page.goto('${origin}/d/s43-monitoring?var-environment=missing-fixture&var-instance=All');
    await page.getByText('Request RPS — completed + aborted, 5m', { exact: true }).waitFor();
    await new Promise(r => setTimeout(r, 6000));
    const requestPanel = page.getByRole('region', { name: 'Request RPS — completed + aborted, 5m' });
    if (!(await requestPanel.innerText()).includes('No data')) throw Error('Request panel No-data state missing');
    await page.screenshot({ path: 'output/playwright/s43-no-data.png', fullPage: true });
    expectedDatasourceError = true;
    await page.route('**/api/ds/query*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'S43 local datasource failure fixture' }) }));
    await page.goto('${origin}/d/s43-monitoring?var-environment=local&var-instance=All');
    await page.getByText('Request RPS — completed + aborted, 5m', { exact: true }).waitFor();
    await new Promise(r => setTimeout(r, 6000));
    const errorPanel = page.getByRole('region', { name: 'Request RPS — completed + aborted, 5m' });
    const errorStatus = errorPanel.getByTestId('data-testid Panel status error');
    await errorStatus.waitFor();
    await errorStatus.hover();
    await page.getByText('S43 local datasource failure fixture', { exact: false }).waitFor();
    await page.screenshot({ path: 'output/playwright/s43-query-error.png', fullPage: true });
    await page.unroute('**/api/ds/query*');
    expectedDatasourceError = false;
    queries.length = 0;
    await page.reload();
    await new Promise(r => setTimeout(r, 6000));
    if (!queries.length || queries.some(q => q.status !== 200 || q.errors) || !queries.some(q => q.frames > 0)) throw Error('Datasource recovery not confirmed');
    if (errors.length) throw Error('Browser runtime errors');
    return { pass: true, queries: queries.length, frames: queries.reduce((n,q) => n + q.frames, 0), runtimeErrors: errors.length, privateDashboardDiscovery404, mobile };
  }`,
    { mode: 0o600 },
  );
  const result = cli("run-code", `--filename=${codeFile}`);
  assert(/"pass"\s*:\s*true/.test(result), "Browser did not return PASS");
  report.checks.push(
    "desktop/mobile real dashboard and refresh/history frames",
    "environment/instance filters",
    "No data and datasource error/recovery",
    "no browser runtime errors",
  );
  report.pass = true;
} finally {
  try {
    cli("close");
  } catch {}
  try {
    if (userId) {
      const deleted = await fetch(`${origin}/api/admin/users/${userId}`, {
        method: "DELETE",
        headers: adminHeaders,
        signal: AbortSignal.timeout(10000),
      });
      report.viewerFixtureCleaned = deleted.ok;
      if (!deleted.ok) {
        report.pass = false;
        process.exitCode = 1;
      }
    }
  } catch {
    report.viewerFixtureCleaned = false;
    report.pass = false;
    process.exitCode = 1;
  } finally {
    rmSync(stateFile, { force: true });
    rmSync(codeFile, { force: true });
    writeFileSync(
      resolve(evidence, "browser.json"),
      JSON.stringify(report, null, 2),
    );
  }
}
assert(
  report.pass,
  "S43 browser verification/fixture cleanup failed; inspect sanitized browser.json",
);
console.log(
  `S43 browser PASS: ${report.checks.length} checks; private login state removed.`,
);
