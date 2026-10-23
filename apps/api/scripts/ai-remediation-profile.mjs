import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, openSync, closeSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const runId = process.env.AI_REMEDIATION_RUN_ID;
if (!/^\d{8}T\d{6}-remediation$/.test(runId ?? '')) {
  throw new Error('Set AI_REMEDIATION_RUN_ID to the active remediation run id.');
}
const root = resolve(import.meta.dirname, '../../..');
const evidenceDir = resolve(root, 'evidence/ai-remediation', runId);
const stateDir = resolve(root, '.cache/ai-remediation', runId);
const compose = resolve(root, 'docker-compose.ai-remediation.yml');
const project = `cgai${runId.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
const stateFile = resolve(stateDir, 'profile.json');
const envFile = resolve(stateDir, 'compose.env');
mkdirSync(evidenceDir, { recursive: true });
mkdirSync(stateDir, { recursive: true });

function run(args, { capture = false } = {}) {
  const result = spawnSync('docker', args, {
    cwd: root,
    windowsHide: true,
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? 'pipe' : 'inherit',
  });
  if (result.status !== 0) throw new Error(`Docker command failed: ${args[0]}`);
  return capture ? result.stdout.trim() : '';
}

function composeArgs(command) {
  return [
    'compose', '--project-name', project, '--file', compose,
    '--env-file', envFile, ...command,
  ];
}

function readState() {
  if (!existsSync(stateFile) || !existsSync(envFile))
    throw new Error('No isolated profile state exists for this run id.');
  return JSON.parse(readFileSync(stateFile, 'utf8'));
}

function isolatedEnvironment(state) {
  const privateEnv = Object.fromEntries(readFileSync(envFile, 'utf8').trim().split(/\r?\n/).map((line) => line.split(/=(.*)/s).slice(0, 2)));
  const password = privateEnv.AI_REMEDIATION_DB_PASSWORD;
  if (!password) throw new Error('Isolated DB credential is unavailable.');
  const databaseUrl = `postgresql://remediation:${encodeURIComponent(password)}@127.0.0.1:${state.db.port}/codegym_remediation`;
  return {
    ...process.env,
    DATABASE_URL: databaseUrl,
    AI_REMEDIATION_RUN_ID: runId,
    AI_REMEDIATION_PROFILE_MANIFEST: resolve(evidenceDir, 'profile-manifest.json'),
    SPRINT_E2E_DATABASE: state.db.database,
    CONFIG_IGNORE_ENV_FILE: 'true',
    AUTH_PROXY_SECRET: privateEnv.AI_REMEDIATION_AUTH_SECRET,
    REGISTRATION_DELIVERY_MODE: 'off',
    TICKET_MAIL_WORKER: 'false',
    TICKET_REMINDER_WORKER: 'false',
    NOTIFICATION_MAIL_WORKER: 'false',
    PASSWORD_RESET_WORKER: 'false',
    PAYMENT_GATEWAY: 'mock',
    REDIS_HOST: '127.0.0.1',
    REDIS_PORT: String(state.redis.port),
    REDIS_URL: `redis://127.0.0.1:${state.redis.port}/0`,
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(state.smtp.port),
    SMTP_FROM: 'test@codegym.invalid',
    REGISTRATION_MAIL_MODE: 'catcher',
    TICKET_MAIL_MODE: 'catcher',
    TICKET_SMTP_HOST: '127.0.0.1',
    TICKET_SMTP_PORT: String(state.smtp.port),
    TICKET_SMTP_FROM: 'test@codegym.invalid',
    APP_ENV: 'test',
    NODE_ENV: 'test',
    PORT: '3411',
    API_HOST: '127.0.0.1',
    WEB_ORIGIN: 'http://127.0.0.1:3410',
    PAYMENT_WEBHOOK_SECRET: 'remediation-only-webhook-secret',
    REGISTRATION_MAIL_KEY: privateEnv.AI_REMEDIATION_REGISTRATION_KEY,
    REGISTRATION_PUBLIC_ORIGIN: 'http://127.0.0.1:3410',
    SCANNER_KEY_ID: state.scanner_key_id,
    SCANNER_SIGNING_PRIVATE_KEY: state.scanner_private_key,
    SCANNER_PUBLIC_KEY: state.scanner_public_key,
    SCANNER_PUBLIC_KEYS: JSON.stringify({ [state.scanner_key_id]: state.scanner_public_key }),
    BOOKING_HOLD_ACCOUNT_LIMIT: '10000',
    BOOKING_HOLD_IP_LIMIT: '100000',
    BOOKING_ORDER_ACCOUNT_LIMIT: '10000',
    BOOKING_ORDER_IP_LIMIT: '100000',
  };
}

