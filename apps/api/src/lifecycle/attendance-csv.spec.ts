import { describe, expect, it } from 'vitest';
import { attendanceCsv, attendanceCsvCell } from './reports.service.js';

describe('attendance CSV', () => {
  it('quotes delimiters and neutralizes spreadsheet formulas', () => {
    expect(attendanceCsvCell('North, "A"')).toBe('"North, ""A"""');
    for (const formula of ['=1+1', '+SUM(A1)', '-2+3', '@SUM(A1)'])
      expect(attendanceCsvCell(formula)).toBe(`"'${formula}"`);
  });

  it('exports minimal fields in a stable UTF-8 UTC format', () => {
    const csv = attendanceCsv([
      {
        ticketCode: 'CG-001',
        seat: 'A,01',
        entryTime: new Date('2026-10-22T10:00:00.000Z'),
        gate: 'Cửa Đông',
        conflict: true,
      },
    ]);
    expect(csv).toBe(
      '\uFEFFticket_code,seat,entry_time_utc,gate,conflict\r\n"CG-001","A,01","2026-10-22T10:00:00.000Z","Cửa Đông","true"\r\n',
    );
  });
});
