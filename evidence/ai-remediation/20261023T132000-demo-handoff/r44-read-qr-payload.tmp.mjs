import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createPrivateKey, sign } from 'node:crypto';
const base='D:/Merge_2/Codegym-demo-proof-20261023T1530';
const cfg=JSON.parse(readFileSync(base+'/.sprint1-demo/config.json','utf8'));
if(cfg.profile!=='s1demo-384da3d43b41'||cfg.database!=='sprint1_demo_384da3d43b41'||cfg.ports.postgres!==15460) throw Error('profile guard');
const orderId='25235869-ebff-4454-9547-2fa7307c0e2b';
const showtimeId='e0c0e1a0-ced3-4bd1-8a6d-eaea3e712916';
const req=createRequire(base+'/apps/api/package.json');
const {PrismaClient}=req('@prisma/client'); const {PrismaPg}=req('@prisma/adapter-pg'); const {ticketQrInput,TICKET_QR_VERSION,TICKET_QR_ALGORITHM}=req('shared/ticket-qr');
const url=`postgresql://${encodeURIComponent(cfg.user)}:${encodeURIComponent(cfg.dbPassword)}@127.0.0.1:${cfg.ports.postgres}/${cfg.database}?schema=public`;
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url,max:1})});
try {
 const result=await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const order=await tx.order.findUnique({where:{id:orderId},include:{items:true,tickets:true,payments:true}});
  if(!order||order.status!=='PAID'||order.showtimeId!==showtimeId||order.items.length!==1||order.tickets.length!==1||order.payments.filter(p=>p.status==='SUCCEEDED').length!==1) throw Error('exact order/ticket guard');
  const item=order.items[0], ticket=order.tickets[0];
  if(ticket.status!=='VALID'||ticket.showtimeId!==showtimeId||ticket.orderId!==orderId||item.seatId!==ticket.seatId||item.checkedInAt) throw Error('exact ticket/item guard');
  const input=ticketQrInput({keyId:cfg.profile,showtimeId,ticketId:item.id});
  const privateKey=createPrivateKey(readFileSync(base+'/.sprint1-demo/signing.pem'));
  const payload=input+'.'+sign(null,Buffer.from(input,'ascii'),privateKey).toString('base64url');
  return {payload,format:TICKET_QR_VERSION+'.'+TICKET_QR_ALGORITHM,orderId,showtimeId,orderItemId:item.id,ticketId:ticket.id,seatLabel:ticket.seatLabel,orderStatus:order.status,ticketStatus:ticket.status};
 });
 writeFileSync('D:/Merge_2/Codegym/evidence/ai-remediation/20261023T132000-demo-handoff/.r44-second-ticket-payload.tmp',result.payload,'utf8');
 writeFileSync('D:/Merge_2/Codegym/evidence/ai-remediation/20261023T132000-demo-handoff/r44-second-ticket-guard-summary.json',JSON.stringify({...result,payload:'[REDACTED]'})+'\n','utf8');
 console.log('R44 exact paid order, order item, ticket and fixture guards passed; payload kept in a temporary local file and redacted.');
} finally {await db.$disconnect();}



