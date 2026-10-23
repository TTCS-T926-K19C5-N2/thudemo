import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const configPath = resolve(root, '.sprint1-demo/config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const catalog = JSON.parse(
  readFileSync(resolve(root, 'demo-data/catalog.source.json'), 'utf8'),
).catalog;
const event = catalog.find((item) => item.id === config.demoShowtime?.eventId);
const sourceShowtime = event?.showtimes.find(
  (item) => item.id === config.demoShowtime?.sourceShowtimeId,
);
const apiOrigin = `http://127.0.0.1:${config.ports.api}`;
const webOrigin = `http://localhost:${config.ports.web}`;

if (
  config.root !== root ||
  !/^s1demo-[a-f0-9]{12}$/.test(config.profile) ||
  process.env.SPRINT1_DEMO_PROFILE !== config.profile ||
  process.env.NODE_ENV === 'production' ||
  !event ||
  !sourceShowtime
)
  throw new Error('Demo scanner schedule refused: exact owned profile required.');

function saveConfig() {
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', {
    mode: 0o600,
  });
}

if (!config.demoScannerShowtime?.startTime) {
  const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const vnStart = new Date(vnNow);
  vnStart.setUTCHours(vnNow.getUTCHours() + 2, 0, 0, 0);
  if (vnStart.toDateString() !== vnNow.toDateString()) {
    vnStart.setUTCDate(vnNow.getUTCDate() + 1);
    vnStart.setUTCHours(10, 0, 0, 0);
  }
  config.demoScannerShowtime = {
    eventId: event.id,
    sourceShowtimeId: sourceShowtime.id,
    startTime: new Date(vnStart.getTime() - 7 * 60 * 60 * 1000).toISOString(),
    gateName: 'Cửa demo',
  };
  saveConfig();
}

const rehearsal = config.demoScannerShowtime;
let expectedSeatCount = 0;
if (
  rehearsal.eventId !== event.id ||
  rehearsal.sourceShowtimeId !== sourceShowtime.id ||
  !rehearsal.gateName ||
  !Number.isFinite(Date.parse(rehearsal.startTime))
)
  throw new Error('Demo scanner schedule differs from its stored source.');

async function login(name) {
  const account = config.accounts.find((item) => item.name === name);
  if (!account?.email || !account.password)
    throw new Error(`Owned demo ${name} account is missing.`);
  const response = await fetch(`${apiOrigin}/auth/login`, {
    method: 'POST',
    headers: { Origin: webOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: account.password }),
    signal: AbortSignal.timeout(10000),
  });
  if (response.status !== 200)
    throw new Error(`Demo ${name} login failed (${response.status}).`);
  const cookie = response.headers.getSetCookie()[0]?.split(';', 1)[0];
  if (!cookie) throw new Error(`Demo ${name} session cookie missing.`);
  return { account, cookie };
}

