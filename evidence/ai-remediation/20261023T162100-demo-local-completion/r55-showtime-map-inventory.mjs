import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(`${process.cwd()}/apps/api/package.json`);
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const c = JSON.parse(readFileSync('D:/Merge_2/Codegym-demo-proof-20261023T1530/.sprint1-demo/config.json', 'utf8'));
const url = new URL(`postgresql://${encodeURIComponent(c.user)}:${encodeURIComponent(c.dbPassword)}@127.0.0.1:${c.ports.postgres}/${c.database}`);
if (!/^s1demo-[a-f0-9]{12}$/.test(c.profile) || c.database !== `sprint1_demo_${c.profile.slice(7)}` || url.hostname !== '127.0.0.1' || url.port !== String(c.ports.postgres) || url.pathname !== `/${c.database}`) throw new Error('Exact profile guard failed');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 1 }) });
try {
  const shows = await db.showtime.findMany({ select: { id: true, startTime: true, status: true, isDemo: true, seatMapId: true, event: { select: { name: true, status: true } }, _count: { select: { seats: true } } }, orderBy: { startTime: 'asc' } });
  const summary = shows.map((s) => ({ id: s.id, event: s.event.name, eventStatus: s.event.status, startTime: s.startTime.toISOString(), showtimeStatus: s.status, isDemo: s.isDemo, seatMapIdPresent: !!s.seatMapId, seatCount: s._count.seats }));
  const out = { profile: c.profile, totalShowtimes: shows.length, totalSeats: summary.reduce((n, s) => n + s.seatCount, 0), zeroSeatShowtimes: summary.filter((s) => s.seatCount === 0), showtimes: summary };
  writeFileSync(fileURLToPath(new URL('r55-showtime-map-inventory.json', import.meta.url)), `${JSON.stringify(out, null, 2)}\n`);
  console.log(JSON.stringify({ totalShowtimes: out.totalShowtimes, totalSeats: out.totalSeats, zeroSeatShowtimes: out.zeroSeatShowtimes }));
} finally { await db.$disconnect(); }
