// Read an isolated diagnostic's metrics/call frames, never product SQL or binds.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(process.argv[2]);
const report = JSON.parse(
  readFileSync(resolve(dir, 'http-concurrency.json'), 'utf8'),
);
console.log(
  JSON.stringify({
    diagnosticOnly: true,
    runtime: report.runtime,
    total: report.total,
    profiles: report.profiles,
  }),
);
for (const file of readdirSync(dir).filter((name) =>
  /^api-\d+\.cpuprofile$/.test(name),
)) {
  const profile = JSON.parse(readFileSync(resolve(dir, file), 'utf8'));
  const sums = new Map();
  for (const node of profile.nodes) {
    // Only function name/file location already present in a V8 call frame.
    const frame = `${node.callFrame.functionName} ${node.callFrame.url}`;
    sums.set(frame, (sums.get(frame) ?? 0) + (node.hitCount ?? 0));
  }
  console.log(
    JSON.stringify({
      file,
      cpuFrames: [...sums].sort((a, b) => b[1] - a[1]).slice(0, 30),
    }),
  );
}
