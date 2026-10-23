import { readFileSync, writeFileSync } from 'node:fs';

const dir = import.meta.dirname;
const path = `${dir}/results.json`;
const rows = JSON.parse(readFileSync(path, 'utf8'));
const get = (id) => rows.find((row) => row.id === id);
const parent = get('S-02-AC03');
if (!parent) throw new Error('Source case S-02-AC03 is missing.');
parent.status = 'PASS';
parent.actual = 'R50 used the dedicated synthetic lock-test account and snapshotted the exact Redis lock/failure/IP keys. Five bad passwords returned HTTP 401; the Redis lock was set for the account; the sixth mobile UI attempt returned HTTP 429 with retryAfterSeconds=899 and displayed “Đăng nhập tạm thời bị khóa. Thử lại sau 15 phút.” Redis state was restored to its pre-test values/TTL; no DB write or provider call occurred. The parent is split into two assertions below.';
parent.evidence_files = ['r50-s02-ac03-lockout.json', 'r50-s02-ac03-lockout-mobile.png'];
const add = (id, expected, actual) => {
  if (get(id)) return;
  rows.push({
    id, requirement_id: parent.requirement_id, kind: parent.kind, group: parent.group,
    tier: parent.tier, priority: parent.priority, source: { ...parent.source },
    original_requirement: parent.original_requirement, expected: [expected],
    baseline_status: 'NOT_RUN', status: 'PASS', actual,
    evidence_files: ['r50-s02-ac03-lockout.json', 'r50-s02-ac03-lockout-mobile.png'],
    source_ac_unchanged: true, parent_case_id: 'S-02-AC03', assertion_split: true,
  });
};
add('S-02-AC03.01', 'Five consecutive bad passwords set an account lock for 15 minutes.', 'Five failed attempts returned 401. The dedicated account Redis lock was set with a 900-second policy; the observed TTL on the sixth attempt was 899 seconds. Original Redis values and remaining TTL were restored after the test.');
add('S-02-AC03.02', 'The sixth login attempt is blocked and the UI shows remaining lock time.', 'At 390×844 the sixth login returned HTTP 429; the UI displayed the 15-minute lock message. Browser had no page errors.');
writeFileSync(path, `${JSON.stringify(rows, null, 2)}\n`);
console.log(JSON.stringify({ rows: rows.length, parent: parent.status, children: ['S-02-AC03.01', 'S-02-AC03.02'].map((id) => get(id).status) }));
