import os, sys, json, pathlib, subprocess, hashlib, time, importlib.util, re
ROOT=pathlib.Path(__file__).resolve().parents[1]; OUT=ROOT/'.integration-b1a'
OUT.mkdir(exist_ok=True)
spec=importlib.util.spec_from_file_location('checks',ROOT/'.integration-audit/checks.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c);c.OUT=OUT
PG='thudemo-integration-b1a-pg'; USER='b1a_fixture'
c.env.update(DATABASE_URL='postgresql://b1a_fixture:b1a_fixture_only@127.0.0.1:15434/sang_holds_local',REDIS_URL='redis://127.0.0.1:16382',CI='')
for key in list(c.env):
    if key.startswith('BOOKING_') or key in ['GITHUB_ACTIONS','HOLDS_DOCKER','HOLDS_PROFILE']:
        c.env.pop(key,None)
def sql(db,query):
    r=subprocess.run(['docker','exec','-i',PG,'psql','-X','-v','ON_ERROR_STOP=1','-U',USER,'-d',db,'-At'],input=query,text=True,capture_output=True,encoding='utf-8')
    if r.returncode: raise RuntimeError(c.scrub(r.stderr))
    return r.stdout.strip()
def run(name,db,history=False):
    args=[c.NODE,c.PNPM,'--filter','api','exec','prisma','migrate','deploy']
    if history:args+=['--config','.integration-v4.config.ts']
    r=c.run(name,args,extra={'DATABASE_URL':f'postgresql://b1a_fixture:b1a_fixture_only@127.0.0.1:15434/{db}'})
    assert r['exit_code']==0,name
def state(db):
    return json.loads(sql(db,"""SELECT json_build_object('applied',(SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),'failed',(SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL),'routines',(SELECT json_agg(json_build_object('name',proname,'result',pg_get_function_result(oid),'definition_md5',md5(pg_get_functiondef(oid))) ORDER BY proname) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname ~ '^claim_hold_v[0-9]+$'))"""))
def fingerprint(db):
    # Exact old columns only; additions are permitted, existing fixture values are not.
    return sql(db,"""SELECT md5(string_agg(data,E'\n' ORDER BY data)) FROM (
      SELECT 'users:'||row_to_json(t)::text data FROM users t
      UNION ALL SELECT 'events:'||row_to_json(t)::text FROM events t
      UNION ALL SELECT 'showtimes:'||(to_jsonb(t)-'isDemo')::text FROM showtimes t
      UNION ALL SELECT 'seats:'||row_to_json(t)::text FROM seats t
      UNION ALL SELECT 'categories:'||row_to_json(t)::text FROM seat_categories t
      UNION ALL SELECT 'sessions:'||row_to_json(t)::text FROM hold_sessions t
      UNION ALL SELECT 'holds:'||row_to_json(t)::text FROM seat_holds t
      UNION ALL SELECT 'orders:'||row_to_json(t)::text FROM orders t
      UNION ALL SELECT 'items:'||row_to_json(t)::text FROM order_items t
    ) fixture""")
mode=sys.argv[1]
if mode=='migrations':
    stamp=time.strftime('%Y%m%d%H%M%S')
    c.OUT=OUT/('migration-'+stamp);c.OUT.mkdir(exist_ok=False)
    sha='34deec00c18ac987a7db56e9d1c61abac2222bca'
    history=OUT/'history-v4';history.mkdir(exist_ok=True)
    names=subprocess.check_output(['git','ls-tree','-r','--name-only',sha,'apps/api/prisma/migrations'],cwd=ROOT,text=True).splitlines()
    hashes=[]
    for name in names:
        content=subprocess.check_output(['git','show',f'{sha}:{name}'],cwd=ROOT)
        dest=history/pathlib.Path(name).relative_to('apps/api/prisma');dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(content)
        current=(ROOT/name).read_bytes()
        assert current.replace(b'\r\n',b'\n')==content.replace(b'\r\n',b'\n'),name
        hashes.append({'path':name,'historical_sha256':hashlib.sha256(content).hexdigest(),'candidate_sha256':hashlib.sha256(current).hexdigest(),'same_lf':True})
    cfg="import {defineConfig,env} from 'prisma/config';\nexport default defineConfig({schema:'prisma/schema.prisma',migrations:{path:"+json.dumps(str(history/'migrations'))+"},datasource:{url:env('DATABASE_URL')}});\n"
    (ROOT/'apps/api/.integration-v4.config.ts').write_text(cfg,encoding='utf-8')
    fresh='b1a_empty_'+stamp;upgrade='b1a_v4_'+stamp
    for db in [fresh,upgrade]:sql('postgres',f'CREATE DATABASE {db}')
    result={'historical_sha':sha,'historical_file_checks':hashes,'fresh_database':fresh,'upgrade_database':upgrade,'logs_directory':str(c.OUT.relative_to(ROOT))}
    run('empty-candidate-deploy',fresh);result['empty_after']=state(fresh)
    run('historical-v4-deploy',upgrade,True);result['v4_before']=state(upgrade)
    assert result['v4_before']['applied']==35
    assert [x['name'] for x in result['v4_before']['routines']]==['claim_hold_v1','claim_hold_v2','claim_hold_v3','claim_hold_v4']
    sql(upgrade,(OUT/'fixture.sql').read_text())
    result['fixture_before']=fingerprint(upgrade)
    run('v4-to-candidate-deploy',upgrade);result['v4_after']=state(upgrade)
    result['fixture_after']=fingerprint(upgrade);assert result['fixture_before']==result['fixture_after']
    # Recover same account using a different login locator; preserve v4 token/deadline.
    result['v6_recovery']=json.loads(sql(upgrade,"""SELECT row_to_json(t) FROM claim_hold_v6('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','new-login',ARRAY['10000000-0000-4000-8000-000000000005']::uuid[],gen_random_uuid(),gen_random_uuid()) t"""))
    assert result['v6_recovery']['failure'] is None
    assert result['v6_recovery']['id']=='10000000-0000-4000-8000-000000000006'
    result['recovery_preserved']=sql(upgrade,"""SELECT (hs.token='10000000-0000-4000-8000-000000000007' AND hs."expiresAt"=o."paymentExpiresAt") FROM hold_sessions hs JOIN orders o ON o."holdSessionId"=hs.id WHERE hs.id='10000000-0000-4000-8000-000000000006'""")=='t'
    assert result['recovery_preserved']
    run('empty-redeploy-idempotent',fresh);run('upgrade-redeploy-idempotent',upgrade)
    run('load-candidate-deploy','sang_holds_local')
    (OUT/('migration-results-'+stamp+'.json')).write_text(json.dumps(result,indent=2),encoding='utf-8')
    (OUT/'migration-results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k!='historical_file_checks'},indent=2))
elif mode=='load':
    label=sys.argv[2]
    assert re.fullmatch(r'[A-Za-z0-9_-]+',label), 'A simple evidence directory name is required'
    c.env['HOLDS_EVIDENCE_DIR']=str(OUT/label)
    assert not (OUT/label).exists(), 'Use a new evidence label; preserve earlier raw samples'
    if len(sys.argv)>3 and sys.argv[3]=='profile':c.env['HOLDS_PROFILE']='1'
    c.run(label,[c.NODE,str(OUT/'load.mjs')],timeout=300)
elif mode=='gates':
    for name in ['build','lint','typecheck','test']:c.run(name,[c.NODE,c.PNPM,name])
elif mode=='apply':
    sql('postgres','ALTER DATABASE sang_holds_local RESET track_functions')
    run(sys.argv[2]+'-deploy','sang_holds_local')
elif mode in ['e2e','e2e-clean-cache']:
    extra={'DATABASE_URL':'postgresql://audit_fixture:audit_fixture_only@127.0.0.1:15446/sprint2_integration','WEB_ORIGIN':'http://localhost:3000','S32_ISOLATED_TEST':'true'}
    if mode=='e2e-clean-cache':extra['REDIS_URL']='redis://127.0.0.1:16382/14'
    c.run(mode+'-migrate',[c.NODE,c.PNPM,'--filter','api','exec','prisma','migrate','deploy'],extra=extra)
    c.run(mode,[c.NODE,c.PNPM,'--filter','api','run','test:e2e'],extra=extra)
