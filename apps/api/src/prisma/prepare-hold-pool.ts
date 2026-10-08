import type { HoldConnection, HoldPool } from './hold-transaction.js';

// Establish sockets before serving traffic, not by executing fixture/product SQL.
// Keep the same pool/cap; the ready reserve avoids every burst starting with
// connection handshakes. Do not retain borrowed clients after readiness/failure.
export async function prepareHoldPool(pool: HoldPool, count = 16) {
  if (!Number.isInteger(count) || count < 1 || count > 16)
    throw Error('Invalid ready connection count');
  const clients: HoldConnection[] = [];
  let finished = false;
  try {
    await Promise.all(
      Array.from({ length: count }, async () => {
        const client = await pool.connect();
        if (finished) client.release();
        else clients.push(client);
      }),
    );
  } finally {
    finished = true;
    for (const client of clients) client.release();
  }
}
