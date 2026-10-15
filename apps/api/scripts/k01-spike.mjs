import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const target = new URL(process.env.DATABASE_URL ?? '');
if (target.hostname !== '127.0.0.1' || target.port !== '15432' || target.pathname !== '/sprint2_local' || process.env.REDIS_PORT !== '16379') throw new Error('Only isolated Sprint2 local stores are allowed');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: target.toString() }) });
const redis = new Redis(16379, '127.0.0.1');
const ns = `k01_${randomUUID().replaceAll('-', '')}`;
const key = `${ns}:seat`;
const runs = [];
const stats = values => ({ p95: [...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1], min:Math.min(...values), max:Math.max(...values) });
try {
  await db.$executeRawUnsafe(`CREATE SCHEMA "${ns}"`);
  await db.$executeRawUnsafe(`CREATE TABLE "${ns}".claims (seat int PRIMARY KEY, owner text NOT NULL, expires timestamptz NOT NULL)`);
  for (let round=0;round<3;round++) {
    const timings=[];
    const outcomes=await Promise.all(Array.from({length:200}, async (_,i)=>{ const start=performance.now(); const rows=await db.$queryRawUnsafe(`INSERT INTO "${ns}".claims VALUES ($1,$2,clock_timestamp()+interval '10 minutes') ON CONFLICT(seat) DO UPDATE SET owner=EXCLUDED.owner,expires=EXCLUDED.expires WHERE claims.expires <= clock_timestamp() RETURNING seat`, round, `actor-${i}`); timings.push(performance.now()-start); return rows.length; }));
    const winners=outcomes.filter(v=>v===1).length;
    if(winners!==1) throw new Error('PostgreSQL violated single winner');
    runs.push({ store:'PostgreSQL', round, requests:200, winners, rejected:199, errors:0, timeout:0, timings, ...stats(timings) });
    const redisTimings=[];
    const redisOutcomes=await Promise.all(Array.from({length:200},async (_,i)=>{ const start=performance.now(); const value=await redis.set(`${key}:${round}`,`actor-${i}`,'PX',600000,'NX'); redisTimings.push(performance.now()-start); return value; }));
    const redisWinners=redisOutcomes.filter(v=>v==='OK').length;
    if(redisWinners!==1) throw new Error('Redis violated single winner');
    runs.push({ store:'Redis',round,requests:200,winners:redisWinners,rejected:199,errors:0,timeout:0,timings:redisTimings,...stats(redisTimings) });
  }
  await db.$executeRawUnsafe(`UPDATE "${ns}".claims SET expires=clock_timestamp()-interval '1 second' WHERE seat=0`);
  const reclaimed=await db.$queryRawUnsafe(`INSERT INTO "${ns}".claims VALUES (0,'new-actor',clock_timestamp()+interval '10 minutes') ON CONFLICT(seat) DO UPDATE SET owner=EXCLUDED.owner,expires=EXCLUDED.expires WHERE claims.expires <= clock_timestamp() RETURNING seat`);
  if(reclaimed.length!==1) throw new Error('PostgreSQL expiry reuse failed');
  const staleDelete=await db.$executeRawUnsafe(`DELETE FROM "${ns}".claims WHERE seat=0 AND owner='actor-0' AND expires<=clock_timestamp()`);
  if(staleDelete!==0) throw new Error('Stale cleanup removed new owner');
  await redis.set(`${key}:expiry`,'old','PX',1); await new Promise(r=>setTimeout(r,15));
  if(await redis.set(`${key}:expiry`,'new','PX',600000,'NX')!=='OK') throw new Error('Redis expiry reuse failed');
  // Atomic multi-seat candidate, tested without mutating any application holds.
  const lua = "for i=1,#KEYS do if redis.call('EXISTS',KEYS[i]) == 1 then return 0 end end; for i=1,#KEYS do redis.call('SET',KEYS[i],ARGV[1],'PX',ARGV[2]) end; return 1";
  await redis.set(`${key}:occupied`,'other','PX',600000);
  if(await redis.eval(lua,2,`${key}:free`,`${key}:occupied`,'actor',600000)!==0 || await redis.exists(`${key}:free`)) throw new Error('Redis set rollback failed');
  await db.$executeRawUnsafe(`INSERT INTO "${ns}".claims VALUES (100,'other',clock_timestamp()+interval '10 minutes')`);
  try { await db.$transaction(async tx=>{ await tx.$executeRawUnsafe(`INSERT INTO "${ns}".claims VALUES (101,'actor',clock_timestamp()+interval '10 minutes')`); await tx.$executeRawUnsafe(`INSERT INTO "${ns}".claims VALUES (100,'actor',clock_timestamp()+interval '10 minutes')`); }); } catch { /* expected unique conflict */ }
  const free=await db.$queryRawUnsafe(`SELECT seat FROM "${ns}".claims WHERE seat=101`);
  if(free.length) throw new Error('PostgreSQL set rollback failed');
  const dir=resolve('../../evidence/sprint2/20261004-local'); mkdirSync(dir,{recursive:true});
  writeFileSync(resolve(dir,'k01-spike.json'),JSON.stringify({ runtime:process.version, environment:'Windows local Docker PostgreSQL15 Redis7; direct datastore calls, not HTTP/staging', requestsPerSeat:200, rounds:3, runs, expiryReuse:true, multiSeatAtomicity:true, staleCleanupPostgres:true, independentReview:false, staging:false, decision:'No approved storage selection; PostgreSQL is the candidate for review due to future same-database order/ticket transaction. Redis TTL alone cannot prove transfer atomicity.' },null,2));
  console.log(JSON.stringify(runs.map(({store,round,winners,p95})=>({store,round,winners,p95})),null,2));
} finally {
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${ns}" CASCADE`);
  await redis.del(...[0,1,2].map(i=>`${key}:${i}`),`${key}:expiry`,`${key}:occupied`,`${key}:free`);
  await redis.quit(); await db.$disconnect();
}
