// Isolated research candidates. Not registered in the application or a migration.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';

export function guard() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (
    url.hostname !== '127.0.0.1' ||
    url.port !== '15433' ||
    url.pathname !== '/k01_render_local' ||
    process.env.REDIS_PORT !== '16380'
  )
    throw new Error('Only isolated K-01 stores allowed');
  const ns = process.env.K01_NAMESPACE;
  if (!/^k01_[a-f0-9]{32}$/.test(ns ?? ''))
    throw new Error('Invalid research namespace');
  return { url, ns };
}

const conflict = () =>
  Object.assign(new Error('Ghế không còn trống.'), { status: 409 });
export function postgresCandidate() {
  const { url, ns } = guard();
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.toString(), max: 8 }),
  });
  const q = (client, sql, ...args) => client.$queryRawUnsafe(sql, ...args);
  return {
    db,
    async setup() {
      await db.$executeRawUnsafe(`CREATE SCHEMA "${ns}"`);
      await db.$executeRawUnsafe(
        `CREATE TABLE "${ns}".sessions (actor text PRIMARY KEY, token uuid NOT NULL, deadline timestamptz NOT NULL)`,
      );
      await db.$executeRawUnsafe(
        `CREATE TABLE "${ns}".claims (seat integer PRIMARY KEY, actor text NOT NULL, token uuid NOT NULL, deadline timestamptz NOT NULL)`,
      );
      await db.$executeRawUnsafe(`CREATE INDEX ON "${ns}".claims(deadline)`);
    },
    async hold(actor, seats, failAfterWrite = false) {
      return db.$transaction(
        async (tx) => {
          await q(
            tx,
            `INSERT INTO "${ns}".sessions VALUES ($1,$2::uuid,clock_timestamp()+interval '10 minutes') ON CONFLICT DO NOTHING`,
            actor,
            randomUUID(),
          );
          const [session] = await q(
            tx,
            `SELECT *, deadline<=clock_timestamp() expired FROM "${ns}".sessions WHERE actor=$1 FOR UPDATE`,
            actor,
          );
          if (session.expired) {
            [
              Object.assign(
                session,
                (
                  await q(
                    tx,
                    `UPDATE "${ns}".sessions SET token=$2::uuid,deadline=clock_timestamp()+interval '10 minutes' WHERE actor=$1 RETURNING *`,
                    actor,
                    randomUUID(),
                  )
                )[0],
              ),
            ];
          }
          const won = await q(
            tx,
            `INSERT INTO "${ns}".claims (seat,actor,token,deadline) SELECT x,$2,$3::uuid,$4::timestamptz FROM unnest($1::integer[]) x ORDER BY x ON CONFLICT(seat) DO UPDATE SET actor=EXCLUDED.actor,token=EXCLUDED.token,deadline=EXCLUDED.deadline WHERE claims.deadline<=clock_timestamp() OR (claims.actor=EXCLUDED.actor AND claims.token=EXCLUDED.token) RETURNING seat`,
            [...new Set(seats)].sort((a, b) => a - b),
            actor,
            session.token,
            session.deadline,
          );
          if (won.length !== new Set(seats).size) throw conflict();
          if (failAfterWrite) throw new Error('Injected failure after write');
          const [time] = await q(tx, 'SELECT clock_timestamp() now');
          return {
            token: session.token,
            expiresAt: session.deadline.toISOString(),
            serverTime: time.now.toISOString(),
          };
        },
        { maxWait: 30000, timeout: 30000 },
      );
    },
    async expire(actor) {
      await q(
        db,
        `UPDATE "${ns}".claims SET deadline=clock_timestamp()-interval '1 second' WHERE actor=$1`,
        actor,
      );
      await q(
        db,
        `UPDATE "${ns}".sessions SET deadline=clock_timestamp()-interval '1 second' WHERE actor=$1`,
        actor,
      );
    },
    async active(seat) {
      return q(
        db,
        `SELECT * FROM "${ns}".claims WHERE deadline>clock_timestamp() ${seat === undefined ? '' : 'AND seat=$1'}`,
        ...(seat === undefined ? [] : [seat]),
      );
    },
    async staleCleanup(seat, token) {
      return q(
        db,
        `DELETE FROM "${ns}".claims WHERE seat=$1 AND token=$2::uuid AND deadline<=clock_timestamp() RETURNING seat`,
        seat,
        token,
      );
    },
    async cleanup() {
      return q(
        db,
        `DELETE FROM "${ns}".claims WHERE deadline<=clock_timestamp() RETURNING seat`,
      );
    },
    async drop() {
      await db.$executeRawUnsafe(`DROP SCHEMA "${ns}" CASCADE`);
    },
    close() {
      return db.$disconnect();
    },
  };
}

