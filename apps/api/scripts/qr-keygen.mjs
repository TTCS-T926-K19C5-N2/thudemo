import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';
const dir = process.argv[2] && resolve(process.argv[2]);
const kid = process.argv[3];
const repo = resolve(import.meta.dirname, '../../..');
if (!dir || !kid || !/^[A-Za-z0-9_-]{1,32}$/.test(kid))
  throw Error(
    'Usage: node qr-keygen.mjs <private-directory-outside-repository> <key-id>',
  );
const rel = relative(repo, dir);
if (!rel || (!(rel === '..' || rel.startsWith('..' + sep)) && !isAbsolute(rel)))
  throw Error('Keys must be outside repository/build context');
const privatePath = resolve(dir, kid + '.private.pem'),
  publicPath = resolve(dir, kid + '.public.pem');
if (existsSync(privatePath) || existsSync(publicPath))
  throw Error('Refuse to overwrite existing keys; choose a new key ID');
mkdirSync(dir, { recursive: true, mode: 0o700 });
const pair = generateKeyPairSync('ed25519');
writeFileSync(
  privatePath,
  pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
  { mode: 0o600, flag: 'wx' },
);
writeFileSync(
  publicPath,
  pair.publicKey.export({ type: 'spki', format: 'pem' }),
  { mode: 0o644, flag: 'wx' },
);
console.log(
  JSON.stringify({ keyId: kid, created: true, privateKeyPrinted: false }),
);
