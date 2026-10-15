import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSeedTarget } from './render-staging-target.mjs';
const local = {
  DATABASE_URL:
    'postgresql://sprint2:placeholder@127.0.0.1:15432/sang_render_seed_verification',
  SPRINT2_DEMO_PASSWORD: 'synthetic-test-only-placeholder',
};
const remote = {
  ...local,
  DATABASE_URL:
    'postgresql://sang_events:placeholder@dpg-placeholder-a.singapore-postgres.render.com/sang_events_staging?sslmode=verify-full',
  RENDER_WRITE_APPROVAL: 'seed-synthetic-staging-after-po-approval',
};
test('allows only the dedicated local verification database', () => {
  assert.equal(validateSeedTarget(local).mode, 'local');
  for (const value of [
    local.DATABASE_URL.replace(
      'sang_render_seed_verification',
      'stitch_fidelity',
    ),
    local.DATABASE_URL.replace('15432', '5432'),
    local.DATABASE_URL.replace('127.0.0.1', 'localhost'),
  ])
    assert.throws(() => validateSeedTarget({ ...local, DATABASE_URL: value }));
});
test('Render writes require the exact synthetic database, TLS and separate approval', () => {
  assert.equal(validateSeedTarget(remote).mode, 'render');
  for (const env of [
    { ...remote, RENDER_WRITE_APPROVAL: undefined },
    {
      ...remote,
      DATABASE_URL: remote.DATABASE_URL.replace('verify-full', 'disable'),
    },
    {
      ...remote,
      DATABASE_URL: remote.DATABASE_URL.replace(
        'sang_events_staging',
        'production',
      ),
    },
    {
      ...remote,
      DATABASE_URL: remote.DATABASE_URL.replace(
        'render.com',
        'render.com.attacker.invalid',
      ),
    },
    { ...remote, SPRINT2_DEMO_PASSWORD: '<placeholder>' },
  ])
    assert.throws(() => validateSeedTarget(env));
});
