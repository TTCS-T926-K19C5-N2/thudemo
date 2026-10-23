import { describe, it, expect, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { resetPasswordInput } from './core.service.js';
import { CoreWorker } from './core.module.js';
import { CoreService } from './core.service.js';
import { TicketEmailService } from '../tickets/ticket-email.service.js';
import { isPeerProtectedProxyPath } from 'shared/login-peer';
describe('Core communications safety', () => {
  it.each([undefined, 'bad', 'a'.repeat(63), 'a'.repeat(65)])(
    'rejects malformed token %s',
    (token) => expect(() => resetPasswordInput(token, 'Password123')).toThrow(),
  );
  it.each(['', 'short', 'a'.repeat(1025)])(
    'rejects invalid password length',
    (password) =>
      expect(() => resetPasswordInput('a'.repeat(64), password)).toThrow(),
  );
  it('accepts the existing activation password boundary', () =>
    expect(() =>
      resetPasswordInput('a'.repeat(64), 'a'.repeat(8)),
    ).not.toThrow());
  it.each([
    '/api/auth/forgot-password',
    '/API/AUTH/FORGOT-PASSWORD/',
    '/api/auth/%66orgot-password/',
  ])('protects reset-request peer on %s', (path) =>
    expect(isPeerProtectedProxyPath(path)).toBe(true),
  );
  it('disabled workers do no work on startup', async () => {
    const core = {
      notificationEnabled: false,
      passwordWorkerEnabled: false,
      deliverReset: vi.fn(),
      deliverNotification: vi.fn(),
      enqueueReminders: vi.fn(),
    };
    const worker = new CoreWorker(core as unknown as CoreService);
    worker.onModuleInit();
    await worker.onModuleDestroy();
    expect(core.deliverReset).not.toHaveBeenCalled();
    expect(core.enqueueReminders).not.toHaveBeenCalled();
  });
  it('legacy reminder cannot claim success just because SMTP config exists', async () => {
    const service = new TicketEmailService(
      new ConfigService({
        SMTP_HOST: 'smtp.fixture.invalid',
        SMTP_USER: 'fixture',
      }),
    );
    await expect(
      service.sendReminder({
        toEmail: 'fixture@example.invalid',
        eventName: 'Demo',
        showtimeStart: new Date(),
        location: 'Demo',
        seatLabel: 'A1',
        ticketCode: 'fixture',
        qrPayload: null,
        type: 'REMINDER',
      }),
    ).rejects.toThrow();
  });
});
