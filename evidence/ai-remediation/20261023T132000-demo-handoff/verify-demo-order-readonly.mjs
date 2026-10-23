import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const repo = resolve(import.meta.dirname, '../../..');
const proof = resolve(repo, '..', 'Codegym-demo-proof-20261023T1530');
const cfg = JSON.parse(readFileSync(resolve(proof, '.sprint1-demo/config.json'), 'utf8'));
const expectedProfile = 's1demo-384da3d43b41';
const orderId = '0626cd37-b0f6-4aed-aa20-e6b0ccacf9a0';
if (cfg.profile !== expectedProfile || cfg.database !== 'sprint1_demo_384da3d43b41' || !Number.isInteger(cfg.ports?.postgres)) throw new Error('Demo profile guard mismatch');
const connectionString = `postgresql://${cfg.user}:${encodeURIComponent(cfg.dbPassword)}@127.0.0.1:${cfg.ports.postgres}/${cfg.database}`;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1 }) });
try {
 const result = await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const o = await tx.order.findUnique({ where:{id:orderId}, select:{id:true,status:true,totalAmount:true,subtotalAmount:true,discountAmount:true,showtimeId:true,items:{select:{categoryName:true,tierName:true,unitPrice:true,seat:{select:{row:true,seatNumber:true,isSold:true,hold:{select:{seatId:true}}}}}},payments:{select:{gateway:true,status:true,amount:true,attemptNo:true,transactionId:true}},tickets:{select:{status:true,price:true,seatLabel:true}}}});
  if(!o) throw new Error('Expected demo order not found');
  const mailJobs = await tx.ticketMailDelivery.count({where:{orderId:o.id}});
  const ticketsForOrder = await tx.ticket.findMany({where:{orderId:o.id},select:{code:true,status:true,seatLabel:true,price:true}});
  const allTickets = await tx.ticket.findMany({select:{code:true,status:true,seatLabel:true,price:true}});
  const counts = {events:await tx.event.count(),showtimes:await tx.showtime.count(),orders:await tx.order.count(),paidOrders:await tx.order.count({where:{status:'PAID'}}),tickets:allTickets.length};
  return {profile:cfg.profile, database:cfg.database, order:{id:o.id,status:o.status,totalAmount:o.totalAmount,subtotalAmount:o.subtotalAmount,discountAmount:o.discountAmount,showtimeId:o.showtimeId,itemCount:o.items.length,items:o.items.map(x=>({categoryName:x.categoryName,tierName:x.tierName,unitPrice:x.unitPrice,seatLabel:`${x.seat.row}-${x.seat.seatNumber}`,isSold:x.seat.isSold,hasActiveHold:!!x.seat.hold}))}, payments:o.payments,tickets:o.tickets,ticketCodeHashes:ticketsForOrder.map(t=>createHash('sha256').update(t.code).digest('hex')),ticketInventorySummary:allTickets.map(t=>({status:t.status,seatLabel:t.seatLabel,price:t.price})),uniqueTicketCodeCount:new Set(allTickets.map(t=>t.code)).size,catalogCounts:counts,ticketMailJobCount:mailJobs, assertions:{paid:o.status==='PAID',exactTotal:o.totalAmount===380000&&o.subtotalAmount===380000&&o.discountAmount===0,oneItem:o.items.length===1,oneSucceededPayment:o.payments.length===1&&o.payments[0].status==='SUCCEEDED'&&o.payments[0].amount===380000,oneValidTicket:o.tickets.length===1&&o.tickets[0].status==='VALID',seatSold:o.items.length===1&&o.items[0].seat.isSold,holdReleased:o.items.every(x=>!x.seat.hold)}};
 });
 const out=resolve(repo,'evidence/ai-remediation/20261023T132000-demo-handoff/demo-core-walkthrough-db-oracle.json');
 writeFileSync(out,JSON.stringify({capturedAt:new Date().toISOString(),mode:'read-only transaction',result},null,2));
 console.log(JSON.stringify({evidence:out,assertions:result.assertions,ticketMailJobCount:result.ticketMailJobCount}));
} finally { await prisma.$disconnect(); }




