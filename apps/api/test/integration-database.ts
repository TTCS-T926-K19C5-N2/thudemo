import { readFileSync } from 'node:fs';

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
  let remediationProfile = false;
  if (env.AI_REMEDIATION_PROFILE_MANIFEST) {
    try {
      const manifest = JSON.parse(
        readFileSync(env.AI_REMEDIATION_PROFILE_MANIFEST, 'utf8'),
      ) as {
        run_id?: string;
        db?: { host?: string; port?: number; database?: string; username?: string };
      };
      const profile = manifest.db;
      remediationProfile =
        /^\d{8}T\d{6}-remediation$/.test(manifest.run_id ?? '') &&
        env.AI_REMEDIATION_RUN_ID === manifest.run_id &&
        ['127.0.0.1', 'localhost'].includes(target.hostname) &&
        Number(target.port || 5432) === profile?.port &&
        target.pathname === `/${profile?.database}` &&
        decodeURIComponent(target.username) === profile?.username &&
        env.SPRINT_E2E_DATABASE === profile?.database;
    } catch {
      remediationProfile = false;
    }
  }
  if (!legacy && !explicitClone && !remediationProfile)
    throw Error(
      'Integration tests refuse unverified databases. Use an exact disposable profile manifest or the legacy guarded test DB.',
    );
}
