import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function encryptionKey(value) {
  const key=Buffer.from(value ?? '', 'base64url');
  if(key.length!==32 || key.toString('base64url')!==value)throw Error('BACKUP_ENCRYPTION_KEY must be a canonical 32-byte base64url secret.');
  return key;
}
export function encryptDump(dump,key){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from('CODEGYM-BACKUP-v1'));
  const data=Buffer.concat([cipher.update(dump),cipher.final()]);
  return Buffer.concat([Buffer.from('CGDB1'),iv,cipher.getAuthTag(),data]);
}
export function decryptDump(data,key){
  if(data.subarray(0,5).toString()!=='CGDB1')throw Error('Invalid encrypted backup format.');
  const decipher=createDecipheriv('aes-256-gcm',key,data.subarray(5,17));
  decipher.setAAD(Buffer.from('CODEGYM-BACKUP-v1'));decipher.setAuthTag(data.subarray(17,33));
  return Buffer.concat([decipher.update(data.subarray(33)),decipher.final()]);
}
export function expiredNames(names,now=new Date()){
  const today=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
  return names.filter(name=>/^codegym-\d{4}-\d{2}-\d{2}\.dump\.enc$/.test(name) && Date.parse(name.slice(8,18))<today-13*86400000);
}
function docker(args,input){
  const r=spawnSync('docker',['exec',...(input?['-i']:[]),process.env.POSTGRES_CONTAINER ?? 'thudemo-postgres-1',...args],{input,windowsHide:true,maxBuffer:256*1024*1024});
  if(r.status!==0)throw Error(`Backup operation failed at ${args[0]}; inspect container access without logging credentials.`);
  return r.stdout;
}
export function main(args=process.argv.slice(2)){
  const mode=args[0], key=encryptionKey(process.env.BACKUP_ENCRYPTION_KEY);
  const db=new URL(process.env.DATABASE_URL);
  if(!['127.0.0.1','localhost'].includes(db.hostname))throw Error('This runbook supports the local Docker database only.');
  const user=decodeURIComponent(db.username);
  if(mode==='backup'){
    const configured=process.env.BACKUP_TARGET;
    if(!configured || !isAbsolute(configured))throw Error('Set an absolute BACKUP_TARGET.');
    const offhost=/^\\\\[^\\]+\\[^\\]+/.test(configured) && !/^\\\\(localhost|127\.0\.0\.1)\\/i.test(configured);
    if(!offhost && !args.includes('--local-drill'))throw Error('Daily backup requires an off-host UNC target. Local storage is permitted only with --local-drill.');
    const folder=resolve(configured);mkdirSync(folder,{recursive:true});
    const name=`codegym-${new Date().toISOString().slice(0,10)}.dump.enc`,file=resolve(folder,name);
    if(readdirSync(folder).includes(name))throw Error('A backup for today already exists; verify it instead of silently replacing it.');
    const encrypted=encryptDump(docker(['pg_dump','-U',user,'-d',db.pathname.slice(1),'-Fc']),key);
    writeFileSync(file+'.part',encrypted,{flag:'wx'});renameSync(file+'.part',file);
    writeFileSync(file+'.json',JSON.stringify({version:1,sha256:createHash('sha256').update(encrypted).digest('hex'),createdAt:new Date().toISOString(),offhost},null,2));
    for(const old of expiredNames(readdirSync(folder))){
      const target=resolve(folder,old);
      if(!target.startsWith(folder+sep))throw Error('Unsafe retention path.');
      unlinkSync(target);
      if(readdirSync(folder).includes(old+'.json'))unlinkSync(target+'.json');
    }
    console.log(JSON.stringify({status:'BACKUP_OK',offhost,file,retentionDays:14}));
  }else if(mode==='restore-drill'){
    const file=args[1],target=args[2];
    if(!file || !/^codegym_restore_[a-z0-9_]{1,40}$/.test(target ?? '') || target===db.pathname.slice(1))throw Error('Restore target must be a NEW codegym_restore_* database; never the source database.');
    const encrypted=readFileSync(file),manifest=JSON.parse(readFileSync(file+'.json','utf8'));
    if(createHash('sha256').update(encrypted).digest('hex')!==manifest.sha256)throw Error('Backup checksum mismatch.');
    const dump=decryptDump(encrypted,key);
    docker(['createdb','-U','postgres','-O',user,target]);
    docker(['pg_restore','-U',user,'-d',target,'--no-owner','--no-privileges','--exit-on-error'],dump);
    const counts=docker(['psql','-U',user,'-d',target,'-Atc','SELECT count(*) FROM events; SELECT count(*) FROM showtimes; SELECT count(*) FROM seats;']).toString().trim().split(/\r?\n/).map(Number);
    console.log(JSON.stringify({status:'RESTORE_OK',target,events:counts[0],showtimes:counts[1],seats:counts[2],next:'Start an isolated API against this DB and run health/order/QR smoke. Source DB unchanged.'}));
  }else throw Error('Use backup [--local-drill] or restore-drill <file> <NEW codegym_restore_* database>.');
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{main();}catch(e){console.error(e.message);process.exitCode=1;}}
