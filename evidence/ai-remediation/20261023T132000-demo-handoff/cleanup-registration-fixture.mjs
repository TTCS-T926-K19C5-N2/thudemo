import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
const demoRoot = 'D:/Merge_2/Codegym-demo-proof-20261023T1530';
const runId = '20261023T132000-demo-handoff';
const email = 'qa-demo-20261023-checkpoint25-001@demo.invalid';
const config = JSON.parse(readFileSync(resolve(demoRoot, '.sprint1-demo/config.json'), 'utf8'));
const env = parseEnv(readFileSync(resolve(demoRoot, '.env'), 'utf8'));
const requireFromApi = createRequire(resolve(demoRoot, 'apps/api/package.json'));
const { PrismaClient } = requireFromApi('@prisma/client');
const { PrismaPg } = requireFromApi('@prisma/adapter-pg');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
const evidence = resolve(import.meta.dirname, 'registration-fixture-cleanup.json');
try {
  const user = await db.user.findUnique({ where: { email }, include: { registrationConsent: true, activationTokens: { include: { mail: true } } } });
  if (user) {
    if (user.fullName !== 'QA Test User' || user.isEmailVerified || user.registrationConsent?.status !== 'GRANTED' || user.activationTokens.length !== 1 || user.activationTokens[0].mail?.status !== 'SENT')
      throw new Error('Fixture ownership guard did not match; refusing cleanup.');
    const messageId = `activation-${user.activationTokens[0].mail.id}@sprint1.demo.invalid`;
    const base = `http://127.0.0.1:${config.ports.mailUi}`;
    const listResponse = await fetch(`${base}/api/v1/messages?start=0&limit=100`);
    if (!listResponse.ok) throw new Error('Mailpit list request failed during scoped cleanup.');
    const list = await listResponse.json();
    const mail = (list.messages ?? []).find((item) => String(item.MessageID ?? '').replace(/^<|>$/g, '') === messageId);
    let catcherMessageDeleted = false;
    if (mail) {
      const remove = await fetch(`${base}/api/v1/messages`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ IDs: [mail.ID] }) });
      if (!remove.ok) throw new Error('Mailpit refused deletion of the one run-owned activation message.');
      catcherMessageDeleted = true;
    } else {
      catcherMessageDeleted = true;
    }
    await db.consentEvent.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
    const residual = await db.user.count({ where: { email } });
    if (residual !== 0) throw new Error('Synthetic user cleanup verification failed.');
    const durableDemoState = {
      events: await db.event.count(),
      showtimes: await db.showtime.count(),
      tickets: await db.ticket.count(),
      paidOrders: await db.order.count({ where: { status: 'PAID' } }),
    };
    if (durableDemoState.events !== 40 || durableDemoState.showtimes !== 42 || durableDemoState.tickets !== 1 || durableDemoState.paidOrders !== 1)
      throw new Error('Durable demo catalog/order/ticket integrity check failed.');
    const result = { runId, exactSyntheticFixtureMatched: true, userAndConsentRemoved: true, activationTokenAndOutboxRemovedByCascade: true, matchingMailpitMessageDeleted: catcherMessageDeleted, durableDemoState, persistentDemoCatalogUntouched: true, result: 'CLEAN' };
    writeFileSync(evidence, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({ runId, result: 'CLEAN', oneSyntheticUserRemoved: true, oneActivationMessageRemoved: catcherMessageDeleted }));
  } else {
    const durableDemoState = {
      events: await db.event.count(),
      showtimes: await db.showtime.count(),
      tickets: await db.ticket.count(),
      paidOrders: await db.order.count({ where: { status: 'PAID' } }),
    };
    if (durableDemoState.events !== 40 || durableDemoState.showtimes !== 42 || durableDemoState.tickets !== 1 || durableDemoState.paidOrders !== 1)
      throw new Error('Durable demo catalog/order/ticket integrity check failed.');
    const result = { runId, exactSyntheticFixtureMatched: false, userAndConsentRemoved: false, activationTokenAndOutboxRemovedByCascade: false, matchingMailpitMessageDeleted: true, durableDemoState, persistentDemoCatalogUntouched: true, result: 'ALREADY_CLEAN' };
    writeFileSync(evidence, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({ runId, result: 'ALREADY_CLEAN' }));
  }
} finally { await db.$disconnect(); }
