import { holdStatementNames } from './hold-statement-names.js';

describe('hold statement names', () => {
  it('names identical SQL consistently, not other product queries', () => {
    const name = holdStatementNames();
    const sql = 'SELECT $1 FROM sessions s JOIN users u';
    expect(name({ sql })).toMatch(/^holds_[a-f0-9]{48}$/);
    expect(name({ sql })).toBe(name({ sql }));
    expect(name({ sql })).toBe(holdStatementNames()({ sql }));
    expect(name({ sql: 'SELECT $1 FROM (SELECT 1) anchor' })).not.toBe(
      name({ sql }),
    );
    expect(name({ sql: 'SELECT * FROM orders' })).toBe('');
    expect(name({ sql: 'BEGIN' })).toBe('');
    expect(
      name({ sql: 'SELECT * FROM public.claim_hold_v1($1,$2,$3,$4,$5,$6)' }),
    ).toMatch(/^holds_[a-f0-9]{48}$/);
  });

  it('bounds statement shapes and still reuses existing names at capacity', () => {
    const name = holdStatementNames();
    const first = 'WITH requested AS (SELECT $1) SELECT 0';
    const saved = name({ sql: first });
    for (let i = 1; i < 32; i++) {
      expect(
        name({ sql: `WITH requested AS (SELECT $1) SELECT ${i}` }),
      ).not.toBe('');
    }
    expect(name({ sql: 'WITH requested AS (SELECT $1) SELECT 32' })).toBe('');
    expect(name({ sql: first })).toBe(saved);
  });
});
