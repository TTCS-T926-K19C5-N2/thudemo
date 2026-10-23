// Compatibility shim for older instructions. All services and database
// identity are now managed by the run-bound, manifest-guarded profile.
if (!/^\d{8}T\d{6}-remediation$/.test(process.env.AI_REMEDIATION_RUN_ID ?? '')) {
  throw new Error('Set the active remediation run id and start its isolated profile first.');
}
import { spawnSync } from 'node:child_process';
const result = spawnSync(
  process.execPath,
  ['./scripts/ai-remediation-profile.mjs', 'e2e'],
  { cwd: import.meta.dirname.replace(/[\\/]scripts$/, ''), env: process.env, windowsHide: true, stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
