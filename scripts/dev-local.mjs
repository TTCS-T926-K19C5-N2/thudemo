import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const configured = parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8'));
if ([configured.NODE_ENV, configured.APP_ENV].includes('production'))
  throw Error('pnpm dev requires a development environment.');
const env = { ...process.env, ...configured };
env.PORT ||= '3001';
env.WEB_PORT ||= '3000';
env.API_INTERNAL_URL ||= `http://127.0.0.1:${env.PORT}`;
console.log(`Codegym: ${root}\nWeb: http://localhost:${env.WEB_PORT} — API: http://localhost:${env.PORT}`);
const child = spawn('pnpm --parallel --filter api --filter web run dev', {
  cwd: root, env, shell: true, stdio: 'inherit', windowsHide: true,
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