async function api(cookie, path, { method = 'GET', body } = {}) {
  const response = await fetch(`${apiOrigin}${path}`, {
    method,
    headers: {
      Origin: webOrigin,
      Cookie: cookie,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  let value = null;
  try {
    value = await response.json();
  } catch {
    // Preserve the fixed-status error below; never print response bodies.
  }
  if (!response.ok)
    throw new Error(`Demo scanner API ${method} ${path} failed (${response.status}).`);
  return value;
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Unexpected ${label} response.`);
  return value;
}

const organizer = await login('organizer-a');
try {
  const managedEvent = object(
    await api(organizer.cookie, `/events/${event.id}/manage`),
    'event',
  );
  if (managedEvent.status !== 'PUBLISHED')
    throw new Error('Demo source event is not published.');

  let showtime = rehearsal.showtimeId
    ? (managedEvent.showtimes ?? []).find(
        (item) => item.id === rehearsal.showtimeId,
      )
    : (managedEvent.showtimes ?? []).find(
        (item) => Date.parse(item.startTime) === Date.parse(rehearsal.startTime),
      );
  if (!showtime) {
    if (Date.parse(rehearsal.startTime) <= Date.now())
      throw new Error('Stored rehearsal time has passed and no matching schedule exists.');
    showtime = object(
      await api(organizer.cookie, `/events/${event.id}/showtimes`, {
        method: 'POST',
        body: { startTime: rehearsal.startTime },
      }),
      'new rehearsal showtime',
    );
  }
  if (
    showtime.eventId !== event.id ||
    Date.parse(showtime.startTime) !== Date.parse(rehearsal.startTime)
  )
    throw new Error('Stored rehearsal schedule differs; refusing to rewrite it.');
  if (rehearsal.showtimeId && showtime.id !== rehearsal.showtimeId)
    throw new Error('Stored rehearsal showtime ID differs; refusing to replace it.');
  rehearsal.showtimeId = showtime.id;
  saveConfig();

  const sourceSeats = await api(
    organizer.cookie,
    `/showtimes/${sourceShowtime.id}/seats`,
  );
  if (!Array.isArray(sourceSeats) || !sourceSeats.length)
    throw new Error('Source seat map is empty.');
  expectedSeatCount = sourceSeats.length;
  const managePath = `/showtimes/${showtime.id}/manage`;
  let managed = object(await api(organizer.cookie, managePath), 'showtime');
  if (!['DRAFT', 'ON_SALE'].includes(managed.status))
    throw new Error('Demo scanner showtime has an unexpected status.');
  if (!(managed._count?.seats > 0)) {
    if (managed.status !== 'DRAFT')
      throw new Error('Cannot import seats after demo scanner sales are open.');
    await api(organizer.cookie, `/showtimes/${showtime.id}/seat-map`, {
      method: 'POST',
      body: {
        seats: sourceSeats.map(({ row, seatNumber, category }) => ({
          row,
          seatNumber,
          category,
        })),
      },
    });
    managed = object(await api(organizer.cookie, managePath), 'showtime after seat import');
  }

  const sourcePrices = new Map(
    sourceShowtime.categories.map(({ name, price }) => [name, price]),
  );
  const prices = (managed.categories ?? []).map(({ id, name, price }) => {
    const expectedPrice = sourcePrices.get(name);
    if (!Number.isInteger(expectedPrice) || expectedPrice < 0)
      throw new Error(`Source price is missing for ${name}.`);
    if (price !== null && price !== expectedPrice)
      throw new Error(`Existing price differs for ${name}; refusing to rewrite it.`);
    return { id, name, price: expectedPrice };
  });
  if (!prices.length) throw new Error('Demo scanner showtime has no categories.');
  if (
    managed.status === 'DRAFT' &&
    prices.some(
      ({ id }) => managed.categories.find((category) => category.id === id)?.price === null,
    )
  ) {
    await api(organizer.cookie, `/showtimes/${showtime.id}/prices`, {
      method: 'PATCH',
      body: { prices: prices.map(({ id, price }) => ({ id, price })) },
    });
    managed = object(await api(organizer.cookie, managePath), 'showtime after pricing');
  }
  if (managed.status === 'DRAFT')
    await api(organizer.cookie, `/showtimes/${showtime.id}/status`, {
      method: 'PATCH',
      body: { status: 'ON_SALE' },
    });
} finally {
  await api(organizer.cookie, '/auth/logout', {
    method: 'POST',
    body: {},
  });
}

const staff = await login('staff');
try {
  const showtimes = await api(staff.cookie, '/scanner/showtimes');
  if (!Array.isArray(showtimes)) throw new Error('Assigned showtimes response is invalid.');
  let assigned = showtimes.some((item) => item.id === rehearsal.showtimeId);
  if (assigned) {
    const existing = object(
      await api(staff.cookie, `/showtimes/${rehearsal.showtimeId}/check-in/gates`),
      'assigned gates',
    );
    assigned = Array.isArray(existing.gates) && existing.gates.some((gate) => gate.gateName === rehearsal.gateName || gate.name === rehearsal.gateName);
  }
  if (!assigned) {
    const admin = await login('admin');
    try {
      const users = object(await api(admin.cookie, '/admin/users?page=1'), 'users');
      const target = (users.items ?? []).find(
        (item) => item.email === staff.account.email && item.isActive && item.roles?.includes('STAFF'),
      );
      if (!target) throw new Error('Owned demo staff identity is unavailable to admin.');
      await api(admin.cookie, `/admin/users/${target.id}/assignment`, {
        method: 'POST',
        body: {
          showtimeId: rehearsal.showtimeId,
          gateName: rehearsal.gateName,
          canOverride: false,
          enabled: true,
        },
      });
    } finally {
      await api(admin.cookie, '/auth/logout', { method: 'POST', body: {} });
    }
  }
} finally {
  await api(staff.cookie, '/auth/logout', { method: 'POST', body: {} });
}

const staffAgain = await login('staff');
try {
  const [gates, today] = await Promise.all([
    api(staffAgain.cookie, `/showtimes/${rehearsal.showtimeId}/check-in/gates`),
    api(staffAgain.cookie, '/check-in/today'),
  ]);
  const gateList = object(gates, 'staff gate verification').gates;
  if (!Array.isArray(gateList) || !gateList.some((gate) => gate.gateName === rehearsal.gateName || gate.name === rehearsal.gateName))
    throw new Error('Demo scanner gate assignment was not verified.');
  const seats = await api(
    staffAgain.cookie,
    `/showtimes/${rehearsal.showtimeId}/seats`,
  );
  if (!Array.isArray(seats) || seats.length !== expectedSeatCount)
    throw new Error('Demo scanner showtime seat count does not match the source map.');
  console.log(
    JSON.stringify({
      createdThrough: 'Organizer event/showtime, seat-map, pricing, open-sales, and admin staff assignment routes',
      eventName: event.name,
      showtimeId: rehearsal.showtimeId,
      stableStartTime: rehearsal.startTime,
      status: 'ON_SALE',
      gateAssigned: true,
      seatCount: seats.length,
      selectableToday: Array.isArray(today) && today.some((item) => item.id === rehearsal.showtimeId),
      paymentMode: 'mock only',
    }),
  );
} finally {
  await api(staffAgain.cookie, '/auth/logout', { method: 'POST', body: {} });
}