function runIsolated(label, command, args, overrides = {}) {
  const state = readState();
  const result = spawnSync(command, args, {
    cwd: label === 'migration' ? resolve(root, 'apps/api') : resolve(root, 'apps/api'),
    env: { ...isolatedEnvironment(state), ...overrides },
    windowsHide: true,
    encoding: 'utf8',
  });
  const logPath = resolve(evidenceDir, `${label}.log`);
  const exitPath = resolve(evidenceDir, `${label}.exitcode`);
  const priorLog = `${logPath}.previous-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const priorExit = `${exitPath}.previous-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  if (existsSync(logPath)) renameSync(logPath, priorLog);
  if (existsSync(exitPath)) renameSync(exitPath, priorExit);
  writeFileSync(logPath, (result.stdout ?? '') + (result.stderr ?? ''));
  writeFileSync(exitPath, `${result.status ?? 1}\n`);
  if (result.status !== 0) {
    console.error(`${label} failed; see ${label}.log (exit ${result.status ?? 1}).`);
    process.exitCode = result.status ?? 1;
    return result.status ?? 1;
  }
  const tail = (result.stdout ?? '').split(/\r?\n/).filter((line) => /Applying migration|successfully applied|No pending migrations|Test Files|Tests\s|PASS|FAIL/.test(line)).slice(-30);
  console.log(`${label} succeeded; evidence saved to ${label}.log.`);
  for (const line of tail) console.log(line);
  return 0;
}

