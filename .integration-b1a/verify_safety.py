import pathlib,json,hashlib,subprocess,os
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=ROOT/'.integration-b1a'
os.environ['GIT_OPTIONAL_LOCKS']='0'
def git(path,*args):
    return subprocess.check_output(['git','-c','core.quotePath=false','-C',str(path),*args],text=True,encoding='utf-8').strip()
inv=json.loads((ROOT/'.integration-audit/inventory.json').read_text(encoding='utf-8'))
analysis=json.loads((ROOT/'.integration-audit/analysis.json').read_text(encoding='utf-8'))
sources=[];checked=set();changed=[]
for r in inv['repos']:
    p=pathlib.Path(r['path']);sources.append({'source':r['name'],'head_same':git(p,'rev-parse','HEAD')==r['head'],'status_same':git(p,'status','--porcelain=v1','--untracked-files=all')==r['status']})
for row in analysis['matrix']:
    source=next(r['path'] for r in inv['repos'] if r['name']==row['source'])
    for f in row['implementation']:
        p=pathlib.Path(source,f['path'])
        if p in checked:continue
        checked.add(p)
        if hashlib.sha256(p.read_bytes()).hexdigest()!=f['sha256']:changed.append(str(p))
originals=[]
for name in git(ROOT,'ls-tree','-r','--name-only','799fc882','apps/api/prisma/migrations').splitlines():
    old=subprocess.check_output(['git','show',f'799fc882:{name}'],cwd=ROOT)
    now=(ROOT/name).read_bytes()
    assert old.replace(b'\r\n',b'\n')==now.replace(b'\r\n',b'\n'),name
    originals.append({'path':name,'sha256':hashlib.sha256(now).hexdigest(),'same_lf':True})
req=json.loads((ROOT/'.integration-audit/requirements.json').read_text(encoding='utf-8'))
book=pathlib.Path(req['file']);ref=book.parent/'approved-refinement.md'
result={'sources':sources,'source_files_hashed':len(checked),'changed_source_files':changed,'original_migration_files':originals,'workbook_same':hashlib.sha256(book.read_bytes()).hexdigest()==req['sha256'],'refinement_same':hashlib.sha256(ref.read_bytes()).hexdigest()==req['refinement_sha256'],'application_source_diff':git(ROOT,'diff','799fc882','--name-only','--','apps/api/src','apps/web/src'),'branch':git(ROOT,'branch','--show-current')}
(OUT/'safety-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
assert all(x['head_same'] and x['status_same'] for x in sources) and not changed
assert result['workbook_same'] and result['refinement_same'] and not result['application_source_diff']
assert result['branch']=='integration/candidate-1'
print(json.dumps({'source_dirs_unchanged':len(sources),'source_files_unchanged':len(checked),'original_migration_files_unchanged':len(originals),'application_source_unchanged':True,'requirements_unchanged':True}))
