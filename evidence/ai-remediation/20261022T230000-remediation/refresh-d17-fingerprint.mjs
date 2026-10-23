import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const dir = import.meta.dirname;
const root = resolve(dir, '../../..');
const file = resolve(dir, 'run-manifest.json');
const manifest = JSON.parse(readFileSync(file, 'utf8'));
const sha = (path) => createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');
const current = new Map((manifest.source_file_fingerprints ?? []).map((entry) => [entry.path, entry]));
const add = [
  'apps/api/src/payments/gateways/payment-gateway.errors.ts',
  'apps/api/src/payments/gateways/payment-gateway.interface.ts',
  'apps/api/src/payments/gateways/mock.gateway.ts',
  'apps/api/src/payments/gateways/mock.gateway.spec.ts',
  'apps/api/src/payments/gateways/momo.gateway.ts',
  'apps/api/src/payments/gateways/momo.gateway.spec.ts',
  'apps/api/src/payments/payments.service.ts',
  'apps/api/src/payments/payments.service.spec.ts',
  'apps/api/test/mock-gateway.e2e-spec.ts',
  'apps/api/test/payments.e2e-spec.ts',
  'apps/api/test/coupons.e2e-spec.ts',
  'apps/api/test/ticket-check-in.e2e-spec.ts',
  'apps/api/scripts/ai-remediation-browser-fixture.mjs',
  'apps/api/scripts/ai-remediation-profile.mjs',
  'apps/api/scripts/ai-remediation-r19-fixture.mjs',
  'apps/web/scripts/ai-remediation-browser.mjs',
  'apps/web/scripts/ai-remediation-int06-browser.mjs',
  'apps/web/src/features/order-review/order-review.tsx',
  'apps/web/src/features/order-review/order-review.coupon.spec.tsx',
];
for (const path of add) current.set(path, { path, sha256: sha(path) });
const entries = [...current.values()].sort((a, b) => a.path.localeCompare(b.path, 'en'));
manifest.source_file_fingerprints = entries;
manifest.source_file_count = entries.length;
manifest.current_source_fingerprint_algorithm = 'SHA-256(JSON.stringify(source_file_fingerprints sorted lexicographically by path))';
manifest.current_source_fingerprint_sha256 = createHash('sha256').update(JSON.stringify(entries)).digest('hex');
manifest.source_fingerprint_algorithm = manifest.current_source_fingerprint_algorithm;
manifest.fingerprint_updated_at = new Date().toISOString();
manifest.current_source_fingerprint_updated_local = manifest.fingerprint_updated_at;
manifest.latest_source_fingerprint = {
  sha256: createHash('sha256').update(entries.filter((item) => add.includes(item.path)).map((item) => `${item.path}\0${item.sha256}\n`).join('')).digest('hex'),
  algorithm: 'SHA-256 over sorted UTF-8 lines: path + NUL + file SHA-256 + LF; D17 payment outcome handling and browser UI guard',
  files: entries.filter((item) => add.includes(item.path)),
  recorded_local: manifest.fingerprint_updated_at,
};
manifest.latest_touched_source_files = add;
manifest.latest_touched_source_fingerprint_sha256 = manifest.latest_source_fingerprint.sha256;
manifest.fingerprint_refresh_note = 'D17 user-approved ambiguous payment outcome policy implemented; local unit, API/PostgreSQL E2E, UI/browser, typecheck and build evidence recorded. Real provider/staging not verified.';
manifest.latest_checkpoint = 'r18-d17-checkpoint.json';
manifest.latest_delta_note = 'D17 approved; INT-14 local flow now verified including desktop/mobile buyer UI; remainder of R00-R23 incomplete.';
manifest.latest_checkpoint_recorded_local = manifest.fingerprint_updated_at;
writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ source_file_count: entries.length, fingerprint: manifest.current_source_fingerprint_sha256, latest_files: add.length }));
