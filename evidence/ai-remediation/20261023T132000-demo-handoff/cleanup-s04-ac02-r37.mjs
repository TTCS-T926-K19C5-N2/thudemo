import {readFileSync,writeFileSync} from 'node:fs';import {createRequire} from 'node:module';
const base='D:/Merge_2/Codegym-demo-proof-20261023T1530';
const cfg=JSON.parse(readFileSync(`${base}/.sprint1-demo/config.json`,'utf8'));
if(cfg.profile!=='s1demo-384da3d43b41'||cfg.database!=='sprint1_demo_384da3d43b41'||cfg.ports.postgres!==15460)throw Error('Refusing non-demo profile');
const ownerAccount=cfg.accounts.find(x=>x.name==='organizer-a');if(!ownerAccount)throw Error('Missing expected synthetic owner');
const require=createRequire(`${base}/apps/api/package.json`),{PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg');
const url=`postgresql://${encodeURIComponent(cfg.user)}:${encodeURIComponent(cfg.dbPassword)}@127.0.0.1:${cfg.ports.postgres}/${cfg.database}?schema=public`;
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url,max:1})});
try{
 const eventId='b9eecb6f-1de2-4f1d-8dc1-8391937a894c',showtimeId='8955005d-d389-4885-9a3b-b7892acf82a2',fixtureName='AI-R37-S04-20261023T1517Z';
 const outcome=await db.$transaction(async tx=>{
  const owner=await tx.user.findUnique({where:{email:ownerAccount.email},select:{id:true}});if(!owner)throw Error('Expected synthetic owner missing');
  const ev=await tx.event.findUniqueOrThrow({where:{id:eventId},include:{showtimes:{select:{id:true,status:true,startTime:true}}}});
  if(ev.name!==fixtureName||ev.status!=='DRAFT'||ev.organizerId!==owner.id||ev.showtimes.length!==1||ev.showtimes[0].id!==showtimeId||ev.showtimes[0].status!=='DRAFT'||ev.showtimes[0].startTime.toISOString()!=='2026-10-24T08:00:00.000Z')throw Error('Exact fixture identity/owner/status guard failed');
  const [orders,seats,categories,coupons,gates,waitlist]=await Promise.all([
   tx.order.count({where:{showtimeId}}),tx.seat.count({where:{showtimeId}}),tx.seatCategory.count({where:{showtimeId}}),tx.coupon.count({where:{eventId}}),tx.checkInGate.count({where:{showtimeId}}),tx.waitlistEntry.count({where:{showtimeId}})
  ]);
  if(orders||seats||categories||coupons||gates||waitlist)throw Error(`Refusing cleanup with children: ${JSON.stringify({orders,seats,categories,coupons,gates,waitlist})}`);
  await tx.showtime.delete({where:{id:showtimeId}});
  await tx.event.delete({where:{id:eventId,organizerId:owner.id}});
  const [eventCount,showtimeCount,orderCount,ticketCount]=await Promise.all([tx.event.count(),tx.showtime.count(),tx.order.count(),tx.ticket.count()]);
  return {removedEventId:eventId,removedShowtimeId:showtimeId,removedOnlyAfterExactOwnerNameStatusAndChildGuards:true,children:{orders,seats,categories,coupons,gates,waitlist},after:{eventCount,showtimeCount,orderCount,ticketCount}};
 },{timeout:15000});
 const out={capturedAt:new Date().toISOString(),profile:cfg.profile,cleanup:'exact-run-fixture only',outcome,expectedAfter:{eventCount:40,showtimeCount:42,orderCount:2,ticketCount:2},status:outcome.after.eventCount===40&&outcome.after.showtimeCount===42&&outcome.after.orderCount===2&&outcome.after.ticketCount===2?'PASS':'FAIL'};
 writeFileSync('D:/Merge_2/Codegym/evidence/ai-remediation/20261023T132000-demo-handoff/s04-ac02-cleanup.json',JSON.stringify(out,null,2));process.stdout.write(JSON.stringify(out.outcome));if(out.status!=='PASS')process.exitCode=2;
}finally{await db.$disconnect()}
