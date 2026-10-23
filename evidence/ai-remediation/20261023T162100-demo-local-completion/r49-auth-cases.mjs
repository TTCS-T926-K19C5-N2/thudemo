import { readFileSync, writeFileSync } from 'node:fs';

const dir = import.meta.dirname;
const path = `${dir}/results.json`;
const rows = JSON.parse(readFileSync(path, 'utf8'));
const get = (id) => rows.find((row) => row.id === id);
const addSplit = (parentId, id, expected, status, actual, evidence) => {
  if (get(id)) return;
  const parent = get(parentId);
  if (!parent) throw new Error(`Missing source parent ${parentId}`);
  rows.push({
    id, requirement_id: parent.requirement_id, kind: parent.kind, group: parent.group,
    tier: parent.tier, priority: parent.priority, source: { ...parent.source },
    original_requirement: parent.original_requirement, expected: [expected],
    baseline_status: 'NOT_RUN', status, actual, evidence_files: evidence,
    source_ac_unchanged: true, parent_case_id: parentId, assertion_split: true,
  });
};

const organizer = get('S-02-AC01');
organizer.status = 'PASS';
organizer.actual = 'R49 signed in with the synthetic Organizer account in Chromium desktop 1280×800. The event-management navigation is visible and the accounting reconciliation item is absent. The browser showed no runtime errors and the test session logged out with HTTP 200. The two assertions are split below.';
organizer.evidence_files = ['r49-s02-ac01-browser.json', 'r49-s02-ac01-organizer-nav-desktop.png'];
addSplit('S-02-AC01', 'S-02-AC01.01', 'Organizer sees the event-management menu after login', 'PASS', 'Chromium desktop confirmed the “Sự kiện” management link is visible after Organizer login.', ['r49-s02-ac01-browser.json', 'r49-s02-ac01-organizer-nav-desktop.png']);
addSplit('S-02-AC01', 'S-02-AC01.02', 'Organizer does not see accounting reconciliation in navigation', 'PASS', 'The full Organizer page text did not contain “Đối soát kế toán”; authenticated UI session logged out successfully.', ['r49-s02-ac01-browser.json', 'r49-s02-ac01-organizer-nav-desktop.png']);

const buyer = get('S-02-AC02');
buyer.status = 'BLOCKED';
buyer.actual = 'R49 direct Node CLI request authenticated as the synthetic Buyer returned HTTP 403 for POST /events and created no event; session logout returned 200. The requirement also requires observing a runtime log entry. The API worker is detached with stdio not persisted in this profile, and .sprint1-demo/api.log remained empty; source code contains RolesGuard Logger.warn but that does not prove runtime emission. Parent remains BLOCKED until actual log output can be captured.';
buyer.evidence_files = ['r49-s02-ac02-api-log.json'];
addSplit('S-02-AC02', 'S-02-AC02.01', 'Buyer direct POST /events receives HTTP 403 and creates no event', 'PASS', 'Synthetic Buyer direct POST /events returned 403; no event was created and the session logged out with 200.', ['r49-s02-ac02-api-log.json']);
addSplit('S-02-AC02', 'S-02-AC02.02', 'The denied Buyer event-creation attempt is written to an observable runtime log', 'BLOCKED', 'Runtime logging could not be observed: .sprint1-demo/api.log was empty and the detached API worker does not persist its stdio stream. RolesGuard source has a Logger.warn call, but source inspection is not runtime log evidence.', ['r49-s02-ac02-api-log.json']);

writeFileSync(path, `${JSON.stringify(rows, null, 2)}\n`);
console.log(JSON.stringify({ rows: rows.length, changed: ['S-02-AC01', 'S-02-AC01.01', 'S-02-AC01.02', 'S-02-AC02', 'S-02-AC02.01', 'S-02-AC02.02'] }));
