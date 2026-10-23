import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const base='D:/Merge_2/Codegym-demo-proof-20261023T1530';
const cfg=JSON.parse(readFileSync(`${base}/.sprint1-demo/config.json`,'utf8'));
if(cfg.profile!=='s1demo-384da3d43b41'||cfg.database!=='sprint1_demo_384da3d43b41'||cfg.ports.postgres!==15460) throw new Error('Refusing non-demo profile');
const require=createRequire(`${base}/apps/api/package.json`);
const {PrismaClient}=require('@prisma/client');
const {PrismaPg}=require('@prisma/adapter-pg');
const url=`postgresql://${encodeURIComponent(cfg.user)}:${encodeURIComponent(cfg.dbPassword)}@127.0.0.1:${cfg.ports.postgres}/${cfg.database}?schema=public`;
const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:url,max:1})});
try {
 const result=await prisma.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const db=await tx.$queryRaw`SELECT current_database() AS database`;
  const admissions=await tx.$queryRaw`SELECT count(*)::int AS count FROM ticket_admissions`;
  const checked=await tx.$queryRaw`SELECT count(*)::int AS count FROM order_items WHERE "checkedInAt" IS NOT NULL`;
  const valid=await tx.$queryRaw`SELECT count(*)::int AS count FROM tickets WHERE status='VALID'`;
  return {database:db[0].database, admissionCount:admissions[0].count, checkedInItemCount:checked[0].count, validTicketCount:valid[0].count};
 },{timeout:10000});
 writeFileSync('D:/Merge_2/Codegym/evidence/ai-remediation/20261023T132000-demo-handoff/s30-ac02-db-oracle.json',JSON.stringify({capturedAt:new Date().toISOString(),profile:cfg.profile,readOnly:true,afterRejectedUnknownTicket:result,expected:'No admission or checked-in item is created by a rejected unknown code.'},null,2));
 process.stdout.write(JSON.stringify(result));
} finally { await prisma.$disconnect(); }


