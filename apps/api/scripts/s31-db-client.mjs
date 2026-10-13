import { createRequire } from 'node:module';

// Use the pg driver already used by Prisma; no extra dependency or stack.
const require = createRequire(import.meta.url);
const adapterRequire = createRequire(require.resolve('@prisma/adapter-pg'));
const { Client } = adapterRequire('pg');

export async function connect() {
  const value = process.env.S31_DATABASE_URL;
  const target = new URL(value ?? '');
  if (
    !['localhost', '127.0.0.1'].includes(target.hostname) ||
    target.pathname !== '/s31_storage_verification' ||
    !['15436', '5432'].includes(target.port)
  ) {
    throw new Error(
      'S31 proof requires the dedicated local s31_storage_verification database',
    );
  }
  const client = new Client({ connectionString: value });
  await client.connect();
  return client;
}

export async function admit(client, input) {
  const result = await client.query(
    'SELECT * FROM s31_verification.admit_normal($1, $2, $3, $4, $5, $6)',
    [
      input.ticket,
      input.showtime,
      input.gate,
      input.actor,
      input.name,
      input.request,
    ],
  );
  // Autocommit query resolves after commit; explicit transactions must be
  // committed by the caller before presenting ADMITTED to a scanner.
  return result.rows[0];
}