// TIME, session creation and all seat claims are in one Lua invocation.
const LUA = `
local nowparts=redis.call('TIME'); local now=nowparts[1]*1000+math.floor(nowparts[2]/1000)
local deadline=tonumber(redis.call('HGET',KEYS[1],'deadline'))
local token=redis.call('HGET',KEYS[1],'token')
if not deadline or deadline<=now then deadline=now+600000;token=ARGV[2] end
for i=2,#KEYS do
  local owner=redis.call('HGET',KEYS[i],'actor');local previous=redis.call('HGET',KEYS[i],'token')
  if owner and (owner~=ARGV[1] or previous~=token) then return {409} end
end
if ARGV[3]=='1' then return {500} end
redis.call('HSET',KEYS[1],'deadline',deadline,'token',token);redis.call('PEXPIREAT',KEYS[1],deadline)
for i=2,#KEYS do redis.call('HSET',KEYS[i],'actor',ARGV[1],'deadline',deadline,'token',token);redis.call('PEXPIREAT',KEYS[i],deadline) end
return {200,tostring(deadline),token,tostring(now)}
`;
export function redisCandidate() {
  const { ns } = guard();
  const redis = new Redis({
    host: '127.0.0.1',
    port: 16380,
    maxRetriesPerRequest: 1,
  });
  redis.on('error', () => {}); // caller receives errors; never log credentials.
  return {
    redis,
    async hold(actor, seats, failAfterWrite = false) {
      const keys = [
        `${ns}:session:${actor}`,
        ...[...new Set(seats)]
          .sort((a, b) => a - b)
          .map((s) => `${ns}:seat:${s}`),
      ];
      const result = await redis.eval(
        LUA,
        keys.length,
        ...keys,
        actor,
        randomUUID(),
        failAfterWrite ? '1' : '0',
      );
      if (result[0] === 409) throw conflict();
      if (result[0] !== 200) throw new Error('Injected failure before commit');
      return {
        expiresAt: new Date(Number(result[1])).toISOString(),
        token: result[2],
        serverTime: new Date(Number(result[3])).toISOString(),
      };
    },
    async expire(actor) {
      for (const key of await redis.keys(`${ns}:*`)) {
        if (
          key === `${ns}:session:${actor}` ||
          (await redis.hget(key, 'actor')) === actor
        )
          await redis.pexpire(key, 1);
      }
      await new Promise((resolve) => setTimeout(resolve, 15)); // test-only expiry; product Lua stays 600000.
    },
    async active(seat) {
      const keys =
        seat === undefined
          ? await redis.keys(`${ns}:seat:*`)
          : [`${ns}:seat:${seat}`];
      const rows = [];
      for (const key of keys) {
        const row = await redis.hgetall(key);
        if (row.actor)
          rows.push({ ...row, seat: Number(key.split(':').at(-1)) });
      }
      return rows;
    },
    async staleCleanup(seat, token) {
      return redis.eval(
        "local t=redis.call('HGET',KEYS[1],'token');local d=tonumber(redis.call('HGET',KEYS[1],'deadline'));local n=redis.call('TIME');if t==ARGV[1] and d and d<=n[1]*1000+math.floor(n[2]/1000) then return redis.call('DEL',KEYS[1]) end;return 0",
        1,
        `${ns}:seat:${seat}`,
        token,
      );
    },
    async cleanup() {
      return [];
    }, // TTL removes expired keys; no periodic persistence proof.
    async drop() {
      const keys = await redis.keys(`${ns}:*`);
      if (keys.length) await redis.del(...keys);
    },
    close() {
      return redis.quit();
    },
  };
}
