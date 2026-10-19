export function validateSeedTarget(env) {
  let target;
  try {
    target = new URL(env.DATABASE_URL ?? '');
  } catch {
    throw new Error('A dedicated staging database URL is required');
  }
  if (!['postgres:', 'postgresql:'].includes(target.protocol))
    throw new Error('Unsupported database protocol');
  const local =
    target.hostname === '127.0.0.1' &&
    target.port === '15432' &&
    target.pathname === '/sang_render_seed_verification';
  const render =
    /^dpg-[a-z0-9-]+(?:\.[a-z0-9-]+)*\.render\.com$/.test(target.hostname) &&
    target.pathname === '/sang_events_staging' &&
    target.username === 'sang_events' &&
    target.searchParams.get('sslmode') === 'verify-full';
  if (!local && !render)
    throw new Error('Requires the dedicated synthetic staging target');
  if (
    render &&
    env.RENDER_WRITE_APPROVAL !== 'seed-synthetic-staging-after-po-approval'
  )
    throw new Error('Remote seed requires separate explicit PO authorization');
  if (
    !env.SPRINT2_DEMO_PASSWORD ||
    env.SPRINT2_DEMO_PASSWORD.length < 16 ||
    env.SPRINT2_DEMO_PASSWORD.startsWith('<')
  )
    throw new Error(
      'Provide a synthetic account password of at least 16 characters',
    );
  return {
    connectionString: target.toString(),
    mode: local ? 'local' : 'render',
  };
}
