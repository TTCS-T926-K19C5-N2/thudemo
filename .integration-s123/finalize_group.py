import pathlib,json,hashlib,re,sys
root=pathlib.Path(__file__).resolve().parents[1];label=sys.argv[1];folder=root/'.integration-s123'/label
checks=json.loads((folder/'checks.json').read_text(encoding='utf-8'))
assert [x['name'] for x in checks]==['migrate','build','lint','typecheck','test','e2e']
assert all(x['exit_code']==0 for x in checks)
receipt=json.loads((folder/'receipt.json').read_text())
receipt.update(stories=sys.argv[2:],gates={x['name']:{'exit_code':x['exit_code'],'seconds':x['seconds'],'log_sha256':hashlib.sha256((folder/x['log']).read_bytes()).hexdigest()} for x in checks})
text=(folder/'test.log').read_text(encoding='utf-8')
counts=re.findall(r'Tests\s+(\d+) passed',text);deploy=re.search(r'ℹ pass (\d+)',text)
receipt['test_counts']={'api_web':[int(x) for x in counts],'deployment':int(deploy.group(1)) if deploy else None}
text=(folder/'e2e.log').read_text(encoding='utf-8');match=re.search(r'Tests\s+(\d+) passed \((\d+)\)',text)
assert match and match[1]==match[2], 'No skipped/failed E2E accepted'
receipt['e2e_passed']=int(match[1]);(folder/'summary.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
doc=root/'docs/SPRINT_1_3_INTEGRATION.md';text=doc.read_text(encoding='utf-8')
row=f"| {label} ({', '.join(sys.argv[2:])}) | PASS | PASS (warning có sẵn) | PASS | {sum(receipt['test_counts']['api_web'])+receipt['test_counts']['deployment']} PASS | {receipt['e2e_passed']} PASS | [receipt](../.integration-s123/{label}/summary.json) |"
needle='|---|---|---|---|---|---|---|';assert needle in text
if '| '+label+' (' not in text:text=text.replace(needle,needle+'\n'+row,1)
doc.write_text(text,encoding='utf-8');print(json.dumps({'group':label,'test':receipt['test_counts'],'e2e':receipt['e2e_passed']}))
