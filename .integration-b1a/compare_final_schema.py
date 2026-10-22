import pathlib,subprocess,json,re,hashlib
root=pathlib.Path(__file__).resolve().parents[1];out=root/'.integration-b1a'
latest=json.loads((out/'migration-results.json').read_text())['fresh_database']
def schema(db):
    result=subprocess.check_output(['docker','exec','thudemo-integration-b1a-pg','pg_dump','--schema-only','--no-owner','--no-privileges','-U','b1a_fixture','-d',db],text=True,encoding='utf-8')
    # pg_dump emits per-invocation random restrict/unrestrict sentinels.
    result='\n'.join(line for line in result.splitlines() if not re.match(r'^\\(un)?restrict\b',line))
    return result
baseline=schema('b1a_empty_20261022135843');final=schema(latest)
(out/'baseline42-schema.sql').write_text(baseline,encoding='utf-8')
(out/'final46-schema.sql').write_text(final,encoding='utf-8')
receipt={'baseline_database':'b1a_empty_20261022135843','final_database':latest,'same_normalized_schema_dump':baseline==final,'baseline_sha256':hashlib.sha256(baseline.encode()).hexdigest(),'final_sha256':hashlib.sha256(final.encode()).hexdigest()}
(out/'schema-equivalence.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
print(json.dumps(receipt));assert baseline==final
