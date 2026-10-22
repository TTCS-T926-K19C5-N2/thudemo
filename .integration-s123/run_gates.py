import pathlib,importlib.util,sys,json,subprocess,hashlib,os
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('checks',ROOT/'.integration-audit/checks.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
label=sys.argv[1];cache=int(sys.argv[2]);assert label.replace('-','').isalnum() and 0<=cache<16
c.OUT=ROOT/'.integration-s123'/label;c.OUT.mkdir(exist_ok=False)
c.env.update(REDIS_URL=f'redis://127.0.0.1:16382/{cache}',REDIS_PORT='16382',WEB_ORIGIN='http://localhost:3000',S32_ISOLATED_TEST='true')
if '--fresh-store' in sys.argv:
    c.env['DATABASE_URL']=c.env['DATABASE_URL'].replace(':15446/',':15432/')
for key in list(c.env):
    if key.startswith('BOOKING_'):c.env.pop(key)
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT,text=True,encoding='utf-8').strip()
artifact='evidence/sprint2/20261004-local/integration-performance.json'
assert not git('diff','HEAD','--',artifact), 'Preserve pre-existing evidence changes'
paths=git('ls-files','--cached','--others','--exclude-standard','--','apps/api/src','apps/api/test','apps/api/prisma','apps/web/src','packages').splitlines()
manifest={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in sorted(set(paths)) if (ROOT/p).is_file()}
(c.OUT/'input-files.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
receipt={'group':label,'start_head':git('rev-parse','HEAD'),'branch':git('branch','--show-current'),'redis_test_db':cache,'input_manifest_sha256':hashlib.sha256((c.OUT/'input-files.json').read_bytes()).hexdigest()}
assert receipt['branch']=='integration/candidate-1'
(c.OUT/'receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
try:
    commands=[('migrate',[c.NODE,c.PNPM,'--filter','api','exec','prisma','migrate','deploy'])]
    commands += [(name,[c.NODE,c.PNPM,name]) for name in ['build','lint','typecheck','test']]
    commands += [('e2e',[c.NODE,c.PNPM,'--filter','api','run','test:e2e'])]
    for name,cmd in commands:
        result=c.run(name,cmd)
        if result['exit_code']!=0:raise SystemExit(name+' failed; preserve log and stop this group')
finally:
    if git('diff','HEAD','--',artifact):
        (c.OUT/'integration-performance.json').write_bytes((ROOT/artifact).read_bytes())
        subprocess.run(['git','restore','--',artifact],cwd=ROOT,check=True)
print(json.dumps({'group':label,'gates':'build/lint/typecheck/test/E2E PASS','start_head':receipt['start_head']}))
