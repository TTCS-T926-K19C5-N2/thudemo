import { createHash } from 'node:crypto';

// Bound retained plans even when requests use different numbers of seat parameters.
// Cache SQL shapes only, never authorization results, bind values or expiry state.
export function holdStatementNames() {
  const names = new Map<string, string>();
  return ({ sql }: { sql: string }): string => {
    if (
      !sql.includes('WITH requested AS') &&
      !sql.includes('public.claim_hold_v1(') &&
      !sql.includes('FROM sessions s JOIN users u') &&
      !sql.includes('FROM (SELECT 1) anchor')
    )
      return ''; // pg treats an empty name as an unnamed statement.
    const known = names.get(sql);
    if (known) return known;
    if (names.size >= 32) return '';
    const name = `holds_${createHash('sha256').update(sql).digest('hex').slice(0, 48)}`;
    names.set(sql, name);
    return name;
  };
}
