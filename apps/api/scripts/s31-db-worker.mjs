import { admit, connect } from './s31-db-client.mjs';

const client = await connect();
process.send({ ready: true, pid: process.pid });
process.on('message', async (input) => {
  try {
    const result = await admit(client, input);
    process.send({ result, pid: process.pid });
  } catch (error) {
    process.send({ error: error.code ?? 'DB_ERROR' });
  }
});
process.on('disconnect', () => {
  void client.end();
});
