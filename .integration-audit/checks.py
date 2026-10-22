import os,sys,json,pathlib,subprocess,time,re
ROOT=pathlib.Path(__file__).resolve().parents[1]; OUT=ROOT/'.integration-audit'; OUT.mkdir(exist_ok=True)
NODE=r'C:\Program Files\nodejs\node.exe'; PNPM=r'C:\Users\Admin\AppData\Local\node\corepack\v1\pnpm\10.15.1\bin\pnpm.cjs'
env=dict(os.environ);env.update({'CONFIG_IGNORE_ENV_FILE':'true','APP_ENV':'integration-audit','DATABASE_URL':'postgresql://audit_fixture:audit_fixture_only@127.0.0.1:15446/sprint2_integration','REDIS_URL':'redis://127.0.0.1:16382/15','REDIS_HOST':'127.0.0.1','REDIS_PORT':'16382','SPRINT1_ISOLATED_TEST':'true','PAYMENT_GATEWAY':'mock','PAYMENT_WEBHOOK_SECRET':'mock_webhook_secret_dev','MOMO_ACCESS_KEY':'MOCK_ACCESS_KEY','MOMO_SECRET_KEY':'mock_webhook_secret_dev','HOLD_EXPIRY_MODE':'off','LIFECYCLE_WORKER':'off','TICKET_MAIL_WORKER':'false','REGISTRATION_DELIVERY_MODE':'off','REGISTRATION_MAIL_MODE':'off','MONITORING_ENABLED':'false','WAITING_ROOM_CAPACITY':'0','BOOKING_HOLD_ACCOUNT_LIMIT':'10000','BOOKING_HOLD_IP_LIMIT':'100000','BOOKING_ORDER_ACCOUNT_LIMIT':'10000','BOOKING_ORDER_IP_LIMIT':'100000','API_ORIGIN':'http://127.0.0.1:59991','WEB_ORIGIN':'http://127.0.0.1:59992','NEXT_TELEMETRY_DISABLED':'1','CI':'true','NO_COLOR':'1'})
bindir=OUT/'bin';bindir.mkdir(exist_ok=True)
(bindir/'pnpm.cmd').write_text('@echo off\r\n"'+NODE+'" "'+PNPM+'" %*\r\n',encoding='utf-8')
env['PATH']=str(bindir)+os.pathsep+env['PATH']
def scrub(s):
 s=re.sub(r'\x1b\[[0-9;]*[mKGFH]', '',s)
 s=re.sub(r'(?:postgres(?:ql)?|redis|rediss)://[^\s\x1b\"\'<>]+','[REDACTED_CONNECTION]',s)
 s=re.sub(r'-----BEGIN [^-]*PRIVATE KEY-----.*?-----END [^-]*PRIVATE KEY-----','[REDACTED_PRIVATE_KEY]',s,flags=re.S)
 for k,v in env.items():
  if re.search(r'SECRET|PASSWORD|PRIVATE_KEY|ACCESS_KEY|AUTH.*TOKEN',k) and len(v)>7: s=s.replace(v,'[REDACTED_FIXTURE]')
 return s
def run(name,args,cwd=ROOT,timeout=900,extra=None):
 start=time.time();p=subprocess.run(args,cwd=cwd,env={**env,**(extra or {})},text=True,encoding='utf-8',errors='replace',capture_output=True,timeout=timeout)
 log=scrub(p.stdout+'\n'+p.stderr);(OUT/(name+'.log')).write_text(log,encoding='utf-8')
 result={'name':name,'command':args,'cwd':str(cwd),'exit_code':p.returncode,'seconds':round(time.time()-start,2),'log':name+'.log','tail':log.splitlines()[-16:]}
 results=[]
 if (OUT/'checks.json').exists(): results=json.loads((OUT/'checks.json').read_text(encoding='utf-8'))
 results.append(result);(OUT/'checks.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(result,ensure_ascii=False),flush=True);return result
if __name__=='__main__':
 mode=sys.argv[1]
 if mode=='baseline':
  run('toolchain',[NODE,PNPM,'--version'])
  run('prisma-generate',[NODE,PNPM,'--filter','api','exec','prisma','generate'])
  for check in ['build','lint','typecheck','test']: run(check,[NODE,PNPM,check])
 elif mode=='e2e':
  run('migrate-deploy',[NODE,PNPM,'--filter','api','exec','prisma','migrate','deploy'])
  run('e2e',[NODE,PNPM,'--filter','api','run','test:e2e','--maxWorkers=1'])
 elif mode=='recheck':
  run('qr-targeted-recheck',[NODE,PNPM,'--filter','web','exec','vitest','run','--config','vitest.config.ts','src/features/tickets/ticket-qr.spec.ts'])
  run('test-recheck',[NODE,PNPM,'test'])
  run('backup-unit',[NODE,'--test','apps/api/scripts/sprint-backup.spec.mjs'])
 elif mode=='e2e-recheck':
  run('e2e-recheck',[NODE,PNPM,'--filter','api','run','test:e2e','--maxWorkers=1'],extra={'WEB_ORIGIN':'http://localhost:3000','S32_ISOLATED_TEST':'true'})
 elif mode=='bounded-tests':
  run('api-unit-bounded',[NODE,PNPM,'--filter','api','run','test','--maxWorkers=1'])
  run('web-unit-bounded',[NODE,PNPM,'--filter','web','run','test','--maxWorkers=1'])
  run('deployment-unit',[NODE,'--test','deploy/laptop-gateway.spec.mjs','deploy/laptop-release.spec.mjs','deploy/laptop-compat.spec.mjs','deploy/next-root-dirs.spec.mjs','deploy/laptop-watcher.spec.mjs','deploy/laptop-resources.spec.mjs','deploy/ticket-mail.spec.mjs'])
 elif mode=='runtime':
  extra={'DATABASE_URL':'postgresql://audit_fixture:audit_fixture_only@127.0.0.1:15446/codegym_sprint_202610221224'}
  run('runtime-migrate',[NODE,PNPM,'--filter','api','exec','prisma','migrate','deploy'],extra=extra)
  run('runtime-sprint68',[NODE,str(OUT/'run-runtime.mjs')],extra=extra)
 elif mode=='sse-probe':
  run('sse-probe',[NODE,str(OUT/'run-runtime.mjs'),'--probe-sse'],extra={'DATABASE_URL':'postgresql://audit_fixture:audit_fixture_only@127.0.0.1:15446/codegym_sprint_202610221224'})
 elif mode=='backup-unit': run('backup-unit',[NODE,'--test','apps/api/scripts/sprint-backup.spec.mjs'])
 elif mode=='prisma-validate':run('prisma-validate',[NODE,PNPM,'--filter','api','exec','prisma','validate'])
