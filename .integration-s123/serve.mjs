// Isolated local profile composed from the existing API/web/worker entrypoints.
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,existsSync,openSync,closeSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),privateDir=resolve(root,'.git/integration-s123-demo');
const require=createRequire(resolve(root,'apps/api/package.json'));
const {PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg'),{hash}=require('argon2');
const node=process.execPath,pnpm='C:/Users/Admin/AppData/Local/node/corepack/v1/pnpm/10.15.1/bin/pnpm.cjs';
assert(spawnSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8',windowsHide:true}).stdout.trim()==='integration/candidate-1');
assert(existsSync(resolve(root,'apps/api/dist/main.js'))&&existsSync(resolve(root,'apps/web/.next/BUILD_ID')),'Run pnpm build before serving');
for(const port of [3394,3395])await new Promise((ok,bad)=>{const s=createServer();s.on('error',bad);s.listen(port,'127.0.0.1',()=>s.close(ok));});
mkdirSync(privateDir,{recursive:true});
const statePath=resolve(privateDir,'runtime.json');let state;
if(existsSync(statePath))state=JSON.parse(readFileSync(statePath,'utf8'));
else{
 const pair=generateKeyPairSync('ed25519');
 state={privateKey:pair.privateKey.export({type:'pkcs8',format:'pem'}).toString(),publicKey:pair.publicKey.export({type:'spki',format:'pem'}).toString(),proxy:randomBytes(32).toString('hex'),mail:randomBytes(32).toString('base64url'),password:randomBytes(24).toString('base64url')};
 writeFileSync(statePath,JSON.stringify(state),{flag:'wx'});
}
const database='integration_s123_demo',url=`postgresql://audit_fixture:audit_fixture_only@127.0.0.1:15446/${database}`;
function docker(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8',windowsHide:true});assert.equal(r.status,0,'Owned integration Docker command failed');return r.stdout.trim();}
for(const name of ['thudemo-integration-c1-pg','thudemo-integration-c1-redis'])docker(['start',name]);
const exists=docker(['exec','thudemo-integration-c1-pg','psql','-X','-U','audit_fixture','-d','postgres','-At','-c',`SELECT 1 FROM pg_database WHERE datname='${database}'`]);
if(!exists)docker(['exec','thudemo-integration-c1-pg','createdb','-U','audit_fixture',database]);
const keyring=JSON.stringify({'integration-demo':state.publicKey});
const env={...process.env,CONFIG_IGNORE_ENV_FILE:'true',NODE_ENV:'test',APP_ENV:'integration-local',DATABASE_URL:url,REDIS_URL:'redis://127.0.0.1:16382/7',
 PAYMENT_GATEWAY:'mock',PAYMENT_WEBHOOK_SECRET:'mock_webhook_secret_dev',MOMO_ACCESS_KEY:'MOCK_ACCESS_KEY',MOMO_SECRET_KEY:'mock_webhook_secret_dev',
 AUTH_PROXY_SECRET:state.proxy,REGISTRATION_MAIL_KEY:state.mail,REGISTRATION_PUBLIC_ORIGIN:'http://localhost:3394',REGISTRATION_MAIL_MODE:'off',REGISTRATION_DELIVERY_MODE:'off',TICKET_MAIL_WORKER:'false',LIFECYCLE_WORKER:'off',MONITORING_ENABLED:'false',
 SCANNER_KEY_ID:'integration-demo',SCANNER_SIGNING_PRIVATE_KEY_FILE:'',SCANNER_PUBLIC_KEY:'',SCANNER_SIGNING_PRIVATE_KEY:state.privateKey,SCANNER_PUBLIC_KEYS:keyring,
 TICKET_SIGNING_ACTIVE_KEY_ID:'integration-demo',TICKET_SIGNING_PRIVATE_KEY:state.privateKey,TICKET_SIGNING_PUBLIC_KEYS:keyring,API_INTERNAL_URL:'http://127.0.0.1:3395',API_ORIGIN:'http://localhost:3395',WEB_ORIGIN:'http://localhost:3394',HOLD_EXPIRY_MODE:'off',ORDER_EXPIRY_MODE:'off',NEXT_TELEMETRY_DISABLED:'1'};
// This fixture profile never imports developer connection/signing configuration.
for(const k of Object.keys(env))if(k.startsWith('BOOKING_'))delete env[k];
const migration=spawnSync(node,[pnpm,'--filter','api','exec','prisma','migrate','deploy'],{cwd:root,env,encoding:'utf8',windowsHide:true});
assert.equal(migration.status,0,'Migration failed; no existing DB was reset');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url})});
try{
 for(const name of ['ADMIN','ORGANIZER','BUYER','STAFF','ACCOUNTANT'])await db.role.upsert({where:{name},create:{name},update:{}});
 for(const role of ['ORGANIZER','BUYER']){
  const email=role.toLowerCase()+'@integration.invalid';
  await db.user.upsert({where:{email},update:{},create:{email,password:await hash(state.password),isEmailVerified:true,userRoles:{create:{role:{connect:{name:role}}}}}});
 }
}finally{await db.$disconnect();}
const children=[],fds=[];
function start(args,cwd,name,extra={}){
 const fd=openSync(resolve(privateDir,name+'.log'),'a');fds.push(fd);
 const p=spawn(node,args,{cwd,env:{...env,...extra},stdio:['ignore',fd,fd],windowsHide:true});children.push(p);return p;
}
async function http(url){for(let i=0;i<150;i++){try{const r=await fetch(url,{signal:AbortSignal.timeout(1000)});if(r.ok)return r.status;}catch{}await new Promise(r=>setTimeout(r,200));}throw Error('Service readiness failed');}
try{
 start(['dist/main.js'],resolve(root,'apps/api'),'api',{PORT:'3395'});
 start(['server.mjs'],resolve(root,'apps/web'),'web',{PORT:'3394',WEB_PORT:'3394',NODE_ENV:'production'});
 start(['dist/hold-expiry-worker.js'],resolve(root,'apps/api'),'expiry');
 const health=await http('http://127.0.0.1:3395/health'),home=await http('http://localhost:3394/');
 console.log(JSON.stringify({health,home,web:'http://localhost:3394',api:'http://localhost:3395',fixtureCredentialsFile:statePath,registrationDelivery:'off; registration mail AC covered by isolated E2E transport'}));
 if(!process.argv.includes('--smoke'))await new Promise(ok=>{process.once('SIGINT',ok);process.once('SIGTERM',ok);});
}finally{
 for(const p of children){if(p.exitCode===null){await new Promise(ok=>{p.once('exit',ok);p.kill();});}}
 for(const fd of fds)closeSync(fd);
}
