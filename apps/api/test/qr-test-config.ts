import { generateKeyPairSync } from 'node:crypto';
// Isolated test-only keys. Production never generates keys at startup.
const pair = generateKeyPairSync('ed25519');
process.env.SCANNER_KEY_ID = 'integration-fixture';
process.env.SCANNER_SIGNING_PRIVATE_KEY = pair.privateKey
  .export({ type: 'pkcs8', format: 'pem' })
  .toString();
process.env.SCANNER_PUBLIC_KEYS = JSON.stringify({
  'integration-fixture': pair.publicKey
    .export({ type: 'spki', format: 'pem' })
    .toString(),
});
