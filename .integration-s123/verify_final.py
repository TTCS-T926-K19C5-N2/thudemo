import pathlib,subprocess,json,hashlib,os,re
root=pathlib.Path(__file__).resolve().parents[1];out=root/'.integration-s123';os.environ['GIT_OPTIONAL_LOCKS']='0'
def git(p,*a):return subprocess.check_output(['git','-c','core.quotePath=false','-C',str(p),*a],text=True,encoding='utf-8').strip()
inv=json.loads((root/'.integration-audit/inventory.json').read_text(encoding='utf-8'));analysis=json.loads((root/'.integration-audit/analysis.json').read_text(encoding='utf-8'))
sources=[{'source':r['name'],'head_same':git(r['path'],'rev-parse','HEAD')==r['head'],'status_same':git(r['path'],'status','--porcelain=v1','--untracked-files=all')==r['status']} for r in inv['repos']]
checked=set()
for row in analysis['matrix']:
    base=pathlib.Path(next(r['path'] for r in inv['repos'] if r['name']==row['source']))
    for f in row['implementation']:
        p=base/f['path']
        if p not in checked:assert hashlib.sha256(p.read_bytes()).hexdigest()==f['sha256'],str(p)
        checked.add(p)
oldsql=0
for name in git(root,'ls-tree','-r','--name-only','b66aa28','apps/api/prisma/migrations').splitlines():
    old=subprocess.check_output(['git','show','b66aa28:'+name],cwd=root)
    assert old.replace(b'\r\n',b'\n')==(root/name).read_bytes().replace(b'\r\n',b'\n'),name
    oldsql+=name.endswith('/migration.sql')
req=json.loads((root/'.integration-audit/requirements.json').read_text(encoding='utf-8'));book=pathlib.Path(req['file'])
assert hashlib.sha256(book.read_bytes()).hexdigest()==req['sha256'] and hashlib.sha256((book.parent/'approved-refinement.md').read_bytes()).hexdigest()==req['refinement_sha256']
manifest=json.loads((out/'g4-registration-orders-payment-retry/input-files.json').read_text())
assert all(hashlib.sha256((root/p).read_bytes()).hexdigest()==h for p,h in manifest.items())
assert all(s['head_same'] and s['status_same'] for s in sources)
assert git(root,'branch','--show-current')=='integration/candidate-1'
assert git(root,'diff','b66aa28','--name-only','--','apps/web/src')==''
before=subprocess.check_output(['git','show','b66aa28:apps/api/src/payments/payments.service.spec.ts'],cwd=root).decode()
after=(root/'apps/api/src/payments/payments.service.spec.ts').read_text(encoding='utf-8')
assert len(re.findall(r'^\s*it(?:\(|\.each)',before,re.M))==len(re.findall(r'^\s*it(?:\(|\.each)',after,re.M))
result={'source_dirs_unchanged':len(sources),'source_files_unchanged':len(checked),'existing_migration_sql_unchanged':oldsql,'requirements_unchanged':True,'ui_source_unchanged':True,'tested_input_manifest_matches':True,'payment_test_cases_preserved':True,'branch':'integration/candidate-1'}
(out/'safety-summary.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
