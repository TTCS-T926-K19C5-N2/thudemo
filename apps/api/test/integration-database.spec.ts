import { describe, it, expect } from 'vitest';
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
});
