import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const root = resolve(import.meta.dirname, '../../..');
const target = new URL(process.env.DATABASE_URL ?? '');
assert(
  target.hostname === '127.0.0.1' &&
    target.port === '15432' &&
    target.pathname === '/stitch_fidelity',
  'Only local synthetic fidelity DB',
);
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: target.href }),
});
const base = 'http://localhost:3200/api';
const showtimeId = 'c0100401-0000-4000-8000-000000000001';
const report = {
  local: true,
  render: false,
  checks: [],
  serviceMemoryLimitMiB: 512,
  serviceCpuLimit: 0.5,
};
let holdId, cookie;
const check = (condition, name) => {
  assert(condition, name);
  report.checks.push(name);
};
try {
  const show = await db.showtime.findUniqueOrThrow({
    where: { id: showtimeId },
    include: { event: { include: { organizer: true } } },
  });
  assert(show.event.organizer.email === 'design-organizer@example.invalid');
  const password = readFileSync(
    resolve(root, '.git/stitch-correction-password'),
    'utf8',
  ).trim();
  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3200',
    },
    body: JSON.stringify({ email: 'design-buyer@example.invalid', password }),
  });
  check(
    login.status === 200,
    'Real production-profile login through same-origin web proxy',
  );
  const setCookie = login.headers.get('set-cookie');
  check(
    /HttpOnly/i.test(setCookie) &&
      /Secure/i.test(setCookie) &&
      /SameSite=Lax/i.test(setCookie),
    'Production cookie flags retained; not TLS staging evidence',
  );
  cookie = setCookie.split(';')[0];
  const headers = {
    'Content-Type': 'application/json',
    cookie,
    Origin: 'http://localhost:3200',
  };
  const current = await fetch(`${base}/showtimes/${showtimeId}/holds`, {
    headers,
  }).then((r) => r.json());
  check(
    current.hold === null,
    'New authenticated session begins without another session ownership',
  );
  const seats = await fetch(`${base}/showtimes/${showtimeId}/seats`).then((r) =>
    r.json(),
  );
  const seatId = seats.find((s) => s.status === 'AVAILABLE').id;
  const held = await fetch(`${base}/showtimes/${showtimeId}/holds`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ seatIds: [seatId] }),
  });
  const state = await held.json();
  holdId = state.hold?.id;
  check(
    held.status === 200 && state.hold.seatIds.includes(seatId),
    'Docker product endpoint confirms actual PostgreSQL ownership',
  );
  const reloaded = await fetch(`${base}/showtimes/${showtimeId}/holds`, {
    headers,
  }).then((r) => r.json());
  check(
    reloaded.hold.expiresAt === state.hold.expiresAt,
    'Proxy GET preserves original server deadline',
  );
  const badOrigin = await fetch(`${base}/showtimes/${showtimeId}/holds`, {
    method: 'POST',
    headers: { ...headers, Origin: 'https://other.example.invalid' },
    body: JSON.stringify({ seatIds: [seatId] }),
  });
  check(badOrigin.status === 403, 'Cross-origin hold rejected');
  const logout = await fetch(`${base}/auth/logout`, {
    method: 'POST',
    headers,
  });
  check(logout.status === 200, 'Real logout succeeds');
  check(
    (await fetch(`${base}/showtimes/${showtimeId}/holds`, { headers }))
      .status === 401,
    'Revoked cookie cannot read or claim ownership',
  );
} catch (error) {
  report.failure = error.message;
  throw error;
} finally {
  // Delete only this test's identified rights, preserving all other sessions and data.
  if (holdId) {
    await db.seatHold.deleteMany({
      where: { holdSessionId: holdId, showtimeId },
    });
    await db.holdSession.deleteMany({ where: { id: holdId, showtimeId } });
  }
  await db.$disconnect();
  writeFileSync(
    resolve(root, 'evidence/holds/20261004/render-image-smoke.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
}
