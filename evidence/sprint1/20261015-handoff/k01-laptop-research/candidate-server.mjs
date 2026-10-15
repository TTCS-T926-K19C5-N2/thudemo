// Loopback-only research HTTP endpoint. Not an application hold API or T-31 proof.
import { createServer } from 'node:http';
import { postgresCandidate, redisCandidate } from './candidate-stores.mjs';
const store =
  process.env.K01_STORE === 'PostgreSQL'
    ? postgresCandidate()
    : redisCandidate();
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/health') {
      res.end('ok');
      return;
    }
    if (req.method !== 'POST' || req.url !== '/candidate/hold') {
      res.writeHead(404);
      res.end();
      return;
    }
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 8192)
        throw Object.assign(new Error('Input too large'), { status: 400 });
    }
    const body = JSON.parse(raw);
    if (
      typeof body.actor !== 'string' ||
      !body.actor.startsWith('fixture-') ||
      !Array.isArray(body.seats) ||
      !body.seats.length ||
      body.seats.length > 20 ||
      !body.seats.every((s) => Number.isInteger(s) && s > 0)
    )
      throw Object.assign(new Error('Invalid fixture input'), { status: 400 });
    const result = await store.hold(body.actor, body.seats);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(error.status ?? 500, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        code: error.status === 409 ? 'CONFLICT' : 'CANDIDATE_ERROR',
      }),
    );
  }
});
server.listen(0, '127.0.0.1', () =>
  process.send?.({ port: server.address().port }),
);
async function shutdown() {
  server.close();
  await store.close();
  process.exit(0);
}
process.on('message', (m) => {
  if (m === 'shutdown') void shutdown();
});
process.on('SIGTERM', () => void shutdown());
