import 'reflect-metadata';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdirSync,openSync,closeSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {PrismaClient} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {ConfigService} from '@nestjs/config';
import assert from 'node:assert/strict';
import {main} from './sprint-backup.mjs';
import {ScannerCryptoService} from '../dist/scanner/scanner-crypto.service.js';
const target=`codegym_restore_qa_${Date.now()}`,dir=resolve(import.meta.dirname,'../../../.cache/sprint4-8-evidence/20261022');
process.env.BACKUP_ENCRYPTION_KEY=randomBytes(32).toString('base64url');
process.env.BACKUP_TARGET=resolve(dir,`encrypted-drill-${Date.now()}`);mkdirSync(process.env.BACKUP_TARGET,{recursive:true});
main(['backup','--local-drill']);
const file=resolve(process.env.BACKUP_TARGET,`codegym-${new Date().toISOString().slice(0,10)}.dump.enc`);
main(['restore-drill',file,target]);
const db=new URL(process.env.DATABASE_URL);db.pathname='/'+target;
const p=new PrismaClient({adapter:new PrismaPg({connectionString:db.href})});
const log=openSync(resolve(dir,'restored-api.log'),'w');
const child=spawn(process.execPath,['dist/main.js'],{cwd:resolve(import.meta.dirname,'..'),env:{...process.env,DATABASE_URL:db.href,PORT:'3398',LIFECYCLE_WORKER:'off',REGISTRATION_DELIVERY_MODE:'off',TICKET_MAIL_WORKER:'false',MONITORING_ENABLED:'false'},stdio:['ignore',log,log],windowsHide:true});
const results=[];
try{
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:3398/health')).ok){ready=true;break;}}catch{}await delay(200);}assert(ready);
 results.push({id:'S55 restored API health',result:'PASS'});
 assert.equal(await p.event.count(),40);assert.equal(await p.showtime.count(),40);assert.equal(await p.seat.count(),5544);
 results.push({id:'S55 restored40events40showtimes5544seats',result:'PASS'});
 const order=await p.order.findFirst({where:{status:'PAID'},include:{items:true}});assert(order?.items.length,'A real historical PAID order is required for restore evidence');
 const crypto=new ScannerCryptoService(new ConfigService(process.env));
 const payload=crypto.issueQr(order.items[0].id,order.showtimeId);assert.equal(crypto.verifyQr(payload).ticketId,order.items[0].id);
 results.push({id:'S55 historical order and retained QR signing keys work after restore',result:'PASS'});
 const catalog=await fetch('http://127.0.0.1:3398/showtimes');assert.equal(catalog.status,200);assert(Array.isArray((await catalog.json()).items));
 results.push({id:'S55 public showtimes respond from restored API',result:'PASS'});
}finally{
 child.kill();await p.$disconnect();closeSync(log);
 writeFileSync(resolve(dir,'backup-drill-results.json'),JSON.stringify({at:new Date().toISOString(),database:target,offhost:false,keyRetained:false,note:'Ephemeral encryption key used only for this successful restore drill. Permanent recovery backup is before-sprint-implementation.dump; configure and retain a separate protected key for scheduled off-host backups.',results},null,2));
 console.log(JSON.stringify({passed:results.length,offhost:false,target}));
}
