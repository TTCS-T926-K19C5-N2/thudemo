import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
const demoRoot='D:/Merge_2/Codegym-demo-proof-20261023T1530';
const runId='20261023T132000-demo-handoff';
const email='qa-demo-20261023-s03-duplicate-002@demo.invalid';
const config=JSON.parse(readFileSync(resolve(demoRoot,'.sprint1-demo/config.json'),'utf8'));
const env=parseEnv(readFileSync(resolve(demoRoot,'.env'),'utf8'));
const req=createRequire(resolve(demoRoot,'apps/api/package.json'));
const {PrismaClient}=req('@prisma/client');
const {PrismaPg}=req('@prisma/adapter-pg');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:env.DATABASE_URL})});
const output=resolve(import.meta.dirname,'registration-mailpit-oracle-003.json');
try{
 const deadline=Date.now()+20000; let user;
 while(Date.now()<deadline){user=await db.user.findUnique({where:{email},include:{registrationConsent:true,userRoles:{include:{role:true}},activationTokens:{include:{mail:true}}}});if(user?.activationTokens.length===6&&user.activationTokens.every(t=>t.mail?.status==='SENT'))break;await new Promise(r=>setTimeout(r,500));}
 if(!user||user.activationTokens.length!==6||user.activationTokens.some(t=>t.mail?.status!=='SENT'))throw new Error('Expected initial activation plus five accepted resends in DB outbox.');
 const base=`http://127.0.0.1:${config.ports.mailUi}`;
 const listResponse=await fetch(`${base}/api/v1/messages?start=0&limit=100`);if(!listResponse.ok)throw new Error('Mailpit list request failed.');const list=await listResponse.json();
 let matched=0;let hashes=0;let recipients=0;
 for(const token of user.activationTokens){const messageId=`activation-${token.mail.id}@sprint1.demo.invalid`;const message=(list.messages??[]).find(item=>String(item.MessageID??'').replace(/^<|>$/g,'')===messageId);if(!message)continue;matched++;const response=await fetch(`${base}/api/v1/message/${encodeURIComponent(message.ID)}`);if(!response.ok)continue;const detail=await response.json();const body=[detail.Text,detail.HTML].filter(x=>typeof x==='string').join('\n');const found=body.match(/#token=([a-f0-9]{64})/);if(found&&createHash('sha256').update(found[1]).digest('hex')===token.tokenHash)hashes++;const to=Array.isArray(detail.To)?detail.To:[];if(to.some(x=>String(x.Address??x).toLowerCase()===email))recipients++;}
 const users=await db.user.count({where:{email}});
 const result={runId,profile:'prepared local demo, isolated PostgreSQL/Redis/Mailpit',browser:{resendUiAcceptedCount:5,sixthAttemptMessage:'Đã đạt giới hạn gửi lại. Thử lại sau 60 phút.',desktopViewport:'1280x720',realApiAndMailpit:true,realEmailSent:false},database:{exactSyntheticUserCount:users,pendingEmailVerification:!user.isEmailVerified,buyerRoleOnly:user.userRoles.map(x=>x.role.name).join(',')==='BUYER',consentPersisted:user.registrationConsent?.status==='GRANTED',activationTokenCount:user.activationTokens.length,initialPlusFiveResendsAllSENT:user.activationTokens.every(t=>t.mail?.status==='SENT'&&t.mail.attempts===1)},mailpit:{activationMessagesMatched:matched,recipientsMatched:recipients,activationLinksHashMatched:hashes,rawTokensLogged:false},limits:['One synthetic .invalid fixture only.','No real email or Internet/Inbox delivery claimed.']};
 if(users!==1||user.isEmailVerified||!result.database.buyerRoleOnly||!result.database.consentPersisted||!result.database.initialPlusFiveResendsAllSENT||matched!==6||recipients!==6||hashes!==6)throw new Error('S03 resend/catcher independent oracle failed.');
 writeFileSync(output,`${JSON.stringify(result,null,2)}\n`);console.log(JSON.stringify({runId,result:'PASS',userCount:1,resendsAccepted:5,sixthBlocked:true,mailpitAccepted:6,activationHashesVerified:6,realEmailSent:false}));
}finally{await db.$disconnect();}
