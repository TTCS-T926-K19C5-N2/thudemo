import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertIntegrationDatabase } from './integration-database.js';
describe('Integration database safety', () => {
  it('allows only exact explicitly opted-in local test clone', () =>
    expect(() =>
      assertIntegrationDatabase({
        DATABASE_URL: 'postgresql://fixture@localhost:5432/codegym_e2e_123',
        SPRINT_E2E_DATABASE: 'codegym_e2e_123',
      }),
    ).not.toThrow());
  it.each([
    {
      DATABASE_URL: 'postgresql://fixture@localhost:5432/codegym_local',
      SPRINT_E2E_DATABASE: 'codegym_local',
    },
    { DATABASE_URL: 'postgresql://fixture@localhost:5432/codegym_e2e_123' },
    {
      DATABASE_URL: 'postgresql://fixture@remote:5432/codegym_e2e_123',
      SPRINT_E2E_DATABASE: 'codegym_e2e_123',
    },
    {
      DATABASE_URL: 'postgresql://fixture@localhost:5432/codegym_e2e_123',
      SPRINT_E2E_DATABASE: 'codegym_e2e_456',
    },
  ])(
    'rejects main DB, missing opt-in, remote host and mismatched DBname',
    (env) => expect(() => assertIntegrationDatabase(env)).toThrow(),
  );

  it('accepts only the exact run-bound loopback profile manifest', () => {
    const directory = mkdtempSync(join(tmpdir(), 'codegym-profile-'));
    const manifest = join(directory, 'profile.json');
    writeFileSync(
      manifest,
      JSON.stringify({
        run_id: '20261022T230000-remediation',
        db: { host: '127.0.0.1', port: 54844, database: 'codegym_remediation', username: 'remediation' },
      }),
    );
    try {
      expect(() => assertIntegrationDatabase({
        DATABASE_URL: 'postgresql://remediation:fixture@127.0.0.1:54844/codegym_remediation',
        SPRINT_E2E_DATABASE: 'codegym_remediation',
        AI_REMEDIATION_RUN_ID: '20261022T230000-remediation',
        AI_REMEDIATION_PROFILE_MANIFEST: manifest,
      })).not.toThrow();
      expect(() => assertIntegrationDatabase({
        DATABASE_URL: 'postgresql://remediation:fixture@127.0.0.1:5432/codegym_remediation',
        SPRINT_E2E_DATABASE: 'codegym_remediation',
        AI_REMEDIATION_RUN_ID: '20261022T230000-remediation',
        AI_REMEDIATION_PROFILE_MANIFEST: manifest,
      })).toThrow();
      expect(() => assertIntegrationDatabase({
        DATABASE_URL: 'postgresql://remediation:fixture@127.0.0.1:54844/codegym_remediation',
        SPRINT_E2E_DATABASE: 'codegym_remediation',
        AI_REMEDIATION_RUN_ID: '20261022T230001-remediation',
        AI_REMEDIATION_PROFILE_MANIFEST: manifest,
      })).toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
