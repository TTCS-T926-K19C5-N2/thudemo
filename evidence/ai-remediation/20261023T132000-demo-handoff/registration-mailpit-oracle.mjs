import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';

const repo = resolve(import.meta.dirname, '../../../..');
const demoRoot = 'D:/Merge_2/Codegym-demo-proof-20261023T1530';
const runId = '20261023T132000-demo-handoff';
const email = 'qa-demo-20261023-checkpoint25-001@demo.invalid';
const config = JSON.parse(readFileSync(resolve(demoRoot, '.sprint1-demo/config.json'), 'utf8'));
const env = parseEnv(readFileSync(resolve(demoRoot, '.env'), 'utf8'));
const requireFromApi = createRequire(resolve(demoRoot, 'apps/api/package.json'));
const { PrismaClient } = requireFromApi('@prisma/client');
const { PrismaPg } = requireFromApi('@prisma/adapter-pg');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
const evidence = resolve(import.meta.dirname, 'registration-mailpit-oracle.json');

try {
  let user;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    user = await db.user.findUnique({
      where: { email },
      include: {
        registrationConsent: true,
        userRoles: { include: { role: true } },
        activationTokens: { include: { mail: true } },
      },
    });
    if (user?.activationTokens[0]?.mail?.status === 'SENT') break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!user) throw new Error('Synthetic registration fixture was not found.');
  const token = user.activationTokens[0];
  if (!token?.mail || token.mail.status !== 'SENT' || user.isEmailVerified) {
    throw new Error('Registration is not pending with an SMTP-accepted activation message.');
  }
  const base = `http://127.0.0.1:${config.ports.mailUi}`;
  const listResponse = await fetch(`${base}/api/v1/messages?start=0&limit=100`);
  if (!listResponse.ok) throw new Error('Mailpit list request failed.');
  const list = await listResponse.json();
  const expectedMessageId = `activation-${token.mail.id}@sprint1.demo.invalid`;
  const message = (list.messages ?? []).find((item) => String(item.MessageID ?? '').replace(/^<|>$/g, '') === expectedMessageId);
  if (!message) throw new Error('Expected activation Message-ID is absent from the local catcher.');
  const detailResponse = await fetch(`${base}/api/v1/message/${encodeURIComponent(message.ID)}`);
  if (!detailResponse.ok) throw new Error('Mailpit message detail request failed.');
  const detail = await detailResponse.json();
  const body = [detail.Text, detail.HTML].filter((value) => typeof value === 'string').join('\n');
  const tokenMatch = body.match(/#token=([a-f0-9]{64})/);
  const linkHashMatches = !!tokenMatch && createHash('sha256').update(tokenMatch[1]).digest('hex') === token.tokenHash;
  const to = Array.isArray(detail.To) ? detail.To : [];
  const catcherRecipientMatches = to.some((item) => String(item.Address ?? item).toLowerCase() === email);
  const result = {
    runId,
    profile: 'prepared local demo with isolated PostgreSQL and Mailpit catcher',
    ui: 'browser submitted synthetic registration and displayed the generic success notice',
    database: {
      userExists: true,
      pendingEmailVerification: !user.isEmailVerified,
      buyerRoleOnly: user.userRoles.map((row) => row.role.name).join(',') === 'BUYER',
      consentPersisted: user.registrationConsent?.status === 'GRANTED',
      activationTokenHas24HourExpiry: Math.abs((token.expiresAt.getTime() - token.createdAt.getTime()) - 86400000) < 1000,
      mailOutboxStatus: token.mail.status,
      mailAttemptCount: token.mail.attempts,
      encryptedTokenClearedAfterSend: token.mail.encryptedToken === '',
    },
    mailpit: {
      catcherAcceptedExpectedMessageId: true,
      recipientMatchesSyntheticFixture: catcherRecipientMatches,
      bodyContainsActivationLinkWhoseTokenHashMatchesDatabase: linkHashMatches,
      realEmailSent: false,
    },
    sensitiveValuesLogged: false,
  };
  if (!result.database.buyerRoleOnly || !result.database.consentPersisted || !result.database.activationTokenHas24HourExpiry || !catcherRecipientMatches || !linkHashMatches) {
    throw new Error('An independent registration/catcher oracle assertion failed.');
  }
  writeFileSync(evidence, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ runId, result: 'PASS', pending: true, outbox: 'SENT', mailpitAccepted: true, activationLinkHashMatches: true, realEmailSent: false }));
} finally {
  await db.$disconnect();
}



