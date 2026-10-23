import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const db = new URL(process.env.DATABASE_URL);
if (!['localhost','127.0.0.1'].includes(db.hostname)) throw Error('Local database required');
const name = `codegym_sprint_${Date.now()}`;
const user = decodeURIComponent(db.username);
function docker(args, input) {
  const result = spawnSync('docker', ['exec', ...(input ? ['-i'] : []), 'thudemo-postgres-1', ...args], { input, maxBuffer: 100*1024*1024, windowsHide: true });
  if (result.status) throw Error(`Database preparation failed at ${args[0]}`);
  return result.stdout;
}
docker(['createdb','-U','postgres','-O',user,name]);
docker(['pg_restore','-U',user,'-d',name,'--no-owner','--no-privileges','--exit-on-error'], readFileSync(resolve(import.meta.dirname,'../../../.cache/sprint4-8-evidence/20261022/before-sprint-implementation.dump')));
db.pathname = '/'+name;
const result = spawnSync('pnpm exec prisma migrate deploy', { shell:true, windowsHide:true, cwd:resolve(import.meta.dirname,'..'), env:{...process.env,DATABASE_URL:db.toString()}, encoding:'utf8' });
writeFileSync(resolve(import.meta.dirname,'../../../.cache/sprint4-8-evidence/20261022/migration-test.log'),result.stdout+result.stderr);
if(result.status) throw Error('Test migration failed; inspect migration-test.log');
writeFileSync(resolve(import.meta.dirname,'../../../.cache/sprint4-8-evidence/20261022/test-database.env'),`DATABASE_URL=${db.toString()}\nREGISTRATION_DELIVERY_MODE=off\nTICKET_MAIL_WORKER=false\n`);
console.log(`Backup restored and additive migrations applied to isolated database ${name}. Original database unchanged.`);
