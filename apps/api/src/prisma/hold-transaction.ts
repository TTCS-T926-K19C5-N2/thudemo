import type { Prisma } from '@prisma/client';

// Only the existing hold SQL uses this small driver-level path. Keep Prisma for
// model operations and orders; share its pool, never create a second one.
export interface HoldQueryable {
  $queryRaw<T>(sql: Prisma.Sql): Promise<T>;
}
export interface HoldConnection {
  pipeline?: boolean;
  query(
    sql: string | { text: string; values: unknown[]; name: string },
  ): Promise<{ rows: unknown[]; command?: string }>;
  release(destroy?: boolean): void;
  on(event: 'error', listener: (error: Error) => void): unknown;
  removeListener(event: 'error', listener: (error: Error) => void): unknown;
}
export interface HoldPool {
  connect(): Promise<HoldConnection>;
}

export async function holdTransaction<T>(
  pool: HoldPool,
  callback: (tx: HoldQueryable) => Promise<T>,
  statementName: (query: { sql: string }) => string,
  limits: { maxWait: number; timeout: number; validatedRoutine?: boolean } = {
    maxWait: 10000,
    timeout: 10000,
  },
): Promise<T> {
  if (
    !Number.isFinite(limits.maxWait) ||
    limits.maxWait <= 0 ||
    !Number.isFinite(limits.timeout) ||
    limits.timeout <= 0
  )
    throw Error('Invalid hold transaction limits');
  let acquireExpired = false;
  let acquireTimer: ReturnType<typeof setTimeout> | undefined;
  const acquiring = pool.connect().then((client) => {
    if (acquireExpired) {
      client.release(); // A late acquisition must not leak a pool slot.
      throw Error('Hold connection acquisition expired');
    }
    return client;
  });
  let client: HoldConnection;
  try {
    client = await Promise.race([
      acquiring,
      new Promise<never>((_, reject) => {
        acquireTimer = setTimeout(() => {
          acquireExpired = true;
          reject(Error('Hold connection acquisition expired'));
        }, limits.maxWait);
      }),
    ]);
  } finally {
    clearTimeout(acquireTimer);
  }

  let released = false;
  const previousPipeline = client.pipeline;
  let routineSubmitted = false;
  let transactionEnded = false;
  let transactionTimer: ReturnType<typeof setTimeout> | undefined;
  let rejectConnection: (reason: Error) => void;
  const connectionFailure = new Promise<never>((_, reject) => {
    rejectConnection = reject;
  });
  const onConnectionError = () => {
    release(true);
    rejectConnection(Error('Hold connection failed'));
  };
  const release = (destroy = false) => {
    if (released) return;
    released = true;
    client.removeListener('error', onConnectionError);
    // Restore the public pg setting before reuse (or destruction on deadline).
    client.pipeline = previousPipeline;
    client.release(destroy);
  };
  client.on('error', onConnectionError);
  const tx: HoldQueryable = {
    async $queryRaw<R>(sql: Prisma.Sql): Promise<R> {
      if (released) throw Error('Hold transaction is closed');
      // Hold statements bind only primitive UUID/hash/integer values. Reject
      // richer Prisma parameter types rather than silently changing conversion.
      if (
        sql.values.some(
          (v) =>
            v !== null && !['string', 'number', 'boolean'].includes(typeof v),
        )
      )
        throw Error('Unsupported hold parameter type');
      if (
        limits.validatedRoutine &&
        (routineSubmitted ||
          (!sql.text.trim().startsWith('SELECT * FROM public.claim_hold_v2(') &&
            !sql.text.trim().startsWith('SELECT * FROM public.claim_hold_v3(')))
      )
        throw Error('Only the validated hold routine can pipeline commit');
      const querying = client.query({
        text: sql.text,
        values: sql.values,
        name: statementName({ sql: sql.text }),
      });
      let result: { rows: unknown[] };
      if (limits.validatedRoutine) {
        routineSubmitted = true;
        // BEGIN has already succeeded. v2 aborts invalid outcomes; v3 rolls
        // their writes back inside a subtransaction before returning a failure.
        // Only these validated routines may pipeline COMMIT, never v1.
        const committing = client.query('COMMIT');
        const [queryResult, commitResult] = await Promise.allSettled([
          querying,
          committing,
        ]);
        transactionEnded =
          commitResult.status === 'fulfilled' &&
          ['COMMIT', 'ROLLBACK'].includes(commitResult.value.command ?? '');
        if (queryResult.status === 'rejected') throw queryResult.reason;
        if (commitResult.status === 'rejected') throw commitResult.reason;
        result = queryResult.value;
      } else {
        result = await querying;
      }
      return result.rows as R;
    },
  };
  const running = (async () => {
    try {
      // One round trip, not a separate SET query. A server-side bound also
      // interrupts a lock wait/statement if the client deadline closes its socket.
      // LOCAL cannot leak this setting to the next pool borrower.
      await client.query(
        `BEGIN; SET LOCAL statement_timeout = '${Math.ceil(limits.timeout)}ms'`,
      );
      if (limits.validatedRoutine) client.pipeline = true;
      const value = await callback(tx);
      if (released) throw Error('Hold transaction is closed');
      if (limits.validatedRoutine) {
        if (!routineSubmitted)
          throw Error('Validated hold routine was not submitted');
      } else await client.query('COMMIT');
      return value;
    } catch (error) {
      if (!released && !transactionEnded) {
        try {
          await client.query('ROLLBACK');
        } catch {
          release(true); // Never reuse an uncertain/failed transaction.
        }
      }
      throw error;
    } finally {
      release();
    }
  })();
  try {
    return await Promise.race([
      running,
      connectionFailure,
      new Promise<never>((_, reject) => {
        transactionTimer = setTimeout(() => {
          // Destroy the socket: PostgreSQL aborts the open transaction. Do not
          // release a still-running SQL statement back for another request.
          release(true);
          reject(Error('Hold transaction expired'));
        }, limits.timeout);
      }),
    ]);
  } finally {
    clearTimeout(transactionTimer);
  }
}
