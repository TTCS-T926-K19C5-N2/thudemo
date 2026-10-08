import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { scanCommand } from './admission-contract.js';
const valid = () => ({
  ticketId: randomUUID(),
  gateId: randomUUID(),
  requestId: randomUUID(),
});
describe('Admission command validation', () => {
  it('canonicalizes UUID case for durable replay fingerprints', () => {
    const value = valid();
    expect(
      scanCommand({
        ticketId: value.ticketId.toUpperCase(),
        gateId: value.gateId.toUpperCase(),
        requestId: value.requestId.toUpperCase(),
      }),
    ).toEqual(value);
  });
  it('rejects invalid QR/gate/request data', () => {
    for (const body of [
      null,
      [],
      { ...valid(), ticketId: 'bad' },
      { ...valid(), gateId: 'bad' },
      { ...valid(), requestId: 'bad' },
    ])
      expect(() => scanCommand(body)).toThrow();
  });
  it('rejects client identity/time fields', () => {
    for (const field of [
      'staffId',
      'staffName',
      'employeeId',
      'employeeName',
      'checkedInAt',
      'enteredAt',
    ])
      expect(() => scanCommand({ ...valid(), [field]: 'forged' })).toThrow();
  });
  it('requires an explicit attestation and nonblank bounded reason', () => {
    for (const details of [
      { reason: ' \t\n ', ownerConfirmed: true },
      { reason: 'x'.repeat(501), ownerConfirmed: true },
      { reason: 'reason', ownerConfirmed: false },
      { reason: 'reason', ownerConfirmed: 'true' },
    ])
      expect(() => scanCommand({ ...valid(), ...details }, true)).toThrow();
    expect(
      scanCommand(
        {
          ...valid(),
          reason: '  Chủ vé được xác nhận  ',
          ownerConfirmed: true,
        },
        true,
      ).reason,
    ).toBe('Chủ vé được xác nhận');
  });
});
