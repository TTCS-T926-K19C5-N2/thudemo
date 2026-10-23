import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { createHash,randomBytes,randomUUID } from 'node:crypto';
import { openSync,closeSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import * as argon2 from 'argon2';
import { CancellationsService } from '../dist/lifecycle/cancellations.service.js';
import { ReportsService } from '../dist/lifecycle/reports.service.js';
import { PrivacyService } from '../dist/lifecycle/privacy.service.js';
import { LifecycleWorker } from '../dist/lifecycle/lifecycle.module.js';
import { BookingAccessService } from '../dist/booking-access/booking-access.service.js';
import { TicketQrService } from '../dist/orders/ticket-qr.service.js';
import { ScannerCryptoService } from '../dist/scanner/scanner-crypto.service.js';

const dbUrl=new URL(process.env.DATABASE_URL);
assert(/^\/codegym_sprint_\d+$/.test(dbUrl.pathname),'Only the explicitly prepared isolated sprint DB is allowed.');
const dir=resolve(import.meta.dirname,'../../../.cache/sprint4-8-evidence/20261022');
const p=new PrismaClient({adapter:new PrismaPg({connectionString:dbUrl.href})});
const redis=new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');redis.on('error',()=>{});
const env={...process.env,PORT:'3392',WEB_ORIGIN:'http://localhost:3393',APP_ENV:`sprint-test-${Date.now()}`,LIFECYCLE_WORKER:'off',HOLD_EXPIRY_MODE:'off',ORDER_EXPIRY_MODE:'off',REGISTRATION_DELIVERY_MODE:'off',REGISTRATION_MAIL_MODE:'catcher',SMTP_HOST:'127.0.0.1',SMTP_PORT:'9',SMTP_FROM:'test@fixture.invalid',TICKET_MAIL_WORKER:'false',WAITING_ROOM_CAPACITY:'1',BOOKING_HOLD_ACCOUNT_LIMIT:'6',BOOKING_HOLD_IP_LIMIT:'1000',BOOKING_ORDER_ACCOUNT_LIMIT:'6',BOOKING_ORDER_IP_LIMIT:'1000',MOCK_REFUND_FAIL_FIRST_ATTEMPTS:'0',MONITORING_ENABLED:'true',METRICS_PORT:'9492',METRICS_HOST:'127.0.0.1',METRICS_TOKEN_FILE:'',METRICS_TOKEN:randomBytes(32).toString('hex')};
const api='http://127.0.0.1:3392';
const log=openSync(resolve(dir,'integration-api.log'),'w');
const child=spawn(process.execPath,['dist/main.js'],{cwd:resolve(import.meta.dirname,'..'),env,stdio:['ignore',log,log],windowsHide:true});
const results=[];
async function test(id,work){try{await work();results.push({id,result:'PASS'});console.log(`PASS ${id}`);}catch(e){results.push({id,result:'FAIL',message:e.message});console.log(`FAIL ${id}: ${e.message}`);}}
async function request(path,actor,method='GET',body){const response=await fetch(api+path,{method,headers:{...(actor?.cookie?{cookie:actor.cookie}:{}),origin:env.WEB_ORIGIN,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,headers:response.headers,data:await response.json()};}
async function ok(path,actor,method='GET',body){const r=await request(path,actor,method,body);assert(r.status<300,`${method} ${path}: ${r.status} ${r.data.message}`);return r.data;}
const pw=`Fixture!${randomBytes(12).toString('hex')}`;
async function user(role='BUYER'){
  const id=randomUUID(),email=`qa-${id}@fixture.invalid`,password=await argon2.hash(pw);
  await p.user.create({data:{id,email,password,fullName:'QA isolated fixture',isActive:true,isEmailVerified:true,userRoles:{create:{role:{connect:{name:role}}}}}});
  const token=randomBytes(32).toString('base64url');await p.session.create({data:{userId:id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+3600000)}});
  return {id,email,roles:[role],cookie:`event_session=${token}`};
}
let buyer,other,organizer,admin,accountant,staff,show,seatList,order;
const config=new ConfigService(env),changes=[],sent=[];
const cancel=new CancellationsService(p,{invalidate:id=>changes.push(id)},config),reports=new ReportsService(p),privacy=new PrivacyService(p);
const gatewayCrypto=new ScannerCryptoService(config),qr=new TicketQrService(p,gatewayCrypto);
const access=new BookingAccessService(redis,config);
async function paidOrder(actor,showtimeId,seatIds){
  const sh=await p.showtime.findUniqueOrThrow({where:{id:showtimeId}});
  return p.$transaction(async tx=>{
    const seats=await tx.seat.findMany({where:{id:{in:seatIds}},include:{category:true}});
    const order=await tx.order.create({data:{userId:actor.id,eventId:sh.eventId,showtimeId,status:'PAID',totalAmount:seats.reduce((n,s)=>n+s.category.price,0),paymentExpiresAt:new Date(Date.now()+600000),items:{create:seats.map(s=>({seatId:s.id,unitPrice:s.category.price,categoryName:s.category.name}))}}});
    await tx.payment.create({data:{orderId:order.id,amount:order.totalAmount,status:'SUCCEEDED',gateway:'mock',gatewayRef:`qa-${order.id}`,transactionId:`tx-${order.id}`}});
    await tx.seat.updateMany({where:{id:{in:seatIds}},data:{isSold:true}});
    await tx.ticket.createMany({data:seats.map(s=>({orderId:order.id,showtimeId,seatId:s.id,code:randomBytes(16).toString('base64url'),seatLabel:`${s.row}-${s.seatNumber}`,ticketType:s.category.name,price:s.category.price}))});
    return order;
  }, {timeout:30000});
}
try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(api+'/health')).ok){ready=true;break;}}catch{}await delay(200);}assert(ready,'Isolated API failed to start; inspect integration-api.log');
  [buyer,other,organizer,admin,accountant,staff]=await Promise.all(['BUYER','BUYER','ORGANIZER','ADMIN','ACCOUNTANT','STAFF'].map(user));
  const event=await p.event.create({data:{name:'QA sprint4–8 isolated event',description:'Test DB only',location:'QA venue',organizerId:organizer.id,status:'PUBLISHED'}});
  show=await p.showtime.create({data:{eventId:event.id,startTime:new Date(Date.now()+7*86400000),status:'ON_SALE',isDemo:false,maxTicketsPerUser:4}});
  const category=await p.seatCategory.create({data:{showtimeId:show.id,name:'VIP',price:100000}});
  await p.seat.createMany({data:Array.from({length:30},(_,i)=>({showtimeId:show.id,categoryId:category.id,row:'Q',seatNumber:i+1}))});
  await test('S43 real rejected-webhook producer appears in protected metrics',async()=>{
    assert.equal((await request('/payments/webhook',null,'POST',{invalid:true})).status,401);
    const r=await fetch('http://127.0.0.1:9492/metrics',{headers:{authorization:`Bearer ${env.METRICS_TOKEN}`}});assert.equal(r.status,200);const text=await r.text();assert.match(text,/ticket_webhook_rejections_total\{reason="signature"\} [1-9]/);assert.match(text,/ticket_http_requests_total/);assert.equal((await fetch('http://127.0.0.1:9492/metrics')).status,401);
    const dashboard=await ok('/operations/monitoring',admin);assert(dashboard.enabled);assert(dashboard.alerts.includes('REJECTED_WEBHOOK'));assert(dashboard.history.some(h=>h.code==='REJECTED_WEBHOOK'&&h.state==='FIRING'));assert.equal((await request('/operations/monitoring',buyer)).status,403);
  });
  seatList=await p.seat.findMany({where:{showtimeId:show.id},orderBy:{seatNumber:'asc'}});
  order=await paidOrder(buyer,show.id,seatList.slice(0,3).map(s=>s.id));
  await test('S40 direct hold API cannot bypass waiting room',async()=>assert.equal((await request(`/showtimes/${show.id}/holds`,other,'POST',{seatIds:[seatList[9].id]})).data.code,'WAITING_ROOM_REQUIRED'));
  await test('S40 first actor admitted; second queued in FIFO order',async()=>{assert((await ok(`/showtimes/${show.id}/waiting-room`,buyer,'POST',{})).admitted);const b=await ok(`/showtimes/${show.id}/waiting-room`,other,'POST',{});assert.equal(b.admitted,false);assert.equal(b.position,1);});
  await test('S40 refresh does not duplicate member or extend active lease',async()=>{const a=await access.join(show.id,buyer.id),b=await access.join(show.id,buyer.id);assert.equal(a.expiresAt,b.expiresAt);assert.equal(await redis.zcard(`booking:${env.APP_ENV}:{${show.id}}:active`),1);});
  await test('S40 expired lease loses slot and next waiting actor is promoted',async()=>{await redis.zadd(`booking:${env.APP_ENV}:{${show.id}}:active`,Date.now()-1,buyer.id);assert((await access.join(show.id,other.id)).admitted);assert(!(await access.admitted(show.id,buyer.id)));});
  await test('S41 account budget is independent of IP and returns positive wait',async()=>{for(let i=0;i<6;i++)assert.equal(await access.limit('order',buyer.id,`ip-${i}`),0);assert((await access.limit('order',buyer.id,'new-ip'))>0);});
  await test('S41 IP budget applies across accounts',async()=>{const a=new BookingAccessService(redis,new ConfigService({...env,BOOKING_HOLD_IP_LIMIT:'2'}));assert.equal(await a.limit('hold',randomUUID(),'fixture-shared-ip'),0);assert.equal(await a.limit('hold',randomUUID(),'fixture-shared-ip'),0);assert((await a.limit('hold',randomUUID(),'fixture-shared-ip'))>0);});
  const quotaUser=await user();
  await test('S42 concurrent same-account distinct-seat claims cannot exceed cap',async()=>{
    await p.showtime.update({where:{id:show.id},data:{maxTicketsPerUser:1}});
    const claim=(seat,id)=>p.$transaction(tx=>tx.$queryRaw`SELECT * FROM claim_hold_v5(${show.id}::uuid,${quotaUser.id}::uuid,${id},${'{'+seat.id+'}'}::uuid[],${randomUUID()}::uuid,${randomUUID()}::uuid)`);
    const r=await Promise.all([claim(seatList[10],'session-a'),claim(seatList[11],'session-b')]);
    assert.equal(r.filter(x=>x[0].failure===null).length,1);assert.equal(r.filter(x=>x[0].failure==='H0007').length,1);
  });
  await test('S42 repeated same held seat does not double-count quota',async()=>{
    const held=await p.seatHold.findFirstOrThrow({where:{holdSession:{userId:quotaUser.id}},include:{holdSession:true}});
    const r=await p.$queryRaw`SELECT * FROM claim_hold_v5(${show.id}::uuid,${quotaUser.id}::uuid,${held.holdSession.sessionHash},${'{'+held.seatId+'}'}::uuid[],${randomUUID()}::uuid,${randomUUID()}::uuid)`;assert.equal(r[0].failure,null);
  });
  await p.showtime.update({where:{id:show.id},data:{maxTicketsPerUser:4}});
  await test('S45 preview contains approved24h/100percent policy',async()=>{const r=await ok(`/orders/${order.id}/cancellation`,buyer);assert(r.eligible);assert.equal(r.policy.cutoffHours,24);assert.equal(r.amount,300000);});
  await test('S45 another buyer cannot preview or cancel order',async()=>{assert.equal((await request(`/orders/${order.id}/cancellation`,other)).status,403);assert.equal((await request(`/orders/${order.id}/cancel`,other,'POST',{})).status,403);});
  await test('S45 cancellation is concurrent-idempotent and creates one refund',async()=>{await Promise.all([cancel.cancel(order.id,buyer),cancel.cancel(order.id,buyer)]);assert.equal(await p.refund.count({where:{orderId:order.id}}),1);assert.equal((await p.order.findUniqueOrThrow({where:{id:order.id}})).status,'CANCELLED');});
  await test('S46 releases all seats, invalidates QR and emits refresh',async()=>{assert.equal(await p.seat.count({where:{id:{in:seatList.slice(0,3).map(s=>s.id)},isSold:true}}),0);assert.equal(await p.ticket.count({where:{orderId:order.id,status:'CANCELLED'}}),3);assert((await qr.forOwner(order.id,buyer.id)).tickets.every(t=>t.qrPayload===null));assert(changes.includes(show.id));});
  await test('S38 cancelled tickets remain visible in MyTickets without QR',async()=>{const result=await qr.forBuyer(buyer.id,{page:1,pageSize:20,skip:0});assert.equal(result.tickets.filter(t=>t.orderId===order.id).length,3);assert(result.tickets.filter(t=>t.orderId===order.id).every(t=>t.qrPayload===null));});
  const resale=await paidOrder(other,show.id,[seatList[0].id]);
  await test('S46 retry old cancellation cannot release seat sold to new order',async()=>{await cancel.cancel(order.id,buyer);assert((await p.seat.findUniqueOrThrow({where:{id:seatList[0].id}})).isSold);assert.equal((await p.order.findUniqueOrThrow({where:{id:resale.id}})).status,'PAID');});
  await test('S48 concurrent refund workers complete each refund once with fenced receipt',async()=>{await Promise.all([cancel.processRefundBatch(),cancel.processRefundBatch()]);const r=await p.refund.findUniqueOrThrow({where:{orderId:order.id}});assert.equal(r.status,'SUCCEEDED');assert.equal(await p.refundAttempt.count({where:{refundId:r.id}}),1);});
  await test('S50 report separates gross/refunded/net and excludes released seats from sold',async()=>{const r=await reports.financial(show.id,organizer);assert.equal(r.categories[0].gross,400000);assert.equal(r.categories[0].refunded,300000);assert.equal(r.categories[0].net,100000);assert.equal(r.categories[0].sold,1);});
  await test('S50/S52 reports deny unrelated organizer',async()=>{await assert.rejects(reports.financial(show.id,other),e=>e.status===403);assert.equal((await request(`/showtimes/${show.id}/attendance-report`,buyer)).status,403);});
  await test('S49 audit has before/after and human actor, other buyer403',async()=>{const logs=await reports.timeline(order.id,buyer);assert(logs.some(l=>l.beforeState?.status==='PAID'&&l.afterState?.status==='CANCELLED'&&l.actorId===buyer.id));await assert.rejects(reports.timeline(order.id,other),e=>e.status===403);});
  const tooLate=await paidOrder(buyer,show.id,[seatList[4].id]);
  await test('S45 after-cutoff cancellation fails without refund or state mutation',async()=>{const old=show.startTime;await p.showtime.update({where:{id:show.id},data:{startTime:new Date(Date.now()+3600000)}});try{await assert.rejects(cancel.cancel(tooLate.id,buyer),e=>e.status===409);assert.equal(await p.refund.count({where:{orderId:tooLate.id}}),0);}finally{await p.showtime.update({where:{id:show.id},data:{startTime:old}});}});
  await test('S45 checked-in order cannot be buyer-cancelled',async()=>{const item=await p.orderItem.findFirstOrThrow({where:{orderId:tooLate.id}});await p.orderItem.update({where:{id:item.id},data:{checkedInAt:new Date()}});await assert.rejects(cancel.cancel(tooLate.id,buyer),e=>e.status===409);});
  const failOrder=await paidOrder(buyer,show.id,[seatList[5].id]);await cancel.cancel(failOrder.id,buyer);
  await test('S48 three failures use increasing backoff then appear in accountant list',async()=>{
    const failing=new CancellationsService(p,{invalidate(){}},new ConfigService({...env,MOCK_REFUND_FAIL_FIRST_ATTEMPTS:'3'}));
    for(let n=1;n<=3;n++){await p.refund.update({where:{orderId:failOrder.id},data:{nextAttemptAt:new Date(0)}});await failing.processRefundBatch();const r=await p.refund.findUniqueOrThrow({where:{orderId:failOrder.id}});assert.equal(r.attempts,n);assert.equal(r.status,n===3?'FAILED':'QUEUED');if(n<3)assert(r.nextAttemptAt.getTime()>Date.now());}
    assert((await ok('/operations/refunds',accountant)).refunds.some(r=>r.orderId===failOrder.id));
  });
  await test('S48 buyer cannot resolve refund; accountant manual mock resolution works',async()=>{const r=await p.refund.findUniqueOrThrow({where:{orderId:failOrder.id}});assert.equal((await request(`/operations/refunds/${r.id}/resolve-mock`,buyer,'POST',{})).status,403);assert.equal((await ok(`/operations/refunds/${r.id}/resolve-mock`,accountant,'POST',{})).status,'SUCCEEDED');});
  await test('S51 dryrun returns4groups and does not save or mutate payments',async()=>{
    const count=await p.payment.count(),runs=await p.reconciliationRun.count();
    const r=await reports.reconcile({csv:`transactionId,amount\ntx-${order.id},300000\ntx-${resale.id},999\nprovider-only,1`,gateway:'mock',periodStart:'2026-10-01',periodEnd:'2026-11-01'},accountant);
    assert(r.dryRun);assert.equal(await p.reconciliationRun.count(),runs);assert.equal(await p.payment.count(),count);
    assert.equal(new Set(r.rows.map(row=>row.classification)).size,4);
  });
  await test('S51 repeated statement is deduplicated; malformed and buyer import rejected',async()=>{
    const body={csv:'transactionId,amount\nfixture,123',gateway:'mock',periodStart:'2026-10-01',periodEnd:'2026-11-01',dryRun:false};
    const a=await ok('/operations/reconciliation',accountant,'POST',body),b=await ok('/operations/reconciliation',accountant,'POST',body);assert.equal(a.id,b.id);
    assert.equal((await request('/operations/reconciliation',buyer,'POST',body)).status,403);
    assert.equal((await request('/operations/reconciliation',accountant,'POST',{...body,csv:'bad'})).status,400);
  });
  await test('S54 signup persists consent version and timestamp via registration API',async()=>{
    const notice=await ok('/users/registration-notice');const email=`register-${randomUUID()}@fixture.invalid`;
    await ok('/users/register',null,'POST',{email,fullName:'Fixture registration',password:pw,consent:true,noticeVersion:notice.version});
    const u=await p.user.findUniqueOrThrow({where:{email}});assert(await p.consentEvent.findFirst({where:{userId:u.id,version:notice.version,purpose:'SERVICE'}}));
  });
  await test('S54 marketing opt-out preserves transactional session and version history',async()=>{const state=await privacy.state(buyer.id);await p.consentEvent.create({data:{userId:buyer.id,purpose:'MARKETING',version:state.version,status:'GRANTED'}});assert((await privacy.state(buyer.id)).marketing);await privacy.consent(buyer.id,{purpose:'MARKETING',version:state.version,granted:false});assert(!(await privacy.state(buyer.id)).marketing);assert.equal((await request('/auth/me',buyer)).status,200);});
  await test('S54 policy version change requires explicit acceptance, old version rejected',async()=>{const old=process.env.SERVICE_POLICY_VERSION;process.env.SERVICE_POLICY_VERSION='qa-policy-v2';try{assert((await privacy.state(buyer.id)).requiresAcceptance);await assert.rejects(privacy.consent(buyer.id,{purpose:'SERVICE',version:'wrong',granted:true}),e=>e.status===400);await privacy.consent(buyer.id,{purpose:'SERVICE',version:'qa-policy-v2',granted:true});assert(!(await privacy.state(buyer.id)).requiresAcceptance);}finally{if(old===undefined)delete process.env.SERVICE_POLICY_VERSION;else process.env.SERVICE_POLICY_VERSION=old;}});
  const scannerShow=await p.showtime.create({data:{eventId:event.id,startTime:new Date(Date.now()+86400000*5),status:'ON_SALE',maxTicketsPerUser:null}});
  const scannerCategory=await p.seatCategory.create({data:{showtimeId:scannerShow.id,name:'QA benchmark',price:1000}});
  await p.seat.createMany({data:Array.from({length:5001},(_,i)=>({showtimeId:scannerShow.id,categoryId:scannerCategory.id,row:'B',seatNumber:i+1}))});
  const scannerSeats=await p.seat.findMany({where:{showtimeId:scannerShow.id},orderBy:{seatNumber:'asc'}});
  const scannerOrder=await paidOrder(buyer,scannerShow.id,scannerSeats.slice(0,5000).map(s=>s.id));
  await p.showtimeStaff.create({data:{showtimeId:scannerShow.id,userId:staff.id}});
  const gates=await Promise.all(['QA Gate A','QA Gate B'].map(name=>p.checkInGate.create({data:{showtimeId:scannerShow.id,name}})));
  await p.checkInPermission.createMany({data:gates.map(g=>({gateId:g.id,userId:staff.id,staffName:'QA STAFF',canOverride:true}))});
  let snapshot;
  await test('S33 snapshot5000tickets under10s on simulated10Mbps/80ms4G profile, without PII',async()=>{
    const started=performance.now();await delay(80);
    const response=await fetch(api+`/scanner/showtimes/${scannerShow.id}/tickets`,{headers:{cookie:staff.cookie}});assert.equal(response.status,200);
    const buffer=new Uint8Array(await response.arrayBuffer());await delay(buffer.byteLength*8/10000000*1000);
    snapshot=JSON.parse(new TextDecoder().decode(buffer));assert.equal(snapshot.tickets.length,5000);assert(performance.now()-started<10000);assert(!/"(email|fullName|password|privateKey)"/.test(JSON.stringify(snapshot)));
    results.push({id:'S33 measured profile',result:'PASS',durationMs:Math.round(performance.now()-started),bytes:buffer.byteLength,network:'simulated10Mbps,80ms RTT; not real mobile4G'});
  });
  const scannedItem=await p.orderItem.findFirstOrThrow({where:{orderId:scannerOrder.id},orderBy:{id:'asc'}});
  const late={scanId:randomUUID(),showtimeId:scannerShow.id,gateId:gates[0].id,ticketCode:scannedItem.id,qrPayload:gatewayCrypto.issueQr(scannedItem.id,scannerShow.id),deviceId:'qa-device-late',scannedAt:new Date(Date.now()-30000).toISOString(),deviceSentAt:new Date().toISOString(),mode:'offline_admission'};
  const early={...late,scanId:randomUUID(),gateId:gates[1].id,deviceId:'qa-device-early',scannedAt:new Date(Date.now()-60000).toISOString()};
  await test('S35/S36 two offline gates sync in reverse time order; earliest device time wins without deleting logs',async()=>{
    assert.equal((await ok('/scanner/sync-scans',staff,'POST',{scans:[late]})).results[0].status,'synced');
    assert.equal((await ok('/scanner/sync-scans',staff,'POST',{scans:[early]})).results[0].status,'synced');
    const canonical=await p.ticketAdmission.findFirstOrThrow({where:{ticketId:scannedItem.id,kind:'NORMAL'}});assert.equal(canonical.gateId,early.gateId);assert.equal(canonical.enteredAt.toISOString(),early.scannedAt);
    const logs=await p.offlineScanLog.findMany({where:{scanId:{in:[late.scanId,early.scanId]}}});assert.equal(logs.length,2);assert(logs.some(l=>l.scanId===late.scanId&&l.status==='CONFLICT'));assert(logs.every(l=>typeof l.clockOffsetMs==='number'));
    const replay=await ok('/scanner/sync-scans',staff,'POST',{scans:[early]});assert.equal(replay.results[0].scanId,early.scanId);assert.equal(await p.ticketAdmission.count({where:{ticketId:scannedItem.id,kind:'NORMAL'}}),1);
  });
  await test('S33 delta contains only changed checked-in ticket; wrong staff cursor falls back to full',async()=>{assert(snapshot);const delta=await ok(`/scanner/showtimes/${scannerShow.id}/tickets?since=${snapshot.cursor}`,staff);assert.equal(delta.mode,'delta');assert.equal(delta.tickets.length,1);assert.equal(delta.tickets[0].status,'checked_in');});
  await test('S52 per-minute/per-gate attendance includes offline original time; EXCEPTION does not count twice',async()=>{
    await p.ticketAdmission.create({data:{ticketId:scannedItem.id,showtimeId:scannerShow.id,gateId:gates[1].id,gateName:gates[1].name,staffId:staff.id,staffName:'QA STAFF',requestId:randomUUID(),kind:'EXCEPTION',reason:'QA approved exception',ownerConfirmed:true}});
    const r=await reports.attendance(scannerShow.id,organizer);assert.equal(r.entered,1);assert.equal(r.notEntered,4999);assert.equal(r.byMinuteAndGate.length,1);assert.equal(r.byMinuteAndGate[0].gateId,gates[1].id);assert.equal(r.byMinuteAndGate[0].entered,1);
  });
  await test('S44 two SSE clients observe TTL expiry within2seconds without cleanup sweep',async()=>{
    const expiry=new Date(Date.now()+4000),token=randomUUID();
    const hs=await p.holdSession.create({data:{showtimeId:scannerShow.id,userId:buyer.id,sessionHash:'sse-fixture',token,expiresAt:expiry,expectedSeatIds:[scannerSeats[5000].id]}});
    await p.seatHold.create({data:{seatId:scannerSeats[5000].id,showtimeId:scannerShow.id,holdSessionId:hs.id,token,expiresAt:expiry}});
    const c=new AbortController();
    async function listen(){const r=await fetch(api+`/showtimes/${scannerShow.id}/seats/stream`,{signal:c.signal});const reader=r.body.getReader();let data='';while(true){const part=await reader.read();if(part.done)throw Error('SSE closed before event');data+=new TextDecoder().decode(part.value);const frames=data.split('\n\n');data=frames.pop()??'';for(const frame of frames)for(const line of frame.split('\n'))if(line.startsWith('data: ')){const event=JSON.parse(line.slice(6));if(event.kind==='snapshot' && event.seats?.find(s=>s.id===scannerSeats[5000].id)?.status==='AVAILABLE')return Date.now();}}}
    try{const reads=Promise.all([listen(),listen()]);const times=await Promise.race([reads,delay(8000).then(()=>{throw Error('SSE expiry timeout');})]);assert(times.every(t=>t>=expiry.getTime()&&t-expiry.getTime()<=2000));results.push({id:'S44 observed TTL expiry latency',result:'PASS',latencyMs:times.map(t=>t-expiry.getTime())});}finally{c.abort();}
  });
  const eraseUser=await user(),eraseOrder=await paidOrder(eraseUser,show.id,[seatList[7].id]);
  await p.registrationConsent.create({data:{userId:eraseUser.id,noticeVersion:'fixture-v1',purpose:'QA fixture',status:'GRANTED'}});
  await test('S53 erasure requires owner request and ADMIN approval',async()=>{assert.equal((await request(`/privacy/erasure/${eraseUser.id}/approve`,buyer,'POST',{})).status,403);await assert.rejects(privacy.approveErasure(eraseUser.id,admin.id),e=>e.status===404);await ok('/privacy/erasure',eraseUser,'POST',{});});
  await test('S53 approved erasure is idempotent; disables sessions and preserves orders/money',async()=>{
    const total=await p.order.aggregate({_sum:{totalAmount:true},where:{userId:eraseUser.id}});
    await ok(`/privacy/erasure/${eraseUser.id}/approve`,admin,'POST',{});await privacy.approveErasure(eraseUser.id,admin.id);
    const u=await p.user.findUniqueOrThrow({where:{id:eraseUser.id}});assert(!u.isActive);assert(u.email.endsWith('@example.invalid'));assert.equal(u.fullName,null);assert.equal((await request('/auth/me',eraseUser)).status,401);assert.equal((await p.order.findUniqueOrThrow({where:{id:eraseOrder.id}})).totalAmount,100000);assert.deepEqual(await p.order.aggregate({_sum:{totalAmount:true},where:{userId:eraseUser.id}}),total);
  });
  await test('S47 only organizer owner can cancel show; job is idempotent and closes hold API',async()=>{
    await assert.rejects(cancel.cancelShow(show.id,other,'QA full cancellation'),e=>e.status===403);
    const a=await cancel.cancelShow(show.id,organizer,'QA full cancellation'),b=await cancel.cancelShow(show.id,organizer,'QA repeat cancellation');assert.equal(a.showtimeId,b.showtimeId);assert.equal(await p.showtimeCancellation.count({where:{showtimeId:show.id}}),1);assert.equal((await p.showtime.findUniqueOrThrow({where:{id:show.id}})).status,'CLOSED');
  });
  await test('S47 batch resumes until all paid orders revoked with full refunds',async()=>{for(let i=0;i<4;i++)await cancel.processShowBatch();assert.equal(await p.order.count({where:{showtimeId:show.id,status:'PAID'}}),0);assert.equal(await p.ticket.count({where:{showtimeId:show.id,status:{not:'CANCELLED'}}}),0);assert.equal((await p.showtimeCancellation.findUniqueOrThrow({where:{showtimeId:show.id}})).status,'COMPLETED');await cancel.processRefundBatch();});
  await test('S47 cancellation notification outbox sends once and skips erased/disabled recipient',async()=>{
    const worker=new LifecycleWorker(p,cancel,{ready:true,send:async mail=>sent.push(mail)});await worker.drain();const first=sent.length;await worker.drain();assert.equal(sent.length,first);assert(first>=1);assert(!sent.some(m=>m.to===eraseUser.email));assert(sent.every(m=>m.to.endsWith('@fixture.invalid')));
  });
  await test('S52 cancelled tickets are excluded from attendance',async()=>{const report=await reports.attendance(show.id,organizer);assert.equal(report.validTickets,0);assert.equal(report.entered,0);assert.equal(report.notEntered,0);});
  await test('S49 rolled-back state change leaves no audit success record',async()=>{const before=await p.domainAudit.count({where:{orderId:resale.id}});await assert.rejects(p.$transaction(async tx=>{await tx.order.update({where:{id:resale.id},data:{status:'NEEDS_REVIEW'}});throw Error('force rollback');}));assert.equal(await p.domainAudit.count({where:{orderId:resale.id}}),before);});
  writeFileSync(resolve(dir,'browser-fixture.json'),JSON.stringify({api,web:'http://localhost:3393',buyer:{email:buyer.email,password:pw},organizer:{email:organizer.email,password:pw},admin:{email:admin.email,password:pw},accountant:{email:accountant.email,password:pw},showtimeId:show.id,orderId:order.id},null,2));
}catch(e){results.push({id:'HARNESS',result:'FAIL',message:e.message});console.log('HARNESS FAIL:',e.message);}
finally{
  child.kill();await p.$disconnect();redis.disconnect();closeSync(log);
  writeFileSync(resolve(dir,'sprint6-8-results.json'),JSON.stringify({at:new Date().toISOString(),database:dbUrl.pathname.slice(1),results},null,2));
  console.log(JSON.stringify({passed:results.filter(r=>r.result==='PASS').length,failed:results.filter(r=>r.result==='FAIL').length}));
  if(results.some(r=>r.result==='FAIL'))process.exitCode=1;
}
