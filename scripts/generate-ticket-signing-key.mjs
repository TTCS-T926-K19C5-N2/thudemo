// Generates an Ed25519 key pair for signing ticket QR codes (S-26) and
// prints the .env lines to use it.
//
//   node scripts/generate-ticket-signing-key.mjs <keyId>
//
// Rotating keys: generate a new keyId, make it TICKET_SIGNING_ACTIVE_KEY_ID /
// TICKET_SIGNING_PRIVATE_KEY, and move the old public key into
// TICKET_SIGNING_PUBLIC_KEYS so tickets issued earlier still verify.
import { generateKeyPairSync } from 'node:crypto';

const keyId = process.argv[2] ?? `k${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`;
if (!/^[A-Za-z0-9_-]{1,32}$/.test(keyId)) {
  console.error('keyId chỉ gồm chữ, số, "_" hoặc "-", tối đa 32 ký tự.');
  process.exit(1);
}

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const privateDer = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
const publicDer = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

console.log(`TICKET_SIGNING_ACTIVE_KEY_ID=${keyId}`);
console.log(`TICKET_SIGNING_PRIVATE_KEY=${privateDer}`);
console.log(`# Khoá công khai của ${keyId} (khi đổi sang khoá mới, chuyển dòng này vào TICKET_SIGNING_PUBLIC_KEYS):`);
console.log(`# "${keyId}": "${publicDer}"`);
