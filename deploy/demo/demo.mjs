import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,writeFileSync,chownSync,chmodSync} from 'node:fs';
import {randomBytes,randomUUID,generateKeyPairSync,createPublicKey} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const mode=process.argv[2],state='/demo-state',file=state+'/config.json';
assert.equal(process.env.DEMO_MODE,'true','Explicit DEMO_MODE=true required');
if(process.env.APP_ENV==='production')throw Error('Demo is forbidden in production');
function config(){const c=JSON.parse(readFileSync(file,'utf8'));assert.equal(c.version,1);return c;}
if(mode==='init'){
 const password=process.env.DEMO_PASSWORD??'';assert.ok(password.length>=12&&!password.startsWith('<'),'Set DEMO_PASSWORD>=12 characters');
 const dbUrl=new URL(process.env.DATABASE_URL),dbPassword=decodeURIComponent(dbUrl.password);assert.ok(/^[A-Za-z0-9_-]{12,}$/.test(dbPassword)&&dbPassword!==password,'Use a distinct URL-safe database password>=12 characters');
 const origin=new URL(process.env.WEB_ORIGIN);assert.ok(['http:','https:'].includes(origin.protocol)&&!origin.username&&!origin.password&&origin.pathname==='/','PUBLIC_URL must be an origin');
 mkdirSync(state,{recursive:true});
 if(!existsSync(file)){
  const pair=generateKeyPairSync('ed25519'),c={version:1,password,authProxySecret:randomBytes(48).toString('base64url'),paymentWebhookSecret:randomBytes(48).toString('base64url'),keyId:'demo-k1',privatePem:pair.privateKey.export({type:'pkcs8',format:'pem'}).toString(),createdAt:new Date().toISOString()};
  writeFileSync(file,JSON.stringify(c),{flag:'wx',mode:0o600});
 }
 if(config().password!==password)throw Error('Existing demo password differs: retain original .env; no automatic password reset');
 chownSync(file,1000,1000);chmodSync(file,0o600);chownSync(state,1000,1000);chmodSync(state,0o700);
 console.log('Demo key/config volume ready; existing keys preserved.');
}else if(mode==='prepare'){
 const c=config();assert.equal(process.env.APP_ENV,'demo');
 const url=new URL(process.env.DATABASE_URL);assert.equal(url.hostname,'postgres','Demo prepare only targets private Compose postgres');
 const require=createRequire(resolve(process.cwd(),'package.json')),{PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg');
 const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString(),max:2})});
 try{
  // One session-level advisory lock spans Prisma migration and fixture transaction.
  await db.$transaction(async tx=>{
   await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(427045,1)');
   const r=spawnSync('/app/apps/api/node_modules/.bin/prisma',['migrate','deploy'],{stdio:'inherit',env:{...process.env}});assert.equal(r.status,0,'Migration failed: API startup blocked');
  },{timeout:180000});
  if(process.env.DEMO_SEED==='false'){console.log('Demo seed explicitly disabled');process.exitCode=0;}
  else{
   const argon2=require('argon2'),hash=await argon2.hash(c.password);
   const day=process.env.DEMO_DATE||new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'});assert.match(day,/^\d{4}-\d{2}-\d{2}$/);const batch=process.env.DEMO_BATCH||'1';assert.match(batch,/^[a-zA-Z0-9_-]{1,24}$/);
   const result=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(427045,2)');
    const accounts={};for(const [who,role]of Object.entries({buyerA:'BUYER',buyerB:'BUYER',organizer:'ORGANIZER',admin:'ADMIN',staffA:'STAFF',staffB:'STAFF'})){
     await tx.role.upsert({where:{name:role},create:{name:role},update:{}});
     accounts[who]=await tx.user.upsert({where:{email:`${who.toLowerCase()}@demo.invalid`},update:{},create:{email:`${who.toLowerCase()}@demo.invalid`,password:hash,fullName:`Demo ${who}`,isEmailVerified:true,userRoles:{create:{role:{connect:{name:role}}}}},select:{id:true,email:true}});
    }
    const name=`Demo Sprint4-5 ${day} #${batch}`;let event=await tx.event.findFirst({where:{name,organizerId:accounts.organizer.id}});
    if(event){const shows=await tx.showtime.findMany({where:{eventId:event.id},orderBy:{startTime:'asc'},select:{id:true}}),orders=[];for(const show of shows){const order=await tx.order.findFirstOrThrow({where:{eventId:event.id,showtimeId:show.id,userId:accounts.buyerA.id,status:'PAID'},orderBy:{createdAt:'asc'}});orders.push(order.id);}return{eventId:event.id,accounts,orders,shows:shows.map(s=>s.id),existing:true,day,batch};}
    event=await tx.event.create({data:{name,organizerId:accounts.organizer.id,description:'DEMO: fake payment, catcher email, no real refund/provider',location:'Demo venue',status:'PUBLISHED'}});
    const orders=[],shows=[];for(const [offset,count]of [[0,55],[1,3]]){
     const start=new Date(day+'T19:00:00+07:00');start.setUTCDate(start.getUTCDate()+offset);
     const show=await tx.showtime.create({data:{eventId:event.id,startTime:start,status:'ON_SALE',maxTicketsPerUser:null}});shows.push(show.id);
     const cat=await tx.seatCategory.create({data:{showtimeId:show.id,name:'STANDARD',price:150000}});
     const order=await tx.order.create({data:{userId:accounts.buyerA.id,eventId:event.id,showtimeId:show.id,status:'PAID',totalAmount:count*150000,paymentExpiresAt:new Date(),expiresAt:new Date()}});orders.push(order.id);
     const gates=[];for(const [who,gateName]of [['staffA','Cửa A'],['staffB','Cửa B']]){
      const gate=await tx.checkInGate.create({data:{showtimeId:show.id,name:gateName}});gates.push(gate);
      await tx.showtimeStaff.create({data:{showtimeId:show.id,userId:accounts[who].id}});
      await tx.checkInPermission.create({data:{userId:accounts[who].id,gateId:gate.id,staffName:`Demo ${who}`,canOverride:who==='staffA'}});
     }
     for(let i=1;i<=count+8;i++){
      const seat=await tx.seat.create({data:{showtimeId:show.id,categoryId:cat.id,row:'A',seatNumber:i}});if(i>count)continue;
      const item=await tx.orderItem.create({data:{orderId:order.id,seatId:seat.id,categoryName:'STANDARD',unitPrice:150000}});
      const used=i===count-1,cancelled=i===count;
      await tx.ticket.create({data:{orderId:order.id,showtimeId:show.id,seatId:seat.id,code:randomUUID(),seatLabel:`A-${i}`,ticketType:'STANDARD',price:150000,...(cancelled?{status:'CANCELLED',cancelledAt:new Date()}:used?{status:'CHECKED_IN',checkedInAt:new Date()}: {})}});
      if(used){await tx.orderItem.update({where:{id:item.id},data:{checkedInAt:new Date()}});await tx.ticketAdmission.create({data:{ticketId:item.id,showtimeId:show.id,gateId:gates[0].id,gateName:'Cửa A',staffId:accounts.staffA.id,staffName:'Demo staffA',requestId:randomUUID(),kind:'NORMAL'}});}
     }
    }
    for(const status of ['CANCELLED','EXPIRED'])await tx.order.create({data:{userId:accounts.buyerA.id,eventId:event.id,showtimeId:shows[0],status,totalAmount:0,paymentExpiresAt:new Date(),expiresAt:new Date()}});
    return {eventId:event.id,accounts,orders,shows,day,batch,existing:false};
   },{timeout:120000});
   writeFileSync(state+'/fixture.json',JSON.stringify(result,null,2),{mode:0o600});chownSync(state+'/fixture.json',1000,1000);
   console.log(`Demo data ready for ${day}; preserved existing orders/tickets. URL ${process.env.WEB_ORIGIN}; credentials: configured DEMO_PASSWORD, accounts in HUONG_DAN_DEMO.md.`);
  }
 }finally{await db.$disconnect();}
}else if(mode==='api'||mode==='web'){
 const c=config();process.env.AUTH_PROXY_SECRET=c.authProxySecret;
 if(mode==='api'){
  assert.equal(process.env.APP_ENV,'demo');assert.equal(process.env.NODE_ENV,'development');
  process.env.PAYMENT_WEBHOOK_SECRET=c.paymentWebhookSecret;
  process.env.SCANNER_KEY_ID=c.keyId;process.env.SCANNER_SIGNING_PRIVATE_KEY=c.privatePem;
  process.env.SCANNER_PUBLIC_KEYS=JSON.stringify({[c.keyId]:createPublicKey(c.privatePem).export({type:'spki',format:'pem'}).toString()});
  process.env.TICKET_SIGNING_ACTIVE_KEY_ID=c.keyId;
  process.env.TICKET_SIGNING_PRIVATE_KEY=(await import('node:crypto')).createPrivateKey(c.privatePem).export({type:'pkcs8',format:'der'}).toString('base64');
  process.env.TICKET_SIGNING_PUBLIC_KEYS=JSON.stringify({[c.keyId]:createPublicKey(c.privatePem).export({type:'spki',format:'der'}).toString('base64')});
  await import('./dist/main.js');
 }else await import('./server.mjs');
}else throw Error('Expected init, prepare, api or web');
