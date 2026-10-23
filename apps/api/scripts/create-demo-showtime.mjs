import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const configPath = resolve(root, '.sprint1-demo/config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const catalog = JSON.parse(
  readFileSync(resolve(root, 'demo-data/catalog.source.json'), 'utf8'),
).catalog;
const sourceEvent = catalog.find((event) => event.id === config.demoShowtime?.eventId);
const sourceShowtime = sourceEvent?.showtimes.find(
  (showtime) => showtime.id === config.demoShowtime?.sourceShowtimeId,
);
const organizer = config.accounts.find((account) => account.name === 'organizer-a');
const apiOrigin = `http://127.0.0.1:${config.ports.api}`;
const webOrigin = `http://localhost:${config.ports.web}`;
const startTime = config.demoShowtime?.startTime;

if (
  config.root !== root ||
  !/^s1demo-[a-f0-9]{12}$/.test(config.profile) ||
  process.env.SPRINT1_DEMO_PROFILE !== config.profile ||
  process.env.NODE_ENV === 'production' ||
  !sourceEvent ||
  !sourceShowtime ||
  !organizer?.email ||
  !organizer.password ||
  !startTime ||
  Date.parse(startTime) <= Date.now()
)
  throw new Error('Future demo-showtime bootstrap refused: owned profile or stable schedule invalid.');

function checked(body, label) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new Error(`Unexpected ${label} response.`);
  return body;
}

const login = await fetch(`${apiOrigin}/auth/login`, {
  method: 'POST',
  headers: { Origin: webOrigin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: organizer.email, password: organizer.password }),
  signal: AbortSignal.timeout(10000),
});
if (login.status !== 200) throw new Error(`Demo organizer login failed (${login.status}).`);
const cookie = login.headers.getSetCookie()[0]?.split(';', 1)[0];
if (!cookie) throw new Error('Demo organizer session cookie missing.');

async function api(path, { method = 'GET', body } = {}) {
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
  let value;
  try {
    value = await response.json();
  } catch {
    value = null;
  }
  if (!response.ok)
    throw new Error(`Demo-showtime API ${method} ${path} failed (${response.status}).`);
  return value;
}

const event = checked(await api(`/events/${sourceEvent.id}/manage`), 'event');
if (event.status !== 'PUBLISHED')
  throw new Error('Catalog source event is not published in the demo profile.');
let showtime = (event.showtimes ?? []).find(
  (candidate) => new Date(candidate.startTime).getTime() === Date.parse(startTime),
);
if (!showtime) {
  showtime = checked(
    await api(`/events/${sourceEvent.id}/showtimes`, {
      method: 'POST',
      body: { startTime },
    }),
    'new showtime',
  );
}
if (showtime.eventId !== sourceEvent.id || new Date(showtime.startTime).getTime() !== Date.parse(startTime))
  throw new Error('Existing stable demo showtime differs; refusing to rewrite it.');

const referenceSeats = await api(`/showtimes/${sourceShowtime.id}/seats`);
if (!Array.isArray(referenceSeats) || referenceSeats.length === 0)
  throw new Error('Reference seating layout is empty.');
const managePath = `/showtimes/${showtime.id}/manage`;
let managed = checked(await api(managePath), 'showtime');
if (managed.status !== 'DRAFT' && managed.status !== 'ON_SALE')
  throw new Error(`Stable demo showtime has unexpected state ${managed.status}.`);
if (!(managed._count?.seats > 0)) {
  if (managed.status !== 'DRAFT')
    throw new Error('Cannot add the demo seat map after sales have opened.');
  await api(`/showtimes/${showtime.id}/seat-map`, {
    method: 'POST',
    body: {
      seats: referenceSeats.map(({ row, seatNumber, category }) => ({
        row,
        seatNumber,
        category,
      })),
    },
  });
  managed = checked(await api(managePath), 'showtime after seat import');
}

const sourcePrices = new Map(
  sourceShowtime.categories.map(({ name, price }) => [name, price]),
);
const prices = (managed.categories ?? []).map(({ id, name, price }) => {
  const sourcePrice = sourcePrices.get(name);
  if (!Number.isInteger(sourcePrice) || sourcePrice < 0)
    throw new Error(`Source price is unavailable for category ${name}.`);
  if (price !== null && price !== sourcePrice)
    throw new Error(`Existing demo price differs for category ${name}; refusing update.`);
  return { id, price: sourcePrice };
});
if (!prices.length) throw new Error('Demo showtime has no priced categories.');
if (managed.status === 'DRAFT' && prices.some(({ id }) =>
  managed.categories.find((category) => category.id === id)?.price === null,
)) {
  await api(`/showtimes/${showtime.id}/prices`, {
    method: 'PATCH',
    body: { prices },
  });
  managed = checked(await api(managePath), 'showtime after pricing');
}
if (managed.status === 'DRAFT') {
  await api(`/showtimes/${showtime.id}/status`, {
    method: 'PATCH',
    body: { status: 'ON_SALE' },
  });
}
const publicSeats = await api(`/showtimes/${showtime.id}/seats`);
if (
  !Array.isArray(publicSeats) ||
  publicSeats.length !== referenceSeats.length ||
  showtime.isDemo === true
)
  throw new Error('New future showtime did not pass public catalog/inventory verification.');

config.demoShowtime.showtimeId = showtime.id;
config.demoShowtime.seatCount = publicSeats.length;
config.demoShowtime.eventId = sourceEvent.id;
config.demoShowtime.sourceShowtimeId = sourceShowtime.id;
writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
console.log(
  JSON.stringify({
    createdThrough: 'Organizer event/showtime, seat-map, pricing, and open-sales API routes',
    eventId: sourceEvent.id,
    showtimeId: showtime.id,
    stableStartTime: startTime,
    status: 'ON_SALE',
    isDemo: false,
    seatCount: publicSeats.length,
    sourceSeatLayout: sourceShowtime.id,
    paymentMode: 'mock only',
  }),
);
await api('/auth/logout', { method: 'POST', body: {} });
