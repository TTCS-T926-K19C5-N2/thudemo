/** An explicit, disposable database is mandatory before any integration writes. */
export function assertIntegrationDatabase(
  env: Record<string, string | undefined> = process.env,
) {
  let target: URL;
  try {
    target = new URL(env.DATABASE_URL ?? '');
  } catch {
    throw Error('Provide an explicitly isolated integration DATABASE_URL.');
  }
  const legacy =
    target.hostname === '127.0.0.1' &&
    target.pathname === '/sprint2_integration' &&
    (target.port === '15432' ||
      (target.port === '15446' && env.SPRINT1_ISOLATED_TEST === 'true'));
  const explicitClone =
    ['127.0.0.1', 'localhost'].includes(target.hostname) &&
    target.port === '5432' &&
    /^\/codegym_e2e_\d+$/.test(target.pathname) &&
    env.SPRINT_E2E_DATABASE === target.pathname.slice(1);
  if (!legacy && !explicitClone)
    throw Error(
      'Integration tests refuse the main database. Use a disposable codegym_e2e_* DB and exact SPRINT_E2E_DATABASE opt-in.',
    );
}
