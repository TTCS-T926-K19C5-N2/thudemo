import fs from 'node:fs';
const d=process.argv[2];
const r=JSON.parse(fs.readFileSync(`${d}/results.json`,'utf8'));
const arr=Array.isArray(r)?r:(r.results||r.cases||[]);
const counts={}; for(const x of arr) counts[x.status]=(counts[x.status]||0)+1;
const p=JSON.parse(fs.readFileSync(`${d}/progress.json`,'utf8'));
const m=JSON.parse(fs.readFileSync(`${d}/run-manifest.json`,'utf8'));
console.log(JSON.stringify({rows:arr.length,counts,progressTail:(p.checkpoints||[]).slice(-2),manifest:{latestCheckpoint:m.latestCheckpoint,preparedFilesetSha256:m.preparedFilesetSha256,counts:m.counts}},null,2));