const action = process.argv[2];
if (action === 'start') {
  if (existsSync(stateFile)) throw new Error('Profile already initialized; use status.');
  const ownerFile = resolve(stateDir, 'owner.json');
  if (existsSync(ownerFile)) throw new Error('An ownership marker already exists for this profile directory.');
  writeFileSync(ownerFile, JSON.stringify({ run_id: runId, project }), { flag: 'wx' });
  const password = randomBytes(32).toString('base64url');
  const registrationKey = randomBytes(32).toString('base64url');
  const pair = generateKeyPairSync('ed25519');
  const scannerPrivate = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const scannerPublic = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  writeFileSync(envFile, `AI_REMEDIATION_DB_PASSWORD=${password}\nAI_REMEDIATION_REGISTRATION_KEY=${registrationKey}\nAI_REMEDIATION_AUTH_SECRET=${randomBytes(48).toString('base64url')}\n`, { mode: 0o600, flag: 'wx' });
  try {
    run(composeArgs(['up', '--detach', '--wait']));
    const portFor = (service, target) => {
      const value = run(composeArgs(['port', service, String(target)]), { capture: true });
      const match = value.match(/^127\.0\.0\.1:(\d+)$/);
      if (!match) throw new Error(`Unexpected loopback port for ${service}.`);
      return Number(match[1]);
    };
    const state = {
      run_id: runId,
      project: project,
      compose_file: 'docker-compose.ai-remediation.yml',
      created_at: new Date().toISOString(),
      db: { host: '127.0.0.1', port: portFor('postgres', 5432), database: 'codegym_remediation', username: 'remediation' },
      redis: { host: '127.0.0.1', port: portFor('redis', 6379), database: 0 },
      smtp: { host: '127.0.0.1', port: portFor('smtp', 1025), catcher_ui_port: portFor('smtp', 8025) },
      workers_enabled: false,
      docker_project: project,
      scanner_key_id: 'ai-remediation',
      scanner_private_key: scannerPrivate,
      scanner_public_key: scannerPublic,
    };
    writeFileSync(stateFile, JSON.stringify(state, null, 2));
    const { scanner_private_key: _private, scanner_public_key: _public, ...manifest } = state;
    writeFileSync(resolve(evidenceDir, 'profile-manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(manifest, null, 2));
  } catch (error) {
    const owner = JSON.parse(readFileSync(ownerFile, 'utf8'));
    if (owner.run_id === runId && owner.project === project)
      try { run(composeArgs(['down', '--volumes', '--remove-orphans'])); } catch {}
    if (existsSync(envFile)) rmSync(envFile);
    throw error;
  }
} else if (action === 'status') {
  const state = readState();
  run(composeArgs(['ps']));
  const { scanner_private_key: _private, ...safeState } = state;
  console.log(JSON.stringify(safeState, null, 2));
} else if (action === 'stop') {
  readState();
  run(composeArgs(['down', '--remove-orphans']));
  console.log(`Stopped Compose project ${project}; the isolated DB volume is preserved.`);
} else if (action === 'cleanup') {
  readState();
  const resolved = resolve(stateDir);
  if (dirname(resolved) !== resolve(root, '.cache/ai-remediation'))
    throw new Error('Refusing cleanup outside the isolated profile state directory.');
  const owner = JSON.parse(readFileSync(resolve(stateDir, 'owner.json'), 'utf8'));
  if (owner.run_id !== runId || owner.project !== project)
    throw new Error('Profile ownership marker does not match; refusing cleanup.');
  run(composeArgs(['down', '--volumes', '--remove-orphans']));
  rmSync(resolved, { recursive: true, force: true });
  console.log(`Removed resources owned by Compose project ${project}.`);
} else if (action === 'migrate') {
  runIsolated('migration-deploy', process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
} else if (action === 'e2e') {
  const filter = process.env.AI_REMEDIATION_E2E_FILE;
  if (filter && !/^test\/[A-Za-z0-9._/-]+\.e2e-spec\.ts$/.test(filter))
    throw new Error('E2E file filter must name one repository test/*.e2e-spec.ts file.');
  const nameFilter = process.env.AI_REMEDIATION_E2E_NAME;
  if (nameFilter && (nameFilter.length > 120 || !/^[A-Za-z0-9 /-]+$/.test(nameFilter)))
    throw new Error('E2E name filter contains unsupported characters.');
  const args = ['node_modules/vitest/vitest.mjs', 'run', '--config', './vitest.config.e2e.ts', '--maxWorkers=1'];
  if (filter) args.push(filter);
  if (nameFilter) args.push('-t', nameFilter);
  runIsolated('e2e', process.execPath, args, {
    // Integration suites use MoMo-compatible signed payload fixtures; redirect any
    // accidental provider call to loopback and keep the run entirely local.
    PAYMENT_GATEWAY: 'momo',
    MOMO_ACCESS_KEY: 'F8BBA842ECF85',
    MOMO_SECRET_KEY: 'K951B6PE1waDMi640xX08PD3vg6EkVlz',
    MOMO_ENDPOINT: 'http://127.0.0.1:1',
    // This profile measures domain invariants, not quota/waiting-room policy.
    BOOKING_HOLD_ACCOUNT_LIMIT: '10000',
    BOOKING_HOLD_IP_LIMIT: '100000',
    BOOKING_ORDER_ACCOUNT_LIMIT: '10000',
    BOOKING_ORDER_IP_LIMIT: '100000',
    // API integration fixtures exercise the documented localhost origin; the
    // browser profile uses the isolated 3410 web origin instead.
    WEB_ORIGIN: 'http://localhost:3000',
  });
} else if (action === 'r19-fixture') {
  const operation = process.argv[3];
  if (!['seed', 'seed-5000', 'verify', 'cleanup', 'revoke-staff', 'restore-staff', 'disable-user', 'enable-user', 'add-second-gate', 'verify-duplicate', 'verify-delta', 'verify-5000', 'verify-int06', 'verify-int07', 'verify-int07-desktop', 'verify-int10'].includes(operation))
    throw new Error('R19 fixture operation is not allowed.');
  const script = resolve(root, 'apps/api/scripts/ai-remediation-r19-fixture.mjs');
  const overrides = operation === 'seed-5000' ? { AI_REMEDIATION_R19_TICKET_COUNT: '5000' } : {};
  runIsolated(`r19-fixture-${operation}`, process.execPath, [script, operation === 'seed-5000' ? 'seed' : operation], overrides);
} else if (action === 'int09-batch') {
  const operation = process.argv[3];
  if (!['seed', 'cancel', 'show-batch', 'refund-fail-one', 'worker-batch', 'mail-worker', 'verify', 'cleanup'].includes(operation))
    throw new Error('INT-09 batch operation is not allowed.');
  const script = resolve(root, 'apps/api/scripts/ai-remediation-int09-batch.mjs');
  const overrides = operation === 'refund-fail-one' ? { MOCK_REFUND_FAIL_FIRST_ATTEMPTS: '1' } : { MOCK_REFUND_FAIL_FIRST_ATTEMPTS: '0', ...(operation === 'mail-worker' ? { LIFECYCLE_WORKER: 'on' } : {}) };
  runIsolated(`int09-batch-${operation}`, process.execPath, [script, operation], overrides);
} else if (action === 'int16-transfer') {
  const operation = process.argv[3];
  if (!['seed', 'verify', 'cleanup'].includes(operation))
    throw new Error('INT-16 transfer fixture operation is not allowed.');
  const script = resolve(root, 'apps/api/scripts/ai-remediation-int16-fixture.mjs');
  runIsolated(`int16-transfer-${operation}`, process.execPath, [script, operation]);
} else if (action === 'browser-fixture') {
  const operation = process.argv[3];
  if (!['seed', 'cleanup', 'verify-int09'].includes(operation))
    throw new Error('Browser fixture operation is not allowed.');
  const script = resolve(root, 'apps/api/scripts/ai-remediation-browser-fixture.mjs');
  runIsolated(`browser-fixture-${operation}`, process.execPath, [script, operation]);
} else if (action === 's11-fixture') {
  const operation = process.argv[3];
  if (!['seed', 'cleanup', 'reset-password'].includes(operation))
    throw new Error('S-11 fixture operation is not allowed.');
  const script = resolve(root, 'apps/api/scripts/ai-remediation-s11-fixture.mjs');
  runIsolated(`s11-browser-fixture-${operation}`, process.execPath, [script, operation]);
} else if (action === 's56-fixture') {
  const operation = process.argv[3];
  if (!['seed', 'verify', 'cleanup'].includes(operation))
    throw new Error('S-56 fixture operation is not allowed.');
  const script = resolve(root, 'apps/api/scripts/ai-remediation-s56-browser-fixture.mjs');
  runIsolated(`s56-browser-fixture-${operation}`, process.execPath, [script, operation]);
} else if (action === 'waitlist-browser-fixture') {
  const operation = process.argv[3];
  if (!['seed', 'verify', 'cleanup'].includes(operation))
    throw new Error('Waitlist browser fixture operation is not allowed.');
  const script = resolve(root, 'apps/api/scripts/ai-remediation-waitlist-browser-fixture.mjs');
  runIsolated(`waitlist-browser-fixture-${operation}`, process.execPath, [script, operation]);
} else if (action === 'seat-race') {
  const script = resolve(root, 'apps/api/scripts/ai-remediation-seat-race.mjs');
  const seeded = runIsolated('seat-race-seed', process.execPath, [script, 'seed']);
  if (seeded !== 0) throw new Error('Seat-race fixture seed failed; see seat-race-seed.log.');
  try {
    runIsolated('seat-race-run', process.execPath, [script, 'run']);
  } finally {
    runIsolated('seat-race-cleanup', process.execPath, [script, 'cleanup']);
  }
} else if (action === 'api-start') {
  const state = readState();
  const apiLog = resolve(evidenceDir, 'api.log');
  const fd = openSync(apiLog, 'a');
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: resolve(root, 'apps/api'),
    env: isolatedEnvironment(state),
    detached: true,
    windowsHide: true,
    stdio: ['ignore', fd, fd],
  });
  closeSync(fd);
  if (!child.pid) throw new Error('Isolated API process did not start.');
  child.unref();
  writeFileSync(resolve(evidenceDir, 'api.pid'), `${child.pid}\n`);
  console.log(`Started isolated API from current dist; PID saved to api.pid, expected loopback endpoint 127.0.0.1:3411.`);
} else if (action === 'api-stop') {
  const pidPath = resolve(evidenceDir, 'api.pid');
  if (!existsSync(pidPath)) throw new Error('No API PID file exists for this run.');
  const pid = Number(readFileSync(pidPath, 'utf8').trim());
  if (!Number.isInteger(pid) || pid < 1) throw new Error('Invalid owned API PID record.');
  const stopped = spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, encoding: 'utf8' });
  if (stopped.status !== 0 && !/not found|not running/i.test(stopped.stderr ?? ''))
    throw new Error('Could not stop the API process recorded by this run.');
  writeFileSync(resolve(evidenceDir, 'api.stopped'), new Date().toISOString());
  console.log(`Stopped API process recorded by this run (${pid}).`);
} else if (action === 'web-start') {
  const state = readState();
  const webLog = resolve(evidenceDir, 'web.log');
  const fd = openSync(webLog, 'a');
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: resolve(root, 'apps/web'),
    env: {
      ...isolatedEnvironment(state),
      WEB_HOST: '127.0.0.1',
      WEB_PORT: '3410',
      API_INTERNAL_URL: 'http://127.0.0.1:3411',
    },
    detached: true,
    windowsHide: true,
    stdio: ['ignore', fd, fd],
  });
  closeSync(fd);
  if (!child.pid) throw new Error('Isolated web process did not start.');
  child.unref();
  writeFileSync(resolve(evidenceDir, 'web.pid'), `${child.pid}\n`);
  console.log(`Started current web build on 127.0.0.1:3410; PID saved to web.pid.`);
} else if (action === 'web-stop') {
  const pidPath = resolve(evidenceDir, 'web.pid');
  if (!existsSync(pidPath)) throw new Error('No web PID file exists for this run.');
  const pid = Number(readFileSync(pidPath, 'utf8').trim());
  if (!Number.isInteger(pid) || pid < 1) throw new Error('Invalid owned web PID record.');
  const stopped = spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, encoding: 'utf8' });
  if (stopped.status !== 0 && !/not found|not running/i.test(stopped.stderr ?? ''))
    throw new Error('Could not stop the web process recorded by this run.');
  writeFileSync(resolve(evidenceDir, 'web.stopped'), new Date().toISOString());
  console.log(`Stopped web process recorded by this run (${pid}).`);
} else {
  throw new Error('Usage: node apps/api/scripts/ai-remediation-profile.mjs start|status|stop|cleanup|migrate|e2e|seat-race|browser-fixture|api-start|api-stop|web-start|web-stop');
}
