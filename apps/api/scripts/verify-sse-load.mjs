import {PrismaClient} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {randomUUID} from 'node:crypto';
import {setMaxListeners} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
assert(/^\/codegym_sprint_\d+$/.test(new URL(process.env.DATABASE_URL).pathname));
const p=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
const c=new AbortController();setMaxListeners(0,c.signal);
const count=Number(process.env.SSE_VIEWERS??2000),clients=[];let hold;let changedAt;
assert(Number.isInteger(count)&&count>=1&&count<=2000);
try{
 const show=await p.showtime.findFirstOrThrow({where:{status:'ON_SALE',event:{name:{not:{startsWith:'QA'}}},seats:{some:{isSold:false,hold:null}}},select:{id:true}});
 const seat=await p.seat.findFirstOrThrow({where:{showtimeId:show.id,isSold:false,hold:null}});
 const user=await p.user.findFirstOrThrow({where:{email:{startsWith:'qa-',endsWith:'@fixture.invalid'},userRoles:{some:{role:{name:'BUYER'}}}},select:{id:true}});
 for(let offset=0;offset<count;offset+=100){
   const opened=await Promise.all(Array.from({length:Math.min(100,count-offset)},async()=>{const response=await fetch(`http://127.0.0.1:3392/showtimes/${show.id}/seats/stream`,{signal:c.signal});assert.equal(response.status,200);return response.body.getReader();}));clients.push(...opened);
 }
 console.log(`Connected ${clients.length} isolated SSE clients.`);await delay(1500);
 const observed=clients.map(async reader=>{let text='';while(true){const part=await reader.read();if(part.done)throw Error('Stream closed early');text+=new TextDecoder().decode(part.value);const frames=text.split('\n\n');text=frames.pop()??'';
   for(const frame of frames)for(const line of frame.split('\n'))if(line.startsWith('data: ')){
     const event=JSON.parse(line.slice(6));
     if(changedAt && event.kind==='snapshot' && event.seats?.find(s=>s.id===seat.id)?.status==='HELD')return performance.now()-changedAt;
   }
 }});
 changedAt=performance.now();const token=randomUUID();hold=await p.holdSession.create({data:{userId:user.id,showtimeId:show.id,token,sessionHash:'sse-benchmark',expiresAt:new Date(Date.now()+60000),expectedSeatIds:[seat.id]}});
 await p.seatHold.create({data:{seatId:seat.id,showtimeId:show.id,holdSessionId:hold.id,token,expiresAt:hold.expiresAt}});
 const durations=await Promise.race([Promise.all(observed),delay(30000).then(()=>{throw Error('Timed out waiting for all viewers');})]);durations.sort((a,b)=>a-b);
 const result={at:new Date().toISOString(),viewers:count,includes:'Server-authoritative seat snapshot pushed via SSE, JSON decoded and changed seat state checked by every viewer; no per-viewer refetch',p50Ms:Math.round(durations[Math.floor(count*.5)]),p95Ms:Math.round(durations[Math.floor(count*.95)]),maxMs:Math.round(durations.at(-1)),under2seconds:durations.filter(n=>n<=2000).length,passed:durations.every(n=>n<=2000)};
 writeFileSync(resolve(import.meta.dirname,'../../../.cache/sprint4-8-evidence/20261022/sse-load-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
}finally{
 c.abort();for(const reader of clients)try{await reader.cancel();}catch{}
 if(hold){await p.seatHold.deleteMany({where:{holdSessionId:hold.id}});await p.holdSession.delete({where:{id:hold.id}});}
 await p.$disconnect();
}
