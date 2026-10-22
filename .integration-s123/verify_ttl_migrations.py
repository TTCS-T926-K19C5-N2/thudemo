import pathlib,importlib.util,sys,json,time,hashlib
root=pathlib.Path(__file__).resolve().parents[1];sys.argv=['run.py','noop']
spec=importlib.util.spec_from_file_location('b1_tools',root/'.integration-b1a/run.py');p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
folder=root/'.integration-s123/g3-migration-load';folder.mkdir(exist_ok=False);p.c.OUT=folder
stamp=time.strftime('%Y%m%d%H%M%S');fresh='s123_empty_'+stamp;upgrade='s123_v4_'+stamp
for db in [fresh,upgrade]:p.sql('postgres','CREATE DATABASE '+db)
p.run('fresh47',fresh);p.run('historical35',upgrade,True)
before=p.state(upgrade);assert before['applied']==35
p.sql(upgrade,(root/'.integration-b1a/fixture.sql').read_text());old=p.fingerprint(upgrade)
p.run('upgrade47',upgrade);new=p.fingerprint(upgrade)
assert old==new and p.state(fresh)['applied']==p.state(upgrade)['applied']==47
p.run('load47','sang_holds_local')
receipt={'fresh':fresh,'upgrade':upgrade,'fresh_applied':47,'upgrade_from':35,'upgrade_to':47,'fixture_before':old,'fixture_after':new,'no_failed_migrations':p.state(fresh)['failed']==p.state(upgrade)['failed']==0}
(folder/'migration-summary.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
# This is the only load rerun in Sprint1-3: S10 directly changed the hold routine.
p.c.env['HOLDS_EVIDENCE_DIR']=str(folder/'load')
p.c.run('holds-load',[p.c.NODE,str(root/'.integration-b1a/load.mjs')],timeout=300)
raw=folder/'load/http-concurrency.json';r=json.loads(raw.read_text())
assert r.get('finish') and len(r['checks'])==42 and len(r['rounds'])==10
assert all(x['success']==x['conflict']==x['activeRights']==x['uniqueSeats']==100 and x['errors']==0 for x in r['rounds'])
receipt.update(correctness_10_rounds=True,checks=42,p95_ms=r['total']['p95'],first_round_p95_ms=r['rounds'][0]['all']['p95'],nfr_pass=r['nfrPass'],raw_sha256=hashlib.sha256(raw.read_bytes()).hexdigest(),performance_optimization_attempted=False)
(folder/'summary.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8');print(json.dumps(receipt))
