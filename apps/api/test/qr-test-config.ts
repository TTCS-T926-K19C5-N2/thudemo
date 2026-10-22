import { assertIntegrationDatabase } from './integration-database.js';
assertIntegrationDatabase();
import { generateKeyPairSync } from 'node:crypto';
// Isolated test-only keys. Production never generates keys at startup.
const pair = generateKeyPairSync('ed25519');
// Prevent an ignored developer .env from mixing a persisted key file/public key
// with this suite's isolated pair. Never change production key precedence.
process.env.SCANNER_SIGNING_PRIVATE_KEY_FILE = '';
process.env.SCANNER_PUBLIC_KEY = '';
process.env.SCANNER_KEY_ID = 'integration-fixture';
process.env.SCANNER_SIGNING_PRIVATE_KEY = pair.privateKey
  .export({ type: 'pkcs8', format: 'pem' })
  .toString();
process.env.SCANNER_PUBLIC_KEYS = JSON.stringify({
  'integration-fixture': pair.publicKey
    .export({ type: 'spki', format: 'pem' })
    .toString(),
});
process.env.TICKET_SIGNING_ACTIVE_KEY_ID = 'integration-fixture';
process.env.TICKET_SIGNING_PRIVATE_KEY =
  process.env.SCANNER_SIGNING_PRIVATE_KEY;
process.env.TICKET_SIGNING_PUBLIC_KEYS = process.env.SCANNER_PUBLIC_KEYS;
// Domain integration fixtures must not deliver to a real SMTP provider.
// The separate ticket-mail runtime acceptance explicitly enables its worker
// against an isolated SMTP catcher and records real receipts/timings.
process.env.TICKET_MAIL_WORKER = 'false';
